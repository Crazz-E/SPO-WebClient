/**
 * The bench worker — the single owner of the live test bench.
 *
 * One permanent process (systemd --user, Restart=always). It owns the gateway port, the
 * LOCKED accounts and the world state, and executes queued jobs strictly one at a time,
 * oldest first. Serialization is not a rule anyone follows — it is the shape of this
 * loop: one worker, one job.
 *
 * Sessions never start a gateway, never kill a process, never hold a lock. They deposit
 * a request (cli.ts submit) and wait for a report (cli.ts wait). Everything here runs
 * IN the depositing session's worktree: the worker builds it, starts its gateway, and
 * drives the gate against that exact tree — uncommitted changes included.
 */

import { execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { toErrorMessage } from '../../shared/error-utils';
import {
  BENCH_PORT,
  benchPaths,
  ensureLayout,
  HEARTBEAT_PERIOD_MS,
  processAlive,
  touchHeartbeat,
  writeWorkerInfo,
  type BenchPaths,
} from './paths';
import { fingerprintTree, resolveRef, type TreeFingerprint } from './fingerprint';
import { Spool, type JobReport, type JobRequest, type JobType, type JobVerdict } from './job';
import { lookupReceipt, pruneReceipts, RECEIPT_MAX_AGE_MS } from './receipt';
import { clearPort, realGatewayDeps, startGateway, type RunningGateway } from './gateway';
import { ghStatusPublisher, publishPendingStatuses, writeVerdict, type StatusPublisher } from './verdict';

export interface RunCommandOptions {
  cwd: string;
  env?: Record<string, string>;
  logFile: string;
}

export interface WorkerDeps {
  paths: BenchPaths;
  spool: Spool;
  port: number;
  fingerprint: (worktree: string) => TreeFingerprint;
  /** The sha a ref points at, or undefined when it does not exist in that worktree. */
  resolveRef: (worktree: string, ref: string) => string | undefined;
  /** Run a command to completion, appending output to logFile; resolves to the exit code. */
  runCommand: (cmd: string, args: string[], options: RunCommandOptions) => Promise<number>;
  gateway: {
    clearPort: (port: number) => Promise<void>;
    start: (worktree: string, port: number, logFile: string) => Promise<RunningGateway>;
  };
  publishStatus: StatusPublisher;
  processAlive: (pid: number) => boolean;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
}

const DONE_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LEASE_MINUTES = 30;
const MAX_LEASE_MINUTES = 120;

/**
 * What each job type needs built — and nothing more.
 *
 * The bench is the machine's one serialised resource: every second spent compiling
 * something the job never loads is a second every other session waits for. So the build
 * follows the body, not the habit.
 *
 * - `gate` — the gateway alone. The L2 drive is a headless `ws` client that never opens a
 *   page, and the gateway starts happily without the Vite bundle (`server.ts:90-98` falls
 *   back and logs it). `verify-gate.js` compiles the e2e driver itself (`build:e2e`).
 * - `live` — the gateway **and** the e2e driver. This branch runs `dist/e2e/run.js`
 *   directly; nothing else in the job compiles it, so it is built here rather than assumed
 *   to be left over from some earlier run.
 * - `lease` — everything. It serves a real browser, so the client bundle and the
 *   terrain-test are exactly what the session came for.
 *
 * What is given up: the full build also happened to prove the client still compiles. CI
 * replays that same `npm run build` on every pull request, so the proof is not lost — it
 * just no longer occupies the bench.
 */
const BUILD_STEPS: Record<JobType, string[]> = {
  gate: ['build:server'],
  live: ['build:server', 'build:e2e'],
  lease: ['build'],
};

/**
 * Jobs found in running/ at startup were cut mid-flight by a worker death. They are
 * reported INTERRUPTED, never silently re-run: the body may have half-executed against
 * the live world, and the session should look before resubmitting.
 */
export function recoverInterrupted(deps: WorkerDeps): void {
  for (const { file, request } of deps.spool.running()) {
    deps.log(`recovering interrupted job ${request.id}`);
    deps.spool.writeReport({
      id: request.id,
      type: request.type,
      worktree: request.worktree,
      branch: request.branch,
      verdict: 'INTERRUPTED',
      fingerprints: { atSubmit: request.fingerprint },
      targetMoved: false,
      startedAt: request.submittedAt,
      finishedAt: new Date(deps.now()).toISOString(),
      detail:
        'the worker died while this job was executing; the body may have partially run — ' +
        'check the world lock before resubmitting',
    });
    deps.spool.finish(file);
  }
}

/**
 * One pass over the queue: take the oldest deposit, execute it, report. Returns false
 * when the queue was empty. A deposit whose session has died is reported ABANDONED
 * without running anything — the queue cleans itself.
 */
export async function processOldest(deps: WorkerDeps): Promise<boolean> {
  const oldest = deps.spool.queued()[0];
  if (!oldest) return false;

  const { request } = oldest;
  // pid 0 = deposited without --wait: nobody to watch, the job runs regardless.
  if (request.submitter.pid > 0 && !deps.processAlive(request.submitter.pid)) {
    deps.log(`abandoning ${request.id} — submitter pid ${request.submitter.pid} is gone`);
    deps.spool.writeReport({
      id: request.id,
      type: request.type,
      worktree: request.worktree,
      branch: request.branch,
      verdict: 'ABANDONED',
      fingerprints: { atSubmit: request.fingerprint },
      targetMoved: false,
      startedAt: new Date(deps.now()).toISOString(),
      finishedAt: new Date(deps.now()).toISOString(),
      detail: `the depositing session (pid ${request.submitter.pid}) died before the job started; nothing ran`,
    });
    deps.spool.discard(oldest.file);
    return true;
  }

  const runningFile = deps.spool.claim(oldest.file);
  deps.log(`running ${request.id} (${request.type}) for ${request.worktree} [${request.branch}]`);
  let report: JobReport;
  try {
    report = await runJob(deps, request);
  } catch (err: unknown) {
    report = {
      id: request.id,
      type: request.type,
      worktree: request.worktree,
      branch: request.branch,
      verdict: 'FAIL',
      fingerprints: { atSubmit: request.fingerprint },
      targetMoved: false,
      startedAt: new Date(deps.now()).toISOString(),
      finishedAt: new Date(deps.now()).toISOString(),
      detail: `worker error: ${toErrorMessage(err)}`,
    };
  }
  deps.spool.writeReport(report);

  // DIRTY ran nothing and attests nothing: the sha is neither passed nor failed, and an
  // earlier clean attestation of the same sha stays valid.
  if (request.type === 'gate' && report.verdict !== 'DIRTY') {
    const head =
      report.fingerprints.atEnd?.head ?? report.fingerprints.atStart?.head ?? request.fingerprint.head;
    writeVerdict(deps.paths, {
      head,
      branch: request.branch,
      worktree: request.worktree,
      verdict: report.verdict,
      fingerprintStable: !report.targetMoved,
      baseMain: report.baseMain,
      jobId: request.id,
      createdAt: new Date(deps.now()).toISOString(),
      exceptions: countCapabilityExceptions(report.gateArtifact),
    });
  }

  deps.spool.finish(runningFile);
  deps.log(`finished ${request.id}: ${report.verdict}`);
  return true;
}

/** How many capability exceptions the gate artifact carries; 0 when unreadable or absent. */
export function countCapabilityExceptions(artifactPath: string | undefined): number {
  if (!artifactPath) return 0;
  try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as {
      exclusions?: { capability?: unknown[] };
    };
    return artifact.exclusions?.capability?.length ?? 0;
  } catch {
    return 0;
  }
}

