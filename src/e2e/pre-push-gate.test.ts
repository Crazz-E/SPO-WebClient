/**
 * The pre-push hook decides whether a Bash command actually invokes a push.
 *
 * It is shell, not TypeScript, but it is the piece that enforces the whole policy — and
 * its first version blocked a command that merely *mentioned* `git push` inside a document
 * being written. That class of false positive is what this suite pins down.
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
 * Matcher cases run against a scratch repo, never the real one.
 *
 * They assert *whether the hook engages*, and the answer for an engaged push has to be a
 * refusal — so they need a repo with no gate artifact. Pointing them at the working repo
 * made them depend on its branch and on whether a gate had been run, which flipped the
 * expected result the moment either changed.
 */
function runHook(command: string, dir: string = scratchRepo()): number {
  return invoke(command, { GATE_REPO_DIR: dir }).code;
}

/**
 * A throwaway repo on a feature branch. On `main` the branch guard fires first and hides
 * every artifact branch, so those can only be reached from somewhere else.
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

function writeArtifact(dir: string, artifact: Record<string, unknown>): void {
  const target = path.join(dir, 'report', 'e2e', `gate-${headOf(dir)}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(artifact), 'utf8');
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
  ])('allows %s', (_label, command) => {
    expect(runHook(command)).toBe(0);
  });

  it('allows them even from a repo that would refuse a real push', () => {
    // The point is that the hook never engages, not that the artifact check passed.
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
  ])('blocks %s', (_label, command) => {
    // The scratch repo is on a feature branch with no artifact, so an engaged push is
    // refused for that reason alone — independent of the real repo's state.
    expect(runHook(command)).toBe(2);
  });
});

describe('the artifact gate, on a feature branch', () => {
  const push = 'git push -u origin HEAD';

  it('blocks when no artifact exists for HEAD', () => {
    const dir = scratchRepo();
    const result = invoke(push, { GATE_REPO_DIR: dir });
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/no gate artifact for HEAD/);
    expect(result.stderr).toMatch(/npm run gate/);
  });

  it('allows a fresh PASS artifact matching HEAD', () => {
    const dir = scratchRepo();
    writeArtifact(dir, { verdict: 'PASS', createdAt: new Date().toISOString() });
    expect(invoke(push, { GATE_REPO_DIR: dir }).code).toBe(0);
  });

  it('blocks a FAIL verdict and points at the three-attempt rule', () => {
    const dir = scratchRepo();
    writeArtifact(dir, { verdict: 'FAIL', createdAt: new Date().toISOString() });
    const result = invoke(push, { GATE_REPO_DIR: dir });
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/Three attempts maximum/);
  });

  it('blocks a BLOCKED verdict with the manual-verification instruction', () => {
    const dir = scratchRepo();
    writeArtifact(dir, { verdict: 'BLOCKED', createdAt: new Date().toISOString() });
    const result = invoke(push, { GATE_REPO_DIR: dir });
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/President-only members/);
    expect(result.stderr).toMatch(/never mark it verified|Do not mark it verified/i);
  });

  it('blocks a stale PASS — the live world moves, so old evidence is not evidence', () => {
    const dir = scratchRepo();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    writeArtifact(dir, { verdict: 'PASS', createdAt: twoHoursAgo });
    const result = invoke(push, { GATE_REPO_DIR: dir });
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/min old \(limit 60\)/);
  });

  it('honours a wider freshness window when one is configured', () => {
    const dir = scratchRepo();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    writeArtifact(dir, { verdict: 'PASS', createdAt: twoHoursAgo });
    expect(invoke(push, { GATE_REPO_DIR: dir, GATE_MAX_AGE_MINUTES: '240' }).code).toBe(0);
  });

  it('blocks an artifact belonging to a different commit', () => {
    const dir = scratchRepo();
    const target = path.join(dir, 'report', 'e2e', 'gate-0000000000000000000000000000000000000000.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ verdict: 'PASS', createdAt: new Date().toISOString() }), 'utf8');
    expect(invoke(push, { GATE_REPO_DIR: dir }).code).toBe(2);
  });
});

describe('the main-branch guard', () => {
  // This used to drive the real repository, which only works while the developer happens
  // to be standing on `main` — precisely when the gate is not needed. From a branch the
  // hook stopped earlier, on the missing artifact, and the suite failed for a reason that
  // had nothing to do with the guard. A throwaway repo on `main` reaches the guard from
  // anywhere, like every other case in this file.
  it('refuses a direct push to main outright', () => {
    const result = invoke('git push -u origin HEAD', { GATE_REPO_DIR: scratchRepoOnMain() });
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/direct push to main/);
  });

  it('lets the same push through from a feature branch, artifact permitting', () => {
    const dir = scratchRepo();
    writeArtifact(dir, { verdict: 'PASS', createdAt: new Date().toISOString() });
    expect(invoke('git push -u origin HEAD', { GATE_REPO_DIR: dir }).code).toBe(0);
  });
});
