/**
 * The pre-push hook decides whether a Bash command actually invokes a push.
 *
 * It is shell, not TypeScript, but it is the piece that enforces the whole policy — and
 * its first version blocked a command that merely *mentioned* `git push` inside a document
 * being written. That class of false positive is what this suite pins down.
 *
 * Between 2026-08-22 and #158 stage C it also verified the bench worker's per-HEAD
 * attestation. That check is gone: the gate now tests a commit the worker fetches, so a
 * push has to come FIRST, and the merge — not the push — is where `bench/gate` is
 * required. What remains is push detection and the `main` block.
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
  /** Where an ALLOWED run speaks — the base-moved notice rides here, not on stderr. */
  stdout: string;
}

/** 0 = allowed through, 2 = blocked. */
function invoke(command: string, env: NodeJS.ProcessEnv = {}): HookRun {
  try {
    const stdout = execFileSync('bash', [path.join(REPO_ROOT, HOOK)], {
      input: JSON.stringify({ tool_input: { command } }),
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
    });
    return { code: 0, stderr: '', stdout: stdout.toString() };
  } catch (err: unknown) {
    const failure = err as { status?: number; stderr?: Buffer; stdout?: Buffer };
    return {
      code: failure.status ?? -1,
      stderr: failure.stderr?.toString() ?? '',
      stdout: failure.stdout?.toString() ?? '',
    };
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

/**
 * Did the hook recognise this command as a push?
 *
 * Engagement used to be observable as a refusal: any push on a feature branch was blocked
 * for want of an attestation. #158 stage C allows those, so the signal is now the line the
 * hook prints only once it has decided a push is happening. Without a signal of its own,
 * "ignored" and "engaged and allowed" would be indistinguishable — and telling those apart
 * is the entire reason this suite exists.
 */
function engaged(command: string, dir: string = scratchRepo()): boolean {
  return /npm run gate/.test(invoke(command, { GATE_REPO_DIR: dir, SPO_BENCH_DIR: scratchBench() }).stdout);
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
  ])('allows %s, without ever engaging', (_label, command) => {
    expect(runHook(command)).toBe(0);
    expect(engaged(command)).toBe(false);
  });

  it('never engages on a mention, even from a repo where a real push would', () => {
    const dir = scratchRepo();
    expect(engaged('grep -rn "git push" doc/', dir)).toBe(false);
    expect(engaged('git push', dir)).toBe(true);
  });
});

describe('commands the hook must catch', () => {
  it.each([
    ['a bare push', 'git push'],
    ['a push with flags', 'git push -u origin HEAD'],
    ['a push at the end of a chain', 'git add . && git push -u origin HEAD'],
    ['a push on a later line', 'git add .\ngit push'],
    ['a push after a semicolon', 'git commit -m x; git push'],
    ['a push with a global git flag', 'git -C . push origin fix/x'],
    ['a refspec that has a source — code moves', 'git push origin fix/x:fix/x'],
    ['a deletion chained with a real push', 'git push origin --delete fix/old && git push -u origin HEAD'],
  ])('recognises %s', (_label, command) => {
    // On a feature branch an engaged push is now ALLOWED (#158 stage C), so recognition is
    // read from the hook's own line rather than from a refusal. The `main` guard below
    // proves recognition still has teeth where it matters.
    expect(engaged(command)).toBe(true);
  });
});

describe('what the hook no longer refuses — #158 stage C', () => {
  const push = 'git push -u origin HEAD';

  function invokeWith(dir: string, bench: string, env: NodeJS.ProcessEnv = {}): HookRun {
    return invoke(push, { GATE_REPO_DIR: dir, SPO_BENCH_DIR: bench, ...env });
  }

  /**
   * These tests replace a block that pinned the attestation gate: no push without a fresh,
   * stable, this-worktree PASS in `~/.spo-bench/verdicts/<sha>.json`.
   *
   * They are not relaxed because the old ones were inconvenient. The rule became
   * self-contradictory when the gate started testing a commit the worker FETCHES: a commit
   * has to be pushed before it can be gated, so "no push without an attestation" and "no
   * attestation without a push" cannot both hold. The card retires it in stage C by name.
   *
   * The guarantee did not weaken, it moved to the irreversible act. `bench/gate` is a
   * required status check on `main` with an empty bypass list, so a pull request still
   * cannot merge without the worker's live evidence — the maintainer included. What the
   * hook still owns is the `main` block, tested below.
   */
  it('allows a push with no attestation at all — that is how a session asks to be gated', () => {
    const dir = scratchRepo();
    const result = invokeWith(dir, scratchBench());
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/npm run gate/);
  });

  it('allows a push whose sha the bench previously FAILED', () => {
    // The branch is pushed so the worker can fetch and re-gate it; refusing here would
    // strand a session that has just fixed the failure.
    const dir = scratchRepo();
    expect(invokeWith(dir, benchWith(dir, { verdict: 'FAIL' })).code).toBe(0);
  });

  it('still judges the repo a `git -C <dir> push` names, not the session cwd', () => {
    // The attestation branches are gone, but WHICH repo the hook reads still decides the
    // branch name — and `main` is still refused. That resolution keeps its test.
    const dir = scratchRepo(); // a feature branch
    expect(invoke(`git -C ${dir} push -u origin HEAD`, { SPO_BENCH_DIR: scratchBench() }).code).toBe(0);
  });

  it('still judges the repo a preceding `cd <dir>` selects', () => {
    const dir = scratchRepo();
    expect(
      invoke(`cd ${dir} && npm run build && git push -u origin HEAD`, { SPO_BENCH_DIR: scratchBench() }).code,
    ).toBe(0);
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

describe('the refspec-to-main guard', () => {
  // These push main by NAMING it as the destination, from a repo whose local branch is a
  // feature branch — the branch guard above never sees them, since it only reads the
  // session's own HEAD. Run from scratchRepo() (fix/scratch), never scratchRepoOnMain().
  it.each([
    ['a HEAD:main refspec', 'git push origin HEAD:main'],
    ['a branch:main refspec', 'git push origin fix/scratch:main'],
    ['a forced HEAD:main refspec', 'git push --force origin HEAD:main'],
    ['a bare main destination, no colon', 'git push origin main'],
  ])('refuses %s from a feature branch', (_label, command) => {
    const result = invoke(command, { GATE_REPO_DIR: scratchRepo(), SPO_BENCH_DIR: scratchBench() });
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/push to main by refspec/);
  });

  it('still allows a refspec that does not target main', () => {
    expect(runHook('git push origin fix/x:fix/x')).toBe(0);
  });
});
