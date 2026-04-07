/**
 * ServerBusy Consecutive Poll Failure → Auto-Reconnect Tests
 *
 * Validates the poll-failure detection logic added to startServerBusyPolling():
 * - Consecutive failure counter increments on each poll timeout
 * - Counter resets on successful poll
 * - After MAX_CONSECUTIVE_POLL_FAILURES (5), triggers stopServerBusyPolling + attemptWorldReconnect
 * - rdoMetrics.totalServerBusyPollFailures tracks cumulative failures
 * - getQueueStatus() exposes consecutivePollFailures
 *
 * Mirrors Delphi's except → RenewWorldProxy pattern, batched over 5 consecutive failures.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Minimal harness mirroring ServerBusy poll logic from spo_session.ts ──

interface RdoMetrics {
  totalServerBusyPollFailures: number;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

class ServerBusyReconnectMachine {
  consecutivePollFailures = 0;
  static readonly MAX_CONSECUTIVE_POLL_FAILURES = 5;

  rdoMetrics: RdoMetrics = {
    totalServerBusyPollFailures: 0,
  };

  serverBusyCheckInterval: ReturnType<typeof setInterval> | null = { } as ReturnType<typeof setInterval>;

  // Spies
  stopServerBusyPollingCalled = 0;
  attemptWorldReconnectCalled = 0;
  attemptWorldReconnectResult: 'resolve' | 'reject' = 'resolve';
  reconnectErrors: string[] = [];
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
    if (this.attemptWorldReconnectResult === 'reject') {
      throw new Error('Reconnect failed');
    }
  }

  /**
   * Simulates a poll failure — replicates the catch block logic.
   */
  async simulatePollFailure(): Promise<void> {
    try {
      throw new Error('ServerBusy check timeout');
    } catch (e: unknown) {
      this.consecutivePollFailures++;
      this.rdoMetrics.totalServerBusyPollFailures++;
      this.warnLogs.push(
        `[ServerBusy] Poll failed (${this.consecutivePollFailures}/${ServerBusyReconnectMachine.MAX_CONSECUTIVE_POLL_FAILURES}): ${toErrorMessage(e)}`
      );

      if (this.consecutivePollFailures >= ServerBusyReconnectMachine.MAX_CONSECUTIVE_POLL_FAILURES) {
        this.errorLogs.push(
          `[ServerBusy] ${this.consecutivePollFailures} consecutive poll failures — server appears unresponsive, triggering reconnect`
        );
        this.consecutivePollFailures = 0;
        this.stopServerBusyPolling();
        try {
          await this.attemptWorldReconnect();
        } catch (reconnectErr: unknown) {
          this.reconnectErrors.push(toErrorMessage(reconnectErr));
        }
      }
    }
  }

  /**
   * Simulates a successful poll — replicates the success path.
   */
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

describe('ServerBusy consecutive poll failure → auto-reconnect', () => {
  let machine: ServerBusyReconnectMachine;

  beforeEach(() => {
    machine = new ServerBusyReconnectMachine();
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

  it('triggers reconnect at exactly MAX_CONSECUTIVE_POLL_FAILURES (5)', async () => {
    for (let i = 0; i < 5; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.attemptWorldReconnectCalled).toBe(1);
    expect(machine.stopServerBusyPollingCalled).toBe(1);
  });

  it('does NOT trigger reconnect at 4 consecutive failures', async () => {
    for (let i = 0; i < 4; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.attemptWorldReconnectCalled).toBe(0);
    expect(machine.stopServerBusyPollingCalled).toBe(0);
    expect(machine.consecutivePollFailures).toBe(4);
  });

  it('resets counter to 0 before calling reconnect', async () => {
    const origReconnect = machine.attemptWorldReconnect.bind(machine);
    let counterDuringReconnect = -1;
    machine.attemptWorldReconnect = async () => {
      counterDuringReconnect = machine.consecutivePollFailures;
      return origReconnect();
    };

    for (let i = 0; i < 5; i++) {
      await machine.simulatePollFailure();
    }
    // Counter is reset before stopServerBusyPolling (which also resets), so it's 0
    expect(counterDuringReconnect).toBe(0);
  });

  it('calls stopServerBusyPolling before attemptWorldReconnect', async () => {
    const callOrder: string[] = [];
    const origStop = machine.stopServerBusyPolling.bind(machine);
    const origReconnect = machine.attemptWorldReconnect.bind(machine);
    machine.stopServerBusyPolling = () => {
      callOrder.push('stop');
      origStop();
    };
    machine.attemptWorldReconnect = async () => {
      callOrder.push('reconnect');
      return origReconnect();
    };

    for (let i = 0; i < 5; i++) {
      await machine.simulatePollFailure();
    }
    expect(callOrder).toEqual(['stop', 'reconnect']);
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

  it('interleaved success resets counter: 3 fail, 1 success, 3 fail = no reconnect', async () => {
    for (let i = 0; i < 3; i++) {
      await machine.simulatePollFailure();
    }
    machine.simulatePollSuccess();
    for (let i = 0; i < 3; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.attemptWorldReconnectCalled).toBe(0);
    expect(machine.rdoMetrics.totalServerBusyPollFailures).toBe(6);
  });

  it('multiple threshold hits: 5 fail → reconnect → 5 fail → reconnect (cumulative = 10)', async () => {
    // First burst
    for (let i = 0; i < 5; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.attemptWorldReconnectCalled).toBe(1);

    // Simulate polling restart after reconnect success
    machine.serverBusyCheckInterval = {} as ReturnType<typeof setInterval>;

    // Second burst
    for (let i = 0; i < 5; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.attemptWorldReconnectCalled).toBe(2);
    expect(machine.rdoMetrics.totalServerBusyPollFailures).toBe(10);
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

  it('catches reconnect errors without crashing', async () => {
    machine.attemptWorldReconnectResult = 'reject';
    for (let i = 0; i < 5; i++) {
      await machine.simulatePollFailure();
    }
    expect(machine.attemptWorldReconnectCalled).toBe(1);
    expect(machine.reconnectErrors).toEqual(['Reconnect failed']);
  });

  it('logs progress with failure count ratio', async () => {
    await machine.simulatePollFailure();
    expect(machine.warnLogs[0]).toContain('(1/5)');
    await machine.simulatePollFailure();
    expect(machine.warnLogs[1]).toContain('(2/5)');
  });
});
