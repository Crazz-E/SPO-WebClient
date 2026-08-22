/**
 * scripts/finish.sh — the end of an update — driven through scratch repos.
 *
 * Each case builds a bare "origin", a clone standing in for ~/SPO-WebClient (reached
 * through SPO_MAIN_REPO), and a session worktree of that clone on a feature branch. A
 * fake `gh` on PATH answers `pr view` from environment variables. Nothing touches GitHub,
 * the real main checkout or the bench worker: the bench-install step is a stub committed
 * into the scratch origin that only records it ran.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.join(process.cwd(), 'scripts', 'finish.sh');

const FAKE_GH = `#!/usr/bin/env bash
# gh pr view <branch> --json state|mergeCommit -q <query>
[ "\${FAKE_GH_STATE:-NONE}" = "NONE" ] && { echo "no pull requests found" >&2; exit 1; }
case "$*" in
  *"--json state"*) echo "$FAKE_GH_STATE" ;;
  *"--json mergeCommit"*) echo "$FAKE_GH_MERGE_SHA" ;;
  *) echo "fake gh: unexpected args: $*" >&2; exit 1 ;;
esac
`;

const BENCH_INSTALL_STUB = `#!/usr/bin/env bash
echo "bench-install ran" >> "$BENCH_INSTALL_LOG"
`;

interface Bench {
  origin: string;
  mainRepo: string;
  worktree: string;
  branch: string;
  installLog: string;
}

interface FinishRun {
  code: number;
  stdout: string;
  stderr: string;
}

function scratch(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function identify(dir: string): void {
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'test');
  git(dir, 'config', 'commit.gpgsign', 'false');
}

function commitFile(dir: string, file: string, body: string, message: string): string {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), body, 'utf8');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

let fakeBin: string;

beforeAll(() => {
  fakeBin = scratch('spo-finish-bin-');
  fs.writeFileSync(path.join(fakeBin, 'gh'), FAKE_GH, { mode: 0o755 });
});

/** origin (bare) <- mainRepo (clone, on main) <- worktree (feature/x, one commit ahead). */
function scratchBench(): Bench {
  const origin = scratch('spo-finish-origin-');
  git(origin, 'init', '-q', '--bare', '-b', 'main');

  const seed = scratch('spo-finish-seed-');
  git(seed, 'init', '-q', '-b', 'main');
  identify(seed);
  fs.mkdirSync(path.join(seed, 'scripts'));
  fs.writeFileSync(path.join(seed, 'scripts', 'bench-install.sh'), BENCH_INSTALL_STUB, {
    mode: 0o755,
  });
  commitFile(seed, 'README.md', 'seed\n', 'init');
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '-q', 'origin', 'main');

  const mainRepo = path.join(scratch('spo-finish-main-'), 'SPO-WebClient');
  execFileSync('git', ['clone', '-q', origin, mainRepo], { stdio: ['pipe', 'pipe', 'pipe'] });
  identify(mainRepo);

  const branch = 'feature/x';
  const worktree = path.join(scratch('spo-finish-wt-'), 'session');
  git(mainRepo, 'worktree', 'add', '-q', '-b', branch, worktree);
  commitFile(worktree, 'src/thing.ts', 'export const thing = 1;\n', 'feat: thing');

  return {
    origin,
    mainRepo,
    worktree,
    branch,
    installLog: path.join(scratch('spo-finish-log-'), 'install.log'),
  };
}

/**
 * Land a commit on origin/main from a third clone, the way a squash merge in the GitHub UI
 * would: the main checkout lags behind it until finish.sh fast-forwards.
 */
function mergeOnOrigin(bench: Bench, file: string): string {
  const merger = scratch('spo-finish-merger-');
  execFileSync('git', ['clone', '-q', bench.origin, merger], { stdio: ['pipe', 'pipe', 'pipe'] });
  identify(merger);
  const sha = commitFile(merger, file, 'merged\n', `feat: squash of ${bench.branch}`);
  git(merger, 'push', '-q', 'origin', 'main');
  return sha;
}

function runFinish(bench: Bench, cwd: string, env: NodeJS.ProcessEnv = {}): FinishRun {
  const result = spawnSync('bash', [SCRIPT], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      SPO_MAIN_REPO: bench.mainRepo,
      BENCH_INSTALL_LOG: bench.installLog,
      FAKE_GH_STATE: 'NONE',
      ...env,
    },
  });
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

function branchExists(bench: Bench): boolean {
  return (
    spawnSync('git', ['-C', bench.mainRepo, 'rev-parse', '--verify', '-q', bench.branch]).status ===
    0
  );
}

