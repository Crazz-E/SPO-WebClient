/**
 * The refusals are the product. Several assertions target the WORDING: the
 * refusal text is where the observed fact (SayThis froze the server on
 * 2026-08-15; ClientAware answered error 9 on 2026-08-16) is kept from being
 * blurred into "probably fine".
 */

import { CliRefusal, FREE_SPACE_ZONE_PATH, NOT_REPLAYABLE, USAGE, parseConformanceArgs } from './cli';
import { DEFAULT_FRAME_BUDGET } from './runner';

const REPLAY = ['--suite', 'types', '--recording', 'rec.ndjson'];

describe('cli — refusals', () => {
  it('needs --suite', () => {
    expect(() => parseConformanceArgs(['--recording', 'r'], {})).toThrow(/Missing --suite/);
    expect(() => parseConformanceArgs(['--recording', 'r'], {})).toThrow(CliRefusal);
  });

  it('refuses an unknown suite and an unknown step id', () => {
    expect(() => parseConformanceArgs(['--suite', 'u6', '--recording', 'r'], {})).toThrow(/Unknown suite "u6"/);
    expect(() => parseConformanceArgs([...REPLAY, '--only', 'types/nope'], {})).toThrow(/Unknown step "types\/nope"/);
  });

  it('replay is the default transport and needs a recording', () => {
    expect(() => parseConformanceArgs(['--suite', 'types'], {})).toThrow(/--recording/);
    const o = parseConformanceArgs(REPLAY, {});
    expect(o.transport).toBe('replay');
    expect(o.recording).toBe('rec.ndjson');
  });

  it('live needs --live as a second explicit yes, and says why', () => {
    expect(() => parseConformanceArgs(['--suite', 'types', '--transport', 'live'], {})).toThrow(/2026-08-15.*froze/);
    const o = parseConformanceArgs(['--suite', 'types', '--transport', 'live', '--live'], {});
    expect(o.transport).toBe('live');
    expect(o.live).toBe(true);
    expect(o.recording).toBeUndefined();
  });

  it('rejects unknown transport / target values', () => {
    expect(() => parseConformanceArgs([...REPLAY, '--transport', 'tcp'], {})).toThrow(/--transport must be/);
    expect(() => parseConformanceArgs([...REPLAY, '--target', 'prod'], {})).toThrow(/--target must be/);
  });

  it('shared is the default target', () => {
    expect(parseConformanceArgs(REPLAY, {}).target).toBe('shared');
    expect(parseConformanceArgs([...REPLAY, '--target', 'dedicated'], {}).target).toBe('dedicated');
  });

  // A mutation step makes the server execute the method body on the live
  // account. A run says so with this flag instead of relabelling the step
  // `risk: 'read'`, which would falsify the suite's own bookkeeping.
  it('--allow-mutations is off by default and needs no --target dedicated', () => {
    expect(parseConformanceArgs(REPLAY, {}).allowMutations).toBe(false);
    const o = parseConformanceArgs([...REPLAY, '--allow-mutations'], {});
    expect(o.allowMutations).toBe(true);
    expect(o.target).toBe('shared');
  });

  it('--target dedicated does not silently imply --allow-mutations', () => {
    // Two different statements: "this server is expendable" and "this run
    // changes state on purpose". The runner accepts either, the CLI conflates neither.
    expect(parseConformanceArgs([...REPLAY, '--target', 'dedicated'], {}).allowMutations).toBe(false);
  });

  // The REFUSAL has outlived two of its own motives. It is not about the freeze
  // (`"^"` below 2 emitted arguments cannot freeze — RDOObjectServer.pas:214-218)
  // and it is no longer about the certification sweep (removed in R1). It is
  // about EXECUTION: the server runs the method body on the live account, and
  // `all` is the unattended gate mode where no decision can be recorded.
  it('never combines --allow-variant-on-procedure with --suite all', () => {
    expect(() => parseConformanceArgs(['--suite', 'all', '--recording', 'r', '--allow-variant-on-procedure'], {}))
      .toThrow(/never combined with --suite all/);
    const o = parseConformanceArgs(['--suite', 'separators', '--recording', 'r', '--allow-variant-on-procedure'], {});
    expect(o.allowVariantOnProcedure).toBe(true);
  });

  it('the refusal message names the suites to run instead, and no longer claims the step is settled', () => {
    let message = '';
    try {
      parseConformanceArgs(['--suite', 'all', '--recording', 'r', '--allow-variant-on-procedure'], {});
    } catch (err: unknown) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('separators');
    expect(message).toMatch(/EXECUTES the method body/);
    expect(message).not.toMatch(/settled/);
    expect(message).not.toMatch(/2026-08-16/);
  });

  // `all` is the gate's replay step: it must expand only to suites a recording
  // covers, because the replay transport leaves an unrecorded frame unanswered
  // and the runner reads that as a stop. `NOT_REPLAYABLE` is where an exception
  // goes; it is empty since the certification sweep was removed (R1).
  it('--suite all expands to every suite, NOT_REPLAYABLE being empty', () => {
    const o = parseConformanceArgs(['--suite', 'all', '--recording', 'r'], {});
    expect(o.suites).toEqual([
      'connexion',
      'types', 'separators', 'errors', 'lifecycle', 'reads',
      'map', 'focus', 'inspector', 'chat', 'mail', 'politics', 'research',
      'mutations',
    ]);
  });

  // The rule `all` enforces survives its only client. A suite listed here is
  // dropped from `all` and stays selectable by name — that is the whole
  // contract, and it is tested against a synthetic entry so the empty set
  // cannot make the filter vacuously "work".
  it('NOT_REPLAYABLE is empty, and the filter it feeds still drops what it holds', () => {
    expect([...NOT_REPLAYABLE]).toEqual([]);
    const known = ['types', 'separators', 'mutations'];
    const withEntry: ReadonlySet<string> = new Set(['mutations']);
    expect(known.filter(n => !withEntry.has(n))).toEqual(['types', 'separators']);
    expect(known.filter(n => !NOT_REPLAYABLE.has(n))).toEqual(known);
  });

  it('a suite is selectable by name and by step id', () => {
    expect(parseConformanceArgs(['--suite', 'separators', '--recording', 'r'], {}).suites).toEqual(['separators']);
    expect(parseConformanceArgs(['--suite', 'types,separators', '--recording', 'r'], {}).suites)
      .toEqual(['types', 'separators']);
    expect([...parseConformanceArgs(['--suite', 'separators', '--recording', 'r', '--only', 'separators/set-acks-empty'], {}).only])
      .toEqual(['separators/set-acks-empty']);
  });

  it('frame budget must be a positive integer', () => {
    expect(() => parseConformanceArgs([...REPLAY, '--frame-budget', '0'], {})).toThrow(/positive integer/);
    expect(() => parseConformanceArgs([...REPLAY, '--frame-budget', 'x'], {})).toThrow(/positive integer/);
    expect(parseConformanceArgs([...REPLAY, '--frame-budget', '12'], {}).frameBudget).toBe(12);
    expect(parseConformanceArgs(REPLAY, {}).frameBudget).toBe(DEFAULT_FRAME_BUDGET);
  });
});

