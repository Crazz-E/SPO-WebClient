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

function withContract(mode: 'observe' | 'reject', run: () => void): void {
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

describe('observe mode (the default)', () => {
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

  it('still records the observation, so the census survives the flip', () => {
    withContract('reject', () => {
      handleRdoErrorResponse(OBSERVATION, { warn: jest.fn() });
      expect(getErrorContractTally()).toHaveLength(1);
    });
  });
});
