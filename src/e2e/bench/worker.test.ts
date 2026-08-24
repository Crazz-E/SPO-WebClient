import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { benchPaths, ensureLayout, readWorkerInfo, type BenchPaths } from './paths';
import { Spool, type JobRequest } from './job';
import { listVerdicts } from './verdict';
import { readNightlyResult } from './nightly';
import { buildReceipt, writeReceipt } from './receipt';
import { type GatewayDeps } from './gateway';
import {
  countCapabilityExceptions,
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
  /** The environment each gateway start was handed, in start order. */
  gatewayEnvs: Record<string, string>[];
  gatewayStops: number;
  logs: string[];
  submitterAlive: boolean;
  /** Successive fingerprint hashes; the last one repeats. */
  hashes: string[];
  /** What every fingerprint reports for `clean`. */
  clean: boolean;
  /** What `origin/main` resolves to in the worktree; undefined = the ref does not exist. */
  baseMain: string | undefined;
  published: string[];
  gatewayFails: boolean;
  /** What the owner lease answers when a job asks whether it may take the bench. */
  leaseDecision: { ok: boolean; why?: string };
  /** What CI is said to have concluded for the sha under test. See ./ci-proof. */
  ciProof: { proven: boolean; why?: string };
  /** How many times the loop asked the merge queue for work. */
  queueServed: number;
  /** What resolveRef answers for refs other than origin/main (e.g. `HEAD^{tree}`). */
  trees: Record<string, string | undefined>;
  /** The step name prepareRef reports as failed; null = the fetch worked. */
  prepareRefFails: string | null;
  prepareRefCalls: string[];
  leaseRenewals: number;
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
    gatewayEnvs: [],
    gatewayStops: 0,
    logs: [],
    submitterAlive: true,
    hashes: ['h1'],
    clean: true,
    baseMain: 'main-sha-1',
    published: [],
    gatewayFails: false,
    leaseDecision: { ok: true },
    ciProof: { proven: false, why: 'no CI run for this commit yet' },
    queueServed: 0,
    trees: {},
    prepareRefFails: null,
    prepareRefCalls: [],
    leaseRenewals: 0,
    clock: { nowMs: 1_000_000 },
    deps: {
      paths,
      spool,
      port: 8080,
      fingerprint: wt => {
        const hash = h.hashes[Math.min(fingerprintCalls++, h.hashes.length - 1)];
        return { head: `head-of-${path.basename(wt)}`, hash, clean: h.clean };
      },
      resolveRef: (_wt, ref) => (ref === 'origin/main' ? h.baseMain : h.trees[ref]),
      runCommand: async (cmd, args, options) => {
        h.commands.push({ cmd, args, cwd: options.cwd, env: options.env });
        return h.exitCodes.shift() ?? 0;
      },
      gateway: {
        clearPort: async () => {},
        start: async (wt, _port, _logFile, env) => {
          if (h.gatewayFails) throw new Error('phase=caching forever');
          h.gatewayStarts.push(wt);
          h.gatewayEnvs.push(env);
          return { pid: 999, stop: async () => void h.gatewayStops++ };
        },
      },
      publishStatus: (_wt, head) => h.published.push(head),
      ciStaticProof: () => h.ciProof,
      serveMergeQueue: () => (h.queueServed++, 0),
      prepareRef: async ref => {
        h.prepareRefCalls.push(ref);
        // The real one resets a checkout on disk; the harness just makes the directory
        // exist, since everything downstream only asks whether it does.
        fs.mkdirSync(h.worktree, { recursive: true });
        return h.prepareRefFails;
      },
      mayDriveLive: () => h.leaseDecision,
      renewLease: async () => {
        h.leaseRenewals++;
        return { held: h.leaseDecision.ok };
      },
      processAlive: () => h.submitterAlive,
      now: () => (h.clock.nowMs += 10),
      sleep: async () => {},
      log: line => h.logs.push(line),
    },
  };
  return h;
}

