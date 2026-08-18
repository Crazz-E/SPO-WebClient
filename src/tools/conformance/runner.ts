/**
 * ConformanceRunner — drives the real `StarpeaceSession` through the selected
 * suites and folds every reply into a verdict.
 *
 * What it owns:
 *   - target resolution (`clientView` → worldContextId, `interfaceServer` → the
 *     id resolved by `idof InterfaceServer`) — the same ids production uses;
 *   - the risk gate: which steps a target may run and which flag they need;
 *   - the stop-on-silence rule: one unanswered frame ends the suite. Not
 *     politeness — an unanswered frame means the request thread may be gone,
 *     and every further frame would land on a server that just stopped talking;
 *   - the frame budget: a hard cap on frames per run, so a runaway suite cannot
 *     turn into load;
 *   - scenario steps: a step may drive a session READ method (`loadMapArea`,
 *     `focusBuilding`, `getBuildingBasicDetails`…) and is judged on the frames
 *     that method put on the wire, read back from the transport recorder.
 *
 * What it does NOT own: the wire. Every frame goes through `session.sendRdoRequest`
 * (QueryId + `"^"`, the production path), `writeRdoFrame` (void push), or the
 * session's own methods — so a step exercises the same formatter, guards,
 * timeouts and error contract as the gateway. A probe that hand-builds its
 * frames tests the probe, not the client.
 */

import { RdoServerError } from '../../server/session/rdo-error-contract';
import { RdoProtocol } from '../../server/rdo';
import { writeRdoFrame } from '../../server/rdo-helpers';
import { RDO_CONSTANTS, RdoAction } from '../../shared/types';
import { TimeoutCategory } from '../../shared/timeout-categories';
import { toErrorMessage } from '../../shared/error-utils';
import { evaluate } from './oracle';
import type { HaltRecord } from './halt';
import { assertNotSessionLifecycleMember } from '../../server/session/rdo-request-guards';
import { assertPacketSafe } from './suites';
import { Recorder } from './transport';
import { WireView } from './wire-view';
import type {
  SessionDriver, Step, StepContext, StepOutcome, StepPacket, StepReport, StepTarget, Suite, SuiteReport, TargetKind,
} from './types';
import { StepSkip, hasRisk, isImperativeStep } from './types';

export type { SessionDriver } from './types';

export interface RunPolicy {
  target: TargetKind;
  allowVariantOnProcedure: boolean;
  /**
   * Run `risk: 'mutation'` steps on a target that is not `dedicated`.
   *
   * A mutation step goes through `call MethodAddr` and the server executes the
   * method body on a live account. Declaring such a step `risk: 'read'` to slip
   * past the gate would be a lie to the bookkeeping the suite exists to
   * produce; this flag is the honest route.
   */
  allowMutations: boolean;
  /** Restrict to these `suite/step` ids. Empty/undefined = every step. */
  only?: ReadonlySet<string>;
  /** Hard cap on frames emitted per run (declarative emits, pushes and scenario frames alike). */
  frameBudget: number;
  username: string;
}

/**
 * Hard cap on frames per run — a runaway suite must not become load.
 *
 * MEASURED, not guessed (R1, 2026-08-18). 3000 sized the certification sweep of
 * plan rev. 3 (~450 frames of its own on top of a login), and that sweep is gone.
 *
 * Re-measured on a full offline replay against
 * `report/campaign/rec/planitia-2026-08-17.ndjson`, the figure the run now
 * prints on every execution (`[conformance] frames emitted: N / B budget`):
 *
 *   --suite all                     →  66 frames  (13 steps skipped)
 *   the same + --allow-mutations    →  69 frames  (10 skipped)
 *
 * The `connexion` suite adds 0: it judges the connection floor from the
 * recording and emits nothing. So the whole catalogue is ~70 frames, and the
 * login that precedes it is another ~20 the runner does not count.
 *
 * 600 is that measurement with room for the P5-P12 parcours of R4 — around
 * eight times the current draw, deliberately not tight. A cap a run routinely
 * hits is a cap that gets routinely raised with `--frame-budget`, which is the
 * same as not having one; the cap exists so a runaway loop cannot become load,
 * not to be a per-run quota.
 */