describe('cli — options', () => {
  it('defaults to the locked E2E account and Free Space / planitia', () => {
    const o = parseConformanceArgs(REPLAY, {});
    expect(o.username).toBe('SPO_test3');
    expect(o.password).toBe('test3');
    expect(o.world).toBe('planitia');
    // "Free Space" is a UI LABEL; the directory path is America (WORLD_ZONES).
    expect(o.zonePath).toBe(FREE_SPACE_ZONE_PATH);
    expect(o.zonePath).toBe('Root/Areas/America/Worlds');
  });

  it('env overrides credentials; argv overrides env', () => {
    expect(parseConformanceArgs(REPLAY, { SPO_PROBE_USER: 'u', SPO_PROBE_PASS: 'p' })).toMatchObject({ username: 'u', password: 'p' });
    expect(parseConformanceArgs([...REPLAY, '--user', 'a', '--pass', 'b'], { SPO_PROBE_USER: 'u' })).toMatchObject({ username: 'a', password: 'b' });
  });

  it('collects the output flags', () => {
    const o = parseConformanceArgs([
      ...REPLAY, '--json', '--strict', '--record', 'out.ndjson', '--record-baseline', 'b.json', '--diff-baseline', 'c.json',
      '--only', 'types/literal-int-control,errors/call-unknown-method', '--world', 'shamba', '--zone', 'Root/X',
    ], {});
    expect(o).toMatchObject({
      json: true, strict: true, recordTo: 'out.ndjson', recordBaseline: 'b.json', diffBaseline: 'c.json',
      world: 'shamba', zonePath: 'Root/X',
    });
    expect([...o.only]).toEqual(['types/literal-int-control', 'errors/call-unknown-method']);
  });

  it('selects the locked company by default; --no-company opts out; both is a refusal', () => {
    expect(parseConformanceArgs(REPLAY, {}).company).toBe('SPO_test3 - Green');
    expect(parseConformanceArgs([...REPLAY, '--company', 'Other Co'], {}).company).toBe('Other Co');
    expect(parseConformanceArgs([...REPLAY, '--no-company'], {}).company).toBeNull();
    expect(() => parseConformanceArgs([...REPLAY, '--no-company', '--company', 'x'], {})).toThrow(/exclusive/);
  });

  it('--server-logs takes an optional base url and a settle delay', () => {
    expect(parseConformanceArgs(REPLAY, {}).serverLogs).toBeUndefined();
    expect(parseConformanceArgs([...REPLAY, '--server-logs'], {})).toMatchObject({ serverLogs: 'http://158.69.153.134/logs', serverLogsSettleMs: 5000 });
    expect(parseConformanceArgs([...REPLAY, '--server-logs', '--json'], {}).serverLogs).toBe('http://158.69.153.134/logs');
    expect(parseConformanceArgs([...REPLAY, '--server-logs', 'http://x/logs', '--server-logs-settle', '0'], {}))
      .toMatchObject({ serverLogs: 'http://x/logs', serverLogsSettleMs: 0 });
    expect(() => parseConformanceArgs([...REPLAY, '--server-logs-settle', '-1'], {})).toThrow(/non-negative/);
    expect(parseConformanceArgs([...REPLAY, '--report', 'r.json'], {}).reportTo).toBe('r.json');
  });

  it('USAGE lists every suite', () => {
    for (const s of ['types', 'separators', 'errors', 'lifecycle', 'reads', 'map', 'focus', 'inspector', 'chat', 'mail', 'politics', 'research', 'mutations']) expect(USAGE).toContain(s);
  });

  it('USAGE documents the mutation flag — an undocumented escape hatch is a trap', () => {
    expect(USAGE).toContain('--allow-mutations');
  });
});
