/**
 * End-to-end offline run: real StarpeaceSession, ReplayTransport over the
 * planitia login capture plus the handful of suite answers a step needs,
 * every side effect captured through RunDeps.
 */

import { SessionPhase } from '../../shared/types';
import { StarpeaceSession } from '../../server/spo_session';
import { loginFullCapturedScenario } from '../../mock-server/scenarios/captured/login-full-captured.scenario';
import type { RdoExchange } from '../../mock-server/types/rdo-exchange-types';
import { parseConformanceArgs } from './cli';
import type { ConformanceOptions } from './cli';
import { ReplayTransport } from './replay-transport';
import { preflight, runConformance, PREFLIGHT_SOCKET } from './run';
import type { RunDeps } from './run';
import { recordBaseline } from './report';
import type { Baseline } from './report';
import type { Gate } from './run';
import { HALT_PATH } from './halt';
import type { HaltRecord, HaltStore } from './halt';

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

/**
 * An in-memory store already holding a HALT — as if a human had stopped the
 * campaign. The transport stays the replay one: the point is that the run
 * refuses BEFORE it opens anything.
 */
function haltedStore(): HaltStore {
  const record: HaltRecord = {
    at: '2026-08-14T21:29:22.000Z',
    reason: 'developer stopped the campaign',
    lastFrame: 'C sel 6944144 call SayThis "^" "%dest","%msg";',
    member: 'SayThis', socket: 'world', clientViewId: '7272232', wave: 'w1', where: 'chat/say',
  };
  const files = new Map([[HALT_PATH, JSON.stringify(record)]]);
  return {
    exists: p => files.has(p),
    read: p => files.get(p) ?? '',
  };
}

