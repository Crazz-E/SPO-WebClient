/**
 * RDO conformance suite — shared types.
 *
 * A *step* is one frame the suite puts on the wire through the real
 * `StarpeaceSession`, plus the oracle that judges the reply. A *suite* groups
 * steps by the protocol property they pin (type prefixes, separator matrix,
 * error grammar, session lifecycle…), never by the investigation that
 * happened to produce them.
 *
 * Steps are declarative by default (`RdoStep`) so a suite reads as data and
 * can be diffed against a baseline. Stateful chains that need a value from an
 * earlier reply (`focus → details`, `lock → build → verify`) use the imperative
 * escape hatch (`ImperativeStep`) — same outcome shape, same verdict path.
 */

import type { RdoAction, RdoVerb } from '../../shared/types';
import type { TimeoutCategory } from '../../shared/timeout-categories';
import type { StarpeaceSession } from '../../server/spo_session';
import type { HaltRecord } from './halt';
import type { WireView } from './wire-view';

// ── Oracle ─────────────────────────────────────────────────────────────────

/**
 * What a step expects the server to answer.
 *
 * - `exact`     — the reply payload, byte for byte (`UserName="$SPO_test3"`).
 * - `pattern`   — a regular expression the payload must match.
 * - `errorCode` — the server replied `error N` (an ANSWER, not a failure).
 * - `predicate` — anything else; `describe` is the human-readable contract.
 * - `answered`  — any reply at all. Pins liveness only, never content.
 *
 * A step WITHOUT an expectation is observed, not judged: its verdict is
 * `UNKNOWN`. That is the shape a step has before its baseline exists.
 */
export type Expectation =
  | { kind: 'exact'; value: string }
  | { kind: 'pattern'; value: RegExp }
  | { kind: 'errorCode'; value: number; payload?: RegExp }
  | { kind: 'predicate'; describe: string; test: (outcome: StepOutcome) => boolean }
  | { kind: 'answered' };

export type VerdictKind = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface Verdict {
  kind: VerdictKind;
  /** One line a human can act on: what was expected, what came back. */
  detail: string;
}

/**
 * Keys under which the connection floor publishes what it learned, for the
 * `connexion` suite to judge. Written by `run.ts`, read by `connection-suite.ts`.
 *
 * It lives in `types.ts` and not in `runner.ts` for one mechanical reason:
 * `connection-suite.ts` needs it, `suites.ts` imports the connexion suite, and
 * `runner.ts` imports `suites.ts`. Declaring it beside the runner closed that
 * loop and the catalogue asserted itself into `undefined` at load time. This
 * module imports nothing of its own, so it cannot participate in a cycle.
 */
export const CONNECTION_STATE = {
  /** string[] — every world the directory listed. */
  worlds: 'connexion:worlds',
  /** string — the world `--world` asked for. */
  requestedWorld: 'connexion:requestedWorld',
  /** { clientViewId, interfaceServerId, tycoonId } — what loginWorld returned. */
  login: 'connexion:login',
  /** string[] — every company the world login produced. */
  companies: 'connexion:companies',
  /** string — the company `--company` asked for. */
  requestedCompany: 'connexion:requestedCompany',
  /** { id, name } — the company actually selected. */
  selectedCompany: 'connexion:selectedCompany',
  /** string — why no company was selected, when that is declared rather than a failure. */
  companySkipped: 'connexion:companySkipped',
  /** SessionPhase — the phase reached before exploration started. */
  phase: 'connexion:phase',
} as const;

// ── Steps ──────────────────────────────────────────────────────────────────

/** Which server object a declarative step addresses. Resolved by the runner. */
export type StepTarget =
  | 'clientView'        // the TClientView returned by Logon (worldContextId)
  | 'interfaceServer'   // the TInterfaceServer resolved by `idof InterfaceServer`
  | { objectId: string };

/**
 * Risk class of a step. Decides which target may run it and which flag it needs.
 *
 * - `read`      — pure read (`get`), or a `set`/`call` proven to write nothing.
 *                 Runs on any target.
 * - `mutation`  — changes server state. `--target dedicated` only; the suite
 *                 that carries it must document its reset.
 * - `variant-on-procedure` — emits `"^"` on a Delphi `procedure`. Detectable
 *                 without danger ONLY when the procedure takes 0 parameters
 *                 (hidden result pointer stays in a register —
 *                 `RDOObjectServer.pas:281-292`, live-proven 2026-08-16); needs
 *                 `--allow-variant-on-procedure` and is excluded from `all`.
 */