export const DEFAULT_FRAME_BUDGET = 600;

/**
 * Consecutive `error N` replies that end the run — the detector that was
 * missing on 2026-08-18.
 *
 * Until then the ONLY stop condition was silence (`response === null`). An
 * `error 1` reply is an answer: `response` is non-null, the step is a FAIL and
 * the run carries on. That morning the shared Interface Server answered
 * `error 1` to every query, on every connection, for 75 minutes, and the
 * harness kept feeding it.
 *
 * ⚠ CALIBRATION, HONESTLY: **this would not have prevented the incident.** The
 * damage was done by the FIRST frame — `call GetUserList "*"` on a `function`,
 * an arbitrary write inside the server process. Everything after it was
 * consequence, not cause. What this bounds is the BLAST RADIUS: the frames a
 * run keeps emitting into a server it has already broken, or that a third party
 * has. It buys minutes, not safety, and no threshold protects against the frame
 * that breaks things.
 *
 * ## Only an UNEXPECTED error counts — measured, not assumed
 *
 * The first calibration counted every `errorCode`, and a replay of `--suite all`
 * tripped it immediately: `types` runs FIVE literal-parser steps in a row whose
 * oracle IS `error 3` (`errUnexistentProperty`, the point of the suite), and
 * `errors` runs three more. A detector that stops the run on a suite doing
 * exactly what it was written to do is worse than no detector — it would be
 * disabled within a day.
 *
 * So the counter measures **failure to succeed**, not the presence of an error
 * code: a step that answered `error N` and PASSED its oracle resets it, like any
 * other success. What survives is the signal that was missing on 2026-08-18 —
 * a server answering errors where the run expected values.
 *
 * 5 rather than 1 on top of that, because a handful of genuine `error 5`
 * (member not published) is a normal finding on an unadjudicated surface, and
 * should be reported rather than end the run.
 */
export const MAX_CONSECUTIVE_ERRORS = 5;

/**
 * The two steps allowed to emit a {@link SESSION_LIFECYCLE_MEMBERS} member,
 * each adjudicated by a live capture, each named.
 *
 * This is an enumerated whitelist, not a flag — the same shape as
 * `VOID_MEMBERS`, and deliberately not the shape of the `probe` opt-in that let
 * the 2026-08-18 frame out. An opt-in generalises to whatever asks for it; a
 * list of two `suite/step` ids with a citation each cannot grow silently.
 *
 * Both emit ON PURPOSE, at one frame, to pin a protocol property a capture
 * already settles — they do not re-establish anything:
 *
 *  - `set EnableEvents="#-1"` pins that `set` carries no separator and is acked
 *    `A<id> ;` (capture :978-979). It re-sends the value `selectCompany` already
 *    set, so the session state after it is the state before it.
 *  - `call ClientAware "^"` pins that `"^"` on a 0-parameter procedure answers
 *    `error 9` and never an ack (live 2026-08-16, 91 ms). It is refused before
 *    the server runs anything, and it is already behind
 *    `--allow-variant-on-procedure`.
 */
export const LIFECYCLE_ADJUDICATED: ReadonlyMap<string, string> = new Map([
  ['separators/set-acks-empty', 'set EnableEvents="#-1" — capture :978-979; re-sends the value selectCompany already set'],
  ['separators/variant-on-zero-param-procedure', 'call ClientAware "^" — error 9 in 91 ms, live 2026-08-16; behind --allow-variant-on-procedure'],
]);

/** Thrown when a step or the budget refuses to emit — never a transport failure. */
export class ConformanceRefusal extends Error {}

// ── Selection ──────────────────────────────────────────────────────────────

