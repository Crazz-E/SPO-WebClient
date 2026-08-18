/**
 * The `connexion` suite — the operational sequence as a suite of full right.
 *
 * Two properties matter more than any individual oracle, and both are asserted
 * first below:
 *
 *  1. **It emits nothing.** That is the design decision of lot R3 (see the file
 *     header of `connection-suite.ts`): the floor stays control flow in
 *     `run.ts` so a failed login remains a hard stop, and the suite observes it
 *     from the runner state and the recording.
 *  2. **It is first in the catalogue.** Everything after it addresses objects
 *     the login resolved.
 */

import { RdoAction, RdoVerb, SessionPhase } from '../../shared/types';
import { CONNECTION_SUITE } from './connection-suite';
import { SUITES } from './suites';
import { WireView } from './wire-view';
import { Recorder } from './transport';
import { CONNECTION_STATE, StepSkip, isImperativeStep } from './types';
import type { ImperativeStep, StepContext, StepOutcome } from './types';

const CV = '29601272';
const IS = '29570088';

function step(id: string): ImperativeStep {
  const found = CONNECTION_SUITE.steps.find(s => s.id === id);
  if (!found || !isImperativeStep(found)) throw new Error(`no imperative step ${id}`);
  return found;
}

/**
 * A context with a seeded state and a recorder holding the floor's frames.
 *
 * The frames go in through the recorder's OWN api (`recordOut`/`recordIn`), not
 * by pushing into its array: that is what the live and replay transports do, so
 * the rid classification and the credential redaction are the real ones. A
 * fixture that bypassed them would be testing a recorder that does not exist.
 */
function ctxWith(state: Record<string, unknown>, frames: Array<{ dir: 'in' | 'out'; raw: string }> = []): StepContext {
  const recorder = new Recorder(() => '2026-08-18T00:00:00.000Z');
  for (const f of frames) {
    if (f.dir === 'out') recorder.recordOut('world', f.raw);
    else recorder.recordIn('world', f.raw);
  }
  return {
    session: {} as never,
    wire: new WireView(recorder),
    state: new Map(Object.entries(state)),
    clientViewId: CV,
    interfaceServerId: IS,
    tycoonId: '37',
    username: 'SPO_test3',
    emit: () => { throw new Error('the connexion suite must never emit'); },
    push: () => { throw new Error('the connexion suite must never push'); },
    scenario: () => { throw new Error('the connexion suite must never drive a scenario'); },
  } as unknown as StepContext;
}

const HEALTHY = {
  [CONNECTION_STATE.worlds]: ['planitia', 'shamba', 'zorcon'],
  [CONNECTION_STATE.requestedWorld]: 'planitia',
  [CONNECTION_STATE.login]: { clientViewId: CV, interfaceServerId: IS, tycoonId: '37' },
  [CONNECTION_STATE.companies]: ['SPO_test3 - Green', 'SPO_test3 - Blue'],
  [CONNECTION_STATE.requestedCompany]: 'SPO_test3 - Green',
  [CONNECTION_STATE.selectedCompany]: { id: '4799656', name: 'SPO_test3 - Green' },
  [CONNECTION_STATE.phase]: SessionPhase.WORLD_CONNECTED,
};

async function run(id: string, state: Record<string, unknown>, frames?: Parameters<typeof ctxWith>[1]): Promise<StepOutcome> {
  return step(id).run(ctxWith(state, frames));
}

