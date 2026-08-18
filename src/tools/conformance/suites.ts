/**
 * Suite catalogue — grouped by the protocol property each step pins.
 *
 * Every expectation cites its evidence, ranked as in
 * `doc/rdo-protocol-architecture.md` §0: a live capture line, a live probe
 * result with its date, or a Delphi `File.pas:Line`. An expectation with no
 * capture behind it says `[INFERRED]` in its intent and uses a pattern wide
 * enough to hold what the source promises, not a byte-exact guess.
 *
 * ## The rule this file lives by
 *
 * **The source of truth for a member is its Pascal declaration — never a
 * call site, never a synthesis document.** `doc/spo-original-reference.md`
 * once classed `RDOConnectInput` as `function … olevariant` because the line
 * it cited was a late-bound CLIENT call site; the member is a `procedure`
 * with two widestrings, the exact profile that froze the shared server.
 * {@link KNOWN_PROCEDURES} carries the declarations; {@link assertSuitesSafe}
 * refuses any suite that would put `"^"` on one of them before a single
 * socket is opened.
 */

import { RdoAction, RdoVerb } from '../../shared/types';
import { RdoValue } from '../../shared/rdo-types';
import { VOID_MEMBERS, assertMemberNotForbidden } from '../../server/session/rdo-request-guards';
import type { ImperativeStep, RdoStep, Step, StepPacket, Suite } from './types';
import { hasRisk, isImperativeStep } from './types';
import { SCENARIO_SUITES } from './scenario-suites';
import { CONNECTION_SUITE } from './connection-suite';

// ── Static safety table ────────────────────────────────────────────────────

export interface ProcedureDeclaration {
  /**
   * Number of parameters the Pascal declaration carries. Documentation and the
   * shape a well-formed call takes — NOT the axis the guard measures. What
   * decides where the hidden result pointer lands is the number of arguments
   * actually emitted (`RDOObjectServer.pas:214-218`); see {@link assertPacketSafe}.
   */
  paramCount: number;
  /** `procedure Name( … ) — File.pas:Line`. Mandatory. */
  declaration: string;
}

/**
 * Delphi `procedure`s reachable from the client, with their arity.
 *
 * `"^"` on any of them makes the server pass a hidden result pointer
 * (`RDOQueryServer.pas:422-424`). Below two EMITTED arguments it stays in a
 * register and the server answers `error 9` (live 2026-08-16, `ClientAware` at
 * 0; capture, `CloseMessage` at 1). From the second emitted register argument
 * `RegsUsed` reaches `MaxRegs = 3` and the pointer is pushed on the stack
 * (`RDOObjectServer.pas:292`), which a `register`-convention procedure never
 * pops — the 2026-08-14 freeze (`SayThis`, 2 widestrings).
 *
 * The five {@link VOID_MEMBERS} are folded in from the production guard so
 * the two tables cannot disagree. Add here only with the declaration cited.
 */
export const KNOWN_PROCEDURES: ReadonlyMap<string, ProcedureDeclaration> = new Map<string, ProcedureDeclaration>([
  ...[...VOID_MEMBERS.entries()].map(([member, declaration]): [string, ProcedureDeclaration] => [
    member,
    { paramCount: countParams(declaration), declaration },
  ]),
  ['ClientAware', { paramCount: 0, declaration: 'procedure ClientAware; — Interface Server/InterfaceServer.pas:196' }],
  ['ClientNotAware', { paramCount: 0, declaration: 'procedure ClientNotAware; — Interface Server/InterfaceServer.pas:197' }],
  ['SetTycoonCookie', {
    paramCount: 3,
    declaration: 'procedure SetTycoonCookie( TycoonId : integer; CookieId, CookieValue : widestring ) — Interface Server/InterfaceServer.pas:163',
  }],
  ['SetLanguage', { paramCount: 1, declaration: 'procedure SetLanguage( langid : widestring ) — Interface Server/InterfaceServer.pas:198' }],
]);

/** Count the parameters of a `procedure Name( a, b : T; c : U )` declaration. */
export function countParams(declaration: string): number {
  const inside = /\(([^)]*)\)/.exec(declaration)?.[1] ?? '';
  if (!inside.trim()) return 0;
  return inside.split(';').reduce((n, group) => n + group.split(':')[0].split(',').filter(s => s.trim()).length, 0);
}

/** Does this packet emit the VariantId separator (explicitly, or by the request default)? */
export function emitsVariantId(packet: StepPacket): boolean {
  if (packet.action !== RdoAction.CALL) return false;
  return packet.separator === undefined || packet.separator.includes('^');
}

