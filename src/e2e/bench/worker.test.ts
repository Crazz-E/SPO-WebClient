import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { benchPaths, ensureLayout, readWorkerInfo, type BenchPaths } from './paths';
import { Spool, type JobRequest } from './job';
import { listVerdicts } from './verdict';
import {
  main,
  processOldest,
  realRunCommand,
  realWorkerDeps,
  recoverInterrupted,
  runJob,
  workerLoop,
  type WorkerDeps,
} from './worker';

interface Harness {
  deps: WorkerDeps;
  paths: BenchPaths;
  spool: Spool;
  worktree: string;
  commands: { cmd: string; args: string[]; cwd: string; env?: Record<string, string> }[];
  /** Queue of exit codes handed to successive runCommand calls (default 0). */
  exitCodes: number[];
  gatewayStarts: string[];
  gatewayStops: number;
  logs: string[];
  submitterAlive: boolean;
  /** Successive fingerprint hashes; the last one repeats. */
  hashes: string[];
  /** What every fingerprint reports for `clean`. */
  clean: boolean;
  published: string[];
  gatewayFails: boolean;
  clock: { nowMs: number };
}

function harness(): Harness {
  const paths = benchPaths(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-worker-')));
  ensureLayout(paths);
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-wt-'));
  const spool = new Spool(paths);
  let fingerprintCalls = 0;

  const h: Harness = {
    paths,
    spool,
    worktree,
    commands: [],
    exitCodes: [],
    gatewayStarts: [],
    gatewayStops: 0,
    logs: [],
    submitterAlive: true,
    hashes: ['h1'],
    clean: true,
    published: [],
    gatewayFails: false,
    clock: { nowMs: 1_000_000 },
    deps: {
      paths,
      spool,
      port: 8080,
      fingerprint: wt => {
        const hash = h.hashes[Math.min(fingerprintCalls++, h.hashes.length - 1)];
        return { head: `head-of-${path.basename(wt)}`, hash, clean: h.clean };
      },
      runCommand: async (cmd, args, options) => {
        h.commands.push({ cmd, args, cwd: options.cwd, env: options.env });
        return h.exitCodes.shift() ?? 0;
      },
      gateway: {
        clearPort: async () => {},
        start: async wt => {
          if (h.gatewayFails) throw new Error('phase=caching forever');
          h.gatewayStarts.push(wt);
          return { pid: 999, stop: async () => void h.gatewayStops++ };
        },
      },
      publishStatus: (_wt, head) => h.published.push(head),
      processAlive: () => h.submitterAlive,
      now: () => (h.clock.nowMs += 10),
      sleep: async () => {},
      log: line => h.logs.push(line),
    },
  };
  return h;
}

function deposit(h: Harness, type: JobRequest['type'] = 'gate', args: string[] = []): JobRequest {
  return h.spool.submit(
    {
      type,
      worktree: h.worktree,
      branch: 'fix/x',
      fingerprint: { head: `head-of-${path.basename(h.worktree)}`, hash: 'h1', clean: true },
      submitter: { pid: 4321 },
      args,
      ...(type === 'lease' ? { leaseMinutes: 1 } : {}),
    },
    h.clock.nowMs,
  );
}

describe('recoverInterrupted', () => {
  it('reports running jobs as INTERRUPTED and clears the slot', () => {
    const h = harness();
    const job = deposit(h);
    h.spool.claim(h.spool.queued()[0].file);
    recoverInterrupted(h.deps);
    expect(h.spool.running()).toHaveLength(0);
    const report = h.spool.readReport(job.id);
    expect(report?.verdict).toBe('INTERRUPTED');
    expect(report?.detail).toMatch(/worker died/);
  });
});

describe('processOldest — the queue discipline', () => {
  it('returns false on an empty queue', async () => {
    expect(await processOldest(harness().deps)).toBe(false);
  });

  it('abandons a deposit whose session died, without running anything', async () => {
    const h = harness();
    const job = deposit(h);
    h.submitterAlive = false;
    expect(await processOldest(h.deps)).toBe(true);
    expect(h.spool.readReport(job.id)?.verdict).toBe('ABANDONED');
    expect(h.commands).toHaveLength(0);
    expect(h.spool.queued()).toHaveLength(0);
  });

  it('runs the oldest job end to end: claim, execute, report, release', async () => {
    const h = harness();
    const job = deposit(h);
    expect(await processOldest(h.deps)).toBe(true);
    expect(h.spool.readReport(job.id)?.verdict).toBe('PASS');
    expect(h.spool.queued()).toHaveLength(0);
    expect(h.spool.running()).toHaveLength(0);
  });

  it('writes the per-HEAD attestation for a gate job', async () => {
    const h = harness();
    deposit(h);
    await processOldest(h.deps);
    const verdicts = listVerdicts(h.paths);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].verdict).toMatchObject({
      head: `head-of-${path.basename(h.worktree)}`,
      verdict: 'PASS',
      fingerprintStable: true,
      worktree: h.worktree,
    });
  });

  it('still reports when runJob itself throws', async () => {
    const h = harness();
    const job = deposit(h);
    h.deps.gateway.clearPort = async () => {
      throw new Error('port stuck');
    };
    await processOldest(h.deps);
    const report = h.spool.readReport(job.id);
    expect(report?.verdict).toBe('FAIL');
    expect(report?.detail).toMatch(/port stuck/);
    expect(h.spool.running()).toHaveLength(0);
  });
});