/** Why a step is not run on this target with these flags, or null when it may run. */
export function refusalReason(step: Step, policy: RunPolicy): string | null {
  if (hasRisk(step, 'mutation') && policy.target !== 'dedicated' && !policy.allowMutations) {
    return 'mutation — needs --target dedicated, or --allow-mutations to declare the intent on a shared server';
  }
  // The gate is on the EXECUTION, not on the freeze. `"^"` at 0 or 1 emitted
  // argument cannot freeze anything (RDOObjectServer.pas:214-218 — the axis is
  // the arguments emitted, not the arity declared), but the server still runs
  // the method body on the live account. The flag is where that is decided.
  if (hasRisk(step, 'variant-on-procedure') && !policy.allowVariantOnProcedure) {
    return '"^" on a procedure — needs --allow-variant-on-procedure ' +
      '(harmless below 2 emitted arguments: error 9 at 0 args, live 2026-08-16; error 9 at 1 arg, capture)';
  }
  return null;
}

export function selectSteps(suite: Suite, policy: RunPolicy): { run: Step[]; skipped: SuiteReport['skipped'] } {
  const run: Step[] = [];
  const skipped: SuiteReport['skipped'] = [];
  for (const step of suite.steps) {
    const key = `${suite.name}/${step.id}`;
    if (policy.only && policy.only.size > 0 && !policy.only.has(key)) continue;
    const reason = refusalReason(step, policy);
    if (reason) skipped.push({ id: step.id, reason });
    else run.push(step);
  }
  return { run, skipped };
}

// ── Emission ───────────────────────────────────────────────────────────────

function resolveTarget(session: SessionDriver, target: StepTarget): string {
  if (typeof target === 'object') return target.objectId;
  const id = target === 'clientView' ? session.worldContextId : session.interfaceServerId;
  if (!id) throw new ConformanceRefusal(`Target ${target} is not resolved — login did not complete.`);
  return id;
}

/** The frame as the report shows it: production formatter, QueryId elided. */
export function describeFrame(targetId: string, packet: StepPacket, request: boolean): string {
  const separator = packet.action === RdoAction.CALL
    ? (packet.separator ?? (request ? RDO_CONSTANTS.METHOD_SEPARATOR : RDO_CONSTANTS.PUSH_SEPARATOR))
    : undefined;
  return RdoProtocol.format({ raw: '', type: 'REQUEST', ...packet, targetId, separator });
}

/**
 * Emit one request and record what came back, verbatim. Never throws.
 *
 * `A<id> error N;` is an ANSWER: several oracles are built on the code (the
 * literal parser is judged on `error 3` vs `error 4`, `"^"` on a procedure on
 * `error 9`). Depending on `config.rdo.errorContract` such a reply either
 * resolves with `errorCode` set (observe) or rejects as `RdoServerError`
 * (reject); both carry the raw payload and both land here as an answer.
 * Treating them as failures would report "no answer" for a server that
 * answered perfectly — and stop the suite.
 *
 * `category` defaults to `FAST` (60 s), the right deadline for the property
 * reads the frame suites are made of. A step that drives a mutation names its
 * own: rejecting a build at 60 s when the reference client waits 180 s
 * (`ISProxyTimeOut`) would be recorded as silence, which ends the run.
 */
export async function emitRequest(
  session: SessionDriver,
  targetId: string,
  packet: StepPacket,
  category: TimeoutCategory = TimeoutCategory.FAST,
): Promise<StepOutcome> {
  const startedAt = Date.now();
  try {
    const reply = await session.sendRdoRequest('world', { ...packet, targetId }, undefined, category);
    const outcome: StepOutcome = { response: reply.payload ?? '', elapsedMs: Date.now() - startedAt };
    if (reply.errorCode !== undefined && reply.errorCode > 0) outcome.errorCode = reply.errorCode;
    return outcome;
  } catch (err: unknown) {
    if (err instanceof RdoServerError) {
      return { response: err.payload, errorCode: err.errorCode, elapsedMs: Date.now() - startedAt };
    }
    return { response: null, error: toErrorMessage(err), elapsedMs: Date.now() - startedAt };
  }
}