/**
 * Refuse, at load time, any declarative step that would put `"^"` on a known
 * procedure. Zero-parameter procedures are allowed ONLY when the step is
 * declared `risk: 'variant-on-procedure'` — that is what routes it behind the
 * extra flag. Also asserts that a suite carrying a mutation documents its reset.
 */
export function assertSuitesSafe(suites: Suite[]): void {
  for (const suite of suites) {
    const carriesMutation = suite.steps.some(s => hasRisk(s, 'mutation'));
    if (carriesMutation && !suite.reset) {
      throw new Error(`Suite "${suite.name}" carries a mutation step but documents no reset.`);
    }
    for (const step of suite.steps) {
      if (isImperativeStep(step)) continue;
      assertPacketSafe(step.packet, `${suite.name}/${step.id}`, hasRisk(step, 'variant-on-procedure'));
    }
  }
}

/**
 * The same check for one packet — the runner applies it to imperative emits too.
 *
 * ## The axis is the arguments EMITTED, not the arity DECLARED (fixed 2026-08-18)
 *
 * The dispatcher reads `ParamCount` from the variant array it received
 * (`RDOObjectServer.pas:214-218`), never from the Pascal declaration. The first
 * argument goes to `EDX`, the second to `ECX`; `RegsUsed` only reaches
 * `MaxRegs = 3` — the point where the hidden result pointer is pushed on the
 * stack (`:281-292`) — at the **second** register argument.
 *
 * So `call M "^"` with 0 or 1 argument cannot freeze, whatever `M` declares.
 * Both edges are live-proven, and the capture outranks the source:
 *
 * - `ClientAware`, 0 args  → `error 9` in 91 ms (probe U1-a, 2026-08-16)
 * - `CloseMessage`, 1 arg  → `error 9`, no freeze
 *   (`mock-server/scenarios/captured/mail-read-captured.scenario.ts:1011-1012`)
 * - `SayThis`, 2 args      → **froze the shared server**, 12 h 41 (2026-08-14)
 *
 * A known procedure below the danger band still has to declare
 * `risk: 'variant-on-procedure'`: harmless, but the intent stays on the record.
 *
 * ## The unconditional refusal comes first
 *
 * {@link assertMemberNotForbidden} is checked before anything else and outside
 * every branch: the seven members of the developer's exclusion list are refused
 * whatever the verb, the separator, the argument count and the flags. It is not
 * a risk class to be unlocked, it is a prohibition, so it cannot be conditioned
 * on the step knowing what it is addressing.
 */
