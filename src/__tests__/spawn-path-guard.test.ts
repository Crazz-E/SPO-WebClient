/**
 * The spawn-path guard (.claude/hooks/spawn-path-guard.{sh,js}).
 *
 * WHY THIS FILE EXISTS. `worktree-scope-guard.js` already catches a wrong-tree WRITE — but by
 * the time a sub-agent attempts that write, it has already spent a turn resolving a path
 * against the wrong repository root and telling the user it changed something it did not
 * (card #370: 15 of 24 daily refusals were exactly this pattern). This guard moves the same
 * THREE-REGION check (outside FAMILY is free, inside TOP is ordinary, under FAMILY but outside
 * TOP is the leak) one spawn earlier: it scans the `Agent` tool's `prompt` field for absolute
 * paths at the moment the payload is BUILT, before any sub-agent ever resolves anything.
 *
 * `spawn-path-guard.js` deliberately duplicates `classify()`/`correctPath()` from
 * `worktree-scope-guard.js` rather than requiring it (that file has no `require.main` guard and
 * would hang this process on its own stdin listener) — see that file's header. These tests
 * mirror `worktree-scope-guard.test.ts`'s fixtures so a drift between the two classifiers shows
 * up as a failing assertion, not silently.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const GUARD = path.join(ROOT, '.claude', 'hooks', 'spawn-path-guard.js');
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'spawn-path-guard.sh');

// Use scratchpad to avoid /tmp disk space issues
const getTempDir = (): string => {
  const scratchpad = process.env.SCRATCHPAD_DIR || path.join(os.tmpdir(), '.spg-test');
  fs.mkdirSync(scratchpad, { recursive: true });
  return scratchpad;
};

interface Payload {
  cwd?: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

interface Roots {
  family: string;
  top: string;
  other: string;
}

/** A throwaway `family` tree holding `top` and a sibling `other` worktree, both real dirs. */
function makeRoots(): Roots {
  const tempDir = getTempDir();
  const family = fs.realpathSync(fs.mkdtempSync(path.join(tempDir, 'spg-family-')));
  const top = path.join(family, '.claude', 'worktrees', 'this-session');
  const other = path.join(family, '.claude', 'worktrees', 'other-session');
  fs.mkdirSync(top, { recursive: true });
  fs.mkdirSync(other, { recursive: true });
  return { family, top, other };
}

/** Run the decision program over one payload and return the verdict text. */
function verdict(payload: Partial<Payload>, roots: Pick<Roots, 'top' | 'family'>): string {
  const body: Payload = { cwd: roots.top, tool_name: 'Agent', tool_input: {}, ...payload } as Payload;
  return execFileSync('node', [GUARD], {
    input: JSON.stringify(body),
    encoding: 'utf8',
    env: { ...process.env, SPO_TOP: roots.top, SPO_FAMILY: roots.family },
  }).trim();
}

const spawn = (prompt: string, roots: Pick<Roots, 'top' | 'family'>, cwd?: string): string =>
  verdict({ tool_name: 'Agent', tool_input: { prompt }, cwd: cwd ?? roots.top }, roots);

