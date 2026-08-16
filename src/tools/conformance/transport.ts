/**
 * Transports — what fills the socket the real `StarpeaceSession` opens.
 *
 * The session already exposes the seam: `setSocketFactory(purpose => Socket)`.
 * A transport is a socket factory plus a lifecycle. The production session
 * stays untouched; the suite decides whether the socket reaches a TCP peer
 * (`LiveTransport`) or a recording (`ReplayTransport`, see replay-transport.ts).
 *
 * The recorder taps BOTH directions on the live socket and emits the exact
 * NDJSON shape the gateway wire log uses (`RDO>> / RDO>* / RDO<<`), so a
 * conformance recording is a first-class capture: `npm run capture:convert`
 * turns it into a `scenarios/captured/*` file with no new converter.
 */

import * as net from 'net';
import { RdoFramer } from '../../server/rdo';
import { redactSensitiveRdoFrame } from '../../server/rdo-helpers';
import type { WireEntry } from '../../mock-server/log-capture-converter';
import type { TransportKind } from './types';

export interface RdoTransport {
  readonly kind: TransportKind;
  /** Hand this to `session.setSocketFactory()`. */
  socketFactory(purpose: string): net.Socket;
  /** Every frame seen so far, both directions, in wire order. */
  readonly recorder: Recorder;
  /** Release anything the transport holds. Idempotent. */
  close(): void;
}

// ── Recorder ───────────────────────────────────────────────────────────────

const OUT_SYNC = /^C\s+(\d+)\s/;
const IN_ANSWER = /^A(\d+)/;

/** Classify one outgoing frame the way the gateway wire log would. */
export function classifyOutgoing(raw: string): Pick<WireEntry, 'dir' | 'rid'> {
  const m = OUT_SYNC.exec(raw);
  if (m) return { dir: 'out-sync', rid: parseInt(m[1], 10) };
  // Void pushes (`C sel …`) and our answers to server requests (`A<rid> …`)
  // both travel as `RDO>*` in the gateway log.
  return { dir: 'out-void' };
}

/** Classify one incoming frame. */
export function classifyIncoming(raw: string): Pick<WireEntry, 'dir' | 'rid'> {
  const m = IN_ANSWER.exec(raw);
  return m ? { dir: 'in', rid: parseInt(m[1], 10) } : { dir: 'in' };
}

/**
 * Collects wire entries. Credentials are redacted at record time — the file
 * a recording lands in outlives the run and is meant to be committed.
 */
export class Recorder {
  private readonly entries: WireEntry[] = [];
  private readonly clock: () => string;

  constructor(clock: () => string = () => new Date().toISOString()) {
    this.clock = clock;
  }

  recordOut(socket: string, raw: string): void {
    const frame = raw.trim();
    if (!frame) return;
    this.entries.push({ ts: this.clock(), socket, raw: redactSensitiveRdoFrame(frame), ...classifyOutgoing(frame) });
  }

  recordIn(socket: string, raw: string): void {
    const frame = raw.trim();
    if (!frame) return;
    this.entries.push({ ts: this.clock(), socket, raw: frame, ...classifyIncoming(frame) });
  }

  all(): WireEntry[] {
    return [...this.entries];
  }

  /**
   * NDJSON in the gateway wire-log dialect — one object per line, `msg`
   * prefixed `RDO>> ` / `RDO>* ` / `RDO<< ` and the frame under `meta.raw`.
   * `parseNdjsonCapture` (log-capture-converter.ts) reads it back verbatim.
   */
  toNdjson(): string {
    const prefix: Record<WireEntry['dir'], string> = {
      'out-sync': 'RDO>> ',
      'out-void': 'RDO>* ',
      'in': 'RDO<< ',
    };
    return this.entries
      .map(e => JSON.stringify({
        ts: e.ts,
        msg: `${prefix[e.dir]}${e.socket}`,
        meta: e.rid !== undefined ? { rid: e.rid, raw: e.raw } : { raw: e.raw },
      }))
      .join('\n') + (this.entries.length ? '\n' : '');
  }
}

// ── Live ───────────────────────────────────────────────────────────────────

/**
 * Real TCP sockets, tapped. Frames are split with the production `RdoFramer`
 * so the recording holds whole frames, not TCP chunks.
 */
export class LiveTransport implements RdoTransport {
  readonly kind = 'live' as const;
  readonly recorder: Recorder;
  private readonly sockets: net.Socket[] = [];
  private readonly makeSocket: () => net.Socket;

  constructor(recorder: Recorder = new Recorder(), makeSocket: () => net.Socket = () => new net.Socket()) {
    this.recorder = recorder;
    this.makeSocket = makeSocket;
  }

  socketFactory(purpose: string): net.Socket {
    const socket = this.makeSocket();
    this.sockets.push(socket);
    tapSocket(socket, purpose, this.recorder);
    return socket;
  }

  close(): void {
    for (const s of this.sockets) {
      if (!s.destroyed) s.destroy();
    }
    this.sockets.length = 0;
  }
}

/** Marker on the wrapped `write`, so the tap can tell whether it is still installed. */
const TAPPED = Symbol('rdo-conformance-tap');

/**
 * Attach the recorder to a socket: outgoing via a `write` wrapper (frames are
 * written whole by `writeRdoFrame`), incoming via a dedicated framer on `data`.
 *
 * `net.Socket.prototype.connect` RESETS an overridden instance `write` back to
 * the prototype's (Node's net.js does so on every connect), so an override
 * installed at creation is silently gone by the time the session writes its
 * first frame — the 2026-08-16 live run recorded 64 incoming frames and zero
 * outgoing ones that way. The tap therefore re-installs itself on `connect`,
 * which fires before the session's own connect callback (listeners run in
 * registration order and the factory registers first).
 *
 * Exported for tests. Wraps the instance method only — `net.Socket.prototype`
 * is left alone.
 */
export function tapSocket(socket: net.Socket, purpose: string, recorder: Recorder): void {
  const install = (): void => {
    const originalWrite = socket.write.bind(socket);
    const tappedWrite = ((chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
      const raw = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('latin1');
      recorder.recordOut(purpose, raw);
      return (originalWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof socket.write & { [TAPPED]?: true };
    tappedWrite[TAPPED] = true;
    socket.write = tappedWrite;
  };
  install();
  socket.on('connect', () => {
    if (!(socket.write as { [TAPPED]?: true })[TAPPED]) install();
  });

  const framer = new RdoFramer();
  socket.on('data', (chunk: Buffer) => {
    for (const frame of framer.ingest(chunk)) {
      recorder.recordIn(purpose, frame);
    }
  });
}
