import {
  handleRdoErrorResponse,
  getErrorContractTally,
  resetErrorContractTally,
  RdoServerError,
} from './rdo-error-contract';
import { config } from '../../shared/config';

/**
 * P-M3 — `A<id> error N;` is a well-formed reply, so the transport resolves the
 * promise and leaves `packet.errorCode` for the caller. Across 93 call sites,
 * no caller reads it: a refused mutation is delivered as a success.
 *
 * Decision D4 (developer, 2026-08-15): measure first, then flip. `observe`
 * changes nothing and records the census; `reject` is the end state.
 */

function withContract(mode: 'observe' | 'reject-except-stale' | 'reject', run: () => void): void {
  const original = config.rdo.errorContract;
  (config.rdo as { errorContract: string }).errorContract = mode;
  try {
    run();
  } finally {
    (config.rdo as { errorContract: string }).errorContract = original;
  }
}

const OBSERVATION = {
  socketName: 'construction',
  member: 'RDODelFacility',
  errorCode: 9,
  errorName: 'errIllegalFunctionRes',
  rid: 42,
};

beforeEach(() => resetErrorContractTally());

describe('observe mode', () => {
  it('does not reject — behaviour is unchanged', () => {
    withContract('observe', () => {
      const log = { warn: jest.fn() };
      expect(handleRdoErrorResponse(OBSERVATION, log)).toBeNull();
    });
  });

  // The log line IS the deliverable: it is the list that has to be triaged
  // before the contract can be flipped, so it must be greppable and name the
  // member and code.
  it('emits a greppable RDO-CONTRACT line naming member and code', () => {
    withContract('observe', () => {
      const log = { warn: jest.fn() };
      handleRdoErrorResponse(OBSERVATION, log);

      const line = log.warn.mock.calls[0][0] as string;
      expect(line).toContain('[RDO-CONTRACT]');
      expect(line).toContain('RDODelFacility');
      expect(line).toContain('code 9');
    });
  });

  it('counts repeats instead of drowning the log in duplicates', () => {
    withContract('observe', () => {
      const log = { warn: jest.fn() };
      handleRdoErrorResponse(OBSERVATION, log);
      handleRdoErrorResponse(OBSERVATION, log);
      handleRdoErrorResponse(OBSERVATION, log);

      expect(log.warn.mock.calls[2][0]).toContain('seen 3x');
      expect(getErrorContractTally()).toEqual([
        { observation: OBSERVATION, count: 3 },
      ]);
    });
  });

  it('separates different error codes on the same member', () => {
    withContract('observe', () => {
      const log = { warn: jest.fn() };
      handleRdoErrorResponse(OBSERVATION, log);
      handleRdoErrorResponse({ ...OBSERVATION, errorCode: 5 }, log);

      expect(getErrorContractTally()).toHaveLength(2);
    });
  });

  it('ranks the tally most frequent first — that is the triage order', () => {
    withContract('observe', () => {
      const log = { warn: jest.fn() };
      handleRdoErrorResponse({ ...OBSERVATION, member: 'Rare' }, log);
      handleRdoErrorResponse({ ...OBSERVATION, member: 'Common' }, log);
      handleRdoErrorResponse({ ...OBSERVATION, member: 'Common' }, log);

      expect(getErrorContractTally()[0].observation.member).toBe('Common');
    });
  });
});

describe('reject mode (the end state)', () => {
  it('returns a typed error carrying the protocol code', () => {
    withContract('reject', () => {
      const log = { warn: jest.fn() };
      const error = handleRdoErrorResponse(OBSERVATION, log);

      expect(error).toBeInstanceOf(RdoServerError);
      expect(error!.errorCode).toBe(9);
      expect(error!.member).toBe('RDODelFacility');
    });
  });

  // The conformance suite diffs replies against a baseline, and a baseline of
  // `error 3` cannot tell `error 3 setting X` from `error 3 getting X`.
  it('carries the raw reply payload when the call site supplies it', () => {
    withContract('reject', () => {
      const error = handleRdoErrorResponse(
        { ...OBSERVATION, errorCode: 3, payload: 'error 3 setting RdoProbeU4' },
        { warn: jest.fn() },
      );
      expect(error!.payload).toBe('error 3 setting RdoProbeU4');
    });
  });

  it('falls back to `error <code>` when no payload was supplied', () => {
    withContract('reject', () => {
      const error = handleRdoErrorResponse(OBSERVATION, { warn: jest.fn() });
      expect(error!.payload).toBe('error 9');
    });
  });

  it('still records the observation, so the census survives the flip', () => {
    withContract('reject', () => {
      handleRdoErrorResponse(OBSERVATION, { warn: jest.fn() });
      expect(getErrorContractTally()).toHaveLength(1);
    });
  });
});