export function assertPacketSafe(packet: StepPacket, where: string, allowZeroParam: boolean): void {
  try {
    assertMemberNotForbidden(packet);
  } catch (err: unknown) {
    throw new Error(`${where}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!emitsVariantId(packet)) return;
  const emitted = packet.args?.length ?? 0;
  const proc = KNOWN_PROCEDURES.get(packet.member);

  if (emitted >= 2) {
    // Danger band. A member we cannot name still passes here — the polarity is
    // OPEN, deliberately. Closing it (refuse unless proven a `function`) needs
    // the list of proven functions, and nothing has ever produced it: the
    // certification sweep that was supposed to is dead (plan rev. 4 §1, the
    // classification was circular). Under rev. 4 no step addresses an
    // unadjudicated member at all — every frame comes from a session method the
    // client already emits in production — so the open edge is unreachable in
    // practice rather than closed on paper. Do not flip it without the list.
    if (!proc) return;
    throw new Error(
      `${where}: refusing "^" on procedure ${packet.member} (${proc.declaration}) with ${emitted} ` +
      'emitted argument(s) — from the second the hidden result pointer goes on the stack ' +
      '(RDOObjectServer.pas:292) and a register-convention procedure never pops it. ' +
      'This froze the shared server on 2026-08-14.'
    );
  }

  if (proc && !allowZeroParam) {
    throw new Error(
      `${where}: "^" on procedure ${packet.member} (${proc.declaration}) with ${emitted} emitted ` +
      'argument(s) answers error 9 and does NOT freeze — but the step must say so: ' +
      'declare risk "variant-on-procedure".'
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

const get = (id: string, intent: string, target: RdoStep['target'], member: string, expect: RdoStep['expect']): RdoStep => ({
  id, intent, target, expect,
  packet: { verb: RdoVerb.SEL, action: RdoAction.GET, member },
});

/**
 * `set` on a property that does NOT exist. `SetCommand` parses the literal
 * inside a `try` BEFORE looking the property up (`RDOQueryServer.pas:338-346`):
 * a literal that parses answers `error 3 setting X` (`errUnexistentProperty`),
 * one that does not answers `error 4`. Zero writes either way — that is the
 * whole design. Live 2026-08-16: all four literals below answered `error 3`.
 */
const PROBE_PROPERTY = 'RdoConfProbe';
const setLiteral = (id: string, intent: string, literal: string): RdoStep => ({
  id, intent, target: 'clientView',
  packet: { verb: RdoVerb.SEL, action: RdoAction.SET, member: PROBE_PROPERTY, args: [literal] },
  expect: { kind: 'errorCode', value: 3, payload: new RegExp(`^error 3 setting ${PROBE_PROPERTY}$`) },
});

/** `call GetTycoonCookie "^" "#<TycoonId>","%<key>"` — a function; needs the TycoonId learned at login. */
const getTycoonCookie = (id: string, intent: string, key: string, expect: ImperativeStep['expect']): ImperativeStep => ({
  id, intent, expect,
  run: ctx => ctx.emit('clientView', {
    verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'GetTycoonCookie',
    args: [RdoValue.int(parseInt(ctx.tycoonId, 10)).format(), RdoValue.string(key).format()],
  }),
});

// ── Suites ─────────────────────────────────────────────────────────────────

export const TYPES_SUITE: Suite = {
  name: 'types',
  description: 'Type prefixes on the wire (# $ % @ !), boolean literals, and the literal parser',
  steps: [
    get('string-property-username',
      'a published `string` property reads back as `$` — live 2026-08-16 (`UserName="$SPO_test3"`), InterfaceServer.pas:126',
      'clientView', 'UserName', { kind: 'pattern', value: /^UserName="\$[^"]+"$/ }),
    get('string-property-mailaccount',
      '`MailAccount` is `$` and carries an address — live 2026-08-16, capture login-full',
      'clientView', 'MailAccount', { kind: 'pattern', value: /^MailAccount="\$[^"@]+@[^"]+"$/ }),
    get('string-property-compositename',
      '`CompositeName` is `$` — live 2026-08-16, InterfaceServer.pas:127',
      'clientView', 'CompositeName', { kind: 'pattern', value: /^CompositeName="\$[^"]+"$/ }),
    get('string-property-worldname',
      'a `string` property on the InterfaceServer is `$` too — capture login-full (`WorldName="$Planitia"`)',
      'interfaceServer', 'WorldName', { kind: 'pattern', value: /^WorldName="\$[^"]+"$/ }),
    get('int-property-tycoonid',
      'an `integer` property reads back as `#` — capture login-full (`TycoonId="#37"`)',
      'clientView', 'TycoonId', { kind: 'pattern', value: /^TycoonId="#\d+"$/ }),
    get('int-property-worldxsize',
      '`WorldXSize` is `#` — capture login-full (`WorldXSize="#2000"`)',
      'interfaceServer', 'WorldXSize', { kind: 'pattern', value: /^WorldXSize="#\d+"$/ }),
    getTycoonCookie('olevariant-function-result',
      'a function returning OleVariant answers `res="%…"` — capture :986-990',
      '', { kind: 'pattern', value: /^res="%/ }),
    setLiteral('literal-int-control', 'control — `#1` parses; if this is not error 3 the harness is wrong', RdoValue.int(1).format()),
    setLiteral('literal-bool-true', 'booleans travel as `#-1` and parse as integers', '"#-1"'),
    setLiteral('literal-double-integral', '`@1` — double without decimal separator', RdoValue.double(1).format()),
    setLiteral('literal-double-fractional',
      '`@1234.5` — the server locale decimal separator is `.` (live 2026-08-16); a `,` locale would answer error 4',
      RdoValue.double(1234.5).format()),
    setLiteral('literal-single-fractional', '`!3.14` — same question in single precision', RdoValue.float(3.14).format()),
  ],
};

export const SEPARATORS_SUITE: Suite = {
  name: 'separators',
  description: 'QueryId × separator matrix (doc/rdo-protocol-architecture.md §8.5). The `"*"`+QueryId row is pinned by mutations/say-this-void-ack.',
  steps: [
    getTycoonCookie('variant-on-function',
      '`"^"` on a Delphi function answers `res=` — capture :986',
      'LastX.0', { kind: 'pattern', value: /^res="[%$]/ }),
    {
      id: 'set-acks-empty',
      intent: '`set` carries no separator and is acked `A<id> ;` — capture :978-979 (`set EnableEvents="#-1"`)',
      target: 'clientView',
      packet: { verb: RdoVerb.SEL, action: RdoAction.SET, member: 'EnableEvents', args: [RdoValue.int(-1).format()] },
      expect: { kind: 'exact', value: '' },
    },
    {
      id: 'variant-on-zero-param-procedure',
      intent: '`"^"` on a 0-parameter procedure answers `error 9` (errIllegalFunctionRes, RDOQueryServer.pas:484), never an ack — live 2026-08-16, 91 ms',
      target: 'clientView',
      packet: { verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'ClientAware' },
      expect: { kind: 'errorCode', value: 9, payload: /^error 9$/ },
      risk: 'variant-on-procedure',
    },
  ],
};

export const ERRORS_SUITE: Suite = {
  name: 'errors',
  description: 'Error reply grammar: `error N`, `error N getting X`, `error N setting X` (ErrorCodes.pas, RDOQueryServer.pas)',
  steps: [
    setLiteral('set-unknown-property-grammar', '`error N setting <Prop>` — RDOQueryServer.pas:338-346', RdoValue.int(1).format()),
    get('get-unknown-property-grammar',
      '`error N getting <Prop>` — RDOQueryServer.pas:278. [INFERRED] N = 5: GetPropInfo nil → CallMethod fallthrough (RDOObjectServer.pas:112-116) → MethodAddress nil → errUnexistentMethod (:326)',
      'clientView', PROBE_PROPERTY, { kind: 'pattern', value: new RegExp(`^error [35] getting ${PROBE_PROPERTY}$`) }),
    {
      id: 'call-unknown-method',
      intent: '`call` on a name that is no method answers bare `error 5` — RDOObjectServer.pas:326 (MethodAddress nil, nothing runs), CallCommand appends no suffix (RDOQueryServer.pas:504)',
      target: 'clientView',
      packet: { verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'RdoConfNoSuchMethod' },
      expect: { kind: 'errorCode', value: 5, payload: /^error 5$/ },
    },
  ],
};

export const LIFECYCLE_SUITE: Suite = {
  name: 'lifecycle',
  description: 'Session bracket: the login the runner performs, plus the reads the reference client makes while a session is alive; graceful Logoff at teardown',
  steps: [
    get('rdocnntid-connection-bound',
      '`RDOCnntId` is answered from the carrying connection (RDOQueryServer.pas:269-274) as `$` — capture login-full',
      'clientView', 'RDOCnntId', { kind: 'pattern', value: /^RDOCnntId="\$\d+"$/ }),
    get('serverbusy-poll',
      '`get ServerBusy` on the ClientView is a boolean `#0`/`#-1` — capture :993-994',
      'clientView', 'ServerBusy', { kind: 'pattern', value: /^ServerBusy="#(0|-1)"$/ }),
    {
      id: 'pick-event',
      intent: '`call PickEvent "^" "#<TycoonId>"` answers `res="%…"` — capture :980-981',
      run: ctx => ctx.emit('clientView', {
        verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'PickEvent',
        args: [RdoValue.int(parseInt(ctx.tycoonId, 10)).format()],
      }),
      expect: { kind: 'pattern', value: /^res="%/ },
    },
    get('company-count',
      '`GetCompanyCount` reads as `#` — capture login-full',
      'clientView', 'GetCompanyCount', { kind: 'pattern', value: /^GetCompanyCount="#\d+"$/ }),
  ],
};

export const READS_SUITE: Suite = {
  name: 'reads',
  description: 'World and account reads. Map / focus / details / mail / politics need coordinates and objects that only a dedicated instance can pin — extend once it exists (plan §6 Q1).',
  steps: [
    get('world-y-size', '`WorldYSize` is `#` — capture login-full', 'interfaceServer', 'WorldYSize', { kind: 'pattern', value: /^WorldYSize="#\d+"$/ }),
    get('world-season', '`WorldSeason` is `#` — capture login-full (`WorldSeason="#2"`)', 'interfaceServer', 'WorldSeason', { kind: 'pattern', value: /^WorldSeason="#\d+"$/ }),
    get('da-addr', '`DAAddr` is `$` — capture login-full', 'interfaceServer', 'DAAddr', { kind: 'pattern', value: /^DAAddr="\$[^"]+"$/ }),
    get('mail-port', '`MailPort` is `#` — capture login-full', 'interfaceServer', 'MailPort', { kind: 'pattern', value: /^MailPort="#\d+"$/ }),
    getTycoonCookie('tycoon-cookie-blob',
      'the empty cookie id returns the whole blob as `Key=Value` lines — capture :986-990',
      '', {
        kind: 'predicate',
        describe: 'res="%…" whose lines are all `Key=Value` (or empty)',
        test: o => {
          if (o.response === null) return false;
          const m = /^res="%([\s\S]*)"$/.exec(o.response);
          if (!m) return false;
          return m[1].split(/\r?\n/).filter(l => l.length > 0).every(l => /^[^=]+=.*$/.test(l));
        },
      }),
  ],
};

/** Cookie the mutations suite writes. */
export const CONFORMANCE_COOKIE = 'RdoConformance';

export const MUTATIONS_SUITE: Suite = {
  name: 'mutations',
  description: 'Steps that change server state. `--target dedicated` only; the suite cleans up after itself.',
  reset: `push SetTycoonCookie(TycoonId, "${CONFORMANCE_COOKIE}", "") at the end of the suite; SayThis leaves a transient whisper only`,
  steps: [
    {
      id: 'cookie-round-trip',
      intent: 'fire-and-forget `SetTycoonCookie` (procedure, 3 params → "*" without QueryId, capture :986) then read it back with `GetTycoonCookie "^"`',
      risk: 'mutation',
      run: async ctx => {
        const tycoon = RdoValue.int(parseInt(ctx.tycoonId, 10)).format();
        await ctx.push('clientView', {
          verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'SetTycoonCookie',
          args: [tycoon, RdoValue.string(CONFORMANCE_COOKIE).format(), RdoValue.string('ok').format()],
        });
        return ctx.emit('clientView', {
          verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'GetTycoonCookie',
          args: [tycoon, RdoValue.string(CONFORMANCE_COOKIE).format()],
        });
      },
      expect: { kind: 'exact', value: 'res="%ok"' },
    },
    {
      id: 'say-this-void-ack',
      intent: '`"*"` + QueryId on a procedure is acked `A<id> ;` — the reference client form (capture :3542-3543 for AddLine); SayThis to self',
      risk: 'mutation',
      run: ctx => ctx.emit('clientView', {
        verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'SayThis', separator: '"*"',
        args: [RdoValue.string(ctx.username).format(), RdoValue.string('rdo-conformance ping').format()],
      }),
      expect: { kind: 'exact', value: '' },
    },
    {
      id: 'cookie-reset',
      intent: 'reset — clear the conformance cookie so the next run proves the write again',
      risk: 'mutation',
      run: async ctx => {
        const tycoon = RdoValue.int(parseInt(ctx.tycoonId, 10)).format();
        await ctx.push('clientView', {
          verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'SetTycoonCookie',
          args: [tycoon, RdoValue.string(CONFORMANCE_COOKIE).format(), RdoValue.string('').format()],
        });
        return ctx.emit('clientView', {
          verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'GetTycoonCookie',
          args: [tycoon, RdoValue.string(CONFORMANCE_COOKIE).format()],
        });
      },
      expect: { kind: 'exact', value: 'res="%"' },
    },
  ],
};

/**
 * The connection floor first, then the frame suites (one frame, one oracle),
 * then the scenario suites (session methods), and the mutations last.
 *
 * `CONNECTION_SUITE` leads because it judges the sequence every other suite
 * depends on: they all address objects the login resolved, so a catalogue that
 * reported them before reporting that sequence would read backwards. It costs
 * nothing to put first — it emits no frame at all (`connection-suite.ts`).
 *
 * The mutations go last for the same reason a suite stops at its first silence:
 * `runAll` ends the run at the suite that stopped, so everything whose verdict
 * is already pinned by a capture runs while the server is known to be answering.
 */
export const SUITES: readonly Suite[] = [
  CONNECTION_SUITE,
  TYPES_SUITE, SEPARATORS_SUITE, ERRORS_SUITE, LIFECYCLE_SUITE, READS_SUITE,
  ...SCENARIO_SUITES,
  MUTATIONS_SUITE,
];

export function suiteByName(name: string): Suite | undefined {
  return SUITES.find(s => s.name === name);
}

/** Every step id, `suite/id`, for `--only`. */
export function allStepIds(): string[] {
  return SUITES.flatMap(s => s.steps.map((st: Step) => `${s.name}/${st.id}`));
}

// The catalogue is validated once, when the module loads: a suite that could
// freeze a server must not exist long enough to be selected.
assertSuitesSafe([...SUITES]);