describe('runJob — gate', () => {
  it('builds in the worktree, then runs verify-gate with the shared world state', async () => {
    const h = harness();
    const job = deposit(h, 'gate', ['--attempt=2']);
    await runJob(h.deps, job);
    expect(h.commands[0]).toMatchObject({ cmd: 'git', args: ['fetch', '--quiet', 'origin', 'main'], cwd: h.worktree });
    expect(h.commands[1]).toMatchObject({ cmd: 'npm', args: ['run', 'build'], cwd: h.worktree });
    expect(h.commands[2]).toMatchObject({
      cmd: 'node',
      args: ['scripts/verify-gate.js', '--attempt=2'],
      cwd: h.worktree,
    });
    expect(h.commands[2].env?.E2E_WORLD_STATE_DIR).toBe(h.paths.world);
    expect(h.gatewayStarts).toEqual([h.worktree]);
    expect(h.gatewayStops).toBe(1);
  });

  it('maps verify-gate exit codes: 0 PASS, 2 BLOCKED, else FAIL', async () => {
    for (const [code, verdict] of [
      [0, 'PASS'],
      [2, 'BLOCKED'],
      [1, 'FAIL'],
    ] as const) {
      const h = harness();
      const job = deposit(h);
      h.exitCodes = [0, 0, code]; // fetch, build, body
      expect((await runJob(h.deps, job)).verdict).toBe(verdict);
    }
  });

  it('ignores a failed origin/main fetch — offline, the gate falls back on its own', async () => {
    const h = harness();
    const job = deposit(h);
    h.exitCodes = [128]; // fetch fails, everything after defaults to 0
    expect((await runJob(h.deps, job)).verdict).toBe('PASS');
  });

  it('fails without starting a gateway when the build fails', async () => {
    const h = harness();
    const job = deposit(h);
    h.exitCodes = [0, 1]; // fetch ok, build fails
    const report = await runJob(h.deps, job);
    expect(report.verdict).toBe('FAIL');
    expect(report.detail).toMatch(/npm run build failed/);
    expect(h.gatewayStarts).toHaveLength(0);
  });

  it('reports ENVIRONMENT when the gateway never becomes ready', async () => {
    const h = harness();
    const job = deposit(h);
    h.gatewayFails = true;
    const report = await runJob(h.deps, job);
    expect(report.verdict).toBe('ENVIRONMENT');
    expect(report.detail).toMatch(/never became ready/);
  });

  it('reports ABANDONED when the worktree vanished from disk', async () => {
    const h = harness();
    const job = deposit(h);
    fs.rmSync(h.worktree, { recursive: true, force: true });
    const report = await runJob(h.deps, job);
    expect(report.verdict).toBe('ABANDONED');
    expect(h.commands).toHaveLength(0);
  });

  it('refuses a gate on a dirty tree: DIRTY, nothing built, no gateway, no attestation', async () => {
    const h = harness();
    const job = deposit(h);
    h.clean = false;
    await processOldest(h.deps);
    expect(h.spool.readReport(job.id)?.verdict).toBe('DIRTY');
    expect(h.spool.readReport(job.id)?.detail).toMatch(/commit first/);
    expect(h.commands).toHaveLength(0);
    expect(h.gatewayStarts).toHaveLength(0);
    expect(listVerdicts(h.paths)).toHaveLength(0);
  });

  it('runs a live job on a dirty tree — only gate attests a sha', async () => {
    const h = harness();
    const job = deposit(h, 'live');
    h.clean = false;
    await processOldest(h.deps);
    expect(h.spool.readReport(job.id)?.verdict).toBe('PASS');
  });

  it('downgrades a PASS to STALE when the tree moved, keeping the body verdict visible', async () => {
    const h = harness();
    const job = deposit(h);
    h.hashes = ['h2', 'h2']; // differs from the h1 taken at deposit
    const report = await runJob(h.deps, job);
    expect(report.verdict).toBe('STALE');
    expect(report.bodyVerdict).toBe('PASS');
    expect(report.targetMoved).toBe(true);
    expect(report.detail).toMatch(/tree changed between deposit/);
  });

  it('marks the target moved on a FAIL too, without renaming the verdict', async () => {
    const h = harness();
    const job = deposit(h);
    h.hashes = ['h2', 'h3'];
    h.exitCodes = [0, 0, 1];
    const report = await runJob(h.deps, job);
    expect(report.verdict).toBe('FAIL');
    expect(report.targetMoved).toBe(true);
  });
});

