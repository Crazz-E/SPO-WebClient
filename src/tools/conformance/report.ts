/**
 * Report — the machine-readable run report, the human log lines, the exit
 * code, and the baseline record/diff.
 *
 * All pure. The CLI is a thin shell around these.
 */

import type { HaltRecord } from './halt';
import type { RunReport, SessionFacts, StepReport, SuiteReport, TargetKind, TransportKind, VerdictKind } from './types';

// ── Run report ─────────────────────────────────────────────────────────────

export function summarize(suites: SuiteReport[]): RunReport['summary'] {
  const summary = { pass: 0, fail: 0, unknown: 0 };
  for (const suite of suites) {
    for (const step of suite.steps) {
      if (step.verdict.kind === 'PASS') summary.pass++;
      else if (step.verdict.kind === 'FAIL') summary.fail++;
      else summary.unknown++;
    }
  }
  return summary;
}

export const NO_SESSION: SessionFacts = {
  clientViewId: null, interfaceServerId: null, tycoonId: null, company: null, loginAt: null, logoffAt: null,
};

export function buildRunReport(input: {
  startedAt: Date;
  finishedAt: Date;
  target: TargetKind;
  transport: TransportKind;
  world: string;
  suites: SuiteReport[];
  session?: SessionFacts;
}): RunReport {
  return {
    tool: 'rdo-conformance',
    version: 1,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    target: input.target,
    transport: input.transport,
    world: input.world,
    session: input.session ?? NO_SESSION,
    suites: input.suites,
    summary: summarize(input.suites),
  };
}

/**
 * Exit code from the verdicts. FAIL always fails the run; UNKNOWN fails it
 * only under `--strict` (plan §6 Q3 — default lenient until the developer
 * decides otherwise). A run cut short by silence fails regardless: the
 * unanswered frame is itself a FAIL, this just makes the reason explicit.
 */
export function exitCodeFor(report: RunReport, strict: boolean): number {
  if (report.summary.fail > 0) return 1;
  if (strict && report.summary.unknown > 0) return 1;
  if (report.suites.some(s => s.stoppedOnSilence)) return 1;
  return 0;
}

// ── Human log ──────────────────────────────────────────────────────────────

const MARK: Record<VerdictKind, string> = { PASS: 'ok  ', FAIL: 'FAIL', UNKNOWN: '??  ' };

export function formatStepLine(step: StepReport): string {
  const frame = step.frame ? `  ${step.frame}` : `  [${step.id}]`;
  return `${MARK[step.verdict.kind]} ${step.suite}/${step.id}  ${step.outcome.elapsedMs}ms\n` +
    `${frame}\n` +
    `     ${step.verdict.detail}`;
}

/**
 * The attribution of a stop, in the four lines a human acts on.
 *
 * Deliberately NOT `formatHaltNotice` (`halt.ts`): that one says "someone
 * stopped this campaign on purpose" and names the file to clear. This is the
 * opposite situation — the server went quiet on a frame we can name, and no
 * brake has been armed. Same record type, two different readers.
 */
/**
 * Attribution of a stop, in the shape a human would have written by hand.
 *
 * The tag distinguishes the two stop conditions, and the last line with it: on
 * SILENCE the run broke at the first unanswered frame, so that frame IS the
 * suspect; on DEGRADATION the server is still answering and the last frame is
 * only the last symptom. Printing the silence sentence over a degradation stop
 * would point a confident finger at an innocent frame.
 */
export function formatSilenceAttribution(record: HaltRecord): string {
  const degradation = /consecutive error replies/.test(record.reason ?? '');
  const tag = degradation ? '[degraded]' : '[silence]';
  const closing = degradation
    ? `${tag} the server is answering but no longer succeeding: the last frame is the last SYMPTOM, not the cause.`
    : `${tag} runSuite breaks at the first unanswered frame, so that frame IS the suspect.`;
  return [
    `${tag} ${record.reason ?? 'no answer'}`,
    `${tag} at ${record.at} · ${record.where ?? 'unknown step'} · socket ${record.socket ?? '?'}`,
    `${tag} last frame out: ${record.lastFrame ?? '(not recorded)'}`,
    `${tag} member ${record.member ?? '(imperative step)'} · ClientViewId ${record.clientViewId ?? '?'}`,
    closing,
  ].join('\n');
}

