import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { benchPaths, ensureLayout, type BenchPaths } from './paths';
import { Spool } from './job';
import type { GitRunner, TreeFingerprint } from './fingerprint';
import {
  maybeRunNightly,
  nightlyCheckout,
  nightlyDue,
  nightlyPrepareLog,
  nightlyResultFile,
  nightlyResultFromReport,
  NIGHTLY_MIN_GAP_MS,
  NIGHTLY_MOVE_RATE_LIMIT_MS,
  prepareCheckout,
  readNightlyResult,
  writeNightlyResult,
  type NightlyDeps,
  type NightlyResult,
} from './nightly';

/** 03:00 UTC — inside the window, whatever the machine's timezone is. */
const IN_WINDOW = Date.UTC(2026, 7, 25, 3, 0, 0);
/** 12:00 UTC — the middle of a working day. */
const OUTSIDE = Date.UTC(2026, 7, 25, 12, 0, 0);

interface Harness {
  deps: NightlyDeps;
  paths: BenchPaths;
  spool: Spool;
  commands: { cmd: string; args: string[]; cwd: string }[];
  exitCodes: number[];
  logs: string[];
  gitCalls: { worktree: string; args: string[] }[];
  gitThrows: boolean;
  fingerprintThrows: boolean;
  clock: { nowMs: number };
  git: GitRunner;
  /** What `resolveRef(workerRepo, 'origin/main')` reports — undefined until a test sets it,
   *  so every existing test keeps taking the time-window-only path. */
  mainSha: string | undefined;
}

