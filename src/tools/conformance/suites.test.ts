/**
 * The catalogue is data; these tests pin the data. The refusals are asserted
 * at least as hard as the frames: this is the module whose failure mode is
 * "froze the shared live Interface Server".
 */

import { RdoAction, RdoVerb } from '../../shared/types';
import { VOID_MEMBERS } from '../../server/session/rdo-request-guards';
import {
  KNOWN_PROCEDURES, SUITES, TYPES_SUITE, SEPARATORS_SUITE, ERRORS_SUITE, LIFECYCLE_SUITE, READS_SUITE, MUTATIONS_SUITE,
  allStepIds, assertPacketSafe, assertSuitesSafe, countParams, emitsVariantId, suiteByName,
} from './suites';
import { isImperativeStep } from './types';
import type { RdoStep, Suite } from './types';

describe('suites — static safety table', () => {
  it('folds every VOID_MEMBER in, with the arity read off its Pascal declaration', () => {
    for (const [member, declaration] of VOID_MEMBERS) {
      expect(KNOWN_PROCEDURES.get(member)).toEqual({ paramCount: countParams(declaration), declaration });
    }
    // The two profiles that bracket the mechanism.
    expect(KNOWN_PROCEDURES.get('SayThis')?.paramCount).toBe(2);
    expect(KNOWN_PROCEDURES.get('ClientAware')?.paramCount).toBe(0);
    expect(KNOWN_PROCEDURES.get('SetTycoonCookie')?.paramCount).toBe(3);
  });

  it('every entry cites File.pas:Line — a declaration, never a call site', () => {
    for (const [, proc] of KNOWN_PROCEDURES) {
      expect(proc.declaration).toMatch(/^procedure .*\.pas:\d+$/);
    }
  });

  it('countParams reads Delphi parameter groups', () => {
    expect(countParams('procedure ClientAware; — X.pas:1')).toBe(0);
    expect(countParams('procedure AddLine( line : widestring ) — X.pas:1')).toBe(1);
    expect(countParams('procedure SayThis( Dest, Msg : widestring ) — X.pas:1')).toBe(2);
    expect(countParams('procedure SetTycoonCookie( TycoonId : integer; CookieId, CookieValue : widestring ) — X.pas:1')).toBe(3);
  });

  it('emitsVariantId: call defaults to "^"; get/set never carry one', () => {
    expect(emitsVariantId({ verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'X' })).toBe(true);
    expect(emitsVariantId({ verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'X', separator: '"^"' })).toBe(true);
    expect(emitsVariantId({ verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'X', separator: '"*"' })).toBe(false);
    expect(emitsVariantId({ verb: RdoVerb.SEL, action: RdoAction.GET, member: 'X' })).toBe(false);
  });
});

describe('suites — assertPacketSafe / assertSuitesSafe', () => {
  const call = (member: string, separator?: string) => ({ verb: RdoVerb.SEL, action: RdoAction.CALL, member, separator });

  it('refuses "^" on a procedure with parameters, naming the freeze', () => {
    expect(() => assertPacketSafe(call('SayThis'), 't', true)).toThrow(/SayThis.*2 parameter.*froze/s);
    expect(() => assertPacketSafe(call('SetTycoonCookie'), 't', true)).toThrow(/3 parameter/);
    expect(() => assertPacketSafe(call('AddLine'), 't', false)).toThrow(/1 parameter/);
  });

  it('refuses "^" on a 0-parameter procedure unless the step declares the risk', () => {
    expect(() => assertPacketSafe(call('ClientAware'), 't', false)).toThrow(/error 9.*variant-on-procedure/);
    expect(() => assertPacketSafe(call('ClientAware'), 't', true)).not.toThrow();
  });

  it('lets "*" and unknown functions through', () => {
    expect(() => assertPacketSafe(call('SayThis', '"*"'), 't', false)).not.toThrow();
    expect(() => assertPacketSafe(call('GetTycoonCookie'), 't', false)).not.toThrow();
  });

  it('a suite with "^" on SayThis cannot exist', () => {
    const bad: Suite = {
      name: 'bad', description: '',
      steps: [{ id: 's', intent: '', target: 'clientView', packet: call('SayThis') }],
    };
    expect(() => assertSuitesSafe([bad])).toThrow(/bad\/s: refusing/);
  });

  it('a suite carrying a mutation must document its reset', () => {
    const bad: Suite = {
      name: 'm', description: '',
      steps: [{ id: 's', intent: '', target: 'clientView', risk: 'mutation', packet: { verb: RdoVerb.SEL, action: RdoAction.GET, member: 'X' } }],
    };
    expect(() => assertSuitesSafe([bad])).toThrow(/documents no reset/);
    expect(() => assertSuitesSafe([{ ...bad, reset: 'none needed' }])).not.toThrow();
  });

  it('the shipped catalogue passes its own guard (it is asserted at import)', () => {
    expect(() => assertSuitesSafe([...SUITES])).not.toThrow();
  });
});

