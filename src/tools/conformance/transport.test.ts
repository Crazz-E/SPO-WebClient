import { EventEmitter } from 'events';
import type * as net from 'net';
import { LiveTransport, Recorder, classifyIncoming, classifyOutgoing, tapSocket } from './transport';
import { parseNdjsonCapture } from '../../mock-server/log-capture-converter';

/** A socket-shaped emitter whose write() just collects bytes. */
class FakeSocket extends EventEmitter {
  written: Buffer[] = [];
  destroyed = false;
  write(chunk: string | Uint8Array, _enc?: unknown, cb?: () => void): boolean {
    this.written.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string, 'latin1'));
    cb?.();
    return true;
  }
  destroy(): this { this.destroyed = true; return this; }
}

const fixedClock = () => '2026-08-16T12:00:00.000Z';

describe('transport — classification mirrors the gateway wire log', () => {
  it('a QueryId request is out-sync with its rid', () => {
    expect(classifyOutgoing('C 42 sel 8161308 get UserName')).toEqual({ dir: 'out-sync', rid: 42 });
  });
  it('a void push and our answers to server requests are out-void', () => {
    expect(classifyOutgoing('C sel 8161308 call ClientAware "*"')).toEqual({ dir: 'out-void' });
    expect(classifyOutgoing('A2 objid="40530807"')).toEqual({ dir: 'out-void' });
  });
  it('incoming answers carry their rid; incoming pushes do not', () => {
    expect(classifyIncoming('A42 UserName="$SPO_test3"')).toEqual({ dir: 'in', rid: 42 });
    expect(classifyIncoming('C sel 40530807 call InitClient "*" "@1"')).toEqual({ dir: 'in' });
  });
});

describe('transport — Recorder', () => {
  it('redacts credentials at record time, not at write time', () => {
    const rec = new Recorder(fixedClock);
    rec.recordOut('directory_auth', 'C 3 sel 402875484 call RDOLogonUser "^" "%SPO_test3","%test3";');
    expect(rec.all()[0].raw).toBe('C 3 sel 402875484 call RDOLogonUser "^" "%SPO_test3","%[REDACTED]";');
    expect(rec.toNdjson()).not.toContain('%test3');
  });

  it('ignores empty writes and strips the delimiter', () => {
    const rec = new Recorder(fixedClock);
    rec.recordOut('world', '   ');
    rec.recordIn('world', '');
    rec.recordIn('world', 'A1 X="#1";');
    expect(rec.all()).toHaveLength(1);
    expect(rec.all()[0].raw).toBe('A1 X="#1";');
  });

  it('round-trips through the capture:convert parser — a recording IS a capture', () => {
    const rec = new Recorder(fixedClock);
    rec.recordOut('world', 'C 7 sel 8161308 get UserName;');
    rec.recordIn('world', 'A7 UserName="$SPO_test3";');
    rec.recordOut('world', 'C sel 8161308 call ClientAware "*";');

    const entries = parseNdjsonCapture(rec.toNdjson());
    expect(entries).toEqual([
      { ts: fixedClock(), sid: undefined, socket: 'world', dir: 'out-sync', rid: 7, raw: 'C 7 sel 8161308 get UserName;' },
      { ts: fixedClock(), sid: undefined, socket: 'world', dir: 'in', rid: 7, raw: 'A7 UserName="$SPO_test3";' },
      { ts: fixedClock(), sid: undefined, socket: 'world', dir: 'out-void', rid: undefined, raw: 'C sel 8161308 call ClientAware "*";' },
    ]);
  });

  it('empty recorder → empty file, no stray newline', () => {
    expect(new Recorder(fixedClock).toNdjson()).toBe('');
  });
});

describe('transport — tapSocket', () => {
  it('records outgoing bytes and still delivers them to the real write', () => {
    const socket = new FakeSocket();
    const rec = new Recorder(fixedClock);
    tapSocket(socket as unknown as net.Socket, 'world', rec);

    const ok = socket.write(Buffer.from('C 1 sel 1 get X;', 'latin1'));
    expect(ok).toBe(true);
    expect(socket.written.map(b => b.toString('latin1'))).toEqual(['C 1 sel 1 get X;']);
    expect(rec.all()[0]).toMatchObject({ socket: 'world', dir: 'out-sync', rid: 1 });
  });

  it('records incoming frames whole, even when TCP splits or joins them', () => {
    const socket = new FakeSocket();
    const rec = new Recorder(fixedClock);
    tapSocket(socket as unknown as net.Socket, 'world', rec);

    socket.emit('data', Buffer.from('A1 X="#1";A2 Y=', 'latin1'));
    socket.emit('data', Buffer.from('"#2";', 'latin1'));
    expect(rec.all().map(e => e.raw)).toEqual(['A1 X="#1"', 'A2 Y="#2"']);
    expect(rec.all().map(e => e.rid)).toEqual([1, 2]);
  });
});

describe('transport — tapSocket on a REAL net.Socket', () => {
  // net.Socket.prototype.connect resets an overridden `write` (Node net.js). The
  // 2026-08-16 live run recorded 64 incoming frames and 0 outgoing because of it.
  it('still records the outgoing frame written after connect()', async () => {
    const net = await import('net');
    const server = net.createServer(s => { s.on('data', () => s.write('A1 ok;')); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    const rec = new Recorder(fixedClock);
    const socket = new net.Socket();
    tapSocket(socket, 'world', rec);
    const reply = new Promise<string>(resolve => socket.on('data', d => resolve(String(d))));
    await new Promise<void>(resolve => socket.connect(port, '127.0.0.1', () => {
      socket.write(Buffer.from('C 1 idof "X";', 'latin1'));
      resolve();
    }));
    expect((await reply).trim()).toBe('A1 ok;');
    socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));

    expect(rec.all().map(e => `${e.dir}:${e.raw}`)).toEqual(['out-sync:C 1 idof "X";', 'in:A1 ok']);
  });
});

describe('transport — LiveTransport', () => {
  it('hands out tapped sockets from the injected factory and destroys them on close', () => {
    const made: FakeSocket[] = [];
    const transport = new LiveTransport(new Recorder(fixedClock), () => {
      const s = new FakeSocket();
      made.push(s);
      return s as unknown as net.Socket;
    });
    expect(transport.kind).toBe('live');

    const s = transport.socketFactory('world');
    s.write(Buffer.from('C 9 sel 1 get A;', 'latin1'));
    expect(transport.recorder.all()).toHaveLength(1);

    transport.close();
    expect(made[0].destroyed).toBe(true);
    transport.close(); // idempotent
  });
});