// =============================================================================
// The flip — `reject-except-stale`, default since 2026-08-16
//
// Derived from the Delphi source rather than from traffic
// (report/pm3-inventaire-codes-erreur.md): the error code follows the VERB
// SHAPE, because GetProperty / SetProperty / CallMethod have disjoint outputs.
// =============================================================================

/** RECOVERABLE per classifyRdoError — owned by executeWithRetry. */
const RECOVERABLE_CODES = [8, 10, 11, 13, 14, 17];
/** Programming errors the flip is meant to surface. */
const PROGRAMMING_ERROR_CODES = [1, 3, 4, 5, 6, 7, 9];

describe('reject-except-stale — the first flip', () => {
  const silent = { warn: jest.fn() };

  it.each(PROGRAMMING_ERROR_CODES)(
    'rejects code %i — a silent programming error is exactly what the flip is for',
    code => {
      withContract('reject-except-stale', () => {
        const err = handleRdoErrorResponse({ socketName: 'world', member: 'M', errorCode: code }, silent);
        expect(err).toBeInstanceOf(RdoServerError);
        expect((err as RdoServerError).errorCode).toBe(code);
      });
    },
  );

  it('lets errIllegalObject (2) through — it happens in normal play', () => {
    // Stale ClientViewId after a session expires, a building id demolished
    // between read and write, a cacherId gone after reconnect. Code that copes
    // with these today would start throwing.
    withContract('reject-except-stale', () => {
      expect(handleRdoErrorResponse(
        { socketName: 'world', member: 'ObjectAt', errorCode: 2, errorName: 'errIllegalObject' },
        silent,
      )).toBeNull();
    });
  });

  it('still censuses what it does not reject', () => {
    // The exemption must not become a blind spot: code 2 is exactly what the
    // next decision needs frequencies for.
    withContract('reject-except-stale', () => {
      handleRdoErrorResponse({ socketName: 'world', member: 'ObjectAt', errorCode: 2 }, silent);
      expect(getErrorContractTally()).toHaveLength(1);
      expect(getErrorContractTally()[0].observation.errorCode).toBe(2);
    });
  });

  it('rejects errIllegalObject once the mode is full reject', () => {
    withContract('reject', () => {
      expect(handleRdoErrorResponse(
        { socketName: 'world', member: 'ObjectAt', errorCode: 2 }, silent,
      )).toBeInstanceOf(RdoServerError);
    });
  });
});

// =============================================================================
// The invariant. This is the one that would have been a real regression.
// =============================================================================
describe('RECOVERABLE codes are never rejected, in ANY mode', () => {
  const silent = { warn: jest.fn() };

  // executeWithRetry inspects result.errorCode on the RESOLVED packet. Reject
  // one of these and the promise settles first, so the retry never runs — the
  // flip would have silently disabled auto-retry for timeouts, send errors and
  // ServerBusy. The contract and the retry classifier partition the codes.
  it.each(RECOVERABLE_CODES)('does not reject code %i in reject-except-stale', code => {
    withContract('reject-except-stale', () => {
      expect(handleRdoErrorResponse({ socketName: 'world', member: 'M', errorCode: code }, silent)).toBeNull();
    });
  });

  it.each(RECOVERABLE_CODES)('does not reject code %i in full reject either', code => {
    // Not a first-step concession — a structural requirement that survives the
    // second flip too.
    withContract('reject', () => {
      expect(handleRdoErrorResponse({ socketName: 'world', member: 'M', errorCode: code }, silent)).toBeNull();
    });
  });

  it('says WHY it resolved, so the log distinguishes recoverable from exempt', () => {
    withContract('reject-except-stale', () => {
      const log = { warn: jest.fn() };
      handleRdoErrorResponse({ socketName: 'world', member: 'M', errorCode: 17 }, log);
      expect(log.warn.mock.calls[0][0]).toMatch(/recoverable.*executeWithRetry/);

      const log2 = { warn: jest.fn() };
      handleRdoErrorResponse({ socketName: 'world', member: 'M', errorCode: 2 }, log2);
      expect(log2.warn.mock.calls[0][0]).toMatch(/exempt in reject-except-stale/);
    });
  });
});
