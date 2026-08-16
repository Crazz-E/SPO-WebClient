/**
 * WireView — what a scenario step sees of the wire it just produced.
 *
 * Scenario steps drive the session through its public methods
 * (`loadMapArea`, `focusBuilding`, `getBuildingBasicDetails`…), which emit
 * several frames each. The oracle wants the reply to ONE of them, and the
 * report wants all of them. Both come from the transport recorder: a step
 * takes a `mark()` before it starts and reads what was recorded since.
 */

import { RdoProtocol } from '../../server/rdo';
import type { Recorder } from './transport';
import type { WireEntry } from '../../mock-server/log-capture-converter';

export interface WireExchange {
  member: string;
  rid?: number;
  request: string;
  /** Reply payload (after `A<rid> `), or null when no answer was recorded. */
  reply: string | null;
}

/** Member of an outgoing frame; SET frames carry the value inside `member`. */
export function memberOf(frame: string): string | null {
  try {
    const parsed = RdoProtocol.parse(frame.replace(/;\s*$/, ''));
    if (parsed.verb === 'idof') return `idof:${parsed.targetId ?? ''}`;
    return parsed.member ? parsed.member.split('=')[0] : null;
  } catch {
    return null;
  }
}

/** Payload of an incoming answer frame `A<rid> …` (delimiter already stripped by the framer). */
export function payloadOf(answer: string): string {
  return answer.replace(/^A\d+\s?/, '').replace(/;\s*$/, '');
}

export class WireView {
  constructor(private readonly recorder: Recorder) {}

  /** Position in the recording; hand it back to `since()`. */
  mark(): number {
    return this.recorder.all().length;
  }

  since(mark: number): WireEntry[] {
    return this.recorder.all().slice(mark);
  }

  /** Raw frames since the mark, both directions, in wire order. */
  frames(mark: number): string[] {
    return this.since(mark).map(e => `${e.dir === 'in' ? '<< ' : '>> '}${e.raw}`);
  }

  /** Request/reply pairs since the mark, optionally filtered by member. */
  exchanges(mark: number, member?: string): WireExchange[] {
    const entries = this.since(mark);
    const out: WireExchange[] = [];
    for (const e of entries) {
      if (e.dir === 'in') continue;
      const m = memberOf(e.raw);
      if (!m) continue;
      if (member && m !== member) continue;
      let reply: string | null = null;
      if (e.rid !== undefined) {
        const answer = entries.find(a => a.dir === 'in' && a.rid === e.rid && /^A\d+/.test(a.raw));
        reply = answer ? payloadOf(answer.raw) : null;
      }
      out.push({ member: m, rid: e.rid, request: e.raw.replace(/;\s*$/, ''), reply });
    }
    return out;
  }

  /** Reply to the LAST request of `member` since the mark; null when none or unanswered. */
  lastReply(mark: number, member: string): string | null {
    const ex = this.exchanges(mark, member);
    return ex.length ? ex[ex.length - 1].reply : null;
  }

  /** Server-initiated frames (`C sel … call X "*" …`) since the mark. */
  pushes(mark: number): string[] {
    return this.since(mark).filter(e => e.dir === 'in' && /^C\s/.test(e.raw)).map(e => e.raw);
  }

  /** Member names of the pushes since the mark. */
  pushMembers(mark: number): string[] {
    return this.pushes(mark).map(memberOf).filter((m): m is string => m !== null);
  }
}
