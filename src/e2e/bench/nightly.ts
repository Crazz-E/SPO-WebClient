/**
 * The nightly proof of `main`.
 *
 * The bench proves branches, one at a time, each against the `main` it was based on. It
 * never proves `main` itself — so two branches that pass alone and break together land,
 * and the defect stays invisible until some later session trips on it while working
 * ground it does not own. That session then spends its three gate attempts
 * (doc/E2E-POLICY.md §8) on somebody else's regression. The cost is not the failure, it
 * is the misattribution.
 *
 * The fix is one live drive of `origin/main` a night, deposited by the worker itself.
 *
 * Three decisions worth knowing before reading the code:
 *
 * - **It runs in a checkout nobody else touches** (`<bench>/nightly/checkout`), not in
 *   the worker's own repo. A job builds its worktree, and the worker executes
 *   `dist/e2e/bench/worker.js` *from* that repo (scripts/bench-install.sh) — building
 *   `main` there would overwrite the running worker's own code mid-flight. It is not a
 *   `git worktree` of that repo either: `scripts/finish.sh` scans and reaps worktrees on
 *   its own schedule, and the nightly must not be something `finish` can delete.
 * - **It is a real spool job**, not a side channel. Serialization, the report in `done/`,
 *   the `.log`, `bench:status` visibility, INTERRUPTED recovery and the 24 h purge all
 *   come for free, and "when the queue is idle" is honoured by the only mechanism that
 *   can honour it — the queue. `cli.ts` deliberately does not accept the type, so a
 *   session cannot deposit one.
 * - **It attests nothing.** No `verdicts/<sha>.json` is written for `main`. See the
 *   comment on writeNightlyResult.
 */

import * as fs from 'fs';
import * as path from 'path';
import { toErrorMessage } from '../../shared/error-utils';
import type { BenchPaths } from './paths';
import { runGit, type GitRunner, type TreeFingerprint } from './fingerprint';
import { prepareCheckout as sharedPrepareCheckout } from './checkout';
import { type GitAuthEnv } from './git-auth';
import type { Spool, JobVerdict } from './job';

/**
 * The window, in **UTC** hours: the run may start at 02:00, 03:00 or 04:00 UTC.
 *
 * UTC and not local time so the window is the same number on the maintainer's machine
 * and in a test run anywhere. On Europe/Paris that is 04:00–06:59 in summer and
 * 03:00–05:59 in winter — either way, hours at which the queue is empty and no session
 * is waiting behind the nightly.
 */
export const NIGHTLY_WINDOW_START_HOUR_UTC = 2;
export const NIGHTLY_WINDOW_END_HOUR_UTC = 5;

/**
 * How long after one nightly *deposit* the next may be considered.
 *
 * Under 24 h so the run does not drift out of its own window, comfortably over the width
 * of the window so a single night yields a single run. It is measured from the deposit,
 * not the finish, so a slow night cannot buy itself a second slot.
 */
export const NIGHTLY_MIN_GAP_MS = 20 * 60 * 60 * 1000;

/**
 * How long after one "main moved" deposit the next may be considered.
 *
 * Deliberately much tighter than {@link NIGHTLY_MIN_GAP_MS}: a run triggered because
 * `main` advanced is proving a specific new sha, not filling the night's one slot, so a
 * burst of merges should not have to wait 20 hours between checks — but it still must not
 * queue one nightly per commit when several land within the same few minutes.
 */
export const NIGHTLY_MOVE_RATE_LIMIT_MS = 15 * 60 * 1000;

/** What `<bench>/nightly/latest.json` holds — the surface the orchestrator reads. */
export interface NightlyResult {
  /** The spool job that produced this, when one ran. */
  jobId?: string;
  /** The `main` commit that was driven. Absent when nothing ran. */
  sha?: string;
  verdict: JobVerdict;
  /** When the job was deposited — what the gap in nightlyDue is measured from. */
  submittedAt: string;
  finishedAt?: string;
  detail?: string;
  /** The job log, so a human reading a red result has somewhere to go. */
  logFile?: string;
}