export type StepRisk = 'read' | 'mutation' | 'variant-on-procedure';

/**
 * A step may carry SEVERAL risk classes, and since 2026-08-18 it has to.
 *
 * The classes are independent axes, not a ladder: `mutation` says the step
 * changes server state, `variant-on-procedure` says it emits `"^"` on a member
 * that may be a Delphi `procedure`. Wave 2 of the certification sweep is both —
 * `"^"` on unadjudicated members, and the server runs the method body
 * (`RDOObjectServer.pas:294`), so it mutates a live account. Declaring only the
 * second would let it through without `--allow-mutations`, which is the
 * relabelling the plan refuses (rev. 3 §5.1): it would falsify the very
 * bookkeeping the suite exists to produce.
 */
export type StepRisks = StepRisk | readonly StepRisk[];

/** Every risk class a step declares, as a list. */
export function stepRisks(step: { risk?: StepRisks }): readonly StepRisk[] {
  if (step.risk === undefined) return [];
  return typeof step.risk === 'string' ? [step.risk] : step.risk;
}

/** Does this step declare `risk`? */
export function hasRisk(step: { risk?: StepRisks }, risk: StepRisk): boolean {
  return stepRisks(step).includes(risk);
}

export interface StepPacket {
  verb: RdoVerb;
  action: RdoAction;
  member: string;
  args?: string[];
  /**
   * Explicit separator. Omit for the default (`"^"` on call).
   *
   * `"*"` is legal ONLY on a member `VOID_MEMBERS` proves to be a Delphi
   * `procedure`. There used to be a `probe` field here that opted a packet out
   * of that guard for the certification sweep; on 2026-08-18 the one frame it
   * let out — `call GetUserList "*"` on a `function` — left the shared Interface
   * Server answering `errMalformedQuery` to every query. The field is gone and
   * must not come back: see `assertNotVoidPush`.
   */
  separator?: string;
}

/** A declarative step: one packet, one oracle. */
export interface RdoStep {
  id: string;
  /** Human-readable purpose, with the Delphi citation when one exists. */
  intent: string;
  target: StepTarget;
  packet: StepPacket;
  expect?: Expectation;
  risk?: StepRisks;
  /** True when the reply legitimately differs between runs (counts, timings, HTTP): kept out of the baseline. */
  volatile?: true;
}

/**
 * The slice of the session a scenario step may drive.
 *
 * It used to be read methods only. Since 2026-08-18 it also carries the
 * mutations of the live campaign (plan rev. 3 §4): a mutation reaches the wire
 * only when its step declares `risk: 'mutation'` AND the run carries
 * `--target dedicated` or `--allow-mutations` — the risk class is the gate, not
 * the width of this type. Widen it member by member, never in bulk: a method
 * added here is a method the suite can put on the wire.
 *
 * Every entry below was checked against `src/server/spo_session.ts` at the line
 * quoted; a name that no longer resolves is a compile error, which is the point.
 */
