/**
 * The worktree-scope guard (.claude/hooks/worktree-scope-guard.{sh,js}).
 *
 * WHY THIS FILE EXISTS. On 2026-08-26 a `/next-task` driver spawned its execution sub-agent
 * with a payload naming a file by a RELATIVE path. `Read`/`Edit` require an absolute one, so
 * the sub-agent built one itself — and rooted it at the repository path CLAUDE.md's own text
 * repeats (`repo at /home/<user>/SPO-WebClient`) instead of at its correct, inherited cwd. The
 * edit landed in the main checkout, byte-identical to the worktree's copy so nothing looked
 * wrong, and the branch the card was meant for stayed empty.
 * `.claude/hooks/main-commit-guard.sh` catches only the `git add`/`git commit` half of that
 * leak; `.claude/hooks/driver-scope-guard.sh` deliberately lets the sub-agent through
 * (`agent_id` — implementation is precisely its job) and so never saw this at all. This guard
 * is the backstop: it does not ask WHO is writing, only WHERE the write lands.
 *
 * `worktree-scope-guard.js` never calls into git — its whole decision is `path.resolve` plus
 * string containment against two env-supplied roots (`SPO_TOP`, `SPO_FAMILY`), so most of
 * this file drives it with plain temp directories. The `.sh` wrapper is the half that
 * discovers those two roots for real (`git rev-parse --show-toplevel` /
 * `--git-common-dir`), so its own tests use real `git worktree add` trees.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const GUARD = path.join(ROOT, '.claude', 'hooks', 'worktree-scope-guard.js');
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'worktree-scope-guard.sh');

const readScript = (p: string): string => fs.readFileSync(p, 'utf8');

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
  const family = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wsg-family-')));
  const top = path.join(family, '.claude', 'worktrees', 'this-session');
  const other = path.join(family, '.claude', 'worktrees', 'other-session');
  fs.mkdirSync(top, { recursive: true });
  fs.mkdirSync(other, { recursive: true });
  return { family, top, other };
}

/** Run the decision program over one payload and return the verdict line. */
function verdict(payload: Partial<Payload>, roots: Pick<Roots, 'top' | 'family'>): string {
  const body: Payload = { cwd: roots.top, tool_name: 'Bash', tool_input: {}, ...payload } as Payload;
  return execFileSync('node', [GUARD], {
    input: JSON.stringify(body),
    encoding: 'utf8',
    env: { ...process.env, SPO_TOP: roots.top, SPO_FAMILY: roots.family },
  }).trim();
}

const edit = (file_path: string, roots: Pick<Roots, 'top' | 'family'>, cwd?: string): string =>
  verdict({ tool_name: 'Edit', tool_input: { file_path }, cwd: cwd ?? roots.top }, roots);

const bash = (command: string, roots: Pick<Roots, 'top' | 'family'>, cwd?: string): string =>
  verdict({ tool_name: 'Bash', tool_input: { command }, cwd: cwd ?? roots.top }, roots);

describe('worktree-scope-guard — the six acceptance cases', () => {
  it('write inside top -> allow', () => {
    const roots = makeRoots();
    expect(edit(path.join(roots.top, 'note.txt'), roots)).toBe('ALLOW');
  });

  it('write under family outside top -> block', () => {
    const roots = makeRoots();
    // A file at the family root itself — the main checkout — not inside any worktree.
    const out = edit(path.join(roots.family, 'leaked.txt'), roots);
    expect(out).not.toBe('ALLOW');
    expect(out).toContain('leaked.txt');
  });

  it('write into another worktree -> block', () => {
    const roots = makeRoots();
    const out = edit(path.join(roots.other, 'leaked.txt'), roots);
    expect(out).not.toBe('ALLOW');
    expect(out).toContain('leaked.txt');
  });

  it('write outside family (scratchpad) -> allow', () => {
    const roots = makeRoots();
    const scratch = path.join(os.tmpdir(), 'wsg-scratch-note.txt');
    expect(edit(scratch, roots)).toBe('ALLOW');
  });

  it('Bash write verb on an outside path -> block', () => {
    const roots = makeRoots();
    const outside = path.join(roots.family, 'leaked.txt');
    expect(bash(`rm ${outside}`, roots)).toContain('leaked.txt');
    expect(bash(`sed -i s/a/b/ ${outside}`, roots)).toContain('leaked.txt');
    expect(bash(`echo x > ${outside}`, roots)).toContain('leaked.txt');
    expect(bash(`git rm ${outside}`, roots)).toContain('leaked.txt');
  });

  it('read-only Bash on an outside path -> allow', () => {
    const roots = makeRoots();
    const outside = path.join(roots.family, 'leaked.txt');
    expect(bash(`cat ${outside}`, roots)).toBe('ALLOW');
    expect(bash(`grep foo ${outside}`, roots)).toBe('ALLOW');
    expect(bash(`git -C ${roots.family} status --porcelain`, roots)).toBe('ALLOW');
  });
});

