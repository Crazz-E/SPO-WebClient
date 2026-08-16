import {
  baselineDiverges, buildRunReport, diffBaseline, exitCodeFor, formatBaselineDiff, formatStepLine, formatSummary,
  isBaseline, recordBaseline, summarize,
} from './report';
import type { Baseline } from './report';
import type { RunReport, StepReport, SuiteReport } from './types';

const step = (suite: string, id: string, kind: 'PASS' | 'FAIL' | 'UNKNOWN', response: string | null = 'x', errorCode?: number): StepReport => ({
  suite, id, intent: 'i', frame: `C sel 1 get ${id}`,
  outcome: { response, elapsedMs: 5, ...(errorCode ? { errorCode } : {}), ...(response === null ? { error: 'timeout' } : {}) },
  verdict: { kind, detail: `${kind} detail` },
});

const suiteReport = (name: string, steps: StepReport[], extra: Partial<SuiteReport> = {}): SuiteReport =>
  ({ name, steps, skipped: [], stoppedOnSilence: false, ...extra });

const run = (suites: SuiteReport[]): RunReport => buildRunReport({
  startedAt: new Date('2026-08-16T12:00:00Z'), finishedAt: new Date('2026-08-16T12:00:05Z'),
  target: 'shared', transport: 'replay', world: 'planitia', suites,
});

describe('report — summary and exit code', () => {
  it('counts verdicts across suites', () => {
    const r = run([suiteReport('a', [step('a', '1', 'PASS'), step('a', '2', 'FAIL')]), suiteReport('b', [step('b', '3', 'UNKNOWN')])]);
    expect(summarize(r.suites)).toEqual({ pass: 1, fail: 1, unknown: 1 });
    expect(r.tool).toBe('rdo-conformance');
    expect(r.startedAt).toBe('2026-08-16T12:00:00.000Z');
  });

  it('FAIL always fails; UNKNOWN only under --strict; silence always fails', () => {
    expect(exitCodeFor(run([suiteReport('a', [step('a', '1', 'PASS')])]), false)).toBe(0);
    expect(exitCodeFor(run([suiteReport('a', [step('a', '1', 'FAIL')])]), false)).toBe(1);
    expect(exitCodeFor(run([suiteReport('a', [step('a', '1', 'UNKNOWN')])]), false)).toBe(0);
    expect(exitCodeFor(run([suiteReport('a', [step('a', '1', 'UNKNOWN')])]), true)).toBe(1);
    expect(exitCodeFor(run([suiteReport('a', [step('a', '1', 'PASS')], { stoppedOnSilence: true })]), false)).toBe(1);
  });
});

describe('report — human log', () => {
  it('one block per step: mark, id, timing, frame, verdict detail', () => {
    expect(formatStepLine(step('types', 'u', 'PASS'))).toBe('ok   types/u  5ms\n  C sel 1 get u\n     PASS detail');
    const imperative = { ...step('m', 'i', 'FAIL'), frame: undefined };
    expect(formatStepLine(imperative)).toContain('  [i]');
  });

  it('summary line names counts, skips, and silence', () => {
    const r = run([suiteReport('a', [step('a', '1', 'PASS')], { skipped: [{ id: 'z', reason: 'r' }], stoppedOnSilence: true })]);
    const text = formatSummary(r);
    expect(text).toContain('replay/shared planitia: 1 pass, 0 fail, 0 unknown, 1 skipped');
    expect(text).toContain('STOPPED ON SILENCE in: a');
    expect(formatSummary(run([]))).not.toContain('SILENCE');
  });
});

describe('report — baseline', () => {
  const green = run([suiteReport('types', [step('types', 'a', 'PASS', 'A="$x"'), step('types', 'b', 'PASS', 'error 3 setting X', 3)])]);

  it('leaves observation-only (UNKNOWN) and volatile steps out of the baseline', () => {
    const withObs = run([suiteReport('map', [
      step('map', 'a', 'PASS', 'x'), step('map', 'pushes', 'UNKNOWN', 'RefreshTycoon'),
      { ...step('map', 'inbox', 'PASS', '2 message(s)'), volatile: true },
    ])]);
    expect(Object.keys(recordBaseline(withObs).steps)).toEqual(['map/a']);
  });

  it('records bytes and error codes, keyed suite/step, without verdicts', () => {
    const b = recordBaseline(green);
    expect(b.tool).toBe('rdo-conformance-baseline');
    expect(b.steps).toEqual({ 'types/a': { response: 'A="$x"' }, 'types/b': { response: 'error 3 setting X', errorCode: 3 } });
    expect(JSON.stringify(b)).not.toContain('PASS');
    expect(isBaseline(b)).toBe(true);
    expect(isBaseline({ tool: 'x' })).toBe(false);
    expect(isBaseline(null)).toBe(false);
  });

  it('diff: changed / added / missing, and only changed+missing count as divergence', () => {
    const base: Baseline = recordBaseline(green);
    const later = run([suiteReport('types', [step('types', 'a', 'PASS', 'A="%x"'), step('types', 'c', 'PASS', 'new')])]);
    const d = diffBaseline(later, base);
    expect(d.changed).toEqual([{ id: 'types/a', baseline: 'A="$x"', observed: 'A="%x"' }]);
    expect(d.added).toEqual(['types/c']);
    expect(d.missing).toEqual(['types/b']);
    expect(baselineDiverges(d)).toBe(true);
    expect(baselineDiverges({ changed: [], added: ['x'], missing: [], skipped: [] })).toBe(false);
    expect(baselineDiverges(diffBaseline(green, base))).toBe(false);
  });

  it('a step skipped in this run is not a drift, and is listed as such', () => {
    const base = recordBaseline(green);
    const withSkip = run([suiteReport('types', [step('types', 'a', 'PASS', 'A="$x"')], { skipped: [{ id: 'b', reason: 'inbox empty' }] })]);
    const d = diffBaseline(withSkip, base);
    expect(d.missing).toEqual([]);
    expect(d.skipped).toEqual(['types/b']);
    expect(baselineDiverges(d)).toBe(false);
    expect(formatBaselineDiff(d)).toContain('~ types/b (in baseline, skipped in this run — not a drift)');
  });

  it('a silent step diffs against a recorded answer', () => {
    const base = recordBaseline(green);
    const silent = run([suiteReport('types', [step('types', 'a', 'FAIL', null), step('types', 'b', 'PASS', 'error 3 setting X', 3)])]);
    expect(diffBaseline(silent, base).changed[0]).toEqual({ id: 'types/a', baseline: 'A="$x"', observed: null });
  });

  it('formatBaselineDiff is readable and says when there is nothing', () => {
    expect(formatBaselineDiff({ changed: [], added: [], missing: [], skipped: [] })).toBe('baseline: no divergence');
    const text = formatBaselineDiff({ changed: [{ id: 'a', baseline: 'x', observed: 'y' }], added: ['n'], missing: ['m'], skipped: [] });
    expect(text).toContain('~ a');
    expect(text).toContain('baseline: "x"');
    expect(text).toContain('+ n (not in baseline)');
    expect(text).toContain('- m (in baseline, not in this run)');
  });
});
