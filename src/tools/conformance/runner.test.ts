import type { Socket } from 'net';
import { RdoAction, RdoVerb } from '../../shared/types';
import type { RdoPacket } from '../../shared/types';
import { TimeoutCategory } from '../../shared/timeout-categories';
import { RdoServerError } from '../../server/session/rdo-error-contract';
import { SESSION_LIFECYCLE_MEMBERS } from '../../server/session/rdo-request-guards';
import {
  ConformanceRunner, DEFAULT_FRAME_BUDGET, LIFECYCLE_ADJUDICATED, MAX_CONSECUTIVE_ERRORS,
  describeFrame, emitRequest, refusalReason, selectSteps,
} from './runner';
import type { RunPolicy, SessionDriver } from './runner';
import { MUTATIONS_SUITE, SEPARATORS_SUITE, SUITES, TYPES_SUITE } from './suites';
import { isImperativeStep } from './types';
import type { Suite } from './types';

const CV = '32000416';
const IS = '31929384';

/** runStep() returns `{ skipped }` for a self-skipping step; the tests below expect a report. */
async function ran(p: Promise<import('./types').StepReport | { skipped: string }>): Promise<import('./types').StepReport> {
  const r = await p;
  if ('skipped' in r) throw new Error(`unexpected skip: ${r.skipped}`);
  return r;
}

function fakeSession(sendRdoRequest: jest.Mock, socket?: Partial<Socket>): SessionDriver & { sendRdoRequest: jest.Mock } {
  return {
    sendRdoRequest,
    getSocket: () => socket as Socket | undefined,
    worldContextId: CV,
    interfaceServerId: IS,
    tycoonId: '37',
  } as unknown as SessionDriver & { sendRdoRequest: jest.Mock };
}

const reply = (payload: string, errorCode?: number): Promise<RdoPacket> =>
  Promise.resolve({ raw: '', type: 'RESPONSE', rid: 1, payload, ...(errorCode ? { errorCode } : {}) } as RdoPacket);

const policy = (over: Partial<RunPolicy> = {}): RunPolicy => ({
  target: 'shared', allowMutations: false, allowVariantOnProcedure: false,
  frameBudget: DEFAULT_FRAME_BUDGET, username: 'SPO_test3', ...over,
});

describe('runner — selection', () => {
  it('shared target skips mutations, dedicated runs them', () => {
    const shared = selectSteps(MUTATIONS_SUITE, policy());
    expect(shared.run).toHaveLength(0);
    expect(shared.skipped.map(s => s.reason)).toEqual(expect.arrayContaining([expect.stringMatching(/--target dedicated/)]));
    expect(selectSteps(MUTATIONS_SUITE, policy({ target: 'dedicated' })).run).toHaveLength(MUTATIONS_SUITE.steps.length);
  });

  // The honest route: the intent is declared on the command line rather than by
  // relabelling a mutation step `risk: 'read'`.
  it('--allow-mutations runs mutations on a shared target, and says so', () => {
    const allowed = selectSteps(MUTATIONS_SUITE, policy({ allowMutations: true }));
    expect(allowed.run).toHaveLength(MUTATIONS_SUITE.steps.length);
    expect(allowed.skipped).toEqual([]);
    expect(refusalReason(MUTATIONS_SUITE.steps[0], policy())).toMatch(/--allow-mutations/);
  });

  it('the "^"-on-procedure step needs its flag on every target', () => {
    const without = selectSteps(SEPARATORS_SUITE, policy({ target: 'dedicated' }));
    expect(without.skipped.map(s => s.id)).toEqual(['variant-on-zero-param-procedure']);
    expect(without.skipped[0].reason).toMatch(/error 9/);
    const withFlag = selectSteps(SEPARATORS_SUITE, policy({ allowVariantOnProcedure: true }));
    expect(withFlag.skipped).toEqual([]);
  });

  // The old text read "settled live 2026-08-16: error 9; re-running buys
  // nothing". The gate is not on the knowledge, it is on the EXECUTION: the
  // server runs the method body on the live account either way.
  it('the refusal no longer claims re-running buys nothing', () => {
    const reason = refusalReason(SEPARATORS_SUITE.steps[2], policy())!;
    expect(reason).not.toMatch(/buys nothing/);
    expect(reason).toMatch(/below 2 emitted arguments/);
  });

  // MEASURED in R1 (2026-08-18), not guessed: a full offline replay of the whole
  // catalogue draws 66 frames, 69 with --allow-mutations. 3000 sized the
  // certification sweep, which no longer exists. A cap a run routinely hits is a
  // cap that gets raised on the command line and stops meaning anything, so the
  // headroom is deliberate — but it is headroom over a measurement.
  it('the default frame budget is the measured draw plus room for the R4 parcours', () => {
    expect(DEFAULT_FRAME_BUDGET).toBe(600);
    // ~8x the 69 frames the full catalogue draws today. Both bounds are asserted:
    // too low starves R4, too high stops bounding anything.
    expect(DEFAULT_FRAME_BUDGET).toBeGreaterThan(69 * 4);
    expect(DEFAULT_FRAME_BUDGET).toBeLessThan(69 * 16);
  });

  it('--only restricts to named steps without reporting the rest as skipped', () => {
    const sel = selectSteps(TYPES_SUITE, policy({ only: new Set(['types/literal-int-control']) }));
    expect(sel.run.map(s => s.id)).toEqual(['literal-int-control']);
    expect(sel.skipped).toEqual([]);
  });

  it('refusalReason is null for a plain read', () => {
    expect(refusalReason(TYPES_SUITE.steps[0], policy())).toBeNull();
  });
});