function harness(): Harness {
  const paths = benchPaths(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-nightly-')));
  ensureLayout(paths);
  const spool = new Spool(paths);

  const h: Harness = {
    paths,
    spool,
    commands: [],
    exitCodes: [],
    logs: [],
    gitCalls: [],
    gitThrows: false,
    fingerprintThrows: false,
    clock: { nowMs: IN_WINDOW },
    mainSha: undefined,
    git: (worktree, args) => {
      h.gitCalls.push({ worktree, args });
      if (h.gitThrows) throw new Error('no origin remote');
      return 'git@github.com:Crazz-Org/SPO-WebClient.git\n';
    },
    deps: {
      paths,
      spool,
      fingerprint: (): TreeFingerprint => {
        if (h.fingerprintThrows) throw new Error('tree vanished');
        return { head: 'main-sha-abc', hash: 'nightly-hash', clean: true };
      },
      resolveRef: (): string | undefined => h.mainSha,
      runCommand: async (cmd, args, options) => {
        h.commands.push({ cmd, args, cwd: options.cwd });
        return h.exitCodes.shift() ?? 0;
      },
      now: () => h.clock.nowMs,
      log: line => h.logs.push(line),
    },
  };
  return h;
}

/** The `git`/`npm` verbs prepareCheckout ran, in order. */
function ranSteps(h: Harness): string[] {
  return h.commands.map(c => `${c.cmd} ${c.args[0]}`);
}

function result(overrides: Partial<NightlyResult> = {}): NightlyResult {
  return { verdict: 'PASS', submittedAt: new Date(IN_WINDOW).toISOString(), ...overrides };
}

describe('nightlyDue', () => {
  it('is due inside the window when nothing has run', () => {
    expect(nightlyDue(null, false, IN_WINDOW)).toBe(true);
  });

  it('is not due outside the window', () => {
    expect(nightlyDue(null, false, OUTSIDE)).toBe(false);
  });

  it('holds the window boundaries — 02:00 and 05:00 UTC are in, 01:00 and 06:00 are out', () => {
    const at = (hour: number) => nightlyDue(null, false, Date.UTC(2026, 7, 25, hour, 0, 0));
    expect(at(1)).toBe(false);
    expect(at(2)).toBe(true);
    expect(at(5)).toBe(true);
    expect(at(6)).toBe(false);
  });

  it('is not due while a nightly is already queued or running', () => {
    expect(nightlyDue(null, true, IN_WINDOW)).toBe(false);
  });

  it('is not due again within the gap', () => {
    const last = result({ submittedAt: new Date(IN_WINDOW - 60_000).toISOString() });
    expect(nightlyDue(last, false, IN_WINDOW)).toBe(false);
  });

  it('is due once the gap has passed', () => {
    const last = result({ submittedAt: new Date(IN_WINDOW - NIGHTLY_MIN_GAP_MS).toISOString() });
    expect(nightlyDue(last, false, IN_WINDOW)).toBe(true);
  });

  it('treats an unparseable stamp as due — a corrupt file must not wedge it off forever', () => {
    expect(nightlyDue(result({ submittedAt: 'not a date' }), false, IN_WINDOW)).toBe(true);
  });

  describe('backward compatibility — currentMainSha omitted', () => {
    it('stays on the window-only schedule when currentMainSha is not given at all', () => {
      // Same shape a "main moved" case would have (a different lastProvenSha, long past
      // the move rate limit) but with no currentMainSha — nothing new here, so outside
      // the window is still not due.
      const last = result({
        sha: 'old-sha',
        submittedAt: new Date(OUTSIDE - NIGHTLY_MOVE_RATE_LIMIT_MS).toISOString(),
      });
      expect(nightlyDue(last, false, OUTSIDE, undefined, 'other-sha')).toBe(false);
    });
  });

  describe('the main-moved trigger', () => {
    it('does not fire off-window on the very first check — nothing proven yet is "unknown", not "moved"', () => {
      // No lastProvenSha to compare against: falls through to the window schedule, same
      // as an omitted currentMainSha would, so the first-ever check does not bypass it.
      expect(nightlyDue(null, false, OUTSIDE, 'new-sha')).toBe(false);
      expect(nightlyDue(null, false, IN_WINDOW, 'new-sha')).toBe(true);
    });

    it('is due outside the window when main has moved past the last proven sha', () => {
      const last = result({
        sha: 'old-sha',
        submittedAt: new Date(OUTSIDE - NIGHTLY_MOVE_RATE_LIMIT_MS - 1).toISOString(),
      });
      expect(nightlyDue(last, false, OUTSIDE, 'new-sha', 'old-sha')).toBe(true);
    });

    it('is not due yet when main moved but the 15-minute move rate limit has not elapsed', () => {
      const last = result({
        sha: 'old-sha',
        submittedAt: new Date(OUTSIDE - 60_000).toISOString(),
      });
      expect(nightlyDue(last, false, OUTSIDE, 'new-sha', 'old-sha')).toBe(false);
    });

    it('holds the move rate-limit boundary — one ms short is not due, exactly on it is', () => {
      const justUnder = result({
        sha: 'old-sha',
        submittedAt: new Date(OUTSIDE - NIGHTLY_MOVE_RATE_LIMIT_MS + 1).toISOString(),
      });
      expect(nightlyDue(justUnder, false, OUTSIDE, 'new-sha', 'old-sha')).toBe(false);

      const exactly = result({
        sha: 'old-sha',
        submittedAt: new Date(OUTSIDE - NIGHTLY_MOVE_RATE_LIMIT_MS).toISOString(),
      });
      expect(nightlyDue(exactly, false, OUTSIDE, 'new-sha', 'old-sha')).toBe(true);
    });

    it('accepts an explicit lastRunAtMs instead of deriving it from the last result', () => {
      // last is null (nothing on disk), but the caller knows a run happened recently.
      expect(nightlyDue(null, false, OUTSIDE, 'new-sha', 'old-sha', OUTSIDE - 60_000)).toBe(false);
      expect(
        nightlyDue(null, false, OUTSIDE, 'new-sha', 'old-sha', OUTSIDE - NIGHTLY_MOVE_RATE_LIMIT_MS),
      ).toBe(true);
    });

    it('treats an unparseable explicit lastRunAtMs as no prior run — not a reason to withhold the move trigger', () => {
      expect(nightlyDue(null, false, OUTSIDE, 'new-sha', 'old-sha', NaN)).toBe(true);
    });

    it('does not fire inside the window either while the move rate limit is still open', () => {
      const last = result({
        sha: 'old-sha',
        submittedAt: new Date(IN_WINDOW - 60_000).toISOString(),
      });
      // Would be blocked by NIGHTLY_MIN_GAP_MS on the window path too, but this confirms
      // the main-moved path itself respects its own limit rather than falling through.
      expect(nightlyDue(last, false, IN_WINDOW, 'new-sha', 'old-sha')).toBe(false);
    });

    it('is not due while a nightly is already queued or running, even when main moved', () => {
      expect(nightlyDue(null, true, OUTSIDE, 'new-sha', 'old-sha')).toBe(false);
    });
  });

  describe('the already-proven check', () => {
    it('is not due when the current main sha exactly matches what was already proven', () => {
      const last = result({
        sha: 'same-sha',
        submittedAt: new Date(IN_WINDOW - NIGHTLY_MIN_GAP_MS).toISOString(),
      });
      // Inside the window and past the 20h gap — would be due on the window schedule
      // alone, but the sha is unchanged, so there is nothing new to prove.
      expect(nightlyDue(last, false, IN_WINDOW, 'same-sha', 'same-sha')).toBe(false);
    });

    it('takes precedence over a main-moved-shaped rate limit that has elapsed', () => {
      const last = result({
        sha: 'same-sha',
        submittedAt: new Date(OUTSIDE - NIGHTLY_MOVE_RATE_LIMIT_MS).toISOString(),
      });
      expect(nightlyDue(last, false, OUTSIDE, 'same-sha', 'same-sha')).toBe(false);
    });
  });
});

describe('reading and writing the published result', () => {
  it('round-trips and leaves no .tmp behind', () => {
    const h = harness();
    writeNightlyResult(h.paths, result({ sha: 'abc', jobId: 'job-1' }));

    expect(readNightlyResult(h.paths)).toMatchObject({ verdict: 'PASS', sha: 'abc', jobId: 'job-1' });
    expect(fs.existsSync(`${nightlyResultFile(h.paths)}.tmp`)).toBe(false);
  });

  it('reads an absent file as nothing known', () => {
    expect(readNightlyResult(harness().paths)).toBeNull();
  });

  it('reads a corrupt file as nothing known', () => {
    const h = harness();
    fs.writeFileSync(nightlyResultFile(h.paths), '{ not json', 'utf8');

    expect(readNightlyResult(h.paths)).toBeNull();
  });

  it('creates the nightly directory when it is missing', () => {
    const h = harness();
    fs.rmSync(h.paths.nightly, { recursive: true, force: true });

    writeNightlyResult(h.paths, result());

    expect(readNightlyResult(h.paths)).toMatchObject({ verdict: 'PASS' });
  });
});

describe('prepareCheckout', () => {
  it('clones on the first run, resolving the url from the worker repo', async () => {
    const h = harness();

    expect(await prepareCheckout(h.deps, '/repo', h.git)).toBeNull();

    expect(h.gitCalls).toEqual([{ worktree: '/repo', args: ['remote', 'get-url', 'origin'] }]);
    expect(h.commands[0]).toMatchObject({
      cmd: 'git',
      args: ['clone', 'git@github.com:Crazz-Org/SPO-WebClient.git', nightlyCheckout(h.paths)],
    });
    expect(ranSteps(h)).toEqual(['git clone', 'git fetch', 'git reset', 'git clean', 'npm ci']);
  });

  it('does not clone when the checkout already exists', async () => {
    const h = harness();
    fs.mkdirSync(path.join(nightlyCheckout(h.paths), '.git'), { recursive: true });

    expect(await prepareCheckout(h.deps, '/repo', h.git)).toBeNull();

    expect(h.gitCalls).toEqual([]);
    expect(ranSteps(h)).toEqual(['git fetch', 'git reset', 'git clean', 'npm ci']);
  });

  it('runs every step inside the checkout', async () => {
    const h = harness();
    fs.mkdirSync(path.join(nightlyCheckout(h.paths), '.git'), { recursive: true });

    await prepareCheckout(h.deps, '/repo', h.git);

    for (const command of h.commands) {
      expect(command.cwd).toBe(nightlyCheckout(h.paths));
    }
  });

  it('names the failing step and runs nothing after it', async () => {
    const h = harness();
    fs.mkdirSync(path.join(nightlyCheckout(h.paths), '.git'), { recursive: true });
    h.exitCodes = [0, 1];

    expect(await prepareCheckout(h.deps, '/repo', h.git)).toBe('git reset --hard origin/main');

    expect(ranSteps(h)).toEqual(['git fetch', 'git reset']);
  });

  it('names the clone when the clone fails', async () => {
    const h = harness();
    h.exitCodes = [1];

    expect(await prepareCheckout(h.deps, '/repo', h.git)).toBe('git clone');
    expect(ranSteps(h)).toEqual(['git clone']);
  });

  it('names the url lookup when the worker repo has no origin', async () => {
    const h = harness();
    h.gitThrows = true;

    expect(await prepareCheckout(h.deps, '/repo', h.git)).toBe('git remote get-url origin');

    expect(h.commands).toEqual([]);
    expect(fs.readFileSync(nightlyPrepareLog(h.paths), 'utf8')).toContain('no origin remote');
  });

  it('starts a fresh log each night, so a red result is not buried', async () => {
    const h = harness();
    fs.mkdirSync(path.join(nightlyCheckout(h.paths), '.git'), { recursive: true });
    fs.writeFileSync(nightlyPrepareLog(h.paths), 'yesterday noise\n', 'utf8');

    await prepareCheckout(h.deps, '/repo', h.git);

    expect(fs.readFileSync(nightlyPrepareLog(h.paths), 'utf8')).not.toContain('yesterday noise');
  });
});

describe('maybeRunNightly', () => {
  it('deposits one job for main when due', async () => {
    const h = harness();

    expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(true);

    const queued = h.spool.queued();
    expect(queued).toHaveLength(1);
    expect(queued[0].request).toMatchObject({
      type: 'nightly',
      branch: 'main',
      worktree: nightlyCheckout(h.paths),
      submitter: { pid: 0 },
      args: [],
      fingerprint: { head: 'main-sha-abc' },
    });
  });

  it('does nothing at all outside the window — not even a git call', async () => {
    const h = harness();
    h.clock.nowMs = OUTSIDE;

    expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(false);

    expect(h.spool.queued()).toEqual([]);
    expect(h.commands).toEqual([]);
    expect(h.gitCalls).toEqual([]);
  });

  it('does not deposit a second nightly while one is queued', async () => {
    const h = harness();
    await maybeRunNightly(h.deps, '/repo', h.git);

    expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(false);
    expect(h.spool.queued()).toHaveLength(1);
  });

  it('does not deposit a nightly while one is running', async () => {
    const h = harness();
    await maybeRunNightly(h.deps, '/repo', h.git);
    h.spool.claim(h.spool.queued()[0].file);

    expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(false);
    expect(h.spool.queued()).toEqual([]);
  });

  it('is held off by a result inside the gap', async () => {
    const h = harness();
    writeNightlyResult(h.paths, result({ submittedAt: new Date(IN_WINDOW - 60_000).toISOString() }));

    expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(false);
    expect(h.spool.queued()).toEqual([]);
  });

  it('records ENVIRONMENT and deposits nothing when the checkout cannot be refreshed', async () => {
    const h = harness();
    fs.mkdirSync(path.join(nightlyCheckout(h.paths), '.git'), { recursive: true });
    h.exitCodes = [0, 0, 0, 1];

    expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(false);

    expect(h.spool.queued()).toEqual([]);
    expect(readNightlyResult(h.paths)).toMatchObject({
      verdict: 'ENVIRONMENT',
      detail: expect.stringContaining('npm ci'),
    });
  });

  it('the recorded ENVIRONMENT stops it retrying for the rest of the window', async () => {
    const h = harness();
    fs.mkdirSync(path.join(nightlyCheckout(h.paths), '.git'), { recursive: true });
    h.exitCodes = [1];
    await maybeRunNightly(h.deps, '/repo', h.git);
    const after = h.commands.length;

    expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(false);
    expect(h.commands).toHaveLength(after);
  });

  it('records ENVIRONMENT when the checkout cannot be fingerprinted', async () => {
    const h = harness();
    h.fingerprintThrows = true;

    expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(false);

    expect(h.spool.queued()).toEqual([]);
    expect(readNightlyResult(h.paths)).toMatchObject({
      verdict: 'ENVIRONMENT',
      detail: expect.stringContaining('tree vanished'),
    });
  });

  it('defaults the worker repo to the process cwd', async () => {
    const h = harness();
    h.clock.nowMs = OUTSIDE;

    // Not due, so nothing runs — this only pins the default down as reachable.
    await expect(maybeRunNightly(h.deps)).resolves.toBe(false);
  });

  describe('the main-moved trigger', () => {
    it('deposits a nightly when main has moved, even outside the window', async () => {
      const h = harness();
      h.clock.nowMs = OUTSIDE;
      writeNightlyResult(
        h.paths,
        result({
          sha: 'old-sha',
          submittedAt: new Date(OUTSIDE - NIGHTLY_MOVE_RATE_LIMIT_MS - 1).toISOString(),
        }),
      );
      h.mainSha = 'new-sha';

      expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(true);
      expect(h.spool.queued()).toHaveLength(1);
    });

    it('does not deposit for a main move still inside the 15-minute rate limit', async () => {
      const h = harness();
      h.clock.nowMs = OUTSIDE;
      writeNightlyResult(
        h.paths,
        result({ sha: 'old-sha', submittedAt: new Date(OUTSIDE - 60_000).toISOString() }),
      );
      h.mainSha = 'new-sha';

      expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(false);
      expect(h.spool.queued()).toEqual([]);
      expect(h.commands).toEqual([]);
    });

    it('does not deposit a second one while a main-moved nightly is already queued', async () => {
      const h = harness();
      h.clock.nowMs = OUTSIDE;
      writeNightlyResult(
        h.paths,
        result({
          sha: 'old-sha',
          submittedAt: new Date(OUTSIDE - NIGHTLY_MOVE_RATE_LIMIT_MS - 1).toISOString(),
        }),
      );
      h.mainSha = 'new-sha';
      await maybeRunNightly(h.deps, '/repo', h.git);

      expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(false);
      expect(h.spool.queued()).toHaveLength(1);
    });
  });

  it('does not re-run when the current main sha was already proven, even inside the window past the gap', async () => {
    const h = harness();
    h.clock.nowMs = IN_WINDOW;
    writeNightlyResult(
      h.paths,
      result({ sha: 'same-sha', submittedAt: new Date(IN_WINDOW - NIGHTLY_MIN_GAP_MS).toISOString() }),
    );
    h.mainSha = 'same-sha';

    expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(false);
    expect(h.spool.queued()).toEqual([]);
    expect(h.commands).toEqual([]);
  });

  it('the window trigger still deposits unchanged when origin/main cannot be resolved', async () => {
    // resolveRef returning undefined (offline, or nothing fetched yet) is exactly the
    // pre-feature shape: currentMainSha absent, so only the window/20h-gap schedule
    // applies — proven by the untouched default harness (mainSha undefined).
    const h = harness();

    expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(true);
    expect(h.spool.queued()).toHaveLength(1);
  });

  it('the window trigger no longer re-fires for an unchanged, already-proven main, even past the 20h gap', async () => {
    const h = harness();
    h.clock.nowMs = IN_WINDOW;
    writeNightlyResult(
      h.paths,
      result({ sha: 'main-sha-abc', submittedAt: new Date(IN_WINDOW - NIGHTLY_MIN_GAP_MS).toISOString() }),
    );
    // resolveRef reports the same sha the last nightly proved: nothing changed.
    h.mainSha = 'main-sha-abc';

    expect(await maybeRunNightly(h.deps, '/repo', h.git)).toBe(false);
    expect(h.spool.queued()).toEqual([]);
  });
});

describe('nightlyResultFromReport', () => {
  const fingerprint = (head: string): TreeFingerprint => ({ head, hash: 'h', clean: true });

  it('takes the sha the job actually started on', () => {
    const built = nightlyResultFromReport(
      {
        id: 'job-9',
        verdict: 'PASS',
        fingerprints: { atSubmit: fingerprint('at-submit'), atStart: fingerprint('at-start') },
        finishedAt: 'then',
        detail: 'live drive exited 0',
        logFile: '/logs/job-9.log',
      },
      'deposited-at',
    );

    expect(built).toEqual({
      jobId: 'job-9',
      sha: 'at-start',
      verdict: 'PASS',
      submittedAt: 'deposited-at',
      finishedAt: 'then',
      detail: 'live drive exited 0',
      logFile: '/logs/job-9.log',
    });
  });

  it('falls back to the deposit fingerprint when the job never started', () => {
    const built = nightlyResultFromReport(
      { id: 'job-9', verdict: 'ABANDONED', fingerprints: { atSubmit: fingerprint('at-submit') } },
      'deposited-at',
    );

    expect(built.sha).toBe('at-submit');
  });
});