export async function runJob(deps: WorkerDeps, request: JobRequest): Promise<JobReport> {
  const logFile = path.join(deps.paths.done, `${request.id}.log`);
  const report: JobReport = {
    id: request.id,
    type: request.type,
    worktree: request.worktree,
    branch: request.branch,
    verdict: 'FAIL',
    fingerprints: { atSubmit: request.fingerprint },
    targetMoved: false,
    startedAt: new Date(deps.now()).toISOString(),
    logFile,
  };
  const finish = (verdict: JobVerdict, detail: string): JobReport => {
    report.verdict = verdict;
    report.detail = detail;
    report.finishedAt = new Date(deps.now()).toISOString();
    return report;
  };

  if (!fs.existsSync(request.worktree)) {
    return finish('ABANDONED', 'the worktree no longer exists on disk; nothing ran');
  }

  // A clean bench before anything else: nothing may listen on the port. Safe because
  // only the worker ever starts a gateway there.
  await deps.gateway.clearPort(deps.port);

  try {
    report.fingerprints.atStart = deps.fingerprint(request.worktree);
  } catch (err: unknown) {
    return finish('FAIL', `could not fingerprint the worktree: ${toErrorMessage(err)}`);
  }

  // A gate attests HEAD by sha. If the tree on disk is not that commit, whatever passes
  // is not what the sha holds — refuse before spending a build or a live slot on it.
  if (request.type === 'gate' && !report.fingerprints.atStart.clean) {
    return finish(
      'DIRTY',
      'the worktree has uncommitted or untracked changes; a gate attests HEAD by sha, so ' +
        'the tested tree must be exactly that commit — commit first, then resubmit',
    );
  }

  // Refresh origin/main so verify-gate judges the branch against the real main, not a
  // lagging local one. Best-effort: offline, the gate falls back on its own.
  await deps.runCommand('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: request.worktree, logFile });

  // Which `main` this run stands on. The ruleset no longer forces the branch to be up to
  // date, so nothing else records the base — without this the attestation could not say
  // whether `main` had moved past it. Read AFTER the fetch, so it is the real remote tip.
  report.baseMain = deps.resolveRef(request.worktree, 'origin/main');

  // The worker always builds what the body will load — a stale dist/ would run
  // yesterday's code and produce a silently wrong PASS, which is the exact failure this
  // bench exists to prevent. Which targets, per job type: BUILD_STEPS.
  for (const step of BUILD_STEPS[request.type]) {
    const buildCode = await deps.runCommand('npm', ['run', step], { cwd: request.worktree, logFile });
    if (buildCode !== 0) {
      return finish('FAIL', `npm run ${step} failed in the worktree — see ${logFile}`);
    }
  }

  let gateway: RunningGateway;
  try {
    gateway = await deps.gateway.start(request.worktree, deps.port, logFile);
  } catch (err: unknown) {
    return finish('ENVIRONMENT', `gateway never became ready: ${toErrorMessage(err)}`);
  }

  let bodyVerdict: JobVerdict;
  let bodyDetail: string;
  try {
    const env = { E2E_WORLD_STATE_DIR: deps.paths.world };
    if (request.type === 'gate') {
      // The static stage — typecheck, lint, the Jest suite — is exactly what the session
      // already ran in `gate:precheck`. If it left a receipt for THIS tree, replaying it
      // inside the exclusive bench buys nothing but ~113 s of everyone else's queue.
      // The tree is the one the worker fingerprinted itself at :atStart, never a value
      // the session supplied — a receipt for any other tree is simply never opened.
      const found = lookupReceipt(
        deps.paths,
        report.fingerprints.atStart,
        request.worktree,
        deps.now(),
      );
      report.staticReceipt = { used: found.ok, ...(found.ok ? {} : { why: found.why }) };
      deps.log(
        found.ok
          ? `static stage from the precheck receipt (${found.file})`
          : `replaying the static stage — ${found.why}`,
      );
      const args = found.ok ? ['--skip-static', ...request.args] : request.args;
      const code = await deps.runCommand('node', ['scripts/verify-gate.js', ...args], {
        cwd: request.worktree,
        env,
        logFile,
      });
      bodyVerdict = code === 0 ? 'PASS' : code === 2 ? 'BLOCKED' : 'FAIL';
      bodyDetail = `verify-gate exited ${code}`;
      report.gateArtifact = path.join(
        request.worktree,
        'report',
        'e2e',
        `gate-${report.fingerprints.atStart.head}.json`,
      );
    } else if (request.type === 'live') {
      const code = await deps.runCommand('node', ['dist/e2e/run.js', ...request.args], {
        cwd: request.worktree,
        env,
        logFile,
      });
      bodyVerdict = code === 0 ? 'PASS' : 'FAIL';
      bodyDetail = `live drive exited ${code}`;
    } else {
      // Lease: the report is written EARLY — it is what the waiting session unblocks on.
      // Then the worker holds the bench until the lease expires or the session releases it
      // (`npm run dev:release` drops a marker). No pid watching here: the waiting CLI exits
      // the moment the report lands, and a session has no longer-lived pid to offer.
      const minutes = Math.min(request.leaseMinutes ?? DEFAULT_LEASE_MINUTES, MAX_LEASE_MINUTES);
      const until = deps.now() + minutes * 60_000;
      report.verdict = 'LEASED';
      report.port = deps.port;
      report.leaseUntil = new Date(until).toISOString();
      report.detail =
        `gateway from this worktree is ready on port ${deps.port} until ${report.leaseUntil} ` +
        `— release early with: npm run dev:release`;
      deps.spool.writeReport(report);
      while (deps.now() < until && !deps.spool.releaseRequested(request.id)) {
        await deps.sleep(5_000);
      }
      bodyVerdict = 'LEASED';
      bodyDetail = deps.spool.releaseRequested(request.id)
        ? 'lease released by the session'
        : 'lease expired';
    }
  } finally {
    await gateway.stop();
  }

  if (request.type !== 'lease') {
    try {
      report.fingerprints.atEnd = deps.fingerprint(request.worktree);
    } catch (err: unknown) {
      report.fingerprints.atEnd = undefined;
      bodyDetail += `; could not re-fingerprint at end (${toErrorMessage(err)})`;
    }
    const stable =
      report.fingerprints.atEnd !== undefined &&
      request.fingerprint.hash === report.fingerprints.atStart?.hash &&
      report.fingerprints.atStart.hash === report.fingerprints.atEnd.hash;
    report.targetMoved = !stable;
    if (report.targetMoved && bodyVerdict === 'PASS') {
      report.bodyVerdict = bodyVerdict;
      return finish(
        'STALE',
        `the tree changed between deposit and the end of the run — the ${bodyVerdict} below ` +
          `applies to a tree that no longer exists; resubmit (${bodyDetail})`,
      );
    }
  }

  return finish(bodyVerdict, bodyDetail);
}

/**
 * The loop. `maxTicks` exists for tests; production passes Infinity and never returns.
 */
export async function workerLoop(deps: WorkerDeps, maxTicks: number = Infinity): Promise<void> {
  let lastPublish = 0;
  for (let tick = 0; tick < maxTicks; tick++) {
    try {
      const worked = await processOldest(deps);
      deps.spool.purgeDone(DONE_RETENTION_MS, deps.now());
      pruneReceipts(deps.paths, RECEIPT_MAX_AGE_MS, deps.now());
      if (deps.now() - lastPublish > 30_000) {
        lastPublish = deps.now();
        publishPendingStatuses(deps.paths, deps.publishStatus, deps.log, deps.now());
      }
      if (!worked) await deps.sleep(2_000);
    } catch (err: unknown) {
      deps.log(`worker loop error: ${toErrorMessage(err)}`);
      await deps.sleep(2_000);
    }
  }
}

export function realRunCommand(
  cmd: string,
  args: string[],
  options: RunCommandOptions,
): Promise<number> {
  return new Promise(resolve => {
    const out = fs.openSync(options.logFile, 'a');
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', out, out],
    });
    // A spawn failure (ENOENT) emits 'error' and then 'close' — settle exactly once.
    let settled = false;
    const settle = (code: number): void => {
      if (settled) return;
      settled = true;
      fs.closeSync(out);
      resolve(code);
    };
    child.on('close', code => settle(code ?? 1));
    child.on('error', () => settle(1));
  });
}

