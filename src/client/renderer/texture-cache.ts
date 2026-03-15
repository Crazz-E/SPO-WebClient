/**
 * TextureCache
 *
 * Client-side texture cache with LRU eviction.
 * Fetches terrain textures from the server and caches them as ImageBitmap objects.
 *
 * Textures are organized by SEASON (0=Winter, 1=Spring, 2=Summer, 3=Autumn),
 * not by zoom level. The zoom level only affects tile rendering size.
 *
 * Features:
 * - LRU (Least Recently Used) eviction policy
 * - Async texture loading with Promise-based API
 * - Fallback colors for missing textures (using proper landId decoding)
 * - Pre-loading support for visible tiles
 */

import { Season, SEASON_NAMES } from '../../shared/map-config';
import { LandClass, landClassOf } from '../../shared/land-utils';
import { config as appConfig } from '../../shared/config';

// Fallback colors for palette indices when texture is not available
const TERRAIN_COLORS: Record<number, string> = {
  // Water (indices 192-255)
  192: '#1a3a5c', 193: '#1d4268', 194: '#204a74', 195: '#234f80',
  196: '#1a3a5c', 197: '#1d4268', 198: '#204a74', 199: '#234f80',
  200: '#287389', 201: '#2a7a90', 202: '#2c8197', 203: '#2e889e',

  // Grass (indices 0-63)
  0: '#5a8c4f', 1: '#5d8f52', 2: '#608255', 3: '#638558',
  4: '#4a7c3f', 5: '#4d7f42', 6: '#507245', 7: '#537548',

  // MidGrass (indices 64-127)
  64: '#6b9460', 65: '#6e9763', 66: '#718a66', 67: '#748d69',
  100: '#7a9a70', 101: '#7d9d73', 102: '#809076', 103: '#839379',

  // DryGround (indices 128-191)
  128: '#8b7355', 129: '#8e7658', 130: '#91795b', 131: '#947c5e',
  132: '#877050', 133: '#8a7353', 134: '#8d7656', 135: '#907959',
  160: '#9a836a', 161: '#9d866d', 162: '#a08970', 163: '#a38c73',
};

/**
 * Generate a deterministic fallback color for unmapped palette indices
 * Uses proper landId decoding (bits 7-6 = LandClass) instead of arbitrary ranges
 *
 * @param paletteIndex - The raw landId byte (0-255)
 * @returns CSS color string
 */
function getFallbackColor(paletteIndex: number): string {
  if (TERRAIN_COLORS[paletteIndex]) {
    return TERRAIN_COLORS[paletteIndex];
  }

  // Use proper bit decoding to determine terrain type
  const landClass = landClassOf(paletteIndex);

  switch (landClass) {
    case LandClass.ZoneD: {
      // Water (bits 7-6 = 11) - blue tones
      const hue = 200 + (paletteIndex % 20);
      const sat = 40 + (paletteIndex % 20);
      const light = 25 + (paletteIndex % 15);
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    }
    case LandClass.ZoneC: {
      // DryGround (bits 7-6 = 10) - brown tones
      const hue = 30 + (paletteIndex % 15);
      const sat = 30 + (paletteIndex % 20);
      const light = 35 + (paletteIndex % 20);
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    }
    case LandClass.ZoneB: {
      // MidGrass (bits 7-6 = 01) - yellow-green tones
      const hue = 70 + (paletteIndex % 30);
      const sat = 35 + (paletteIndex % 25);
      const light = 35 + (paletteIndex % 20);
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    }
    case LandClass.ZoneA:
    default: {
      // Grass (bits 7-6 = 00) - green tones
      const hue = 90 + (paletteIndex % 30);
      const sat = 40 + (paletteIndex % 25);
      const light = 30 + (paletteIndex % 20);
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    }
  }
}

interface CacheEntry {
  texture: ImageBitmap | null;
  lastAccess: number;
  loading: boolean;
  loaded: boolean;  // True when load attempt completed (even if texture is null/missing)
  loadPromise?: Promise<ImageBitmap | null>;
}

