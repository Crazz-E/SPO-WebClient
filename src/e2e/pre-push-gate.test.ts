/**
 * The pre-push hook decides whether a Bash command actually invokes a push.
 *
 * It is shell, not TypeScript, but it is the piece that enforces the whole policy — and
 * its first version blocked a command that merely *mentioned* `git push` inside a document
 * being written. That class of false positive is what this suite pins down.
 *
 * Since 2026-08-22 the artifact it verifies is the bench worker's per-HEAD attestation
 * (~/.spo-bench/verdicts/<sha>.json), not a session-written gate file: only the worker
 * attests, so a session cannot unblock its own push.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const HOOK = path.join('.claude', 'hooks', 'pre-push-gate.sh');
const REPO_ROOT = process.cwd();

interface HookRun {
  code: number;
  stderr: string;
}

/** 0 = allowed through, 2 = blocked. */
function invoke(command: string, env: NodeJS.ProcessEnv = {}): HookRun {
  try {
    execFileSync('bash', [path.join(REPO_ROOT, HOOK)], {
      input: JSON.stringify({ tool_input: { command } }),
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
    });
    return { code: 0, stderr: '' };
  } catch (err: unknown) {
    const failure = err as { status?: number; stderr?: Buffer };
    return { code: failure.status ?? -1, stderr: failure.stderr?.toString() ?? '' };
  }
}

/**
 * Matcher cases run against a scratch repo and a scratch bench, never the real ones.
 *
 * They assert *whether the hook engages*, and the answer for an engaged push has to be a
 * refusal — so they need a repo with no attestation. Pointing them at the working repo
 * made them depend on its branch and on whether a gate had been run, which flipped the
 * expected result the moment either changed.
 */
function runHook(command: string, dir: string = scratchRepo()): number {
  return invoke(command, { GATE_REPO_DIR: dir, SPO_BENCH_DIR: scratchBench() }).code;
}

function scratchBench(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-gate-bench-'));
  fs.mkdirSync(path.join(dir, 'verdicts'), { recursive: true });
  return dir;
}

/**
 * A throwaway repo on a feature branch. On `main` the branch guard fires first and hides
 * every attestation branch, so those can only be reached from somewhere else.
 */
function scratchRepo(): string {
  return scratchRepoOn('fix/scratch');
}

/** The same throwaway repo, on `main`, to reach the branch guard itself. */
function scratchRepoOnMain(): string {
  return scratchRepoOn('main');
}

