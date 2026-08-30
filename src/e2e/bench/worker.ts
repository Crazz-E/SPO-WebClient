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
import { fingerprintTree, resolveRef, runGit, type TreeFingerprint } from './fingerprint';
import { prepareCheckout, type PrepareResult } from './checkout';
import { ciStaticProof, type CiProof } from './ci-proof';
import { serveMergeQueue, type MergeQueueDeps } from './merge-queue';
import { Spool, type JobReport, type JobRequest, type JobType, type JobVerdict } from './job';
import {
  clearPort,
  realGatewayDeps,
  startGateway,
  type GatewayDeps,
  type RunningGateway,
} from './gateway';
import {
  ghStatusPublisher,
  listVerdicts,
  publishPendingStatuses,
  writeVerdictIn,
  type StatusPublisher,
} from './verdict';
import { maybeRunNightly, nightlyResultFromReport, writeNightlyResult } from './nightly';
import {
  ghVariableReader,
  ghVariableWriter,
  localIdentity,
  mayDriveLive,
  newLeaseState,
  renewLease,
  OWNER_RENEW_PERIOD_MS,
  type DriveDecision,
  type OwnerDeps,
  type RenewOutcome,
} from './owner';

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
    start: (
      worktree: string,
      port: number,
      logFile: string,
      env: Record<string, string>,
    ) => Promise<RunningGateway>;
  };
  publishStatus: StatusPublisher;
  /**
   * Bring the worker's own checkout to `ref`, merged with `origin/main` unless `ref`
   * already contains it, ready to build. See ./checkout.
   */
  prepareRef: (ref: string, logFile: string) => Promise<PrepareResult>;
  /** Has CI already proved this sha's static half? See ./ci-proof. */
  ciStaticProof: (sha: string) => CiProof;
  /** One pass over GitHub's merge queue; returns how many entries it acted on. ./merge-queue */
  serveMergeQueue: () => number;
  /** May this worker take the live bench right now? See ./owner. */
  mayDriveLive: (nowMs: number) => DriveDecision;
  /** One owner-lease renewal pass; the loop calls it on a timer. See ./owner. */
  renewLease: (nowMs: number) => Promise<RenewOutcome>;
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
 * - `ref` — the gateway alone. The L2 drive is a headless `ws` client that never opens a
 *   page, and the gateway starts happily without the Vite bundle (`server.ts:90-98` falls
 *   back and logs it). `verify-gate.js` compiles the e2e driver itself (`build:e2e`).
 * - `live` — the gateway **and** the e2e driver. This branch runs `dist/e2e/run.js`
 *   directly; nothing else in the job compiles it, so it is built here rather than assumed
 *   to be left over from some earlier run.
 * - `lease` — everything. It serves a real browser, so the client bundle and the
 *   terrain-test are exactly what the session came for.
 * - `nightly` — the same as `live`, because it *is* a live drive; the only difference is
 *   that the worker deposited it against `main` instead of a session against its branch.
 *
 * What is given up: the full build also happened to prove the client still compiles. CI
 * replays that same `npm run build` on every pull request, so the proof is not lost — it
 * just no longer occupies the bench.
 */
const BUILD_STEPS: Record<JobType, string[]> = {
  ref: ['build:server'],
  live: ['build:server', 'build:e2e'],
  lease: ['build'],
  nightly: ['build:server', 'build:e2e'],
};

/**
 * Exit code -> verdict, shared by both bodies this worker runs: `scripts/verify-gate.js`
 * (the `gate` job) and `dist/e2e/run.js` (the `live` / `nightly` jobs) — both declare the
 * same four-outcome `EXIT` table (verify-gate.js; src/e2e/run.ts), so one map reads either.
 *
 * The gate used to return 0 or 1 and nothing else, so every non-passing outcome arrived here
 * as `FAIL` — including the ENVIRONMENT abort, which judged nothing at all and must not be
 * written as an attestation (see NON_ATTESTING). `live`/`nightly` had the same bug: a
 * BLOCKED refusal (rate limit, dirty world — nothing ran) or an ENVIRONMENT abort (preflight
 * failed) both used to read as FAIL.
 *
 * An unlisted code — an uncaught crash exits 1, a signal exits 128+n — is `FAIL`. That is
 * the safe direction: it attests, so a merge is blocked, rather than passing in silence.
 */
const GATE_EXIT_VERDICT: Readonly<Record<number, JobVerdict>> = {
  0: 'PASS',
  1: 'FAIL',
  2: 'BLOCKED',
  3: 'ENVIRONMENT',
};