export function formatSummary(report: RunReport): string {
  const s = report.summary;
  const skipped = report.suites.reduce((n, suite) => n + suite.skipped.length, 0);
  const stopped = report.suites.filter(suite => suite.stoppedOnSilence || suite.stoppedOnDegradation);
  return [
    `[conformance] ${report.transport}/${report.target} ${report.world}: ` +
      `${s.pass} pass, ${s.fail} fail, ${s.unknown} unknown, ${skipped} skipped`,
    ...(stopped.length ? [`[conformance] STOPPED ON SILENCE in: ${stopped.map(suite => suite.name).join(', ')} — do not replay blindly.`] : []),
    ...stopped.flatMap(suite => (suite.halt ? [formatSilenceAttribution(suite.halt)] : [])),
  ].join('\n');
}

// ── Baseline ───────────────────────────────────────────────────────────────

/**
 * What a baseline pins per step: the bytes that came back. Verdicts are not
 * part of it — a baseline is evidence, an oracle is a claim.
 */
export interface Baseline {
  tool: 'rdo-conformance-baseline';
  version: 1;
  recordedAt: string;
  target: TargetKind;
  world: string;
  steps: Record<string, { response: string | null; errorCode?: number }>;
}

export function recordBaseline(report: RunReport): Baseline {
  const steps: Baseline['steps'] = {};
  for (const suite of report.suites) {
    for (const step of suite.steps) {
      // Observation-only steps (no oracle) and steps declared volatile (counts,
      // HTTP listings) would make every diff noisy. A baseline pins claims' evidence.
      if (step.verdict.kind === 'UNKNOWN' || step.volatile) continue;
      const entry: Baseline['steps'][string] = { response: step.outcome.response };
      if (step.outcome.errorCode !== undefined) entry.errorCode = step.outcome.errorCode;
      steps[`${suite.name}/${step.id}`] = entry;
    }
  }
  return {
    tool: 'rdo-conformance-baseline',
    version: 1,
    recordedAt: report.finishedAt,
    target: report.target,
    world: report.world,
    steps,
  };
}

export interface BaselineDiff {
  /** Steps whose bytes differ from the baseline. */
  changed: Array<{ id: string; baseline: string | null; observed: string | null }>;
  /** In the run, not in the baseline — new steps, or a renamed id. */
  added: string[];
  /** In the baseline, not in the run and not skipped — removed, or cut by silence. */
  missing: string[];
  /** In the baseline, skipped in this run (precondition not met, e.g. HTTP-dependent steps in replay). Not a drift. */
  skipped: string[];
}

/**
 * Byte diff of a run against a baseline. Catches a server-side change nobody
 * wrote an oracle for. Re-acceptance is explicit (`--record-baseline` on a
 * green run), never automatic — a diff that fails often ends up ignored.
 */
export function diffBaseline(report: RunReport, baseline: Baseline): BaselineDiff {
  const observed = recordBaseline(report).steps;
  const skippedIds = new Set(report.suites.flatMap(s => s.skipped.map(k => `${s.name}/${k.id}`)));
  const diff: BaselineDiff = { changed: [], added: [], missing: [], skipped: [] };
  for (const [id, entry] of Object.entries(observed)) {
    const before = baseline.steps[id];
    if (!before) { diff.added.push(id); continue; }
    if (before.response !== entry.response) {
      diff.changed.push({ id, baseline: before.response, observed: entry.response });
    }
  }
  for (const id of Object.keys(baseline.steps)) {
    if (id in observed) continue;
    if (skippedIds.has(id)) diff.skipped.push(id);
    else diff.missing.push(id);
  }
  return diff;
}

export function formatBaselineDiff(diff: BaselineDiff): string {
  const lines: string[] = [];
  for (const c of diff.changed) {
    lines.push(`~ ${c.id}\n    baseline: ${JSON.stringify(c.baseline)}\n    observed: ${JSON.stringify(c.observed)}`);
  }
  for (const id of diff.added) lines.push(`+ ${id} (not in baseline)`);
  for (const id of diff.missing) lines.push(`- ${id} (in baseline, not in this run)`);
  for (const id of diff.skipped) lines.push(`~ ${id} (in baseline, skipped in this run — not a drift)`);
  return lines.length ? lines.join('\n') : 'baseline: no divergence';
}

export function baselineDiverges(diff: BaselineDiff): boolean {
  return diff.changed.length > 0 || diff.missing.length > 0;
}

/** Type guard for a parsed baseline file. */
export function isBaseline(value: unknown): value is Baseline {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.tool === 'rdo-conformance-baseline' && v.version === 1 && typeof v.steps === 'object' && v.steps !== null;
}