/**
 * Structurally the worker's `RunCommandOptions`. Declared here rather than imported so
 * this module does not point back at worker.ts, which points at it.
 */
export interface NightlyCommandOptions {
  cwd: string;
  env?: Record<string, string>;
  logFile: string;
}

/** Exactly what the nightly needs from the worker — WorkerDeps satisfies it structurally. */
export interface NightlyDeps {
  paths: BenchPaths;
  spool: Spool;
  fingerprint: (worktree: string) => TreeFingerprint;
  /** The sha a ref points at, or undefined when it does not exist. Used to read the
   *  worker repo's local knowledge of `origin/main` — never a fresh network fetch. */
  resolveRef: (worktree: string, ref: string) => string | undefined;
  runCommand: (cmd: string, args: string[], options: NightlyCommandOptions) => Promise<number>;
  now: () => number;
  log: (line: string) => void;
  /** Waits between attempts at a network step — see checkout.ts. */
  sleep: (ms: number) => Promise<void>;
  /**
   * The environment that makes git authenticate to github.com; see ./git-auth. The nightly
   * needs this at least as much as a job does: it is the only proof `main` ever gets, and
   * when its fetch was refused on 2026-09-03 there was nothing behind it to try again.
   */
  gitAuthEnv: () => GitAuthEnv;
}

/** The clone the nightly drives — refreshed to `origin/main`, written by nothing else. */
export function nightlyCheckout(paths: BenchPaths): string {
  return path.join(paths.nightly, 'checkout');
}

/** The published result. */
export function nightlyResultFile(paths: BenchPaths): string {
  return path.join(paths.nightly, 'latest.json');
}

/** Where refreshing the checkout logs — separate from the job log, which may not exist yet. */
export function nightlyPrepareLog(paths: BenchPaths): string {
  return path.join(paths.nightly, 'prepare.log');
}

export function readNightlyResult(paths: BenchPaths): NightlyResult | null {
  try {
    return JSON.parse(fs.readFileSync(nightlyResultFile(paths), 'utf8')) as NightlyResult;
  } catch {
    // Absent or unreadable both mean the same thing to every caller: nothing is known
    // about main. A corrupt file must not be able to wedge the nightly off.
    return null;
  }
}

/**
 * Publish the result — tmp-then-rename, so a reader never sees half a file.
 *
 * Deliberately **not** `verdicts/<sha>.json`. That file means a *gate* ran — the static
 * stage, the President exclusion, verify-gate's routing — and a bare live drive is none
 * of those. Writing one would also hand `publishPendingStatuses` a `bench/gate` commit
 * status to post on `main`'s own sha, a context branch protection reads; and the push
 * hook matches an attestation to the pushing worktree, which this checkout never is. A
 * separate surface says the true thing instead of a convenient one.
 */
export function writeNightlyResult(paths: BenchPaths, result: NightlyResult): void {
  fs.mkdirSync(paths.nightly, { recursive: true });
  const target = nightlyResultFile(paths);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, target);
}

/** Is `nowMs` inside the 02:00–05:00 UTC window? */
function isTimeWindowDue(nowMs: number): boolean {
  const hour = new Date(nowMs).getUTCHours();
  return hour >= NIGHTLY_WINDOW_START_HOUR_UTC && hour <= NIGHTLY_WINDOW_END_HOUR_UTC;
}

/**
 * Has `origin/main` advanced past the last sha a nightly actually proved?
 *
 * Requires an actual prior sha to compare against — a `lastProvenSha` of undefined means
 * "unknown", not "moved". Nothing having run yet must not read as a move: that would fire
 * this trigger off-window and off-gap the very first time `currentMainSha` becomes
 * resolvable, which is exactly the case the window schedule below already covers.
 */
function isMainMoved(currentMainSha: string | undefined, lastProvenSha: string | undefined): boolean {
  return (
    currentMainSha !== undefined && lastProvenSha !== undefined && currentMainSha !== lastProvenSha
  );
}

