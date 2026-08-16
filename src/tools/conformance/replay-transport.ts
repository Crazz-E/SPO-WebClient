/**
 * ReplayTransport — an in-memory socket backed by a recording.
 *
 * This is the "mock" once it is no longer written by hand: the answers come
 * from a recording made by `LiveTransport` (or any gateway wire log), the
 * matching comes from `RdoMock`, and nobody edits a scenario file.
 *
 * Matching order per socket, per frame:
 *   1. the recorded exchange whose request is byte-identical (QueryId aside)
 *      and not yet consumed — the faithful answer to THIS frame;
 *   2. `RdoMock.match()` — the flexible fallback (verb/action/member, nth
 *      occurrence) for frames whose arguments legitimately differ between
 *      runs (fresh object ids, timestamps).
 * A frame with no answer in the recording is left unanswered on purpose: the
 * session's own timeout fires, and the runner records silence — exactly what a
 * live server that stopped talking would produce.
 *
 * Sockets are keyed by the session's purpose (`directory_auth`, `world`, …).
 * The directory auth and query legs run in PARALLEL on two sockets and both
 * start `idof DirectoryServer` / `get RDOOpenSession`; sharing one mock across
 * them would cross their session ids. A recording without socket names
 * (a hand-converted capture) falls back to the wildcard `*` bucket.
 */

import { EventEmitter } from 'events';
import type * as net from 'net';
import { RdoProtocol } from '../../server/rdo';
import { RDO_CONSTANTS } from '../../shared/types';
import { RdoMock } from '../../mock-server/rdo-mock';
import type { RdoExchange, RdoScenario } from '../../mock-server/types/rdo-exchange-types';
import {
  buildRdoScenario,
  parseNdjsonCapture,
  resolveScenarioVariables,
} from '../../mock-server/log-capture-converter';
import type { WireEntry } from '../../mock-server/log-capture-converter';
import { Recorder } from './transport';
import type { RdoTransport } from './transport';

/** Strip the QueryId so two runs of the same frame compare equal. */
export function normalizeRequest(frame: string): string {
  return frame.trim().replace(/;\s*$/, '').replace(/^C\s+\d+\s+/, 'C ');
}

/** Everything one socket needs to answer. */
class SocketRecording {
  readonly mock = new RdoMock();
  private readonly byRequest = new Map<string, RdoExchange[]>();
  private readonly consumed = new Set<string>();

  constructor(scenario: RdoScenario) {
    this.mock.addScenario(scenario);
    for (const ex of scenario.exchanges) {
      if (ex.pushOnly || ex.request === '') continue;
      const key = normalizeRequest(ex.request);
      const list = this.byRequest.get(key) ?? [];
      list.push(ex);
      this.byRequest.set(key, list);
    }
  }

  /** Answer one outgoing frame: `{ response, pushes }`, or null when unrecorded. */
  answer(frame: string): { response: string; pushes: string[] } | null {
    const exact = this.byRequest.get(normalizeRequest(frame))?.find(ex => !this.consumed.has(ex.id));
    if (exact) {
      this.consumed.add(exact.id);
      return { response: exact.response, pushes: exact.pushes ?? [] };
    }
    const flexible = this.mock.match(frame);
    return flexible ? { response: flexible.response, pushes: flexible.pushes } : null;
  }
}

/**
 * Socket-shaped EventEmitter the session cannot tell from `net.Socket`.
 * Answers arrive on the next tick, as bytes, with the caller's QueryId.
 */