/**
 * Verdicts that ran no code, and therefore attest nothing.
 *
 * An attestation is the one artefact the merge rule trusts, and it is not self-correcting:
 * `merge-queue.ts` treats any existing `verdicts/<sha>.json` as "already answered", so a
 * false one is never revisited. A run that learned nothing about the commit must leave both
 * the file and the `bench/gate` status exactly as it found them — including an earlier PASS.
 *
 * - `DIRTY` — a gate on uncommitted changes; the tested tree is not the sha.
 * - `ENVIRONMENT` — the fetch, the owner lease, the gateway or the live stage refused before
 *   the change could be judged. It already "does not consume an attempt"
 *   (doc/E2E-POLICY.md §8); an attestation would be that same non-event made durable.
 * - `ABANDONED` — the worktree was gone by the time the job started. Nothing could be read,
 *   let alone driven.
 */
export const NON_ATTESTING: ReadonlySet<JobVerdict> = new Set<JobVerdict>([
  'DIRTY',
  'ENVIRONMENT',
  'ABANDONED',
]);

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
    // Otherwise latest.json would keep yesterday's PASS while nothing is running and
    // nothing is scheduled — main would read as proven on the strength of a job that died.
    if (request.type === 'nightly') {
      writeNightlyResult(deps.paths, {
        jobId: request.id,
        sha: request.fingerprint.head,
        verdict: 'INTERRUPTED',
        submittedAt: request.submittedAt,
        finishedAt: new Date(deps.now()).toISOString(),
        detail: 'the worker died while the nightly was driving main; nothing is proven',
      });
    }
    deps.spool.finish(file);
  }
}

/**
 * One pass over the queue: take the oldest deposit, execute it, report. Returns false
 * when the queue was empty. A deposit whose session has died is reported ABANDONED
 * without running anything — the queue cleans itself.
 */
