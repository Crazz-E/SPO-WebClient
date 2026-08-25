import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MAX_JOURNAL_ENTRIES, MAX_WS_PAYLOAD_BYTES, MAX_TEXT_LENGTH } from '../../shared/bug-report-schema';
import { reportJournal, JOURNAL_WINDOW_MS } from './journal';

beforeEach(() => {
  reportJournal.disarm();
  reportJournal.reset();
});

afterEach(() => {
  reportJournal.disarm();
  reportJournal.reset();
});

describe('the journal only records once armed', () => {
  it('records nothing while disarmed — the taps in client.ts cost nothing in production', () => {
    reportJournal.record('ws-out', { type: 'REQ_SET_TAX' });
    expect(reportJournal.snapshot()).toEqual([]);
    expect(reportJournal.isArmed).toBe(false);
  });

  it('records once armed', () => {
    reportJournal.arm();
    reportJournal.record('ws-out', { type: 'REQ_SET_TAX' });
    expect(reportJournal.snapshot()).toHaveLength(1);
    expect(reportJournal.isArmed).toBe(true);
  });

  it('arming twice does not double every tap', () => {
    reportJournal.arm();
    reportJournal.arm();
    console.warn('once');
    expect(reportJournal.snapshot().filter(e => e.t === 'console')).toHaveLength(1);
  });

  it('disarming twice is harmless', () => {
    reportJournal.arm();
    reportJournal.disarm();
    expect(() => reportJournal.disarm()).not.toThrow();
  });
});

describe('the ring buffer', () => {
  it('keeps the last 400 entries and drops the oldest', () => {
    reportJournal.arm();
    for (let i = 0; i < MAX_JOURNAL_ENTRIES + 50; i++) {
      reportJournal.record('ws-out', { type: `MSG_${i}` });
    }
    const snapshot = reportJournal.snapshot();
    expect(snapshot).toHaveLength(MAX_JOURNAL_ENTRIES);
    expect(snapshot[0]).toMatchObject({ msgType: 'MSG_50' });
    expect(snapshot[snapshot.length - 1]).toMatchObject({ msgType: `MSG_${MAX_JOURNAL_ENTRIES + 49}` });
  });

  it('prunes to the last 60 seconds', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T10:00:00.000Z'));
    reportJournal.arm();
    reportJournal.record('ws-out', { type: 'OLD' });
    jest.setSystemTime(new Date('2026-08-25T10:01:30.000Z'));
    reportJournal.record('ws-out', { type: 'RECENT' });

    expect(reportJournal.snapshot().map(e => (e as { msgType: string }).msgType)).toEqual(['RECENT']);
    // The window is the only thing that dropped it — asked about a "now" exactly 60 s after the
    // old entry, it is back, which pins the boundary as inclusive.
    expect(reportJournal.snapshot(Date.parse('2026-08-25T10:00:00.000Z') + JOURNAL_WINDOW_MS))
      .toHaveLength(2);
    jest.useRealTimers();
  });

  it('returns a copy — the taps keep firing while a report is serialized', () => {
    reportJournal.arm();
    reportJournal.record('ws-out', { type: 'A' });
    const first = reportJournal.snapshot();
    (first[0] as { msgType: string }).msgType = 'TAMPERED';
    reportJournal.record('ws-out', { type: 'B' });

    expect(reportJournal.snapshot()[0]).toMatchObject({ msgType: 'A' });
    expect(first).toHaveLength(1);
  });

  it('reset drops the entries but keeps the taps', () => {
    reportJournal.arm();
    reportJournal.record('ws-out', { type: 'A' });
    reportJournal.reset();
    reportJournal.record('ws-out', { type: 'B' });
    expect(reportJournal.snapshot()).toHaveLength(1);
  });
});

