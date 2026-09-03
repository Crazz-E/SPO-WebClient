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
  type BenchVerdict,
  type LiveAttestation,
  type StaticProofAttestation,
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
    // The GATED sha: what was actually checked out and tested. Equal to `head` unless
    // prepareRef merged origin/main in, in which case it is the merge commit
    // verify-gate.js ran against and named its artifact after
    // (report/e2e/gate-<gatedSha>.json) — report.fingerprints.atStart is taken (line
    // ~638) AFTER prepareRef runs and BEFORE verify-gate.js starts, so it names exactly
    // the same HEAD verify-gate.js itself reads. Falls back to `head` on the rare early
    // FAIL that never reached the fingerprint step (a merge conflict — prepareRef already
    // ran `merge --abort`, so nothing else was ever checked out to name). Recording this
    // explicitly closes D6 (SPO-Pipeline/doc/bench-audit-2026-09-02.md): the artifact and the verdict
    // used to be filed under different shas with no field connecting them — B4.1.
    const gatedSha = report.fingerprints.atStart?.head ?? head;
    // The tree, not just the sha: a merge-queue entry is a fresh merge commit even when
    // nothing landed since this was gated, so only the tree can say "identical code".
    const tree =
      request.type === 'ref' ? deps.resolveRef(request.worktree, 'HEAD^{tree}') : undefined;
    writeVerdictIn(deps.paths.verdicts, {
      head,
      depositedSha: head,
      gatedSha,
      branch: request.branch,
      worktree: request.worktree,
      verdict: report.verdict,
      baseMain: report.baseMain,
      ...(report.merged ? { merged: true, mergedBase: report.baseMain } : {}),
      ...(tree ? { tree } : {}),
      jobId: request.id,
      createdAt: new Date(deps.now()).toISOString(),
      exceptions: countCapabilityExceptions(report.gateArtifact),
      live: liveAttestationFrom(report.gateArtifact),
      staticProof: staticProofAttestationFrom(report.staticProof),
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

/** Where `verify-gate.js` files a gate artifact for a sha, inside a given worktree. */
function gateArtifactPath(worktree: string, sha: string): string {
  return path.join(worktree, 'report', 'e2e', `gate-${sha}.json`);
}

/** Where the per-target gate-attempt counter lives, next to worker.json and the heartbeat. */
function gateAttemptsFile(root: string): string {
  return path.join(root, 'gate-attempts.json');
}

/**
 * Reads `gate-attempts.json` back into a `sha -> count` map, tolerating everything short
 * of a plain object.
 *
 * A missing file (`ENOENT`) is the ordinary first-run case and is never logged. Anything
 * else that stops this from being a usable map IS logged when `log` is given — a reset a
 * reader cannot see is exactly how this counter would go quiet a second time (F2,
 * SPO-Pipeline/doc/bench-audit-2026-09-02.md): unreadable bytes, invalid JSON, and three
 * JSON-valid shapes that are not a `sha -> count` map all reset here rather than
 * propagating:
 *   - `null` and a JSON string both throw a TypeError the moment `nextGateAttempt` tries
 *     to assign a property onto them;
 *   - a JSON array does NOT throw, but `JSON.stringify` silently drops any property
 *     assigned past the array's length — so the file keeps parsing, keeps "working", and
 *     every attempt reads back as 1 forever. This is the dangerous one: it never raises a
 *     hand, so only asserting on the INCREMENTED value catches it, not on whether a throw
 *     occurred.
 * Both failure modes matter, but only a throw could previously escape `runJob`'s body
 * `try` and reach `processOldest`'s catch, which writes a FAIL JobReport — turning a
 * bookkeeping file into something that can publish `bench/gate=failure` on an otherwise
 * good gate. Neither case is allowed to do that any more; see {@link nextGateAttempt}.
 */
function readGateAttempts(file: string, log?: (line: string) => void): Record<string, number> {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      log?.(`gate-attempts.json unreadable (${toErrorMessage(err)}) — resetting the attempt count`);
    }
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log?.(`gate-attempts.json is not valid JSON (${toErrorMessage(err)}) — resetting the attempt count`);
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    const shape = parsed === null ? 'null' : Array.isArray(parsed) ? 'an array' : typeof parsed;
    log?.(`gate-attempts.json was ${shape}, not a { sha: count } object — resetting the attempt count`);
    return {};
  }
  return parsed as Record<string, number>;
}