export async function processOldest(deps: WorkerDeps): Promise<boolean> {
  // A merge-queue entry jumps the line. GitHub ejects an entry whose required checks
  // exceed the queue's response timeout, and the bench is serialised machine-wide: a
  // `lease` (median 11 min, max 33 measured) would otherwise eject a perfectly healthy
  // branch, and its session would spend its three attempts on somebody else's `npm run
  // dev`. Nothing starves for long — the queue runs one entry at a time, and an entry is
  // one gate. See ./merge-queue.
  const waiting = deps.spool.queued();
  const oldest = waiting.find(entry => entry.request.queueEntry) ?? waiting[0];
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

  // NON_ATTESTING ran nothing and attests nothing: the sha is neither passed nor failed,
  // and an earlier clean attestation of the same sha stays valid.
  //
  // ENVIRONMENT joined DIRTY here with the owner lease (./owner). Writing one would
  // overwrite a perfectly good PASS for that sha — and publish `bench/gate=error` on it,
  // because statusState maps ENVIRONMENT to `error` — on the strength of something that
  // never read a line of the code: a lease that could not be renewed, or a gateway that
  // never came up. Both already "do not consume an attempt" (doc/E2E-POLICY.md §8); an
  // attestation they can destroy is the same claim made in a place that outlives them.
  //
  // The set is read from `report.verdict`, so it only protects what SURVIVES as itself down
  // to this line. Two ways in used to be closed off before it: the live stage's ENVIRONMENT
  // arrived here as FAIL, because verify-gate exited 1 for everything but PASS; and
  // ABANDONED — the worktree vanished mid-queue — was never in the set at all, so a job that
  // could not even find the code attested `failure` for it.
  //
  // `ref` and `gate` write to the same place again. They were split for #158 stage B, so
  // one live exercise of the fetched-ref path could be compared against the session path
  // without either overwriting the other; that comparison ran (job-01787603001316-a0c610,
  // PASS on 514bc4e3, `verdicts/` untouched) and the split has done its job. A ref job is
  // now THE gate, so it attests where the merge rule reads.
  if (request.type === 'ref' && !NON_ATTESTING.has(report.verdict)) {
    // The DEPOSITED sha, never the merge commit: prepareRef may have merged origin/main
    // into the checkout, which moves HEAD to a commit that names nothing anyone pushed.
    // The attestation key must stay the sha the push hook and the GitHub commit status
    // actually look up — request.fingerprint.head, fixed at deposit time.
    const head = request.fingerprint.head;
    // The tree, not just the sha: a merge-queue entry is a fresh merge commit even when
    // nothing landed since this was gated, so only the tree can say "identical code".
    const tree =
      request.type === 'ref' ? deps.resolveRef(request.worktree, 'HEAD^{tree}') : undefined;
    writeVerdictIn(deps.paths.verdicts, {
      head,
      branch: request.branch,
      worktree: request.worktree,
      verdict: report.verdict,
      fingerprintStable: !report.targetMoved,
      baseMain: report.baseMain,
      ...(report.merged ? { merged: true, mergedBase: report.baseMain } : {}),
      ...(tree ? { tree } : {}),
      jobId: request.id,
      createdAt: new Date(deps.now()).toISOString(),
      exceptions: countCapabilityExceptions(report.gateArtifact),
    });
  }

  // The nightly publishes to its own file, never to verdicts/ — see ./nightly.
  if (request.type === 'nightly') {
    writeNightlyResult(deps.paths, nightlyResultFromReport(report, request.submittedAt));
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

  // A ref job's subject does not exist on this machine until we fetch it — that is the
  // whole point of the type. Everything below then treats the checkout exactly as it
  // treats a session's worktree, because by this line it IS one.
  if (request.type === 'ref') {
    const prep = await deps.prepareRef(request.ref ?? 'origin/main', logFile);
    if (prep.conflictBase) {
      // FAIL, not ENVIRONMENT: this IS a fact about the code — the tree GitHub would
      // actually land cannot even be formed. `prepareRef` has already run `merge --abort`,
      // so the shared checkout is clean for whatever job comes next.
      return finish(
        'FAIL',
        `${request.ref} does not merge cleanly with origin/main (base ${prep.conflictBase.slice(0, 8)}) — see ${logFile}`,
      );
    }
    if (prep.failed) {
      // ENVIRONMENT, not FAIL: nothing was learned about the commit. A ref that does not
      // exist lands here too — which is right, since "I could not fetch it" is a
      // statement about this worker, not about the code.
      return finish('ENVIRONMENT', `${prep.failed} failed while fetching ${request.ref} — see ${logFile}`);
    }
    report.merged = prep.merged;
  }

  if (!fs.existsSync(request.worktree)) {
    return finish('ABANDONED', 'the worktree no longer exists on disk; nothing ran');
  }

  // The cross-host exclusion, before anything touches the bench. clearPort SIGKILLs
  // whatever holds 8080, and the body after it drives the one live world with the one
  // LOCKED account — so this is the last moment at which refusing is free. ENVIRONMENT
  // and not FAIL: nothing about the code was learned, and it must not burn one of the
  // three attempts (doc/E2E-POLICY.md §8).
  const lease = deps.mayDriveLive(deps.now());
  if (!lease.ok) {
    return finish('ENVIRONMENT', lease.why ?? 'this worker does not hold the bench owner lease');
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
  if (request.type === 'ref' && !report.fingerprints.atStart.clean) {
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

  // What every process this job starts is told about the bench's shared state: the world
  // lock, and the asset mirror. The mirror is bench-wide on purpose — see BenchPaths.cache.
  const env = {
    E2E_WORLD_STATE_DIR: deps.paths.world,
    SPO_CACHE_DIR: deps.paths.cache,
  };

  let gateway: RunningGateway;
  try {
    gateway = await deps.gateway.start(request.worktree, deps.port, logFile, env);
  } catch (err: unknown) {
    return finish('ENVIRONMENT', `gateway never became ready: ${toErrorMessage(err)}`);
  }

  let bodyVerdict: JobVerdict;
  let bodyDetail: string;
  try {
    if (request.type === 'ref') {
      // The static stage — typecheck, lint, the Jest suite — needs nothing the bench has:
      // no gateway, no LOCKED account, no world state. It occupied the one serialised
      // resource on this machine only because that is where the gate happened to run.
      //
      // CI already ran it on this exact sha, on a machine nobody here controls, and the
      // ruleset requires it green before a merge. So the worker asks GitHub rather than
      // replaying ~113 s of everyone else's queue — but only on a recorded success:
      // **skip on positive evidence, never on assumption**. Anything else replays it and
      // says why, because a gate can run before the pull request exists. See ./ci-proof.
      // A merge changes what CI's record even means: any success it holds for
      // report.fingerprints.atStart.head answers for the pre-merge sha, not for the tree
      // this run actually judges. That must not silently pass as proof — force the replay
      // instead of asking a question whose true answer nobody has recorded yet.
      const proof = report.merged
        ? { proven: false, why: 'the checkout merged origin/main — CI proved only the pre-merge tree' }
        : deps.ciStaticProof(report.fingerprints.atStart.head);
      report.staticProof = { used: proof.proven, ...(proof.proven ? {} : { why: proof.why }) };
      deps.log(
        proof.proven
          ? 'static stage from CI (it ran on this sha)'
          : `replaying the static stage — ${proof.why}`,
      );
      const args = proof.proven ? ['--skip-static', '--static-from=ci', ...request.args] : request.args;
      const code = await deps.runCommand('node', ['scripts/verify-gate.js', '--live', ...args], {
        cwd: request.worktree,
        env,
        logFile,
      });
      bodyVerdict = GATE_EXIT_VERDICT[code] ?? 'FAIL';
      bodyDetail = `verify-gate exited ${code} (${bodyVerdict})`;
      report.gateArtifact = path.join(
        request.worktree,
        'report',
        'e2e',
        `gate-${report.fingerprints.atStart.head}.json`,
      );
    } else if (request.type === 'live' || request.type === 'nightly') {
      const code = await deps.runCommand('node', ['dist/e2e/run.js', ...request.args], {
        cwd: request.worktree,
        env,
        logFile,
      });
      bodyVerdict = GATE_EXIT_VERDICT[code] ?? 'FAIL';
      bodyDetail = `live drive exited ${code} (${bodyVerdict})`;
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
    // A `ref` job is exempt from the atSubmit half, and necessarily: the checkout is
    // reset to the ref *after* the deposit, so the tree at deposit time is whatever the
    // last job left there and never matches. That is not a moving target — it is the
    // absence of one. What the fetched commit is, nobody can change; the atStart/atEnd
    // half still runs, because a tree that moves mid-run is a real fault whatever put it
    // there.
    const stable =
      report.fingerprints.atEnd !== undefined &&
      (request.type === 'ref' || request.fingerprint.hash === report.fingerprints.atStart?.hash) &&
      report.fingerprints.atStart?.hash === report.fingerprints.atEnd.hash;
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
export async function workerLoop(
  deps: WorkerDeps,
  maxTicks: number = Infinity,
  nightly: (deps: WorkerDeps) => Promise<boolean> = maybeRunNightly,
): Promise<void> {
  let lastPublish = 0;
  // Consecutive publish-failure counts per sha, kept across passes for the life of the
  // worker process — so a sha stuck failing logs once (on the third pass) instead of
  // once per 30-second tick forever.
  const publishFailures = new Map<string, number>();
  for (let tick = 0; tick < maxTicks; tick++) {
    try {
      const worked = await processOldest(deps);
      deps.spool.purgeDone(DONE_RETENTION_MS, deps.now());
      if (deps.now() - lastPublish > 30_000) {
        lastPublish = deps.now();
        publishPendingStatuses(deps.paths, deps.publishStatus, deps.log, deps.now(), deps.paths.verdicts, publishFailures);
      }
      if (!worked) {
        // Only when the queue came back empty: these take the bench like any job, so they
        // must never start while a session is waiting behind one.
        //
        // The merge queue goes first. An entry it deposits jumps the spool (processOldest),
        // because GitHub ejects an entry whose required checks time out — and an ejection
        // costs a session its turn for a reason that was never about its code.
        deps.serveMergeQueue();
        await nightly(deps);
        await deps.sleep(2_000);
      }
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

/**
 * `gatewayDeps` is a parameter only so a test can prove the forwarding — chiefly that the
 * job environment reaches `startGateway` — without a real gateway being spawned.
 */
/**
 * What `serveMergeQueue` needs, built from the bench layout.
 *
 * Extracted from realWorkerDeps rather than inlined there because these closures are not
 * wiring — they decide which verdicts count as candidates, what a reused attestation says
 * about itself, and what shape a queue entry's job takes. That is behaviour, and it is
 * tested directly.
 */
export function mergeQueueDeps(paths: BenchPaths, log: (line: string) => void): MergeQueueDeps {
  const spool = new Spool(paths);
  return {
    lsRemote: cwd => runGit(cwd, ['ls-remote', 'origin', 'refs/heads/gh-readonly-queue/*']),
    git: (args, cwd) => runGit(cwd, args),
    attested: () =>
      listVerdicts(paths).map(({ verdict }) => ({
        head: verdict.head,
        tree: verdict.tree ?? null,
        verdict: verdict.verdict,
        fingerprintStable: verdict.fingerprintStable,
      })),
    pendingFor: sha => [...spool.queued(), ...spool.running()].some(e => e.request.ref === sha),
    reuse: (fromSha, toSha, _why) => {
      const source = listVerdicts(paths).find(v => v.verdict.head === fromSha);
      // The source can vanish between the decision and here (the 24 h purge). Doing
      // nothing leaves the entry unanswered, and the next tick gates it properly — which
      // is the safe direction.
      if (!source) return;
      writeVerdictIn(paths.verdicts, {
        ...source.verdict,
        head: toSha,
        // jobId always names the ORIGINAL live drive, byte-identical no matter how many
        // reuse hops led here — nothing is appended to it. `reusedFrom` carries the
        // provenance instead: `??` means a reuse-of-a-reuse still points at the original
        // sha, never at the intermediate copy, so the chain collapses to one hop for any N.
        jobId: source.verdict.jobId,
        reusedFrom: source.verdict.reusedFrom ?? fromSha,
        createdAt: new Date().toISOString(),
        published: false,
      });
    },
    deposit: entry => {
      spool.submit({
        type: 'ref',
        worktree: paths.refCheckout,
        branch: entry.ref,
        fingerprint: { head: entry.sha, hash: `ref:${entry.sha}`, clean: true },
        submitter: { pid: 0 },
        args: [],
        ref: entry.sha,
        queueEntry: true,
      });
    },
    checkoutDir: paths.refCheckout,
    log,
  };
}

export function realWorkerDeps(
  paths: BenchPaths,
  gatewayDeps: GatewayDeps = realGatewayDeps(),
): WorkerDeps {
  // The lease lives here, next to the two closures that read and renew it, so nothing
  // else in the process can hold a second copy of "do we own the bench".
  const lease = newLeaseState();
  const log = (line: string): void => {
    process.stdout.write(`[bench] ${new Date().toISOString()} ${line}\n`);
  };
  const ghExec = (cmd: string, args: string[], cwd: string): void => {
    execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  };
  const runGh = (cmd: string, args: string[], cwd: string): string =>
    execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const ownerDeps: OwnerDeps = {
    readVariable: ghVariableReader(runGh, process.cwd()),
    writeVariable: ghVariableWriter(runGh, process.cwd()),
    identity: localIdentity(),
    log,
    random: Math.random,
  };
  return {
    paths,
    spool: new Spool(paths),
    port: BENCH_PORT,
    fingerprint: fingerprintTree,
    resolveRef,
    runCommand: realRunCommand,
    gateway: {
      clearPort: port => clearPort(port, gatewayDeps),
      start: (worktree, port, logFile, env) => startGateway(worktree, port, logFile, gatewayDeps, env),
    },
    publishStatus: ghStatusPublisher(ghExec),
    serveMergeQueue: () => serveMergeQueue(mergeQueueDeps(paths, log)),
    ciStaticProof: sha => ciStaticProof((args, cwd) => runGh('gh', args, cwd), sha, paths.refCheckout),
    prepareRef: (ref, logFile) =>
      prepareCheckout(
        { runCommand: realRunCommand, now: () => Date.now(), log },
        { dir: paths.refCheckout, ref, workerRepo: process.cwd(), logFile, mergeRef: 'origin/main' },
        runGit,
      ),
    mayDriveLive: nowMs => mayDriveLive(lease, nowMs),
    renewLease: nowMs => renewLease(ownerDeps, lease, nowMs),
    processAlive,
    now: () => Date.now(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    log,
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

  // The owner lease is the heartbeat's cross-host twin: the heartbeat says this process
  // is alive to this machine, the lease says it holds the live world to every machine.
  // Renewed on its own timer for the same reason — a long build or live drive must not
  // let it lapse. The first pass is awaited so a worker that CAN hold the lease is
  // holding it before it claims its first job.
  const renew = async (): Promise<void> => {
    const outcome = await resolved.renewLease(resolved.now());
    if (!outcome.held) resolved.log(`bench lease NOT held — ${outcome.why ?? 'unknown'}`);
  };
  await renew();
  const leaseTimer = setInterval(() => void renew(), OWNER_RENEW_PERIOD_MS);
  leaseTimer.unref();

  recoverInterrupted(resolved);
  await resolved.gateway.clearPort(resolved.port);
  resolved.log(`bench worker up — pid ${process.pid}, port ${resolved.port}, root ${paths.root}`);
  try {
    await workerLoop(resolved, maxTicks);
  } finally {
    clearInterval(beat);
    clearInterval(leaseTimer);
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