describe('spawn-path-guard — the acceptance cases', () => {
  it('a family-rooted path in the prompt -> block, with the corrected path', () => {
    const roots = makeRoots();
    const offending = path.join(roots.family, 'src', 'foo.ts');
    const out = spawn(`Edit the file at ${offending} please`, roots);
    expect(out).toMatch(/^BLOCKED/);
    expect(out).toContain(offending);
    expect(out).toContain(path.join(roots.top, 'src', 'foo.ts'));
  });

  it('a path inside another worktree -> block, corrected to THIS worktree', () => {
    const roots = makeRoots();
    const offending = path.join(roots.other, 'leaked.txt');
    const out = spawn(`Read ${offending}`, roots);
    expect(out).toMatch(/^BLOCKED/);
    expect(out).toContain(offending);
    expect(out).toContain(path.join(roots.top, 'leaked.txt'));
  });

  it('a worktree-rooted path -> allow', () => {
    const roots = makeRoots();
    const inside = path.join(roots.top, 'src', 'foo.ts');
    expect(spawn(`Edit ${inside}`, roots)).toBe('ALLOW');
  });

  it('a path outside the family (scratchpad) -> allow', () => {
    const roots = makeRoots();
    const scratch = path.join(os.tmpdir(), 'spg-scratch-note.txt');
    expect(spawn(`Read ${scratch}`, roots)).toBe('ALLOW');
  });

  it('a path under a sibling SPO-Original tree -> allow', () => {
    const roots = makeRoots();
    // SPO-Original is a sibling of the FAMILY root's parent, not under FAMILY at all.
    const original = path.join(path.dirname(roots.family), 'SPO-Original', 'Kernel', 'x.pas');
    expect(spawn(`Read ${original}`, roots)).toBe('ALLOW');
  });

  it('a path under a sibling SPO-ASP tree -> allow', () => {
    const roots = makeRoots();
    const asp = path.join(path.dirname(roots.family), 'SPO-ASP', 'Five', '0', 'page.asp');
    expect(spawn(`Read ${asp}`, roots)).toBe('ALLOW');
  });

  it('a relative path -> allow (fails open — nothing here knows the sub-agent cwd)', () => {
    const roots = makeRoots();
    expect(spawn('Edit src/foo.ts and report back', roots)).toBe('ALLOW');
  });

  it('a prompt with no paths at all -> allow', () => {
    const roots = makeRoots();
    expect(spawn('Investigate the auth module and report findings', roots)).toBe('ALLOW');
  });

  it('fails open on an unparseable payload', () => {
    const roots = makeRoots();
    const out = execFileSync('node', [GUARD], {
      input: 'not json',
      encoding: 'utf8',
      env: { ...process.env, SPO_TOP: roots.top, SPO_FAMILY: roots.family },
    }).trim();
    expect(out).toBe('ALLOW');
  });

  it('fails open when the env roots are missing', () => {
    const out = execFileSync('node', [GUARD], {
      input: JSON.stringify({ tool_name: 'Agent', tool_input: { prompt: '/anything/at/all' } }),
      encoding: 'utf8',
      env: { ...process.env, SPO_TOP: '', SPO_FAMILY: '' },
    }).trim();
    expect(out).toBe('ALLOW');
  });

  it('ignores every tool other than Agent, even one carrying a family-rooted path', () => {
    const roots = makeRoots();
    const offending = path.join(roots.family, 'leaked.txt');
    const out = verdict(
      { tool_name: 'Bash', tool_input: { command: `cat ${offending}` } },
      roots,
    );
    expect(out).toBe('ALLOW');
  });

  it('does not double-report the same offending path twice', () => {
    const roots = makeRoots();
    const offending = path.join(roots.family, 'src', 'foo.ts');
    const out = spawn(`Edit ${offending}, then re-read ${offending} to confirm`, roots);
    const occurrences = out.split(offending).length - 1;
    // Once in the "offending" column of the single reported line — not once per mention.
    expect(occurrences).toBe(1);
  });
});

describe('spawn-path-guard — it must not cry wolf on a URL', () => {
  it('does not treat the second slash of a URL as a path start', () => {
    const roots = makeRoots();
    // The family root's basename appearing inside a URL host/path must not trip the guard —
    // there is no leading whitespace/quote/paren before the "//" in "https://...".
    const host = path.basename(roots.family);
    const out = spawn(`See https://github.com/example/${host}/issues/1 for context`, roots);
    expect(out).toBe('ALLOW');
  });
});