describe('worktree-scope-guard — it must not cry wolf', () => {
  it('leaves ordinary sanctioned commands alone', () => {
    const roots = makeRoots();
    expect(bash('npm test', roots)).toBe('ALLOW');
    expect(bash('git status', roots)).toBe('ALLOW');
    expect(bash(`git commit -F ${path.join(roots.top, 'msg.txt')}`, roots)).toBe('ALLOW');
  });

  it('a write verb fully inside top is untouched', () => {
    const roots = makeRoots();
    const inside = path.join(roots.top, 'scratch.txt');
    expect(bash(`rm ${inside}`, roots)).toBe('ALLOW');
    expect(bash(`sed -i s/a/b/ ${inside}`, roots)).toBe('ALLOW');
  });

  it('reads a heredoc body as text, not as commands', () => {
    const roots = makeRoots();
    const outside = path.join(roots.family, 'leaked.txt');
    const command = `cat > ${path.join(roots.top, 'pr.md')} <<EOF\nwe should rm ${outside} one day\nEOF`;
    expect(bash(command, roots)).toBe('ALLOW');
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
      input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: '/anything' } }),
      encoding: 'utf8',
      env: { ...process.env, SPO_TOP: '', SPO_FAMILY: '' },
    }).trim();
    expect(out).toBe('ALLOW');
  });

  it('does not exempt the execution sub-agent — that is the whole point of this guard', () => {
    const roots = makeRoots();
    const body = {
      agent_id: 'sub-1',
      cwd: roots.top,
      tool_name: 'Edit',
      tool_input: { file_path: path.join(roots.family, 'leaked.txt') },
    };
    const out = execFileSync('node', [GUARD], {
      input: JSON.stringify(body),
      encoding: 'utf8',
      env: { ...process.env, SPO_TOP: roots.top, SPO_FAMILY: roots.family },
    }).trim();
    expect(out).toContain('leaked.txt');
  });
});

describe('worktree-scope-guard — shares parsing with driver-scope-guard, not a copy', () => {
  it('both guards require the shared bash-command-parse module', () => {
    const guard = readScript(GUARD);
    const driver = readScript(path.join(ROOT, '.claude', 'hooks', 'driver-scope-guard.js'));
    expect(guard).toContain('require("./bash-command-parse")');
    expect(driver).toContain('require("./bash-command-parse")');
  });

  it('neither guard defines its own stripHeredocs/bashCandidates body', () => {
    const guard = readScript(GUARD);
    // A re-introduced local copy is the regression this test exists to catch: the function
    // NAME can appear (it is imported and called), but not a second `function bashCandidates(`
    // or `function stripHeredocs(` definition.
    expect(guard).not.toMatch(/function\s+stripHeredocs\s*\(/);
    expect(guard).not.toMatch(/function\s+bashCandidates\s*\(/);
  });
});

describe('worktree-scope-guard.sh — end to end with real git worktrees', () => {
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
    const main = fs.mkdtempSync(path.join(os.tmpdir(), 'wsg-repo-'));
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

  function run(cwd: string, toolName: string, toolInput: Record<string, unknown>): { code: number; err: string } {
    try {
      execFileSync('bash', [WRAPPER], {
        cwd,
        input: JSON.stringify({ cwd, tool_name: toolName, tool_input: toolInput }),
        encoding: 'utf8',
        env: gitEnv,
      });
      return { code: 0, err: '' };
    } catch (e) {
      const err = e as { status?: number; stderr?: string };
      return { code: err.status ?? -1, err: err.stderr ?? '' };
    }
  }

  it('allows an edit inside this worktree', () => {
    const roots = makeRepoWithWorktrees();
    try {
      const target = path.join(roots.wt, 'note.txt');
      expect(run(roots.wt, 'Edit', { file_path: target })).toEqual({ code: 0, err: '' });
    } finally {
      roots.cleanup();
    }
  });

  it('blocks an edit that resolves into the main checkout', () => {
    const roots = makeRepoWithWorktrees();
    try {
      const target = path.join(roots.main, 'leaked.txt');
      const { code, err } = run(roots.wt, 'Edit', { file_path: target });
      expect(code).toBe(2);
      expect(err).toContain('leaked.txt');
    } finally {
      roots.cleanup();
    }
  });

  it('blocks an edit that resolves into a sibling worktree', () => {
    const roots = makeRepoWithWorktrees();
    try {
      const target = path.join(roots.other, 'leaked.txt');
      const { code, err } = run(roots.wt, 'Edit', { file_path: target });
      expect(code).toBe(2);
      expect(err).toContain('leaked.txt');
    } finally {
      roots.cleanup();
    }
  });

  it('allows a write verb targeting a file inside this worktree', () => {
    const roots = makeRepoWithWorktrees();
    try {
      const target = path.join(roots.wt, 'scratch.txt');
      const result = run(roots.wt, 'Bash', { command: `rm -f ${target}` });
      expect(result).toEqual({ code: 0, err: '' });
    } finally {
      roots.cleanup();
    }
  });

  it('blocks a Bash write verb that targets the main checkout', () => {
    const roots = makeRepoWithWorktrees();
    try {
      const target = path.join(roots.main, 'leaked.txt');
      const { code, err } = run(roots.wt, 'Bash', { command: `rm ${target}` });
      expect(code).toBe(2);
      expect(err).toContain('leaked.txt');
    } finally {
      roots.cleanup();
    }
  });
});
