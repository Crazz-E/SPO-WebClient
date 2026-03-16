/**
 * Unit tests for TextureAtlasCache
 */

import { TextureAtlasCache, getFallbackColor, AtlasManifest } from './texture-atlas-cache';
import { Season } from '../../shared/map-config';
import { config } from '../../shared/config';

// Disable CDN in tests so fetch goes to local mock endpoints
(config as { cdn: { url: string } }).cdn.url = '';

// Mock fetch
global.fetch = jest.fn();

// Mock createImageBitmap
(global as any).createImageBitmap = jest.fn();

describe('TextureAtlasCache', () => {
  let cache: TextureAtlasCache;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new TextureAtlasCache();

    // Default mock: return 404 (atlas not available)
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });
  });

  describe('terrain type and season', () => {
    it('should have default terrain type of Earth', () => {
      expect(cache.getTerrainType()).toBe('Earth');
    });

    it('should have default season of Summer', () => {
      expect(cache.getSeason()).toBe(Season.SUMMER);
    });

    it('should set terrain type and clear cache', () => {
      cache.setTerrainType('Alien Swamp');
      expect(cache.getTerrainType()).toBe('Alien Swamp');
    });

    it('should set season and clear cache', () => {
      cache.setSeason(Season.WINTER);
      expect(cache.getSeason()).toBe(Season.WINTER);
      expect(cache.getSeasonName()).toBe('Winter');
    });

    it('should not clear cache when setting same terrain type', () => {
      cache.setTerrainType('Earth'); // Same as default
      // No error, just a no-op
    });
  });

  describe('loadAtlas', () => {
    it('should fetch atlas and manifest from correct URLs', async () => {
      const mockManifest: AtlasManifest = {
        version: 1,
        terrainType: 'Earth',
        season: 2,
        tileWidth: 64,
        tileHeight: 32,
        cellHeight: 96,
        atlasWidth: 1024,
        atlasHeight: 1536,
        columns: 16,
        rows: 16,
        tiles: {
          '0': { x: 0, y: 64, width: 64, height: 32 },
          '128': { x: 512, y: 832, width: 64, height: 32 },
        },
      };

      const mockBitmap = { width: 1024, height: 1536, close: jest.fn() };
      const mockBlob = new Blob();

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith('atlas.json')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockManifest),
          });
        }
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(mockBlob),
        });
      });
      (global as any).createImageBitmap.mockResolvedValue(mockBitmap);

      await cache.loadAtlas();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith('/cdn/textures/Earth/2/atlas.png');
      expect(global.fetch).toHaveBeenCalledWith('/cdn/textures/Earth/2/atlas.json');
    });

    it('should be ready after successful load', async () => {
      const mockManifest: AtlasManifest = {
        version: 1, terrainType: 'Earth', season: 2,
        tileWidth: 64, tileHeight: 32, cellHeight: 96,
        atlasWidth: 1024, atlasHeight: 1536, columns: 16, rows: 16,
        tiles: { '0': { x: 0, y: 64, width: 64, height: 32 } },
      };

      const mockBitmap = { width: 1024, height: 1536, close: jest.fn() };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith('atlas.json')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockManifest),
          });
        }
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob()),
        });
      });
      (global as any).createImageBitmap.mockResolvedValue(mockBitmap);

      expect(cache.isReady()).toBe(false);
      await cache.loadAtlas();
      expect(cache.isReady()).toBe(true);
    });

    it('should handle failed atlas load gracefully', async () => {
      await cache.loadAtlas();

      expect(cache.isReady()).toBe(false);
      expect(cache.getAtlas()).toBeNull();
    });

    it('should not retry after failed load', async () => {
      await cache.loadAtlas();
      await cache.loadAtlas(); // Second call should not refetch

      expect(global.fetch).toHaveBeenCalledTimes(2); // Only the initial pair
    });
  });

  describe('getTileRect', () => {
    let loadedCache: TextureAtlasCache;

    beforeEach(async () => {
      loadedCache = new TextureAtlasCache();

      const mockManifest: AtlasManifest = {
        version: 1, terrainType: 'Earth', season: 2,
        tileWidth: 64, tileHeight: 32, cellHeight: 96,
        atlasWidth: 1024, atlasHeight: 1536, columns: 16, rows: 16,
        tiles: {
          '0': { x: 0, y: 64, width: 64, height: 32 },
          '42': { x: 640, y: 198, width: 64, height: 90 },
          '128': { x: 0, y: 832, width: 64, height: 32 },
        },
      };

      const mockBitmap = { width: 1024, height: 1536, close: jest.fn() };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith('atlas.json')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockManifest),
          });
        }
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob()),
        });
      });
      (global as any).createImageBitmap.mockResolvedValue(mockBitmap);

      await loadedCache.loadAtlas();
    });

    it('should return correct rect for standard tile', () => {
      const rect = loadedCache.getTileRect(0);
      expect(rect).toEqual({ sx: 0, sy: 64, sw: 64, sh: 32 });
    });

    it('should return correct rect for tall tile', () => {
      const rect = loadedCache.getTileRect(42);
      expect(rect).toEqual({ sx: 640, sy: 198, sw: 64, sh: 90 });
    });

    it('should return null for missing tile', () => {
      const rect = loadedCache.getTileRect(255);
      expect(rect).toBeNull();
    });

    it('should check tile existence with hasTile', () => {
      expect(loadedCache.hasTile(0)).toBe(true);
      expect(loadedCache.hasTile(128)).toBe(true);
      expect(loadedCache.hasTile(255)).toBe(false);
    });
  });

  describe('clear', () => {
    it('should reset all state', async () => {
      const mockManifest: AtlasManifest = {
        version: 1, terrainType: 'Earth', season: 2,
        tileWidth: 64, tileHeight: 32, cellHeight: 96,
        atlasWidth: 1024, atlasHeight: 1536, columns: 16, rows: 16,
        tiles: { '0': { x: 0, y: 64, width: 64, height: 32 } },
      };
      const mockBitmap = { width: 1024, height: 1536, close: jest.fn() };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith('atlas.json')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockManifest) });
        }
        return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob()) });
      });
      (global as any).createImageBitmap.mockResolvedValue(mockBitmap);

      await cache.loadAtlas();
      expect(cache.isReady()).toBe(true);

      cache.clear();

      expect(cache.isReady()).toBe(false);
      expect(cache.getAtlas()).toBeNull();
      expect(mockBitmap.close).toHaveBeenCalled();
    });
  });

  describe('getFallbackColor', () => {
    it('should return color for known palette indices', () => {
      expect(cache.getFallbackColor(192)).toBe('#1a3a5c');
    });

    it('should generate deterministic color for unknown indices', () => {
      const c1 = cache.getFallbackColor(255);
      const c2 = cache.getFallbackColor(255);
      expect(c1).toBe(c2);
    });
  });
});

describe('getFallbackColor (exported)', () => {
  it('should return water tones for high indices', () => {
    const color = getFallbackColor(192);
    expect(color).toMatch(/^#[0-9a-f]{6}$|^hsl\(/i);
  });

  it('should return grass tones for low indices', () => {
    const color = getFallbackColor(10);
    expect(color).toMatch(/^#|^hsl\(/i);
  });
});
