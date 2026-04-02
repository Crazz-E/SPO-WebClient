import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CacheWatcher, CacheSyncStatus } from '../cache-watcher';

function makeSentinel(timestamp: number): CacheSyncStatus {
  return {
    status: 'complete',
    timestamp,
    stats: { downloaded: 5, updated: 2, extracted: 3, skipped: 100, failed: 0 },
    version: 1,
  };
}

describe('CacheWatcher', () => {
  let tmpDir: string;
  let sentinelPath: string;
  let watcher: CacheWatcher;

  beforeEach(() => {
    jest.useFakeTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-watcher-test-'));
    sentinelPath = path.join(tmpDir, '.cache-sync-status.json');
  });

  afterEach(() => {
    watcher?.stop();
    jest.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not throw when sentinel file does not exist at start', () => {
    watcher = new CacheWatcher(sentinelPath, 1000);
    expect(() => watcher.start()).not.toThrow();
  });

  it('reads initial timestamp from existing sentinel without emitting', () => {
    fs.writeFileSync(sentinelPath, JSON.stringify(makeSentinel(1000)));
    watcher = new CacheWatcher(sentinelPath, 1000);

    const handler = jest.fn();
    watcher.on('cache-updated', handler);
    watcher.start();

    // No emission on start — initial timestamp is captured silently
    expect(handler).not.toHaveBeenCalled();
  });

  it('stop() is safe to call even if not started', () => {
    watcher = new CacheWatcher(sentinelPath, 1000);
    expect(() => watcher.stop()).not.toThrow();
  });

  it('start() is idempotent — internal watching flag prevents double registration', () => {
    watcher = new CacheWatcher(sentinelPath, 1000);
    watcher.start();
    // Second start should be a no-op (no throw, no double registration)
    expect(() => watcher.start()).not.toThrow();
  });

  describe('file change detection (using internal methods)', () => {
    // Since fs.watchFile is non-configurable and can't be mocked with jest.spyOn,
    // we test the internal checkAndEmit logic by directly writing sentinel files
    // and calling the private methods via type casting.

    it('emits cache-updated when sentinel timestamp changes', () => {
      fs.writeFileSync(sentinelPath, JSON.stringify(makeSentinel(1000)));
      watcher = new CacheWatcher(sentinelPath, 1000);

      const handler = jest.fn();
      watcher.on('cache-updated', handler);

      // Read initial timestamp (simulates start)
      (watcher as unknown as { readSentinelTimestamp: () => void }).readSentinelTimestamp();

      // Write new sentinel with different timestamp
      fs.writeFileSync(sentinelPath, JSON.stringify(makeSentinel(2000)));

      // Directly call checkAndEmit (simulates what happens after debounce)
      (watcher as unknown as { checkAndEmit: () => void }).checkAndEmit();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ timestamp: 2000 }));
    });

    it('does NOT emit when timestamp is unchanged', () => {
      fs.writeFileSync(sentinelPath, JSON.stringify(makeSentinel(1000)));
      watcher = new CacheWatcher(sentinelPath, 1000);

      const handler = jest.fn();
      watcher.on('cache-updated', handler);

      // Read initial timestamp
      (watcher as unknown as { readSentinelTimestamp: () => void }).readSentinelTimestamp();

      // checkAndEmit with same file — timestamp hasn't changed
      (watcher as unknown as { checkAndEmit: () => void }).checkAndEmit();

      expect(handler).not.toHaveBeenCalled();
    });

    it('does NOT throw or emit when sentinel contains invalid JSON', () => {
      watcher = new CacheWatcher(sentinelPath, 1000);

      const handler = jest.fn();
      watcher.on('cache-updated', handler);

      // Write garbage
      fs.writeFileSync(sentinelPath, '{invalid json!!!');

      // Should not throw
      expect(() => {
        (watcher as unknown as { checkAndEmit: () => void }).checkAndEmit();
      }).not.toThrow();

      expect(handler).not.toHaveBeenCalled();
    });

    it('does NOT emit when sentinel file does not exist', () => {
      watcher = new CacheWatcher(sentinelPath, 1000);

      const handler = jest.fn();
      watcher.on('cache-updated', handler);

      // File doesn't exist — should not throw or emit
      expect(() => {
        (watcher as unknown as { checkAndEmit: () => void }).checkAndEmit();
      }).not.toThrow();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('debounce behavior', () => {
    it('onFileChange debounces — second call within window is ignored', () => {
      fs.writeFileSync(sentinelPath, JSON.stringify(makeSentinel(1000)));
      watcher = new CacheWatcher(sentinelPath, 1000);

      const handler = jest.fn();
      watcher.on('cache-updated', handler);

      (watcher as unknown as { readSentinelTimestamp: () => void }).readSentinelTimestamp();

      // Write new sentinel
      fs.writeFileSync(sentinelPath, JSON.stringify(makeSentinel(2000)));

      const internal = watcher as unknown as { onFileChange: () => void };

      // Fire multiple times rapidly
      internal.onFileChange();
      internal.onFileChange();
      internal.onFileChange();

      // Advance past debounce (1000ms)
      jest.advanceTimersByTime(1000);

      // Only one emission despite 3 calls
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('debounce timer is cleared on stop()', () => {
      watcher = new CacheWatcher(sentinelPath, 1000);
      watcher.start();

      const internal = watcher as unknown as { onFileChange: () => void; debounceTimer: unknown };

      // Trigger a debounced change
      internal.onFileChange();
      expect(internal.debounceTimer).not.toBeNull();

      // Stop should clear it
      watcher.stop();
      expect(internal.debounceTimer).toBeNull();
    });
  });
});
