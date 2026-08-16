/**
 * JSON payloads for the two observation-mode readouts.
 *
 * They live here rather than inline in `server.ts` because that file is the
 * HTTP/WS bootstrap and sits at 0 % coverage — anything written into it is
 * untestable by construction. The route wiring stays there; the shape of what
 * these endpoints return is decided here, where it can be asserted.
 *
 * Both readouts exist for the same reason: an observation mode whose census
 * nobody can read is not an observation mode. `handleRdoErrorResponse` had been
 * tallying since P-M3 went in, and the tally died with the process.
 */

import { getErrorContractTally } from './rdo-error-contract';
import { getPropertyFallbackCensus } from './property-fallback-census';

export interface ErrorContractReadout {
  /** `observe` or `reject` — what the contract is doing right now. */
  mode: string;
  /** Distinct member × errorCode pairs seen. */
  distinct: number;
  /** Total error replies observed. */
  total: number;
  entries: Array<{
    member: string;
    action?: string;
    errorCode: number;
    errorName?: string;
    socket: string;
    count: number;
  }>;
}

/**
 * P-M3 census: every `A<id> error N;` reply the transport resolved anyway.
 *
 * This is the list to triage before flipping `RDO_ERROR_CONTRACT=reject` — each
 * distinct entry is a call site that would start throwing.
 */
export function buildErrorContractReadout(mode: string): ErrorContractReadout {
  const tally = getErrorContractTally();
  return {
    mode,
    distinct: tally.length,
    total: tally.reduce((sum, e) => sum + e.count, 0),
    entries: tally.map(({ observation, count }) => ({
      member: observation.member,
      action: observation.action,
      errorCode: observation.errorCode,
      errorName: observation.errorName,
      socket: observation.socketName,
      count,
    })),
  };
}

export interface PropertyFallbackReadout {
  distinct: number;
  total: number;
  /**
   * Occurrences where the payload WAS structured — the caller received another
   * property's text. The only number worth acting on.
   */
  suspect: number;
  entries: Array<{
    property: string;
    structured: boolean;
    sample: string;
    count: number;
  }>;
}

/**
 * `parsePropertyResponse` fallback census.
 *
 * `suspect` is deliberately separated from `total`: the fallback is
 * load-bearing for bare-value responses, so a high total means nothing on its
 * own. A non-zero `suspect` is what says a caller got the wrong property.
 */
export function buildPropertyFallbackReadout(): PropertyFallbackReadout {
  const census = getPropertyFallbackCensus();
  return {
    distinct: census.length,
    total: census.reduce((sum, e) => sum + e.count, 0),
    suspect: census
      .filter(e => e.observation.structuredPayload)
      .reduce((sum, e) => sum + e.count, 0),
    entries: census.map(({ observation, count }) => ({
      property: observation.propName,
      structured: observation.structuredPayload,
      sample: observation.sample,
      count,
    })),
  };
}
