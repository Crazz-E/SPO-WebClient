/**
 * Timeout State Machine Tests — validates the PendingRdoRequest lifecycle:
 *
 * 1. 'pending' → response arrives → resolved (normal path)
 * 2. 'pending' → timeout fires → 'timed-out' → late response → logged (not unmatched)
 * 3. 'pending' → timeout fires → 'timed-out' → GC sweep → orphaned
 * 4. Metrics track all transitions correctly
 *
 * These tests exercise the same logic as spo_session.ts but in isolation,
 * using the same data structures and state transitions.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TimeoutCategory, TIMEOUT_CONFIG } from '../../../shared/timeout-categories';

// ── Replicate the PendingRdoRequest interface from spo_session.ts ───────────

interface PendingRdoRequest {
  resolve: (msg: unknown) => void;
  reject: (err: unknown) => void;
  state: 'pending' | 'timed-out';
  sentAt: number;
  member: string;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

interface RdoMetrics {
  totalSent: number;
  totalResolved: number;
  totalTimedOut: number;
  totalLateResponses: number;
  totalOrphaned: number;
}

// ── Minimal harness that mirrors spo_session.ts logic ───────────────────────

class TimeoutStateMachine {
  readonly pendingRequests = new Map<number, PendingRdoRequest>();
  readonly metrics: RdoMetrics = {
    totalSent: 0,
    totalResolved: 0,
    totalTimedOut: 0,
    totalLateResponses: 0,
    totalOrphaned: 0,
  };
  private ridCounter = 1000;

  /** Mirrors executeRdoRequest — creates entry, sets timeout */
  sendRequest(member: string, timeoutMs: number): { rid: number; promise: Promise<unknown> } {
    const rid = this.ridCounter++;
    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => { resolve = res; reject = rej; });

    const timeoutHandle = setTimeout(() => {
      const entry = this.pendingRequests.get(rid);
      if (entry && entry.state === 'pending') {
        entry.state = 'timed-out';
        this.metrics.totalTimedOut++;
        reject(new Error(`Request timeout: ${member}`));
      }
    }, timeoutMs);

    this.pendingRequests.set(rid, {
      resolve, reject,
      state: 'pending',
      sentAt: Date.now(),
      member,
      timeoutHandle,
    });
    this.metrics.totalSent++;

    return { rid, promise };
  }

  /** Mirrors processSingleCommand response handling */
  receiveResponse(rid: number, payload: unknown): 'resolved' | 'late' | 'orphaned' {
    const entry = this.pendingRequests.get(rid);
    if (entry) {
      this.pendingRequests.delete(rid);
      clearTimeout(entry.timeoutHandle);
      if (entry.state === 'pending') {
        this.metrics.totalResolved++;
        entry.resolve(payload);
        return 'resolved';
      } else {
        this.metrics.totalLateResponses++;
        return 'late';
      }
    } else {
      this.metrics.totalOrphaned++;
      return 'orphaned';
    }
  }

  /** Mirrors GC sweep */
  gcSweep(graceMs: number): number {
    const now = Date.now();
    let swept = 0;
    for (const [rid, entry] of this.pendingRequests.entries()) {
      if (entry.state === 'timed-out' && (now - entry.sentAt) > graceMs) {
        this.pendingRequests.delete(rid);
        this.metrics.totalOrphaned++;
        swept++;
      }
    }
    return swept;
  }

  destroy(): void {
    for (const [, entry] of this.pendingRequests.entries()) {
      clearTimeout(entry.timeoutHandle);
    }
    this.pendingRequests.clear();
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Timeout State Machine', () => {
  let sm: TimeoutStateMachine;

  beforeEach(() => {
    jest.useFakeTimers();
    sm = new TimeoutStateMachine();
  });

  afterEach(() => {
    sm.destroy();
    jest.useRealTimers();
  });

  describe('Normal path (response before timeout)', () => {
    it('resolves promise and increments totalResolved', async () => {
      const { rid, promise } = sm.sendRequest('TestCall', 10_000);

      expect(sm.pendingRequests.size).toBe(1);
      expect(sm.pendingRequests.get(rid)!.state).toBe('pending');

      const result = sm.receiveResponse(rid, { data: 'ok' });

      expect(result).toBe('resolved');
      expect(sm.pendingRequests.size).toBe(0);
      expect(sm.metrics.totalSent).toBe(1);
      expect(sm.metrics.totalResolved).toBe(1);
      expect(sm.metrics.totalTimedOut).toBe(0);
      await expect(promise).resolves.toEqual({ data: 'ok' });
    });
  });

  describe('Timeout path (no response in time)', () => {
    it('transitions to timed-out state without deleting entry', async () => {
      const { rid, promise } = sm.sendRequest('SlowCall', 5_000);
      // Suppress unhandled rejection
      promise.catch(() => {});

      jest.advanceTimersByTime(5_000);

      // Entry still in map, but state changed
      expect(sm.pendingRequests.size).toBe(1);
      expect(sm.pendingRequests.get(rid)!.state).toBe('timed-out');
      expect(sm.metrics.totalTimedOut).toBe(1);
    });

    it('rejects promise with timeout error', async () => {
      const { promise } = sm.sendRequest('SlowCall', 5_000);

      jest.advanceTimersByTime(5_000);

      await expect(promise).rejects.toThrow('Request timeout: SlowCall');
    });
  });

  describe('Late response path (response after timeout)', () => {
    it('detects late response and increments totalLateResponses', async () => {
      const { rid, promise } = sm.sendRequest('SlowCall', 5_000);

      // Timeout fires
      jest.advanceTimersByTime(5_000);
      await expect(promise).rejects.toThrow('Request timeout');

      // Late response arrives
      const result = sm.receiveResponse(rid, { data: 'late' });

      expect(result).toBe('late');
      expect(sm.pendingRequests.size).toBe(0);
      expect(sm.metrics.totalLateResponses).toBe(1);
      expect(sm.metrics.totalTimedOut).toBe(1);
      // totalResolved should NOT increment for late responses
      expect(sm.metrics.totalResolved).toBe(0);
    });
  });

  describe('Orphaned response path (response after GC sweep)', () => {
    it('returns orphaned when RID not in map', () => {
      const result = sm.receiveResponse(9999, { data: 'unknown' });

      expect(result).toBe('orphaned');
      expect(sm.metrics.totalOrphaned).toBe(1);
    });

    it('returns orphaned when GC sweep ran before late response arrived', () => {
      const { rid, promise } = sm.sendRequest('SlowCall', 100);
      promise.catch(() => {});

      // Timeout fires
      jest.advanceTimersByTime(100);
      expect(sm.pendingRequests.get(rid)!.state).toBe('timed-out');

      // GC sweep past grace period removes the entry
      jest.advanceTimersByTime(90_001);
      sm.gcSweep(90_000);
      expect(sm.pendingRequests.has(rid)).toBe(false);

      // Late response arrives after GC — orphaned, not late
      const result = sm.receiveResponse(rid, { data: 'late' });
      expect(result).toBe('orphaned');
      expect(sm.metrics.totalOrphaned).toBe(2); // 1 from GC sweep + 1 from orphaned response
      expect(sm.metrics.totalLateResponses).toBe(0);
    });
  });

  describe('GC Sweep', () => {
    it('removes timed-out entries older than grace period', () => {
      const { rid, promise } = sm.sendRequest('OldCall', 100);
      promise.catch(() => {});

      // Timeout fires at 100ms
      jest.advanceTimersByTime(100);
      expect(sm.pendingRequests.get(rid)!.state).toBe('timed-out');

      // Advance past grace period (90s)
      jest.advanceTimersByTime(90_001);

      const swept = sm.gcSweep(90_000);
      expect(swept).toBe(1);
      expect(sm.pendingRequests.size).toBe(0);
      expect(sm.metrics.totalOrphaned).toBe(1);
    });

    it('does NOT remove timed-out entries within grace period', () => {
      const { promise } = sm.sendRequest('RecentCall', 100);
      promise.catch(() => {});

      jest.advanceTimersByTime(100);
      // Only 100ms elapsed — well within 90s grace

      const swept = sm.gcSweep(90_000);
      expect(swept).toBe(0);
      expect(sm.pendingRequests.size).toBe(1);
    });

    it('does NOT remove pending entries (only timed-out)', () => {
      const { promise } = sm.sendRequest('ActiveCall', 60_000);
      promise.catch(() => {});

      // No timeout yet — entry still pending
      jest.advanceTimersByTime(1_000);

      const swept = sm.gcSweep(90_000);
      expect(swept).toBe(0);
      expect(sm.pendingRequests.size).toBe(1);
    });

    it('handles mixed pending and timed-out entries', () => {
      const old = sm.sendRequest('OldCall', 100);
      old.promise.catch(() => {});
      const active = sm.sendRequest('ActiveCall', 120_000);
      active.promise.catch(() => {});

      // Only the first times out
      jest.advanceTimersByTime(100);
      expect(sm.pendingRequests.size).toBe(2);

      // Advance past grace for the first
      jest.advanceTimersByTime(90_001);

      const swept = sm.gcSweep(90_000);
      expect(swept).toBe(1);
      expect(sm.pendingRequests.size).toBe(1); // ActiveCall still pending
    });
  });

  describe('Multiple requests', () => {
    it('tracks independent requests with independent timeouts', async () => {
      const fast = sm.sendRequest('FastCall', 5_000);
      const slow = sm.sendRequest('SlowCall', 30_000);
      slow.promise.catch(() => {}); // suppress if slow also times out

      // Fast times out
      jest.advanceTimersByTime(5_000);
      await expect(fast.promise).rejects.toThrow('Request timeout: FastCall');

      // Slow still pending
      expect(sm.pendingRequests.get(slow.rid)!.state).toBe('pending');

      // Slow resolves normally
      sm.receiveResponse(slow.rid, { data: 'ok' });

      expect(sm.metrics.totalTimedOut).toBe(1);
      expect(sm.metrics.totalResolved).toBe(1);
    });
  });

  describe('destroy() cleanup', () => {
    it('clears all entries and prevents timeout callbacks from firing', () => {
      const req1 = sm.sendRequest('Call1', 60_000);
      const req2 = sm.sendRequest('Call2', 60_000);
      req1.promise.catch(() => {});
      req2.promise.catch(() => {});

      expect(sm.pendingRequests.size).toBe(2);

      sm.destroy();
      expect(sm.pendingRequests.size).toBe(0);

      // Advance past timeout — no unhandled rejection should occur
      jest.advanceTimersByTime(120_000);
      expect(sm.metrics.totalTimedOut).toBe(0);
    });
  });

  describe('Promise settlement safety', () => {
    it('resolve after timeout is a no-op (Promise spec guarantees single settlement)', async () => {
      const { rid, promise } = sm.sendRequest('TestCall', 100);

      // Timeout rejects
      jest.advanceTimersByTime(100);
      await expect(promise).rejects.toThrow('Request timeout: TestCall');

      // Late response tries to resolve — entry still in map as timed-out
      const result = sm.receiveResponse(rid, { data: 'too late' });
      expect(result).toBe('late');

      // Promise remains rejected (JS Promises settle once)
      await expect(promise).rejects.toThrow('Request timeout: TestCall');
    });

    it('timeout after response is harmless (entry already removed)', async () => {
      const { rid, promise } = sm.sendRequest('FastCall', 5_000);

      // Response arrives before timeout
      sm.receiveResponse(rid, { data: 'ok' });
      await expect(promise).resolves.toEqual({ data: 'ok' });

      // Timeout fires but entry is gone — no effect
      jest.advanceTimersByTime(5_000);
      expect(sm.metrics.totalTimedOut).toBe(0);
      expect(sm.metrics.totalResolved).toBe(1);
    });
  });
});

describe('TimeoutCategory integration', () => {
  it('SLOW category timeout matches legacy Delphi 60s default', () => {
    expect(TIMEOUT_CONFIG[TimeoutCategory.SLOW].rdoMs).toBe(60_000);
  });

  it('NORMAL category provides 3x the old 10s default', () => {
    expect(TIMEOUT_CONFIG[TimeoutCategory.NORMAL].rdoMs).toBe(30_000);
  });

  it('wsMs always exceeds rdoMs (server fires first)', () => {
    for (const cat of [TimeoutCategory.FAST, TimeoutCategory.NORMAL, TimeoutCategory.SLOW]) {
      expect(TIMEOUT_CONFIG[cat].wsMs).toBeGreaterThan(TIMEOUT_CONFIG[cat].rdoMs);
    }
  });
});
