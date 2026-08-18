/**
 * The `connexion` suite — the operational sequence, promoted from an unspoken
 * preamble to a suite of full right.
 *
 * > **authentication → world choice → world login → company choice → exploration**
 *
 * The developer requires that this sequence always be respected. It already was
 * — `run.ts` has performed it in that order since the harness existed, live-
 * proven on 2026-08-17 — but nothing OBSERVED it and nothing made it REQUIRED.
 * A silent imperative preamble produces no verdict, no baseline entry and no
 * attribution: when it worked you learned nothing, and when it failed you got a
 * stack trace instead of a named step.
 *
 * Note on the order, because it contradicts the developer's phrasing by one
 * transposition and that is deliberate: the company list is a *product* of the
 * world login — it comes back in the `REQ_LOGIN_WORLD` response
 * (`auth-handler.ts:112`). The company choice therefore cannot precede the
 * world connection, and the reference Delphi client does the same. Plan rev. 4
 * §4 settles this.
 *
 * ## THE DESIGN DECISION OF LOT R3 — this suite EMITS NOTHING
 *
 * The sequence runs before the runner exists. There were two ways to observe
 * it, and both were defensible; this file takes the second, for three reasons
 * of increasing weight.
 *
 * **1. `runAll` stops on silence, never on FAIL — and that settles it.** If the
 * login were a suite step, a failed login would be a `FAIL` and the run would
 * carry straight on to the next suite, emitting against ids that are null or
 * stale. That is precisely the fault the phase assertion exists to remove
 * (`run.ts`, §3.3). Keeping the floor as *control flow* and the suite as
 * *observer* keeps "refuse to explore" a hard stop, and makes the sequence
 * exigible rather than merely reported. Moving it into a suite would have
 * downgraded a precondition into a verdict.
 *
 * **2. The runner cannot host a step that runs before login.**
 * `ConformanceRunner.context()` resolves `clientView` and `interfaceServer`
 * EAGERLY, and `resolveTarget` throws when the id is null. A pre-login step
 * could not build its own context without restructuring the most load-bearing
 * piece of the runner — a large change, on the wrong file, for no gain.
 *
 * **3. Re-running the floor would double a fragile login.** `loginWorld` alone
 * puts about twenty frames on the wire. Emitting them twice against a shared
 * production server, to learn what the first pass already proved, is the
 * opposite of what plan rev. 4 asks for.
 *
 * So `run.ts` publishes what the floor learned into the runner state
 * (`CONNECTION_STATE`), the recorder already holds every frame the floor put on
 * the wire from the first one, and every step below is a pure judgement over
 * the two. Zero frames, zero budget, no second session.
 *
 * ## Form
 *
 * `ctx.state` / `need()` and a local `derived()` over wire mark 0 — the mark
 * where the recording begins, so "since 0" is the whole connection floor. No
 * `packet`, no `ctx.emit`, no `ctx.push`, exactly as the seven scenario suites
 * (22 `ctx.scenario` calls, zero hand-built frames). That is the gabarit.
 */

import { SessionPhase } from '../../shared/types';
import type { ImperativeStep, StepContext, StepOutcome, Suite } from './types';
import { CONNECTION_STATE, StepSkip } from './types';

/** Where the connection floor starts in the recording: at the beginning. */
const FLOOR = 0;

interface LoginFacts {
  clientViewId: string | null;
  interfaceServerId: string | null;
  tycoonId: string | null;
}

interface SelectedCompany {
  id: string;
  name: string;
}

function need<T>(ctx: StepContext, key: string, what: string): T {
  const v = ctx.state.get(key);
  if (v === undefined || v === null) throw new StepSkip(`needs ${what} — the connection floor did not publish it`);
  return v as T;
}

/** An outcome built from a fact rather than from a frame: no wire, no elapsed time. */
function verdictOutcome(response: string): StepOutcome {
  return { response, elapsedMs: 0 };
}

/**
 * Judge one frame the connection floor already emitted, without re-emitting it.
 *
 * The same shape as `derived()` in `scenario-suites.ts`, over the fixed mark
 * `FLOOR` instead of a mark an earlier step stored: the floor's frames are the
 * first frames of the recording, so there is nothing to remember.
 */