// ── Runner ─────────────────────────────────────────────────────────────────

export interface RunnerHooks {
  /** Called after each step, as it happens — a suite that batches its output tells you nothing while it runs. */
  onStep?(report: StepReport): void;
  onSkip?(suite: string, id: string, reason: string): void;
  /**
   * Called once, with the attribution, when a suite stops on silence. The
   * record is also attached to the suite report; this hook exists so the run
   * can print it the moment it happens rather than at the summary.
   */
  onHalt?(record: HaltRecord): void;
}

/**
 * Build the attribution of a stop from the step that produced the silence.
 *
 * `runSuite` breaks at the FIRST unanswered frame, so the suspect is the last
 * frame emitted — no window to wait for, no wave to isolate, no correlation to
 * run. Exported because the shape of that claim is worth pinning in a test.
 */
export function attributeSilence(
  suite: Suite, step: Step, report: StepReport, session: SessionDriver, at: Date,
): HaltRecord {
  const lastOutgoing = report.outcome.wire?.filter(f => f.startsWith('>> ')).pop()?.slice(3);
  return {
    at: at.toISOString(),
    reason: report.outcome.error
      ? `no answer at ${suite.name}/${step.id}: ${report.outcome.error}`
      : `no answer at ${suite.name}/${step.id}`,
    lastFrame: report.frame ?? lastOutgoing ?? null,
    member: isImperativeStep(step) ? null : step.packet.member,
    socket: 'world',
    clientViewId: session.worldContextId,
    where: `${suite.name}/${step.id}`,
  };
}

/**
 * Build the attribution of a stop caused by consecutive errors.
 *
 * Same shape as {@link attributeSilence} so the operator reads one format, and
 * deliberately the same honesty: `lastFrame` is the last frame emitted, which
 * is the last SYMPTOM, not necessarily the cause. Under global degradation the
 * cause is upstream of everything the run can see — say so rather than point at
 * an innocent frame.
 */
export function attributeDegradation(
  suite: Suite, step: Step, report: StepReport, session: SessionDriver, at: Date, run: number,
): HaltRecord {
  const lastOutgoing = report.outcome.wire?.filter(f => f.startsWith('>> ')).pop()?.slice(3);
  return {
    at: at.toISOString(),
    reason: `${run} consecutive error replies, last at ${suite.name}/${step.id} `
      + `(error ${report.outcome.errorCode ?? '?'}) — the server is answering but no longer succeeding. `
      + 'The frame named below is the last SYMPTOM, not necessarily the cause: global degradation '
      + 'starts before the run can see it (2026-08-18, error 1 to every query for 75 minutes).',
    lastFrame: report.frame ?? lastOutgoing ?? null,
    member: isImperativeStep(step) ? null : step.packet.member,
    socket: 'world',
    clientViewId: session.worldContextId,
    where: `${suite.name}/${step.id}`,
  };
}

export class ConformanceRunner {
  private framesEmitted = 0;
  /** Errors in a row across the WHOLE run — degradation does not respect suite boundaries. */
  private consecutiveErrors = 0;
  private readonly wire: WireView;
  private readonly state: Map<string, unknown>;

  /**
   * `initialState` seeds the scratch every step reads through `ctx.state`.
   *
   * It is how the connection floor — which necessarily runs BEFORE the runner
   * exists, since `context()` resolves `clientView` eagerly — hands what it
   * learned to the `connexion` suite, which judges the sequence without
   * re-emitting a single frame of it. Same mechanism the scenario suites
   * already use to pass a building from `map` to `focus`; no new concept.
   */
  constructor(
    private readonly session: SessionDriver,
    private readonly policy: RunPolicy,
    private readonly hooks: RunnerHooks = {},
    recorder: Recorder = new Recorder(),
    initialState: ReadonlyMap<string, unknown> = new Map(),
  ) {
    this.wire = new WireView(recorder);
    this.state = new Map(initialState);
  }

