/**
 * AsyncMutex Tests — verifies the serialization lock that protects
 * the shared Delphi temp object from concurrent SetPath corruption.
 *
 * Exercises: AsyncMutex class in building-details-handler.ts
 * Regression test for commit 303d3f62f (SetPath race condition fix).
 */

import { describe, it, expect } from '@jest/globals';
import { AsyncMutex } from '../building-details-handler';

describe('AsyncMutex', () => {
  it('serializes concurrent acquirers in FIFO order', async () => {
    const mutex = new AsyncMutex();
    const executionOrder: number[] = [];

    // Acquire first lock
    const release1 = await mutex.acquire();

    // Queue two more acquirers while lock is held
    const p2 = mutex.acquire().then(async (release2) => {
      executionOrder.push(2);
      // Simulate async work
      await new Promise((r) => setTimeout(r, 10));
      release2();
    });

    const p3 = mutex.acquire().then(async (release3) => {
      executionOrder.push(3);
      release3();
    });

    // Release first lock — should trigger acquirer 2, then 3
    executionOrder.push(1);
    release1();

    await Promise.all([p2, p3]);

    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it('releases correctly in error paths (try/finally)', async () => {
    const mutex = new AsyncMutex();

    // First acquirer throws an error but releases in finally
    try {
      const release1 = await mutex.acquire();
      try {
        throw new Error('Simulated SetPath failure');
      } finally {
        release1();
      }
    } catch {
      // Expected
    }

    // Second acquirer should still be able to acquire — not deadlocked
    const release2 = await mutex.acquire();
    expect(release2).toBeInstanceOf(Function);
    release2();
  });

  it('handles three concurrent acquirers with mixed timing', async () => {
    const mutex = new AsyncMutex();
    const log: string[] = [];

    async function worker(name: string, delayMs: number): Promise<void> {
      const release = await mutex.acquire();
      log.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, delayMs));
      log.push(`${name}:end`);
      release();
    }

    // All three start concurrently — only one runs at a time
    await Promise.all([
      worker('A', 20),
      worker('B', 10),
      worker('C', 5),
    ]);

    // A acquires first (immediate), B and C queue behind
    expect(log).toEqual([
      'A:start', 'A:end',
      'B:start', 'B:end',
      'C:start', 'C:end',
    ]);
  });
});
