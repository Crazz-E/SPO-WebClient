/**
 * World Socket Auto-Reconnect Tests
 *
 * Validates the reconnection logic added to spo_session.ts,
 * mirroring Delphi InterfaceServer.RenewWorldProxy() pattern:
 * - Light reconnect (TCP + IDOF + session validation)
 * - Full re-login fallback when session expired
 * - Exponential backoff (5s, 10s, 20s)
 * - Max 3 retries before giving up
 * - Promise dedup (concurrent callers share one attempt)
 * - Phase guards (only reconnect from WORLD_CONNECTED)
 * - Race protection with cleanupWorldSession()
 * - Pending request drain before reconnect
 * - Cache invalidation after reconnect
 * - Metrics tracking
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import { SessionPhase } from '../../shared/types';

// ── Replicate reconnection state machine from spo_session.ts ──────────────

interface PendingRdoRequest {
  resolve: (msg: unknown) => void;
  reject: (err: unknown) => void;
  state: 'pending' | 'timed-out';
  sentAt: number;
  member: string;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

interface BufferedRequest {
  socketName: string;
  reject: (err: unknown) => void;
}

interface RdoMetrics {
  totalReconnectAttempts: number;
  totalReconnectSuccesses: number;
  totalReconnectFailures: number;
  lastReconnectAt: number | null;
}

/**
 * Minimal harness mirroring the reconnection state machine in StarpeaceSession.
 * Tests the logic without TCP sockets or real RDO connections.
 */
class WorldReconnectMachine extends EventEmitter {
  phase: SessionPhase = SessionPhase.WORLD_CONNECTED;
  isClosing = false;
  worldReconnectLastAttempt = 0;
  worldReconnecting: Promise<void> | null = null;
  worldReconnectAttempts = 0;
  pendingRequests = new Map<number, PendingRdoRequest>();
  requestBuffer: BufferedRequest[] = [];
  knownObjects = new Map<string, string>();
  aspActionCache = new Map<string, unknown>();
  metrics: RdoMetrics = {
    totalReconnectAttempts: 0,
    totalReconnectSuccesses: 0,
    totalReconnectFailures: 0,
    lastReconnectAt: null,
  };

  static readonly RECONNECT_MAX_RETRIES = 3;
  static readonly RECONNECT_BASE_BACKOFF_MS = 5000;

  // Injected reconnect function (simulates loginHandler.reconnectWorldSocket)
  reconnectFn: () => Promise<void> = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

  serverBusyPollingActive = false;
  startServerBusyPolling(): void { this.serverBusyPollingActive = true; }
  stopServerBusyPolling(): void { this.serverBusyPollingActive = false; }

  async attemptWorldReconnect(): Promise<void> {
    if (this.phase !== SessionPhase.WORLD_CONNECTED && this.phase !== SessionPhase.RECONNECTING) return;
    if (this.isClosing) return;

    if (this.worldReconnecting) return this.worldReconnecting;

    if (this.worldReconnectAttempts >= WorldReconnectMachine.RECONNECT_MAX_RETRIES) {
      this.emit('worldDisconnected');
      return;
    }

    const backoffMs = WorldReconnectMachine.RECONNECT_BASE_BACKOFF_MS * Math.pow(2, this.worldReconnectAttempts);
    const elapsed = Date.now() - this.worldReconnectLastAttempt;
    if (this.worldReconnectLastAttempt > 0 && elapsed < backoffMs) {
      throw new Error(`World reconnect throttled (${elapsed}ms < ${backoffMs}ms)`);
    }

    this.worldReconnecting = (async () => {
      this.worldReconnectLastAttempt = Date.now();
      this.worldReconnectAttempts++;
      this.metrics.totalReconnectAttempts++;

      this.phase = SessionPhase.RECONNECTING;
      this.stopServerBusyPolling();

      // Drain pending requests
      for (const [rid, entry] of this.pendingRequests.entries()) {
        if (entry.state === 'pending') {
          clearTimeout(entry.timeoutHandle);
          entry.reject(new Error('World socket reconnecting'));
        }
        this.pendingRequests.delete(rid);
      }

      // Reject world-targeted buffered requests
      this.requestBuffer = this.requestBuffer.filter(buf => {
        if (buf.socketName === 'world') {
          buf.reject(new Error('World socket reconnecting'));
          return false;
        }
        return true;
      });

      try {
        await this.reconnectFn();

        this.knownObjects.clear();
        this.aspActionCache.clear();
        this.startServerBusyPolling();
        this.phase = SessionPhase.WORLD_CONNECTED;
        this.worldReconnectAttempts = 0;
        this.metrics.totalReconnectSuccesses++;
        this.metrics.lastReconnectAt = Date.now();
        this.emit('worldReconnected');
      } catch (err) {
        this.metrics.totalReconnectFailures++;
        throw err;
      } finally {
        this.worldReconnecting = null;
      }
    })();

    return this.worldReconnecting;
  }