export class TextureCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private terrainType: string = 'Earth';
  private season: Season = Season.SUMMER; // Default to summer
  private accessCounter: number = 0;

  // Statistics
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  constructor(maxSize: number = 1024) {
    this.maxSize = maxSize;
  }

  /**
   * Set the terrain type for texture loading
   */
  setTerrainType(terrainType: string): void {
    if (this.terrainType !== terrainType) {
      this.terrainType = terrainType;
      // Clear cache when terrain type changes
      this.clear();
      console.log(`[TextureCache] Terrain type set to: ${terrainType}, current season: ${SEASON_NAMES[this.season]}`);
    }
  }

  /**
   * Get the current terrain type
   */
  getTerrainType(): string {
    return this.terrainType;
  }

  /**
   * Set the season for texture loading
   * @param season - Season (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
   */
  setSeason(season: Season): void {
    if (this.season !== season) {
      this.season = season;
      // Clear cache when season changes (textures are different per season)
      this.clear();
      console.log(`[TextureCache] Season changed to ${SEASON_NAMES[season]}`);
    }
  }

  /**
   * Get the current season
   */
  getSeason(): Season {
    return this.season;
  }

  /**
   * Get the current season name
   */
  getSeasonName(): string {
    return SEASON_NAMES[this.season];
  }

  /**
   * Generate cache key for a texture
   * Key is based on terrain type, season, and palette index
   */
  private getCacheKey(paletteIndex: number): string {
    return `${this.terrainType}-${this.season}-${paletteIndex}`;
  }

  /**
   * Get texture for a palette index (sync - returns cached or null)
   * Use this for fast rendering - if not cached, returns null and starts loading
   *
   * Note: The texture is the same regardless of zoom level.
   * Zoom level only affects how the texture is rendered (scaled).
   */
  getTextureSync(paletteIndex: number): ImageBitmap | null {
    const key = this.getCacheKey(paletteIndex);
    const entry = this.cache.get(key);

    if (entry && entry.texture) {
      // Move to end of Map (most recently used) for O(1) LRU eviction
      this.cache.delete(key);
      this.cache.set(key, entry);
      this.hits++;
      return entry.texture;
    }

    // If already loaded (even if texture is null/missing), don't retry
    if (entry && entry.loaded) {
      this.misses++;
      return null;
    }

    // Not in cache, trigger async load if not already loading
    if (!entry || !entry.loading) {
      this.loadTexture(paletteIndex);
    }

    this.misses++;
    return null;
  }

  /**
   * Get texture for a palette index (async - waits for load)
   */
  async getTextureAsync(paletteIndex: number): Promise<ImageBitmap | null> {
    const key = this.getCacheKey(paletteIndex);
    const entry = this.cache.get(key);

    if (entry) {
      if (entry.texture) {
        // Move to end of Map for LRU
        this.cache.delete(key);
        this.cache.set(key, entry);
        this.hits++;
        return entry.texture;
      }

      // If already loaded (even if texture is null/missing), don't retry
      if (entry.loaded) {
        this.misses++;
        return null;
      }

      if (entry.loadPromise) {
        return entry.loadPromise;
      }
    }

    this.misses++;
    return this.loadTexture(paletteIndex);
  }

  /**
   * Get fallback color for a palette index
   */
  getFallbackColor(paletteIndex: number): string {
    return getFallbackColor(paletteIndex);
  }

  /**
   * Load a texture from the server
   */
  private async loadTexture(paletteIndex: number): Promise<ImageBitmap | null> {
    const key = this.getCacheKey(paletteIndex);

    // Check if already loading
    const existing = this.cache.get(key);
    if (existing?.loadPromise) {
      return existing.loadPromise;
    }

    // Create loading entry
    const loadPromise = this.fetchTexture(paletteIndex);

    this.cache.set(key, {
      texture: null,
      lastAccess: ++this.accessCounter,
      loading: true,
      loaded: false,
      loadPromise
    });

    try {
      const texture = await loadPromise;

      // Update cache entry (mark as loaded even if texture is null/missing)
      const entry = this.cache.get(key);
      if (entry) {
        entry.texture = texture;
        entry.loading = false;
        entry.loaded = true;  // Mark as loaded even if texture is null
        entry.loadPromise = undefined;
      }

      // Evict if over capacity
      this.evictIfNeeded();

      return texture;
    } catch (error: unknown) {
      // Remove failed entry
      this.cache.delete(key);
      return null;
    }
  }

  /**
   * Fetch texture from server and convert to ImageBitmap.
   * Uses season (not zoom level) to fetch the correct texture variant.
   *
   * Textures are served as pre-baked PNGs with alpha channel already applied,
   * so no client-side color keying is needed.
   */
  private async fetchTexture(paletteIndex: number): Promise<ImageBitmap | null> {
    const cdnUrl = appConfig.cdn.url;
    const url = cdnUrl
      ? `${cdnUrl}/textures/${encodeURIComponent(this.terrainType)}/${this.season}/${paletteIndex}.png`
      : `/api/terrain-texture/${encodeURIComponent(this.terrainType)}/${this.season}/${paletteIndex}`;

    try {
      const response = await fetch(url);

      // 204 means texture not available for this palette index
      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      return createImageBitmap(blob);
    } catch (error: unknown) {
      console.warn(`[TextureCache] Failed to load texture ${paletteIndex}:`, error);
      return null;
    }
  }

  /**
   * Evict least recently used entries if cache is over capacity.
   * Uses Map insertion order for O(1) eviction — oldest entries are first.
   */
  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxSize) return;

    for (const [key, entry] of this.cache) {
      if (this.cache.size <= this.maxSize) break;
      if (entry.loading) continue; // Skip entries still loading

      if (entry.texture) {
        entry.texture.close(); // Release ImageBitmap resources
      }
      this.cache.delete(key);
      this.evictions++;
    }
  }

  /**
   * Preload textures for a list of palette indices
   */
  async preload(paletteIndices: number[]): Promise<void> {
    const loadPromises = paletteIndices.map(index =>
      this.getTextureAsync(index)
    );

    await Promise.all(loadPromises);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    // Release all ImageBitmap resources
    for (const entry of this.cache.values()) {
      if (entry.texture) {
        entry.texture.close();
      }
    }

    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.accessCounter = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; hits: number; misses: number; evictions: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total > 0 ? this.hits / total : 0
    };
  }

  /**
   * Check if a texture is cached
   */
  has(paletteIndex: number): boolean {
    const key = this.getCacheKey(paletteIndex);
    const entry = this.cache.get(key);
    return entry !== undefined && entry.texture !== null;
  }

  /**
   * Get count of loaded textures
   */
  getLoadedCount(): number {
    let count = 0;
    for (const entry of this.cache.values()) {
      if (entry.texture) {
        count++;
      }
    }
    return count;
  }
}

// Export fallback color function for use by renderer
export { getFallbackColor };