export function realWorkerDeps(paths: BenchPaths): WorkerDeps {
  const gatewayDeps = realGatewayDeps();
  return {
    paths,
    spool: new Spool(paths),
    port: BENCH_PORT,
    fingerprint: fingerprintTree,
    resolveRef,
    runCommand: realRunCommand,
    gateway: {
      clearPort: port => clearPort(port, gatewayDeps),
      start: (worktree, port, logFile) => startGateway(worktree, port, logFile, gatewayDeps),
    },
    publishStatus: ghStatusPublisher((cmd, args, cwd) => {
      execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    }),
    processAlive,
    now: () => Date.now(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    log: line => process.stdout.write(`[bench] ${new Date().toISOString()} ${line}\n`),
  };
}

export async function main(deps?: WorkerDeps, maxTicks: number = Infinity): Promise<void> {
  const paths = deps?.paths ?? benchPaths();
  ensureLayout(paths);
  const resolved = deps ?? realWorkerDeps(paths);

  writeWorkerInfo(paths, {
    pid: process.pid,
    startedAt: new Date(resolved.now()).toISOString(),
    repo: process.cwd(),
    port: resolved.port,
  });
  touchHeartbeat(paths);
  // The heartbeat must keep beating through a long build or live drive, so it rides its
  // own timer, not the loop. unref() keeps it from holding a test process open.
  const beat = setInterval(() => touchHeartbeat(paths), HEARTBEAT_PERIOD_MS);
  beat.unref();

  recoverInterrupted(resolved);
  await resolved.gateway.clearPort(resolved.port);
  resolved.log(`bench worker up — pid ${process.pid}, port ${resolved.port}, root ${paths.root}`);
  try {
    await workerLoop(resolved, maxTicks);
  } finally {
    clearInterval(beat);
  }
}

/* istanbul ignore next -- the systemd entry point; everything it calls is tested above */
if (require.main === module) {
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
  main().catch((err: unknown) => {
    process.stderr.write(`bench worker crashed: ${toErrorMessage(err)}\n`);
    process.exit(1);
  });
}