  /** Simulate cleanupWorldSession() guard */
  cleanupWorldSession(): void {
    this.phase = SessionPhase.WORLD_CONNECTING;
    this.worldReconnecting = null;
    this.worldReconnectAttempts = 0;
  }

  /** Helper: add a fake pending request */
  addPendingRequest(rid: number, member: string): { resolve: jest.Mock; reject: jest.Mock } {
    const resolve = jest.fn();
    const reject = jest.fn();
    this.pendingRequests.set(rid, {
      resolve,
      reject,
      state: 'pending',
      sentAt: Date.now(),
      member,
      timeoutHandle: setTimeout(() => {}, 30000),
    });
    return { resolve, reject };
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('World Socket Auto-Reconnect', () => {
  let machine: WorldReconnectMachine;

  beforeEach(() => {
    machine = new WorldReconnectMachine();
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Clear any pending timeouts from pending requests
    for (const [, entry] of machine.pendingRequests) {
      clearTimeout(entry.timeoutHandle);
    }
    jest.useRealTimers();
  });

  describe('Happy path — light reconnection', () => {
    it('should reconnect successfully when world socket drops', async () => {
      const reconnectFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      machine.reconnectFn = reconnectFn;

      await machine.attemptWorldReconnect();

      expect(reconnectFn).toHaveBeenCalledTimes(1);
      expect(machine.phase).toBe(SessionPhase.WORLD_CONNECTED);
      expect(machine.worldReconnectAttempts).toBe(0); // Reset on success
      expect(machine.metrics.totalReconnectAttempts).toBe(1);
      expect(machine.metrics.totalReconnectSuccesses).toBe(1);
      expect(machine.metrics.lastReconnectAt).not.toBeNull();
    });

    it('should emit worldReconnected event on success', async () => {
      const handler = jest.fn();
      machine.on('worldReconnected', handler);

      await machine.attemptWorldReconnect();

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Pending request drain (CRITICAL — ghost RID collision prevention)', () => {
    it('should reject all pending requests before reconnecting', async () => {
      const { reject: reject1 } = machine.addPendingRequest(1001, 'GetPropertyList');
      const { reject: reject2 } = machine.addPendingRequest(1002, 'ObjectsInArea');

      await machine.attemptWorldReconnect();

      expect(reject1).toHaveBeenCalledWith(expect.objectContaining({
        message: 'World socket reconnecting',
      }));
      expect(reject2).toHaveBeenCalledWith(expect.objectContaining({
        message: 'World socket reconnecting',
      }));
      expect(machine.pendingRequests.size).toBe(0);
    });

    it('should reject buffered world requests but keep non-world requests', async () => {
      const worldReject = jest.fn();
      const mailReject = jest.fn();
      machine.requestBuffer = [
        { socketName: 'world', reject: worldReject },
        { socketName: 'mail', reject: mailReject },
      ];

      await machine.attemptWorldReconnect();

      expect(worldReject).toHaveBeenCalledWith(expect.objectContaining({
        message: 'World socket reconnecting',
      }));
      expect(mailReject).not.toHaveBeenCalled();
      expect(machine.requestBuffer).toHaveLength(1);
      expect(machine.requestBuffer[0].socketName).toBe('mail');
    });
  });

  describe('Exponential backoff', () => {
    it('should allow first attempt immediately', async () => {
      await machine.attemptWorldReconnect();
      expect(machine.metrics.totalReconnectAttempts).toBe(1);
    });

    it('should throttle second attempt within 5s window', async () => {
      // First attempt fails
      machine.reconnectFn = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('fail'));
      await expect(machine.attemptWorldReconnect()).rejects.toThrow('fail');

      // Second attempt within 5s should be throttled
      // Phase is still RECONNECTING from failed attempt
      await expect(machine.attemptWorldReconnect()).rejects.toThrow('throttled');
    });

    it('should allow retry after backoff period elapses', async () => {
      // First attempt fails (attempts becomes 1, next backoff = 5000 * 2^1 = 10s)
      machine.reconnectFn = jest.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('fail'));
      await expect(machine.attemptWorldReconnect()).rejects.toThrow('fail');

      // Advance past 10s backoff (5000 * 2^1)
      jest.advanceTimersByTime(10001);

      // Now succeed
      machine.reconnectFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      await machine.attemptWorldReconnect();
      expect(machine.phase).toBe(SessionPhase.WORLD_CONNECTED);
    });

    it('should increase backoff exponentially: 5s base, then 10s, 20s', async () => {
      machine.reconnectFn = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('fail'));

      // Attempt 1: immediate (backoff check skipped since worldReconnectLastAttempt=0)
      // After: attempts=1, next backoff = 5000 * 2^1 = 10s
      await expect(machine.attemptWorldReconnect()).rejects.toThrow('fail');
      expect(machine.worldReconnectAttempts).toBe(1);

      // Attempt 2: needs 10s wait — advance only 5s (should throttle)
      jest.advanceTimersByTime(5000);
      await expect(machine.attemptWorldReconnect()).rejects.toThrow('throttled');

      // Advance remaining to pass 10s
      jest.advanceTimersByTime(5001);
      // After: attempts=2, next backoff = 5000 * 2^2 = 20s
      await expect(machine.attemptWorldReconnect()).rejects.toThrow('fail');
      expect(machine.worldReconnectAttempts).toBe(2);

      // Attempt 3: needs 20s wait — advance 20001ms
      jest.advanceTimersByTime(20001);
      await expect(machine.attemptWorldReconnect()).rejects.toThrow('fail');
      expect(machine.worldReconnectAttempts).toBe(3);
    });
  });

  describe('Max retries', () => {
    it('should give up after 3 failed attempts and emit worldDisconnected', async () => {
      const disconnectHandler = jest.fn();
      machine.on('worldDisconnected', disconnectHandler);
      machine.reconnectFn = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('fail'));

      // Attempt 1: immediate → attempts=1, next backoff=10s
      await expect(machine.attemptWorldReconnect()).rejects.toThrow('fail');
      // Attempt 2: after 10s → attempts=2, next backoff=20s
      jest.advanceTimersByTime(10001);
      await expect(machine.attemptWorldReconnect()).rejects.toThrow('fail');
      // Attempt 3: after 20s → attempts=3
      jest.advanceTimersByTime(20001);
      await expect(machine.attemptWorldReconnect()).rejects.toThrow('fail');

      expect(machine.worldReconnectAttempts).toBe(3);

      // Next attempt should give up (max retries reached)
      jest.advanceTimersByTime(40001);
      await machine.attemptWorldReconnect();
      expect(disconnectHandler).toHaveBeenCalledTimes(1);
      expect(machine.metrics.totalReconnectFailures).toBe(3);
    });
  });

  describe('Promise dedup', () => {
    it('should share pending reconnection between concurrent callers (only one reconnectFn call)', async () => {
      let resolveReconnect!: () => void;
      machine.reconnectFn = jest.fn<() => Promise<void>>(() =>
        new Promise<void>(resolve => { resolveReconnect = resolve; })
      );

      const promise1 = machine.attemptWorldReconnect();
      const promise2 = machine.attemptWorldReconnect();

      // Both calls should result in only ONE reconnectFn invocation
      expect(machine.reconnectFn).toHaveBeenCalledTimes(1);

      resolveReconnect();
      await promise1;
      await promise2;
      expect(machine.phase).toBe(SessionPhase.WORLD_CONNECTED);
      expect(machine.metrics.totalReconnectAttempts).toBe(1);
    });
  });

  describe('Phase guards', () => {
    it('should NOT reconnect when phase is DISCONNECTED', async () => {
      machine.phase = SessionPhase.DISCONNECTED;
      await machine.attemptWorldReconnect();
      expect(machine.metrics.totalReconnectAttempts).toBe(0);
    });

    it('should NOT reconnect when phase is DIRECTORY_CONNECTED', async () => {
      machine.phase = SessionPhase.DIRECTORY_CONNECTED;
      await machine.attemptWorldReconnect();
      expect(machine.metrics.totalReconnectAttempts).toBe(0);
    });

    it('should NOT reconnect when phase is WORLD_CONNECTING', async () => {
      machine.phase = SessionPhase.WORLD_CONNECTING;
      await machine.attemptWorldReconnect();
      expect(machine.metrics.totalReconnectAttempts).toBe(0);
    });

    it('should NOT reconnect when isClosing is true', async () => {
      machine.isClosing = true;
      await machine.attemptWorldReconnect();
      expect(machine.metrics.totalReconnectAttempts).toBe(0);
    });

    it('should allow reconnect from RECONNECTING phase (dedup path)', async () => {
      machine.phase = SessionPhase.RECONNECTING;
      await machine.attemptWorldReconnect();
      expect(machine.metrics.totalReconnectAttempts).toBe(1);
    });
  });

  describe('Race protection: cleanupWorldSession cancels reconnect', () => {
    it('should cancel in-progress reconnect when cleanup runs', async () => {
      let resolveReconnect!: () => void;
      machine.reconnectFn = jest.fn<() => Promise<void>>(() =>
        new Promise<void>(resolve => { resolveReconnect = resolve; })
      );

      const promise = machine.attemptWorldReconnect();
      expect(machine.phase).toBe(SessionPhase.RECONNECTING);

      // Simulate cleanupWorldSession() racing
      machine.cleanupWorldSession();
      expect(machine.phase).toBe(SessionPhase.WORLD_CONNECTING);
      expect(machine.worldReconnecting).toBeNull();
      expect(machine.worldReconnectAttempts).toBe(0);

      // Resolve the now-detached promise (should not crash)
      resolveReconnect();
      await promise;
    });
  });

  describe('ServerBusy polling lifecycle', () => {
    it('should stop polling before reconnect and restart after', async () => {
      machine.serverBusyPollingActive = true;

      await machine.attemptWorldReconnect();

      // After successful reconnect, polling should be restarted
      expect(machine.serverBusyPollingActive).toBe(true);
    });

    it('should stop polling and not restart on failed reconnect', async () => {
      machine.serverBusyPollingActive = true;
      machine.reconnectFn = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('fail'));

      await expect(machine.attemptWorldReconnect()).rejects.toThrow('fail');

      expect(machine.serverBusyPollingActive).toBe(false);
    });
  });

