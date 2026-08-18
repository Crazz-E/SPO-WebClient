import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { defaultDeps } from './run';
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
