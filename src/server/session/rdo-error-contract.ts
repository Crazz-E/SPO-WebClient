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

  if (config.rdo.errorContract === 'reject') {
    return new RdoServerError(observation);
  }

  // Observe mode. One line per error reply, tagged so the census is greppable:
  //   grep RDO-CONTRACT logs/*.ndjson
  log.warn(
    `[RDO-CONTRACT] would reject: ${observation.member} -> ${observation.errorName ?? 'error'} ` +
    `(code ${observation.errorCode}) on ${observation.socketName} ` +
    `[seen ${occurrences}x] — resolving anyway (config.rdo.errorContract=observe)`
  );
  return null;
}
