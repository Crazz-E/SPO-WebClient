/**
 * The refusals are the product. Several assertions target the WORDING: the
 * refusal text is where the observed fact (SayThis froze the server on
 * 2026-08-15; ClientAware answered error 9 on 2026-08-16) is kept from being
 * blurred into "probably fine".
 */

import { CliRefusal, FREE_SPACE_ZONE_PATH, USAGE, parseConformanceArgs } from './cli';
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

  it('never combines --allow-variant-on-procedure with --suite all', () => {
    expect(() => parseConformanceArgs(['--suite', 'all', '--recording', 'r', '--allow-variant-on-procedure'], {}))
      .toThrow(/never combined with --suite all.*error 9.*2026-08-16/s);
    const o = parseConformanceArgs(['--suite', 'separators', '--recording', 'r', '--allow-variant-on-procedure'], {});
    expect(o.allowVariantOnProcedure).toBe(true);
  });

  it('--suite all expands to every suite (the runner, not the CLI, filters mutations by target)', () => {
    const o = parseConformanceArgs(['--suite', 'all', '--recording', 'r'], {});
    expect(o.suites).toEqual([
      'types', 'separators', 'errors', 'lifecycle', 'reads',
      'map', 'focus', 'inspector', 'chat', 'mail', 'politics', 'research',
      'mutations',
    ]);
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
});