function headOf(dir: string, ref = 'HEAD'): string {
  return git(dir, 'rev-parse', ref);
}

describe('refusals — nothing is deleted', () => {
  it.each([
    ['OPEN', /is OPEN, not MERGED/],
    ['NONE', /is NONE, not MERGED/],
  ])('refuses when the PR is %s', (state, message) => {
    const bench = scratchBench();
    const run = runFinish(bench, bench.worktree, { FAKE_GH_STATE: state });
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/REFUSED/);
    expect(run.stderr).toMatch(message);
    expect(fs.existsSync(bench.worktree)).toBe(true);
    expect(branchExists(bench)).toBe(true);
    expect(fs.existsSync(bench.installLog)).toBe(false);
  });

  it('refuses a dirty worktree after syncing main, and keeps the worktree', () => {
    const bench = scratchBench();
    const mergeSha = mergeOnOrigin(bench, 'doc/merged.md');
    fs.writeFileSync(path.join(bench.worktree, 'scratch.txt'), 'not committed\n', 'utf8');
    const run = runFinish(bench, bench.worktree, {
      FAKE_GH_STATE: 'MERGED',
      FAKE_GH_MERGE_SHA: mergeSha,
    });
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/REFUSED: .* has uncommitted changes/);
    expect(fs.existsSync(path.join(bench.worktree, 'scratch.txt'))).toBe(true);
    expect(branchExists(bench)).toBe(true);
    // main was still brought up to date — that part is idempotent and safe.
    expect(headOf(bench.mainRepo)).toBe(mergeSha);
  });
});

describe('from the main checkout on main', () => {
  it('only fast-forwards and prunes, without consulting gh', () => {
    const bench = scratchBench();
    const mergeSha = mergeOnOrigin(bench, 'doc/merged.md');
    expect(headOf(bench.mainRepo)).not.toBe(mergeSha);
    const run = runFinish(bench, bench.mainRepo);
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/on main: nothing else to finish/);
    expect(headOf(bench.mainRepo)).toBe(mergeSha);
    expect(fs.existsSync(bench.worktree)).toBe(true);
    expect(branchExists(bench)).toBe(true);
    expect(fs.existsSync(bench.installLog)).toBe(false);
  });
});

describe('after a merge', () => {
  it('fast-forwards main, removes the worktree, deletes the branch and prunes', () => {
    const bench = scratchBench();
    const mergeSha = mergeOnOrigin(bench, 'doc/merged.md');
    const run = runFinish(bench, bench.worktree, {
      FAKE_GH_STATE: 'MERGED',
      FAKE_GH_MERGE_SHA: mergeSha,
    });
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/== removing worktree/);
    expect(run.stdout).toMatch(/== deleting local branch feature\/x/);
    expect(run.stdout).toMatch(/^finished: main at [0-9a-f]{7}/m);
    expect(headOf(bench.mainRepo)).toBe(mergeSha);
    expect(fs.existsSync(bench.worktree)).toBe(false);
    expect(branchExists(bench)).toBe(false);
    expect(git(bench.mainRepo, 'worktree', 'list', '--porcelain')).not.toContain(bench.worktree);
    expect(git(bench.mainRepo, 'status', '--porcelain')).toBe('');
  });

  it('leaves the bench worker alone when the merge did not touch its sources', () => {
    const bench = scratchBench();
    const mergeSha = mergeOnOrigin(bench, 'src/server/thing.ts');
    const run = runFinish(bench, bench.worktree, {
      FAKE_GH_STATE: 'MERGED',
      FAKE_GH_MERGE_SHA: mergeSha,
    });
    expect(run.code).toBe(0);
    expect(run.stdout).not.toMatch(/reinstalling/);
    expect(fs.existsSync(bench.installLog)).toBe(false);
  });

  it.each([['src/e2e/bench/worker.ts'], ['scripts/bench-worker.sh']])(
    'reinstalls the bench worker from main when the merge touched %s',
    (file) => {
      const bench = scratchBench();
      const mergeSha = mergeOnOrigin(bench, file);
      const run = runFinish(bench, bench.worktree, {
        FAKE_GH_STATE: 'MERGED',
        FAKE_GH_MERGE_SHA: mergeSha,
      });
      expect(run.code).toBe(0);
      expect(run.stdout).toMatch(/the merge touched the bench worker — reinstalling it from main/);
      expect(fs.readFileSync(bench.installLog, 'utf8')).toBe('bench-install ran\n');
      expect(fs.existsSync(bench.worktree)).toBe(false);
    }
  );
});
