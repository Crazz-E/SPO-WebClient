/**
 * Construction Lock Tests — verifies serialization of concurrent RDO
 * commands on the shared construction socket.
 *
 * Exercises: serialiseConstruction() in construction-lock.ts
 * Regression test for commit 2e750cbef (building inspector pipeline hardening).
 */

import { describe, it, expect } from '@jest/globals';
import { serialiseConstruction } from '../construction-lock';
import type { SessionContext } from '../session-context';

/** Minimal mock SessionContext — only needs to be a unique object ref for WeakMap */
function mockCtx(): SessionContext {
  return {} as SessionContext;
}

describe('serialiseConstruction', () => {
  it('serializes concurrent upgrade + rename on same session', async () => {
    const ctx = mockCtx();
    const log: string[] = [];

    // Start upgrade (slow operation)
    const upgrade = serialiseConstruction(ctx, async () => {
      log.push('upgrade:start');
      await new Promise((r) => setTimeout(r, 30));
      log.push('upgrade:end');
      return 'upgraded';
    });

    // Start rename while upgrade is still running
    const rename = serialiseConstruction(ctx, async () => {
      log.push('rename:start');
      await new Promise((r) => setTimeout(r, 10));
      log.push('rename:end');
      return 'renamed';
    });

    const [upgradeResult, renameResult] = await Promise.all([upgrade, rename]);

    // Operations must be serialized — upgrade completes before rename starts
    expect(log).toEqual([
      'upgrade:start', 'upgrade:end',
      'rename:start', 'rename:end',
    ]);
    expect(upgradeResult).toBe('upgraded');
    expect(renameResult).toBe('renamed');
  });

  it('isolates different sessions (WeakMap key separation)', async () => {
    const ctx1 = mockCtx();
    const ctx2 = mockCtx();
    const log: string[] = [];

    // Session 1: slow operation
    const op1 = serialiseConstruction(ctx1, async () => {
      log.push('s1:start');
      await new Promise((r) => setTimeout(r, 30));
      log.push('s1:end');
    });

    // Session 2: fast operation — should NOT wait for session 1
    const op2 = serialiseConstruction(ctx2, async () => {
      log.push('s2:start');
      await new Promise((r) => setTimeout(r, 5));
      log.push('s2:end');
    });

    await Promise.all([op1, op2]);

    // Session 2 should finish before session 1 (runs in parallel, not serialized)
    expect(log.indexOf('s2:end')).toBeLessThan(log.indexOf('s1:end'));
  });

  it('continues queue after an operation fails', async () => {
    const ctx = mockCtx();
    const log: string[] = [];

    // First operation fails
    const failing = serialiseConstruction(ctx, async () => {
      log.push('fail:start');
      throw new Error('RDO socket error');
    }).catch(() => {
      log.push('fail:caught');
    });

    // Second operation should still execute (not deadlocked)
    const succeeding = serialiseConstruction(ctx, async () => {
      log.push('success:start');
      log.push('success:end');
      return 'ok';
    });

    await Promise.all([failing, succeeding]);

    expect(log).toEqual([
      'fail:start', 'fail:caught',
      'success:start', 'success:end',
    ]);
    expect(await succeeding).toBe('ok');
  });
});