describe('websocket entries', () => {
  it('carries the message verbatim, with its type', () => {
    reportJournal.arm();
    const msg = { type: 'REQ_SET_TAX', targetId: 42, value: 12 };
    reportJournal.record('ws-in', msg);

    expect(reportJournal.snapshot()[0]).toMatchObject({ t: 'ws-in', msgType: 'REQ_SET_TAX', payload: msg });
  });

  it('names an untyped message rather than dropping it', () => {
    reportJournal.arm();
    reportJournal.record('ws-out', {});
    expect(reportJournal.snapshot()[0]).toMatchObject({ msgType: '?' });
  });

  it('cuts a payload past 16 KB and says so', () => {
    reportJournal.arm();
    reportJournal.record('ws-out', { type: 'BIG', blob: 'x'.repeat(MAX_WS_PAYLOAD_BYTES) });

    const entry = reportJournal.snapshot()[0] as { payload: unknown; truncated?: boolean };
    expect(entry.truncated).toBe(true);
    expect(typeof entry.payload).toBe('string');
    expect((entry.payload as string).length).toBeLessThanOrEqual(MAX_WS_PAYLOAD_BYTES);
    expect(entry.payload as string).toContain('[cut]');
  });

  it('keeps an entry whose payload cannot be serialized at all', () => {
    reportJournal.arm();
    const cyclic: Record<string, unknown> = { type: 'CYCLE' };
    cyclic.self = cyclic;
    reportJournal.record('ws-out', cyclic as { type: string });

    expect(reportJournal.snapshot()[0]).toMatchObject({
      msgType: 'CYCLE', payload: '[unserializable]', truncated: true,
    });
  });

  it('caps an absurdly long message type', () => {
    reportJournal.arm();
    reportJournal.record('ws-out', { type: 'x'.repeat(MAX_TEXT_LENGTH + 100) });
    expect((reportJournal.snapshot()[0] as { msgType: string }).msgType).toHaveLength(MAX_TEXT_LENGTH);
  });

  it('truncated entries with escaping-heavy payloads pass validation', () => {
    reportJournal.arm();
    // Payload with many quotes and backslashes — worst-case for JSON.stringify escaping.
    // Use a large base payload and pack it with quote/backslash chars to inflame escaping.
    const heavyEscaping = '"\\'.repeat(5000);
    reportJournal.record('ws-out', { type: 'BIG', data: heavyEscaping });

    const entry = reportJournal.snapshot()[0] as { payload: unknown; truncated?: boolean };
    expect(entry.truncated).toBe(true);

    // The validator's check: JSON.stringify(payload ?? null).length <= MAX_WS_PAYLOAD_BYTES.
    const reserializedLength = JSON.stringify(entry.payload ?? null).length;
    expect(reserializedLength).toBeLessThanOrEqual(MAX_WS_PAYLOAD_BYTES);
  });
});

describe('the console wrap', () => {
  it('records error and warn, and calls through', () => {
    const originalError = console.error;
    const seen: unknown[][] = [];
    console.error = (...args: unknown[]) => { seen.push(args); };

    reportJournal.arm();
    console.error('boom', 42);
    console.warn('careful');
    reportJournal.disarm();

    expect(seen).toEqual([['boom', 42]]);
    console.error = originalError;

    const entries = reportJournal.snapshot().filter(e => e.t === 'console');
    expect(entries).toEqual([
      expect.objectContaining({ level: 'error', message: 'boom 42' }),
      expect.objectContaining({ level: 'warn', message: 'careful' }),
    ]);
  });

  it('puts the original console back on disarm', () => {
    const before = console.error;
    reportJournal.arm();
    expect(console.error).not.toBe(before);
    reportJournal.disarm();
    expect(console.error).toBe(before);
  });
});

describe('the surface watch', () => {
  function stackSource() {
    let stack: Array<{ kind: string }> = [];
    let listener: (() => void) | null = null;
    return {
      subscribe: (l: () => void) => { listener = l; return () => { listener = null; }; },
      read: () => stack,
      set(next: Array<{ kind: string }>) { stack = next; listener?.(); },
      get subscribed() { return listener !== null; },
    };
  }

  it('names a push, a pop, a root swap and a clear', () => {
    const source = stackSource();
    reportJournal.arm(source.subscribe, source.read);

    source.set([{ kind: 'politics' }]);
    source.set([{ kind: 'politics' }, { kind: 'building' }]);
    source.set([{ kind: 'politics' }]);
    source.set([{ kind: 'mail' }]);
    source.set([]);

    expect(reportJournal.snapshot().filter(e => e.t === 'surface')).toEqual([
      expect.objectContaining({ action: 'push', surface: 'politics' }),
      expect.objectContaining({ action: 'push', surface: 'building' }),
      expect.objectContaining({ action: 'pop', surface: 'politics' }),
      expect.objectContaining({ action: 'root', surface: 'mail' }),
      expect.objectContaining({ action: 'clear', surface: '' }),
    ]);
  });

  it('says nothing when the store fires without the stack changing', () => {
    const source = stackSource();
    reportJournal.arm(source.subscribe, source.read);

    source.set(source.read());              // same reference — an unrelated store field moved
    const same = [{ kind: 'politics' }];
    source.set(same);
    source.set([{ kind: 'politics' }]);     // new array, same top, same depth

    expect(reportJournal.snapshot().filter(e => e.t === 'surface')).toHaveLength(1);
  });

  it('unsubscribes on disarm', () => {
    const source = stackSource();
    reportJournal.arm(source.subscribe, source.read);
    expect(source.subscribed).toBe(true);
    reportJournal.disarm();
    expect(source.subscribed).toBe(false);
  });

  it('runs without a stack source at all', () => {
    expect(() => reportJournal.arm()).not.toThrow();
  });
});
