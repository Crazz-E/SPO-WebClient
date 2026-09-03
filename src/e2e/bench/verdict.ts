/**
 * Per-HEAD attestations — the only thing that unblocks a `git push`, and the bridge to
 * GitHub's merge gate.
 *
 * Locally: `.claude/hooks/pre-push-gate.sh` reads verdicts/<sha>.json and refuses the
 * push unless the verdict is PASS, fingerprint-stable, fresh, and was attested for the
 * worktree doing the pushing. Only the worker writes these files — a session running
 * `npm run gate:local` produces evidence for reading, not an attestation.
 *
 * On GitHub: the worker publishes each attestation as a commit status (context
 * `bench/gate`). A status can only attach to a sha GitHub knows, and the gate runs
 * BEFORE the push — so publishing retries on a cycle until the push has happened, then
 * sticks. With branch protection requiring `bench/gate`, a PR cannot merge on CI alone:
 * the live evidence has to exist even if someone sidesteps the local hook.
 */

import * as fs from 'fs';
import * as path from 'path';
import { toErrorMessage } from '../../shared/error-utils';
import type { BenchPaths } from './paths';
import type { JobVerdict } from './job';

/**
 * What the gate's live stage did — copied verbatim from the artifact's own `live` block
 * (`report/e2e/gate-<sha>.json`), never recomputed. This is the fix for the class this
 * action exists to close: 17 artifacts recorded `live.skipped: true` with the flows the
 * router required, in the same run that wrote a `PASS` nothing downstream could tell
 * apart from a live one.
 *
 * `status` is the discriminant, and every member spells out its own case in full — a
 * reader (or the type checker) can never mistake `'skipped'` or `'unknown'` for `'ran'`.
 *
 * - `'ran'` — the live stage actually drove the world; `flows` names what it drove.
 * - `'skipped'` — the gate never asked the live world anything, and says why. `required`
 *   carries `routing.required` from the artifact: the flows the router determined were
 *   necessary, whether or not any of them ran. An empty array here is a materially
 *   different fact from a non-empty one — nothing was owed, versus something was skipped.
 * - `'unknown'` — the question could not be answered at all: the artifact is missing,
 *   unreadable, or (a readable artifact, but no `live` block — the gate failed before it
 *   got that far, e.g. a static/build/routing failure). Also covers a `live` block that
 *   is not a skip but is not a completed run either — `runLive()`'s own `status` came
 *   back `BLOCKED` (rate limit / dirty world) or `ENVIRONMENT` (preflight abort), or a
 *   value this code has never seen: the gate did try to ask the live world something, but
 *   never got an answer, so it is exactly as unanswered as a missing artifact. This must
 *   never collapse into `'skipped'`: skipped states a known reason, unknown admits there
 *   isn't one on file — and never into `'ran'`: nothing here proves the live stage drove
 *   the world.
 */
export type LiveAttestation =
  | { status: 'ran'; flows: string[] }
  | { status: 'skipped'; why: string; required: string[] }
  | { status: 'unknown'; why: string };

/**
 * Whether the static stage (typecheck, lint, the Jest suite) was proven by CI or
 * replayed on the bench — copied verbatim from `JobReport.staticProof`, which `runJob`
 * sets from `ci-proof.ts`'s verdict before it ever invokes verify-gate.
 *
 * `'unknown'` covers both a verdict written before this field existed and a `ref` job
 * that never reached the question — a merge conflict, a build failure, or anything else
 * that returned before the static stage was ever asked about.
 */
export type StaticProofAttestation =
  | { status: 'ci' }
  | { status: 'bench'; why: string }
  | { status: 'unknown' };

