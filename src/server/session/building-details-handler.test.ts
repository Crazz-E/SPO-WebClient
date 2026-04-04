/**
 * Tests for building-details-handler: Semaphore, computeWorkerCount.
 */

import { describe, it, expect } from '@jest/globals';
import { Semaphore, computeWorkerCount } from './building-details-handler';

describe('computeWorkerCount', () => {
  it('returns 1 for 1-3 slots', () => {
    expect(computeWorkerCount(1)).toBe(1);
    expect(computeWorkerCount(2)).toBe(1);
    expect(computeWorkerCount(3)).toBe(1);
  });

  it('returns 2 for 4-10 slots', () => {
    expect(computeWorkerCount(4)).toBe(2);
    expect(computeWorkerCount(7)).toBe(2);
    expect(computeWorkerCount(10)).toBe(2);
  });

  it('returns 3 for 11+ slots', () => {
    expect(computeWorkerCount(11)).toBe(3);
    expect(computeWorkerCount(20)).toBe(3);
    expect(computeWorkerCount(50)).toBe(3);
  });
});

describe('Semaphore', () => {
  it('allows up to N concurrent acquisitions', async () => {
    const sem = new Semaphore(3);
    const log: string[] = [];

    // Acquire 3 permits immediately (should not block)
    await sem.acquire(); log.push('a1');
    await sem.acquire(); log.push('a2');
    await sem.acquire(); log.push('a3');

    expect(log).toEqual(['a1', 'a2', 'a3']);
  });

  it('blocks the 4th acquisition until a release', async () => {
    const sem = new Semaphore(2);
    const log: string[] = [];

    await sem.acquire();
    await sem.acquire();

    // 3rd acquire should block
    let thirdResolved = false;
    const thirdPromise = sem.acquire().then(() => { thirdResolved = true; });

    // Flush microtasks
    await Promise.resolve();
    expect(thirdResolved).toBe(false);

    // Release one permit — 3rd should now resolve
    sem.release();
    await thirdPromise;
    expect(thirdResolved).toBe(true);
  });

  it('processes waiting queue in FIFO order', async () => {
    const sem = new Semaphore(1);
    const log: string[] = [];

    await sem.acquire();

    // Queue up 3 waiters
    const p1 = sem.acquire().then(() => log.push('w1'));
    const p2 = sem.acquire().then(() => log.push('w2'));
    const p3 = sem.acquire().then(() => log.push('w3'));

    // Release one at a time
    sem.release();
    await p1;
    sem.release();
    await p2;
    sem.release();
    await p3;

    expect(log).toEqual(['w1', 'w2', 'w3']);
  });

  it('correctly recycles permits after release with no waiters', async () => {
    const sem = new Semaphore(2);

    await sem.acquire();
    await sem.acquire();
    sem.release();
    sem.release();

    // Should be able to acquire 2 more
    await sem.acquire();
    await sem.acquire();

    // 5th total should block
    let blocked = true;
    const p = sem.acquire().then(() => { blocked = false; });
    await Promise.resolve();
    expect(blocked).toBe(true);

    sem.release();
    await p;
    expect(blocked).toBe(false);
  });
});
