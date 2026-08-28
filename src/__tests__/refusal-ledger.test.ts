/**
 * The refusal ledger (.claude/hooks/refusal-ledger.js).
 *
 * Card #369: a blocking guard's refusal has no memory of its own — a driver that reads a
 * refusal, composes a slightly different command, and gets refused again is workaround-hunting,
 * which is the one continuation this project forbids. This module gives each of the six
 * blocking guards a per-session, per-guard refusal count, so their message can tell a first
 * refusal from the fourth attempt at the same blocked shape and, from the third refusal
 * onward, tell the driver to comply or release rather than keep composing variants.
 *
 * `refusal-ledger.js` never calls into git for real beyond `rev-parse --show-toplevel` and
 * never blocks anything itself — it is a pure counter, invoked as `node refusal-ledger.js
 * <guard-name>`, printing the new count to stdout and always exiting 0. These tests drive real
 * throwaway git repos (same shape as worktree-scope-guard.test.ts's `makeRepoWithWorktrees`)
 * so the session-key derivation is exercised for real, not stubbed.
 */

import { execFileSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const LEDGER = path.join(ROOT, '.claude', 'hooks', 'refusal-ledger.js');

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@x',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@x',
};

// Use scratchpad to avoid /tmp disk space issues — same convention as worktree-scope-guard.test.ts.
const getTempDir = (): string => {
  const scratchpad = process.env.SCRATCHPAD_DIR || path.join(os.tmpdir(), '.rl-test');
  fs.mkdirSync(scratchpad, { recursive: true });
  return scratchpad;
};

/** A throwaway git repo, real `.git` and all, standing in for a session's worktree. */
function makeRepo(): { dir: string; store: string } {
  const tempDir = getTempDir();
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(tempDir, 'rl-repo-')));
  execFileSync('git', ['init', '-q', dir], { env: gitEnv });
  execFileSync('git', ['-C', dir, 'commit', '-q', '--allow-empty', '-m', 'x'], { env: gitEnv });
  const store = fs.mkdtempSync(path.join(tempDir, 'rl-store-'));
  return { dir, store };
}

/** The session key the way session-heartbeat.sh / driver-scope-guard.sh derive it. */
function sessionKey(dir: string): string {
  return crypto.createHash('sha1').update(dir).digest('hex').slice(0, 16);
}

/** Run the ledger for one guard name, in one repo/store pair, and return the printed count. */
function bump(guard: string, repo: { dir: string; store: string }): number {
  const out = execFileSync('node', [LEDGER, guard], {
    cwd: repo.dir,
    encoding: 'utf8',
    env: { ...process.env, SPO_SESSION_DIR: repo.store },
  }).trim();
  return Number(out);
}

function ledgerPath(repo: { dir: string; store: string }): string {
  return path.join(repo.store, `${sessionKey(repo.dir)}.refusals`);
}

describe('refusal-ledger — basic counting', () => {
  it('starts at 1 on the first refusal', () => {
    const repo = makeRepo();
    expect(bump('verdict-pipe', repo)).toBe(1);
  });

  it('counts 1 -> 2 -> 3 on successive refusals of the same guard', () => {
    const repo = makeRepo();
    expect(bump('poll-loop', repo)).toBe(1);
    expect(bump('poll-loop', repo)).toBe(2);
    expect(bump('poll-loop', repo)).toBe(3);
  });

  it('keeps counting past 3', () => {
    const repo = makeRepo();
    for (let i = 1; i <= 5; i++) {
      expect(bump('bench-port', repo)).toBe(i);
    }
  });
});

describe('refusal-ledger — isolation', () => {
  it('tracks each guard name independently within one session', () => {
    const repo = makeRepo();
    expect(bump('verdict-pipe', repo)).toBe(1);
    expect(bump('verdict-pipe', repo)).toBe(2);
    // A different guard in the SAME session starts fresh — its count is not shared.
    expect(bump('item-list', repo)).toBe(1);
    // The first guard's count is unaffected by the second guard's entries.
    expect(bump('verdict-pipe', repo)).toBe(3);
  });

  it('tracks each session independently for the same guard name', () => {
    const repoA = makeRepo();
    const repoB = makeRepo();
    expect(bump('worktree-scope', repoA)).toBe(1);
    expect(bump('worktree-scope', repoA)).toBe(2);
    // A different worktree (different sha1 key) starts its own count at 1, even sharing SPO_SESSION_DIR.
    const out = execFileSync('node', [LEDGER, 'worktree-scope'], {
      cwd: repoB.dir,
      encoding: 'utf8',
      env: { ...process.env, SPO_SESSION_DIR: repoA.store },
    }).trim();
    expect(Number(out)).toBe(1);
  });
});

