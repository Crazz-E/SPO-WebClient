/**
 * Unit tests for ChunkCache
 *
 * Tests the chunk caching system including per-zoom LRU limits,
 * eviction behavior, batch notifications, and stats tracking.
 *
 * Uses dynamic require() so OffscreenCanvas mock is set BEFORE
 * the module-level `isOffscreenCanvasSupported` const is evaluated.
 */

// Mock OffscreenCanvas for Node.js test environment — MUST be before require()
class MockOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return {
      clearRect: jest.fn(),
      drawImage: jest.fn(),
      fillStyle: '',
      fillRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      closePath: jest.fn(),
      fill: jest.fn(),
    };
  }
}
(global as unknown as Record<string, unknown>).OffscreenCanvas = MockOffscreenCanvas;

// Mock fetch and createImageBitmap — also before require()
global.fetch = jest.fn() as jest.Mock;
(global as unknown as Record<string, unknown>).createImageBitmap = jest.fn();

// Dynamic require AFTER globals are set (import would be hoisted before the mocks)

const { ChunkCache, CHUNK_SIZE, MAX_CHUNKS_PER_ZOOM } = require('./chunk-cache');

const { TextureCache } = require('./texture-cache');

// Mock TextureCache
const mockTextureCache = {
  getTextureSync: jest.fn().mockReturnValue(null),
  getTerrainType: jest.fn().mockReturnValue('Earth'),
  getSeason: jest.fn().mockReturnValue(2),
  preload: jest.fn().mockResolvedValue(undefined),
} as unknown as InstanceType<typeof TextureCache>;

// Mock getTextureId
const mockGetTextureId = jest.fn().mockReturnValue(21);

