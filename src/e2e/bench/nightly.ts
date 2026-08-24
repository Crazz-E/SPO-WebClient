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

/** What `<bench>/nightly/latest.json` holds — the surface `/next-task` reads. */
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
  runCommand: (cmd: string, args: string[], options: NightlyCommandOptions) => Promise<number>;
  now: () => number;
  log: (line: string) => void;
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

/**
 * Is a nightly due right now?
 *
 * Pure, so the whole schedule is testable without a filesystem or a real clock.
 */
export function nightlyDue(
  last: NightlyResult | null,
  nightlyPending: boolean,
  nowMs: number,
): boolean {
  // One at a time: a job already queued or running IS this night's nightly.
  if (nightlyPending) return false;

  const hour = new Date(nowMs).getUTCHours();
  if (hour < NIGHTLY_WINDOW_START_HOUR_UTC || hour > NIGHTLY_WINDOW_END_HOUR_UTC) return false;

  if (!last) return true;
  const since = Date.parse(last.submittedAt);
  // An unparseable stamp is not a reason to never run again.
  if (!Number.isFinite(since)) return true;
  return nowMs - since >= NIGHTLY_MIN_GAP_MS;
}

/**
 * Bring `<bench>/nightly/checkout` to `origin/main`, cloning it the first time.
 *
 * Returns the name of the step that failed, or null on success. `git clean -fd` keeps
 * ignored files, so `node_modules/` survives the reset and `npm ci` is usually a no-op;
 * the fingerprint excludes ignored files too, so the tree reads as clean either way.
 */
export async function prepareCheckout(
  deps: NightlyDeps,
  workerRepo: string,
  git: GitRunner,
): Promise<string | null> {
  const checkout = nightlyCheckout(deps.paths);
  const logFile = nightlyPrepareLog(deps.paths);
  fs.mkdirSync(deps.paths.nightly, { recursive: true });
  // One night per log: a red result points here, and yesterday's noise would bury it.
  fs.writeFileSync(logFile, `=== nightly prepare ${new Date(deps.now()).toISOString()} ===\n`, 'utf8');

  if (!fs.existsSync(path.join(checkout, '.git'))) {
    let url: string;
    try {
      url = git(workerRepo, ['remote', 'get-url', 'origin']).trim();
    } catch (err: unknown) {
      fs.appendFileSync(logFile, `${toErrorMessage(err)}\n`, 'utf8');
      return 'git remote get-url origin';
    }
    const cloned = await deps.runCommand('git', ['clone', url, checkout], {
      cwd: deps.paths.nightly,
      logFile,
    });
    if (cloned !== 0) return 'git clone';
  }

  const steps: { name: string; cmd: string; args: string[] }[] = [
    { name: 'git fetch', cmd: 'git', args: ['fetch', '--prune', 'origin'] },
    { name: 'git reset --hard origin/main', cmd: 'git', args: ['reset', '--hard', 'origin/main'] },
    { name: 'git clean -fd', cmd: 'git', args: ['clean', '-fd'] },
    // The lockfile moves with main; a checkout built against yesterday's packages would
    // fail for a reason that has nothing to do with main's code.
    { name: 'npm ci', cmd: 'npm', args: ['ci'] },
  ];
  for (const step of steps) {
    const code = await deps.runCommand(step.cmd, step.args, { cwd: checkout, logFile });
    if (code !== 0) return step.name;
  }
  return null;
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
  if (!nightlyDue(readNightlyResult(deps.paths), pending, nowMs)) return false;

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