describe('refusal-ledger — missing and corrupt state', () => {
  it('treats a missing ledger file as count 0, so the first bump is 1', () => {
    const repo = makeRepo();
    expect(fs.existsSync(ledgerPath(repo))).toBe(false);
    expect(bump('driver-scope', repo)).toBe(1);
  });

  it('treats a missing SPO_SESSION_DIR as count 0 as well', () => {
    const repo = makeRepo();
    fs.rmSync(repo.store, { recursive: true, force: true });
    expect(bump('driver-scope', repo)).toBe(1);
  });

  it('skips a corrupt line and keeps reading the rest of the file', () => {
    const repo = makeRepo();
    fs.mkdirSync(repo.store, { recursive: true });
    const p = ledgerPath(repo);
    fs.writeFileSync(
      p,
      [
        JSON.stringify({ guard: 'item-list', count: 1, timestamp: 1 }),
        'not json at all {{{',
        JSON.stringify({ guard: 'item-list', count: 2, timestamp: 2 }),
        '',
      ].join('\n'),
    );
    // Last GOOD line for item-list said count 2 -> next bump is 3, the corrupt line skipped.
    expect(bump('item-list', repo)).toBe(3);
  });

  it('an entirely corrupt file (no valid JSON at all) reads as count 0', () => {
    const repo = makeRepo();
    fs.mkdirSync(repo.store, { recursive: true });
    fs.writeFileSync(ledgerPath(repo), 'complete garbage\nmore garbage\n');
    expect(bump('bench-port', repo)).toBe(1);
  });

  it('a line for a different guard does not corrupt this guard\'s count', () => {
    const repo = makeRepo();
    fs.mkdirSync(repo.store, { recursive: true });
    fs.writeFileSync(
      ledgerPath(repo),
      JSON.stringify({ guard: 'poll-loop', count: 9, timestamp: 1 }) + '\n',
    );
    expect(bump('driver-scope', repo)).toBe(1);
  });
});

describe('refusal-ledger — directory creation', () => {
  it('creates the session directory when it does not exist yet', () => {
    const tempDir = getTempDir();
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(tempDir, 'rl-repo-')));
    execFileSync('git', ['init', '-q', dir], { env: gitEnv });
    execFileSync('git', ['-C', dir, 'commit', '-q', '--allow-empty', '-m', 'x'], { env: gitEnv });
    const store = path.join(tempDir, `rl-nonexistent-${Date.now()}`);
    expect(fs.existsSync(store)).toBe(false);
    const out = execFileSync('node', [LEDGER, 'verdict-pipe'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, SPO_SESSION_DIR: store },
    }).trim();
    expect(Number(out)).toBe(1);
    expect(fs.existsSync(store)).toBe(true);
  });

  it('creates nested missing directories too', () => {
    const tempDir = getTempDir();
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(tempDir, 'rl-repo-')));
    execFileSync('git', ['init', '-q', dir], { env: gitEnv });
    execFileSync('git', ['-C', dir, 'commit', '-q', '--allow-empty', '-m', 'x'], { env: gitEnv });
    const store = path.join(tempDir, `rl-nested-${Date.now()}`, 'a', 'b', 'c');
    const out = execFileSync('node', [LEDGER, 'item-list'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, SPO_SESSION_DIR: store },
    }).trim();
    expect(Number(out)).toBe(1);
  });
});

describe('refusal-ledger — the file format', () => {
  it('appends one JSON line per bump, guard/count/timestamp', () => {
    const repo = makeRepo();
    bump('worktree-scope', repo);
    bump('worktree-scope', repo);
    const raw = fs.readFileSync(ledgerPath(repo), 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines.length).toBe(2);
    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    expect(first).toMatchObject({ guard: 'worktree-scope', count: 1 });
    expect(second).toMatchObject({ guard: 'worktree-scope', count: 2 });
    expect(typeof first.timestamp).toBe('number');
    expect(typeof second.timestamp).toBe('number');
  });
});

describe('refusal-ledger — threshold crossing', () => {
  it.each([1, 2, 3])('reports count %i exactly on the %ith call', (n) => {
    const repo = makeRepo();
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = bump('driver-scope', repo);
    }
    expect(last).toBe(n);
  });
});

describe('refusal-ledger — exit code and failure tolerance', () => {
  it('always exits 0, even with no guard name argument', () => {
    const repo = makeRepo();
    const result = execFileSync('node', [LEDGER], {
      cwd: repo.dir,
      encoding: 'utf8',
      env: { ...process.env, SPO_SESSION_DIR: repo.store },
    }).trim();
    // No crash, and a legible (0) count.
    expect(result).toBe('0');
  });

  it('exits 0 with a legible count even outside a git repo (git rev-parse fails)', () => {
    const tempDir = getTempDir();
    const notARepo = fs.mkdtempSync(path.join(tempDir, 'rl-notrepo-'));
    const result = execFileSync('node', [LEDGER, 'verdict-pipe'], {
      cwd: notARepo,
      encoding: 'utf8',
      env: { ...process.env, SPO_SESSION_DIR: path.join(tempDir, 'rl-store-notrepo') },
    }).trim();
    expect(result).toBe('0');
  });
});

describe('refusal-ledger — all six guard names, escalation-relevant counts', () => {
  const GUARDS = ['verdict-pipe', 'poll-loop', 'worktree-scope', 'driver-scope', 'bench-port', 'item-list'];

  it.each(GUARDS)('%s reaches count 3 on its third refusal, independent of the others', (guard) => {
    const repo = makeRepo();
    // Noise from every OTHER guard name must not affect this one's count.
    for (const other of GUARDS) {
      if (other !== guard) bump(other, repo);
    }
    expect(bump(guard, repo)).toBe(1);
    expect(bump(guard, repo)).toBe(2);
    expect(bump(guard, repo)).toBe(3);
  });
});
