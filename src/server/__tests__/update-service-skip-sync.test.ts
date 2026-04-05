/**
 * Tests for the CACHE_SKIP_SYNC dev setting in UpdateService.
 * Verifies that when CACHE_SKIP_SYNC=true and cache has content,
 * the service skips remote sync entirely.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock cab-extractor before importing UpdateService
jest.mock('../cab-extractor', () => ({
  isCabExtractorAvailable: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  extractCabArchive: jest.fn(),
}));

// Mock fetch globally to prevent real HTTP calls
const mockFetch = jest.fn<typeof fetch>();
(globalThis as Record<string, unknown>).fetch = mockFetch;

import { UpdateService } from '../update-service';

describe('UpdateService CACHE_SKIP_SYNC', () => {
  let tmpDir: string;
  const originalEnv = process.env.CACHE_SKIP_SYNC;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-svc-test-'));
    mockFetch.mockReset();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CACHE_SKIP_SYNC;
    } else {
      process.env.CACHE_SKIP_SYNC = originalEnv;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips sync when CACHE_SKIP_SYNC=true and cache has content', async () => {
    process.env.CACHE_SKIP_SYNC = 'true';
    // Seed the cache directory with a dummy file
    fs.writeFileSync(path.join(tmpDir, 'dummy.txt'), 'cached');

    const service = new UpdateService(tmpDir);
    await service.initialize();

    expect(service.isHealthy()).toBe(true);
    // No HTTP calls should have been made
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('still syncs when CACHE_SKIP_SYNC=true but cache is empty', async () => {
    process.env.CACHE_SKIP_SYNC = 'true';
    // tmpDir exists but is empty

    const service = new UpdateService(tmpDir);

    // Mock the remote discovery to return empty listing so syncAll completes quickly
    mockFetch.mockResolvedValue(new Response('<html></html>', { status: 200 }));

    await service.initialize();

    expect(service.isHealthy()).toBe(true);
    // At least the discovery fetch should have been called
    expect(mockFetch).toHaveBeenCalled();
  });

  it('syncs normally when CACHE_SKIP_SYNC is not set', async () => {
    delete process.env.CACHE_SKIP_SYNC;
    // Seed the cache with content
    fs.writeFileSync(path.join(tmpDir, 'dummy.txt'), 'cached');

    const service = new UpdateService(tmpDir);
    mockFetch.mockResolvedValue(new Response('<html></html>', { status: 200 }));

    await service.initialize();

    expect(service.isHealthy()).toBe(true);
    // Should have made HTTP calls for sync
    expect(mockFetch).toHaveBeenCalled();
  });
});