function scratchRepoOn(branch: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-gate-repo-'));
  const run = (...args: string[]) =>
    execFileSync('git', ['-C', dir, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  run('init', '-q', '-b', branch);
  run('config', 'user.email', 'test@example.com');
  run('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'file.txt'), 'x', 'utf8');
  run('add', '.');
  run('commit', '-q', '-m', 'init');
  return dir;
}

function headOf(dir: string): string {
  return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function toplevelOf(dir: string): string {
  return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
}

/** A bench holding one attestation for the repo's HEAD; defaults describe a fresh PASS. */
function benchWith(dir: string, attestation: Record<string, unknown>): string {
  const bench = scratchBench();
  const body = {
    head: headOf(dir),
    branch: 'fix/scratch',
    worktree: toplevelOf(dir),
    verdict: 'PASS',
    fingerprintStable: true,
    jobId: 'job-test',
    createdAt: new Date().toISOString(),
    ...attestation,
  };
  fs.writeFileSync(path.join(bench, 'verdicts', `${body.head}.json`), JSON.stringify(body), 'utf8');
  return bench;
}

describe('commands the hook must ignore', () => {
  it.each([
    ['an unrelated command', 'echo hello'],
    ['a read-only git command', 'git status'],
    ['a search for the phrase', 'grep -rn "git push" doc/'],
    ['a dry run, which changes nothing on the remote', 'git push --dry-run'],
    ['a heredoc that documents the command', 'cat > doc/x.md <<EOF\ngit push -u origin HEAD\nEOF'],
    ['a quoted heredoc delimiter', "cat > x.md <<'EOF'\ngit push\nEOF"],
    ['an echo of the command', 'echo "run git push when ready"'],
    ['a remote-branch deletion with --delete, which pushes no code', 'git push origin --delete fix/old'],
    ['a remote-branch deletion with -d', 'git push -d origin fix/old'],
    ['a remote-branch deletion by empty-source refspec', 'git push origin :fix/old'],
  ])('allows %s', (_label, command) => {
    expect(runHook(command)).toBe(0);
  });

  it('allows them even from a repo that would refuse a real push', () => {
    // The point is that the hook never engages, not that the attestation check passed.
    const dir = scratchRepo();
    expect(runHook('grep -rn "git push" doc/', dir)).toBe(0);
    expect(runHook('git push', dir)).toBe(2);
  });
});

describe('commands the hook must catch', () => {
  it.each([
    ['a bare push', 'git push'],
    ['a push with flags', 'git push -u origin HEAD'],
    ['a push at the end of a chain', 'git add . && git push -u origin HEAD'],
    ['a push on a later line', 'git add .\ngit push'],
    ['a push after a semicolon', 'git commit -m x; git push'],
    ['a push with a global git flag', 'git -C . push origin main'],
    ['a refspec that has a source — code moves', 'git push origin fix/x:fix/x'],
    ['a deletion chained with a real push', 'git push origin --delete fix/old && git push -u origin HEAD'],
  ])('blocks %s', (_label, command) => {
    // The scratch repo is on a feature branch with no attestation, so an engaged push is
    // refused for that reason alone — independent of the real repo's state.
    expect(runHook(command)).toBe(2);
  });
});

describe('the attestation gate, on a feature branch', () => {
  const push = 'git push -u origin HEAD';

  function invokeWith(dir: string, bench: string, env: NodeJS.ProcessEnv = {}): HookRun {
    return invoke(push, { GATE_REPO_DIR: dir, SPO_BENCH_DIR: bench, ...env });
  }

  it('blocks when the bench has no attestation for HEAD', () => {
    const dir = scratchRepo();
    const result = invokeWith(dir, scratchBench());
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/no bench attestation for HEAD/);
    expect(result.stderr).toMatch(/npm run gate/);
    expect(result.stderr).toMatch(/Only the worker attests/);
  });

  it('allows a fresh, stable PASS attested for this worktree', () => {
    const dir = scratchRepo();
    expect(invokeWith(dir, benchWith(dir, {})).code).toBe(0);
  });

  it('blocks a FAIL verdict and points at the three-attempt rule', () => {
    const dir = scratchRepo();
    const result = invokeWith(dir, benchWith(dir, { verdict: 'FAIL' }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/Three attempts maximum/);
  });

  it('blocks a BLOCKED verdict with the manual-verification instruction', () => {
    const dir = scratchRepo();
    const result = invokeWith(dir, benchWith(dir, { verdict: 'BLOCKED' }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/President-only members/);
    expect(result.stderr).toMatch(/never mark it verified|Do not mark it verified/i);
  });

  it('blocks a STALE verdict — the tree moved, the result attests nothing current', () => {
    const dir = scratchRepo();
    const result = invokeWith(dir, benchWith(dir, { verdict: 'STALE' }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/tree changed while the job was queued or running/);
  });

  it('blocks a PASS whose fingerprint is not stable', () => {
    const dir = scratchRepo();
    const result = invokeWith(dir, benchWith(dir, { fingerprintStable: false }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/not fingerprint-stable/);
  });

  it('blocks a PASS attested for a different worktree', () => {
    const dir = scratchRepo();
    const result = invokeWith(dir, benchWith(dir, { worktree: '/somewhere/else' }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/attested for another worktree/);
  });

  it('blocks a stale PASS — the live world moves, so old evidence is not evidence', () => {
    const dir = scratchRepo();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const result = invokeWith(dir, benchWith(dir, { createdAt: twoHoursAgo }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/min old \(limit 60\)/);
  });

  it('honours a wider freshness window when one is configured', () => {
    const dir = scratchRepo();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const bench = benchWith(dir, { createdAt: twoHoursAgo });
    expect(invokeWith(dir, bench, { GATE_MAX_AGE_MINUTES: '240' }).code).toBe(0);
  });

  it('blocks an attestation belonging to a different commit', () => {
    const dir = scratchRepo();
    const bench = scratchBench();
    fs.writeFileSync(
      path.join(bench, 'verdicts', '0000000000000000000000000000000000000000.json'),
      JSON.stringify({ verdict: 'PASS', fingerprintStable: true, createdAt: new Date().toISOString() }),
      'utf8',
    );
    expect(invokeWith(dir, bench).code).toBe(2);
  });

  it('blocks an unreadable attestation instead of trusting it', () => {
    const dir = scratchRepo();
    const bench = scratchBench();
    fs.writeFileSync(path.join(bench, 'verdicts', `${headOf(dir)}.json`), '{corrupt', 'utf8');
    const result = invokeWith(dir, bench);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/UNKNOWN, not PASS/);
  });
});

describe('the main-branch guard', () => {
  // A throwaway repo on `main` reaches the guard from anywhere, like every other case
  // in this file — the real repository's branch must never decide a test's outcome.
  it('refuses a direct push to main outright', () => {
    const result = invoke('git push -u origin HEAD', {
      GATE_REPO_DIR: scratchRepoOnMain(),
      SPO_BENCH_DIR: scratchBench(),
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/direct push to main/);
  });

  it('lets the same push through from a feature branch, attestation permitting', () => {
    const dir = scratchRepo();
    expect(
      invoke('git push -u origin HEAD', { GATE_REPO_DIR: dir, SPO_BENCH_DIR: benchWith(dir, {}) }).code,
    ).toBe(0);
  });
});