describe('runner — describeFrame', () => {
  it('renders the production frame without a QueryId, request separator by default', () => {
    expect(describeFrame(CV, { verb: RdoVerb.SEL, action: RdoAction.GET, member: 'UserName' }, true)).toBe(`C sel ${CV} get UserName`);
    expect(describeFrame(CV, { verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'PickEvent', args: ['"#37"'] }, true))
      .toBe(`C sel ${CV} call PickEvent "^" "#37"`);
    expect(describeFrame(CV, { verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'ClientAware' }, false))
      .toBe(`C sel ${CV} call ClientAware "*"`);
    expect(describeFrame(CV, { verb: RdoVerb.SEL, action: RdoAction.SET, member: 'EnableEvents', args: ['"#-1"'] }, true))
      .toBe(`C sel ${CV} set EnableEvents="#-1"`);
  });
});

describe('runner — emitRequest', () => {
  const packet = { verb: RdoVerb.SEL, action: RdoAction.GET, member: 'UserName' };

  it('goes through sendRdoRequest on the world socket at the FAST deadline', async () => {
    const send = jest.fn().mockReturnValue(reply('UserName="$SPO_test3"'));
    const out = await emitRequest(fakeSession(send), CV, packet);
    expect(send).toHaveBeenCalledWith('world', { ...packet, targetId: CV }, undefined, TimeoutCategory.FAST);
    expect(out).toEqual({ response: 'UserName="$SPO_test3"', elapsedMs: expect.any(Number) });
  });

  it('observe mode: an error reply resolves with errorCode and the raw payload', async () => {
    const send = jest.fn().mockReturnValue(reply('error 3 setting RdoConfProbe', 3));
    const out = await emitRequest(fakeSession(send), CV, packet);
    expect(out.errorCode).toBe(3);
    expect(out.response).toBe('error 3 setting RdoConfProbe');
  });

  it('reject mode: RdoServerError is an ANSWER carrying its payload, not a failure', async () => {
    const send = jest.fn().mockRejectedValue(new RdoServerError({
      socketName: 'world', member: 'ClientAware', errorCode: 9, errorName: 'errIllegalFunctionRes', payload: 'error 9',
    }));
    const out = await emitRequest(fakeSession(send), CV, packet);
    expect(out).toMatchObject({ response: 'error 9', errorCode: 9 });
    expect(out.error).toBeUndefined();
  });

  it('a timeout is silence: response null, error kept', async () => {
    const send = jest.fn().mockRejectedValue(new Error('Request timeout'));
    const out = await emitRequest(fakeSession(send), CV, packet);
    expect(out.response).toBeNull();
    expect(out.error).toMatch(/Request timeout/);
  });

  it('an empty ack `A<id> ;` is an empty-string answer, not silence', async () => {
    const send = jest.fn().mockReturnValue(reply(''));
    const out = await emitRequest(fakeSession(send), CV, packet);
    expect(out.response).toBe('');
  });

  // Edition 4: FAST (60 s) is right for a property read and wrong for a
  // mutation — the reference client waits 180 s (ISProxyTimeOut), and a step
  // failed at 60 s reads as silence, which ends the whole run.
  it('the deadline category is the caller\'s choice, FAST only by default', async () => {
    const send = jest.fn().mockReturnValue(reply('ok'));
    await emitRequest(fakeSession(send), CV, packet, TimeoutCategory.SLOW);
    expect(send).toHaveBeenCalledWith('world', { ...packet, targetId: CV }, undefined, TimeoutCategory.SLOW);
  });

  // There used to be a `probe` opt-in here, carried on the packet so that
  // `assertNotVoidPush` — then documented as a convention — would let a
  // `"*"` + QueryId sweep frame through. On 2026-08-18 the one such frame that
  // reached a function (`call GetUserList "*"`) left the shared Interface
  // Server answering errMalformedQuery to every query. The opt-in is gone; the
  // packet carries nothing that could reopen it.
  it('hands the packet to sendRdoRequest verbatim, with nothing added', async () => {
    const send = jest.fn().mockReturnValue(reply(''));
    const packet = { verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'RdoConfNeverSeen' };
    await emitRequest(fakeSession(send), CV, packet);
    expect(send.mock.calls[0][1]).toEqual({ ...packet, targetId: CV });
    expect(Object.keys(send.mock.calls[0][1] as object)).not.toContain('probe');
  });
});

