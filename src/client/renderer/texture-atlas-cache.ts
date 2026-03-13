/**
 * TextureAtlasCache
 *
 * Client-side texture atlas cache that loads a single atlas PNG + JSON manifest
 * per terrain type/season, replacing ~256 individual HTTP requests with just 2.
 *
 * The atlas is a single large image containing all terrain tiles packed in a grid.
 * The manifest maps palette indices to source rectangles within the atlas.
 *
 * Rendering uses ctx.drawImage(atlas, sx, sy, sw, sh, dx, dy, dw, dh) which is
 * hardware-accelerated - no performance loss compared to individual textures.
 */

import { Season, SEASON_NAMES } from '../../shared/map-config';
import { LandClass, landClassOf } from '../../shared/land-utils';

/**
 * Atlas manifest from server (atlas.json)
 */
export interface AtlasManifest {
  version: number;
  terrainType: string;
  season: number;
  tileWidth: number;
  tileHeight: number;
  cellHeight: number;
  atlasWidth: number;
  atlasHeight: number;
  columns: number;
  rows: number;
  tiles: Record<string, AtlasTileEntry>;
}

export interface AtlasTileEntry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Source rectangle within the atlas for drawImage()
 */
export interface TileRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

// Fallback colors for palette indices when texture is not in atlas
const TERRAIN_COLORS: Record<number, string> = {
  192: '#1a3a5c', 193: '#1d4268', 194: '#204a74', 195: '#234f80',
  196: '#1a3a5c', 197: '#1d4268', 198: '#204a74', 199: '#234f80',
  200: '#287389', 201: '#2a7a90', 202: '#2c8197', 203: '#2e889e',
  0: '#5a8c4f', 1: '#5d8f52', 2: '#608255', 3: '#638558',
  4: '#4a7c3f', 5: '#4d7f42', 6: '#507245', 7: '#537548',
  64: '#6b9460', 65: '#6e9763', 66: '#718a66', 67: '#748d69',
  128: '#8b7355', 129: '#8e7658', 130: '#91795b', 131: '#947c5e',
};

function getFallbackColor(paletteIndex: number): string {
  if (TERRAIN_COLORS[paletteIndex]) {
    return TERRAIN_COLORS[paletteIndex];
  }

  const landClass = landClassOf(paletteIndex);
  switch (landClass) {
    case LandClass.ZoneD: {
      const hue = 200 + (paletteIndex % 20);
      const sat = 40 + (paletteIndex % 20);
      const light = 25 + (paletteIndex % 15);
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    }
    case LandClass.ZoneC: {
      const hue = 30 + (paletteIndex % 15);
      const sat = 30 + (paletteIndex % 20);
      const light = 35 + (paletteIndex % 20);
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    }
    case LandClass.ZoneB: {
      const hue = 70 + (paletteIndex % 30);
      const sat = 35 + (paletteIndex % 25);
      const light = 35 + (paletteIndex % 20);
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    }
    case LandClass.ZoneA:
    default: {
      const hue = 90 + (paletteIndex % 30);
      const sat = 40 + (paletteIndex % 25);
      const light = 30 + (paletteIndex % 20);
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    }
  }
}

export class TextureAtlasCache {
  private atlas: ImageBitmap | null = null;
  private manifest: AtlasManifest | null = null;
  private terrainType: string = 'Earth';
  private season: Season = Season.SUMMER;
  private loading: boolean = false;
  private loaded: boolean = false;
  private loadPromise: Promise<void> | null = null;

  /**
   * Set the terrain type (triggers reload if changed)
   */
  setTerrainType(terrainType: string): void {
    if (this.terrainType !== terrainType) {
      this.terrainType = terrainType;
      this.clear();
      console.log(`[TextureAtlasCache] Terrain type set to: ${terrainType}`);
    }
  }

  getTerrainType(): string {
    return this.terrainType;
  }

  /**
   * Set the season (triggers reload if changed)
   */
  setSeason(season: Season): void {
    if (this.season !== season) {
      this.season = season;
      this.clear();
      console.log(`[TextureAtlasCache] Season changed to ${SEASON_NAMES[season]}`);
    }
  }