describe('connexion — the two structural properties', () => {
  it('is first in the catalogue: every suite after it addresses what the login resolved', () => {
    expect(SUITES[0]).toBe(CONNECTION_SUITE);
    expect(SUITES[0].name).toBe('connexion');
  });

  /**
   * The load-bearing assertion of lot R3. `ctxWith` throws from `emit`, `push`
   * and `scenario`, so a step that reached for any of them fails here — and
   * every step is exercised, not a sample.
   */
  it('emits nothing: no packet, no ctx.emit, no ctx.push, no ctx.scenario', async () => {
    for (const s of CONNECTION_SUITE.steps) {
      expect(isImperativeStep(s)).toBe(true);
      try {
        await (s as ImperativeStep).run(ctxWith(HEALTHY));
      } catch (err: unknown) {
        // A precondition that is not met is a legitimate outcome; reaching for
        // the wire is not.
        expect(err).toBeInstanceOf(StepSkip);
      }
    }
  });

  it('carries no mutation and therefore owes no reset', () => {
    expect(CONNECTION_SUITE.steps.some(s => s.risk !== undefined)).toBe(false);
    expect(CONNECTION_SUITE.reset).toBeUndefined();
  });

  it('every step has an intent and an oracle', () => {
    for (const s of CONNECTION_SUITE.steps) {
      expect(s.intent.length).toBeGreaterThan(10);
      expect(s.expect).toBeDefined();
    }
  });

  it('covers the five stages of the sequence, in order, before the frame verdicts', () => {
    expect(CONNECTION_SUITE.steps.slice(0, 5).map(s => s.id))
      .toEqual(['auth', 'world', 'login', 'companies', 'company']);
  });
});

describe('connexion — the sequence steps', () => {
  it('auth: passes on a non-empty world list, is silence on an empty one', async () => {
    expect((await run('auth', HEALTHY)).response).toBe('3 world(s): planitia, shamba, zorcon');
    const empty = await run('auth', { ...HEALTHY, [CONNECTION_STATE.worlds]: [] });
    expect(empty.response).toBeNull();
    expect(empty.error).toMatch(/listed no world at all/);
  });

  it('world: names the refusal instead of failing twenty frames later', async () => {
    expect((await run('world', HEALTHY)).response).toBe('selected "planitia"');
    const absent = await run('world', { ...HEALTHY, [CONNECTION_STATE.requestedWorld]: 'aries' });
    expect(absent.response).toMatch(/"aries" is NOT in the listing: planitia, shamba, zorcon/);
    expect(absent.error).toMatch(/absent from the directory listing/);
  });

  it('world: matches case-insensitively, like the run does', async () => {
    expect((await run('world', { ...HEALTHY, [CONNECTION_STATE.requestedWorld]: 'PLANITIA' })).response)
      .toBe('selected "planitia"');
  });

  it('login: the three ids must all be non-null, and it names the missing ones', async () => {
    expect((await run('login', HEALTHY)).response)
      .toBe(`ClientViewId=${CV} InterfaceServerId=${IS} TycoonId=37`);
    const partial = await run('login', {
      ...HEALTHY, [CONNECTION_STATE.login]: { clientViewId: CV, interfaceServerId: null, tycoonId: null },
    });
    expect(partial.response).toBe('missing: interfaceServerId, tycoonId');
    expect(partial.error).toMatch(/loginWorld left interfaceServerId, tycoonId null/);
  });

  /**
   * §3.4 — the false green of the replay. An empty list used to fall through
   * the refusal guard: `selectCompany` got the NAME where it expects an ID,
   * `currentCompany` stayed null, and the run passed.
   */
  it('companies: an empty list with nothing declaring it is silence, never a pass', async () => {
    expect((await run('companies', HEALTHY)).response)
      .toBe('2 company(ies): SPO_test3 - Green, SPO_test3 - Blue');
    const empty = await run('companies', { ...HEALTHY, [CONNECTION_STATE.companies]: [] });
    expect(empty.response).toBeNull();
    expect(empty.error).toMatch(/no company, and nothing declared that absence/);
  });

  it('companies: a DECLARED absence skips with its reason — declared is not faked', async () => {
    await expect(run('companies', {
      ...HEALTHY,
      [CONNECTION_STATE.companies]: [],
      [CONNECTION_STATE.companySkipped]: 'replay: world.ip is forced to loopback',
    })).rejects.toThrow(StepSkip);
  });

  /**
   * The phase and the company are ONE fact: `WORLD_CONNECTED` is set on the
   * last line of `selectCompany` (login-handler.ts:616), so a run with no
   * company stays in `WORLD_CONNECTING` legitimately and for ever.
   */
  it('company: passes only with a selection AND WORLD_CONNECTED', async () => {
    expect((await run('company', HEALTHY)).response).toBe('SPO_test3 - Green (#4799656) in WORLD_CONNECTED');
    const wrongPhase = await run('company', { ...HEALTHY, [CONNECTION_STATE.phase]: SessionPhase.WORLD_CONNECTING });
    expect(wrongPhase.response).toBe('phase WORLD_CONNECTING');
    expect(wrongPhase.error).toMatch(/expected WORLD_CONNECTED/);
  });

  it('company: a declared absence skips and carries the phase in the reason', async () => {
    await expect(run('company', {
      ...HEALTHY,
      [CONNECTION_STATE.phase]: SessionPhase.WORLD_CONNECTING,
      [CONNECTION_STATE.companySkipped]: 'replay: loopback',
    })).rejects.toThrow(/phase WORLD_CONNECTING/);
  });

  it('a state the floor never published skips rather than crashes', async () => {
    await expect(run('auth', {})).rejects.toThrow(StepSkip);
    await expect(run('login', {})).rejects.toThrow(/the connection floor did not publish it/);
  });
});