export type SessionDriver = Pick<StarpeaceSession,
  | 'sendRdoRequest' | 'getSocket'
  | 'connectMapService' | 'loadMapArea' | 'updateCameraPosition' | 'getPlayerPosition' | 'getSurfaceData'
  | 'focusBuilding' | 'unfocusBuilding'
  | 'getCacherPropertyListAt' | 'queryTycoonPoliticalRole'
  | 'getBuildingBasicDetails' | 'getBuildingTabData' | 'refreshBuildingProperties' | 'releaseInspector' | 'getBuildingDetails'
  | 'getChatUserList' | 'getChatChannelList' | 'getChatChannelInfo' | 'joinChatChannel'
  | 'connectMailService' | 'getMailUnreadCount' | 'getMailFolder' | 'readMailMessage' | 'getMailAccount'
  | 'fetchOwnedFacilities' | 'getPoliticsData' | 'getResearchInventory'

  // ── Reads that are PRECONDITIONS of a mutation sequence ──────────────────
  // Without these nothing downstream is reachable: `connectConstructionService`
  // (:983) opens the socket `placeBuilding` needs, the category/facility reads
  // produce the class name it takes, and `executeRdo` (:1559) is the only way to
  // address a socket other than `world` (map, mail).
  | 'connectConstructionService' | 'fetchBuildingCategories' | 'fetchBuildingFacilities'
  | 'fetchClusterInfo' | 'fetchClusterFacilities' | 'getRoadCostEstimate'
  | 'ensureMailConnection' | 'searchConnections' | 'fetchAutoConnections' | 'fetchPolicy'
  | 'fetchBankAccount' | 'fetchCompanies' | 'fetchTycoonProfile' | 'fetchProfitLoss' | 'fetchCurriculumData'
  | 'getResearchDetails' | 'executeRdo'

  // ── RDO mutations (world state) ──────────────────────────────────────────
  | 'cloneFacility' | 'manageConstruction' | 'upgradeBuildingAction' | 'renameFacility' | 'deleteFacility'
  | 'buildRoad' | 'demolishRoad' | 'wipeCircuit'
  | 'defineZone' | 'placeBuilding' | 'placeCapitol' | 'setBuildingProperty'
  | 'savePlayerPosition' | 'connectFacilitiesByCoords'
  | 'sendChatMessage' | 'setChatTypingStatus'

  // ── Cache Server scratch objects — a reversible mutative sequence ─────────
  // Create → set → read → close, all on an object the run owns. The safest
  // mutation shape available on the shared server.
  | 'cacherCreateObject' | 'cacherSetObject' | 'cacherSetPath' | 'cacherGetPropertyList'
  | 'cacherCloseObject' | 'getObjectRdoId'

  // ── Mail and ASP mutations ───────────────────────────────────────────────
  | 'composeMail' | 'saveDraft' | 'deleteMailMessage'
  | 'executeBankAction' | 'executeAutoConnectionAction' | 'setPolicyStatus' | 'executeCurriculumAction'
  | 'politicsVote' | 'politicsLaunchCampaign' | 'politicsCancelCampaign'
> & {
  worldContextId: string | null;
  interfaceServerId: string | null;
  tycoonId?: string | null;
  currentWorldInfo?: { name: string; ip: string } | null;
  /**
   * The company selected after login (`spo_session.ts:291`). The build
   * catalogue is per company (`KindList.asp?Company=…`), so the facility
   * sequence cannot resolve the class it has to rebuild with without it.
   */
  currentCompany?: { id: string; name: string } | null;
};

/**
 * Thrown by a scenario step whose precondition is not met (no building in the
 * area, no mail in the inbox…). The runner records it as SKIPPED with the
 * reason and moves on — it is neither a failure nor silence.
 */
export class StepSkip extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'StepSkip';
  }
}

/** What an imperative step can reach. */
export interface StepContext {
  /**
   * Emit a request (QueryId, awaits the reply) at `target` through the real session.
   *
   * `category` defaults to `FAST` (60 s, legacy `DefTimeOut`) — right for a
   * property read, wrong for a mutation: a build or an upgrade legitimately
   * stalls past a simulation tick, and a step declared `fail` on a 60 s
   * expiration is a false negative, not a finding. Name `NORMAL`/`SLOW`
   * (180 s, `ISProxyTimeOut`) when the step drives one.
   */
  emit(target: StepTarget, packet: StepPacket, category?: TimeoutCategory): Promise<StepOutcome>;
  /**
   * Fire-and-forget push (`"*"`, no QueryId) through `writeRdoFrame` — the only
   * form for a Delphi `procedure` with parameters. Resolves once written.
   */
  push(target: StepTarget, packet: StepPacket): Promise<void>;
  /**
   * Drive a session read method and observe the frames it produced. `member`
   * names the frame whose reply is the outcome; every frame goes into
   * `outcome.wire`. A method that throws after the server answered is a client
   * failure (FAIL), not silence; a method that throws with no answer is silence.
   */
  scenario(member: string, run: (session: SessionDriver) => Promise<unknown>): Promise<StepOutcome>;
  /** The real session — for reads only. */
  readonly session: SessionDriver;
  /** The transport recorder, positioned. */
  readonly wire: WireView;
  /** Scratch shared by every step of the run (a building found by `map` is reused by `focus`). */
  readonly state: Map<string, unknown>;
  /** Values learned during login. */
  readonly clientViewId: string;
  readonly interfaceServerId: string;
  readonly tycoonId: string;
  readonly username: string;
}