/** The `npm run <script>` targets the job asked for, in order. */
function npmRuns(h: Harness): string[] {
  return h.commands.filter(c => c.cmd === 'npm').map(c => c.args[1]);
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

  it('stamps the nightly result INTERRUPTED, so main never reads as proven by a dead job', () => {
    const h = harness();
    const job = deposit(h, 'nightly');
    h.spool.claim(h.spool.queued()[0].file);

    recoverInterrupted(h.deps);

    expect(readNightlyResult(h.paths)).toMatchObject({
      jobId: job.id,
      verdict: 'INTERRUPTED',
      submittedAt: job.submittedAt,
    });
  });

  it('leaves the nightly result alone when the interrupted job was a gate', () => {
    const h = harness();
    deposit(h);
    h.spool.claim(h.spool.queued()[0].file);

    recoverInterrupted(h.deps);

    expect(readNightlyResult(h.paths)).toBeNull();
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

  it('records the origin/main the run was judged against, in the report and the attestation', async () => {
    const h = harness();
    const job = deposit(h);
    await processOldest(h.deps);
    // The base is read AFTER `git fetch origin main`, or it would name a lagging local ref.
    expect(h.commands.some(c => c.cmd === 'git' && c.args[0] === 'fetch')).toBe(true);
    expect(h.spool.readReport(job.id)?.baseMain).toBe('main-sha-1');
    expect(listVerdicts(h.paths)[0].verdict.baseMain).toBe('main-sha-1');
  });

  it('leaves the base absent when origin/main does not resolve — never guesses one', async () => {
    const h = harness();
    h.baseMain = undefined;
    deposit(h);
    await processOldest(h.deps);
    expect(listVerdicts(h.paths)[0].verdict.baseMain).toBeUndefined();
  });

  it('carries the gate artifact\'s capability exceptions into the attestation', async () => {
    const h = harness();
    deposit(h);
    const artifactDir = path.join(h.worktree, 'report', 'e2e');
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactDir, `gate-head-of-${path.basename(h.worktree)}.json`),
      JSON.stringify({ exclusions: { capability: [{ capability: 'president' }] } }),
      'utf8',
    );
    await processOldest(h.deps);
    expect(listVerdicts(h.paths)[0].verdict.exceptions).toBe(1);
  });

  it('counts zero exceptions when the artifact is absent or unreadable', () => {
    expect(countCapabilityExceptions(undefined)).toBe(0);
    expect(countCapabilityExceptions('/nowhere/gate.json')).toBe(0);
    const bad = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-art-')), 'gate.json');
    fs.writeFileSync(bad, '{not json', 'utf8');
    expect(countCapabilityExceptions(bad)).toBe(0);
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
    expect(h.commands[1]).toMatchObject({ cmd: 'npm', args: ['run', 'build:server'], cwd: h.worktree });
    expect(h.commands[2]).toMatchObject({
      cmd: 'node',
      args: ['scripts/verify-gate.js', '--attempt=2'],
      cwd: h.worktree,
    });
    expect(h.commands[2].env?.E2E_WORLD_STATE_DIR).toBe(h.paths.world);
    expect(h.gatewayStarts).toEqual([h.worktree]);
    expect(h.gatewayStops).toBe(1);
  });

  it('points the gateway and the body at the bench-wide asset cache, not the worktree', async () => {
    const h = harness();
    const job = deposit(h, 'gate');
    await runJob(h.deps, job);
    // The gateway is what primes and reads the mirror; without this it would download
    // all ~570 files into a fresh worktree on the bench's exclusive time.
    expect(h.gatewayEnvs).toEqual([
      { E2E_WORLD_STATE_DIR: h.paths.world, SPO_CACHE_DIR: h.paths.cache },
    ]);
    // verify-gate replays the Jest suite when there is no receipt, and tests that read
    // real assets must be pointed at the same mirror or they silently self-skip.
    expect(h.commands[2].env?.SPO_CACHE_DIR).toBe(h.paths.cache);
  });

  it('builds the gateway alone — no client bundle, no terrain-test, for a browserless drive', async () => {
    const h = harness();
    await runJob(h.deps, deposit(h, 'gate'));
    expect(npmRuns(h)).toEqual(['build:server']);
  });

  it('replays the static stage when no receipt covers the tree, and says why', async () => {
    const h = harness();
    await runJob(h.deps, deposit(h, 'gate'));
    const gate = h.commands.find(c => c.cmd === 'node');
    expect(gate?.args).toEqual(['scripts/verify-gate.js']);
    expect(h.logs.join('\n')).toContain('replaying the static stage');
  });

  it('skips the static replay when the precheck receipt matches the tree it fingerprinted', async () => {
    const h = harness();
    const job = deposit(h, 'gate', ['--attempt=2']);
    // The tree the WORKER will fingerprint at atStart — the session's own reading never
    // enters the decision.
    writeReceipt(
      h.paths,
      buildReceipt(
        { head: `head-of-${path.basename(h.worktree)}`, hash: 'h1', clean: true },
        h.worktree,
        'fix/x',
        h.clock.nowMs,
      ),
    );
    const report = await runJob(h.deps, job);

    const gate = h.commands.find(c => c.cmd === 'node');
    expect(gate?.args).toEqual(['scripts/verify-gate.js', '--skip-static', '--attempt=2']);
    expect(report.staticReceipt).toEqual({ used: true });
    expect(h.logs.join('\n')).toContain('static stage from the precheck receipt');
  });

  it('ignores a receipt written for a tree the worker is not holding', async () => {
    const h = harness();
    // The session prechecked h1 and then committed again: the worker now fingerprints h2.
    h.hashes = ['h2'];
    writeReceipt(
      h.paths,
      buildReceipt(
        { head: `head-of-${path.basename(h.worktree)}`, hash: 'h1', clean: true },
        h.worktree,
        'fix/x',
        h.clock.nowMs,
      ),
    );
    const report = await runJob(h.deps, deposit(h, 'gate'));

    expect(h.commands.find(c => c.cmd === 'node')?.args).toEqual(['scripts/verify-gate.js']);
    expect(report.staticReceipt?.used).toBe(false);
    expect(report.staticReceipt?.why).toContain('no readable precheck receipt');
  });

  it('ignores a receipt that has gone past its window', async () => {
    const h = harness();
    writeReceipt(
      h.paths,
      buildReceipt(
        { head: `head-of-${path.basename(h.worktree)}`, hash: 'h1', clean: true },
        h.worktree,
        'fix/x',
        h.clock.nowMs - 3 * 60 * 60 * 1000,
      ),
    );
    const report = await runJob(h.deps, deposit(h, 'gate'));

    expect(h.commands.find(c => c.cmd === 'node')?.args).toEqual(['scripts/verify-gate.js']);
    expect(report.staticReceipt?.why).toContain('min old');
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
    expect(report.detail).toMatch(/npm run build:server failed/);
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

  it('never lets an ENVIRONMENT overwrite a good attestation for the same sha', async () => {
    // The destructive shape this guards: a sha gates PASS, then anything that runs no
    // code — a gateway that will not come up, a lease that cannot be renewed — replaces
    // that attestation and publishes `bench/gate=error` on a commit that genuinely passed.
    const h = harness();
    await processOldest(h.deps);
    deposit(h);
    await processOldest(h.deps);
    expect(listVerdicts(h.paths)[0].verdict.verdict).toBe('PASS');

    h.gatewayFails = true;
    deposit(h);
    await processOldest(h.deps);

    const verdicts = listVerdicts(h.paths);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].verdict.verdict).toBe('PASS');
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

  it('refuses to take the bench without the owner lease, before clearing the port', async () => {
    // The refusal has to land BEFORE clearPort: that call SIGKILLs whatever holds 8080,
    // and on a second host it would be killing the other worker's gateway.
    const h = harness();
    const job = deposit(h);
    let cleared = 0;
    h.deps.gateway.clearPort = async () => void cleared++;
    h.leaseDecision = { ok: false, why: 'BENCH_OWNER has lapsed and could not be renewed' };

    await processOldest(h.deps);

    expect(cleared).toBe(0);

    const report = h.spool.readReport(job.id);
    expect(report?.verdict).toBe('ENVIRONMENT');
    expect(report?.detail).toMatch(/lapsed/);
    expect(h.commands).toHaveLength(0);
    expect(h.gatewayStarts).toHaveLength(0);
    // ENVIRONMENT attests nothing — the sha is neither passed nor failed.
    expect(listVerdicts(h.paths)).toHaveLength(0);
  });

  it('publishes a finished nightly to latest.json and attests nothing', async () => {
    const h = harness();
    const job = deposit(h, 'nightly');

    await processOldest(h.deps);

    expect(readNightlyResult(h.paths)).toMatchObject({
      jobId: job.id,
      verdict: 'PASS',
      submittedAt: job.submittedAt,
      sha: `head-of-${path.basename(h.worktree)}`,
    });
    // A nightly is not a gate: no sha of main may carry an attestation the push hook
    // or a bench/gate commit status could read.
    expect(listVerdicts(h.paths)).toHaveLength(0);
  });

  it('publishes a failing nightly too — red is the case the file exists for', async () => {
    const h = harness();
    deposit(h, 'nightly');
    h.exitCodes = [0, 0, 0, 1]; // fetch, build:server, build:e2e, then the drive fails

    await processOldest(h.deps);

    expect(readNightlyResult(h.paths)).toMatchObject({ verdict: 'FAIL' });
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

describe('runJob — ref: gating a commit the worker fetched', () => {
  /** A ref deposit, shaped the way cli.ts shapes one: the fingerprint names the ref. */
  function depositRef(h: Harness, ref = 'a'.repeat(40)): JobRequest {
    return h.spool.submit(
      {
        type: 'ref',
        worktree: h.worktree,
        branch: ref,
        fingerprint: { head: ref, hash: `ref:${ref}`, clean: true },
        submitter: { pid: 0 },
        args: [],
        ref,
      },
      h.clock.nowMs,
    );
  }

  it('fetches the ref before anything else, then gates it like any other commit', async () => {
    const h = harness();
    const job = depositRef(h);

    await processOldest(h.deps);

    expect(h.prepareRefCalls).toEqual(['a'.repeat(40)]);
    expect(npmRuns(h)).toEqual(['build:server']);
    expect(h.commands.some(c => c.args[0] === 'scripts/verify-gate.js')).toBe(true);
    expect(h.spool.readReport(job.id)?.verdict).toBe('PASS');
  });

  it('is never STALE for a tree it reset itself — a fetched commit cannot move', async () => {
    // The deposit fingerprint names the ref, and the checkout is reset AFTER it; the two
    // can never match. Under the worktree rule that reads as a moving target, which would
    // make every ref job STALE and the whole path useless.
    const h = harness();
    const job = depositRef(h);

    await processOldest(h.deps);

    const report = h.spool.readReport(job.id);
    expect(report?.verdict).toBe('PASS');
    expect(report?.targetMoved).toBe(false);
  });

  it('still catches a tree that moves DURING the run', async () => {
    // The atSubmit half is waived, not the atStart/atEnd half: something rewriting the
    // checkout mid-job is a real fault whatever caused it, and a PASS from it would
    // describe a tree that no longer exists.
    const h = harness();
    h.hashes = ['at-start', 'moved-underneath'];
    const job = depositRef(h);

    await processOldest(h.deps);

    const report = h.spool.readReport(job.id);
    expect(report?.verdict).toBe('STALE');
    expect(report?.bodyVerdict).toBe('PASS');
    expect(listVerdicts(h.paths)[0].verdict.fingerprintStable).toBe(false);
  });

  it('attests where the merge rule reads — a ref job IS the gate now', async () => {
    // Stage B kept this answer in `ref/verdicts/` under a non-required context, so one
    // live exercise could be compared against the session path without either overwriting
    // the other. That comparison ran for real (job-01787603001316-a0c610: PASS on
    // 514bc4e3, `verdicts/` untouched, published as `bench/ref-gate`) and stage C promotes
    // the path. An attestation nobody reads would gate nothing.
    const h = harness();
    depositRef(h);

    await processOldest(h.deps);

    const verdicts = listVerdicts(h.paths);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].verdict).toMatchObject({ verdict: 'PASS', fingerprintStable: true });
  });

  it('publishes it as the required context', async () => {
    const h = harness();
    depositRef(h);
    await processOldest(h.deps);

    await workerLoop(h.deps, 1, async () => false);

    expect(h.published).toHaveLength(1);
  });

  it('skips the static stage when CI proved this exact sha, and says who proved it', async () => {
    const h = harness();
    h.ciProof = { proven: true };
    const job = depositRef(h);

    await processOldest(h.deps);

    const verify = h.commands.find(c => c.args[0] === 'scripts/verify-gate.js');
    expect(verify?.args).toContain('--skip-static');
    // The artifact must name its witness. Recording CI as RECEIPT would make two different
    // authorities indistinguishable in the one file a human reads afterwards.
    expect(verify?.args).toContain('--static-from=ci');
    expect(h.spool.readReport(job.id)?.staticReceipt).toEqual({ used: true });
    expect(h.logs.join('\n')).toMatch(/static stage from CI/);
  });

  it('replays the static stage when CI has not proved the sha — and says why', async () => {
    // The hole the receipt could not see: a gate may run BEFORE the pull request exists,
    // and two of ci.yml's steps only run on pull_request events. "CI is required for the
    // merge" is true at merge time and says nothing about now.
    const h = harness();
    h.ciProof = { proven: false, why: 'no "typecheck + tests" run exists for this commit yet' };
    const job = depositRef(h);

    await processOldest(h.deps);

    const verify = h.commands.find(c => c.args[0] === 'scripts/verify-gate.js');
    expect(verify?.args).not.toContain('--skip-static');
    expect(h.spool.readReport(job.id)?.staticReceipt).toEqual({
      used: false,
      why: expect.stringContaining('no "typecheck + tests" run'),
    });
  });

  it('never reads a session receipt for a ref job — the sha has a better witness', async () => {
    // A receipt is written by the session, for a tree. A pushed commit has CI's answer on
    // the sha itself, produced by a machine the session does not control.
    const h = harness();
    h.ciProof = { proven: false, why: 'still queued' };
    writeReceipt(
      h.paths,
      buildReceipt({ head: 'a'.repeat(40), hash: 'h1', clean: true }, h.worktree, 'main', h.clock.nowMs),
    );
    depositRef(h);

    await processOldest(h.deps);

    expect(h.commands.find(c => c.args[0] === 'scripts/verify-gate.js')?.args).not.toContain('--skip-static');
  });

  it('reports ENVIRONMENT when the ref cannot be fetched, and builds nothing', async () => {
    const h = harness();
    const job = depositRef(h, 'deadbeef');
    h.prepareRefFails = 'git reset --hard deadbeef';

    await processOldest(h.deps);

    const report = h.spool.readReport(job.id);
    expect(report?.verdict).toBe('ENVIRONMENT');
    expect(report?.detail).toMatch(/git reset --hard deadbeef/);
    expect(h.commands).toHaveLength(0);
    // Nothing was learned about the commit, so nothing is attested about it either.
    expect(listVerdicts(h.paths)).toHaveLength(0);
  });
});

describe('runJob — nightly', () => {
  it('builds and drives exactly what a live job does — it is a live drive against main', async () => {
    const h = harness();
    const job = deposit(h, 'nightly');

    const report = await runJob(h.deps, job);

    expect(npmRuns(h)).toEqual(['build:server', 'build:e2e']);
    expect(h.commands[3]).toMatchObject({ cmd: 'node', args: ['dist/e2e/run.js'] });
    expect(report.verdict).toBe('PASS');
  });
});

describe('runJob — live and lease', () => {
  it('drives dist/e2e/run.js for a live job, having compiled it rather than assumed it', async () => {
    const h = harness();
    const job = deposit(h, 'live', ['--flows=login-spine']);
    const report = await runJob(h.deps, job);
    expect(npmRuns(h)).toEqual(['build:server', 'build:e2e']);
    expect(h.commands[3]).toMatchObject({ cmd: 'node', args: ['dist/e2e/run.js', '--flows=login-spine'] });
    expect(report.verdict).toBe('PASS');
  });

  it('names the step that failed, and stops there — a live job whose driver will not compile', async () => {
    const h = harness();
    const job = deposit(h, 'live');
    h.exitCodes = [0, 0, 1]; // fetch ok, build:server ok, build:e2e fails
    const report = await runJob(h.deps, job);
    expect(report.verdict).toBe('FAIL');
    expect(report.detail).toMatch(/npm run build:e2e failed/);
    expect(h.gatewayStarts).toHaveLength(0);
  });

  it('lease: builds everything — the session it serves opens a real browser', async () => {
    const h = harness();
    await runJob(h.deps, deposit(h, 'lease'));
    expect(npmRuns(h)).toEqual(['build']);
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

  it('realWorkerDeps forwards the job environment to startGateway', async () => {
    const paths = benchPaths(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-real-')));
    ensureLayout(paths);
    const spawned: { cwd: string; env: Record<string, string> }[] = [];
    // A fake machine, so the wiring is exercised without a gateway being spawned.
    const gatewayDeps: GatewayDeps = {
      execFile: () => '',
      spawnProcess: ((_cmd: string, _args: string[], opts: { cwd: string; env: Record<string, string> }) => {
        spawned.push({ cwd: opts.cwd, env: opts.env });
        return { pid: 4242, unref: () => {} };
      }) as unknown as GatewayDeps['spawnProcess'],
      fetchImpl: (async () => ({ ok: true, text: async () => 'data: {"phase":"ready"}\n\n' }) as Response) as typeof fetch,
      sleep: async () => {},
      kill: () => {},
    };
    const deps = realWorkerDeps(paths, gatewayDeps);

    const logFile = path.join(paths.done, 'wiring.log');
    const gateway = await deps.gateway.start('/wt/a', 8080, logFile, { SPO_CACHE_DIR: paths.cache });

    expect(gateway.pid).toBe(4242);
    expect(spawned[0].cwd).toBe('/wt/a');
    expect(spawned[0].env.SPO_CACHE_DIR).toBe(paths.cache);
    expect(spawned[0].env.PORT).toBe('8080');
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

  it('offers the bench to the nightly only when the queue came back empty', async () => {
    const h = harness();
    deposit(h);
    const offered: boolean[] = [];

    // Tick 1 runs the job (worked -> no offer); tick 2 finds nothing left.
    await workerLoop(h.deps, 2, async () => {
      offered.push(true);
      return false;
    });

    expect(offered).toEqual([true]);
  });

  it('carries the real nightly by default — an idle loop deposits one when it is due', async () => {
    const h = harness();
    // 03:00 UTC: inside the window, whatever the machine's timezone.
    h.clock.nowMs = Date.UTC(2026, 7, 25, 3, 0, 0);
    h.exitCodes = [1]; // the clone fails, so nothing touches the network or the disk

    await workerLoop(h.deps, 1);

    expect(readNightlyResult(h.paths)).toMatchObject({ verdict: 'ENVIRONMENT' });
    expect(h.commands[0]).toMatchObject({ cmd: 'git', args: expect.arrayContaining(['clone']) });
  });

  it('leaves the nightly alone at an hour a session might be waiting', async () => {
    const h = harness();
    h.clock.nowMs = Date.UTC(2026, 7, 25, 12, 0, 0);

    await workerLoop(h.deps, 1);

    expect(readNightlyResult(h.paths)).toBeNull();
    expect(h.commands).toEqual([]);
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

  it('main takes the owner lease before it looks at the queue', async () => {
    // A worker that claims a job before it holds the lease has already taken the bench
    // by the time it asks whether it may — the order is the guarantee, not the check.
    const h = harness();
    await main(h.deps, 0);
    expect(h.leaseRenewals).toBe(1);
  });

  it('main says so, loudly, when it cannot hold the lease', async () => {
    const h = harness();
    h.leaseDecision = { ok: false, why: 'laptop (pid 77) holds the bench' };
    await main(h.deps, 0);
    expect(h.logs.join('\n')).toMatch(/bench lease NOT held/);
  });
});

describe('the merge queue takes the bench first', () => {
  it('serves the queue only on an idle tick, never over a waiting job', async () => {
    // An entry jumps the spool once deposited, but the pass that deposits it must not run
    // while something is mid-flight — otherwise "jumping the line" becomes "interrupting".
    const h = harness();
    deposit(h);
    await workerLoop(h.deps, 1, async () => false);
    expect(h.queueServed).toBe(0);

    await workerLoop(h.deps, 1, async () => false);
    expect(h.queueServed).toBe(1);
  });

  it('takes a queue entry ahead of an older ordinary deposit', async () => {
    // The whole point of the priority: a lease measured at up to 33 min would otherwise
    // eject a healthy branch on the queue's check-response timeout.
    const h = harness();
    const ordinary = deposit(h);
    const entry = h.spool.submit(
      {
        type: 'ref',
        worktree: h.worktree,
        branch: 'gh-readonly-queue/main/pr-1-abc',
        fingerprint: { head: 'q'.repeat(40), hash: 'ref:q', clean: true },
        submitter: { pid: 0 },
        args: [],
        ref: 'q'.repeat(40),
        queueEntry: true,
      },
      h.clock.nowMs + 1000, // deposited LATER than the ordinary job
    );

    await processOldest(h.deps);

    expect(h.spool.readReport(entry.id)?.verdict).toBe('PASS');
    expect(h.spool.readReport(ordinary.id)).toBeNull(); // still waiting its turn
  });

  it('records the tree a ref job drove, so the queue can skip an identical one', async () => {
    const h = harness();
    h.trees['HEAD^{tree}'] = 'tree-abc';
    h.spool.submit(
      {
        type: 'ref',
        worktree: h.worktree,
        branch: 'x',
        fingerprint: { head: 'r'.repeat(40), hash: 'ref:r', clean: true },
        submitter: { pid: 0 },
        args: [],
        ref: 'r'.repeat(40),
      },
      h.clock.nowMs,
    );

    await processOldest(h.deps);

    expect(listVerdicts(h.paths)[0].verdict.tree).toBe('tree-abc');
  });
});
