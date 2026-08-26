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
 * The verdict word, "(tree moved)", the exception count and the base sha form a
 * protected tail — always included in full. The job id is appended last, into whatever
 * budget remains; when a long `reusedFrom`/`jobId`/`baseMain` chain would blow the
 * budget, the job id is truncated, or dropped entirely if there is no room for it at all.
 */
export function statusDescription(verdict: BenchVerdict): string {
  const tail =
    `${verdict.verdict}${verdict.fingerprintStable ? '' : ' (tree moved)'}` +
    `${verdict.exceptions ? ` — ${verdict.exceptions} capability exception(s)` : ''}` +
    `${verdict.baseMain ? ` — base ${verdict.baseMain.slice(0, 8)}` : ''}` +
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