/**
 * How many times this exact DEPOSITED sha has now been sent through
 * `scripts/verify-gate.js`, including this call — 1 the first time, 2 the second, and so
 * on.
 *
 * This is `attempt`'s natural key (B4.3, SPO-Pipeline/doc/bench-audit-2026-09-02.md D8: `attempt: 1` in
 * 314 of 314 artifacts, though `3ef3d3c3` was demonstrably gated twice). A merge-queue
 * re-gate keeps the same DEPOSITED sha across runs even though `origin/main` — and
 * therefore the GATED sha, the merge commit the worker actually checks out — moves between
 * them, which is exactly the shape `3ef3d3c3` took on 2026-08-28. Keying on the gated sha
 * instead would still read `attempt: 1` both times: the bug this closes.
 *
 * Persisted as a flat `sha -> count` map under the bench root, written tmp-then-rename like
 * every other bench file — see {@link writeVerdictIn}. It only grows; nothing here prunes
 * it (a general retention sweep is B4.5, not this action).
 *
 * WHOLLY NON-FATAL (F2, SPO-Pipeline/doc/bench-audit-2026-09-02.md): this is bookkeeping —
 * a courtesy count for a human reading a re-gate, never evidence the gate's own verdict
 * should depend on. Neither an unreadable/malformed counter file (see
 * {@link readGateAttempts}) nor a failure to persist the write can throw out of this
 * function; both fall back to treating the count as absent for this call, so the caller
 * always gets a good-faith attempt number and the gate proceeds. The corrupt-shape and
 * write-failure cases are still surfaced through `log` rather than swallowed outright —
 * silently resetting a counter nobody can see reset is the same "quietly pinned to 1"
 * failure this function exists to close, one level in.
 */
export function nextGateAttempt(root: string, depositedSha: string, log?: (line: string) => void): number {
  const file = gateAttemptsFile(root);
  const counts = readGateAttempts(file, log);
  const attempt = (counts[depositedSha] ?? 0) + 1;
  counts[depositedSha] = attempt;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify(counts, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    // Persisting is bookkeeping too: losing this write loses precision (the NEXT call
    // starts back over from the last value it could read, or 1) but must never fail the
    // gate that is about to run because of it. Observable, not silent — see the
    // docstring above.
    log?.(`gate-attempts.json: could not persist attempt ${attempt} for ${depositedSha} (${toErrorMessage(err)})`);
  }
  return attempt;
}

/** The shape of `report/e2e/gate-<sha>.json` this module reads — see scripts/verify-gate.js. */
interface GateArtifactShape {
  live?: {
    skipped?: boolean;
    why?: string;
    /** `LiveRunResult['status']` (src/e2e/run.ts) when `runLive()` actually ran — absent on a skip. */
    status?: unknown;
    /** `LiveRunResult['error']` — set on BLOCKED/ENVIRONMENT/FAIL. */
    error?: unknown;
    flows?: { name?: unknown }[];
  } | null;
  routing?: { required?: unknown[] };
}

type GateArtifactRead = { ok: true; artifact: GateArtifactShape } | { ok: false; error: string };

/**
 * Read and parse the gate artifact, keeping the read/parse failure apart from a clean
 * absence: the two most common causes on the real corpus are indistinguishable without
 * it — an artifact filed under the merge commit's sha rather than the deposited one
 * (ENOENT; 145 of 393 ref-checkout verdicts) versus a genuinely corrupt/truncated file
 * (a `SyntaxError` from `JSON.parse`). The caller decides what to do with `error`; this
 * function only refuses to throw it away.
 */