describe('run — offline conformance run over the login capture', () => {
  it('logs in, runs the selected steps, judges them, logs off, exit 0', async () => {
    const c = makeDeps();
    const { report, exitCode } = await runConformance(options(), c.deps);

    expect(exitCode).toBe(0);
    expect(report.summary).toEqual({ pass: 4, fail: 0, unknown: 0 });
    expect(report.suites.map(s => s.name)).toEqual(['types', 'separators', 'errors', 'mutations']);
    // Session facts are the join keys for the server logs.
    expect(report.session).toMatchObject({ clientViewId: CV, interfaceServerId: '31929384', tycoonId: '37' });
    expect(report.session.loginAt).toBe('2026-08-16T12:00:01.000Z');
    expect(report.session.logoffAt).not.toBeNull();

    // ── This assertion was INVERTED on 2026-08-18, and the inversion is the point.
    //
    // It used to read `company: 'SPO_test3 - Green'` and to assert that
    // PickEvent / ClientAware had gone out — in a run where the company list is
    // empty (replay points world.ip at loopback, so the HTTP fetch always
    // fails). What actually happened was the false green of plan rev. 4 §4.2:
    // `selectCompany` received the NAME where it expects an ID, `currentCompany`
    // stayed null, and the report claimed a company was selected. The test was
    // encoding the bug.
    //
    // Now the absence is DECLARED. `company` is null, no selection frame goes
    // out, and the `connexion` suite skips its two company steps with the
    // reason. Nothing pretends.
    expect(report.session.company).toBeNull();
    const wire = c.transport().recorder.all().filter(e => e.dir !== 'in').map(e => e.raw);
    expect(wire.some(f => /call PickEvent "\^"/.test(f))).toBe(false);
    expect(c.lines.some(l => /no company selected — replay forces world\.ip to loopback/.test(l))).toBe(true);
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

  // Edition 7 — the stop attributes itself, immediately and in the report.
  // `runSuite` breaks at the first unanswered frame, so the suspect needs no
  // ISCnx window and no isolated wave to be named.
  it('a stop is attributed on stderr as it happens, and carried in the report', async () => {
    const c = makeDeps();
    const { report } = await runConformance(options(['--frame-budget', '1']), c.deps);
    const halt = report.suites[0].halt!;
    expect(halt).toMatchObject({ where: 'types/literal-int-control', member: 'RdoConfProbe', socket: 'world', clientViewId: CV });
    expect(halt.reason).toMatch(/Frame budget \(1\) exhausted/);
    expect(c.errors.join('\n')).toContain('[silence] ');
    expect(c.errors.join('\n')).toContain('types/literal-int-control');
  }, 20000);

  /**
   * The other half of §3.4: LIVE, an empty company list is a refusal.
   *
   * Replay declares the absence because it manufactures it — `world.ip` is
   * forced to loopback so the HTTP fetch cannot succeed. Live has no such
   * excuse: an empty list there means the login did not produce one, and
   * continuing would put `selectCompany` back in the situation that produced
   * the false green. The transport kind is what separates the two branches,
   * so the test forges a transport that claims to be live over the same
   * recording.
   */
  it('a live run refuses an empty company list instead of selecting a name as an id', async () => {
    const c = makeDeps();
    const deps: RunDeps = {
      ...c.deps,
      createTransport: options => {
        const t = c.deps.createTransport(options);
        return new Proxy(t, { get: (target, prop) => (prop === 'kind' ? 'live' : Reflect.get(target, prop) as unknown) }) as typeof t;
      },
    };

    await expect(runConformance(options(), deps)).rejects.toThrow(/company list is empty/);
    // …and the refusal names the mechanism, so nobody "fixes" it by widening the guard.
    await expect(runConformance(options(), deps)).rejects.toThrow(/a name where it expects an id/);
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

  // Campaign protocol rule R3 — HALT is read before any live action, without
  // exception. The refusal happens before the transport is created, so a halted
  // campaign puts nothing on the wire at all.
  it('refuses a live run outright when .rdo-live/HALT exists', async () => {
    const c = makeDeps();
    c.deps.haltStore = haltedStore();
    await expect(runConformance(options(['--transport', 'live', '--live']), c.deps))
      .rejects.toThrow(/Campaign halted: \.rdo-live\/HALT is present/);
    expect(c.errors.some(l => l.includes('[HALT] campaign stopped'))).toBe(true);
    expect(c.errors.some(l => l.includes('manual brake'))).toBe(true);
  }, 20000);

  // A replay run reaches no server, so a HALT has nothing to protect it from —
  // and gating it would make a stopped campaign impossible to re-validate offline.
  it('lets a replay run proceed even with HALT present', async () => {
    const c = makeDeps();
    c.deps.haltStore = haltedStore();
    const { exitCode } = await runConformance(options(), c.deps);
    expect(exitCode).toBe(0);
    expect(c.errors.some(l => l.includes('[HALT]'))).toBe(false);
  }, 20000);

  // The automatic trigger was withdrawn on 2026-08-18 (plan §6.0): nothing in a
  // run writes HALT any more, so no run can stop itself on a delay. Edition 7
  // did NOT reopen this — it produces the `HaltRecord` as attribution inside the
  // report and prints it, and arms no brake. The brake stays a human's decision.
  it('never writes HALT itself, whatever the run does', async () => {
    const c = makeDeps();
    const { exitCode } = await runConformance(options(), c.deps);
    expect(exitCode).toBe(0);
    expect([...c.files.keys()].some(p => p.includes('HALT'))).toBe(false);
    // And no log fetch is forced: capture happens only under --server-logs.
    expect(c.logFetches).toHaveLength(0);
  }, 20000);

  it('a run that stops on silence still writes no HALT — the brake stays manual', async () => {
    const c = makeDeps();
    const { report } = await runConformance(options(['--frame-budget', '1']), c.deps);
    expect(report.suites[0].halt).toBeDefined();
    expect([...c.files.keys()].some(p => p.includes('HALT'))).toBe(false);
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

  /**
   * The baseline comparison is what makes step 1 worth anything, so the gate
   * only counts a replay that performed one. Before 2026-08-18 this test ran
   * WITHOUT `--diff-baseline` and still expected a validated gate — it pinned
   * exactly the hole that let a green-but-uncompared replay through.
   */
  it('git gate: a green replay run WITH a baseline diff validates step 1', async () => {
    const seed = makeDeps();
    const { report } = await runConformance(options(), seed.deps);
    const files = new Map<string, string>([['base.json', JSON.stringify(recordBaseline(report))]]);

    const c = makeDeps(ANSWERS, files);
    const { exitCode } = await runConformance(options(['--diff-baseline', 'base.json']), c.deps);
    expect(exitCode).toBe(0);
    expect(c.gate.value?.replay).toMatchObject({ exitCode: 0, world: 'planitia', target: 'shared', baselineDiffed: true });
    expect(c.gate.value?.live).toBeUndefined();
    expect(c.lines).toContain('[gate] step 1 (replay) validated — step 2 is the live run');
  }, 30000);

  it('git gate: a green replay WITHOUT a baseline diff does NOT validate step 1', async () => {
    const c = makeDeps();
    const { exitCode } = await runConformance(options(), c.deps);
    expect(exitCode).toBe(0);                      // the run itself is fine
    expect(c.gate.value).toBeNull();               // …and it certifies nothing
    expect(c.lines.some(l => /WITHOUT --diff-baseline/.test(l))).toBe(true);
    expect(c.lines.some(l => /--record-baseline first, if the drift is intended/.test(l))).toBe(true);
  }, 20000);

  it('git gate: an uncompared replay never overwrites a previously validated entry', async () => {
    const seed = makeDeps();
    const { report } = await runConformance(options(), seed.deps);
    const files = new Map<string, string>([['base.json', JSON.stringify(recordBaseline(report))]]);

    // Earn a real entry, then run again without a baseline: the good one stands.
    const gate: { value: Gate | null } = { value: null };
    await runConformance(options(['--diff-baseline', 'base.json']), makeDeps(ANSWERS, files, fakeDayLogs(CV), gate).deps);
    const earned = gate.value?.replay?.finishedAt;
    expect(earned).toBeTruthy();

    await runConformance(options(), makeDeps(ANSWERS, files, fakeDayLogs(CV), gate).deps);
    expect(gate.value?.replay?.finishedAt).toBe(earned);
    expect(gate.value?.replay?.baselineDiffed).toBe(true);
  }, 40000);

  it('git gate: a failed run leaves the gate untouched', async () => {
    const c = makeDeps();
    const { exitCode } = await runConformance(options(['--frame-budget', '1']), c.deps);
    expect(exitCode).toBe(1);
    expect(c.gate.value).toBeNull();
    expect(c.lines.some(l => /\[gate\] run failed \(exit 1\)/.test(l))).toBe(true);
  }, 20000);

  it('git gate: an unwritable gate file is reported, not fatal', async () => {
    const seed = makeDeps();
    const { report } = await runConformance(options(), seed.deps);
    const files = new Map<string, string>([['base.json', JSON.stringify(recordBaseline(report))]]);

    // Needs the baseline diff to reach the write at all, since 2026-08-18.
    const c = makeDeps(ANSWERS, files);
    c.deps.writeGate = () => { throw new Error('EACCES'); };
    const { exitCode } = await runConformance(options(['--diff-baseline', 'base.json']), c.deps);
    expect(exitCode).toBe(0);
    expect(c.lines.some(l => /\[gate\] could not write/.test(l))).toBe(true);
  }, 30000);

  it('an unknown world aborts before any suite frame, and still logs off cleanly', async () => {
    const c = makeDeps();
    await expect(runConformance({ ...options(), world: 'atlantis' }, c.deps)).rejects.toThrow(/"atlantis" not in the directory listing/);
    expect(c.transport().recorder.all().some(e => /RdoConfProbe|get UserName/.test(e.raw))).toBe(false);
  }, 20000);
});

// ═══════════════════════════════════════════════════════════════════════════
// R2 §3.6 — the recording is written in the `finally`
//
// It used to be written at the very end, after the server-log correlation and
// the baseline diff. Two paths destroyed it: an exception in the connection
// block (which has no catch), and a baseline that is missing or malformed
// (`JSON.parse` then `throw`). Both are exactly the runs whose recording
// matters most — a failed login used to destroy the evidence of the incident
// that caused it.
// ═══════════════════════════════════════════════════════════════════════════
describe('run — the recording survives the failure it documents', () => {
  it('writes --record even when the run throws in the connection block', async () => {
    const c = makeDeps();
    await expect(runConformance(
      options(['--world', 'nowhere', '--record', 'evidence.ndjson']), c.deps,
    )).rejects.toThrow(/not in the directory listing/);

    const written = c.files.get('evidence.ndjson');
    expect(written).toBeDefined();
    // Not an empty file: the directory exchange that preceded the refusal is in it.
    expect(written!.length).toBeGreaterThan(0);
    expect(c.lines.some(l => /recording written: evidence\.ndjson/.test(l))).toBe(true);
  }, 20000);

  it('writes --record even when the baseline is malformed and the run throws afterwards', async () => {
    const c = makeDeps();
    c.files.set('bad.json', '{ not json');
    await expect(runConformance(
      options(['--record', 'evidence.ndjson', '--diff-baseline', 'bad.json']), c.deps,
    )).rejects.toThrow();
    expect(c.files.get('evidence.ndjson')).toBeDefined();
  }, 20000);

  it('a failure to write the recording is reported, never rethrown over the real error', async () => {
    const c = makeDeps();
    const deps: RunDeps = {
      ...c.deps,
      writeFile: (p, content) => {
        if (p === 'evidence.ndjson') throw new Error('disk full');
        c.deps.writeFile(p, content);
      },
    };
    // The world refusal is what must surface — not "disk full" from the finally.
    await expect(runConformance(
      options(['--world', 'nowhere', '--record', 'evidence.ndjson']), deps,
    )).rejects.toThrow(/not in the directory listing/);
    expect(c.errors.some(l => /recording NOT written to evidence\.ndjson: disk full/.test(l))).toBe(true);
  }, 20000);
});

// ═══════════════════════════════════════════════════════════════════════════
// R2 §3.3 — the operational sequence is EXIGIBLE
// ═══════════════════════════════════════════════════════════════════════════
describe('run — the connection floor is a precondition, not a verdict', () => {
  it('reports the sequence it completed, with the phase it reached', async () => {
    const c = makeDeps();
    await runConformance(options(), c.deps);
    expect(c.lines.some(l => /sequence complete — phase WORLD_CONNECTING, company \(none, declared\)/.test(l))).toBe(true);
  }, 20000);

  /**
   * The phase and the company are ONE assertion, found in R3.
   * `SessionPhase.WORLD_CONNECTED` is set on the LAST line of `selectCompany`
   * (`login-handler.ts:616`), so a run that selects no company stays in
   * `WORLD_CONNECTING` legitimately and for ever. Demanding WORLD_CONNECTED
   * unconditionally would refuse every `--no-company` run and every replay run
   * — including the one the git gate replays at each commit.
   */
  it('does not demand WORLD_CONNECTED from a run that selects no company', async () => {
    const c = makeDeps();
    const { exitCode } = await runConformance(options(['--no-company']), c.deps);
    expect(exitCode).toBe(0);
    expect(c.lines.some(l => /sequence complete — phase WORLD_CONNECTING/.test(l))).toBe(true);
  }, 20000);
});

// ═══════════════════════════════════════════════════════════════════════════
// R2 §3.2 — the pre-flight probe
//
// Two freezes in four days were not our doing. Without this probe a run that
// meets an already-sick server records the incident against its own first
// frame: we attribute a third party's crash to ourselves, or keep emitting
// into something that is already dying.
//
// The frame is `idof DirectoryServer` and only that. `idof` is intercepted by
// the query parser BEFORE any object dispatch, so it touches no state and runs
// no method body — and it is the exact oracle for what it looks for, since on
// 2026-08-18 the broken server answered `error 1` to every query, `idof`
// included. The "trivial get" of the plan has no target: `TDirectoryServer`
// publishes exactly one member, `function RDOOpenSession : olevariant`
// (Directory Server/DirectoryServer.pas:110), and reading it CREATES a session.
// ═══════════════════════════════════════════════════════════════════════════
describe('preflight — refusing to start against a server that is not answering', () => {
  interface FakeSession {
    createSocket: jest.Mock;
    sendRdoRequest: jest.Mock;
    destroySocket: jest.Mock;
  }

  function fake(sendRdoRequest: jest.Mock): FakeSession {
    return { createSocket: jest.fn().mockResolvedValue({}), sendRdoRequest, destroySocket: jest.fn() };
  }

  const deps = (lines: string[]): RunDeps => ({ log: (l: string) => lines.push(l) } as unknown as RunDeps);

  it('emits exactly one frame, `idof DirectoryServer`, and nothing else', async () => {
    const send = jest.fn().mockResolvedValue({ payload: 'objid="29570088"' });
    const session = fake(send);
    const lines: string[] = [];

    await preflight(session as unknown as StarpeaceSession, deps(lines));

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toEqual({ verb: 'idof', targetId: 'DirectoryServer' });
    expect(session.createSocket.mock.calls[0][0]).toBe(PREFLIGHT_SOCKET);
    expect(lines.some(l => /\[preflight\] ok — objid="29570088"/.test(l))).toBe(true);
  });

  it('refuses when the directory answers an error — the 2026-08-18 signature', async () => {
    const send = jest.fn().mockResolvedValue({ payload: 'error 1', errorCode: 1 });
    await expect(preflight(fake(send) as unknown as StarpeaceSession, deps([])))
      .rejects.toThrow(/Pre-flight refused the live run.*query dispatcher is broken/s);
  });

  it('refuses on an `error` payload even without an errorCode, and on a timeout', async () => {
    const errored = jest.fn().mockResolvedValue({ payload: 'error 5 getting DirectoryServer' });
    await expect(preflight(fake(errored) as unknown as StarpeaceSession, deps([])))
      .rejects.toThrow(/Pre-flight refused the live run/);

    const timedOut = jest.fn().mockRejectedValue(new Error('Request timeout'));
    await expect(preflight(fake(timedOut) as unknown as StarpeaceSession, deps([])))
      .rejects.toThrow(/Pre-flight refused the live run: Request timeout/);
  });

  it('names why it refuses, so the run is not blamed for a third party incident', async () => {
    const send = jest.fn().mockResolvedValue({ payload: 'error 1', errorCode: 1 });
    await expect(preflight(fake(send) as unknown as StarpeaceSession, deps([])))
      .rejects.toThrow(/attribute someone else's incident to its own first frame/);
  });

  it('always tears its socket down, refused or not', async () => {
    const ok = fake(jest.fn().mockResolvedValue({ payload: 'objid="1"' }));
    await preflight(ok as unknown as StarpeaceSession, deps([]));
    expect(ok.destroySocket).toHaveBeenCalledWith(PREFLIGHT_SOCKET);

    const bad = fake(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(preflight(bad as unknown as StarpeaceSession, deps([]))).rejects.toThrow();
    expect(bad.destroySocket).toHaveBeenCalledWith(PREFLIGHT_SOCKET);
  });

  // A replay run answers from a file and has no server to be sick: probing it
  // would only add a frame the recording does not hold, which reads as silence.
  //
  // The oracle is the absence of the `[preflight]` line, NOT the absence of an
  // `idof DirectoryServer` frame — `connectDirectory` emits one of those itself
  // as the first frame of the login, and asserting on the frame would pass for
  // the wrong reason the day the probe stopped logging.
  it('a replay run never probes', async () => {
    const c = makeDeps();
    await runConformance(options(), c.deps);
    expect(c.lines.some(l => /\[preflight\]/.test(l))).toBe(false);
    expect(c.lines.some(l => /\[conformance\] suites:/.test(l))).toBe(true);
  }, 20000);
});

// ═══════════════════════════════════════════════════════════════════════════
// The nominal path — a company list that is actually there
//
// The replay fixture cannot produce one: `run.ts` points `world.ip` at loopback
// so the HTTP fetch always fails. These tests hand the session a list, which is
// the only way to reach the branch a LIVE run takes, and the only way to prove
// the phase/company assertions accept the state they are supposed to accept.
// ═══════════════════════════════════════════════════════════════════════════
describe('run — the company branch a live run takes', () => {
  const GREEN = { id: '4799656', name: 'SPO_test3 - Green' };

  /** Deps whose session reports a company list, and optionally a forced phase. */
  function withCompanies(
    c: ReturnType<typeof makeDeps>,
    companies: Array<{ id: string; name: string }>,
    phase?: SessionPhase,
  ): RunDeps {
    return {
      ...c.deps,
      createSession: () => {
        const real = c.deps.createSession();
        return new Proxy(real, {
          // Methods are handed back UNBOUND on purpose: `selectCompany` resolves
          // the id through `ctx.getAvailableCompanies()`, so it has to see the
          // override. Binding to the target would give it the real (empty) list
          // and `currentCompany` would stay null — the very state under test.
          get: (target, prop, receiver: unknown) => {
            if (prop === 'getAvailableCompanies') return () => companies;
            if (prop === 'getPhase' && phase !== undefined) return () => phase;
            return Reflect.get(target, prop, receiver) as unknown;
          },
          set: (target, prop, value) => Reflect.set(target, prop, value),
        });
      },
    };
  }

  it('resolves the company to its ID, selects it, and reaches WORLD_CONNECTED', async () => {
    const c = makeDeps();
    const { report, exitCode } = await runConformance(options(), withCompanies(c, [GREEN]));

    expect(exitCode).toBe(0);
    expect(report.session.company).toBe(GREEN.name);
    expect(c.lines.some(l => new RegExp(`company selected: ${GREEN.name} \\(#${GREEN.id}\\)`).test(l))).toBe(true);
    expect(c.lines.some(l => /sequence complete — phase WORLD_CONNECTED/.test(l))).toBe(true);
    // The selection really went out: PickEvent belongs to selectCompany, not to loginWorld.
    const wire = c.transport().recorder.all().filter(e => e.dir !== 'in').map(e => e.raw);
    expect(wire.some(f => /call PickEvent/.test(f))).toBe(true);
  }, 20000);

  it('matches the company case-insensitively, and refuses a name that is not in the list', async () => {
    const c = makeDeps();
    await expect(runConformance(options(['--company', 'SPO_test3 - Red']), withCompanies(c, [GREEN])))
      .rejects.toThrow(/Company "SPO_test3 - Red" not in: SPO_test3 - Green/);

    const c2 = makeDeps();
    const { report } = await runConformance(options(['--company', 'spo_test3 - green']), withCompanies(c2, [GREEN]));
    expect(report.session.company).toBe(GREEN.name);
  }, 20000);

  /**
   * The phase and the company are ONE assertion (login-handler.ts:616 sets
   * WORLD_CONNECTED as the last act of selectCompany). A company selected with
   * the phase stuck short of it means the selection did not run to the end —
   * and that must stop the run, not merely be reported.
   */
  it('refuses to explore when a company is selected but the phase never reached WORLD_CONNECTED', async () => {
    const c = makeDeps();
    await expect(runConformance(options(), withCompanies(c, [GREEN], SessionPhase.WORLD_CONNECTING)))
      .rejects.toThrow(/a company is selected but the session phase is WORLD_CONNECTING/);
  }, 20000);

  it('refuses to explore when the world login did not even reach WORLD_CONNECTING', async () => {
    const c = makeDeps();
    await expect(runConformance(options(['--no-company']), withCompanies(c, [], SessionPhase.DIRECTORY_CONNECTED)))
      .rejects.toThrow(/No company was selected, so the reachable terminal phase is WORLD_CONNECTING/);
  }, 20000);

  it('the connexion suite reports the company steps as PASS once a company is really selected', async () => {
    const c = makeDeps();
    const opts = parseConformanceArgs(
      ['--suite', 'connexion', '--recording', 'in.ndjson'], {},
    );
    const { report } = await runConformance(opts, withCompanies(c, [GREEN]));
    const steps = Object.fromEntries(report.suites[0].steps.map(s => [s.id, s]));
    expect(steps.companies.verdict.kind).toBe('PASS');
    expect(steps.company.verdict.kind).toBe('PASS');
    expect(steps.company.outcome.response).toBe(`${GREEN.name} (#${GREEN.id}) in WORLD_CONNECTED`);
    // …and it cost nothing: the suite judged the floor, it did not re-run it.
    expect(report.suites[0].steps.every(s => (s.outcome.elapsedMs ?? 0) === 0)).toBe(true);
  }, 20000);
});
