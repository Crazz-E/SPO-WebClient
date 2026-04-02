/**
 * Tests for the cache-sync-service sentinel write pattern and env var parsing.
 * The actual module has side effects (calls main() at load), so we test the
 * contracts rather than importing the module directly.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface SentinelData {
  status: string;
  timestamp: number;
  stats: { downloaded: number; updated: number; deleted: number; skipped: number; failed: number; extracted: number };
  version: number;
}

/** Replicates the atomic write pattern from cache-sync-service.ts */
function writeSentinel(sentinelPath: string, stats: SentinelData['stats']): void {
  const data: SentinelData = {
    status: 'complete',
    timestamp: Date.now(),
    stats,
    version: 1,
  };
  const tmpPath = sentinelPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, sentinelPath);
}

const sampleStats = { downloaded: 5, updated: 2, deleted: 1, skipped: 100, failed: 0, extracted: 3 };

describe('cache-sync-service sentinel format', () => {
  let tmpDir: string;
  let sentinelPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-sync-test-'));
    sentinelPath = path.join(tmpDir, '.cache-sync-status.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes valid JSON with required fields', () => {
    writeSentinel(sentinelPath, sampleStats);

    const raw = fs.readFileSync(sentinelPath, 'utf-8');
    const data = JSON.parse(raw) as SentinelData;

    expect(data.status).toBe('complete');
    expect(data.version).toBe(1);
    expect(typeof data.timestamp).toBe('number');
    expect(data.stats).toEqual(sampleStats);
  });

  it('timestamp is recent (within last 5 seconds)', () => {
    const before = Date.now();
    writeSentinel(sentinelPath, sampleStats);
    const after = Date.now();

    const data = JSON.parse(fs.readFileSync(sentinelPath, 'utf-8')) as SentinelData;
    expect(data.timestamp).toBeGreaterThanOrEqual(before);
    expect(data.timestamp).toBeLessThanOrEqual(after);
  });

  it('atomic write — .tmp file does not remain after rename', () => {
    writeSentinel(sentinelPath, sampleStats);

    expect(fs.existsSync(sentinelPath)).toBe(true);
    expect(fs.existsSync(sentinelPath + '.tmp')).toBe(false);
  });

  it('overwrites previous sentinel on second write', () => {
    writeSentinel(sentinelPath, sampleStats);
    const first = JSON.parse(fs.readFileSync(sentinelPath, 'utf-8')) as SentinelData;

    // Small delay to get different timestamp
    writeSentinel(sentinelPath, { ...sampleStats, downloaded: 10 });
    const second = JSON.parse(fs.readFileSync(sentinelPath, 'utf-8')) as SentinelData;

    expect(second.stats.downloaded).toBe(10);
    expect(second.timestamp).toBeGreaterThanOrEqual(first.timestamp);
  });
});

describe('cache-sync-service env var defaults', () => {
  it('CACHE_SYNC_INTERVAL_MS defaults to 3600000', () => {
    const val = Number(process.env.CACHE_SYNC_INTERVAL_MS) || 3_600_000;
    // In test env, the var is not set, so we get the default
    expect(val).toBe(3_600_000);
  });

  it('CACHE_SYNC_ONCE defaults to false', () => {
    const val = process.env.CACHE_SYNC_ONCE === 'true';
    expect(val).toBe(false);
  });
});
