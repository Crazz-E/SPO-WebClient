import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorldLock, WorldDirtyError } from './world-lock';
import { LIMITS } from './config';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spo-e2e-lock-'));
}

const restore = {
  what: 'Helartia tax row 0',
  x: 10,
  y: 20,
  propertyName: 'RDOSetTaxValue',
  originalValue: '7',
};

describe('WorldLock — single flight', () => {
  it('acquires a lock when none is held', () => {
    const lock = new WorldLock(tempDir());
    lock.acquire('fix/thing', 111, () => false);
    expect(lock.read().holder?.branch).toBe('fix/thing');
  });

  it('refuses when another live process holds it', () => {
    const dir = tempDir();
    new WorldLock(dir).acquire('fix/a', 111, () => true);
    expect(() => new WorldLock(dir).acquire('fix/b', 222, () => true)).toThrow(/single-flight/);
  });

  it('takes over from a holder whose process is gone', () => {
    const dir = tempDir();
    new WorldLock(dir).acquire('fix/a', 111, () => true);
    const second = new WorldLock(dir);
    second.acquire('fix/b', 222, () => false);
    expect(second.read().holder?.branch).toBe('fix/b');
  });

  it('starts each run with an empty pending-restore list', () => {
    const dir = tempDir();
    const lock = new WorldLock(dir);
    lock.acquire('fix/a', 111, () => false);
    lock.addPendingRestore(restore);
    lock.acquire('fix/a', 111, () => false);
    expect(lock.read().pendingRestores).toEqual([]);
  });
});

describe('WorldLock — world dirty', () => {
  it('marks the world dirty when a run ends with an unrestored write', () => {
    const lock = new WorldLock(tempDir());
    lock.acquire('fix/a', 111, () => false);
    lock.addPendingRestore(restore);
    expect(() => lock.release('crashed mid-probe')).toThrow(WorldDirtyError);
    expect(lock.read().dirty).toBe(true);
    expect(lock.read().dirtyReason).toBe('crashed mid-probe');
  });

  it('blocks every later run until a human clears it', () => {
    const dir = tempDir();
    const first = new WorldLock(dir);
    first.acquire('fix/a', 111, () => false);
    first.addPendingRestore(restore);
    expect(() => first.release()).toThrow(WorldDirtyError);

    expect(() => new WorldLock(dir).acquire('fix/b', 222, () => false)).toThrow(WorldDirtyError);
  });

  it('names the pending values in the refusal so they can be put back', () => {
    const lock = new WorldLock(tempDir());
    lock.acquire('fix/a', 111, () => false);
    lock.addPendingRestore(restore);
    expect(() => lock.release()).toThrow(/1 value\(s\) need a human restore/);
  });

  it('releases cleanly once the write has been restored', () => {
    const lock = new WorldLock(tempDir());
    lock.acquire('fix/a', 111, () => false);
    lock.addPendingRestore(restore);
    lock.clearPendingRestore(restore.x, restore.y, restore.propertyName);
    expect(() => lock.release()).not.toThrow();
    expect(lock.read().dirty).toBe(false);
    expect(lock.read().holder).toBeNull();
  });

  it('only clears the matching restore, not every pending one', () => {
    const lock = new WorldLock(tempDir());
    lock.acquire('fix/a', 111, () => false);
    lock.addPendingRestore(restore);
    lock.addPendingRestore({ ...restore, x: 99, what: 'other' });
    lock.clearPendingRestore(10, 20, 'RDOSetTaxValue');
    expect(lock.read().pendingRestores).toHaveLength(1);
    expect(lock.read().pendingRestores[0].x).toBe(99);
  });

  it('forceUnlock returns what was pending so a human can check it', () => {
    const lock = new WorldLock(tempDir());
    lock.acquire('fix/a', 111, () => false);
    lock.addPendingRestore(restore);
    expect(() => lock.release()).toThrow();
    const previous = lock.forceUnlock();
    expect(previous.dirty).toBe(true);
    expect(previous.pendingRestores[0].originalValue).toBe('7');
    expect(lock.read().dirty).toBe(false);
  });

  it('treats a missing or corrupt lock file as no lock', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'world-lock.json'), 'not json', 'utf8');
    expect(new WorldLock(dir).read().dirty).toBe(false);
  });
});