function derived(id: string, intent: string, member: string, expect: ImperativeStep['expect']): ImperativeStep {
  return {
    id, intent, expect,
    run: async ctx => {
      const ex = ctx.wire.exchanges(FLOOR, member);
      if (ex.length === 0) throw new StepSkip(`no ${member} frame in the connection floor`);
      const last = ex[ex.length - 1];
      const outcome: StepOutcome = {
        response: last.rid === undefined ? `(push) ${last.request}` : last.reply,
        elapsedMs: 0,
        wire: [`>> ${last.request}`, ...(last.reply !== null ? [`<< A${last.rid} ${last.reply}`] : [])],
      };
      const code = last.reply ? /^error\s+(\d+)/i.exec(last.reply) : null;
      if (code) outcome.errorCode = parseInt(code[1], 10);
      return outcome;
    },
  };
}

// ── The five steps of the sequence ─────────────────────────────────────────

const AUTH: ImperativeStep = {
  id: 'auth',
  intent: 'authentication — `connectDirectory` answered and the directory listed at least one world. '
    + 'An empty list is the silent failure of a wrong `--zone`: "Free Space" is a UI label, the path is '
    + 'Root/Areas/America/Worlds, and using the label returns an empty list without an error (live 2026-08-16).',
  run: async ctx => {
    const worlds = need<string[]>(ctx, CONNECTION_STATE.worlds, 'the directory world list');
    if (worlds.length === 0) {
      return { response: null, error: 'the directory listed no world at all', elapsedMs: 0 };
    }
    return verdictOutcome(`${worlds.length} world(s): ${worlds.join(', ')}`);
  },
  expect: { kind: 'pattern', value: /^\d+ world\(s\): .+/ },
};

const WORLD: ImperativeStep = {
  id: 'world',
  intent: 'world choice — the world `--world` asked for is IN the directory listing. A named refusal, '
    + 'because the alternative is an obscure failure twenty frames later against a world that was never there.',
  run: async ctx => {
    const worlds = need<string[]>(ctx, CONNECTION_STATE.worlds, 'the directory world list');
    const requested = need<string>(ctx, CONNECTION_STATE.requestedWorld, 'the requested world');
    const found = worlds.find(w => w.toLowerCase() === requested.toLowerCase());
    if (!found) {
      return {
        response: `"${requested}" is NOT in the listing: ${worlds.join(', ') || '(empty)'}`,
        error: `world "${requested}" absent from the directory listing`,
        elapsedMs: 0,
      };
    }
    return verdictOutcome(`selected "${found}"`);
  },
  expect: { kind: 'pattern', value: /^selected ".+"$/ },
};

const LOGIN: ImperativeStep = {
  id: 'login',
  intent: 'world login — `loginWorld` returned a ClientViewId, an InterfaceServerId and a TycoonId, all non-null. '
    + 'These three are what every suite below addresses; a null one turns the whole run into noise.',
  run: async ctx => {
    const facts = need<LoginFacts>(ctx, CONNECTION_STATE.login, 'what loginWorld returned');
    const missing = (['clientViewId', 'interfaceServerId', 'tycoonId'] as const).filter(k => !facts[k]);
    if (missing.length) {
      return { response: `missing: ${missing.join(', ')}`, error: `loginWorld left ${missing.join(', ')} null`, elapsedMs: 0 };
    }
    return verdictOutcome(
      `ClientViewId=${facts.clientViewId} InterfaceServerId=${facts.interfaceServerId} TycoonId=${facts.tycoonId}`,
    );
  },
  expect: { kind: 'pattern', value: /^ClientViewId=\S+ InterfaceServerId=\S+ TycoonId=\S+$/ },
};

const COMPANIES: ImperativeStep = {
  id: 'companies',
  intent: 'company list — non-empty, or explicitly declared absent. Closes the false green of the replay: an empty '
    + 'list used to short-circuit the refusal guard, `selectCompany` received a NAME where it expects an ID, '
    + '`currentCompany` stayed null and the run passed anyway (plan rev. 4 §4.2). The same hole silently swallowed '
    + 'the npm quote trap, where `--company SPO_test3` arrives instead of "SPO_test3 - Green".',
  run: async ctx => {
    const declared = ctx.state.get(CONNECTION_STATE.companySkipped);
    if (typeof declared === 'string') throw new StepSkip(`no company by declaration — ${declared}`);
    const companies = need<string[]>(ctx, CONNECTION_STATE.companies, 'the company list');
    if (companies.length === 0) {
      return { response: null, error: 'the world login produced no company, and nothing declared that absence', elapsedMs: 0 };
    }
    return verdictOutcome(`${companies.length} company(ies): ${companies.join(', ')}`);
  },
  expect: { kind: 'pattern', value: /^\d+ company\(ies\): .+/ },
};

