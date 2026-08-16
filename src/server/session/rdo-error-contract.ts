/**
 * The error contract for `sendRdoRequest()` — audit finding P-M3.
 *
 * `A<id> error N;` is a normal, well-formed RDO reply. Our transport treats it
 * as a delivered response and resolves the promise, leaving `packet.errorCode`
 * for the caller to inspect. No caller does: across 93 `sendRdoRequest()` sites,
 * the only readers are the retry classifier and the maintenance-mode detector.
 *
 * So a refused mutation looks exactly like an applied one. M-B (`deleteFacility`
 * logs the reply and returns success) and M-E (`setBuildingProperty` returns
 * `success: true` on every path) are not two bugs — they are two of ninety-three.
 *
 * Flipping the default to "reject" in one step would surface years of swallowed
 * errors at once, including benign ones the game relies on. Hence two modes:
 * `observe` records what *would* have thrown, `reject` throws. See
 * `config.rdo.errorContract`.
 */

import { config } from '../../shared/config';
import { classifyRdoError, ErrorRecovery } from './rdo-error-classifier';

/** `errIllegalObject` — ErrorCodes.pas:8. The one rejectable code that happens in normal play. */
const ERR_ILLEGAL_OBJECT = 2;

/**
 * Whether the contract must let this code through and resolve as before.
 *
 * Two reasons, and only the second is a policy choice:
 *
 * 1. **RECOVERABLE codes — a correctness invariant, in every mode.** They are
 *    owned by `executeWithRetry`, which inspects `result.errorCode` on the
 *    RESOLVED packet. Rejecting one settles the promise first, so the retry
 *    never runs: flipping the contract would silently disable auto-retry for
 *    `errQueryTimedOut`, `errSendError`, `errServerBusy` and friends. The
 *    contract and the retry classifier partition the codes; they must not
 *    overlap.
 * 2. **`errIllegalObject` (2) in `reject-except-stale`** — a deliberate first
 *    step. It is the only FATAL code that occurs in normal play (stale
 *    ClientViewId, demolished building id, cacherId gone after reconnect), so
 *    rejecting it would break code that copes with it today. It stays in the
 *    census; `RDO_ERROR_CONTRACT=reject` includes it once the census says what
 *    it costs.
 *
 * Residual gap, deliberately not closed here: a RECOVERABLE code that survives
 * every retry still resolves with `errorCode` set, and no caller reads it. That
 * belongs in `executeWithRetry` — after the retry decision — not in this
 * function, which runs before it.
 */
function isExemptFromRejection(errorCode: number, mode: string): boolean {
  if (classifyRdoError(errorCode).recovery === ErrorRecovery.RECOVERABLE) return true;
  return mode === 'reject-except-stale' && errorCode === ERR_ILLEGAL_OBJECT;
}

/** The only logging capability this module needs. */
interface WarnLogger {
  warn(message: string): void;
}

/** One error reply the server sent and the call site did not act on. */
export interface RdoErrorObservation {
  socketName: string;
  member: string;
  action?: string;
  errorCode: number;
  errorName?: string;
  rid?: number;
}

/**
 * Thrown in `reject` mode. Carries the protocol code so WebSocket handlers can
 * map it without string matching.
 */
export class RdoServerError extends Error {
  public readonly errorCode: number;
  public readonly member: string;

  constructor(observation: RdoErrorObservation) {
    super(
      `RDO ${observation.member} failed: ${observation.errorName ?? 'error'} ` +
      `(code ${observation.errorCode}) on ${observation.socketName}`
    );
    this.name = 'RdoServerError';
    this.errorCode = observation.errorCode;
    this.member = observation.member;
  }
}

/**
 * Tally of observations, keyed `member:errorCode`.
 *
 * Module-level on purpose: the point is a census across the whole process, and
 * the triage question is "which member returns which code, how often" — not
 * "which session saw it". {@link resetErrorContractTally} exists for tests.
 */
const tally = new Map<string, { observation: RdoErrorObservation; count: number }>();

export function resetErrorContractTally(): void {
  tally.clear();
}

/** Snapshot of everything observed so far, most frequent first. */
export function getErrorContractTally(): Array<{ observation: RdoErrorObservation; count: number }> {
  return [...tally.values()].sort((a, b) => b.count - a.count);
}

/**
 * Record an error reply, and decide whether it should reject.
 *
 * @returns the error to reject with in `reject` mode, or `null` to resolve as
 *          before. Returning the error rather than throwing keeps the decision
 *          at the call site, where the pending-request bookkeeping lives.
 */
export function handleRdoErrorResponse(
  observation: RdoErrorObservation,
  log: WarnLogger
): RdoServerError | null {
  const key = `${observation.member}:${observation.errorCode}`;
  const existing = tally.get(key);
  if (existing) {
    existing.count++;
  } else {
    tally.set(key, { observation, count: 1 });
  }

  const occurrences = tally.get(key)!.count;
  const mode = config.rdo.errorContract;

  if (mode !== 'observe' && !isExemptFromRejection(observation.errorCode, mode)) {
    return new RdoServerError(observation);
  }

  // Resolving anyway — say WHY, because "observe mode" and "exempt code" are
  // very different reasons to see this line and lead to different actions.
  const reason = mode === 'observe'
    ? 'config.rdo.errorContract=observe'
    : classifyRdoError(observation.errorCode).recovery === ErrorRecovery.RECOVERABLE
      ? 'recoverable — owned by executeWithRetry, never rejected by the contract'
      : `exempt in ${mode} (errIllegalObject occurs in normal play)`;

  // One line per error reply, tagged so the census is greppable:
  //   grep RDO-CONTRACT logs/*.ndjson
  log.warn(
    `[RDO-CONTRACT] not rejected: ${observation.member} -> ${observation.errorName ?? 'error'} ` +
    `(code ${observation.errorCode}) on ${observation.socketName} ` +
    `[seen ${occurrences}x] — ${reason}`
  );
  return null;
}