  get emitted(): number {
    return this.framesEmitted;
  }

  private spend(where: string, n = 1): void {
    if (this.framesEmitted + n > this.policy.frameBudget) {
      throw new ConformanceRefusal(`Frame budget (${this.policy.frameBudget}) exhausted at ${where}.`);
    }
    this.framesEmitted += n;
  }

  /**
   * Refuse a session-lifecycle member unless this exact step is on the
   * adjudicated list.
   *
   * The runner is the right place for the PHASE half of that rule: everything
   * it emits happens after the connection floor, by construction — it cannot
   * exist before login, since `context()` resolves `clientView` eagerly.
   */
  private assertLifecycleAllowed(packet: StepPacket, where: string): void {
    if (LIFECYCLE_ADJUDICATED.has(where)) return;
    assertNotSessionLifecycleMember(packet, where);
  }

  private context(where: string, allowZeroParamVariant: boolean): StepContext {
    const session = this.session;
    const wire = this.wire;
    return {
      session,
      wire,
      state: this.state,
      clientViewId: resolveTarget(session, 'clientView'),
      interfaceServerId: resolveTarget(session, 'interfaceServer'),
      tycoonId: session.tycoonId ?? '',
      username: this.policy.username,
      emit: (target, packet, category) => {
        assertPacketSafe(packet, where, allowZeroParamVariant);
        this.assertLifecycleAllowed(packet, where);
        this.spend(where);
        return emitRequest(session, resolveTarget(session, target), packet, category);
      },
      push: async (target, packet) => {
        // A push never carries "^" — the formatter is told so explicitly. It
        // still goes through the packet guard: `assertPacketSafe` is where the
        // unconditional refusal of FORBIDDEN_MEMBERS lives, and a fire-and-forget
        // frame is exactly the shape that must not walk past it.
        assertPacketSafe({ ...packet, separator: RDO_CONSTANTS.PUSH_SEPARATOR }, where, allowZeroParamVariant);
        this.assertLifecycleAllowed(packet, where);
        const targetId = resolveTarget(session, target);
        const socket = session.getSocket('world');
        if (!socket) throw new ConformanceRefusal(`${where}: world socket is gone.`);
        this.spend(where);
        writeRdoFrame(socket, describeFrame(targetId, { ...packet, separator: RDO_CONSTANTS.PUSH_SEPARATOR }, false) + RDO_CONSTANTS.PACKET_DELIMITER);
      },
      scenario: async (member, run) => {
        // The budget is spent on what actually went out, counted after the fact:
        // a scenario's frame count is the session's business, not the step's.
        const mark = wire.mark();
        const startedAt = Date.now();
        let error: string | undefined;
        try {
          await run(session);
        } catch (err: unknown) {
          if (err instanceof StepSkip) throw err;
          error = toErrorMessage(err);
        }
        const outgoing = wire.since(mark).filter(e => e.dir !== 'in').length;
        this.spend(where, outgoing);
        const exchanges = wire.exchanges(mark, member);
        const last = exchanges.length ? exchanges[exchanges.length - 1] : null;
        // A void push has no reply by design: the frame itself is the observation.
        const outcome: StepOutcome = {
          response: last ? (last.rid === undefined ? `(push) ${last.request}` : last.reply) : null,
          elapsedMs: Date.now() - startedAt,
          wire: wire.frames(mark),
        };
        if (last?.reply !== null && last?.reply !== undefined) {
          const code = /^error\s+(\d+)/i.exec(last.reply);
          if (code) outcome.errorCode = parseInt(code[1], 10);
        }
        if (error) outcome.error = error;
        else if (!last) outcome.error = `no ${member} frame was emitted`;
        return outcome;
      },
    };
  }