/** Is the current `main` sha exactly the one already covered by the last result? */
function isAlreadyProven(currentMainSha: string | undefined, lastProvenSha: string | undefined): boolean {
  return currentMainSha !== undefined && currentMainSha === lastProvenSha;
}

/** Has enough time passed since `lastRunAtMs` to clear a rate limit of `gapMs`? */
function isRateLimitExceeded(lastRunAtMs: number | undefined, nowMs: number, gapMs: number): boolean {
  if (lastRunAtMs === undefined || !Number.isFinite(lastRunAtMs)) return true;
  return nowMs - lastRunAtMs >= gapMs;
}

/**
 * Is a nightly due right now?
 *
 * Pure, so the whole schedule is testable without a filesystem or a real clock.
 *
 * Two independent paths, either of which is enough:
 *
 * - **The window.** The original schedule: once inside 02:00–05:00 UTC, and not again
 *   within {@link NIGHTLY_MIN_GAP_MS} of the last deposit. Unchanged, and the only path
 *   taken when `currentMainSha` is not given — every existing caller keeps this behaviour.
 * - **Main moved.** When `currentMainSha` is known, a sha was previously proven
 *   (`lastProvenSha` is set), and they differ — a run is due immediately, independent of
 *   the window, so a break is caught close to the push that caused it rather than at the
 *   next 02:00. Rate-limited on its own, much tighter, gap
 *   ({@link NIGHTLY_MOVE_RATE_LIMIT_MS}) so a burst of merges deposits one run, not one per
 *   push. Nothing having run yet (`lastProvenSha` absent) is "unknown", not "moved" — that
 *   case falls through to the window schedule below, same as an omitted `currentMainSha`.
 *
 * Ahead of both: `currentMainSha` already matching `lastProvenSha` means this exact commit
 * was already run — main is immutable at a sha, so a second run would teach nothing new,
 * and neither path fires.
 */
export function nightlyDue(
  last: NightlyResult | null,
  nightlyPending: boolean,
  nowMs: number,
  currentMainSha?: string,
  lastProvenSha?: string,
  lastRunAtMs?: number,
): boolean {
  // One at a time: a job already queued or running IS this night's nightly.
  if (nightlyPending) return false;

  // This exact sha was already run — re-running teaches nothing new about main.
  if (isAlreadyProven(currentMainSha, lastProvenSha)) return false;

  const submittedAtMs = last ? Date.parse(last.submittedAt) : NaN;
  const effectiveLastRunAtMs = lastRunAtMs ?? (Number.isFinite(submittedAtMs) ? submittedAtMs : undefined);

  if (
    isMainMoved(currentMainSha, lastProvenSha) &&
    isRateLimitExceeded(effectiveLastRunAtMs, nowMs, NIGHTLY_MOVE_RATE_LIMIT_MS)
  ) {
    return true;
  }

  if (!isTimeWindowDue(nowMs)) return false;
  if (!last) return true;
  // An unparseable stamp is not a reason to never run again.
  if (!Number.isFinite(submittedAtMs)) return true;
  return nowMs - submittedAtMs >= NIGHTLY_MIN_GAP_MS;
}

/**
 * Bring `<bench>/nightly/checkout` to `origin/main`.
 *
 * A thin naming of the shared machinery in ./checkout — same clone, same reset, same
 * conditional install — with `origin/main` as the target. It stayed a named function
 * because "the nightly's checkout" is a thing the rest of this module and its tests talk
 * about, while ./checkout deliberately knows nothing about nightlies.
 */
export async function prepareCheckout(
  deps: NightlyDeps,
  workerRepo: string,
  git: GitRunner,
): Promise<string | null> {
  // The nightly already targets `origin/main` as `ref` — there is nothing to merge it
  // with, so it never passes `mergeRef` and stays on the shape this module's own callers
  // and tests have always used.
  const result = await sharedPrepareCheckout(
    deps,
    {
      dir: nightlyCheckout(deps.paths),
      ref: 'origin/main',
      workerRepo,
      logFile: nightlyPrepareLog(deps.paths),
    },
    git,
  );
  return result.failed;
}