export interface BenchVerdict {
  head: string;
  branch: string;
  /** The worktree the attestation was produced for — the hook matches it to the pusher. */
  worktree: string;
  verdict: JobVerdict;
  /** false when the tree moved between deposit and the end of the run. */
  fingerprintStable: boolean;
  /**
   * The `origin/main` sha this run was judged against.
   *
   * The ruleset no longer requires the branch to be up to date with `main` (that rule
   * cost every parallel session a full re-gate on every merge). What replaces it is this
   * field: the attestation says WHICH `main` it stood on, so a reader — the pre-push
   * hook, the commit status, a human at merge time — can see that `main` has moved past
   * it. Staleness became visible instead of enforced; that is the whole trade.
   */
  baseMain?: string;
  /**
   * True when the checkout this attestation drove was merged with `baseMain` before the
   * gate ran — `ref` was not already an ancestor of it. Absent (or false) means the gate
   * ran on the branch's own tree, unchanged: the common case, taken whenever the branch
   * already contains everything on `main`. See doc/bench-worker.md § The gate base.
   */
  merged?: boolean;
  /** The `origin/main` sha that was merged in, when {@link merged} is true. */
  mergedBase?: string;
  /**
   * The TREE this attestation drove, when it is known.
   *
   * A merge-queue entry is a fresh merge commit even when nothing landed since the pull
   * request head was gated, so no two shas ever match — but their trees do, and the tree
   * is what a live drive actually exercises. Without this recorded, the queue would pay a
   * live slot to re-prove byte-identical code. See ./merge-queue.
   */
  tree?: string;
  jobId: string;
  /** The sha whose live drive this attestation copies; absent = not a reuse. */
  reusedFrom?: string;
  createdAt: string;
  /** Capability exceptions the gate recorded (doc/E2E-POLICY.md §7) — shown on GitHub. */
  exceptions?: number;
  /**
   * What the live stage did. See {@link LiveAttestation}. Absent on a verdict written
   * before this field existed — a reader MUST treat that absence exactly like the
   * `'unknown'` member, never as "the live stage ran": that conflation is the bug this
   * field exists to close (11 PRs merged behind a PASS that never said which it was).
   */
  live?: LiveAttestation;
  /**
   * Whether the static stage was proven by CI or replayed on the bench. See
   * {@link StaticProofAttestation}. Absent on a verdict written before this field
   * existed — treat exactly like `{ status: 'unknown' }`.
   */
  staticProof?: StaticProofAttestation;
  /** Set once the commit status landed on GitHub. */
  published?: boolean;
}

export function writeVerdict(paths: BenchPaths, verdict: BenchVerdict): string {
  return writeVerdictIn(paths.verdicts, verdict);
}

/**
 * The same write, into a named directory.
 *
 * It exists because #158 stage B runs two gate paths at once — a session's worktree and a
 * ref the worker fetched — and both answer for the SAME sha. Writing both into
 * `verdicts/` would leave whichever finished last, which is precisely the comparison
 * being destroyed.
 */
export function writeVerdictIn(dir: string, verdict: BenchVerdict): string {
  const target = path.join(dir, `${verdict.head}.json`);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(verdict, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, target);
  return target;
}

export function listVerdicts(paths: BenchPaths): { file: string; verdict: BenchVerdict }[] {
  return listVerdictsIn(paths.verdicts);
}

export function listVerdictsIn(dir: string): { file: string; verdict: BenchVerdict }[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: { file: string; verdict: BenchVerdict }[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    try {
      out.push({ file, verdict: JSON.parse(fs.readFileSync(file, 'utf8')) as BenchVerdict });
    } catch {
      // Unreadable attestation: leave it; the hook will refuse it on its own.
    }
  }
  return out;
}

/** GitHub commit-status state for a verdict. */
export function statusState(verdict: JobVerdict): 'success' | 'failure' | 'error' {
  if (verdict === 'PASS') return 'success';
  if (verdict === 'ENVIRONMENT' || verdict === 'INTERRUPTED') return 'error';
  return 'failure';
}

export type StatusPublisher = (worktree: string, head: string, state: string, description: string) => void;

/** Publish via `gh api` — resolves owner/repo from the worktree's origin remote. */
export function ghStatusPublisher(
  execFile: (cmd: string, args: string[], cwd: string) => void,
  context: string = 'bench/gate',
): StatusPublisher {
  return (worktree, head, state, description) => {
    execFile(
      'gh',
      [
        'api',
        `repos/{owner}/{repo}/statuses/${head}`,
        '-f', `state=${state}`,
        '-f', `context=${context}`,
        '-f', `description=${description}`,
      ],
      worktree,
    );
  };
}

/** Don't retry a sha forever — after this age the commit was evidently never pushed. */
const PUBLISH_WINDOW_MS = 24 * 60 * 60 * 1000;

