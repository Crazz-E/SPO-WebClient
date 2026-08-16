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
import type { StarpeaceSession } from '../../server/spo_session';
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

export interface StepPacket {
  verb: RdoVerb;
  action: RdoAction;
  member: string;
  args?: string[];
  /** Explicit separator. Omit for the default (`"^"` on call). `"*"` only for VOID_MEMBERS. */
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
  risk?: StepRisk;
  /** True when the reply legitimately differs between runs (counts, timings, HTTP): kept out of the baseline. */
  volatile?: true;
}

/**
 * The slice of the session a scenario step may drive. Read methods only —
 * every one of them is what the browser client calls in normal play. Widen it
 * with care: a method added here is a method the suite can put on the wire.
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
> & {
  worldContextId: string | null;
  interfaceServerId: string | null;
  tycoonId?: string | null;
  currentWorldInfo?: { name: string; ip: string } | null;
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
  /** Emit a request (QueryId, awaits the reply) at `target` through the real session. */
  emit(target: StepTarget, packet: StepPacket): Promise<StepOutcome>;
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
  risk?: StepRisk;
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