describe('WorldLock — rate limiting', () => {
  // The mechanism is exercised with pinned limits, not the shipping defaults: since
  // 2026-08-22 the defaults are open (interval 0, cap 1000 — developer decision, the
  // bench worker serializes live runs mechanically), so only injection reaches the
  // refusal branches.
  const TIGHT = { minIntervalMinutes: 10, maxRunsPerDay: 20 };

  it('allows the first run on a branch', () => {
    expect(() => new WorldLock(tempDir()).checkRateLimit('fix/a')).not.toThrow();
  });

  it('lets back-to-back runs through under the shipping defaults — the queue throttles, not the clock', () => {
    const lock = new WorldLock(tempDir());
    lock.recordRun('fix/a', new Date('2026-08-21T10:00:00Z'));
    expect(LIMITS.minIntervalMinutes).toBe(0);
    expect(() => lock.checkRateLimit('fix/a', new Date('2026-08-21T10:00:01Z'))).not.toThrow();
  });

  it('refuses a second run on the same branch inside the minimum interval', () => {
    const lock = new WorldLock(tempDir());
    const now = new Date('2026-08-21T10:00:00Z');
    lock.recordRun('fix/a', now);
    expect(() => lock.checkRateLimit('fix/a', new Date('2026-08-21T10:01:00Z'), TIGHT)).toThrow(
      /minimum interval/,
    );
  });

  it('allows the run once the interval has passed', () => {
    const lock = new WorldLock(tempDir());
    lock.recordRun('fix/a', new Date('2026-08-21T10:00:00Z'));
    const later = new Date(Date.parse('2026-08-21T10:00:00Z') + (TIGHT.minIntervalMinutes + 1) * 60_000);
    expect(() => lock.checkRateLimit('fix/a', later, TIGHT)).not.toThrow();
  });

  it('holds a run on one branch against a run on another', () => {
    // A per-branch limiter is defeated by passing a different --branch on each retry, and
    // the live server does not care which branch the traffic came from.
    const lock = new WorldLock(tempDir());
    lock.recordRun('fix/a', new Date('2026-08-21T10:00:00Z'));
    expect(() => lock.checkRateLimit('fix/b', new Date('2026-08-21T10:01:00Z'), TIGHT)).toThrow(
      /minimum interval/,
    );
  });

  it('names the branch of the run that is holding the limiter', () => {
    const lock = new WorldLock(tempDir());
    lock.recordRun('fix/a', new Date('2026-08-21T10:00:00Z'));
    expect(() =>
      lock.checkRateLimit('fix/b', new Date('2026-08-21T10:01:00Z'), TIGHT),
    ).toThrow(/fix\/a/);
  });

  it('refuses once the daily cap is reached', () => {
    const lock = new WorldLock(tempDir());
    const start = Date.parse('2026-08-21T00:00:00Z');
    for (let i = 0; i < TIGHT.maxRunsPerDay; i++) {
      lock.recordRun(`fix/${i}`, new Date(start + i * 60_000));
    }
    expect(() =>
      lock.checkRateLimit('fix/new', new Date(start + 10 * 60 * 60_000), TIGHT),
    ).toThrow(/Daily live-run cap/);
  });

  it('forgets runs older than 24 h', () => {
    const lock = new WorldLock(tempDir());
    const start = Date.parse('2026-08-20T00:00:00Z');
    for (let i = 0; i < TIGHT.maxRunsPerDay; i++) {
      lock.recordRun(`fix/${i}`, new Date(start + i * 60_000));
    }
    const nextDay = new Date(start + 26 * 60 * 60_000);
    expect(() => lock.checkRateLimit('fix/new', nextDay, TIGHT)).not.toThrow();
  });
});