function readGateArtifact(artifactPath: string): GateArtifactRead {
  try {
    return { ok: true, artifact: JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as GateArtifactShape };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * What the live stage did, read from the gate artifact — never recomputed. See
 * {@link LiveAttestation} for what each outcome means and why `'unknown'` must never be
 * mistaken for `'ran'`.
 *
 * `'ran'` is asserted, never defaulted: `verify-gate.js` writes `runLive()`'s
 * `LiveRunResult` into `artifact.live` verbatim on every path that isn't a skip, and that
 * result carries its own `status` — `'PASS' | 'FAIL' | 'BLOCKED' | 'ENVIRONMENT'` — with
 * no `skipped` key at all. Only `'PASS'` and `'FAIL'` mean the live stage actually drove
 * the world; `'BLOCKED'` (a rate-limit or dirty-world refusal — run.ts's own comment:
 * "nothing ran") and `'ENVIRONMENT'` (a preflight abort) both mean the flows were never
 * driven, exactly like a missing artifact, so they — and any `status` this code has never
 * seen — read `'unknown'`, not `'ran'`.
 *
 * Ways to land on `'unknown'`: no artifact path at all (`report.gateArtifact` unset —
 * most `NON_ATTESTING` outcomes never reach here anyway), a path that does not read as
 * JSON (see {@link readGateArtifact}), a readable artifact whose `live` block is still
 * `null` (the static, build or routing stage failed before the live question was ever
 * asked), and a readable, non-null `live` block that is neither a skip nor a completed
 * PASS/FAIL run. The routed flows and the refusal's own reason are folded into `why` in
 * every case so neither is silently dropped.
 */
export function liveAttestationFrom(artifactPath: string | undefined): LiveAttestation {
  if (!artifactPath) {
    return { status: 'unknown', why: 'no gate artifact was recorded for this run' };
  }
  const read = readGateArtifact(artifactPath);
  if (!read.ok) {
    return {
      status: 'unknown',
      why: `the gate artifact at ${artifactPath} could not be read: ${read.error}`,
    };
  }
  const live = read.artifact.live;
  if (!live) {
    return { status: 'unknown', why: 'the gate artifact recorded no live stage' };
  }
  const required = Array.isArray(read.artifact.routing?.required)
    ? read.artifact.routing!.required!.filter((f): f is string => typeof f === 'string')
    : [];
  if (live.skipped) {
    return {
      status: 'skipped',
      why: live.why ?? 'the gate artifact did not record why the live stage was skipped',
      required,
    };
  }
  if (live.status === 'PASS' || live.status === 'FAIL') {
    const flows = Array.isArray(live.flows)
      ? live.flows
          .map(f => (typeof f?.name === 'string' ? f.name : undefined))
          .filter((name): name is string => name !== undefined)
      : [];
    return { status: 'ran', flows };
  }
  const reason =
    typeof live.error === 'string'
      ? live.error
      : `the gate artifact recorded live.status ${JSON.stringify(live.status ?? null)}, not a completed run`;
  const routedNote = required.length > 0 ? `; routed flows: ${required.join(', ')}` : '';
  return { status: 'unknown', why: `${reason}${routedNote}` };
}

/** A gate artifact's filename is `gate-<sha>.json`; this reads the merge-commit sha back out. */
const GATE_ARTIFACT_NAME = /^gate-([0-9a-f]{40})\.json$/;

/**
 * Every gate artifact on file, keyed by its merge commit's FIRST PARENT — built once per
 * `attested()` pass so first-parent inversion (see {@link resolveLegacyLiveness}) costs one
 * batched `git log`, not one `git` process per legacy candidate. `git log --no-walk` reads
 * exactly the named commits, nothing they lead to, so this is O(artifacts on file) regardless
 * of how large the repository's history is.
 *
 * Never throws: an unreadable directory, an empty one, or a `git` that fails all read as "no
 * index" — the caller falls back to `'unknown'`, the same as any other unresolvable liveness.
 */
function mergeShaByFirstParent(
  refCheckout: string,
  git: (worktree: string, args: string[]) => string,
): Map<string, string> {
  const dir = path.join(refCheckout, 'report', 'e2e');
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return new Map();
  }
  const shas = names
    .map(name => GATE_ARTIFACT_NAME.exec(name)?.[1])
    .filter((sha): sha is string => sha !== undefined);
  if (shas.length === 0) return new Map();

  let log: string;
  try {
    log = git(refCheckout, ['log', '--no-walk', '--format=%H %P', ...shas]);
  } catch {
    return new Map();
  }
  const index = new Map<string, string>();
  for (const line of log.split('\n')) {
    const [commit, firstParent] = line.trim().split(/\s+/);
    if (commit && firstParent) index.set(firstParent, commit);
  }
  return index;
}

/**
 * Recover `live` for a verdict that predates the field, from the gate artifact — the same
 * source {@link liveAttestationFrom} reads for a fresh write, resolved here instead of never.
 *
 * This closes the gap the B2.4 validation measured against `~/.spo-bench/` but the shipped
 * rule did not: `attested()` used to read `verdict.live` straight off disk, so every verdict
 * written before this field existed (515 of 518 on the corpus measured 2026-09-03) read as
 * `'unknown'` forever — the same bucket the reuse rule allows — even the 25 that are provable
 * static-only PASSes. Verdicts are never purged (see job.ts's `purgeDone`, which only touches
 * `done/`), so that gap does not shrink on its own; this is what actually closes it, at
 * decision time, for every legacy verdict this rule is asked to reuse.
 *
 * Direct lookup first: `report/e2e/gate-<verdict.head>.json` in the shared ref checkout. That
 * misses whenever the job merged `main` into the checkout before gating (`verdict.merged`) —
 * the artifact is filed under the MERGE commit's sha (`report.fingerprints.atStart.head`),
 * never the deposited head a verdict is keyed by (worker.ts's own `runJob` fixes the key to
 * `request.fingerprint.head` for exactly this reason). First-parent inversion recovers it:
 * the merge commit's first parent IS the deposited head, so `mergeIndex()` — built once,
 * lazily, only when a direct lookup has already failed — finds it without walking history.
 *
 * A first-parent match is trusted only after three checks, because a first-parent match is
 * not automatically the RIGHT merge commit — a different job could coincidentally have
 * produced a merge with the same first parent (a superseded, re-gated push, for instance):
 *  - the merge commit's tree equals `verdict.tree` — the code judged is the code recorded;
 *  - the merge commit's second parent equals `verdict.mergedBase` — the base recorded;
 *  - `verdict.merged` is true — a non-merge verdict has no business being looked up this way.
 *
 * Any failure along this path — no artifact directory, no `git`, no match, a match that
 * fails validation — resolves to `'unknown'`, never a thrown error and never a refusal
 * invented out of missing evidence: `'unknown'` is exactly what {@link mayReuseVerdict}
 * (./merge-queue) already treats as "allow", precisely the disposition a verdict with no
 * answer on file has always had.
 */
export function resolveLegacyLiveness(
  refCheckout: string,
  git: (worktree: string, args: string[]) => string,
  verdict: Pick<BenchVerdict, 'head' | 'tree' | 'merged' | 'mergedBase'>,
  mergeIndex: () => Map<string, string>,
): LiveAttestation {
  const direct = gateArtifactPath(refCheckout, verdict.head);
  if (fs.existsSync(direct)) return liveAttestationFrom(direct);

  if (!verdict.merged) {
    return { status: 'unknown', why: 'no gate artifact was recorded for this run' };
  }

  const mergeSha = mergeIndex().get(verdict.head);
  if (!mergeSha) {
    return {
      status: 'unknown',
      why: 'no merge commit in the ref checkout has this head as its first parent',
    };
  }

  try {
    const tree = git(refCheckout, ['rev-parse', `${mergeSha}^{tree}`]).trim();
    if (verdict.tree && tree !== verdict.tree) {
      return { status: 'unknown', why: 'the recovered merge commit tree does not match the verdict' };
    }
    const secondParent = git(refCheckout, ['rev-parse', `${mergeSha}^2`]).trim();
    if (verdict.mergedBase && secondParent !== verdict.mergedBase) {
      return { status: 'unknown', why: 'the recovered merge commit base does not match the verdict' };
    }
  } catch {
    return { status: 'unknown', why: 'could not validate the recovered merge commit' };
  }

  return liveAttestationFrom(gateArtifactPath(refCheckout, mergeSha));
}

/**
 * The verdict's copy of `JobReport.staticProof` (§ ci-proof.ts), reshaped into
 * {@link StaticProofAttestation}. `undefined` — the question was never asked, because a
 * `ref` job returned before it invoked verify-gate (a merge conflict, a build failure) —
 * becomes `'unknown'`, never a silent "proven".
 */
export function staticProofAttestationFrom(
  staticProof: { used: boolean; why?: string } | undefined,
): StaticProofAttestation {
  if (!staticProof) return { status: 'unknown' };
  if (staticProof.used) return { status: 'ci' };
  return { status: 'bench', why: staticProof.why ?? 'replayed on the bench' };
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
      // verify-gate.js needs the DEPOSITED sha to record both halves of the D6 join
      // (B4.1), and the attempt count to make a re-gate visible (B4.3) — both placed
      // ahead of `request.args` so they win over anything a caller happened to forward
      // (flag() takes the first match), while a session running the script directly,
      // without the worker, keeps its own `--attempt` exactly as before.
      const attempt = nextGateAttempt(deps.paths.root, request.fingerprint.head, deps.log);
      const bookkeeping = [`--deposited-sha=${request.fingerprint.head}`, `--attempt=${attempt}`];
      const args = proof.proven
        ? [...bookkeeping, '--skip-static', '--static-from=ci', ...request.args]
        : [...bookkeeping, ...request.args];
      const code = await deps.runCommand('node', ['scripts/verify-gate.js', '--live', ...args], {
        cwd: request.worktree,
        env,
        logFile,
      });
      bodyVerdict = GATE_EXIT_VERDICT[code] ?? 'FAIL';
      bodyDetail = `verify-gate exited ${code} (${bodyVerdict})`;
      report.gateArtifact = gateArtifactPath(request.worktree, report.fingerprints.atStart.head);
    } else if (request.type === 'live' || request.type === 'nightly') {
      // Same reasoning as the `ref` bookkeeping above: placed AHEAD of `request.args` so
      // they win over anything a caller happened to forward (run.ts's `flagged()` takes
      // the first match). `request.branch` is the real branch cli.ts read at deposit time
      // (or `main` for a nightly) — forwarding it is what stops run.ts's own `?? 'local'`
      // default from firing and mislabelling every live/nightly artifact. The sha is
      // `report.fingerprints.atStart.head`: taken above, after the checkout was fetched
      // and reset but BEFORE the build steps and the drive itself run — the commit that
      // is actually about to be driven, not one re-resolved from a ref that could have
      // moved by the time the process reads it. A tree that still moves after this point
      // is caught independently by `targetMoved` below and turned into STALE, so this
      // sha is never trusted past the run it names.
      const bookkeeping = [`--branch=${request.branch}`, `--sha=${report.fingerprints.atStart.head}`];
      const code = await deps.runCommand('node', ['dist/e2e/run.js', ...bookkeeping, ...request.args], {
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
  const git = (args: string[], cwd: string): string => runGit(cwd, args);
  return {
    lsRemote: cwd => runGit(cwd, ['ls-remote', 'origin', 'refs/heads/gh-readonly-queue/*']),
    git,
    attested: () => {
      // Lazy and memoized: the first-parent index costs a `git log`, and most calls never
      // need it at all — either every candidate already carries `live`, or a direct gate
      // artifact lookup answers it, both of which are plain reads. See
      // resolveLegacyLiveness's own comment for why this is trusted only after validation.
      let mergeIndex: Map<string, string> | undefined;
      const getMergeIndex = (): Map<string, string> =>
        (mergeIndex ??= mergeShaByFirstParent(paths.refCheckout, (wt, a) => git(a, wt)));
      return listVerdicts(paths).map(({ verdict }) => ({
        head: verdict.head,
        tree: verdict.tree ?? null,
        verdict: verdict.verdict,
        live:
          verdict.live ??
          // Only a PASS with a tree can ever be reused (mayReuseVerdict), so only those are
          // worth resolving — the other legacy verdicts stay `undefined`, same as before.
          (verdict.verdict === 'PASS' && verdict.tree
            ? resolveLegacyLiveness(paths.refCheckout, (wt, a) => git(a, wt), verdict, getMergeIndex)
            : undefined),
      }));
    },
    pendingFor: sha => [...spool.queued(), ...spool.running()].some(e => e.request.ref === sha),
    reuse: (fromSha, toSha, _why) => {
      const source = listVerdicts(paths).find(v => v.verdict.head === fromSha);
      // The source can vanish between the decision and here (the 24 h purge). Doing
      // nothing leaves the entry unanswered, and the next tick gates it properly — which
      // is the safe direction.
      if (!source) return;
      // A legacy source may still carry `fingerprintStable` on disk (B2.5 deleted the
      // field from every reader and writer, not from the 515 verdicts already on file) —
      // spreading it forward would resurrect it into every new write copied from one,
      // indefinitely. Legacy verdicts keep it; new writes, reused or not, never gain it.
      //
      // `gatedSha` is dropped here too, for a sharper reason (F1,
      // SPO-Pipeline/doc/bench-audit-2026-09-02.md): a reuse copy's `head` is the QUEUE
      // ENTRY's sha (`toSha`, below), which is never checked out or tested, so the
      // source's `gatedSha` would describe a different commit's evidence under a field
      // whose contract is "what THIS record's head was tested as" — a live example on
      // disk (verdict `083e7a1c…`, `reusedFrom 95158cf2…`) had every field but
      // `reusedFrom` describing a commit other than its own `head`. The real fact — which
      // artifact actually holds the evidence — is preserved below as `reusedGatedSha`
      // instead, a name that cannot be mistaken for this record's own gate.
      const {
        fingerprintStable: _fingerprintStable,
        gatedSha: sourceGatedSha,
        reusedGatedSha: sourceReusedGatedSha,
        ...sourceVerdict
      } = source.verdict as typeof source.verdict & { fingerprintStable?: unknown };
      writeVerdictIn(paths.verdicts, {
        ...sourceVerdict,
        head: toSha,
        // The reused verdict's own deposited sha is the QUEUE ENTRY's sha (toSha), never
        // the source's — a reader keying off `head`/`depositedSha` must land on THIS
        // record.
        depositedSha: toSha,
        // Mirrors jobId/reusedFrom just below: if the source is ITSELF a reuse copy, its
        // own `gatedSha` is unset (this same rule applied one hop back) and the real
        // artifact pointer lives in ITS `reusedGatedSha` — so the chain collapses to the
        // original gate no matter how many reuse hops led here, same as `jobId` does.
        reusedGatedSha: sourceGatedSha ?? sourceReusedGatedSha,
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
