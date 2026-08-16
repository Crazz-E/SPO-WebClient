import { buildErrorContractReadout, buildPropertyFallbackReadout } from './diagnostics-readouts';
import { handleRdoErrorResponse, resetErrorContractTally } from './rdo-error-contract';
import { recordPropertyFallback, resetPropertyFallbackCensus } from './property-fallback-census';

const silentLog = { warn: () => { /* observation mode logs; not under test here */ } };

describe('buildErrorContractReadout — the P-M3 triage list', () => {
  beforeEach(() => resetErrorContractTally());

  it('reports an empty census without inventing entries', () => {
    const readout = buildErrorContractReadout('observe');
    expect(readout).toEqual({ mode: 'observe', distinct: 0, total: 0, entries: [] });
  });

  it('echoes the mode it was given, so the reader knows what is live', () => {
    // Reading a census without knowing whether the contract is already
    // rejecting would make the numbers unactionable.
    expect(buildErrorContractReadout('reject').mode).toBe('reject');
  });

  it('separates distinct pairs from total occurrences', () => {
    handleRdoErrorResponse({ socketName: 'world', member: 'Foo', errorCode: 3 }, silentLog);
    handleRdoErrorResponse({ socketName: 'world', member: 'Foo', errorCode: 3 }, silentLog);
    handleRdoErrorResponse({ socketName: 'world', member: 'Bar', errorCode: 9 }, silentLog);

    const readout = buildErrorContractReadout('observe');
    // Two call sites would start throwing; they did so three times.
    expect(readout.distinct).toBe(2);
    expect(readout.total).toBe(3);
  });

  it('keeps the same member apart when the error code differs', () => {
    // Same member failing two different ways is two triage decisions, not one.
    handleRdoErrorResponse({ socketName: 'world', member: 'Foo', errorCode: 3 }, silentLog);
    handleRdoErrorResponse({ socketName: 'world', member: 'Foo', errorCode: 9 }, silentLog);

    expect(buildErrorContractReadout('observe').distinct).toBe(2);
  });

  it('carries every field the triage needs, most frequent first', () => {
    handleRdoErrorResponse({ socketName: 'mail', member: 'Rare', errorCode: 1 }, silentLog);
    handleRdoErrorResponse(
      { socketName: 'world', member: 'Common', action: 'set', errorCode: 3, errorName: 'errUnexistentProperty', rid: 42 },
      silentLog,
    );
    handleRdoErrorResponse(
      { socketName: 'world', member: 'Common', action: 'set', errorCode: 3, errorName: 'errUnexistentProperty' },
      silentLog,
    );

    const [first, second] = buildErrorContractReadout('observe').entries;
    expect(first).toEqual({
      member: 'Common', action: 'set', errorCode: 3,
      errorName: 'errUnexistentProperty', socket: 'world', count: 2,
    });
    expect(second.member).toBe('Rare');
  });

  it('reproduces the shape observed live on 2026-08-16 (U4-a)', () => {
    // Four `set RdoProbeU4` frames, all answered `error 3` — one member, one
    // code, four occurrences. The first real entries in this census.
    for (let i = 0; i < 4; i++) {
      handleRdoErrorResponse(
        { socketName: 'world', member: 'RdoProbeU4', action: 'set', errorCode: 3, errorName: 'errUnexistentProperty' },
        silentLog,
      );
    }
    const readout = buildErrorContractReadout('observe');
    expect(readout).toMatchObject({ distinct: 1, total: 4 });
    expect(readout.entries[0]).toMatchObject({ member: 'RdoProbeU4', errorCode: 3, count: 4 });
  });
});

describe('buildPropertyFallbackReadout — measuring before changing', () => {
  beforeEach(() => resetPropertyFallbackCensus());

  it('reports an empty census without inventing entries', () => {
    expect(buildPropertyFallbackReadout()).toEqual({
      distinct: 0, total: 0, suspect: 0, entries: [],
    });
  });

  it('counts only structured payloads as suspect', () => {
    // The whole point of the readout. A bare value means the fallback did its
    // job; a structured payload means the caller got another property's text.
    recordPropertyFallback('Bare', 'plain');
    recordPropertyFallback('Bare', 'plain');
    recordPropertyFallback('Wrong', 'Other="#1"');

    const readout = buildPropertyFallbackReadout();
    expect(readout.total).toBe(3);
    expect(readout.suspect).toBe(1);
  });

  it('never reports suspect when every fallback was a bare value', () => {
    // A high `total` with zero `suspect` is a healthy result, not a problem —
    // reading `total` alone would misdirect the triage.
    recordPropertyFallback('A', '42');
    recordPropertyFallback('B', 'hello');

    const readout = buildPropertyFallbackReadout();
    expect(readout.total).toBe(2);
    expect(readout.suspect).toBe(0);
  });

  it('exposes the property, its shape and a sample, most frequent first', () => {
    recordPropertyFallback('Rare', 'x');
    recordPropertyFallback('Tax.Id', 'Tax0Id="#5"');
    recordPropertyFallback('Tax.Id', 'Tax0Id="#6"');

    const [first] = buildPropertyFallbackReadout().entries;
    expect(first).toEqual({
      property: 'Tax.Id', structured: true, sample: 'Tax0Id="#5"', count: 2,
    });
  });
});