  getSeason(): Season {
    return this.season;
  }

  getSeasonName(): string {
    return SEASON_NAMES[this.season];
  }

  /**
   * Load the atlas PNG and manifest JSON from the server.
   * Returns a promise that resolves when both are loaded.
   */
  async loadAtlas(): Promise<void> {
    if (this.loaded || this.loading) {
      return this.loadPromise || Promise.resolve();
    }

    this.loading = true;
    this.loadPromise = this._doLoadAtlas();

    try {
      await this.loadPromise;
    } finally {
      this.loading = false;
    }
  }

  private async _doLoadAtlas(): Promise<void> {
    const terrainType = encodeURIComponent(this.terrainType);
    const atlasUrl = `/api/terrain-atlas/${terrainType}/${this.season}`;
    const manifestUrl = `/api/terrain-atlas/${terrainType}/${this.season}/manifest`;

    try {
      const [atlasResponse, manifestResponse] = await Promise.all([
        fetch(atlasUrl),
        fetch(manifestUrl),
      ]);

      if (!atlasResponse.ok || !manifestResponse.ok) {
        console.warn(`[TextureAtlasCache] Atlas not available for ${this.terrainType}/${SEASON_NAMES[this.season]}`);
        this.loaded = true; // Mark as loaded (failed) to prevent retries
        return;
      }

      const [atlasBlob, manifest] = await Promise.all([
        atlasResponse.blob(),
        manifestResponse.json() as Promise<AtlasManifest>,
      ]);

      this.atlas = await createImageBitmap(atlasBlob);
      this.manifest = manifest;
      this.loaded = true;

      console.log(`[TextureAtlasCache] Loaded atlas: ${this.terrainType}/${SEASON_NAMES[this.season]} (${Object.keys(manifest.tiles).length} tiles, ${manifest.atlasWidth}x${manifest.atlasHeight})`);
    } catch (error: unknown) {
      console.error(`[TextureAtlasCache] Failed to load atlas:`, error);
      this.loaded = true; // Prevent retries
    }
  }

  /**
   * Check if the atlas is loaded and ready for rendering
   */
  isReady(): boolean {
    return this.loaded && this.atlas !== null && this.manifest !== null;
  }

  /**
   * Get the atlas manifest (tile coordinates, dimensions, etc.)
   */
  getManifest(): AtlasManifest | null {
    return this.manifest;
  }

  /**
   * Get the atlas ImageBitmap for drawImage() calls
   */
  getAtlas(): ImageBitmap | null {
    if (!this.loaded && !this.loading) {
      // Trigger async load
      this.loadAtlas();
    }
    return this.atlas;
  }

  /**
   * Get the source rectangle within the atlas for a given palette index.
   * Returns null if the tile is not in the atlas.
   */
  getTileRect(paletteIndex: number): TileRect | null {
    if (!this.manifest) return null;

    const tile = this.manifest.tiles[String(paletteIndex)];
    if (!tile) return null;

    return {
      sx: tile.x,
      sy: tile.y,
      sw: tile.width,
      sh: tile.height,
    };
  }

  /**
   * Check if a tile exists in the atlas
   */
  hasTile(paletteIndex: number): boolean {
    return this.manifest !== null && String(paletteIndex) in this.manifest.tiles;
  }

  /**
   * Get fallback color for missing tiles
   */
  getFallbackColor(paletteIndex: number): string {
    return getFallbackColor(paletteIndex);
  }

  /**
   * Get the standard tile height from the manifest
   */
  getStandardTileHeight(): number {
    return this.manifest?.tileHeight || 32;
  }

  /**
   * Clear the atlas cache (e.g., when terrain type or season changes)
   */
  clear(): void {
    if (this.atlas) {
      this.atlas.close();
      this.atlas = null;
    }
    this.manifest = null;
    this.loaded = false;
    this.loading = false;
    this.loadPromise = null;
  }
}

// Re-export fallback color function
export { getFallbackColor };