describe('ChunkCache', () => {
  let cache: InstanceType<typeof ChunkCache>;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new ChunkCache(mockTextureCache, mockGetTextureId as (x: number, y: number) => number);
    cache.setMapDimensions(1000, 1000);
    cache.setMapInfo('TestMap', 'Earth', 2);

    // Default: server chunks return 404 (force local rendering)
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });
  });

  describe('MAX_CHUNKS_PER_ZOOM export', () => {
    it('should define per-zoom cache limits', () => {
      expect(MAX_CHUNKS_PER_ZOOM[0]).toBe(300);
      expect(MAX_CHUNKS_PER_ZOOM[1]).toBe(160);
      expect(MAX_CHUNKS_PER_ZOOM[2]).toBe(96);
      expect(MAX_CHUNKS_PER_ZOOM[3]).toBe(48);
    });

    it('should have limits for all 4 zoom levels', () => {
      expect(Object.keys(MAX_CHUNKS_PER_ZOOM)).toHaveLength(4);
    });

    it('should have z0 limit large enough for typical viewport', () => {
      // At z0, a 1920x1080 viewport needs ~225 visible chunks (15x15)
      expect(MAX_CHUNKS_PER_ZOOM[0]).toBeGreaterThanOrEqual(225);
    });

    it('should have decreasing limits as zoom increases (memory scales up)', () => {
      expect(MAX_CHUNKS_PER_ZOOM[0]).toBeGreaterThan(MAX_CHUNKS_PER_ZOOM[1]);
      expect(MAX_CHUNKS_PER_ZOOM[1]).toBeGreaterThan(MAX_CHUNKS_PER_ZOOM[2]);
      expect(MAX_CHUNKS_PER_ZOOM[2]).toBeGreaterThan(MAX_CHUNKS_PER_ZOOM[3]);
    });
  });

  describe('constructor and initial state', () => {
    it('should start with empty caches', () => {
      const stats = cache.getStats();
      expect(stats.cacheSizes[0]).toBe(0);
      expect(stats.cacheSizes[1]).toBe(0);
      expect(stats.cacheSizes[2]).toBe(0);
      expect(stats.cacheSizes[3]).toBe(0);
    });

    it('should start with zero stats', () => {
      const stats = cache.getStats();
      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(0);
      expect(stats.evictions).toBe(0);
      expect(stats.chunksRendered).toBe(0);
      expect(stats.queueLength).toBe(0);
    });

    it('should report 0 hit rate initially', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('should report isSupported true with mock OffscreenCanvas', () => {
      expect(cache.isSupported()).toBe(true);
    });
  });

  describe('getChunkSync', () => {
    it('should return null for uncached chunk', () => {
      const result = cache.getChunkSync(5, 5, 2);
      expect(result).toBeNull();
    });

    it('should increment cacheMisses for uncached chunk', () => {
      cache.getChunkSync(5, 5, 2);
      const stats = cache.getStats();
      expect(stats.cacheMisses).toBe(1);
    });

    it('should queue render for missing chunk', () => {
      cache.getChunkSync(5, 5, 2);
      const stats = cache.getStats();
      // Chunk should be in cache (rendering=true) but not ready
      expect(stats.cacheSizes[2]).toBe(1);
    });

    it('should not re-queue chunk that is already rendering', () => {
      cache.getChunkSync(5, 5, 2);
      cache.getChunkSync(5, 5, 2); // Second call should not re-queue
      const stats = cache.getStats();
      // Only 1 miss on first call; second call sees rendering=true → no miss
      expect(stats.cacheMisses).toBe(1);
    });

    it('should handle different zoom levels independently', () => {
      cache.getChunkSync(5, 5, 0);
      cache.getChunkSync(5, 5, 2);
      const stats = cache.getStats();
      expect(stats.cacheSizes[0]).toBe(1);
      expect(stats.cacheSizes[2]).toBe(1);
      expect(stats.cacheMisses).toBe(2);
    });
  });

  describe('getChunkCoords', () => {
    it('should compute chunk coordinates for tile', () => {
      const coords = ChunkCache.getChunkCoords(0, 0);
      expect(coords).toEqual({ chunkI: 0, chunkJ: 0 });
    });

    it('should compute chunk coordinates for tile in second chunk', () => {
      const coords = ChunkCache.getChunkCoords(CHUNK_SIZE, CHUNK_SIZE);
      expect(coords).toEqual({ chunkI: 1, chunkJ: 1 });
    });

    it('should compute chunk coordinates for tile at boundary', () => {
      const coords = ChunkCache.getChunkCoords(CHUNK_SIZE - 1, CHUNK_SIZE - 1);
      expect(coords).toEqual({ chunkI: 0, chunkJ: 0 });
    });

    it('should handle large tile coordinates', () => {
      const coords = ChunkCache.getChunkCoords(500, 750);
      expect(coords.chunkI).toBe(Math.floor(500 / CHUNK_SIZE));
      expect(coords.chunkJ).toBe(Math.floor(750 / CHUNK_SIZE));
    });
  });

  describe('clearZoomLevel', () => {
    it('should clear cache for specific zoom level', () => {
      cache.getChunkSync(5, 5, 2);
      cache.getChunkSync(6, 6, 2);
      expect(cache.getStats().cacheSizes[2]).toBe(2);

      cache.clearZoomLevel(2);
      expect(cache.getStats().cacheSizes[2]).toBe(0);
    });

    it('should not affect other zoom levels', () => {
      cache.getChunkSync(5, 5, 0);
      cache.getChunkSync(5, 5, 2);

      cache.clearZoomLevel(2);
      expect(cache.getStats().cacheSizes[0]).toBe(1);
      expect(cache.getStats().cacheSizes[2]).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('should clear all zoom level caches', () => {
      cache.getChunkSync(5, 5, 0);
      cache.getChunkSync(5, 5, 1);
      cache.getChunkSync(5, 5, 2);

      cache.clearAll();
      const stats = cache.getStats();
      expect(stats.cacheSizes[0]).toBe(0);
      expect(stats.cacheSizes[1]).toBe(0);
      expect(stats.cacheSizes[2]).toBe(0);
    });

    it('should reset stats on clearAll', () => {
      cache.getChunkSync(5, 5, 2);
      cache.clearAll();
      const stats = cache.getStats();
      expect(stats.cacheMisses).toBe(0);
      expect(stats.cacheHits).toBe(0);
      expect(stats.evictions).toBe(0);
    });
  });

  describe('invalidateChunk', () => {
    it('should remove specific chunk from specific zoom level', () => {
      cache.getChunkSync(5, 5, 2);
      cache.getChunkSync(6, 6, 2);
      expect(cache.getStats().cacheSizes[2]).toBe(2);

      cache.invalidateChunk(5, 5, 2);
      expect(cache.getStats().cacheSizes[2]).toBe(1);
    });

    it('should remove chunk from all zoom levels when no zoom specified', () => {
      cache.getChunkSync(5, 5, 0);
      cache.getChunkSync(5, 5, 2);

      cache.invalidateChunk(5, 5);
      expect(cache.getStats().cacheSizes[0]).toBe(0);
      expect(cache.getStats().cacheSizes[2]).toBe(0);
    });

    it('should be safe to invalidate non-existent chunk', () => {
      cache.invalidateChunk(99, 99, 2);
      expect(cache.getStats().cacheSizes[2]).toBe(0);
    });
  });

  describe('setOnChunkReady callback', () => {
    it('should accept a callback', () => {
      const callback = jest.fn();
      cache.setOnChunkReady(callback);
      // No error thrown
    });
  });

  describe('setMapInfo', () => {
    it('should set map info', () => {
      cache.setMapInfo('NewMap', 'Alien Swamp', 0);
      // No error thrown, stats unchanged
      const stats = cache.getStats();
      expect(stats.chunksRendered).toBe(0);
    });
  });

  describe('setAtlasCache', () => {
    it('should accept null', () => {
      cache.setAtlasCache(null);
      // No error thrown
    });
  });

  describe('zoom-aware concurrency', () => {
    it('should use higher concurrency for Z0 chunks (tiny 260×130px)', () => {
      // Access the private method via prototype
      const concurrency = (cache as any).getConcurrency(0);
      expect(concurrency).toBe(16);
    });

    it('should use moderate concurrency for Z1 chunks', () => {
      const concurrency = (cache as any).getConcurrency(1);
      expect(concurrency).toBe(12);
    });

    it('should use standard concurrency for Z2/Z3 chunks', () => {
      expect((cache as any).getConcurrency(2)).toBe(6);
      expect((cache as any).getConcurrency(3)).toBe(6);
    });
  });

  describe('debounced chunk-ready notification', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should schedule notification instead of firing immediately', () => {
      const callback = jest.fn();
      cache.setOnChunkReady(callback);

      // Directly invoke the private method
      (cache as any).scheduleChunkReadyNotification();

      // Should NOT fire immediately
      expect(callback).not.toHaveBeenCalled();

      // Should fire after debounce period
      jest.advanceTimersByTime(80);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should coalesce rapid notifications into one', () => {
      const callback = jest.fn();
      cache.setOnChunkReady(callback);

      // Fire multiple rapid notifications
      (cache as any).scheduleChunkReadyNotification();
      (cache as any).scheduleChunkReadyNotification();
      (cache as any).scheduleChunkReadyNotification();

      // Still only one notification after debounce
      jest.advanceTimersByTime(80);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should cancel pending notification on clearAll', () => {
      const callback = jest.fn();
      cache.setOnChunkReady(callback);

      (cache as any).scheduleChunkReadyNotification();
      cache.clearAll();

      jest.advanceTimersByTime(80);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('stats tracking', () => {
    it('should track cache misses', () => {
      cache.getChunkSync(1, 1, 2);
      cache.getChunkSync(2, 2, 2);
      cache.getChunkSync(3, 3, 2);
      expect(cache.getStats().cacheMisses).toBe(3);
    });

    it('should report queue length', () => {
      const stats = cache.getStats();
      expect(typeof stats.queueLength).toBe('number');
    });

    it('should report cache sizes per zoom level', () => {
      const stats = cache.getStats();
      expect(stats.cacheSizes).toHaveProperty('0');
      expect(stats.cacheSizes).toHaveProperty('1');
      expect(stats.cacheSizes).toHaveProperty('2');
      expect(stats.cacheSizes).toHaveProperty('3');
    });
  });
});
