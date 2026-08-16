/**
 * End-to-end offline run: real StarpeaceSession, ReplayTransport over the
 * planitia login capture plus the handful of suite answers a step needs,
 * every side effect captured through RunDeps.
 */

import { StarpeaceSession } from '../../server/spo_session';
import { loginFullCapturedScenario } from '../../mock-server/scenarios/captured/login-full-captured.scenario';
import type { RdoExchange } from '../../mock-server/types/rdo-exchange-types';
import { parseConformanceArgs } from './cli';
import type { ConformanceOptions } from './cli';
import { ReplayTransport } from './replay-transport';
import { runConformance } from './run';
import type { RunDeps } from './run';
import { recordBaseline } from './report';
import type { Baseline } from './report';
import type { Gate } from './run';

jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({ ok: true, status: 200, url: 'http://127.0.0.1/', text: async () => '' }),
}));

const CV = loginFullCapturedScenario.variables.logonId;

const ANSWERS: RdoExchange[] = [
  { id: 'e-user', request: `C 1 sel ${CV} get UserName`, response: 'A1 UserName="$SPO_test3"', matchKeys: { verb: 'sel', action: 'get', member: 'UserName' } },
  { id: 'e-ctl', request: `C 1 sel ${CV} set RdoConfProbe="#1"`, response: 'A1 error 3 setting RdoConfProbe', matchKeys: { verb: 'sel', action: 'set', member: 'RdoConfProbe' } },
  { id: 'e-nomethod', request: `C 1 sel ${CV} call RdoConfNoSuchMethod "^"`, response: 'A1 error 5', matchKeys: { verb: 'sel', action: 'call', member: 'RdoConfNoSuchMethod' } },
  { id: 'e-cookie', request: `C 1 sel ${CV} call GetTycoonCookie "^" "#37","%LastX.0"`, response: 'A1 res="%467"', matchKeys: { verb: 'sel', action: 'call', member: 'GetTycoonCookie' } },
];

const ONLY = [
  'types/string-property-username',
  'types/literal-int-control',
  'errors/call-unknown-method',
  'separators/variant-on-function',
  'separators/variant-on-zero-param-procedure', // skipped: no flag
  'mutations/say-this-void-ack',                // skipped: shared target
];

interface Captured {
  deps: RunDeps;
  files: Map<string, string>;
  lines: string[];
  errors: string[];
  transport: () => ReplayTransport;
  logFetches: Array<{ base: string; loginAt: Date; logoffAt: Date }>;
  slept: number[];
  gate: { value: Gate | null };
}

/** Server logs consistent with the capture: the ClientViewId the recording hands out. */
function fakeDayLogs(clientViewId: string, exitCode = 0) {
  return {
    isSurvival: [
      '12:00:00 PM - LOGON ATTEMPT: User=SPO_test3',
      `12:00:01 PM - LOGON SUCCESS: ClientViewId=${clientViewId}`,
      '12:00:01 PM SPO_test3.IP = 1.2.3.4',
      '12:00:20 PM - Start Disconnecting SPO_test3',
    ].join('\n'),
    isClients: `SPO_test3\t1.2.3.4\t12:00:01 PM\t12:00:20 PM\t${exitCode}`,
    msSurvival: ['11:59:50 AM Check roads', '12:00:05 PM Check roads', '12:00:20 PM Check roads', '12:00:35 PM Check roads'].join('\n'),
  };
}

