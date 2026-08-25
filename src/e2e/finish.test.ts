/**
 * scripts/finish.sh — the end of an update — driven through scratch repos.
 *
 * Each case builds a bare "origin", a clone standing in for ~/SPO-WebClient (reached
 * through SPO_MAIN_REPO), and a session worktree of that clone on a feature branch. A
 * fake `gh` on PATH answers `pr view` from environment variables. Nothing touches GitHub,
 * the real main checkout or the bench worker: the bench-install step is a stub committed
 * into the scratch origin that only records it ran.
 */

import { execFileSync, spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.join(process.cwd(), 'scripts', 'finish.sh');

const FAKE_GH = `#!/usr/bin/env bash
# gh pr view <branch> --json state|mergeCommit -q <query>
# FAKE_GH_BRANCH_STATES="a=MERGED,b=OPEN" overrides FAKE_GH_STATE per branch ($3).
state="\${FAKE_GH_STATE:-NONE}"
for kv in \${FAKE_GH_BRANCH_STATES//,/ }; do
  [ "\${kv%%=*}" = "$3" ] && state="\${kv#*=}"
done
[ "$state" = "NONE" ] && { echo "no pull requests found" >&2; exit 1; }
case "$*" in
  *"--json state"*) echo "$state" ;;
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
  /** Stands in for ~/.spo-bench/sessions: heartbeats and the retired markers. */
  sessions: string;
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
    sessions: scratch('spo-finish-sessions-'),
  };
}

/** The key finish.sh files a worktree under in SESSIONS_DIR — sha1 of its real path. */
function sessionKey(dir: string): string {
  return createHash('sha1').update(fs.realpathSync(dir)).digest('hex').slice(0, 16);
}

/** A session stamped its heartbeat in `dir` this many minutes ago. */
function heartbeat(bench: Bench, dir: string, minutesAgo: number): void {
  const file = path.join(bench.sessions, `${sessionKey(dir)}.alive`);
  fs.writeFileSync(file, `${fs.realpathSync(dir)}\n`, 'utf8');
  const when = new Date(Date.now() - minutesAgo * 60_000);
  fs.utimesSync(file, when, when);
}

function isRetired(bench: Bench, dir: string): boolean {
  return fs.existsSync(path.join(bench.sessions, `${sessionKey(dir)}.finished`));
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

function runFinish(bench: Bench, cwd: string, env: NodeJS.ProcessEnv = {}, args: string[] = []): FinishRun {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      SPO_MAIN_REPO: bench.mainRepo,
      SPO_SESSION_DIR: bench.sessions,
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
  /**
   * The directory the session stands in is NOT pulled away by default. Removing it from
   * inside it is what left sessions running in a path that no longer existed: every later
   * command failed, and an autonomous loop that finishes and carries on hit exactly that.
   */
  it('fast-forwards main and retires the worktree, keeping the directory usable', () => {
    const bench = scratchBench();
    const mergeSha = mergeOnOrigin(bench, 'doc/merged.md');
    const run = runFinish(bench, bench.worktree, {
      FAKE_GH_STATE: 'MERGED',
      FAKE_GH_MERGE_SHA: mergeSha,
    });
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/== retiring worktree/);
    expect(run.stdout).not.toMatch(/== removing worktree/);
    expect(run.stdout).toMatch(/^finished: main at [0-9a-f]{7}/m);
    expect(headOf(bench.mainRepo)).toBe(mergeSha);
    expect(fs.existsSync(bench.worktree)).toBe(true);
    expect(isRetired(bench, bench.worktree)).toBe(true);
    // The branch cannot go while it is checked out here; it is reaped with the worktree.
    expect(branchExists(bench)).toBe(true);
    expect(git(bench.mainRepo, 'status', '--porcelain')).toBe('');
  });

  it('removes the worktree and the branch at once with --now', () => {
    const bench = scratchBench();
    const mergeSha = mergeOnOrigin(bench, 'doc/merged.md');
    const run = runFinish(
      bench,
      bench.worktree,
      { FAKE_GH_STATE: 'MERGED', FAKE_GH_MERGE_SHA: mergeSha },
      ['--now'],
    );
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/== removing worktree/);
    expect(run.stdout).toMatch(/== deleting local branch feature\/x/);
    expect(fs.existsSync(bench.worktree)).toBe(false);
    expect(branchExists(bench)).toBe(false);
    expect(git(bench.mainRepo, 'worktree', 'list', '--porcelain')).not.toContain(bench.worktree);
  });

  it('rejects an unknown option instead of taking it for a branch name', () => {
    const bench = scratchBench();
    const run = runFinish(bench, bench.worktree, { FAKE_GH_STATE: 'MERGED' }, ['--wipe']);
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/unknown option '--wipe'/);
    expect(fs.existsSync(bench.worktree)).toBe(true);
  });

  it('reaps a retired worktree on the next run, once nobody is standing in it', () => {
    const bench = scratchBench();
    const base = path.join(bench.mainRepo, '.claude', 'worktrees');
    fs.mkdirSync(base, { recursive: true });
    const retired = path.join(base, 'retired');
    git(bench.mainRepo, 'worktree', 'add', '-q', '-b', 'claude-x/retired', retired);
    commitFile(retired, 'src/done.ts', 'export const d = 1;\n', 'feat: done');
    const sha = git(retired, 'rev-parse', 'HEAD');
    const key = sessionKey(retired); // the directory is gone by the time we check it
    fs.writeFileSync(
      path.join(bench.sessions, `${key}.finished`),
      `${retired}\tclaude-x/retired\t${sha}\n`,
      'utf8',
    );
    // Its session signed off well past the retired idle window; gh is never consulted.
    heartbeat(bench, retired, 60);

    const run = runFinish(bench, bench.mainRepo);
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/== reaping retired worktree .*retired/);
    expect(fs.existsSync(retired)).toBe(false);
    expect(fs.existsSync(path.join(bench.sessions, `${key}.finished`))).toBe(false);
    expect(
      spawnSync('git', ['-C', bench.mainRepo, 'rev-parse', '--verify', '-q', 'claude-x/retired'])
        .status,
    ).not.toBe(0);
  });

  it('does not reap a retired worktree that gained a commit since finish ran', () => {
    const bench = scratchBench();
    const base = path.join(bench.mainRepo, '.claude', 'worktrees');
    fs.mkdirSync(base, { recursive: true });
    const active = path.join(base, 'active');
    git(bench.mainRepo, 'worktree', 'add', '-q', '-b', 'claude-x/active', active);
    commitFile(active, 'src/first.ts', 'export const a = 1;\n', 'feat: first card');
    const retireSha = git(active, 'rev-parse', 'HEAD');
    const key = sessionKey(active);
    fs.writeFileSync(
      path.join(bench.sessions, `${key}.finished`),
      `${active}\tclaude-x/active\t${retireSha}\n`,
      'utf8',
    );
    // Session picks up a second card and makes a new commit — HEAD has moved.
    commitFile(active, 'src/second.ts', 'export const b = 2;\n', 'feat: second card');
    // Heartbeat is old enough that it would not save the worktree on its own.
    heartbeat(bench, active, 60);

    const run = runFinish(bench, bench.mainRepo);
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/== un-retiring .*active.*new work detected/);
    expect(fs.existsSync(active)).toBe(true);
    // Marker is cleared so the next finish treats the worktree normally.
    expect(isRetired(bench, active)).toBe(false);
  });

  it('keeps a worktree whose session stamped a heartbeat inside the idle window', () => {
    const bench = scratchBench();
    const base = path.join(bench.mainRepo, '.claude', 'worktrees');
    fs.mkdirSync(base, { recursive: true });
    const live = path.join(base, 'live');
    git(bench.mainRepo, 'worktree', 'add', '-q', '-b', 'claude-x/live', live);
    heartbeat(bench, live, 3);

    const run = runFinish(bench, bench.mainRepo, { SPO_WORKTREE_IDLE_MIN: '120' });
    expect(run.code).toBe(0);
    // The exact age is not ours to predict. finish.sh reads it off the wall clock —
    // `(date +%s) - (stat -c %Y)`, whole seconds, scripts/finish.sh:119-126 — so a stamp
    // made 180 s ago prints 3 only while the clock moves forward at one second per second.
    // It cannot print 2 by rounding (stat truncates), which means the 2 that failed this
    // assertion in CI came from the clock itself stepping between the stamp and the read;
    // a step is unbounded in both directions, and no pinned number survives one.
    const keeping =
      /== keeping .*live — a session was working there (-?\d+) min ago \(idle window 120 min\)/;
    const kept = keeping.exec(run.stdout);
    // That line is printed by one branch and no other, and only for the live window (120)
    // rather than the retired one (15) — which is the whole of what the case is about.
    expect(kept).not.toBeNull();
    // Whatever the clock said, the age the guard printed has to be the age it kept on.
    expect(Number(kept?.[1])).toBeLessThan(120);
    expect(fs.existsSync(live)).toBe(true);
  });

  /**
   * The regression that started this: liveness was "some process has this exact directory
   * as its cwd". A shell that had `cd src/` inside the worktree did not match, and the
   * directory was removed under a session that was working in it.
   */
  it('keeps a worktree a process is standing in through a subdirectory', () => {
    const bench = scratchBench();
    const base = path.join(bench.mainRepo, '.claude', 'worktrees');
    fs.mkdirSync(base, { recursive: true });
    const busy = path.join(base, 'busy');
    git(bench.mainRepo, 'worktree', 'add', '-q', '-b', 'claude-x/busy', busy);
    const inside = path.join(busy, 'src', 'client');
    fs.mkdirSync(inside, { recursive: true });

    const held = spawn('sleep', ['30'], { cwd: inside, stdio: 'ignore' });
    try {
      // spawn is asynchronous: wait until the kernel actually shows the cwd, otherwise the
      // test would pass or fail on how fast exec happened to be.
      const target = fs.realpathSync(inside);
      let seen = '';
      for (let i = 0; i < 100 && seen !== target; i++) {
        try {
          seen = fs.readlinkSync(`/proc/${held.pid}/cwd`);
        } catch {
          seen = '';
        }
        if (seen !== target) spawnSync('sleep', ['0.05']);
      }
      expect(seen).toBe(target);

      const run = runFinish(bench, bench.mainRepo);
      expect(run.code).toBe(0);
      expect(run.stdout).not.toMatch(/busy/);
      expect(fs.existsSync(busy)).toBe(true);
    } finally {
      held.kill('SIGKILL');
    }
  });

  it('finishes a named branch that is checked out nowhere, leaving the current worktree alone', () => {
    const bench = scratchBench();
    const mergeSha = mergeOnOrigin(bench, 'doc/merged.md');
    // The session switched away: the worktree is gone, the branch remains.
    git(bench.mainRepo, 'worktree', 'remove', bench.worktree);
    const run = runFinish(
      bench,
      bench.mainRepo,
      { FAKE_GH_STATE: 'MERGED', FAKE_GH_MERGE_SHA: mergeSha },
      [bench.branch],
    );
    expect(run.code).toBe(0);
    expect(run.stdout).not.toMatch(/== removing worktree/);
    expect(run.stdout).toMatch(/== deleting local branch feature\/x/);
    expect(headOf(bench.mainRepo)).toBe(mergeSha);
    expect(branchExists(bench)).toBe(false);
    expect(fs.existsSync(bench.mainRepo)).toBe(true);
  });

  it('prunes orphan worktrees and finishes merged leftovers; keeps unmerged work and dirty trees', () => {
    const bench = scratchBench();
    const base = path.join(bench.mainRepo, '.claude', 'worktrees');
    fs.mkdirSync(base, { recursive: true });
    git(bench.mainRepo, 'worktree', 'add', '-q', '-b', 'claude-x/orphan', path.join(base, 'orphan'));
    git(bench.mainRepo, 'worktree', 'add', '-q', '-b', 'claude-x/ahead', path.join(base, 'ahead'));
    commitFile(path.join(base, 'ahead'), 'src/work.ts', 'export const w = 1;\n', 'feat: work');
    git(bench.mainRepo, 'worktree', 'add', '-q', '-b', 'claude-x/dirty', path.join(base, 'dirty'));
    fs.writeFileSync(path.join(base, 'dirty', 'notes.md'), 'wip\n', 'utf8');
    // A session that pushed, merged (squash: commits still "ahead") and never ran finish.
    git(bench.mainRepo, 'worktree', 'add', '-q', '-b', 'claude-x/merged', path.join(base, 'merged'));
    commitFile(path.join(base, 'merged'), 'src/done.ts', 'export const d = 1;\n', 'feat: done');

    const run = runFinish(bench, bench.mainRepo, {
      FAKE_GH_BRANCH_STATES: 'claude-x/merged=MERGED,claude-x/ahead=OPEN',
    }); // on main: sync + prune only
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/== pruning orphan worktree .*orphan/);
    expect(run.stdout).toMatch(/== finishing worktree .*merged — its PR is MERGED/);
    expect(fs.existsSync(path.join(base, 'orphan'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'merged'))).toBe(false);
    expect(spawnSync('git', ['-C', bench.mainRepo, 'rev-parse', '--verify', '-q', 'claude-x/orphan']).status).not.toBe(0);
    expect(spawnSync('git', ['-C', bench.mainRepo, 'rev-parse', '--verify', '-q', 'claude-x/merged']).status).not.toBe(0);
    expect(fs.existsSync(path.join(base, 'ahead'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'dirty'))).toBe(true);
  });

  it('refuses to finish a named branch that is still checked out in a worktree', () => {
    const bench = scratchBench();
    const run = runFinish(bench, bench.mainRepo, { FAKE_GH_STATE: 'MERGED' }, [bench.branch]);
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/checked out in a worktree/);
    expect(branchExists(bench)).toBe(true);
    expect(fs.existsSync(bench.worktree)).toBe(true);
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
      const run = runFinish(
        bench,
        bench.worktree,
        { FAKE_GH_STATE: 'MERGED', FAKE_GH_MERGE_SHA: mergeSha },
        ['--now'],
      );
      expect(run.code).toBe(0);
      expect(run.stdout).toMatch(/the merge touched the bench worker — reinstalling it from main/);
      expect(fs.readFileSync(bench.installLog, 'utf8')).toBe('bench-install ran\n');
      expect(fs.existsSync(bench.worktree)).toBe(false);
    }
  );
});