/**
 * Called from the worker loop's idle branch: if a nightly is due, refresh the checkout
 * and deposit the job. Returns true when one was deposited.
 *
 * A session that deposits while the nightly runs simply queues behind it, exactly as it
 * would behind any other job — the nightly is never aborted, and never *starts* while
 * anything is queued, which is the only moment "idle" can be honoured.
 */
export async function maybeRunNightly(
  deps: NightlyDeps,
  workerRepo: string = process.cwd(),
  git: GitRunner = runGit,
): Promise<boolean> {
  const pending = [...deps.spool.queued(), ...deps.spool.running()].some(
    entry => entry.request.type === 'nightly',
  );
  const nowMs = deps.now();
  const last = readNightlyResult(deps.paths);
  // Local knowledge only — never a fresh fetch on every idle tick. Ordinary job traffic
  // (each fetches `origin/main` into its own worktree of this same repo, sharing the ref)
  // keeps it current in practice.
  const currentMainSha = deps.resolveRef(workerRepo, 'origin/main');
  if (!nightlyDue(last, pending, nowMs, currentMainSha, last?.sha)) return false;

  const submittedAt = new Date(nowMs).toISOString();
  deps.log('nightly: refreshing the main checkout');
  const failedStep = await prepareCheckout(deps, workerRepo, git);
  if (failedStep) {
    // ENVIRONMENT, not FAIL: the checkout could not be built, so nothing was learned
    // about main. Recording it is what stops the loop retrying every two seconds until
    // the window closes — and what tells a human where to look.
    deps.log(`nightly: ${failedStep} failed — not deposited`);
    writeNightlyResult(deps.paths, {
      verdict: 'ENVIRONMENT',
      submittedAt,
      finishedAt: new Date(deps.now()).toISOString(),
      detail: `${failedStep} failed while refreshing the nightly checkout — see ${nightlyPrepareLog(deps.paths)}`,
    });
    return false;
  }

  const checkout = nightlyCheckout(deps.paths);
  let fingerprint: TreeFingerprint;
  try {
    fingerprint = deps.fingerprint(checkout);
  } catch (err: unknown) {
    deps.log(`nightly: could not fingerprint the checkout — not deposited`);
    writeNightlyResult(deps.paths, {
      verdict: 'ENVIRONMENT',
      submittedAt,
      finishedAt: new Date(deps.now()).toISOString(),
      detail: `could not fingerprint the nightly checkout: ${toErrorMessage(err)}`,
    });
    return false;
  }

  const request = deps.spool.submit(
    {
      type: 'nightly',
      worktree: checkout,
      branch: 'main',
      fingerprint,
      // Nobody waits on a nightly: there is no session behind it to abandon it.
      submitter: { pid: 0 },
      args: [],
    },
    nowMs,
  );
  deps.log(`nightly: deposited ${request.id} for main ${fingerprint.head}`);
  return true;
}

/**
 * The result a finished (or interrupted) nightly job publishes.
 *
 * `submittedAt` comes from the request, never from the report: it is what the gap in
 * nightlyDue is measured from, and a job that queued behind something else started long
 * after it was deposited.
 */
export function nightlyResultFromReport(
  report: {
    id: string;
    verdict: JobVerdict;
    fingerprints: { atSubmit: TreeFingerprint; atStart?: TreeFingerprint };
    finishedAt?: string;
    detail?: string;
    logFile?: string;
  },
  submittedAt: string,
): NightlyResult {
  return {
    jobId: report.id,
    sha: report.fingerprints.atStart?.head ?? report.fingerprints.atSubmit.head,
    verdict: report.verdict,
    submittedAt,
    finishedAt: report.finishedAt,
    detail: report.detail,
    logFile: report.logFile,
  };
}