function makeDeps(answers: RdoExchange[] = ANSWERS, files = new Map<string, string>(), logs = fakeDayLogs(CV), gate: { value: Gate | null } = { value: null }): Captured {
  const lines: string[] = [];
  const errors: string[] = [];
  const logFetches: Captured['logFetches'] = [];
  const slept: number[] = [];
  let transport: ReplayTransport | undefined;
  let tick = 0;
  const deps: RunDeps = {
    createSession: () => new StarpeaceSession(),
    createTransport: () => {
      transport = new ReplayTransport({ '*': { ...loginFullCapturedScenario, exchanges: [...loginFullCapturedScenario.exchanges, ...answers] } });
      return transport;
    },
    readFile: p => {
      const f = files.get(p);
      if (f === undefined) throw new Error(`no such file ${p}`);
      return f;
    },
    writeFile: (p, c) => { files.set(p, c); },
    log: l => lines.push(l),
    error: l => errors.push(l),
    now: () => new Date(Date.UTC(2026, 7, 16, 12, 0, tick++)),
    sleep: async ms => { slept.push(ms); },
    fetchServerLogs: async (base, facts) => { logFetches.push({ base, ...facts }); return logs; },
    loadBuildingTemplates: async () => undefined,
    readGate: () => gate.value,
    writeGate: g => { gate.value = g; },
  };
  return { deps, files, lines, errors, transport: () => transport!, logFetches, slept, gate };
}

const options = (extra: string[] = []): ConformanceOptions =>
  parseConformanceArgs(['--suite', 'types,separators,errors,mutations', '--recording', 'in.ndjson', '--only', ONLY.join(','), ...extra], {});

