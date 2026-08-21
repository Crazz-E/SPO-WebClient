import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { unlock } from './unlock';
import { WorldLock } from './world-lock';

function tempLock(): WorldLock {
  return new WorldLock(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-unlock-')));
}

describe('unlock', () => {
  it('says so when there was nothing to clear', () => {
    expect(unlock(tempLock())).toMatch(/nothing to clear/);
  });

  it('clears a dirty lock and lists what was pending', () => {
    const lock = tempLock();
    lock.acquire('fix/a', 1, () => false);
    lock.addPendingRestore({
      what: 'Helartia tax row 0',
      x: 10,
      y: 20,
      propertyName: 'RDOSetTaxValue',
      originalValue: '7',
    });
    expect(() => lock.release('crashed')).toThrow();

    const message = unlock(lock);

    expect(message).toMatch(/Cleared a dirty lock/);
    expect(message).toMatch(/Reason: crashed/);
    expect(message).toMatch(/Helartia tax row 0 at \(10,20\) RDOSetTaxValue -> "7"/);
    expect(lock.read().dirty).toBe(false);
  });
});
