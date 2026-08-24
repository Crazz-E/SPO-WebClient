/**
 * Did CI already prove the static half of this commit?
 *
 * The gate's stage 1 — typecheck, lint, the Jest suite — is not something the bench is
 * needed for. It needs no gateway, no LOCKED account, no world state. It occupied the one
 * serialised resource on this machine purely because that is where the gate happened to run.
 *
 * #145 moved it off the bench with a **precheck receipt**: the session ran the three
 * commands, wrote a file naming the tree it proved, and the worker re-keyed that file by
 * the fingerprint it took itself. That was careful work and it closed the obvious hole
 * (#126) — nothing the session *says* can make the worker skip work. But the proof was
 * still produced by the session, on the session's machine, and trusted because the worker
 * could match it to a tree.
 *
 * Once the subject of a gate is a **pushed commit** (#158 stage C), there is a better
 * authority available: GitHub ran `typecheck + tests` on that exact sha, on a machine
 * nobody here controls, and the ruleset already requires it green before a merge. So the
 * worker asks GitHub instead of trusting a file.
 *
 * **The rule is unchanged, only the witness is better: skip on positive evidence, never on
 * assumption.** A conclusion of `success` for that sha skips stage 1 and the artifact
 * records `CI` as the authority. Everything else — no run yet, still running, failed,
 * cancelled, GitHub unreachable, an answer that cannot be parsed — replays stage 1 in full
 * and says why. The failure direction costs ~113 s of bench time; the other direction would
 * attest a commit nothing statically checked.
 *
 * Why this is not merely the receipt with extra steps: a gate can run **before the pull
 * request exists**, and two of `ci.yml`'s steps (`coverage:changed`, `check-pr-rules`) are
 * `if: github.event_name == 'pull_request'`. "CI is required for merge" is true at merge
 * time and says nothing about the moment the gate runs. Asking about *this sha, right now*
 * is the only form of the question that is safe to answer.
 */

import { toErrorMessage } from '../../shared/error-utils';

/**
 * The check the ruleset requires, and the only one whose success this module reads.
 * It must stay identical to the job name in `.github/workflows/ci.yml` and to the
 * `required_status_checks` context on the `main` ruleset — three places, one string.
 */
export const CI_STATIC_CHECK = 'typecheck + tests';

export interface CiProof {
  /** True only on a recorded success for this exact sha. */
  proven: boolean;
  /** Why not — always populated when proven is false, and it goes into the job log. */
  why?: string;
}

/** Runs `gh` and returns stdout; throws on a non-zero exit, like execFileSync. */
export type GhRunner = (args: string[], cwd: string) => string;

interface CheckRun {
  name?: unknown;
  status?: unknown;
  conclusion?: unknown;
}

/**
 * Judge the check-runs payload for a sha.
 *
 * Pure, so every branch is testable without a network. `raw` is the JSON body of
 * `repos/{owner}/{repo}/commits/<sha>/check-runs`.
 */
export function judgeCheckRuns(raw: string): CiProof {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { proven: false, why: 'the check-runs response was not JSON' };
  }
  const runs = (payload as { check_runs?: unknown })?.check_runs;
  if (!Array.isArray(runs)) {
    return { proven: false, why: 'the check-runs response carried no check_runs array' };
  }

  const matching = (runs as CheckRun[]).filter(run => run?.name === CI_STATIC_CHECK);
  if (matching.length === 0) {
    return { proven: false, why: `no "${CI_STATIC_CHECK}" run exists for this commit yet` };
  }

  // A sha can carry several runs of the same check (a re-run, a retry). One success is
  // enough — GitHub's own merge rule reads the latest conclusion, and a success that was
  // later re-run to failure would fail the required check and block the merge anyway.
  const success = matching.find(run => run.status === 'completed' && run.conclusion === 'success');
  if (success) return { proven: true };

  const inFlight = matching.find(run => run.status !== 'completed');
  if (inFlight) {
    return { proven: false, why: `"${CI_STATIC_CHECK}" is still ${String(inFlight.status)} for this commit` };
  }
  const conclusions = matching.map(run => String(run.conclusion)).join(', ');
  return { proven: false, why: `"${CI_STATIC_CHECK}" concluded ${conclusions} for this commit` };
}

/**
 * Ask GitHub about a sha. Any failure to ask is an unproven answer, never an assumed one.
 */
export function ciStaticProof(gh: GhRunner, sha: string, cwd: string): CiProof {
  let raw: string;
  try {
    raw = gh(['api', `repos/{owner}/{repo}/commits/${sha}/check-runs`], cwd);
  } catch (err: unknown) {
    return { proven: false, why: `could not read the checks for ${sha.slice(0, 8)}: ${toErrorMessage(err)}` };
  }
  return judgeCheckRuns(raw);
}
