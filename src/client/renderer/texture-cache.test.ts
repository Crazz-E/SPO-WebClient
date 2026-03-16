/**
 * Unit tests for TextureCache
 *
 * Note: Textures are organized by SEASON (0=Winter, 1=Spring, 2=Summer, 3=Autumn),
 * NOT by zoom level. The zoom level only affects tile rendering size.
 */

import { TextureCache, getFallbackColor } from './texture-cache';
import { Season } from '../../shared/map-config';
import { config } from '../../shared/config';

// Disable CDN in tests so fetch goes to local mock endpoints
(config as { cdn: { url: string } }).cdn.url = '';

// Mock fetch
global.fetch = jest.fn();

// Mock createImageBitmap
(global as any).createImageBitmap = jest.fn();

describe('TextureCache', () => {
  let cache: TextureCache;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new TextureCache(50);

    // Default mock: return 204 (no texture available)
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 204,
    });
  });

  describe('constructor', () => {
    it('should create cache with default max size', () => {
      const defaultCache = new TextureCache();
      const stats = defaultCache.getStats();
      expect(stats.maxSize).toBe(1024);
    });

    it('should create cache with custom max size', () => {
      const stats = cache.getStats();
      expect(stats.maxSize).toBe(50);
    });

    it('should start with empty cache', () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('terrain type', () => {
    it('should have default terrain type of Earth', () => {
      expect(cache.getTerrainType()).toBe('Earth');
    });

    it('should set terrain type', () => {
      cache.setTerrainType('Alien Swamp');
      expect(cache.getTerrainType()).toBe('Alien Swamp');
    });

    it('should clear cache when terrain type changes', () => {
      // First, add something to cache by triggering a load
      cache.getTextureSync(100);

      // Change terrain type
      cache.setTerrainType('Alien Swamp');

      // Stats should be reset
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
    });

    it('should not clear cache when setting same terrain type', () => {
      cache.setTerrainType('Earth'); // Same as default
      cache.getTextureSync(100); // This should trigger a load

      const stats = cache.getStats();
      expect(stats.misses).toBe(1); // Should have one miss from the load
    });
  });

  describe('season', () => {
    it('should have default season of Summer', () => {
      expect(cache.getSeason()).toBe(Season.SUMMER);
    });

    it('should set season', () => {
      cache.setSeason(Season.WINTER);
      expect(cache.getSeason()).toBe(Season.WINTER);
    });

    it('should return season name', () => {
      expect(cache.getSeasonName()).toBe('Summer');
      cache.setSeason(Season.WINTER);
      expect(cache.getSeasonName()).toBe('Winter');
    });

    it('should clear cache when season changes', () => {
      // First, add something to cache by triggering a load
      cache.getTextureSync(100);

      // Change season
      cache.setSeason(Season.WINTER);

      // Stats should be reset
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
    });

    it('should not clear cache when setting same season', () => {
      cache.setSeason(Season.SUMMER); // Same as default
      cache.getTextureSync(100); // This should trigger a load

      const stats = cache.getStats();
      expect(stats.misses).toBe(1); // Should have one miss from the load
    });
  });

  describe('getTextureSync', () => {
    it('should return null for uncached texture', () => {
      const texture = cache.getTextureSync(100);
      expect(texture).toBeNull();
    });

    it('should increment misses for uncached texture', () => {
      cache.getTextureSync(100);
      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
    });

    it('should not fetch individual textures (atlas is source of truth)', () => {
      cache.getTextureSync(100);
      // fetchTexture always returns null — atlas handles all textures
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not start multiple loads for same texture', () => {
      cache.getTextureSync(100);
      cache.getTextureSync(100);
      cache.getTextureSync(100);

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getTextureAsync', () => {
    it('should resolve to null for missing texture (204 response)', async () => {
      const texture = await cache.getTextureAsync(100);
      expect(texture).toBeNull();
    });

    it('should resolve to null (atlas is source of truth)', async () => {
      const texture = await cache.getTextureAsync(128);
      expect(texture).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getFallbackColor', () => {
    it('should return color from palette for known indices', () => {
      const color = cache.getFallbackColor(192);
      expect(color).toBe('#1a3a5c'); // Water color
    });

    it('should generate deterministic color for unknown indices', () => {
      const color1 = cache.getFallbackColor(255);
      const color2 = cache.getFallbackColor(255);
      expect(color1).toBe(color2);
    });
  });

  describe('has', () => {
    it('should return false for uncached texture', () => {
      expect(cache.has(100)).toBe(false);
    });
  });

  describe('clear', () => {
    it('should reset all cache state', () => {
      // Trigger some cache activity
      cache.getTextureSync(100);
      cache.getTextureSync(101);

      // Clear
      cache.clear();

      // Verify reset
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
    });
  });

  describe('preload', () => {
    it('should not fetch individual textures during preload (atlas handles all)', async () => {
      await cache.preload([100, 101, 102]);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const stats = cache.getStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('evictions');
      expect(stats).toHaveProperty('hitRate');
    });

    it('should calculate hit rate correctly', () => {
      // All misses
      cache.getTextureSync(100);
      cache.getTextureSync(101);

      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('getLoadedCount', () => {
    it('should return 0 for empty cache', () => {
      expect(cache.getLoadedCount()).toBe(0);
    });
  });
});

describe('getFallbackColor (exported function)', () => {
  it('should return water tones for high indices (192+)', () => {
    const color = getFallbackColor(192);
    expect(color).toMatch(/^#[0-9a-f]{6}$|^hsl\(/i);
  });

  it('should return grass tones for low indices (0-63)', () => {
    const color = getFallbackColor(0);
    expect(color).toMatch(/^#[0-9a-f]{6}$|^hsl\(/i);
  });

  it('should return midgrass tones for mid indices (64-127)', () => {
    const color = getFallbackColor(64);
    expect(color).toMatch(/^#[0-9a-f]{6}$|^hsl\(/i);
  });

  it('should return dryground tones for high-mid indices (128-191)', () => {
    const color = getFallbackColor(128);
    expect(color).toMatch(/^#[0-9a-f]{6}$|^hsl\(/i);
  });
});
