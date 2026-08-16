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
import { assertPacketSafe } from './suites';
import { Recorder } from './transport';
import { WireView } from './wire-view';
import type {
  SessionDriver, Step, StepContext, StepOutcome, StepPacket, StepReport, StepTarget, Suite, SuiteReport, TargetKind,
} from './types';
import { StepSkip, isImperativeStep } from './types';

export type { SessionDriver } from './types';

export interface RunPolicy {
  target: TargetKind;
  allowVariantOnProcedure: boolean;
  /** Restrict to these `suite/step` ids. Empty/undefined = every step. */
  only?: ReadonlySet<string>;
  /** Hard cap on frames emitted per run (declarative emits, pushes and scenario frames alike). */
  frameBudget: number;
  username: string;
}

export const DEFAULT_FRAME_BUDGET = 400;

/** Thrown when a step or the budget refuses to emit — never a transport failure. */
export class ConformanceRefusal extends Error {}

// ── Selection ──────────────────────────────────────────────────────────────

/** Why a step is not run on this target with these flags, or null when it may run. */
export function refusalReason(step: Step, policy: RunPolicy): string | null {
  if (step.risk === 'mutation' && policy.target !== 'dedicated') {
    return 'mutation — needs --target dedicated';
  }
  if (step.risk === 'variant-on-procedure' && !policy.allowVariantOnProcedure) {
    return '"^" on a procedure — needs --allow-variant-on-procedure (settled live 2026-08-16: error 9; re-running buys nothing)';
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
 */
export async function emitRequest(session: SessionDriver, targetId: string, packet: StepPacket): Promise<StepOutcome> {
  const startedAt = Date.now();
  try {
    const reply = await session.sendRdoRequest('world', { ...packet, targetId }, undefined, TimeoutCategory.FAST);
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
}

export class ConformanceRunner {
  private framesEmitted = 0;
  private readonly wire: WireView;
  private readonly state = new Map<string, unknown>();

  constructor(
    private readonly session: SessionDriver,
    private readonly policy: RunPolicy,
    private readonly hooks: RunnerHooks = {},
    recorder: Recorder = new Recorder(),
  ) {
    this.wire = new WireView(recorder);
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
      emit: (target, packet) => {
        assertPacketSafe(packet, where, allowZeroParamVariant);
        this.spend(where);
        return emitRequest(session, resolveTarget(session, target), packet);
      },
      push: async (target, packet) => {
        // A push never carries "^" — the formatter is told so explicitly.
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
    const allowZeroParam = step.risk === 'variant-on-procedure';
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
    for (const step of run) {
      const report = await this.runStep(suite, step);
      if ('skipped' in report) {
        skipped.push({ id: step.id, reason: report.skipped });
        continue;
      }
      steps.push(report);
      if (report.outcome.response === null) {
        stoppedOnSilence = true;
        break;
      }
    }
    return { name: suite.name, steps, skipped, stoppedOnSilence };
  }

  /**
   * Run suites in order. A suite that stopped on silence ends the run: the
   * next suite would put more frames on a server that just stopped talking.
   */
  async runAll(suites: Suite[]): Promise<SuiteReport[]> {
    const reports: SuiteReport[] = [];
    for (const suite of suites) {
      const report = await this.runSuite(suite);
      reports.push(report);
      if (report.stoppedOnSilence) break;
    }
    return reports;
  }
}