/** GitHub's commit-status `description` field is truncated/rejected past this many characters. */
export const STATUS_DESCRIPTION_MAX = 140;

/**
 * Build the GitHub commit-status description for a verdict, never exceeding
 * {@link STATUS_DESCRIPTION_MAX} characters.
 *
 * The verdict word, the liveness marker, "(tree moved)", the exception count and the
 * base sha form a protected tail — always included in full. The job id is appended
 * last, into whatever budget remains; when a long `reusedFrom`/`jobId`/`baseMain` chain
 * would blow the budget, the job id is truncated, or dropped entirely if there is no
 * room for it at all.
 *
 * `merged` renders as "merged base <sha8>" in place of the plain "base <sha8>" — the
 * distinction a reader needs is not just which `main` the gate stood on, but whether the
 * tree it judged was the branch alone or a merge with that `main`.
 *
 * The liveness marker is the fix for the 3.5-day class this action closes: a static-only
 * PASS used to render byte-identical to a live one. `verdict.live` present renders
 * "— live" (ran), "— static-only" (skipped) or "— live unknown" (unreadable/absent
 * artifact) immediately after the verdict word; `verdict.live` absent — a verdict written
 * before this field existed — renders nothing, same as before this fix.
 */
export function statusDescription(verdict: BenchVerdict): string {
  const base =
    verdict.merged && verdict.mergedBase
      ? ` — merged base ${verdict.mergedBase.slice(0, 8)}`
      : verdict.baseMain
        ? ` — base ${verdict.baseMain.slice(0, 8)}`
        : '';
  const live =
    verdict.live === undefined
      ? ''
      : verdict.live.status === 'ran'
        ? ' — live'
        : verdict.live.status === 'skipped'
          ? ' — static-only'
          : ' — live unknown';
  const tail =
    `${verdict.verdict}${verdict.fingerprintStable ? '' : ' (tree moved)'}` +
    live +
    `${verdict.exceptions ? ` — ${verdict.exceptions} capability exception(s)` : ''}` +
    base +
    `${verdict.reusedFrom ? ` — reused ${verdict.reusedFrom.slice(0, 8)}` : ''}`;

  const jobSuffix = ` — job ${verdict.jobId}`;
  if (tail.length + jobSuffix.length <= STATUS_DESCRIPTION_MAX) return tail + jobSuffix;

  // Not enough room for the full job id — truncate it to whatever fits.
  const prefix = ' — job ';
  const budget = STATUS_DESCRIPTION_MAX - tail.length - prefix.length;
  if (budget <= 0) return tail.slice(0, STATUS_DESCRIPTION_MAX);
  return tail + prefix + verdict.jobId.slice(0, budget);
}

/**
 * One publishing pass: try every fresh, unpublished attestation. A failure (typically
 * 422 — the sha is not on GitHub yet because the session has not pushed) leaves the
 * file untouched for the next pass; success stamps `published: true`. `failures` counts
 * consecutive publish failures per sha across passes — logged once, on the third — and
 * defaults to a fresh map so callers that don't care about the streak see prior behaviour.
 */
export function publishPendingStatuses(
  paths: BenchPaths,
  publish: StatusPublisher,
  log: (line: string) => void,
  nowMs: number = Date.now(),
  dir: string = paths.verdicts,
  failures: Map<string, number> = new Map(),
): void {
  for (const { verdict } of listVerdictsIn(dir)) {
    if (verdict.published) continue;
    if (nowMs - Date.parse(verdict.createdAt) > PUBLISH_WINDOW_MS) continue;
    try {
      publish(verdict.worktree, verdict.head, statusState(verdict.verdict), statusDescription(verdict));
      writeVerdictIn(dir, { ...verdict, published: true });
      log(`published ${statusState(verdict.verdict)} for ${verdict.head.slice(0, 8)}`);
      failures.delete(verdict.head);
    } catch (err: unknown) {
      const count = (failures.get(verdict.head) ?? 0) + 1;
      failures.set(verdict.head, count);
      if (count === 3) {
        log(`publish failed 3x for ${verdict.head.slice(0, 8)}: ${toErrorMessage(err)}`);
      }
    }
  }
}
