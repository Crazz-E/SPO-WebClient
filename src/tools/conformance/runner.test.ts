import type { Socket } from 'net';
import { RdoAction, RdoVerb } from '../../shared/types';
import type { RdoPacket } from '../../shared/types';
import { TimeoutCategory } from '../../shared/timeout-categories';
import { RdoServerError } from '../../server/session/rdo-error-contract';
import {
  ConformanceRunner, DEFAULT_FRAME_BUDGET, describeFrame, emitRequest, refusalReason, selectSteps,
} from './runner';
import type { RunPolicy, SessionDriver } from './runner';
import { MUTATIONS_SUITE, SEPARATORS_SUITE, TYPES_SUITE } from './suites';
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
  target: 'shared', allowVariantOnProcedure: false, frameBudget: DEFAULT_FRAME_BUDGET, username: 'SPO_test3', ...over,
});

describe('runner — selection', () => {
  it('shared target skips mutations, dedicated runs them', () => {
    const shared = selectSteps(MUTATIONS_SUITE, policy());
    expect(shared.run).toHaveLength(0);
    expect(shared.skipped.map(s => s.reason)).toEqual(expect.arrayContaining([expect.stringMatching(/--target dedicated/)]));
    expect(selectSteps(MUTATIONS_SUITE, policy({ target: 'dedicated' })).run).toHaveLength(MUTATIONS_SUITE.steps.length);
  });

  it('the "^"-on-procedure step needs its flag on every target', () => {
    const without = selectSteps(SEPARATORS_SUITE, policy({ target: 'dedicated' }));
    expect(without.skipped.map(s => s.id)).toEqual(['variant-on-zero-param-procedure']);
    expect(without.skipped[0].reason).toMatch(/error 9/);
    const withFlag = selectSteps(SEPARATORS_SUITE, policy({ allowVariantOnProcedure: true }));
    expect(withFlag.skipped).toEqual([]);
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