describe('run — offline conformance run over the login capture', () => {
  it('logs in, runs the selected steps, judges them, logs off, exit 0', async () => {
    const c = makeDeps();
    const { report, exitCode } = await runConformance(options(), c.deps);

    expect(exitCode).toBe(0);
    expect(report.summary).toEqual({ pass: 4, fail: 0, unknown: 0 });
    expect(report.suites.map(s => s.name)).toEqual(['types', 'separators', 'errors', 'mutations']);
    // Session facts are the join keys for the server logs.
    expect(report.session).toMatchObject({ clientViewId: CV, interfaceServerId: '31929384', tycoonId: '37', company: 'SPO_test3 - Green' });
    expect(report.session.loginAt).toBe('2026-08-16T12:00:01.000Z');
    expect(report.session.logoffAt).not.toBeNull();
    // The reference flow: the company was selected (EnableEvents / PickEvent / cookies / ClientAware went out).
    const wire = c.transport().recorder.all().filter(e => e.dir !== 'in').map(e => e.raw);
    expect(wire.some(f => /call PickEvent "\^"/.test(f))).toBe(true);
    expect(wire.some(f => /call ClientAware "\*"/.test(f))).toBe(true);
    expect(report.serverLogs).toBeUndefined();
    expect(c.logFetches).toEqual([]);
    const byId = Object.fromEntries(report.suites.flatMap(s => s.steps.map(st => [`${s.name}/${st.id}`, st])));
    expect(byId['types/string-property-username'].outcome.response).toBe('UserName="$SPO_test3"');
    expect(byId['types/literal-int-control'].outcome).toMatchObject({ response: 'error 3 setting RdoConfProbe', errorCode: 3 });
    expect(byId['errors/call-unknown-method'].outcome).toMatchObject({ response: 'error 5', errorCode: 5 });
    // The login capture itself holds a `GetTycoonCookie … LastX.0` exchange; exact-request
    // matching hands that one out first — the recording, not the test fixture, answers.
    expect(byId['separators/variant-on-function'].outcome.response).toMatch(/^res="%\d+"$/);

    // Risk gate: the "^"-on-procedure step and the mutation were skipped, not run.
    expect(report.suites[1].skipped.map(s => s.id)).toEqual(['variant-on-zero-param-procedure']);
    expect(report.suites[3].skipped.map(s => s.id)).toEqual(['say-this-void-ack']);
    expect(c.lines.some(l => /^skip mutations\/say-this-void-ack/.test(l))).toBe(true);

    // Graceful logoff went out through the same transport: ClientNotAware then get Logoff.
    const out = c.transport().recorder.all().filter(e => e.dir !== 'in').map(e => e.raw);
    expect(out.some(f => f.includes('call ClientNotAware "*"'))).toBe(true);
    expect(out.some(f => /get Logoff/.test(f))).toBe(true);
    // Human log by default: one line per step + summary.
    expect(c.lines.some(l => l.startsWith('ok   types/string-property-username'))).toBe(true);
    expect(c.lines.some(l => l.includes('4 pass, 0 fail, 0 unknown, 2 skipped'))).toBe(true);
    expect(c.errors).toEqual([]);
  }, 20000);

  it('--json prints the report; --record writes the wire; --record-baseline writes the bytes', async () => {
    const c = makeDeps();
    const { report } = await runConformance(options(['--json', '--record', 'out.ndjson', '--record-baseline', 'base.json']), c.deps);

    const printed = JSON.parse(c.lines[c.lines.length - 1]);
    expect(printed.tool).toBe('rdo-conformance');
    expect(printed.summary).toEqual(report.summary);
    expect(c.lines.some(l => l.startsWith('ok   '))).toBe(false); // no per-step human lines in --json

    const ndjson = c.files.get('out.ndjson')!;
    expect(ndjson).toContain('"msg":"RDO>> world"');
    expect(ndjson).not.toContain('"%test3"'); // password redacted in the recording

    const base = JSON.parse(c.files.get('base.json')!) as Baseline;
    expect(base.steps['types/string-property-username']).toEqual({ response: 'UserName="$SPO_test3"' });
    expect(base.steps['types/literal-int-control']).toEqual({ response: 'error 3 setting RdoConfProbe', errorCode: 3 });
  }, 20000);

  it('--diff-baseline: identical run passes, a changed reply fails the exit code', async () => {
    const first = makeDeps();
    const { report } = await runConformance(options(), first.deps);
    const files = new Map<string, string>([['base.json', JSON.stringify(recordBaseline(report))]]);

    const same = makeDeps(ANSWERS, files);
    expect((await runConformance(options(['--diff-baseline', 'base.json']), same.deps)).exitCode).toBe(0);
    expect(same.lines).toContain('baseline: no divergence');

    const drifted = ANSWERS.map(a => a.id === 'e-user' ? { ...a, response: 'A1 UserName="%SPO_test3"' } : a);
    const diff = makeDeps(drifted, files);
    const result = await runConformance(options(['--diff-baseline', 'base.json']), diff.deps);
    // The oracle already fails it (pattern wants `$`); the diff names the change too.
    expect(result.exitCode).toBe(1);
    expect(diff.lines.join('\n')).toMatch(/~ types\/string-property-username[\s\S]*baseline: "UserName=\\"\$SPO_test3\\""[\s\S]*observed: "UserName=\\"%SPO_test3\\""/);
  }, 30000);

  it('a file that is not a baseline is refused', async () => {
    const c = makeDeps(ANSWERS, new Map([['bad.json', '{"tool":"nope"}']]));
    await expect(runConformance(options(['--diff-baseline', 'bad.json']), c.deps)).rejects.toThrow(/not an rdo-conformance baseline/);
  }, 20000);

  it('a step whose emission is refused reads as silence, stops the run, exit 1', async () => {
    const c = makeDeps();
    const { report, exitCode } = await runConformance(options(['--frame-budget', '1']), c.deps);
    expect(exitCode).toBe(1);
    expect(report.suites).toHaveLength(1);
    expect(report.suites[0].stoppedOnSilence).toBe(true);
    expect(report.suites[0].steps[1].outcome.error).toMatch(/Frame budget \(1\) exhausted/);
    expect(c.lines.some(l => l.includes('STOPPED ON SILENCE'))).toBe(true);
  }, 20000);

  it('--no-company stays before selection: no PickEvent, no ClientAware', async () => {
    const c = makeDeps();
    const { report } = await runConformance(options(['--no-company']), c.deps);
    expect(report.session.company).toBeNull();
    const wire = c.transport().recorder.all().filter(e => e.dir !== 'in').map(e => e.raw);
    expect(wire.some(f => /call PickEvent/.test(f))).toBe(false);
  }, 20000);

  it('--server-logs: waits, fetches the day, brackets the session by ClientViewId, attaches the verdict', async () => {
    const c = makeDeps();
    const { report, exitCode } = await runConformance(options(['--server-logs', '--server-logs-settle', '1234']), c.deps);
    expect(c.slept).toEqual([1234]);
    expect(c.logFetches).toHaveLength(1);
    expect(c.logFetches[0].base).toBe('http://158.69.153.134/logs');
    expect(c.logFetches[0].loginAt.toISOString()).toBe(report.session.loginAt);
    const v = report.serverLogs as { bracketFound: boolean; failures: string[]; clientsRow: { exitCode: number } };
    expect(v.bracketFound).toBe(true);
    expect(v.clientsRow.exitCode).toBe(0);
    expect(v.failures).toEqual([]);
    expect(exitCode).toBe(0);
    expect(c.lines.some(l => l.startsWith('[server-logs] bracket: found'))).toBe(true);
  }, 20000);

  it('--server-logs: a pathology in the logs fails the run even when every verdict passed', async () => {
    const c = makeDeps(ANSWERS, new Map(), fakeDayLogs(CV, 3));
    const { report, exitCode } = await runConformance(options(['--server-logs', 'http://logs.example/']), c.deps);
    expect(report.summary.fail).toBe(0);
    expect((report.serverLogs as { failures: string[] }).failures).toEqual([expect.stringMatching(/exit code 3/)]);
    expect(exitCode).toBe(1);
    expect(c.logFetches[0].base).toBe('http://logs.example/');
  }, 20000);

  it('--server-logs: a fetch failure is reported, not fatal', async () => {
    const c = makeDeps();
    c.deps.fetchServerLogs = async () => { throw new Error('ECONNREFUSED'); };
    const { report, exitCode } = await runConformance(options(['--server-logs']), c.deps);
    expect(report.serverLogs).toBeUndefined();
    expect(exitCode).toBe(0);
    expect(c.errors).toEqual([expect.stringMatching(/\[server-logs\] fetch failed: ECONNREFUSED/)]);
  }, 20000);

  it('--report writes the full report to a file', async () => {
    const c = makeDeps();
    await runConformance(options(['--report', 'run.json']), c.deps);
    const written = JSON.parse(c.files.get('run.json')!);
    expect(written.tool).toBe('rdo-conformance');
    expect(written.session.clientViewId).toBe(CV);
  }, 20000);

  it('git gate: a green replay run validates step 1 and says step 2 is the live run', async () => {
    const c = makeDeps();
    const { exitCode } = await runConformance(options(), c.deps);
    expect(exitCode).toBe(0);
    expect(c.gate.value?.replay).toMatchObject({ exitCode: 0, world: 'planitia', target: 'shared' });
    expect(c.gate.value?.live).toBeUndefined();
    expect(c.lines).toContain('[gate] step 1 (replay) validated — step 2 is the live run');
  }, 20000);

  it('git gate: a failed run leaves the gate untouched', async () => {
    const c = makeDeps();
    const { exitCode } = await runConformance(options(['--frame-budget', '1']), c.deps);
    expect(exitCode).toBe(1);
    expect(c.gate.value).toBeNull();
    expect(c.lines.some(l => /\[gate\] run failed \(exit 1\)/.test(l))).toBe(true);
  }, 20000);

  it('git gate: an unwritable gate file is reported, not fatal', async () => {
    const c = makeDeps();
    c.deps.writeGate = () => { throw new Error('EACCES'); };
    const { exitCode } = await runConformance(options(), c.deps);
    expect(exitCode).toBe(0);
    expect(c.lines.some(l => /\[gate\] could not write/.test(l))).toBe(true);
  }, 20000);

  it('an unknown world aborts before any suite frame, and still logs off cleanly', async () => {
    const c = makeDeps();
    await expect(runConformance({ ...options(), world: 'atlantis' }, c.deps)).rejects.toThrow(/"atlantis" not in the directory listing/);
    expect(c.transport().recorder.all().some(e => /RdoConfProbe|get UserName/.test(e.raw))).toBe(false);
  }, 20000);
});
