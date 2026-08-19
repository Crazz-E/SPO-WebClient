/**
 * End-to-end wire-byte test for P-C1 — RDO frame injection from user text.
 * (Lot L1.)
 *
 * This suite asserts the bytes that are ACTUALLY handed to socket.write(), by
 * driving the production chat handler through the production serialisation
 * chain. Nothing here is hand-built:
 *
 *   sendChatMessage()            src/server/session/chat-handler.ts
 *     → RdoValue.string().format()   src/shared/rdo-types.ts   (codec + escaping)
 *     → RdoProtocol.format()         src/server/rdo.ts         (frame assembly)
 *     → writeRdoFrame()              src/server/rdo-helpers.ts (latin1 → Buffer)
 *
 * The oracle is the production framer (`RdoFramer`), which splits on unquoted
 * semicolons exactly like the Delphi server's KeyWordPos (RDOUtils.pas:109-121)
 * and `WinSockRDOConnectionsServer.pas:785-826`. One request in ⇒ exactly one
 * frame on the wire. Any second frame is an injected command.
 */

import type { Socket } from 'net';
import type { RdoPacket } from '../../../shared/types';
import { RDO_CONSTANTS } from '../../../shared/types';
import { RdoFramer, RdoProtocol } from '../../rdo';
import { writeRdoFrame } from '../../rdo-helpers';
import type { SessionContext } from '../../session/session-context';
import { sendChatMessage } from '../../session/chat-handler';

const WORLD_CONTEXT_ID = '8161308';

/**
 * The P-C1 audit payload, completed so that the truncation produces TWO fully
 * terminated frames rather than one frame plus a dangling literal:
 *   Ģ (U+0122) truncates to 0x22 '"', Ļ (U+013B) to 0x3B ';'.
 * Interpolated by chat-handler as `"%<payload>";`, the pre-fix wire read
 *   … call SayThis "*" "%","%hi"; C sel 1 call Evil "*" "%pwned";
 */
const INJECTION_PAYLOAD = 'hiĢĻ C sel 1 call Evil Ģ*Ģ Ģ%pwned';

/** Socket double that records the exact Buffers handed to write(). */
function createRecordingSocket(): { socket: Socket; writes: Buffer[] } {
  const writes: Buffer[] = [];
  const socket = {
    write(chunk: Buffer | string): boolean {
      writes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'latin1'));
      return true;
    },
    destroyed: false,
  } as unknown as Socket;
  return { socket, writes };
}

/**
 * SessionContext double whose sendRdoRequest reproduces the real send path
 * verbatim — spo_session.ts:2220-2222 — so the frame under test is the frame
 * production emits. Only the request/response plumbing is stubbed.
 */
function createWireContext(): { ctx: SessionContext; writes: Buffer[] } {
  const { socket, writes } = createRecordingSocket();

  const ctx = {
    worldContextId: WORLD_CONTEXT_ID,
    log: {
      debug: (): void => undefined,
      info: (): void => undefined,
      warn: (): void => undefined,
      error: (): void => undefined,
    },
    getSocket: (): Socket => socket,
    sendRdoRequest: async (
      _socketName: string,
      packetData: Partial<RdoPacket>
    ): Promise<RdoPacket> => {
      const rawString = RdoProtocol.format(packetData as RdoPacket);
      writeRdoFrame(socket, rawString + RDO_CONSTANTS.PACKET_DELIMITER, true);
      return { type: 'RESPONSE', rid: 1, payload: 'res="#0"' } as RdoPacket;
    },
  } as unknown as SessionContext;

  return { ctx, writes };
}

/** Every byte the session pushed to the socket, as one latin1 string. */
function emittedWire(writes: Buffer[]): string {
  return Buffer.concat(writes).toString('latin1');
}

/** Re-frame the emitted bytes with the production framer. */
function framesOnTheWire(writes: Buffer[]): string[] {
  return new RdoFramer().ingest(Buffer.concat(writes));
}

