import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GATE_FILE, defaultDeps, isGate, updateGate } from './run';
import type { RunDeps } from './run';
import type { ConformanceOptions } from './cli';
import { Recorder } from './transport';
import { StarpeaceSession } from '../../server/spo_session';

const asOptions = (o: Partial<ConformanceOptions>): ConformanceOptions => o as ConformanceOptions;

describe('run — defaultDeps', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdo-conf-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reads a recording from disk into a ReplayTransport, and writes files back', () => {
    const rec = new Recorder(() => 't');
    rec.recordOut('world', 'C 1 idof "InterfaceServer";');
    rec.recordIn('world', 'A1 objid="31929384";');
    const file = path.join(dir, 'rec.ndjson');
    defaultDeps.writeFile(file, rec.toNdjson());
    expect(defaultDeps.readFile(file)).toBe(rec.toNdjson());

    const transport = defaultDeps.createTransport(asOptions({ transport: 'replay', recording: file }));
    expect(transport.kind).toBe('replay');
    transport.close();
  });

  it('builds a live transport and a real session', () => {
    const transport = defaultDeps.createTransport(asOptions({ transport: 'live' }));
    expect(transport.kind).toBe('live');
    transport.close();
    const session = defaultDeps.createSession();
    expect(session).toBeInstanceOf(StarpeaceSession);
    session.destroy();
    expect(defaultDeps.now()).toBeInstanceOf(Date);
  });

  it('sleep waits, and the server-log fetcher is the plain-HTTP one', async () => {
    const t0 = Date.now();
    await defaultDeps.sleep(20);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(15);
    // Unroutable base: rejects (no network in tests), proving the wiring without a server.
    await expect(defaultDeps.fetchServerLogs('http://127.0.0.1:9/logs', { loginAt: new Date(), logoffAt: new Date() })).rejects.toThrow();
  });

  it('gate: read/write round-trip through the real file, isGate guards the shape', () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      expect(defaultDeps.readGate()).toBeNull();
      defaultDeps.writeGate({ tool: 'rdo-conformance-gate', replay: { finishedAt: 't', exitCode: 0, suites: 'types', world: 'planitia', target: 'shared' } });
      expect(fs.existsSync(path.join(dir, GATE_FILE))).toBe(true);
      expect(defaultDeps.readGate()?.replay?.suites).toBe('types');
      fs.writeFileSync(path.join(dir, GATE_FILE), '{"tool":"other"}');
      expect(defaultDeps.readGate()).toBeNull();
    } finally {
      process.chdir(cwd);
    }
    expect(isGate({ tool: 'rdo-conformance-gate' })).toBe(true);
    expect(isGate(null)).toBe(false);
  });

  it('gate: the live step after a validated replay declares git sync allowed; live alone stays blocked', () => {
    const lines: string[] = [];
    const store: { g: ReturnType<RunDeps['readGate']> } = { g: null };
    const deps = { ...defaultDeps, readGate: () => store.g, writeGate: (g: NonNullable<typeof store.g>) => { store.g = g; } } as RunDeps;
    const report = (transport: 'replay' | 'live') => ({
      transport, finishedAt: '2026-08-16T20:00:00.000Z', world: 'planitia', target: 'shared', suites: [{ name: 'types' }],
    }) as unknown as import('./types').RunReport;
    updateGate(deps, report('live'), 0, l => lines.push(l));
    expect(lines.pop()).toMatch(/git sync stays blocked/);
    // 5th argument = a baseline was actually compared. Without it the replay step
    // does not count (2026-08-18), and the pair would never complete.
    updateGate(deps, report('replay'), 0, l => lines.push(l), true);
    updateGate(deps, report('live'), 0, l => lines.push(l));
    expect(lines.pop()).toMatch(/both steps validated .* git sync allowed/);
  });

  it('gate: a replay with no baseline comparison is refused, and the live step stays orphaned', () => {
    const lines: string[] = [];
    const store: { g: ReturnType<RunDeps['readGate']> } = { g: null };
    const deps = { ...defaultDeps, readGate: () => store.g, writeGate: (g: NonNullable<typeof store.g>) => { store.g = g; } } as RunDeps;
    const report = (transport: 'replay' | 'live') => ({
      transport, finishedAt: '2026-08-16T20:00:00.000Z', world: 'planitia', target: 'shared', suites: [{ name: 'types' }],
    }) as unknown as import('./types').RunReport;

    updateGate(deps, report('replay'), 0, l => lines.push(l));          // no 5th argument
    expect(lines.some(l => /WITHOUT --diff-baseline/.test(l))).toBe(true);
    expect(store.g).toBeNull();

    updateGate(deps, report('live'), 0, l => lines.push(l));
    expect(lines.pop()).toMatch(/git sync stays blocked/);
  });

  it('log / error go to the console', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    defaultDeps.log('a');
    defaultDeps.error('b');
    expect(log).toHaveBeenCalledWith('a');
    expect(err).toHaveBeenCalledWith('b');
    log.mockRestore();
    err.mockRestore();
  });
});