describe('suites — catalogue shape', () => {
  it('is grouped by property, not by investigation', () => {
    expect(SUITES.map(s => s.name)).toEqual([
      'types', 'separators', 'errors', 'lifecycle', 'reads',
      'map', 'focus', 'inspector', 'chat', 'mail', 'politics', 'research',
      'mutations',
    ]);
    expect(suiteByName('u6')).toBeUndefined();
    expect(suiteByName('types')).toBe(TYPES_SUITE);
  });

  it('step ids are unique within a suite and addressable as suite/id', () => {
    for (const suite of SUITES) {
      const ids = suite.steps.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(allStepIds()).toContain('types/literal-double-fractional');
    expect(allStepIds()).toContain('separators/variant-on-zero-param-procedure');
  });

  it('every step has an intent and an oracle — the only observation is the push cadence', () => {
    const OBSERVATION_ONLY = new Set(['map/pushes-after-viewport']);
    for (const suite of SUITES) {
      for (const step of suite.steps) {
        expect(step.intent.length).toBeGreaterThan(10);
        if (!OBSERVATION_ONLY.has(`${suite.name}/${step.id}`)) expect(step.expect).toBeDefined();
      }
    }
  });

  it('only the mutations suite carries mutation steps, and it self-cleans', () => {
    for (const suite of SUITES) {
      const hasMutation = suite.steps.some(s => s.risk === 'mutation');
      expect(hasMutation).toBe(suite.name === 'mutations');
    }
    expect(MUTATIONS_SUITE.reset).toMatch(/SetTycoonCookie/);
    expect(MUTATIONS_SUITE.steps[MUTATIONS_SUITE.steps.length - 1].id).toBe('cookie-reset');
  });

  it('exactly one step emits "^" on a procedure, and it is the 0-parameter one', () => {
    const risky = SUITES.flatMap(s => s.steps.filter(st => st.risk === 'variant-on-procedure').map(st => ({ suite: s.name, step: st })));
    expect(risky).toHaveLength(1);
    const step = risky[0].step as RdoStep;
    expect(risky[0].suite).toBe('separators');
    expect(step.packet.member).toBe('ClientAware');
    expect(step.packet.args).toBeUndefined();
    expect(step.expect).toEqual({ kind: 'errorCode', value: 9, payload: /^error 9$/ });
  });

  it('the literal-parser steps target a property that must NOT exist, control first', () => {
    const literals = TYPES_SUITE.steps.filter((s): s is RdoStep => !isImperativeStep(s) && s.packet.action === RdoAction.SET);
    expect(literals.map(s => s.packet.args?.[0])).toEqual(['"#1"', '"#-1"', '"@1"', '"@1234.5"', '"!3.14"']);
    for (const s of literals) expect(s.packet.member).toBe('RdoConfProbe');
    expect(literals[0].id).toBe('literal-int-control');
  });

  it('every `get` in the catalogue carries no args and no separator — pure reads', () => {
    for (const suite of SUITES) {
      for (const step of suite.steps) {
        if (isImperativeStep(step) || step.packet.action !== RdoAction.GET) continue;
        expect(step.packet.args).toBeUndefined();
        expect(step.packet.separator).toBeUndefined();
      }
    }
  });

  it('shared-target suites never touch VOID_MEMBERS or SetTycoonCookie', () => {
    for (const suite of [TYPES_SUITE, SEPARATORS_SUITE, ERRORS_SUITE, LIFECYCLE_SUITE, READS_SUITE]) {
      for (const step of suite.steps) {
        if (isImperativeStep(step)) continue;
        expect(VOID_MEMBERS.has(step.packet.member)).toBe(false);
        expect(step.packet.member).not.toBe('SetTycoonCookie');
      }
    }
  });
});

describe('suites — imperative steps drive the context as declared', () => {
  function fakeCtx(reply = 'res="%ok"') {
    const emitted: Array<{ target: unknown; packet: unknown }> = [];
    const pushed: Array<{ target: unknown; packet: unknown }> = [];
    const ctx = {
      clientViewId: '32000416', interfaceServerId: '31929384', tycoonId: '37', username: 'SPO_test3',
      emit: async (target: unknown, packet: unknown) => { emitted.push({ target, packet }); return { response: reply, elapsedMs: 1 }; },
      push: async (target: unknown, packet: unknown) => { pushed.push({ target, packet }); },
      scenario: async () => ({ response: reply, elapsedMs: 1 }),
      session: {} as unknown as import('./types').SessionDriver,
      wire: {} as unknown as import('./wire-view').WireView,
      state: new Map<string, unknown>(),
    } as unknown as import('./types').StepContext;
    return { ctx, emitted, pushed };
  }
  const imperative = (suite: Suite, id: string) => {
    const step = suite.steps.find(s => s.id === id);
    if (!step || !isImperativeStep(step)) throw new Error(`expected imperative step ${id}`);
    return step;
  };

  it('GetTycoonCookie steps pass the TycoonId as `#` and the key as `%`', async () => {
    const { ctx, emitted } = fakeCtx();
    await imperative(TYPES_SUITE, 'olevariant-function-result').run(ctx);
    expect(emitted).toEqual([{ target: 'clientView', packet: { verb: 'sel', action: 'call', member: 'GetTycoonCookie', args: ['"#37"', '"%"'] } }]);
  });

  it('PickEvent carries the TycoonId', async () => {
    const { ctx, emitted } = fakeCtx();
    await imperative(LIFECYCLE_SUITE, 'pick-event').run(ctx);
    expect(emitted[0].packet).toEqual({ verb: 'sel', action: 'call', member: 'PickEvent', args: ['"#37"'] });
  });

  it('the cookie-blob predicate accepts Key=Value lines and the empty blob, rejects anything else', () => {
    const expectation = imperative(READS_SUITE, 'tycoon-cookie-blob').expect!;
    if (expectation.kind !== 'predicate') throw new Error('expected predicate');
    const ok = (response: string | null) => expectation.test({ response, elapsedMs: 1 });
    expect(ok('res="%LastX.0=467\nLastY.0=395\nLastTimeOnline=2026-02-18\n"')).toBe(true);
    expect(ok('res="%"')).toBe(true);
    expect(ok('res="%not a pair"')).toBe(false);
    expect(ok('error 2')).toBe(false);
    expect(ok(null)).toBe(false);
  });

  it('cookie-round-trip pushes SetTycoonCookie as a void call, then reads it back with "^"', async () => {
    const { ctx, emitted, pushed } = fakeCtx();
    await imperative(MUTATIONS_SUITE, 'cookie-round-trip').run(ctx);
    expect(pushed).toEqual([{ target: 'clientView', packet: { verb: 'sel', action: 'call', member: 'SetTycoonCookie', args: ['"#37"', '"%RdoConformance"', '"%ok"'] } }]);
    expect(emitted).toEqual([{ target: 'clientView', packet: { verb: 'sel', action: 'call', member: 'GetTycoonCookie', args: ['"#37"', '"%RdoConformance"'] } }]);
  });

  it('cookie-reset clears the cookie and expects the empty read-back', async () => {
    const { ctx, pushed } = fakeCtx();
    const step = imperative(MUTATIONS_SUITE, 'cookie-reset');
    await step.run(ctx);
    expect(pushed[0].packet).toEqual({ verb: 'sel', action: 'call', member: 'SetTycoonCookie', args: ['"#37"', '"%RdoConformance"', '"%"'] });
    expect(step.expect).toEqual({ kind: 'exact', value: 'res="%"' });
  });

  it('say-this-void-ack uses "*" WITH a QueryId (the VOID_MEMBERS form), whispering to self', async () => {
    const { ctx, emitted } = fakeCtx();
    const step = imperative(MUTATIONS_SUITE, 'say-this-void-ack');
    await step.run(ctx);
    expect(emitted[0].packet).toEqual({
      verb: 'sel', action: 'call', member: 'SayThis', separator: '"*"', args: ['"%SPO_test3"', '"%rdo-conformance ping"'],
    });
    expect(step.expect).toEqual({ kind: 'exact', value: '' });
  });
});