/** An imperative step: runs arbitrary session calls, must return an outcome. */
export interface ImperativeStep {
  id: string;
  intent: string;
  risk?: StepRisks;
  expect?: Expectation;
  /** True when the reply legitimately differs between runs (counts, timings, HTTP): kept out of the baseline. */
  volatile?: true;
  run(ctx: StepContext): Promise<StepOutcome>;
}

export type Step = RdoStep | ImperativeStep;

export function isImperativeStep(step: Step): step is ImperativeStep {
  return typeof (step as ImperativeStep).run === 'function';
}

// ── Suites ─────────────────────────────────────────────────────────────────

export interface Suite {
  name: string;
  /** What this suite pins, in one sentence. */
  description: string;
  steps: Step[];
  /**
   * How a dedicated server is returned to its pre-suite state. Mandatory
   * (and asserted at load time) for any suite that carries a mutation step.
   */
  reset?: string;
}

// ── Outcomes ───────────────────────────────────────────────────────────────

/** What one step observed. Never a throw — silence is itself an observation. */
export interface StepOutcome {
  /** Reply payload verbatim, or `null` when the server did not answer at all. */
  response: string | null;
  /** Set when the server answered `A<id> error N;`. */
  errorCode?: number;
  /**
   * Set when the request genuinely failed (timeout, transport, guard refusal),
   * or — with `response` non-null — when the client-side method threw after
   * the server had answered.
   */
  error?: string;
  elapsedMs: number;
  /** Every frame the step produced (scenario steps), `>> ` out / `<< ` in. */
  wire?: string[];
}

export interface StepReport {
  suite: string;
  id: string;
  intent: string;
  /** The frame as it went on the wire, minus the QueryId. Absent for imperative steps. */
  frame?: string;
  outcome: StepOutcome;
  verdict: Verdict;
  /** Mirrors `Step.volatile` — the baseline leaves such steps out. */
  volatile?: true;
}

export interface SuiteReport {
  name: string;
  steps: StepReport[];
  /** Steps not run on this target / without their flag, with the reason. */
  skipped: Array<{ id: string; reason: string }>;
  /** True when the suite was cut short by an unanswered frame. */
  stoppedOnSilence: boolean;
  /**
   * True when the suite was cut short by N consecutive `error N` replies.
   *
   * A separate axis from {@link stoppedOnSilence}, and the one that was missing
   * on 2026-08-18: an `error 1` reply is an ANSWER — `response` is non-null — so
   * it produces a FAIL per step and interrupts nothing. That morning the shared
   * Interface Server answered `error 1` to everything for 75 minutes and the
   * harness kept emitting into it.
   */
  stoppedOnDegradation?: boolean;
  /**
   * Written whenever `stoppedOnSilence` is true — the attribution of the stop.
   *
   * `runSuite` breaks at the FIRST unanswered frame, so the last frame emitted
   * IS the suspect; there is nothing to reconstruct afterwards and no 47-minute
   * `ISCnx` window to wait for. The record carries the frame, the member, the
   * ClientViewId and the `suite/step`, in the shape a human would have written
   * by hand into `.rdo-live/HALT`.
   *
   * **It is a record, not a brake.** Nothing here writes `.rdo-live/HALT`: that
   * file stays manual by developer rule (`halt.ts`, 2026-08-18). This only makes
   * the freeze self-attributing in the run report.
   */
  halt?: HaltRecord;
}

export type TargetKind = 'shared' | 'dedicated';
export type TransportKind = 'live' | 'replay';

/** What the login learned — the join keys for the server-log correlation. */
export interface SessionFacts {
  clientViewId: string | null;
  interfaceServerId: string | null;
  tycoonId: string | null;
  /** Company selected after login (`--company`), or null when none. */
  company: string | null;
  loginAt: string | null;
  logoffAt: string | null;
}

export interface RunReport {
  tool: 'rdo-conformance';
  version: 1;
  startedAt: string;
  finishedAt: string;
  target: TargetKind;
  transport: TransportKind;
  world: string;
  session: SessionFacts;
  suites: SuiteReport[];
  summary: { pass: number; fail: number; unknown: number };
  /** Set when `--server-logs` correlated the run with the public server logs. */
  serverLogs?: unknown;
}