describe('runJob — live and lease', () => {
  it('drives dist/e2e/run.js for a live job', async () => {
    const h = harness();
    const job = deposit(h, 'live', ['--flows=login-spine']);
    const report = await runJob(h.deps, job);
    expect(h.commands[2]).toMatchObject({ cmd: 'node', args: ['dist/e2e/run.js', '--flows=login-spine'] });
    expect(report.verdict).toBe('PASS');
  });

  it('lease: reports LEASED early, holds, and releases on the session\'s marker', async () => {
    const h = harness();
    const job = deposit(h, 'lease');
    let early: ReturnType<Spool['readReport']> = null;
    h.deps.sleep = async () => {
      // First hold cycle: the early report must already be on disk — it is what the
      // waiting session unblocked on. Then the session asks for release.
      early = early ?? h.spool.readReport(job.id);
      h.spool.requestRelease(job.id);
    };
    const report = await runJob(h.deps, job);
    expect(early).toMatchObject({ verdict: 'LEASED', port: 8080 });
    expect((early as unknown as { leaseUntil?: string }).leaseUntil).toBeDefined();
    expect(report.detail).toMatch(/lease released by the session/);
    expect(h.gatewayStops).toBe(1);
  });

  it('runs a job deposited without --wait even though nobody is waiting (pid 0)', async () => {
    const h = harness();
    const job = h.spool.submit(
      {
        type: 'gate',
        worktree: h.worktree,
        branch: 'fix/x',
        fingerprint: { head: `head-of-${path.basename(h.worktree)}`, hash: 'h1', clean: true },
        submitter: { pid: 0 },
        args: [],
      },
      h.clock.nowMs,
    );
    h.submitterAlive = false;
    await processOldest(h.deps);
    expect(h.spool.readReport(job.id)?.verdict).toBe('PASS');
  });

  it('reports honestly when the end-of-run fingerprint cannot be taken', async () => {
    const h = harness();
    const job = deposit(h);
    let calls = 0;
    h.deps.fingerprint = wt => {
      if (++calls === 2) throw new Error('worktree vanished mid-fingerprint');
      return { head: `head-of-${path.basename(wt)}`, hash: 'h1', clean: true };
    };
    const report = await runJob(h.deps, job);
    expect(report.targetMoved).toBe(true);
    expect(report.verdict).toBe('STALE');
    expect(report.detail).toMatch(/could not re-fingerprint at end/);
  });

  it('lease: expires on its own when the session outlives it', async () => {
    const h = harness();
    const job = deposit(h, 'lease');
    // now() advances 10 ms per call; a 1-minute lease expires after enough hold cycles.
    const report = await runJob(h.deps, job);
    expect(report.detail).toMatch(/lease expired/);
  });
});

describe('the real command runner and deps', () => {
  it('realRunCommand resolves to the exit code and appends output to the log', async () => {
    const logFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-run-')), 'job.log');
    const code = await realRunCommand('node', ['-e', 'process.stdout.write("hi"); process.exit(3)'], {
      cwd: process.cwd(),
      logFile,
    });
    expect(code).toBe(3);
    expect(fs.readFileSync(logFile, 'utf8')).toContain('hi');
  });

  it('realRunCommand resolves 1 when the command cannot even start', async () => {
    const logFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-run-')), 'job.log');
    expect(await realRunCommand('/definitely/not/a/binary', [], { cwd: process.cwd(), logFile })).toBe(1);
  });

  it('realWorkerDeps wires the production pieces', async () => {
    const paths = benchPaths(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-real-')));
    ensureLayout(paths);
    const deps = realWorkerDeps(paths);
    expect(deps.port).toBe(8080);
    expect(typeof deps.now()).toBe('number');
    await deps.sleep(1);
    deps.log('smoke'); // writes to stdout; must not throw
    // An unused high port: the real clearPort runs `ss`, finds nothing, returns.
    await expect(deps.gateway.clearPort(65_001)).resolves.toBeUndefined();
  });
});

describe('workerLoop and main', () => {
  it('processes a job then idles, and survives a loop-level error', async () => {
    const h = harness();
    deposit(h);
    let calls = 0;
    const originalQueued = h.spool.queued.bind(h.spool);
    h.spool.queued = () => {
      calls++;
      if (calls === 2) throw new Error('transient fs error');
      return originalQueued();
    };
    await workerLoop(h.deps, 3);
    expect(h.logs.some(l => l.includes('transient fs error'))).toBe(true);
    expect(h.logs.some(l => l.includes('finished'))).toBe(true);
  });

  it('publishes pending statuses from the loop', async () => {
    const h = harness();
    deposit(h);
    await workerLoop(h.deps, 2);
    expect(h.published).toEqual([`head-of-${path.basename(h.worktree)}`]);
  });

  it('main registers the worker, heartbeats, recovers, and clears the port before looping', async () => {
    const h = harness();
    deposit(h);
    h.spool.claim(h.spool.queued()[0].file); // simulate a job cut by a crash
    let cleared = 0;
    h.deps.gateway.clearPort = async () => void cleared++;
    await main(h.deps, 0);
    expect(readWorkerInfo(h.paths)?.pid).toBe(process.pid);
    expect(fs.existsSync(h.paths.heartbeat)).toBe(true);
    expect(h.spool.running()).toHaveLength(0); // recovered
    expect(cleared).toBe(1);
  });
});