describe('P-C1 — RDO frame injection through chat text', () => {
  it('emits exactly one frame for a benign message', async () => {
    const { ctx, writes } = createWireContext();
    await sendChatMessage(ctx, 'hello world');

    expect(framesOnTheWire(writes)).toHaveLength(1);
    expect(emittedWire(writes)).toBe(
      `C sel ${WORLD_CONTEXT_ID} call SayThis "*" "%","%hello world";`
    );
  });

  it('does NOT emit a second frame for the audit §2 injection payload', async () => {
    const { ctx, writes } = createWireContext();
    await sendChatMessage(ctx, INJECTION_PAYLOAD);

    const wire = emittedWire(writes);
    const frames = framesOnTheWire(writes);

    // The whole point: one request in, one frame out. "call Evil" survives as
    // inert text INSIDE the quoted literal — that is the correct outcome; what
    // must not happen is it becoming a sub-command of its own.
    expect(frames).toHaveLength(1);
    expect(frames[0]).toBe(
      `C sel ${WORLD_CONTEXT_ID} call SayThis "*" "%","%hi?? C sel 1 call Evil ?*? ?%pwned"`
    );
    expect(RdoProtocol.parse(frames[0]).member).toBe('SayThis');

    // No forged metacharacter anywhere in the payload region.
    const payloadRegion = wire.slice(wire.indexOf('"%","%'));
    expect(payloadRegion).toBe('"%","%hi?? C sel 1 call Evil ?*? ?%pwned";');

    // Byte level: all five hostile code points became 0x3F '?', and not one
    // 0x22 '"' or 0x3B ';' was forged inside the literal.
    const bytes = Array.from(Buffer.concat(writes));
    expect(bytes.filter((b) => b === 0x3f)).toHaveLength(5);
    expect(bytes.filter((b) => b === 0x22)).toHaveLength(6); // "^" + "%" + "%…"
    expect(bytes.filter((b) => b === 0x3b)).toHaveLength(1); // the frame terminator
  });

  it('proves the payload was genuinely dangerous before the fix', () => {
    // The same string put through the pre-L1 pipeline: escape only, then
    // latin1-truncate. This is the regression oracle — if it ever stops
    // producing an injected second frame, the payload has lost its teeth and
    // the test above proves nothing.
    const escapedOnly = INJECTION_PAYLOAD.replace(/"/g, '""');
    const legacyFrame = `C sel ${WORLD_CONTEXT_ID} call SayThis "*" "%","%${escapedOnly}";`;

    const frames = new RdoFramer().ingest(Buffer.from(legacyFrame, 'latin1'));
    expect(frames).toHaveLength(2);
    expect(frames[1]).toBe('C sel 1 call Evil "*" "%pwned"');
  });

  it('neutralises Ļ and Ĭ frame-control forgery in chat text', async () => {
    const { ctx, writes } = createWireContext();
    await sendChatMessage(ctx, 'aĻbĬc'); // Ļ → ';'  Ĭ → ','

    expect(framesOnTheWire(writes)).toHaveLength(1);
    expect(emittedWire(writes)).toBe(
      `C sel ${WORLD_CONTEXT_ID} call SayThis "*" "%","%a?b?c";`
    );
  });

  it('collapses an emoji to one ? and never writes a NUL byte', async () => {
    const { ctx, writes } = createWireContext();
    await sendChatMessage(ctx, 'gg 😀');

    const bytes = Array.from(Buffer.concat(writes));
    expect(bytes).not.toContain(0x00);
    expect(emittedWire(writes)).toBe(
      `C sel ${WORLD_CONTEXT_ID} call SayThis "*" "%","%gg ?";`
    );
  });

  it('still escapes a literal quote instead of replacing it', async () => {
    const { ctx, writes } = createWireContext();
    await sendChatMessage(ctx, 'say "hi"');

    expect(framesOnTheWire(writes)).toHaveLength(1);
    expect(emittedWire(writes)).toBe(
      `C sel ${WORLD_CONTEXT_ID} call SayThis "*" "%","%say ""hi""";`
    );
  });

  it('keeps a literal semicolon inside the quoted literal (not a terminator)', async () => {
    // Delphi KeyWordPos (RDOUtils.pas:109-121) skips ';' inside quotes, so a
    // plain ASCII semicolon is NOT an injection vector and must not be mangled.
    const { ctx, writes } = createWireContext();
    await sendChatMessage(ctx, 'wait; then go');

    expect(framesOnTheWire(writes)).toHaveLength(1);
    expect(emittedWire(writes)).toBe(
      `C sel ${WORLD_CONTEXT_ID} call SayThis "*" "%","%wait; then go";`
    );
  });

  it('transmits accented Latin-1 chat text byte-identically', async () => {
    const { ctx, writes } = createWireContext();
    await sendChatMessage(ctx, 'déjà vu, señor');

    const bytes = Array.from(Buffer.concat(writes));
    expect(bytes).toContain(0xe9); // é
    expect(bytes).toContain(0xe0); // à
    expect(bytes).toContain(0xf1); // ñ
    expect(emittedWire(writes)).toBe(
      `C sel ${WORLD_CONTEXT_ID} call SayThis "*" "%","%déjà vu, señor";`
    );
  });
});

describe('P-C1 — writeRdoFrame() socket-level safety net', () => {
  it('replaces out-of-range code points on a frame that bypassed RdoValue', () => {
    const { socket, writes } = createRecordingSocket();
    // Simulates any assembly path that did not go through RdoValue.format().
    writeRdoFrame(socket, 'C sel 1 call X "*" "%aĢb";', true);

    expect(Buffer.concat(writes).toString('latin1')).toBe('C sel 1 call X "*" "%a?b";');
    expect(new RdoFramer().ingest(Buffer.concat(writes))).toHaveLength(1);
  });

  it('does not disturb bytes 0x80–0x9F already produced by the codec', () => {
    const { socket, writes } = createRecordingSocket();
    writeRdoFrame(socket, 'C sel 1 call X "*" "%\u0080\u0093\u009F";', true);

    const bytes = Array.from(Buffer.concat(writes));
    expect(bytes).toContain(0x80);
    expect(bytes).toContain(0x93);
    expect(bytes).toContain(0x9f);
  });
});
