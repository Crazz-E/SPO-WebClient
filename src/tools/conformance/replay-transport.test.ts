/**
 * ReplayTransport — the mock that is no longer written by hand.
 *
 * The load-bearing test drives the REAL StarpeaceSession through directory
 * auth + world login over the planitia live capture (`login-full`, 2026-07-03)
 * with no `net` mock and no scenario edited for the purpose: the transport
 * answers from the recording, the session cannot tell.
 */

import { StarpeaceSession } from '../../server/spo_session';
import { RdoAction, RdoVerb } from '../../shared/types';
import { TimeoutCategory } from '../../shared/timeout-categories';
import { loginFullCapturedScenario } from '../../mock-server/scenarios/captured/login-full-captured.scenario';
import type { RdoExchange, RdoScenario } from '../../mock-server/types/rdo-exchange-types';
import { ReplayTransport, groupEntriesBySocket, normalizeRequest } from './replay-transport';
import { Recorder } from './transport';
import { parseNdjsonCapture } from '../../mock-server/log-capture-converter';

// loginWorld fetches the company list over HTTP; offline that must not touch the network.
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({ ok: true, status: 200, url: 'http://127.0.0.1/', text: async () => '' }),
}));

const CLIENT_VIEW = loginFullCapturedScenario.variables.logonId;         // 32000416
const INTERFACE_SERVER = loginFullCapturedScenario.variables.interfaceServerId; // 31929384

/** Extra exchanges a suite would need, hand-written HERE because a test may. */
const EXTRA: RdoExchange[] = [
  { id: 'x-username', request: `C 1 sel ${CLIENT_VIEW} get UserName`, response: 'A1 UserName="$SPO_test3"',
    matchKeys: { verb: 'sel', action: 'get', member: 'UserName' } },
  { id: 'x-probe-1', request: `C 1 sel ${CLIENT_VIEW} set RdoConfProbe="#1"`, response: 'A1 error 3 setting RdoConfProbe',
    matchKeys: { verb: 'sel', action: 'set', member: 'RdoConfProbe' } },
  { id: 'x-probe-2', request: `C 1 sel ${CLIENT_VIEW} set RdoConfProbe="@1234.5"`, response: 'A1 error 3 setting RdoConfProbe',
    matchKeys: { verb: 'sel', action: 'set', member: 'RdoConfProbe' } },
];

function loginRecording(extra: RdoExchange[] = EXTRA): Record<string, RdoScenario> {
  return { '*': { ...loginFullCapturedScenario, exchanges: [...loginFullCapturedScenario.exchanges, ...extra] } };
}

async function loginOverReplay(transport: ReplayTransport): Promise<StarpeaceSession> {
  const session = new StarpeaceSession();
  session.setSocketFactory(p => transport.socketFactory(p));
  session.setWorldPoolEnabled(false);
  const worlds = await session.connectDirectory('SPO_test3', 'test3', 'Root/Areas/America/Worlds');
  const world = worlds.find(w => w.name.toLowerCase() === 'planitia');
  if (!world) throw new Error(`planitia not in ${worlds.map(w => w.name).join(',')}`);
  await session.loginWorld('SPO_test3', 'test3', { ...world, ip: '127.0.0.1' });
  return session;
}

describe('replay-transport — normalizeRequest', () => {
  it('drops the QueryId and the delimiter, nothing else', () => {
    expect(normalizeRequest('C 1027 sel 32000416 call RegisterEventsById "^" "#31978648";')).toBe('C sel 32000416 call RegisterEventsById "^" "#31978648"');
    expect(normalizeRequest('C sel 1 call SetLanguage "*" "%0"')).toBe('C sel 1 call SetLanguage "*" "%0"');
  });
});