describe('connexion — the frames the floor emitted, judged from the recording', () => {
  const floor = [
    { dir: 'out' as const, raw: `C 1010 idof "InterfaceServer";` },
    { dir: 'in' as const, raw: `A1010 objid="${IS}";` },
    { dir: 'out' as const, raw: `C 1019 sel ${IS} call Logon "^" "%SPO_test3","%test3";` },
    { dir: 'in' as const, raw: `A1019 res="#${CV}";` },
    { dir: 'out' as const, raw: `C 1021 sel ${CV} get TycoonId;` },
    { dir: 'in' as const, raw: `A1021 TycoonId="#37";` },
    { dir: 'out' as const, raw: `C 1022 sel ${CV} get RDOCnntId;` },
    { dir: 'in' as const, raw: `A1022 RDOCnntId="$88123456";` },
  ];

  it('judges the Logon of the floor without re-emitting it', async () => {
    const outcome = await run('frame-logon', HEALTHY, floor);
    expect(outcome.response).toBe(`res="#${CV}"`);
    expect(outcome.wire).toHaveLength(2);
    expect(outcome.wire![0]).toMatch(/^>> C 1019 sel \d+ call Logon "\^"/);
    expect(outcome.wire![1]).toBe(`<< A1019 res="#${CV}"`);
    // The recorder redacts the credential on its way in — the report of a run
    // must never carry the account password.
    expect(outcome.wire![0]).toContain('"%[REDACTED]"');
  });

  it('judges TycoonId and RDOCnntId from the same recording', async () => {
    expect((await run('frame-tycoon-id', HEALTHY, floor)).response).toBe('TycoonId="#37"');
    expect((await run('frame-rdocnntid', HEALTHY, floor)).response).toBe('RDOCnntId="$88123456"');
  });

  it('resolves the InterfaceServer id from the `idof` frame', async () => {
    expect((await run('frame-idof-interface-server', HEALTHY, floor)).response).toBe(`objid="${IS}"`);
  });

  it('a member the floor never emitted skips itself — an honest report, not a FAIL', async () => {
    await expect(run('frame-set-language', HEALTHY, floor))
      .rejects.toThrow(/no SetLanguage frame in the connection floor/);
  });

  it('an error reply is carried through with its code, so the oracle can judge it', async () => {
    const broken = [
      { dir: 'out' as const, raw: `C 1019 sel ${IS} call Logon "^" "%SPO_test3","%test3";` },
      { dir: 'in' as const, raw: 'A1019 error 1;' },
    ];
    const outcome = await run('frame-logon', HEALTHY, broken);
    expect(outcome).toMatchObject({ response: 'error 1', errorCode: 1 });
  });

  it('the frame steps name real RDO members, not invented ones', () => {
    const members = ['Logon', 'AccountStatus', 'TycoonId', 'RDOCnntId', 'RegisterEventsById', 'SetLanguage'];
    for (const m of members) {
      expect(CONNECTION_SUITE.steps.some(s => s.intent.includes(m))).toBe(true);
    }
    // And none of them is built as a packet — the ban is structural, not stylistic.
    expect(CONNECTION_SUITE.steps.every(s => !('packet' in s))).toBe(true);
    expect(RdoVerb.SEL).toBe('sel');
    expect(RdoAction.CALL).toBe('call');
  });
});