/**
 * The phase and the company are ONE fact, not two — established in R3.
 *
 * `SessionPhase.WORLD_CONNECTED` is set on the LAST line of `selectCompany`
 * (`login-handler.ts:616`, after the second `ClientAware`). A session that
 * selects no company therefore stays in `WORLD_CONNECTING` legitimately and for
 * ever. Judging "phase must be WORLD_CONNECTED" on its own would fail every
 * `--no-company` run and every replay run — including the one the git gate
 * replays at each commit.
 */
const COMPANY: ImperativeStep = {
  id: 'company',
  intent: 'company choice — `selectCompany` completed: `currentCompany` is non-null AND the phase is '
    + 'WORLD_CONNECTED, which is the same fact twice (login-handler.ts:616 sets that phase on the last line '
    + 'of selectCompany). This is what makes the sequence EXIGIBLE rather than merely respected; `run.ts` refuses to '
    + 'explore when it does not hold, and this records what it saw.',
  run: async ctx => {
    const phase = need<SessionPhase>(ctx, CONNECTION_STATE.phase, 'the session phase reached before exploration');
    const declared = ctx.state.get(CONNECTION_STATE.companySkipped);
    if (typeof declared === 'string') throw new StepSkip(`no company by declaration — ${declared} (phase ${phase})`);
    const selected = need<SelectedCompany>(ctx, CONNECTION_STATE.selectedCompany, 'the selected company');
    if (phase !== SessionPhase.WORLD_CONNECTED) {
      return { response: `phase ${phase}`, error: `phase is ${phase}, expected ${SessionPhase.WORLD_CONNECTED}`, elapsedMs: 0 };
    }
    return verdictOutcome(`${selected.name} (#${selected.id}) in ${phase}`);
  },
  expect: { kind: 'pattern', value: /^.+ \(#\S+\) in WORLD_CONNECTED$/ },
};

// ── The frames the floor put on the wire, one verdict each ─────────────────
//
// `loginWorld` alone emits about twenty frames and, until now, not one of them
// had a verdict: the whole exchange was judged by whether the method threw.
// Each of these judges one member of that exchange from the recording, without
// re-emitting anything. A member the floor did not reach skips itself, which is
// the honest report for a login that took a different path (mock, replay).

const FLOOR_FRAMES: readonly ImperativeStep[] = [
  derived('frame-idof-interface-server',
    '`idof InterfaceServer` resolves the TInterfaceServer id every `interfaceServer`-targeted step addresses',
    'idof:InterfaceServer', { kind: 'pattern', value: /^\S+="\$?\d+"$|^\d+$|^res=/ }),
  derived('frame-logon',
    '`Logon` — the frame that opens the ClientView. Emitted ONCE, here; SESSION_LIFECYCLE_MEMBERS refuses it '
    + 'anywhere else (the 2026-08-18 sweep re-emitted it at rid 1089, after the legitimate one at rid 1019)',
    'Logon', { kind: 'pattern', value: /^res="/ }),
  derived('frame-account-status',
    '`AccountStatus` — the account bracket read, part of the login exchange',
    'AccountStatus', { kind: 'answered' }),
  derived('frame-tycoon-id',
    '`TycoonId` reads as `#` — the id the favourites, politics and cookie steps all pass on',
    'TycoonId', { kind: 'pattern', value: /^TycoonId="#-?\d+"$/ }),
  derived('frame-rdocnntid',
    '`RDOCnntId` is answered from the CARRYING connection before any object lookup (RDOQueryServer.pas:269-274), '
    + 'which is why it must never travel a pool connection — CONNECTION_BOUND_MEMBERS',
    'RDOCnntId', { kind: 'pattern', value: /^RDOCnntId="\$\d+"$/ }),
  derived('frame-register-events',
    '`RegisterEventsById` binds the ClientView to that connection as push channel AND teardown trigger '
    + '(Interface Server/InterfaceServer.pas:1919-1923)',
    'RegisterEventsById', { kind: 'answered' }),
  derived('frame-set-language',
    '`SetLanguage` — session-scoped locale, set once during login',
    'SetLanguage', { kind: 'answered' }),
];

export const CONNECTION_SUITE: Suite = {
  name: 'connexion',
  description: 'The operational sequence (authentication → world → world login → company), judged from what the '
    + 'connection floor learned and from the frames it emitted. Emits nothing itself.',
  steps: [AUTH, WORLD, LOGIN, COMPANIES, COMPANY, ...FLOOR_FRAMES],
};