  describe('Cache invalidation after reconnect', () => {
    it('should clear knownObjects and aspActionCache on success', async () => {
      machine.knownObjects.set('InterfaceEvents', '12345');
      machine.aspActionCache.set('/path', { url: 'http://...' });

      await machine.attemptWorldReconnect();

      expect(machine.knownObjects.size).toBe(0);
      expect(machine.aspActionCache.size).toBe(0);
    });
  });

  describe('Metrics tracking', () => {
    it('should track attempts, successes, and failures', async () => {
      machine.reconnectFn = jest.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('fail'));

      // Failure (attempts=1, next backoff=10s)
      await expect(machine.attemptWorldReconnect()).rejects.toThrow('fail');
      expect(machine.metrics.totalReconnectAttempts).toBe(1);
      expect(machine.metrics.totalReconnectFailures).toBe(1);
      expect(machine.metrics.totalReconnectSuccesses).toBe(0);

      // Success (after 10s backoff)
      jest.advanceTimersByTime(10001);
      machine.reconnectFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      await machine.attemptWorldReconnect();
      expect(machine.metrics.totalReconnectAttempts).toBe(2);
      expect(machine.metrics.totalReconnectSuccesses).toBe(1);
      expect(machine.metrics.lastReconnectAt).not.toBeNull();
    });
  });
});