describe('spawn-path-guard.sh — end to end with real git worktrees', () => {
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@x',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@x',
  };

  interface RealRoots {
    main: string;
    wt: string;
    other: string;
    cleanup: () => void;
  }

  function makeRepoWithWorktrees(): RealRoots {
    const tempDir = getTempDir();
    const main = fs.mkdtempSync(path.join(tempDir, 'spg-repo-'));
    execFileSync('git', ['init', '-q', main], { env: gitEnv });
    execFileSync('git', ['-C', main, 'commit', '-q', '--allow-empty', '-m', 'x'], { env: gitEnv });
    const wt = path.join(main, '.claude', 'worktrees', 'session-a');
    const other = path.join(main, '.claude', 'worktrees', 'session-b');
    execFileSync('git', ['-C', main, 'worktree', 'add', '-q', '-b', 'branch-a', wt], { env: gitEnv });
    execFileSync('git', ['-C', main, 'worktree', 'add', '-q', '-b', 'branch-b', other], { env: gitEnv });
    return {
      main: fs.realpathSync(main),
      wt: fs.realpathSync(wt),
      other: fs.realpathSync(other),
      cleanup: () => fs.rmSync(main, { recursive: true, force: true }),
    };
  }

  function runSpawn(cwd: string, prompt: string): { code: number; err: string } {
    try {
      execFileSync('bash', [WRAPPER], {
        cwd,
        input: JSON.stringify({ cwd, tool_name: 'Agent', tool_input: { prompt } }),
        encoding: 'utf8',
        env: gitEnv,
      });
      return { code: 0, err: '' };
    } catch (e) {
      const err = e as { status?: number; stderr?: string };
      return { code: err.status ?? -1, err: err.stderr ?? '' };
    }
  }

  it('allows a spawn whose prompt only names paths inside this worktree', () => {
    const roots = makeRepoWithWorktrees();
    try {
      const target = path.join(roots.wt, 'note.txt');
      expect(runSpawn(roots.wt, `Edit ${target}`)).toEqual({ code: 0, err: '' });
    } finally {
      roots.cleanup();
    }
  });

  it('blocks a spawn whose prompt names a path in the main checkout', () => {
    const roots = makeRepoWithWorktrees();
    try {
      const target = path.join(roots.main, 'leaked.txt');
      const { code, err } = runSpawn(roots.wt, `Edit the file at ${target}`);
      expect(code).toBe(2);
      expect(err).toContain('leaked.txt');
      expect(err).toContain('Offending path -> corrected path');
    } finally {
      roots.cleanup();
    }
  });

  it('blocks a spawn whose prompt names a path in a sibling worktree', () => {
    const roots = makeRepoWithWorktrees();
    try {
      const target = path.join(roots.other, 'leaked.txt');
      const { code, err } = runSpawn(roots.wt, `Read ${target}`);
      expect(code).toBe(2);
      expect(err).toContain('leaked.txt');
    } finally {
      roots.cleanup();
    }
  });

  it('stderr contains the corrected path when blocking', () => {
    const roots = makeRepoWithWorktrees();
    try {
      const target = path.join(roots.main, 'foo.ts');
      const { code, err } = runSpawn(roots.wt, `Edit ${target}`);
      expect(code).toBe(2);
      expect(err).toContain(path.join(roots.wt, 'foo.ts'));
    } finally {
      roots.cleanup();
    }
  });

  it('allows a spawn run from the main checkout itself (no worktree active)', () => {
    const roots = makeRepoWithWorktrees();
    try {
      const target = path.join(roots.main, 'foo.ts');
      expect(runSpawn(roots.main, `Edit ${target}`)).toEqual({ code: 0, err: '' });
    } finally {
      roots.cleanup();
    }
  });

  it('fails open on a malformed JSON payload', () => {
    const roots = makeRepoWithWorktrees();
    try {
      const result = (() => {
        try {
          execFileSync('bash', [WRAPPER], { cwd: roots.wt, input: 'not json', encoding: 'utf8', env: gitEnv });
          return { code: 0, err: '' };
        } catch (e) {
          const err = e as { status?: number; stderr?: string };
          return { code: err.status ?? -1, err: err.stderr ?? '' };
        }
      })();
      expect(result).toEqual({ code: 0, err: '' });
    } finally {
      roots.cleanup();
    }
  });
});

describe('spawn-path-guard — it duplicates the classifier deliberately, not by accident', () => {
  it("does not require() worktree-scope-guard.js (that file has no require.main guard)", () => {
    const guard = fs.readFileSync(GUARD, 'utf8');
    expect(guard).not.toMatch(/require\(["'`][^"'`]*worktree-scope-guard/);
  });

  it('registers on the Agent tool_name, matching the settings.json matcher', () => {
    const guard = fs.readFileSync(GUARD, 'utf8');
    expect(guard).toContain('"Agent"');
  });
});