describe('replay-transport — ReplaySocket', () => {
  it('answers with the caller QueryId, exact request first, then RdoMock fallback', async () => {
    const transport = new ReplayTransport(loginRecording());
    const socket = transport.socketFactory('world');
    const got: string[] = [];
    socket.on('data', (b: Buffer) => got.push(b.toString('latin1')));

    socket.write(Buffer.from(`C 77 sel ${CLIENT_VIEW} set RdoConfProbe="@1234.5";`, 'latin1'));
    // The exact exchange is consumed; the second identical frame falls back to
    // RdoMock's member match and gets the same reply.
    socket.write(Buffer.from(`C 78 sel ${CLIENT_VIEW} get UserName;`, 'latin1'));
    socket.write(Buffer.from(`C 79 sel ${CLIENT_VIEW} get UserName;`, 'latin1'));
    await new Promise(r => setImmediate(r));

    expect(got).toEqual([
      'A77 error 3 setting RdoConfProbe;',
      'A78 UserName="$SPO_test3";',
      'A79 UserName="$SPO_test3";',
    ]);
    // Both directions are recorded, so a replay run can itself be diffed.
    expect(transport.recorder.all().map(e => e.dir)).toEqual(['out-sync', 'out-sync', 'out-sync', 'in', 'in', 'in']);
  });

  it('a SET literal that was never recorded stays unanswered — the literal IS the probe', async () => {
    // RdoProtocol.parse keeps the value inside `member` for SET frames, so the
    // member fallback cannot lend another literal's reply. That is right: the
    // types suite tells `"@1234.5"` from `"@1,5"` by the reply, and a borrowed
    // `error 3` would hide a server that answers `error 4`.
    const transport = new ReplayTransport(loginRecording());
    const socket = transport.socketFactory('world');
    const got: string[] = [];
    socket.on('data', (b: Buffer) => got.push(b.toString('latin1')));
    socket.write(Buffer.from(`C 78 sel ${CLIENT_VIEW} set RdoConfProbe="!3.14";`, 'latin1'));
    await new Promise(r => setImmediate(r));
    expect(got).toEqual([]);
  });

  it('leaves an unrecorded frame unanswered — silence, as a dead server would', async () => {
    const transport = new ReplayTransport(loginRecording([]));
    const socket = transport.socketFactory('world');
    const got: string[] = [];
    socket.on('data', (b: Buffer) => got.push(b.toString('latin1')));
    socket.write(Buffer.from(`C 5 sel ${CLIENT_VIEW} get NoSuchThingRecorded;`, 'latin1'));
    await new Promise(r => setImmediate(r));
    expect(got).toEqual([]);
  });

  it('never answers our own answers to server requests', async () => {
    const transport = new ReplayTransport(loginRecording());
    const socket = transport.socketFactory('world');
    const got: string[] = [];
    socket.on('data', (b: Buffer) => got.push(b.toString('latin1')));
    socket.write('A2 objid="40530807";');
    await new Promise(r => setImmediate(r));
    expect(got).toEqual([]);
  });

  it('refuses a socket purpose the recording never saw', () => {
    const transport = new ReplayTransport({ world: loginFullCapturedScenario });
    expect(() => transport.socketFactory('mail')).toThrow(/no socket "mail"/);
    expect(transport.sockets()).toEqual(['world']);
  });

  it('close() destroys every socket it handed out, once', async () => {
    const transport = new ReplayTransport(loginRecording());
    const socket = transport.socketFactory('world');
    const closed = jest.fn();
    socket.on('close', closed);
    transport.close();
    transport.close();
    await new Promise(r => setImmediate(r));
    expect(closed).toHaveBeenCalledTimes(1);
    expect(socket.destroyed).toBe(true);
  });
});

describe('replay-transport — fromNdjson', () => {
  it('groups a Recorder file by socket and builds one scenario per socket', () => {
    const rec = new Recorder(() => 't');
    rec.recordOut('directory_auth', 'C 1 idof "DirectoryServer";');
    rec.recordIn('directory_auth', 'A1 objid="38833784";');
    rec.recordOut('world', 'C 2 idof "InterfaceServer";');
    rec.recordIn('world', 'A2 objid="31929384";');

    const grouped = groupEntriesBySocket(parseNdjsonCapture(rec.toNdjson()), 'r');
    expect(Object.keys(grouped).sort()).toEqual(['directory_auth', 'world']);
    expect(grouped.world.exchanges[0].matchKeys).toEqual({ verb: 'idof', targetId: 'InterfaceServer' });

    const transport = ReplayTransport.fromNdjson(rec.toNdjson());
    expect(transport.sockets().sort()).toEqual(['directory_auth', 'world']);
    expect(() => transport.socketFactory('directory_query')).toThrow(/no socket/);
  });
});

describe('replay-transport — the real session logs in over the live capture', () => {
  let session: StarpeaceSession | undefined;

  afterEach(async () => {
    if (session) {
      await session.endSession().catch(() => undefined);
      session.destroy();
      session = undefined;
    }
  });

  it('directory auth + world login complete and yield the captured ids', async () => {
    const transport = new ReplayTransport(loginRecording());
    session = await loginOverReplay(transport);

    expect(session.worldContextId).toBe(CLIENT_VIEW);
    expect(session.interfaceServerId).toBe(INTERFACE_SERVER);
    expect(session.tycoonId).toBe('37');
  }, 15000);

  it('a suite frame after login is answered from the recording, error replies included', async () => {
    const transport = new ReplayTransport(loginRecording());
    session = await loginOverReplay(transport);

    const reply = await session.sendRdoRequest('world', {
      verb: RdoVerb.SEL, targetId: CLIENT_VIEW, action: RdoAction.GET, member: 'UserName',
    }, undefined, TimeoutCategory.FAST);
    expect(reply.payload).toBe('UserName="$SPO_test3"');

    // `A<id> error 3 setting …` — observe mode resolves with errorCode, reject
    // mode throws RdoServerError; either way the payload reaches the caller.
    const probe = session.sendRdoRequest('world', {
      verb: RdoVerb.SEL, targetId: CLIENT_VIEW, action: RdoAction.SET, member: 'RdoConfProbe', args: ['"@1234.5"'],
    }, undefined, TimeoutCategory.FAST);
    const outcome = await probe.then(
      p => ({ code: p.errorCode, payload: p.payload }),
      (e: unknown) => ({ code: (e as { errorCode: number }).errorCode, payload: (e as { payload: string }).payload }),
    );
    expect(outcome).toEqual({ code: 3, payload: 'error 3 setting RdoConfProbe' });
  }, 15000);
});

describe('replay-transport — net.Socket surface the session touches', () => {
  it('accepts the tuning calls as no-ops and connects on the next tick', async () => {
    const transport = new ReplayTransport(loginRecording());
    const socket = transport.socketFactory('world');
    expect(socket.setNoDelay(true)).toBe(socket);
    expect(socket.setKeepAlive(true)).toBe(socket);
    expect(socket.setTimeout(1)).toBe(socket);
    expect(socket.ref()).toBe(socket);
    expect(socket.unref()).toBe(socket);
    await new Promise<void>(resolve => { socket.connect(1, 'ignored', resolve); });
    socket.end();
  });
});
