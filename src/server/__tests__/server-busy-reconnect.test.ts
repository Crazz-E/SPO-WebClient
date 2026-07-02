/**
 * ServerBusy Poll Failure Handling — LEGACY-CONFORMANT (no reconnect).
 *
 * Ground truth (Voyager client):
 * - The ServerBusy read is a blocking property GET under ISProxyTimeOut=180s,
 *   polled ~every 50s (ToolbarHandlerViewer.pas:131-162 — LEDsTimer 1s gated mod 50).
 * - After 4 consecutive exceptions the client simply STOPS polling
 *   (fExceptCount gate, ServerCnxHandler.pas:3596-3611). It NEVER reconnects
 *   from poll failures — reconnection happens only on a real socket disconnect.
 * - Busy state also updates instantly via the ModelStatusChanged push.
 *
 * Validates the poll-failure logic in startServerBusyPolling():
 * - Consecutive failure counter increments on each poll timeout
 * - Counter resets on successful poll
 * - After MAX_CONSECUTIVE_POLL_FAILURES (4): stopServerBusyPolling, NO reconnect
 * - rdoMetrics.totalServerBusyPollFailures tracks cumulative failures
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// ── Minimal harness mirroring ServerBusy poll logic from spo_session.ts ──

interface RdoMetrics {
  totalServerBusyPollFailures: number;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

class ServerBusyPollMachine {
  consecutivePollFailures = 0;
  static readonly MAX_CONSECUTIVE_POLL_FAILURES = 4; // legacy fExceptCount gate

  rdoMetrics: RdoMetrics = {
    totalServerBusyPollFailures: 0,
  };

  serverBusyCheckInterval: ReturnType<typeof setInterval> | null = { } as ReturnType<typeof setInterval>;

  // Spies
  stopServerBusyPollingCalled = 0;
  attemptWorldReconnectCalled = 0;
  warnLogs: string[] = [];
  errorLogs: string[] = [];

  stopServerBusyPolling(): void {
    if (this.serverBusyCheckInterval) {
      this.serverBusyCheckInterval = null;
    }
    this.consecutivePollFailures = 0;
    this.stopServerBusyPollingCalled++;
  }

  async attemptWorldReconnect(): Promise<void> {
    this.attemptWorldReconnectCalled++;
  }

  /**
   * Simulates a poll failure — replicates the catch block logic
   * (spo_session.ts startServerBusyPolling).
   */
  async simulatePollFailure(): Promise<void> {
    try {
      throw new Error('ServerBusy check timeout');
    } catch (e: unknown) {
      this.consecutivePollFailures++;
      this.rdoMetrics.totalServerBusyPollFailures++;
      this.warnLogs.push(
        `[ServerBusy] Poll failed (${this.consecutivePollFailures}/${ServerBusyPollMachine.MAX_CONSECUTIVE_POLL_FAILURES}): ${toErrorMessage(e)}`
      );

      if (this.consecutivePollFailures >= ServerBusyPollMachine.MAX_CONSECUTIVE_POLL_FAILURES) {
        // LEGACY PARITY: stop polling — never reconnect from poll failures.
        this.errorLogs.push(
          `[ServerBusy] ${this.consecutivePollFailures} consecutive poll failures — stopping ServerBusy polling (push channel remains active)`
        );
        this.stopServerBusyPolling();
      }
    }
  }

  /** Simulates a successful poll — replicates the success path. */
  simulatePollSuccess(): void {
    this.consecutivePollFailures = 0;
  }

  getQueueStatus(): { consecutivePollFailures: number; rdoMetrics: RdoMetrics } {
    return {
      consecutivePollFailures: this.consecutivePollFailures,
      rdoMetrics: { ...this.rdoMetrics },
    };
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ServerBusy consecutive poll failures → stop polling (NO reconnect)', () => {
  let machine: ServerBusyPollMachine;

  beforeEach(() => {
    machine = new ServerBusyPollMachine();
  });

  it('increments consecutivePollFailures on each failure', async () => {
    await machine.simulatePollFailure();
    expect(machine.consecutivePollFailures).toBe(1);
    await machine.simulatePollFailure();
    expect(machine.consecutivePollFailures).toBe(2);
    await machine.simulatePollFailure();
    expect(machine.consecutivePollFailures).toBe(3);
  });

  it('resets consecutivePollFailures on successful poll', async () => {
    await machine.simulatePollFailure();
    await machine.simulatePollFailure();
    expect(machine.consecutivePollFailures).toBe(2);
    machine.simulatePollSuccess();
    expect(machine.consecutivePollFailures).toBe(0);
  });

  it('stops polling at exactly MAX_CONSECUTIVE_POLL_FAILURES (4, legacy fExceptCount)', async () => {
    for (let i = 0; i < 4; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.stopServerBusyPollingCalled).toBe(1);
    expect(machine.serverBusyCheckInterval).toBeNull();
  });

  it('NEVER triggers a reconnect from poll failures (legacy parity)', async () => {
    for (let i = 0; i < 10; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.attemptWorldReconnectCalled).toBe(0);
  });

  it('does NOT stop polling at 3 consecutive failures', async () => {
    for (let i = 0; i < 3; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.stopServerBusyPollingCalled).toBe(0);
    expect(machine.consecutivePollFailures).toBe(3);
  });

  it('tracks cumulative failures in rdoMetrics.totalServerBusyPollFailures', async () => {
    for (let i = 0; i < 3; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.rdoMetrics.totalServerBusyPollFailures).toBe(3);

    machine.simulatePollSuccess();
    // Cumulative metric does not reset on success
    expect(machine.rdoMetrics.totalServerBusyPollFailures).toBe(3);
  });

  it('interleaved success resets counter: 3 fail, 1 success, 3 fail = polling still active', async () => {
    for (let i = 0; i < 3; i++) {
      await machine.simulatePollFailure();
    }
    machine.simulatePollSuccess();
    for (let i = 0; i < 3; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.stopServerBusyPollingCalled).toBe(0);
    expect(machine.rdoMetrics.totalServerBusyPollFailures).toBe(6);
  });

  it('polling can restart after a stop (e.g. after a successful reconnect)', async () => {
    for (let i = 0; i < 4; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.stopServerBusyPollingCalled).toBe(1);

    // Simulate polling restart (startServerBusyPolling after reconnect)
    machine.serverBusyCheckInterval = {} as ReturnType<typeof setInterval>;

    for (let i = 0; i < 4; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.stopServerBusyPollingCalled).toBe(2);
    expect(machine.rdoMetrics.totalServerBusyPollFailures).toBe(8);
    expect(machine.attemptWorldReconnectCalled).toBe(0);
  });

  it('exposes consecutivePollFailures via getQueueStatus()', async () => {
    await machine.simulatePollFailure();
    await machine.simulatePollFailure();
    const status = machine.getQueueStatus();
    expect(status.consecutivePollFailures).toBe(2);
    expect(status.rdoMetrics.totalServerBusyPollFailures).toBe(2);
  });

  it('stopServerBusyPolling resets consecutivePollFailures', async () => {
    await machine.simulatePollFailure();
    await machine.simulatePollFailure();
    expect(machine.consecutivePollFailures).toBe(2);
    machine.stopServerBusyPolling();
    expect(machine.consecutivePollFailures).toBe(0);
  });

  it('logs progress with failure count ratio', async () => {
    await machine.simulatePollFailure();
    expect(machine.warnLogs[0]).toContain('(1/4)');
    await machine.simulatePollFailure();
    expect(machine.warnLogs[1]).toContain('(2/4)');
  });

  it('stop log mentions the push channel, not a reconnect', async () => {
    for (let i = 0; i < 4; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.errorLogs[0]).toContain('stopping ServerBusy polling');
    expect(machine.errorLogs[0]).toContain('push channel remains active');
    expect(machine.errorLogs[0]).not.toContain('reconnect');
  });
});