  /** Run one step; `{ skipped }` when the step skipped itself (precondition not met). */
  async runStep(suite: Suite, step: Step): Promise<StepReport | { skipped: string }> {
    const where = `${suite.name}/${step.id}`;
    const allowZeroParam = hasRisk(step, 'variant-on-procedure');
    let outcome: StepOutcome;
    let frame: string | undefined;

    if (isImperativeStep(step)) {
      const startedAt = Date.now();
      try {
        outcome = await step.run(this.context(where, allowZeroParam));
      } catch (err: unknown) {
        if (err instanceof StepSkip) {
          this.hooks.onSkip?.(suite.name, step.id, err.message);
          return { skipped: err.message };
        }
        // A refusal (guard, budget) or a bug in the step — either way, no answer.
        outcome = { response: null, error: toErrorMessage(err), elapsedMs: Date.now() - startedAt };
      }
    } else {
      const startedAt = Date.now();
      try {
        const targetId = resolveTarget(this.session, step.target);
        frame = describeFrame(targetId, step.packet, true);
        assertPacketSafe(step.packet, where, allowZeroParam);
        this.spend(where);
        outcome = await emitRequest(this.session, targetId, step.packet);
      } catch (err: unknown) {
        outcome = { response: null, error: toErrorMessage(err), elapsedMs: Date.now() - startedAt };
      }
    }

    const report: StepReport = {
      suite: suite.name, id: step.id, intent: step.intent, frame, outcome,
      verdict: evaluate(outcome, step.expect),
      ...(step.volatile ? { volatile: true as const } : {}),
    };
    this.hooks.onStep?.(report);
    return report;
  }

  /** Run one suite, stopping at the first unanswered frame. */
  async runSuite(suite: Suite): Promise<SuiteReport> {
    const { run, skipped } = selectSteps(suite, this.policy);
    for (const s of skipped) this.hooks.onSkip?.(suite.name, s.id, s.reason);

    const steps: StepReport[] = [];
    let stoppedOnSilence = false;
    let stoppedOnDegradation = false;
    let halt: HaltRecord | undefined;
    for (const step of run) {
      const report = await this.runStep(suite, step);
      if ('skipped' in report) {
        skipped.push({ id: step.id, reason: report.skipped });
        continue;
      }
      steps.push(report);
      if (report.outcome.response === null) {
        stoppedOnSilence = true;
        // A gel is a test result, and without attribution it teaches nothing.
        // The suspect is this step: nothing else has gone out since.
        halt = attributeSilence(suite, step, report, this.session, new Date());
        this.hooks.onHalt?.(halt);
        break;
      }
      // Degradation, the second stop condition (2026-08-18). The counter spans
      // suites: a server that has stopped succeeding does not start again at a
      // suite boundary. An error the step EXPECTED is a success and clears it —
      // see MAX_CONSECUTIVE_ERRORS for why that distinction is the whole
      // calibration.
      const unexpectedError = report.outcome.errorCode !== undefined && report.verdict.kind !== 'PASS';
      if (unexpectedError) this.consecutiveErrors += 1;
      else this.consecutiveErrors = 0;
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        stoppedOnDegradation = true;
        halt = attributeDegradation(suite, step, report, this.session, new Date(), this.consecutiveErrors);
        this.hooks.onHalt?.(halt);
        break;
      }
    }
    return {
      name: suite.name, steps, skipped, stoppedOnSilence,
      ...(stoppedOnDegradation ? { stoppedOnDegradation } : {}),
      ...(halt ? { halt } : {}),
    };
  }

  /**
   * Run suites in order. A suite that stopped ends the run — on silence, because
   * the next suite would put frames on a server that stopped talking; on
   * degradation, because it would put them on a server that stopped succeeding.
   */
  async runAll(suites: Suite[]): Promise<SuiteReport[]> {
    const reports: SuiteReport[] = [];
    for (const suite of suites) {
      const report = await this.runSuite(suite);
      reports.push(report);
      if (report.stoppedOnSilence || report.stoppedOnDegradation) break;
    }
    return reports;
  }
}