describe('runner — ConformanceRunner', () => {
  const suite: Suite = {
    name: 't', description: '',
    steps: [
      { id: 'a', intent: 'a', target: 'clientView', packet: { verb: RdoVerb.SEL, action: RdoAction.GET, member: 'A' }, expect: { kind: 'exact', value: 'A="#1"' } },
      { id: 'b', intent: 'b', target: 'interfaceServer', packet: { verb: RdoVerb.SEL, action: RdoAction.GET, member: 'B' }, expect: { kind: 'exact', value: 'B="#2"' } },
      { id: 'c', intent: 'c', target: 'clientView', packet: { verb: RdoVerb.SEL, action: RdoAction.GET, member: 'C' } },
    ],
  };

  it('runs steps in order, resolves targets, reports as it goes, verdicts each', async () => {
    const send = jest.fn()
      .mockReturnValueOnce(reply('A="#1"'))
      .mockReturnValueOnce(reply('B="#9"'))
      .mockReturnValueOnce(reply('C="#3"'));
    const seen: string[] = [];
    const runner = new ConformanceRunner(fakeSession(send), policy(), { onStep: r => seen.push(`${r.id}:${r.verdict.kind}`) });

    const report = await runner.runSuite(suite);
    expect(send.mock.calls.map(c => c[1].targetId)).toEqual([CV, IS, CV]);
    expect(seen).toEqual(['a:PASS', 'b:FAIL', 'c:UNKNOWN']);
    expect(report.steps.map(s => s.frame)).toEqual([`C sel ${CV} get A`, `C sel ${IS} get B`, `C sel ${CV} get C`]);
    expect(report.stoppedOnSilence).toBe(false);
    expect(runner.emitted).toBe(3);
  });

  it('stops at the first unanswered frame — nothing further goes out', async () => {
    const send = jest.fn()
      .mockReturnValueOnce(reply('A="#1"'))
      .mockRejectedValueOnce(new Error('Request timeout'))
      .mockReturnValueOnce(reply('C="#3"'));
    const runner = new ConformanceRunner(fakeSession(send), policy());
    const report = await runner.runSuite(suite);
    expect(send).toHaveBeenCalledTimes(2);
    expect(report.steps).toHaveLength(2);
    expect(report.stoppedOnSilence).toBe(true);
    expect(report.steps[1].verdict.kind).toBe('FAIL');
  });

  // Edition 7: a gel is a test result, and without attribution it teaches
  // nothing. The break happens at the FIRST silence, so the last frame out is
  // the suspect — no ISCnx window, no isolated wave needed to read it.
  it('attributes the stop: the record names the frame, the member and the step', async () => {
    const send = jest.fn()
      .mockReturnValueOnce(reply('A="#1"'))
      .mockRejectedValueOnce(new Error('Request timeout'));
    const halts: import('./types').HaltRecord[] = [];
    const runner = new ConformanceRunner(fakeSession(send), policy(), { onHalt: r => halts.push(r) });

    const report = await runner.runSuite(suite);
    expect(report.halt).toBeDefined();
    expect(report.halt).toMatchObject({
      where: 't/b', member: 'B', socket: 'world', clientViewId: CV,
      lastFrame: `C sel ${IS} get B`,
    });
    expect(report.halt!.reason).toMatch(/no answer at t\/b.*Request timeout/);
    expect(new Date(report.halt!.at).toISOString()).toBe(report.halt!.at);
    // The hook fires once, as it happens, with the same record.
    expect(halts).toEqual([report.halt]);
  });

  it('attributes an imperative stop by its last outgoing frame, with no member to name', async () => {
    const send = jest.fn();
    const runner = new ConformanceRunner(fakeSession(send), policy({ target: 'dedicated' }));
    const rogue: Suite = {
      name: 'r', description: '', reset: 'n/a',
      steps: [{ id: 'x', intent: 'x', run: () => Promise.reject(new Error('boom')) }],
    };
    const report = await runner.runSuite(rogue);
    expect(report.halt).toMatchObject({ where: 'r/x', member: null, lastFrame: null });
    expect(report.halt!.reason).toMatch(/boom/);
  });

  it('a suite that answers everything carries no halt record', async () => {
    const send = jest.fn().mockReturnValue(reply('A="#1"'));
    const halts: unknown[] = [];
    const runner = new ConformanceRunner(fakeSession(send), policy(), { onHalt: r => halts.push(r) });
    const report = await runner.runSuite(suite);
    expect(report.halt).toBeUndefined();
    expect('halt' in report).toBe(false);
    expect(halts).toEqual([]);
  });

  it('runAll ends the run after a suite stopped on silence', async () => {
    const send = jest.fn().mockRejectedValue(new Error('Request timeout'));
    const runner = new ConformanceRunner(fakeSession(send), policy());
    const reports = await runner.runAll([suite, { ...suite, name: 'u' }]);
    expect(reports).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reports skipped steps through the hook and in the suite report', async () => {
    const send = jest.fn().mockReturnValue(reply('res="%"'));
    const skips: string[] = [];
    const runner = new ConformanceRunner(fakeSession(send), policy(), { onSkip: (s, id) => skips.push(`${s}/${id}`) });
    const report = await runner.runSuite(MUTATIONS_SUITE);
    expect(skips).toEqual(MUTATIONS_SUITE.steps.map(s => `mutations/${s.id}`));
    expect(report.skipped).toHaveLength(MUTATIONS_SUITE.steps.length);
    expect(send).not.toHaveBeenCalled();
  });

  it('imperative steps get a context that emits, pushes, and knows the login values', async () => {
    const written: string[] = [];
    const socket = { write: (b: Buffer) => { written.push(b.toString('latin1')); return true; }, destroyed: false } as unknown as Socket;
    const send = jest.fn().mockReturnValue(reply('res="%ok"'));
    const runner = new ConformanceRunner(fakeSession(send, socket), policy({ target: 'dedicated' }));

    const report = await ran(runner.runStep(MUTATIONS_SUITE, MUTATIONS_SUITE.steps[0]));
    // The push went out as "*" without a QueryId, through writeRdoFrame.
    expect(written).toEqual([`C sel ${CV} call SetTycoonCookie "*" "#37","%RdoConformance","%ok";`]);
    expect(send).toHaveBeenCalledWith('world', expect.objectContaining({ member: 'GetTycoonCookie', targetId: CV }), undefined, TimeoutCategory.FAST);
    expect(report.verdict.kind).toBe('PASS');
    expect(report.frame).toBeUndefined();
    expect(runner.emitted).toBe(2);
  });

  it('an imperative step that emits "^" on a procedure with parameters is refused before the wire', async () => {
    const send = jest.fn();
    const runner = new ConformanceRunner(fakeSession(send), policy({ target: 'dedicated' }));
    const rogue: Suite = {
      name: 'r', description: '', reset: 'n/a',
      steps: [{ id: 'x', intent: 'x', run: ctx => ctx.emit('clientView', { verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'SayThis', args: ['"%a"', '"%b"'] }) }],
    };
    const report = await ran(runner.runStep(rogue, rogue.steps[0]));
    expect(send).not.toHaveBeenCalled();
    expect(report.outcome.response).toBeNull();
    expect(report.outcome.error).toMatch(/refusing "\^" on procedure SayThis/);
    expect(report.verdict.kind).toBe('FAIL');
  });

  // `ctx.push` used to traverse NO guard at all — the documented trap of the
  // campaign prompt (§7). A fire-and-forget frame is exactly the shape that
  // must not walk past the compiled exclusions, so it goes through
  // `assertPacketSafe` like every other packet.
  it('a push is refused before the wire when it addresses a forbidden member', async () => {
    const written: string[] = [];
    const socket = { write: (b: Buffer) => { written.push(b.toString('latin1')); return true; }, destroyed: false } as unknown as Socket;
    const send = jest.fn();
    const runner = new ConformanceRunner(fakeSession(send, socket), policy({ target: 'dedicated' }));
    const rogue: Suite = {
      name: 'r', description: '', reset: 'n/a',
      steps: [{
        id: 'x', intent: 'a fire-and-forget account reset', risk: 'mutation',
        run: ctx => ctx.push('clientView', { verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'RDOResetTycoon', args: ['"%SPO_test3"'] })
          .then(() => ({ response: '', elapsedMs: 0 })),
      }],
    };
    const report = await ran(runner.runStep(rogue, rogue.steps[0]));
    expect(written).toEqual([]);
    expect(report.outcome.error).toMatch(/refused unconditionally/);
    expect(runner.emitted).toBe(0);
  });

  // A step can declare several risk classes since 2026-08-18: the sweep's
  // wave 2 is a mutation AND a `"^"`-on-a-procedure, and each gate has to see
  // its own class or one of them lets the frame through unannounced.
  it('reads every risk class a step declares, not just the first', () => {
    const both = { id: 'x', intent: 'x', risk: ['mutation', 'variant-on-procedure'] as const, run: () => Promise.resolve({ response: '', elapsedMs: 0 }) };
    expect(refusalReason(both, policy())).toMatch(/--allow-mutations/);
    expect(refusalReason(both, policy({ allowMutations: true }))).toMatch(/--allow-variant-on-procedure/);
    expect(refusalReason(both, policy({ allowMutations: true, allowVariantOnProcedure: true }))).toBeNull();
  });

  it('a push with no world socket is a refusal, not a crash', async () => {
    const send = jest.fn();
    const runner = new ConformanceRunner(fakeSession(send, undefined), policy({ target: 'dedicated' }));
    const report = await ran(runner.runStep(MUTATIONS_SUITE, MUTATIONS_SUITE.steps[0]));
    expect(report.outcome.error).toMatch(/world socket is gone/);
  });

  it('the frame budget is a hard cap', async () => {
    const send = jest.fn().mockReturnValue(reply('A="#1"'));
    const runner = new ConformanceRunner(fakeSession(send), policy({ frameBudget: 2 }));
    const report = await runner.runSuite(suite);
    expect(send).toHaveBeenCalledTimes(2);
    expect(report.steps[2].outcome.error).toMatch(/Frame budget \(2\) exhausted/);
    expect(report.stoppedOnSilence).toBe(true);
  });

  it('a declarative step is refused when its target was never resolved', async () => {
    const send = jest.fn();
    const session = { ...fakeSession(send), interfaceServerId: null } as SessionDriver;
    const runner = new ConformanceRunner(session, policy());
    const report = await ran(runner.runStep(suite, suite.steps[1]));
    expect(report.outcome.error).toMatch(/interfaceServer is not resolved/);
    expect(send).not.toHaveBeenCalled();
  });

  it('a step addressed by explicit objectId goes there', async () => {
    const send = jest.fn().mockReturnValue(reply('X="#1"'));
    const runner = new ConformanceRunner(fakeSession(send), policy());
    await runner.runStep(suite, { id: 'o', intent: 'o', target: { objectId: '424242' }, packet: { verb: RdoVerb.SEL, action: RdoAction.GET, member: 'X' } });
    expect(send.mock.calls[0][1].targetId).toBe('424242');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R2 §3.1 — the degradation detector
//
// Before 2026-08-18 the ONLY stop condition was silence. An `error N` reply is
// an ANSWER: `response` is non-null, so it produced a FAIL per step and
// interrupted nothing. That morning the shared Interface Server answered
// `error 1` to every query for 75 minutes and the harness kept emitting.
// ═══════════════════════════════════════════════════════════════════════════
describe('runner — degradation', () => {
  /** N steps that all expect a value, so an error reply is a FAIL. */
  const failing = (n: number): Suite => ({
    name: 'd', description: '',
    steps: Array.from({ length: n }, (_, i) => ({
      id: `s${i}`, intent: `step ${i}`, target: 'clientView' as const,
      packet: { verb: RdoVerb.SEL, action: RdoAction.GET, member: `M${i}` },
      expect: { kind: 'exact' as const, value: 'ok' },
    })),
  });

  it('stops the suite after MAX_CONSECUTIVE_ERRORS unexpected errors, and no further frame goes out', async () => {
    const send = jest.fn().mockReturnValue(reply('error 1', 1));
    const runner = new ConformanceRunner(fakeSession(send), policy());

    const report = await runner.runSuite(failing(MAX_CONSECUTIVE_ERRORS + 4));
    expect(report.stoppedOnDegradation).toBe(true);
    expect(report.stoppedOnSilence).toBe(false);
    expect(report.steps).toHaveLength(MAX_CONSECUTIVE_ERRORS);
    expect(send).toHaveBeenCalledTimes(MAX_CONSECUTIVE_ERRORS);
  });

  it('ends the whole run, not just the suite — a degraded server does not recover at a boundary', async () => {
    const send = jest.fn().mockReturnValue(reply('error 1', 1));
    const runner = new ConformanceRunner(fakeSession(send), policy());
    const reports = await runner.runAll([failing(MAX_CONSECUTIVE_ERRORS), failing(3)]);
    expect(reports).toHaveLength(1);
    expect(reports[0].stoppedOnDegradation).toBe(true);
  });

  it('counts across suites: the run does not get a fresh allowance per suite', async () => {
    const send = jest.fn().mockReturnValue(reply('error 1', 1));
    const runner = new ConformanceRunner(fakeSession(send), policy());
    const reports = await runner.runAll([failing(3), failing(3)]);
    // 3 in the first suite, 2 more in the second reach the threshold of 5.
    expect(reports).toHaveLength(2);
    expect(reports[0].stoppedOnDegradation).toBeUndefined();
    expect(reports[1].stoppedOnDegradation).toBe(true);
    expect(send).toHaveBeenCalledTimes(MAX_CONSECUTIVE_ERRORS);
  });

  /**
   * THE CALIBRATION, and it is the whole point of the detector.
   *
   * The first version counted every `errorCode`, and a replay of `--suite all`
   * tripped it at once: `types` runs FIVE literal-parser steps in a row whose
   * ORACLE is `error 3`, and `errors` runs three more. A detector that stops a
   * suite for doing exactly what it was written to do gets disabled within a
   * day. What is measured is failure to SUCCEED, not the presence of an error.
   */
  it('an error the step EXPECTED is a success and resets the counter', async () => {
    const expected: Suite = {
      name: 'e', description: '',
      steps: Array.from({ length: MAX_CONSECUTIVE_ERRORS + 4 }, (_, i) => ({
        id: `s${i}`, intent: 'expects error 3 — like the five literal-parser steps of TYPES_SUITE',
        target: 'clientView' as const,
        packet: { verb: RdoVerb.SEL, action: RdoAction.SET, member: 'RdoConfProbe', args: ['"#1"'] },
        expect: { kind: 'errorCode' as const, value: 3 },
      })),
    };
    const send = jest.fn().mockReturnValue(reply('error 3 setting RdoConfProbe', 3));
    const runner = new ConformanceRunner(fakeSession(send), policy());

    const report = await runner.runSuite(expected);
    expect(report.stoppedOnDegradation).toBeUndefined();
    expect(report.steps).toHaveLength(MAX_CONSECUTIVE_ERRORS + 4);
    expect(report.steps.every(s => s.verdict.kind === 'PASS')).toBe(true);
  });

  it('one success in the middle clears the count', async () => {
    const send = jest.fn()
      .mockReturnValueOnce(reply('error 1', 1))
      .mockReturnValueOnce(reply('error 1', 1))
      .mockReturnValueOnce(reply('error 1', 1))
      .mockReturnValueOnce(reply('error 1', 1))
      .mockReturnValueOnce(reply('ok'))
      .mockReturnValue(reply('error 1', 1));
    const runner = new ConformanceRunner(fakeSession(send), policy());
    const report = await runner.runSuite(failing(20));
    // 4 errors, a success, then 5 more errors: the stop lands at step 10, not 5.
    expect(report.stoppedOnDegradation).toBe(true);
    expect(report.steps).toHaveLength(10);
  });

  /**
   * The attribution must NOT borrow the silence sentence. Under silence the
   * last frame IS the suspect; under degradation it is only the last symptom,
   * and pointing at it confidently would send the reader after an innocent
   * frame — 2026-08-18 was already done by the time the errors started.
   */
  it('attributes the stop honestly: last SYMPTOM, not cause', async () => {
    const send = jest.fn().mockReturnValue(reply('error 1', 1));
    const halts: import('./types').HaltRecord[] = [];
    const runner = new ConformanceRunner(fakeSession(send), policy(), { onHalt: r => halts.push(r) });

    const report = await runner.runSuite(failing(MAX_CONSECUTIVE_ERRORS));
    expect(halts).toEqual([report.halt]);
    expect(report.halt!.reason).toMatch(/5 consecutive error replies/);
    expect(report.halt!.reason).toMatch(/last SYMPTOM, not necessarily the cause/);
    expect(report.halt).toMatchObject({ where: 'd/s4', member: 'M4', socket: 'world', clientViewId: CV });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R2 §3.5 — the session-lifecycle refusal, applied by the runner
//
// The runner is where the PHASE half of the rule lives: everything it emits
// happens after the connection floor by construction, since `context()`
// resolves `clientView` eagerly and could not exist before login.
// ═══════════════════════════════════════════════════════════════════════════
describe('runner — session lifecycle members', () => {
  const emitting = (member: string, id = 'x'): Suite => ({
    name: 'l', description: '',
    steps: [{ id, intent: `emits ${member} after the session is established`, run: ctx => ctx.emit('clientView', {
      verb: RdoVerb.SEL, action: RdoAction.CALL, member,
    }) }],
  });

  it('refuses a re-emitted Logon — the exact shape of the 2026-08-18 sweep frame', async () => {
    const send = jest.fn().mockReturnValue(reply('res="#1"'));
    const runner = new ConformanceRunner(fakeSession(send), policy());
    const report = await runner.runSuite(emitting('Logon'));
    expect(send).not.toHaveBeenCalled();
    expect(report.steps[0].outcome.error).toMatch(/establishes, rebinds or ends an RDO session/);
    expect(report.steps[0].outcome.response).toBeNull();
  });

  /**
   * Every one of the twelve is refused, and nothing reaches the socket — but
   * not all of them by THIS guard, and that is worth recording rather than
   * papering over. `ClientAware`, `ClientNotAware` and `SetLanguage` are known
   * Delphi `procedure`s, so `assertPacketSafe` refuses the `"^"` first, before
   * the lifecycle rule is ever consulted. Two independent guards covering the
   * same frame is defence in depth, not redundancy: they refuse for different
   * reasons and neither could replace the other.
   */
  it('refuses every member of the list, and no frame reaches the socket', async () => {
    const byLifecycle: string[] = [];
    for (const member of SESSION_LIFECYCLE_MEMBERS.keys()) {
      const send = jest.fn().mockReturnValue(reply('res="#1"'));
      const runner = new ConformanceRunner(fakeSession(send), policy());
      const report = await runner.runSuite(emitting(member));
      expect(send).not.toHaveBeenCalled();
      const error = report.steps[0].outcome.error ?? '';
      expect(error).toMatch(/establishes, rebinds or ends an RDO session|on procedure /);
      if (/establishes, rebinds or ends an RDO session/.test(error)) byLifecycle.push(member);
    }
    // The three caught upstream by the known-procedure guard, named so a change
    // in either guard shows up here instead of silently shifting coverage.
    expect(SESSION_LIFECYCLE_MEMBERS.size - byLifecycle.length).toBe(3);
    expect(byLifecycle).not.toContain('ClientAware');
    expect(byLifecycle).not.toContain('ClientNotAware');
    expect(byLifecycle).not.toContain('SetLanguage');
    expect(byLifecycle).toContain('Logon');
    expect(byLifecycle).toContain('Logoff');
    expect(byLifecycle).toContain('RegisterEventsById');
  });

  it('refuses a fire-and-forget push too — no rid does not mean no session change', async () => {
    const send = jest.fn();
    const write = jest.fn();
    const runner = new ConformanceRunner(fakeSession(send, { write } as never), policy());
    const suite: Suite = {
      name: 'l', description: '',
      steps: [{ id: 'push', intent: 'pushes ClientNotAware', run: async ctx => {
        await ctx.push('clientView', { verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'ClientNotAware' });
        return { response: '', elapsedMs: 0 };
      } }],
    };
    const report = await runner.runSuite(suite);
    expect(write).not.toHaveBeenCalled();
    expect(report.steps[0].outcome.error).toMatch(/establishes, rebinds or ends an RDO session/);
  });

  /**
   * The two exemptions are ENUMERATED by `suite/step`, each with its citation —
   * the shape of `VOID_MEMBERS`, not the shape of the `probe` opt-in that let
   * the 2026-08-18 frame out. A flag generalises to whatever asks for it; two
   * named ids with a reason each cannot grow silently.
   */
  it('exempts exactly the two adjudicated steps, by id, with a citation each', () => {
    expect([...LIFECYCLE_ADJUDICATED.keys()]).toEqual([
      'separators/set-acks-empty',
      'separators/variant-on-zero-param-procedure',
    ]);
    for (const [, why] of LIFECYCLE_ADJUDICATED) expect(why).toMatch(/capture|live 2026-/);
    // Both really do address a lifecycle member — the exemption is not decorative.
    expect(SESSION_LIFECYCLE_MEMBERS.has('EnableEvents')).toBe(true);
    expect(SESSION_LIFECYCLE_MEMBERS.has('ClientAware')).toBe(true);
  });

  it('the shipped catalogue emits no lifecycle member outside those two steps', () => {
    const offenders: string[] = [];
    for (const suite of SUITES) {
      for (const step of suite.steps) {
        if (isImperativeStep(step)) continue;
        const where = `${suite.name}/${step.id}`;
        if (LIFECYCLE_ADJUDICATED.has(where)) continue;
        if (SESSION_LIFECYCLE_MEMBERS.has(step.packet.member)) offenders.push(`${where} → ${step.packet.member}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
