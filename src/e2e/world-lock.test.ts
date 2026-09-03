import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorldLock, WorldDirtyError } from './world-lock';

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