export class ReplaySocket extends EventEmitter {
  writable = true;
  readable = true;
  destroyed = false;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly recording: SocketRecording, private readonly recorder: Recorder, private readonly purpose: string) {
    super();
  }

  write(data: string | Buffer, _encoding?: unknown, callback?: () => void): boolean {
    const raw = typeof data === 'string' ? data : data.toString('latin1');
    this.recorder.recordOut(this.purpose, raw);
    const frame = raw.replace(/;\s*$/, '').trim();

    // Only client commands get answers. Our own answers to server-initiated
    // requests (`A<rid> objid=…`) are protocol behaviour, not questions.
    if (frame.startsWith(RDO_CONSTANTS.CMD_PREFIX_CLIENT)) {
      const parsed = RdoProtocol.parse(frame);
      const hit = this.recording.answer(frame);
      if (hit) {
        if (hit.response) this.emitFrame(rewriteRid(hit.response, parsed.rid));
        for (const push of hit.pushes) this.emitFrame(push, 15);
      }
    }
    if (callback) callback();
    return true;
  }

  connect(_port: number, _host: string, callback?: () => void): this {
    if (callback) setImmediate(callback);
    return this;
  }

  end(): void { this.close(); }
  destroy(): this { this.close(); return this; }
  setNoDelay(): this { return this; }
  setKeepAlive(): this { return this; }
  setTimeout(): this { return this; }
  ref(): this { return this; }
  unref(): this { return this; }

  private close(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.destroyed) return;
    this.destroyed = true;
    setImmediate(() => this.emit('close'));
  }

  private emitFrame(frame: string, delayMs = 0): void {
    const wire = frame.endsWith(RDO_CONSTANTS.PACKET_DELIMITER) ? frame : frame + RDO_CONSTANTS.PACKET_DELIMITER;
    const fire = () => {
      if (this.destroyed) return;
      this.recorder.recordIn(this.purpose, frame);
      this.emit('data', Buffer.from(wire, 'latin1'));
    };
    if (delayMs === 0) {
      setImmediate(fire);
    } else {
      this.timers.push(setTimeout(fire, delayMs));
    }
  }
}

function rewriteRid(response: string, rid?: number): string {
  return rid === undefined ? response : response.replace(/^A\d+/, `A${rid}`);
}

/** A recording: one resolved scenario per socket purpose, `*` = any socket. */
export type ScenarioBySocket = Record<string, RdoScenario>;

export class ReplayTransport implements RdoTransport {
  readonly kind = 'replay' as const;
  readonly recorder: Recorder;
  private readonly recordings = new Map<string, SocketRecording>();
  private readonly opened: ReplaySocket[] = [];

  constructor(scenarios: ScenarioBySocket, recorder: Recorder = new Recorder()) {
    this.recorder = recorder;
    for (const [socket, scenario] of Object.entries(scenarios)) {
      this.recordings.set(socket, new SocketRecording(resolveScenarioVariables(scenario)));
    }
  }

  /**
   * Build from NDJSON in the gateway wire-log dialect — a `Recorder.toNdjson()`
   * file or a real gateway debug log. Entries are grouped by socket and each
   * group becomes one scenario via the SAME converter `capture:convert` uses.
   */
  static fromNdjson(ndjson: string, name = 'recording'): ReplayTransport {
    return new ReplayTransport(groupEntriesBySocket(parseNdjsonCapture(ndjson), name));
  }

  /** Purposes this recording can answer. */
  sockets(): string[] {
    return [...this.recordings.keys()];
  }

  socketFactory(purpose: string): net.Socket {
    const recording = this.recordings.get(purpose) ?? this.recordings.get('*');
    if (!recording) {
      throw new Error(
        `Replay recording has no socket "${purpose}" (has: ${this.sockets().join(', ') || 'none'}). ` +
        'Record the flow live first, or add a "*" wildcard scenario.'
      );
    }
    const socket = new ReplaySocket(recording, this.recorder, purpose);
    this.opened.push(socket);
    return socket as unknown as net.Socket;
  }

  close(): void {
    for (const s of this.opened) s.destroy();
    this.opened.length = 0;
  }
}

/** Group wire entries by socket and convert each group into a scenario. */
export function groupEntriesBySocket(entries: WireEntry[], name: string): ScenarioBySocket {
  const groups = new Map<string, WireEntry[]>();
  for (const e of entries) {
    const list = groups.get(e.socket) ?? [];
    list.push(e);
    groups.set(e.socket, list);
  }
  const out: ScenarioBySocket = {};
  for (const [socket, group] of groups) {
    out[socket] = buildRdoScenario(group, { name: `${name}-${socket}` }).scenario;
  }
  return out;
}
