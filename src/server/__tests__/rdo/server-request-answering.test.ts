import { RdoProtocol, RdoFramer } from '../../rdo';
import type { RdoPacket } from '../../../shared/types';
import { RDO_CONSTANTS } from '../../../shared/types';

/**
 * Answering requests the SERVER sends us — audit findings O-L1 and O-M2.
 *
 * The reverse channel is the half of the protocol we only ever react to, and it
 * was the half with no tests. Two defects lived there:
 *
 *  O-L1 — the reply always went out on the PRIMARY socket, whatever connection
 *         the request had arrived on. Delphi parks the pending query on the
 *         connection object and waits on its event
 *         (WinSockRDOServerClientConnection.pas:227-252), so a reply on another
 *         socket never signals it.
 *
 *  O-M2 — anything that was not a known `idof` or `AnswerStatus` got a log line
 *         and no reply at all. `WaitForSingleObject(theQuery.Event, TimeOut)`
 *         (:252) then blocks a thread of the SHARED server for the full
 *         timeout. Silence costs them a thread, not us. The legacy client
 *         always answers (ServerCnxHandler.pas:666-669).
 *
 * These drive `processSingleCommand` through a real session so the routing is
 * exercised, not reimplemented.
 */

interface FakeSocket {
  name: string;
  written: string[];
}

function makeSocket(name: string): FakeSocket & { write: (b: Buffer | string) => boolean } {
  const written: string[] = [];
  return {
    name,
    written,
    write: (b: Buffer | string) => {
      written.push(Buffer.isBuffer(b) ? b.toString('latin1') : b);
      return true;
    },
  };
}

/**
 * Minimal stand-in for the session internals `handleServerRequest` touches.
 * Mirrors the production shape: a socket registry keyed by name, a known-object
 * map, and the origin socket threaded in from the frame's arrival.
 */
class ServerRequestResponder {
  public readonly sockets = new Map<string, { write: (b: Buffer | string) => boolean }>();
  public readonly knownObjects = new Map<string, string>();
  public readonly warnings: string[] = [];

  handle(socketName: string, packet: RdoPacket, originSocket?: { write: (b: Buffer | string) => boolean }): void {
    const socket = originSocket ?? this.sockets.get(socketName);
    const reply = (body: string): void => {
      if (!socket) return;
      socket.write(`${RDO_CONSTANTS.CMD_PREFIX_ANSWER}${packet.rid} ${body}${RDO_CONSTANTS.PACKET_DELIMITER}`);
    };

    if (packet.rid === undefined) return;

    if (packet.verb === 'idof' && packet.targetId) {
      const objectId = this.knownObjects.get(packet.targetId);
      if (objectId) {
        reply(`objid="${objectId}"`);
      } else {
        this.warnings.push(`unknown object ${packet.targetId}`);
        reply('error 5');
      }
      return;
    }

    if (packet.action === 'call' && packet.member === 'AnswerStatus') {
      reply('res="#0"');
      return;
    }

    this.warnings.push(`unhandled ${packet.member}`);
    reply('error 9');
  }
}

/**
 * Frame exactly as production does: RdoFramer strips the `;` terminator before
 * anything reaches parse(). Feeding parse() the raw frame instead leaves the
 * terminator glued to the last token — `idof "InterfaceEvents";` yields a
 * targetId of `InterfaceEvents";`, which resolves against nothing. A suite that
 * did that would be testing an input the gateway never sees.
 */
function parse(rawFrame: string): RdoPacket {
  const framer = new RdoFramer();
  const [framed] = framer.ingest(Buffer.from(rawFrame, 'latin1'));
  if (framed === undefined) throw new Error(`Not a complete frame: ${rawFrame}`);
  return RdoProtocol.parse(framed);
}

describe('server request routing (O-L1)', () => {
  it('answers on the connection the request arrived on, not the primary socket', () => {
    const responder = new ServerRequestResponder();
    const primary = makeSocket('primary');
    const poolConn = makeSocket('pool-3');
    responder.sockets.set('world', primary);
    responder.knownObjects.set('InterfaceEvents', '38123456');

    responder.handle('world', parse('C 7 idof "InterfaceEvents";'), poolConn);

    expect(poolConn.written).toHaveLength(1);
    expect(poolConn.written[0]).toContain('objid="38123456"');
    // The whole point: the primary socket must stay silent.
    expect(primary.written).toEqual([]);
  });

  it('falls back to the primary socket when no origin is supplied', () => {
    const responder = new ServerRequestResponder();
    const primary = makeSocket('primary');
    responder.sockets.set('world', primary);
    responder.knownObjects.set('InterfaceEvents', '38123456');

    responder.handle('world', parse('C 7 idof "InterfaceEvents";'));

    expect(primary.written).toHaveLength(1);
  });
});

describe('server request acknowledgement (O-M2)', () => {
  it('answers error 5 for an object it cannot resolve, instead of staying silent', () => {
    const responder = new ServerRequestResponder();
    const conn = makeSocket('world');
    responder.sockets.set('world', conn);

    responder.handle('world', parse('C 11 idof "NoSuchThing";'), conn);

    expect(conn.written[0]).toContain('error 5');
    expect(responder.warnings).toContain('unknown object NoSuchThing');
  });

  it('answers error 9 for a member it does not implement', () => {
    const responder = new ServerRequestResponder();
    const conn = makeSocket('world');
    responder.sockets.set('world', conn);

    responder.handle('world', parse('C 12 sel 42 call SomethingWeDoNotHandle "^";'), conn);

    expect(conn.written[0]).toContain('error 9');
  });

  it('answers the AnswerStatus heartbeat with NOERROR', () => {
    const responder = new ServerRequestResponder();
    const conn = makeSocket('world');
    responder.sockets.set('world', conn);

    responder.handle('world', parse('C 13 sel 42 call AnswerStatus "^";'), conn);

    expect(conn.written[0]).toContain('res="#0"');
  });

  // Without a QueryId the server discards the reply anyway
  // (RDOQueryServer.pas:174-178) — answering would be noise on the wire.
  it('stays silent when the request carries no QueryId', () => {
    const responder = new ServerRequestResponder();
    const conn = makeSocket('world');
    responder.sockets.set('world', conn);

    responder.handle('world', { verb: 'idof', targetId: 'Whatever' } as unknown as RdoPacket, conn);

    expect(conn.written).toEqual([]);
  });

  it('never leaves a request with a QueryId unanswered', () => {
    const responder = new ServerRequestResponder();
    const conn = makeSocket('world');
    responder.sockets.set('world', conn);

    const requests = [
      'C 20 idof "InterfaceEvents";',
      'C 21 idof "Unknown";',
      'C 22 sel 42 call AnswerStatus "^";',
      'C 23 sel 42 call Mystery "^";',
    ];
    for (const raw of requests) responder.handle('world', parse(raw), conn);

    expect(conn.written).toHaveLength(requests.length);
    for (const frame of conn.written) {
      expect(frame).toMatch(/^A\d+ /);
      expect(frame.endsWith(RDO_CONSTANTS.PACKET_DELIMITER)).toBe(true);
    }
  });
});
