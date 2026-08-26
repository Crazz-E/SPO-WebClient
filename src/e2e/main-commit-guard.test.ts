/**
 * The main-commit guard refuses `git add` / `git commit` when the repository the command
 * acts on is standing on `main`.
 *
 * It exists because path cannot separate the main checkout from a session worktree — the
 * worktrees live INSIDE it, under `.claude/worktrees/` — while the branch always can: git
 * refuses the same branch in two worktrees, so only the main checkout is ever on `main`.
 *
 * Recognition is asserted here as a PAIR: the same command against a repo on `main` and
 * against a repo on a feature branch. The neighbouring pre-push-gate suite reads engagement
 * off a line the hook prints only when it ALLOWS, which cannot tell "ignored" from "engaged
 * and refused" — a guard whose whole job is refusing must not borrow that signal.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const HOOK = path.join('.claude', 'hooks', 'main-commit-guard.sh');
const REPO_ROOT = process.cwd();

interface HookRun {
  code: number;
  stderr: string;
}

/** 0 = allowed through, 2 = refused. */
function invoke(command: string, payload: { cwd?: string } = {}, env: NodeJS.ProcessEnv = {}): HookRun {
  try {
    execFileSync('bash', [path.join(REPO_ROOT, HOOK)], {
      input: JSON.stringify({ tool_input: { command }, ...payload }),
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

/** Run against a repo named by GATE_REPO_DIR, the same test escape pre-push-gate.sh uses. */
function inRepo(dir: string, command: string): number {
  return invoke(command, {}, { GATE_REPO_DIR: dir }).code;
}

function scratchRepoOn(branch: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-commit-guard-'));
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

const onMain = (): string => scratchRepoOn('main');
const onFeature = (): string => scratchRepoOn('fix/scratch');

describe('what the guard refuses on main', () => {
  it.each([
    ['a commit', 'git commit -m x'],
    ['a stage-everything', 'git add -A'],
    ['a stage of one path', 'git add src/server/rdo.ts'],
    ['a commit from a message file', 'git commit -F /tmp/msg.txt'],
    ['a commit at the end of a chain', 'npm test && git add . && git commit -m x'],
    ['a commit on a later line', 'git add .\ngit commit -m x'],
    ['a commit after a semicolon', 'echo hi; git commit -m x'],
    ['a commit with a global git flag', 'git --no-pager commit -m x'],
  ])('refuses %s', (_label, command) => {
    const result = invoke(command, {}, { GATE_REPO_DIR: onMain() });
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/standing on `main`/);
  });

  it('names the repository it refused, so the session can see which tree it was in', () => {
    const dir = onMain();
    const real = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim();
    expect(invoke('git commit -m x', {}, { GATE_REPO_DIR: dir }).stderr).toContain(real);
  });
});

describe('the same commands off main — recognition without a refusal', () => {
  // The pair is the point: identical input, and only the branch differs. A guard that
  // ignored these commands outright would pass the block above only by accident.
  it.each([
    ['a commit', 'git commit -m x'],
    ['a stage-everything', 'git add -A'],
    ['a commit at the end of a chain', 'npm test && git add . && git commit -m x'],
  ])('allows %s on a feature branch', (_label, command) => {
    expect(inRepo(onFeature(), command)).toBe(0);
  });
});

describe('commands the guard must never engage on', () => {
  it.each([
    ['an unrelated command', 'echo hello'],
    ['a read-only git command', 'git status'],
    ['another read-only git command', 'git log --oneline -5'],
    ['a search for the phrase', 'grep -rn "git commit" doc/'],
    ['an echo of the command', 'echo "run git add then git commit"'],
    ['a dry run, which writes nothing', 'git commit --dry-run'],
    ['a heredoc that documents the command', 'cat > doc/x.md <<EOF\ngit commit -m x\nEOF'],
    ['a quoted heredoc delimiter', "cat > x.md <<'EOF'\ngit add .\nEOF"],
    ['a plumbing command that merely starts with commit', 'git commit-tree abcdef'],
  ])('allows %s even from a repo on main', (_label, command) => {
    expect(inRepo(onMain(), command)).toBe(0);
  });

  it('allows anything in a directory that is not a repository', () => {
    expect(inRepo(os.tmpdir(), 'git commit -m x')).toBe(0);
  });
});

describe('which repository is judged', () => {
  // The hook's own process runs in the project directory, so the repo has to be read from
  // the command or from the payload — never from the process cwd.
  it('takes the repo from `git -C <dir>`', () => {
    expect(invoke(`git -C ${onMain()} commit -m x`).code).toBe(2);
  });

  it('takes the repo from a preceding `cd <dir>`', () => {
    expect(invoke(`cd ${onMain()} && git commit -m x`).code).toBe(2);
  });

  it('falls back to the payload cwd, which follows a cd from an earlier Bash call', () => {
    expect(invoke('git commit -m x', { cwd: onMain() }).code).toBe(2);
  });

  it('lets an explicit `-C <worktree>` win over a payload cwd sitting on main', () => {
    expect(invoke(`git -C ${onFeature()} commit -m x`, { cwd: onMain() }).code).toBe(0);
  });

  it('lets a preceding `cd <worktree>` win over a payload cwd sitting on main', () => {
    expect(invoke(`cd ${onFeature()} && git commit -m x`, { cwd: onMain() }).code).toBe(0);
  });
});
