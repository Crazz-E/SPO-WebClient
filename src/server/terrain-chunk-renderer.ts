/**
 * TerrainChunkRenderer
 *
 * Server-side terrain chunk pre-rendering. Composites isometric terrain chunks
 * from the terrain atlas PNG and map BMP data, producing WebP images that the
 * client can load directly instead of rendering tiles client-side.
 *
 * Architecture:
 * - Loads terrain atlas PNGs into raw RGBA buffers at initialization
 * - Loads map BMPs lazily as raw palette index arrays
 * - Generates 32×32-tile isometric chunks at ALL zoom levels (0-3)
 * - Zoom 3 rendered from atlas tiles; zoom 2/1/0 downscaled from zoom 3
 * - Pre-generates ALL chunks for all maps/seasons at startup (background)
 * - Caches generated chunk WebP images to disk for persistence across restarts
 * - All vegetation/special tiles are flattened (landId & 0xC0)
 *
 * No Canvas API needed — all compositing uses raw RGBA Buffer operations.
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Worker } from 'worker_threads';
import { decodePng, decodeWebP, decodeBmpIndices, encodePng, encodeWebP, downscaleRGBA2x, PngData } from './texture-alpha-baker';
import { AtlasManifest, TileEntry } from './atlas-generator';
import { isSpecialTile } from '../shared/land-utils';
import { Season, SEASON_NAMES } from '../shared/map-config';
import { MapDataService } from './map-data-service';
import { config } from '../shared/config';
import type { Service } from './service-registry';

// ============================================================================
// Constants (must match client chunk-cache.ts)
// ============================================================================

/** Tiles per chunk dimension */
export const CHUNK_SIZE = 32;

/** Zoom level 3 configuration (base resolution) */
const ZOOM3_U = 32;
const ZOOM3_TILE_WIDTH = 64;
const ZOOM3_TILE_HEIGHT = 32;
const ZOOM3_HALF_WIDTH = ZOOM3_TILE_WIDTH / 2; // 32

/** Chunk canvas dimensions at zoom level 3 */
export const CHUNK_CANVAS_WIDTH = ZOOM3_U * (2 * CHUNK_SIZE - 1) + ZOOM3_TILE_WIDTH;   // 2080
export const CHUNK_CANVAS_HEIGHT = ZOOM3_U * CHUNK_SIZE + ZOOM3_TILE_HEIGHT;            // 1056

/** Maximum zoom level (base resolution) */
const MAX_ZOOM = 3;

/** Bit mask to extract LandClass only (Center, variant 0) — flattens vegetation */
const FLAT_MASK = 0xC0;

// ============================================================================
// Types
// ============================================================================

/** Decoded atlas data held in memory for fast pixel access */
interface AtlasPixelData {
  width: number;
  height: number;
  pixels: Buffer;           // RGBA, 4 bytes per pixel
  manifest: AtlasManifest;
}

/** Map data held in memory */
interface MapPixelData {
  width: number;
  height: number;
  indices: Uint8Array;      // Raw 8-bit palette indices
}

/** Chunk manifest returned by the manifest endpoint */
export interface ChunkManifest {
  mapName: string;
  terrainType: string;
  season: number;
  seasonName: string;
  mapWidth: number;
  mapHeight: number;
  chunkSize: number;
  chunksI: number;
  chunksJ: number;
  chunkWidth: number;
  chunkHeight: number;
  zoomLevel: number;
  tileWidth: number;
  tileHeight: number;
  u: number;
  zoomLevels: number[];
}

// ============================================================================
// Tile position formula (must match client chunk-cache.ts)
// ============================================================================

/**
 * Calculate the screen offset for a tile within a chunk's local canvas.
 * Exact replica of client-side getTileScreenPosInChunk().
 */
export function getTileScreenPosInChunk(localI: number, localJ: number): { x: number; y: number } {
  return {
    x: ZOOM3_U * (CHUNK_SIZE - localI + localJ),
    y: (ZOOM3_U / 2) * ((CHUNK_SIZE - localI) + (CHUNK_SIZE - localJ))
  };
}

// ============================================================================
// Alpha blending
// ============================================================================

/**
 * Blit a tile from the atlas onto the chunk buffer with alpha blending.
 * Direct RGBA pixel copy — no Canvas API needed.
 */
export function blitTileWithAlpha(
  srcPixels: Buffer, srcStride: number,
  srcX: number, srcY: number,
  srcW: number, srcH: number,
  dstPixels: Buffer, dstStride: number, dstHeight: number,
  dstX: number, dstY: number
): void {
  for (let y = 0; y < srcH; y++) {
    const dy = dstY + y;
    if (dy < 0 || dy >= dstHeight) continue;

    for (let x = 0; x < srcW; x++) {
      const dx = dstX + x;
      if (dx < 0 || dx >= dstStride) continue;

      const srcIdx = ((srcY + y) * srcStride + (srcX + x)) * 4;
      const dstIdx = (dy * dstStride + dx) * 4;

      const srcA = srcPixels[srcIdx + 3];
      if (srcA === 0) continue; // Fully transparent, skip

      if (srcA === 255) {
        // Fully opaque — direct copy (fast path)
        dstPixels[dstIdx] = srcPixels[srcIdx];
        dstPixels[dstIdx + 1] = srcPixels[srcIdx + 1];
        dstPixels[dstIdx + 2] = srcPixels[srcIdx + 2];
        dstPixels[dstIdx + 3] = 255;
      } else {
        // Semi-transparent — alpha blend
        const invA = 255 - srcA;
        dstPixels[dstIdx] = (srcPixels[srcIdx] * srcA + dstPixels[dstIdx] * invA + 127) / 255 | 0;
        dstPixels[dstIdx + 1] = (srcPixels[srcIdx + 1] * srcA + dstPixels[dstIdx + 1] * invA + 127) / 255 | 0;
        dstPixels[dstIdx + 2] = (srcPixels[srcIdx + 2] * srcA + dstPixels[dstIdx + 2] * invA + 127) / 255 | 0;
        dstPixels[dstIdx + 3] = Math.min(255, dstPixels[dstIdx + 3] + srcA);
      }
    }
  }
}

// ============================================================================
// TerrainChunkRenderer Service
// ============================================================================

export class TerrainChunkRenderer implements Service {
  public readonly name = 'terrainChunks';

  /** Decoded atlas RGBA data: "terrainType-season" → AtlasPixelData */
  private atlasData: Map<string, AtlasPixelData> = new Map();

  /** Map palette indices: "mapName" → MapPixelData */
  private mapData: Map<string, MapPixelData> = new Map();

  /** Root directory for disk cache */
  private cacheDir: string;

  /** Root directory for map BMPs */
  private mapCacheDir: string;

  /** Root directory for texture atlases */
  private textureDir: string;

  /** Dedup in-flight chunk generation */
  private generating: Map<string, Promise<Buffer | null>> = new Map();

  /** Background pre-generation state */
  private preGenerating: boolean = false;

  /** Total chunks to generate in the current pre-gen run */
  private preGenTotal: number = 0;

  /** Chunks generated so far in the current pre-gen run */
  private preGenDone: number = 0;

  /** Set to true to stop the background pre-generation loop */
  private stopRequested: boolean = false;

  /** Set to true before initialize() to skip background pre-generation (for tests) */
  public skipPreGeneration: boolean = false;

  /** Active worker pool (non-null only while pre-generation is running) */
  private workerPool: WorkerPool | null = null;

  constructor(
    cacheDir: string = path.join(__dirname, '../../webclient-cache'),
    mapCacheDir: string = path.join(__dirname, '../../cache'),
    textureDir: string = path.join(__dirname, '../../webclient-cache/textures')
  ) {
    this.cacheDir = cacheDir;
    this.mapCacheDir = mapCacheDir;
    this.textureDir = textureDir;
  }

  /**
   * Load atlases only — no pre-generation. Used by the CLI cache-build script.
   * Call this instead of initialize() when you want to drive preGenerateAllChunks() manually.
   */
  async initializeAtlases(): Promise<void> {
    const prev = this.skipPreGeneration;
    this.skipPreGeneration = true;
    await this.initialize();
    this.skipPreGeneration = prev;
  }

  /**
   * Current pre-generation progress snapshot.
   */
  getPreGenProgress(): { total: number; done: number; active: boolean } {
    return { total: this.preGenTotal, done: this.preGenDone, active: this.preGenerating };
  }

  /**
   * Initialize: load available atlas PNGs into memory, then start background pre-generation.
   * Called by ServiceRegistry after textures service is ready.
   */
  async initialize(): Promise<void> {
    console.log('[TerrainChunkRenderer] Initializing...');

    // Discover available terrain types and seasons from texture directory
    if (!fs.existsSync(this.textureDir)) {
      console.warn('[TerrainChunkRenderer] Texture directory not found, skipping atlas loading');
      return;
    }

    const terrainTypes = fs.readdirSync(this.textureDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    let loadedCount = 0;

    for (const terrainType of terrainTypes) {
      const terrainDir = path.join(this.textureDir, terrainType);
      const seasons = fs.readdirSync(terrainDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && /^\d$/.test(e.name))
        .map(e => parseInt(e.name, 10) as Season);

      for (const season of seasons) {
        const loaded = this.loadAtlas(terrainType, season);
        if (loaded) loadedCount++;
      }
    }

    // Ensure chunk cache root exists
    const chunkRoot = path.join(this.cacheDir, 'chunks');
    if (!fs.existsSync(chunkRoot)) {
      fs.mkdirSync(chunkRoot, { recursive: true });
    }

    console.log(`[TerrainChunkRenderer] Loaded ${loadedCount} terrain atlases`);

    // Start background pre-generation (fire-and-forget, non-blocking)
    if (!this.skipPreGeneration) {
      this.preGenerateAllChunks().catch((err: unknown) => {
        console.error('[TerrainChunkRenderer] Pre-generation error:', err);
        this.preGenerating = false;
      });
    }
  }

  /**
   * Load a terrain atlas PNG + manifest into memory.
   * @returns true if successfully loaded
   */
  loadAtlas(terrainType: string, season: number): boolean {
    const atlasPath = path.join(this.textureDir, terrainType, String(season), 'atlas.png');
    const manifestPath = path.join(this.textureDir, terrainType, String(season), 'atlas.json');

    if (!fs.existsSync(atlasPath) || !fs.existsSync(manifestPath)) {
      return false;
    }

    try {
      const pngBuffer = fs.readFileSync(atlasPath);
      const pngData: PngData = decodePng(pngBuffer);

      const manifestJson = fs.readFileSync(manifestPath, 'utf-8');
      const manifest: AtlasManifest = JSON.parse(manifestJson);

      const key = `${terrainType}-${season}`;
      this.atlasData.set(key, {
        width: pngData.width,
        height: pngData.height,
        pixels: pngData.pixels,
        manifest
      });

      console.log(`[TerrainChunkRenderer] Loaded atlas: ${terrainType}/${SEASON_NAMES[season as Season]} (${Object.keys(manifest.tiles).length} tiles, ${pngData.width}x${pngData.height})`);
      return true;
    } catch (error: unknown) {
      console.error(`[TerrainChunkRenderer] Failed to load atlas ${terrainType}/${season}:`, error);
      return false;
    }
  }

  /**
   * Load map BMP data (palette indices) into memory.
   * Called lazily on first chunk request for a map.
   */
  loadMapData(mapName: string): boolean {
    if (this.mapData.has(mapName)) return true;

    const bmpPath = path.join(this.mapCacheDir, 'Maps', mapName, `${mapName}.bmp`);

    if (!fs.existsSync(bmpPath)) {
      console.error(`[TerrainChunkRenderer] Map BMP not found: ${bmpPath}`);
      return false;
    }

    try {
      const bmpBuffer = fs.readFileSync(bmpPath);
      const data = decodeBmpIndices(bmpBuffer);

      this.mapData.set(mapName, {
        width: data.width,
        height: data.height,
        indices: data.indices
      });

      console.log(`[TerrainChunkRenderer] Loaded map data: ${mapName} (${data.width}x${data.height})`);
      return true;
    } catch (error: unknown) {
      console.error(`[TerrainChunkRenderer] Failed to load map ${mapName}:`, error);
      return false;
    }
  }

  /**
   * Get or generate a chunk WebP buffer at a specific zoom level.
   * Checks disk cache first, generates on-demand if not cached.
   */
  async getChunk(
    mapName: string,
    terrainType: string,
    season: number,
    chunkI: number,
    chunkJ: number,
    zoomLevel: number = MAX_ZOOM
  ): Promise<Buffer | null> {
    const t0 = Date.now();

    // Check disk cache
    const cachePath = this.getChunkCachePath(mapName, terrainType, season, chunkI, chunkJ, zoomLevel);

    try {
      const result = await fsp.readFile(cachePath);
      const dt = Date.now() - t0;
      if (dt > 10) {
        console.log(`[TerrainChunkRenderer] disk-cache z${zoomLevel} ${chunkI},${chunkJ}: ${dt}ms (${(result.length / 1024).toFixed(0)} KB)`);
      }
      return result;
    } catch {
      // File doesn't exist, generate it
    }

    // Dedup in-flight generation
    const genKey = `${mapName}-${terrainType}-${season}-z${zoomLevel}-${chunkI}-${chunkJ}`;
    const existing = this.generating.get(genKey);
    if (existing) return existing;

    // Use worker pool with priority dispatch when active (client requests jump ahead of background pre-gen)
    const promise = this.workerPool
      ? this._generateViaWorkerPool(mapName, terrainType, season, chunkI, chunkJ, zoomLevel)
      : this._generateAndCacheZoom(mapName, terrainType, season, chunkI, chunkJ, zoomLevel);
    this.generating.set(genKey, promise);

    try {
      const result = await promise;
      const dt = Date.now() - t0;
      console.log(`[TerrainChunkRenderer] generate z${zoomLevel} ${chunkI},${chunkJ}: ${dt}ms (${result ? (result.length / 1024).toFixed(0) + ' KB' : 'null'})`);
      return result;
    } finally {
      this.generating.delete(genKey);
    }
  }

  /**
   * Generate a chunk via the worker pool with priority dispatch.
   * Workers produce all 4 zoom levels; we cache them all and return the requested one.
   */
  private async _generateViaWorkerPool(
    mapName: string,
    terrainType: string,
    season: number,
    chunkI: number,
    chunkJ: number,
    zoomLevel: number
  ): Promise<Buffer | null> {
    if (!this.workerPool) return null;

    try {
      const pngs = await this.workerPool.dispatchPriority({
        mapName, terrainType, season, chunkI, chunkJ,
      });

      // Cache Z2→Z0 to disk (skip Z3 — client renders locally). pngs[0]=z3, pngs[1]=z2, pngs[2]=z1, pngs[3]=z0
      const writes: Promise<void>[] = [];
      for (let z = MAX_ZOOM - 1; z >= 0; z--) {
        const pngIdx = MAX_ZOOM - z;
        const cachePath = this.getChunkCachePath(mapName, terrainType, season, chunkI, chunkJ, z);
        writes.push(
          fsp.mkdir(path.dirname(cachePath), { recursive: true })
            .then(() => fsp.writeFile(cachePath, pngs[pngIdx]))
        );
      }
      await Promise.all(writes);

      // Return the requested zoom level
      const pngIdx = MAX_ZOOM - zoomLevel;
      return pngs[pngIdx] ?? null;
    } catch (err: unknown) {
      console.error(`[TerrainChunkRenderer] Worker priority dispatch failed for ${chunkI},${chunkJ}:`, err);
      // Fall back to main-thread generation
      return this._generateAndCacheZoom(mapName, terrainType, season, chunkI, chunkJ, zoomLevel);
    }
  }

  /**
   * Generate and cache a chunk at a specific zoom level.
   * For zoom 3: renders from atlas tiles.
   * For zoom < 3: gets zoom-3 RGBA, then cascades downscale.
   */
  private async _generateAndCacheZoom(
    mapName: string,
    terrainType: string,
    season: number,
    chunkI: number,
    chunkJ: number,
    zoomLevel: number
  ): Promise<Buffer | null> {
    if (!this.loadMapData(mapName)) return null;

    let pixels: Buffer | null;
    let width: number;
    let height: number;

    if (zoomLevel === MAX_ZOOM) {
      // Zoom 3: render from atlas
      pixels = this.generateChunkRGBA(terrainType, season, chunkI, chunkJ, mapName);
      width = CHUNK_CANVAS_WIDTH;
      height = CHUNK_CANVAS_HEIGHT;
    } else {
      // Zoom < 3: get zoom-3 chunk RGBA, then downscale
      // First check if zoom-3 PNG is cached on disk
      const z3CachePath = this.getChunkCachePath(mapName, terrainType, season, chunkI, chunkJ, MAX_ZOOM);
      let z3Pixels: Buffer | null = null;
      let z3W = CHUNK_CANVAS_WIDTH;
      let z3H = CHUNK_CANVAS_HEIGHT;

      try {
        // Decode from cached WebP (legacy Z3 cache may still exist on disk)
        const webpBuf = await fsp.readFile(z3CachePath);
        const decoded = await decodeWebP(webpBuf);
        z3Pixels = decoded.pixels;
        z3W = decoded.width;
        z3H = decoded.height;
      } catch {
        // Generate zoom-3 from atlas (not cached — client renders Z3 locally)
        z3Pixels = this.generateChunkRGBA(terrainType, season, chunkI, chunkJ, mapName);
      }

      if (!z3Pixels) return null;

      // Cascade downscale from zoom 3 to target zoom
      pixels = z3Pixels;
      width = z3W;
      height = z3H;
      for (let z = MAX_ZOOM - 1; z >= zoomLevel; z--) {
        const scaled = downscaleRGBA2x(pixels, width, height);
        pixels = scaled.pixels;
        width = scaled.width;
        height = scaled.height;
      }
    }

    if (!pixels) return null;

    // Encode as WebP
    const webp = await encodeWebP(width, height, pixels);

    // Write to disk cache
    const cachePath = this.getChunkCachePath(mapName, terrainType, season, chunkI, chunkJ, zoomLevel);
    const cacheDir = path.dirname(cachePath);
    await fsp.mkdir(cacheDir, { recursive: true });
    await fsp.writeFile(cachePath, webp);

    return webp;
  }

  /**
   * Generate a single chunk as RGBA pixel buffer at zoom level 3.
   * This is the core rendering algorithm — replicates client chunk-cache.ts formulas.
   * Returns raw RGBA pixels (not PNG) for reuse in downscaling.
   */
  generateChunkRGBA(
    terrainType: string,
    season: number,
    chunkI: number,
    chunkJ: number,
    mapName: string
  ): Buffer | null {
    // Get atlas data
    const atlasKey = `${terrainType}-${season}`;
    const atlas = this.atlasData.get(atlasKey);
    if (!atlas) {
      return null;
    }

    // Get map data
    const map = this.mapData.get(mapName);
    if (!map) {
      return null;
    }

    // Allocate chunk RGBA buffer (transparent initially)
    const pixels = Buffer.alloc(CHUNK_CANVAS_WIDTH * CHUNK_CANVAS_HEIGHT * 4, 0);

    // Calculate tile range for this chunk, with 1-tile border overlap.
    // Border tiles extend into adjacent chunks so that their diamond pixels
    // fill the transparent corners of the chunk canvas.  This eliminates
    // dark seam lines caused by GPU compositing at transparency boundaries
    // when adjacent chunks are drawn side-by-side on the main canvas.
    const BORDER = 1;
    const startI = Math.max(0, chunkI * CHUNK_SIZE - BORDER);
    const startJ = Math.max(0, chunkJ * CHUNK_SIZE - BORDER);
    const endI = Math.min(chunkI * CHUNK_SIZE + CHUNK_SIZE + BORDER, map.height);
    const endJ = Math.min(chunkJ * CHUNK_SIZE + CHUNK_SIZE + BORDER, map.width);

    // Base offsets for localI/localJ (chunk-owned tiles start at localI=0)
    const baseI = chunkI * CHUNK_SIZE;
    const baseJ = chunkJ * CHUNK_SIZE;

    // Render tiles (same iteration order as client)
    for (let i = startI; i < endI; i++) {
      for (let j = startJ; j < endJ; j++) {
        // Get texture ID and flatten vegetation
        let textureId = map.indices[i * map.width + j];
        if (isSpecialTile(textureId)) {
          textureId = textureId & FLAT_MASK;
        }

        // Get tile source rect from atlas manifest
        const tileEntry = atlas.manifest.tiles[String(textureId)];
        if (!tileEntry) continue; // Skip missing tiles

        // Calculate tile position in chunk canvas
        const localI = i - startI;
        const localJ = j - startJ;
        const screenPos = getTileScreenPosInChunk(localI, localJ);
        const destX = screenPos.x - ZOOM3_HALF_WIDTH;
        const destY = screenPos.y;

        // Alpha-blend tile pixels from atlas onto chunk buffer
        blitTileWithAlpha(
          atlas.pixels, atlas.width,
          tileEntry.x, tileEntry.y,
          tileEntry.width, tileEntry.height,
          pixels, CHUNK_CANVAS_WIDTH, CHUNK_CANVAS_HEIGHT,
          destX, destY
        );
      }
    }

    return pixels;
  }

  /**
   * Generate ALL zoom levels for a single chunk and cache to disk.
   * Renders zoom 3 from atlas, then cascades 2× downscale for 2→1→0.
   */
  async generateChunkAllZooms(
    mapName: string,
    terrainType: string,
    season: number,
    chunkI: number,
    chunkJ: number
  ): Promise<boolean> {
    // Generate zoom-3 RGBA
    const z3Pixels = this.generateChunkRGBA(terrainType, season, chunkI, chunkJ, mapName);
    if (!z3Pixels) return false;

    // Encode and cache Z3 at full resolution
    const z3Webp = await encodeWebP(CHUNK_CANVAS_WIDTH, CHUNK_CANVAS_HEIGHT, z3Pixels);
    this._writeChunkCache(mapName, terrainType, season, chunkI, chunkJ, MAX_ZOOM, z3Webp);

    // Cascade downscale: Z3→Z2→Z1→Z0
    let pixels = z3Pixels;
    let width = CHUNK_CANVAS_WIDTH;
    let height = CHUNK_CANVAS_HEIGHT;

    for (let z = MAX_ZOOM - 1; z >= 0; z--) {
      const scaled = downscaleRGBA2x(pixels, width, height);
      pixels = scaled.pixels;
      width = scaled.width;
      height = scaled.height;

      const webp = await encodeWebP(width, height, pixels);
      this._writeChunkCache(mapName, terrainType, season, chunkI, chunkJ, z, webp);
    }

    return true;
  }

  /**
   * Write a chunk PNG to the disk cache.
   */
  private _writeChunkCache(
    mapName: string, terrainType: string, season: number,
    chunkI: number, chunkJ: number, zoomLevel: number,
    png: Buffer
  ): void {
    const cachePath = this.getChunkCachePath(mapName, terrainType, season, chunkI, chunkJ, zoomLevel);
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(cachePath, png);
  }

  /**
   * Pre-generate chunks for all available maps and zoom levels (or a specific subset).
   * Uses a worker thread pool (one worker per CPU core, capped at 8) to render chunks
   * in parallel. Dispatches in small batches and yields to the event loop between batches
   * so RDO/WebSocket handlers are not starved by microtask flooding.
   *
   * @param targetMaps - Optional list of map folder names to generate. When omitted,
   *   all maps found in cache/Maps/ with a .bmp file are included. Controlled by the
   *   PREGENERATE_MAPS env var (comma-separated) when running as server background task.
   */
  async preGenerateAllChunks(targetMaps?: string[]): Promise<void> {
    if (this.preGenerating) return;
    this.preGenerating = true;
    this.preGenTotal = 0;
    this.preGenDone = 0;

    try {
      const mapsDir = path.join(this.mapCacheDir, 'Maps');
      if (!fs.existsSync(mapsDir)) {
        console.log('[TerrainChunkRenderer] No maps directory found, skipping pre-generation');
        return;
      }

      // Determine which maps to generate:
      // 1. If caller passes targetMaps (CLI --map), use those.
      // 2. Else use config.chunks.devMaps (defaults to Shamba,Zorcon in dev, all in prod;
      //    overridable via PREGENERATE_MAPS env var).
      let allowedMaps: Set<string> | null = null;
      if (targetMaps && targetMaps.length > 0) {
        allowedMaps = new Set(targetMaps);
      } else if (config.chunks.devMaps.length > 0) {
        allowedMaps = new Set(config.chunks.devMaps);
      }

      const mapDirs = fs.readdirSync(mapsDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .filter(name =>
          (allowedMaps === null || allowedMaps.has(name)) &&
          fs.existsSync(path.join(mapsDir, name, `${name}.bmp`))
        );

      if (mapDirs.length === 0) {
        console.log('[TerrainChunkRenderer] No maps with BMPs found, skipping pre-generation');
        return;
      }

      // Build work items: (mapName, terrainType, season)[]
      // Read terrain type from each map's INI file instead of hardcoded mapping
      const mapDataService = new MapDataService(this.mapCacheDir);
      const workItems: Array<{ mapName: string; terrainType: string; season: number }> = [];
      for (const mapName of mapDirs) {
        let terrainType = 'Earth';
        try {
          const metadata = await mapDataService.getMapMetadata(mapName);
          terrainType = metadata.terrainType;
        } catch {
          console.warn(`[TerrainChunkRenderer] Could not read INI for ${mapName}, defaulting to Earth`);
        }
        for (let s = 0; s <= 3; s++) {
          if (this.hasAtlas(terrainType, s)) workItems.push({ mapName, terrainType, season: s });
        }
      }

      if (allowedMaps) {
        console.log(`[TerrainChunkRenderer] DEV map filter active: ${[...allowedMaps].join(', ')}`);
      }
      console.log(`[TerrainChunkRenderer] Pre-generation: ${mapDirs.length} maps, ${workItems.length} map/season combos`);

      // Resolve the compiled worker path (works for both dev and packaged builds)
      const workerPath = path.join(__dirname, 'terrain-chunk-worker.js');

      this.workerPool = new WorkerPool(this.atlasData, workerPath, this.mapData);
      await this.workerPool.initialize();

      const poolSize = Math.max(2, Math.min(os.cpus().length, 8));
      // Dispatch in batches of poolSize*2: keeps workers fed without flooding the event loop.
      // After each batch completes, setImmediate() yields to RDO/WebSocket handlers.
      const DISPATCH_BATCH = poolSize * 2;
      console.log(`[TerrainChunkRenderer] Worker pool ready (${poolSize} workers, batch=${DISPATCH_BATCH})`);

      const totalT0 = Date.now();
      let totalGenerated = 0;

      for (const item of workItems) {
        if (this.stopRequested) {
          console.log('[TerrainChunkRenderer] Pre-generation stopped (shutdown requested)');
          break;
        }

        if (!this.loadMapData(item.mapName)) continue;

        const map = this.mapData.get(item.mapName)!;
        const chunksI = Math.ceil(map.height / CHUNK_SIZE);
        const chunksJ = Math.ceil(map.width / CHUNK_SIZE);
        const totalChunks = chunksI * chunksJ;

        // Count already-cached chunks (check zoom-0 as sentinel)
        let existingCount = 0;
        for (let ci = 0; ci < chunksI; ci++) {
          for (let cj = 0; cj < chunksJ; cj++) {
            if (fs.existsSync(this.getChunkCachePath(item.mapName, item.terrainType, item.season, ci, cj, MAX_ZOOM))) {
              existingCount++;
            }
          }
        }

        if (existingCount === totalChunks) {
          console.log(`[TerrainChunkRenderer] ${item.mapName}/${SEASON_NAMES[item.season as Season]}: all ${totalChunks} chunks cached`);
          this.preGenDone += totalChunks;
          this.preGenTotal += totalChunks;
          // Generate minimap preview even when all chunks are cached (idempotent, uses disk cache)
          if (!this.stopRequested) {
            try {
              await this.getTerrainPreview(item.mapName, item.terrainType, item.season);
            } catch (err: unknown) {
              console.warn(`[TerrainChunkRenderer] Preview failed for ${item.mapName}/${SEASON_NAMES[item.season as Season]}:`, err);
            }
          }
          continue;
        }

        const missing = totalChunks - existingCount;
        this.preGenTotal += missing;
        console.log(`[TerrainChunkRenderer] Pre-generating ${item.mapName} (${item.terrainType}, ${SEASON_NAMES[item.season as Season]}): ${missing} missing of ${totalChunks}`);

        const itemT0 = Date.now();
        let itemGenerated = 0;
        let batch: Promise<void>[] = [];
        let lastLoggedPct = -1;

        /** Log progress at every 5% increment (works in any terminal). */
        const logProgress = (): void => {
          const pct = Math.round((itemGenerated / missing) * 100);
          // Only log at 5% increments to avoid flooding
          const bucket = Math.floor(pct / 5) * 5;
          if (bucket > lastLoggedPct) {
            lastLoggedPct = bucket;
            const barLen = 30;
            const filled = Math.round(barLen * pct / 100);
            const bar = '#'.repeat(filled) + '-'.repeat(barLen - filled);
            console.log(`  [${bar}] ${pct}%  (${itemGenerated}/${missing})`);
          }
        };

        for (let ci = 0; ci < chunksI; ci++) {
          for (let cj = 0; cj < chunksJ; cj++) {
            if (this.stopRequested) break;

            if (fs.existsSync(this.getChunkCachePath(item.mapName, item.terrainType, item.season, ci, cj, MAX_ZOOM))) {
              continue;
            }

            const _ci = ci;
            const _cj = cj;

            batch.push(
              this.workerPool!.dispatch({
                mapName: item.mapName,
                terrainType: item.terrainType,
                season: item.season,
                chunkI: _ci,
                chunkJ: _cj,
              }).then(async (pngs) => {
                if (this.stopRequested) return;
                // pngs[0]=zoom3, pngs[1]=zoom2, pngs[2]=zoom1, pngs[3]=zoom0
                const writes: Promise<void>[] = [];
                for (let z = MAX_ZOOM; z >= 0; z--) {
                  const pngIdx = MAX_ZOOM - z;
                  const cachePath = this.getChunkCachePath(item.mapName, item.terrainType, item.season, _ci, _cj, z);
                  writes.push(
                    fsp.mkdir(path.dirname(cachePath), { recursive: true })
                      .then(() => fsp.writeFile(cachePath, pngs[pngIdx]))
                  );
                }
                await Promise.all(writes);
                itemGenerated++;
                this.preGenDone++;
              }).catch((err: unknown) => {
                console.error(`[TerrainChunkRenderer] Failed chunk ${_ci},${_cj} for ${item.mapName}:`, err);
              })
            );

            // Flush batch and yield to event loop to prevent microtask flooding.
            // This gives RDO/WebSocket handlers a chance to run between batches.
            if (batch.length >= DISPATCH_BATCH) {
              await Promise.all(batch);
              batch = [];
              logProgress();
              await new Promise<void>(r => setImmediate(r));
            }
          }
          if (this.stopRequested) break;
        }

        // Flush remaining jobs
        if (batch.length > 0) {
          await Promise.all(batch);
          batch = [];
          logProgress();
        }

        totalGenerated += itemGenerated;
        const dt = Date.now() - itemT0;
        console.log(`[TerrainChunkRenderer] ${item.mapName}/${SEASON_NAMES[item.season as Season]}: generated ${itemGenerated} chunks in ${(dt / 1000).toFixed(1)}s`);

        // Generate minimap preview for this map/season (composites Z0 chunks)
        if (!this.stopRequested) {
          try {
            await this.getTerrainPreview(item.mapName, item.terrainType, item.season);
          } catch (err: unknown) {
            console.warn(`[TerrainChunkRenderer] Preview failed for ${item.mapName}/${SEASON_NAMES[item.season as Season]}:`, err);
          }
        }
      }

      await this.workerPool.terminate();
      this.workerPool = null;

      const totalDt = Date.now() - totalT0;
      console.log(`[TerrainChunkRenderer] Pre-generation complete: ${totalGenerated} total chunks in ${(totalDt / 1000).toFixed(1)}s`);
    } finally {
      this.preGenerating = false;
    }
  }

  /**
   * Get the chunk manifest for a map/terrainType/season.
   */
  getChunkManifest(mapName: string, terrainType: string, season: number): ChunkManifest | null {
    // Try to get map dimensions
    if (!this.loadMapData(mapName)) return null;

    const map = this.mapData.get(mapName)!;

    return {
      mapName,
      terrainType,
      season,
      seasonName: SEASON_NAMES[season as Season] || 'Unknown',
      mapWidth: map.width,
      mapHeight: map.height,
      chunkSize: CHUNK_SIZE,
      chunksI: Math.ceil(map.height / CHUNK_SIZE),
      chunksJ: Math.ceil(map.width / CHUNK_SIZE),
      chunkWidth: CHUNK_CANVAS_WIDTH,
      chunkHeight: CHUNK_CANVAS_HEIGHT,
      zoomLevel: 3,
      tileWidth: ZOOM3_TILE_WIDTH,
      tileHeight: ZOOM3_TILE_HEIGHT,
      u: ZOOM3_U,
      zoomLevels: [0, 1, 2, 3]
    };
  }

  /**
   * Check if atlas data is loaded for a given terrain type and season.
   */
  hasAtlas(terrainType: string, season: number): boolean {
    return this.atlasData.has(`${terrainType}-${season}`);
  }

  /**
   * Check if a chunk PNG is cached on disk.
   */
  isChunkCached(mapName: string, terrainType: string, season: number, chunkI: number, chunkJ: number, zoomLevel: number = MAX_ZOOM): boolean {
    return fs.existsSync(this.getChunkCachePath(mapName, terrainType, season, chunkI, chunkJ, zoomLevel));
  }

  /**
   * Get the disk cache path for a chunk image.
   * Format: chunks/{mapName}/{terrainType}/{season}/z{zoom}/chunk_{i}_{j}.webp
   */
  getChunkCachePath(mapName: string, terrainType: string, season: number, chunkI: number, chunkJ: number, zoomLevel: number = MAX_ZOOM): string {
    return path.join(this.cacheDir, 'chunks', mapName, terrainType, String(season), `z${zoomLevel}`, `chunk_${chunkI}_${chunkJ}.webp`);
  }

  /**
   * Invalidate all cached chunks for a map (e.g., if atlas is regenerated).
   */
  invalidateMap(mapName: string): void {
    const mapChunkDir = path.join(this.cacheDir, 'chunks', mapName);
    if (fs.existsSync(mapChunkDir)) {
      fs.rmSync(mapChunkDir, { recursive: true, force: true });
      console.log(`[TerrainChunkRenderer] Invalidated all chunks for map: ${mapName}`);
    }
    this.mapData.delete(mapName);
  }

  /**
   * Generate a low-res preview PNG of the entire map at Z0 scale.
   * Stitches all Z0 chunks into a single image. The result is small enough
   * (~320×256 for a 1280×1024 tile map) to load instantly and use as a
   * backdrop while chunks stream in — eliminating blue triangle flicker.
   *
   * Returns the PNG buffer, or null if data isn't available.
   * Caches the result to disk for fast subsequent requests.
   */
  async getTerrainPreview(
    mapName: string,
    terrainType: string,
    season: number
  ): Promise<Buffer | null> {
    // Check disk cache first
    const cachePath = this.getPreviewCachePath(mapName, terrainType, season);
    if (fs.existsSync(cachePath)) {
      return fs.readFileSync(cachePath);
    }

    // Need map data for dimensions
    if (!this.loadMapData(mapName)) return null;
    const map = this.mapData.get(mapName)!;

    const chunksI = Math.ceil(map.height / CHUNK_SIZE);
    const chunksJ = Math.ceil(map.width / CHUNK_SIZE);

    // Z0 chunk dimensions (260×132 at CHUNK_SIZE=32)
    const z0U = 4;
    const z0TileW = 8;
    const z0TileH = 4;
    const chunkW = z0U * (2 * CHUNK_SIZE - 1) + z0TileW;   // 260
    const chunkH = z0U * CHUNK_SIZE + z0TileH;              // 132

    // Calculate preview image dimensions using the isometric layout formula.
    // Each chunk at Z0 occupies a diamond in screen space. We need to find the
    // bounding box of all chunks to determine the full image size.
    // Use the same getChunkScreenPosition formula as the client, with origin=(0,0).
    // Screen position of chunk (ci, cj):
    //   x = z0U * (mapHeight - ci*CHUNK_SIZE + cj*CHUNK_SIZE) - localOriginX
    //   y = (z0U/2) * ((mapHeight - ci*CHUNK_SIZE) + (mapWidth - cj*CHUNK_SIZE)) - localOriginY
    const localOriginX = z0U * CHUNK_SIZE; // getTileScreenPosInChunk(0,0) x
    const localOriginY = (z0U / 2) * (CHUNK_SIZE + CHUNK_SIZE); // getTileScreenPosInChunk(0,0) y

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let ci = 0; ci < chunksI; ci++) {
      for (let cj = 0; cj < chunksJ; cj++) {
        const baseI = ci * CHUNK_SIZE;
        const baseJ = cj * CHUNK_SIZE;
        const sx = z0U * (map.height - baseI + baseJ) - localOriginX;
        const sy = (z0U / 2) * ((map.height - baseI) + (map.width - baseJ)) - localOriginY;
        minX = Math.min(minX, sx);
        minY = Math.min(minY, sy);
        maxX = Math.max(maxX, sx + chunkW);
        maxY = Math.max(maxY, sy + chunkH);
      }
    }

    const previewW = Math.ceil(maxX - minX);
    const previewH = Math.ceil(maxY - minY);

    if (previewW <= 0 || previewH <= 0 || previewW > 16384 || previewH > 16384) {
      console.warn(`[TerrainChunkRenderer] Preview size out of range: ${previewW}×${previewH}`);
      return null;
    }

    // Allocate RGBA buffer for the preview
    const pixels = Buffer.alloc(previewW * previewH * 4, 0);

    // Composite all Z0 chunks into the preview buffer
    let composited = 0;
    for (let ci = 0; ci < chunksI; ci++) {
      for (let cj = 0; cj < chunksJ; cj++) {
        // Get the Z0 chunk WebP (from cache or generate)
        const chunkPng = await this.getChunk(mapName, terrainType, season, ci, cj, 0);
        if (!chunkPng) continue;

        // Decode the chunk WebP to RGBA
        const decoded = await decodeWebP(chunkPng);

        // Calculate where this chunk goes in the preview
        const baseI = ci * CHUNK_SIZE;
        const baseJ = cj * CHUNK_SIZE;
        const dstX = Math.round(z0U * (map.height - baseI + baseJ) - localOriginX - minX);
        const dstY = Math.round((z0U / 2) * ((map.height - baseI) + (map.width - baseJ)) - localOriginY - minY);

        // Blit chunk pixels with alpha blending
        blitTileWithAlpha(
          decoded.pixels, decoded.width,
          0, 0, decoded.width, decoded.height,
          pixels, previewW, previewH,
          dstX, dstY
        );
        composited++;
      }
    }

    if (composited === 0) return null;

    // Encode and cache
    const png = encodePng(previewW, previewH, pixels);
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(cachePath, png);

    console.log(`[TerrainChunkRenderer] Preview generated: ${mapName}/${season} ${previewW}×${previewH} (${(png.length / 1024).toFixed(0)} KB, ${composited} chunks)`);
    return png;
  }

  /**
   * Get disk cache path for a terrain preview PNG.
   */
  getPreviewCachePath(mapName: string, terrainType: string, season: number): string {
    return path.join(this.cacheDir, 'chunks', mapName, terrainType, String(season), 'preview.png');
  }

  /**
   * Graceful shutdown: stop background pre-generation, terminate workers, release memory.
   */
  async shutdown(): Promise<void> {
    console.log('[TerrainChunkRenderer] Shutting down...');
    this.stopRequested = true;

    // Terminate worker pool immediately (rejects pending dispatches)
    if (this.workerPool) {
      await this.workerPool.terminate();
      this.workerPool = null;
    }

    // Wait for pre-generation async function to finish its finally block
    let waitMs = 0;
    while (this.preGenerating && waitMs < 3000) {
      await new Promise(resolve => setTimeout(resolve, 50));
      waitMs += 50;
    }

    // Clear in-memory data
    this.atlasData.clear();
    this.mapData.clear();
    this.generating.clear();

    console.log('[TerrainChunkRenderer] Shutdown complete');
  }

  /**
   * Get loaded atlas count for monitoring.
   */
  getStats(): { atlasCount: number; mapCount: number; generatingCount: number; preGenerating: boolean } {
    return {
      atlasCount: this.atlasData.size,
      mapCount: this.mapData.size,
      generatingCount: this.generating.size,
      preGenerating: this.preGenerating
    };
  }
}

// ============================================================================
// WorkerPool — manages a pool of terrain-chunk-worker threads
// ============================================================================

interface ChunkJobParams {
  mapName: string;
  terrainType: string;
  season: number;
  chunkI: number;
  chunkJ: number;
}

interface PendingJob {
  params: ChunkJobParams;
  resolve: (pngs: Buffer[]) => void;
  reject: (err: Error) => void;
}

interface WorkerEntry {
  worker: Worker;
  idle: boolean;
  /** Maps that have already been sent to this worker (lazy init) */
  sentMaps: Set<string>;
}

type WorkerOutMsg =
  | { type: 'ready' }
  | { type: 'chunkDone'; jobId: string; pngs: Buffer[] }
  | { type: 'error'; jobId: string; message: string };

/**
 * Fixed-size pool of Worker threads for parallel chunk rendering.
 * Atlas data is sent to each worker once at initialization.
 * Map data is sent lazily on first use per worker.
 * Concurrency is bounded by pool size (Math.min(cpuCount, 8)).
 */
export class WorkerPool {
  private entries: WorkerEntry[] = [];
  private queue: PendingJob[] = [];
  private priorityQueue: PendingJob[] = [];
  private active = new Map<string, PendingJob>();
  private jobSeq = 0;
  private terminated = false;

  constructor(
    private readonly atlasData: Map<string, AtlasPixelData>,
    private readonly workerPath: string,
    private readonly mapData: Map<string, MapPixelData>,
  ) {}

  /** Spawn all workers and wait for each to confirm 'ready'. */
  async initialize(): Promise<void> {
    const count = Math.max(2, Math.min(os.cpus().length, 8));

    // Serialise all atlas data once (structured-clone copies it to each worker)
    const atlases = Array.from(this.atlasData.entries()).map(([key, d]) => ({
      key,
      pixels: d.pixels,
      width: d.width,
      height: d.height,
      manifest: d.manifest,
    }));

    const readyAll: Promise<void>[] = [];

    for (let i = 0; i < count; i++) {
      const worker = new Worker(this.workerPath);
      const entry: WorkerEntry = { worker, idle: false, sentMaps: new Set() };
      this.entries.push(entry);

      // Resolve once the worker echoes 'ready' after processing init
      readyAll.push(new Promise<void>((resolve, reject) => {
        const onInit = (msg: WorkerOutMsg) => {
          if (msg.type === 'ready') {
            entry.idle = true;
            worker.off('message', onInit);
            resolve();
          }
        };
        worker.once('error', reject);
        worker.on('message', onInit);
      }));

      // Register ongoing message handler (fires after onInit removes itself)
      worker.on('message', (msg: WorkerOutMsg) => this._onMessage(entry, msg));
      worker.on('error', (err) => {
        console.error('[WorkerPool] Uncaught worker error:', err);
        entry.idle = true;
        this._drain();
      });

      worker.postMessage({ type: 'init', atlases });
    }

    await Promise.all(readyAll);
  }

  /** Dispatch a chunk render job. Resolves with 4 PNG buffers [z3, z2, z1, z0]. */
  dispatch(params: ChunkJobParams): Promise<Buffer[]> {
    if (this.terminated) return Promise.reject(new Error('WorkerPool is terminated'));
    return new Promise<Buffer[]>((resolve, reject) => {
      this.queue.push({ params, resolve, reject });
      this._drain();
    });
  }

  /** Dispatch a high-priority job (client-requested chunks jump ahead of background pre-gen). */
  dispatchPriority(params: ChunkJobParams): Promise<Buffer[]> {
    if (this.terminated) return Promise.reject(new Error('WorkerPool is terminated'));
    return new Promise<Buffer[]>((resolve, reject) => {
      this.priorityQueue.push({ params, resolve, reject });
      this._drain();
    });
  }

  /** Terminate all workers. Pending jobs are rejected. */
  async terminate(): Promise<void> {
    this.terminated = true;
    for (const { reject } of this.priorityQueue) reject(new Error('WorkerPool terminated'));
    for (const { reject } of this.queue) reject(new Error('WorkerPool terminated'));
    this.priorityQueue = [];
    this.queue = [];
    await Promise.all(this.entries.map(e => e.worker.terminate()));
    this.entries = [];
  }

  private _drain(): void {
    while (this.priorityQueue.length > 0 || this.queue.length > 0) {
      const entry = this.entries.find(e => e.idle);
      if (!entry) break;

      // Priority queue drained first (client-requested chunks)
      const job = this.priorityQueue.length > 0
        ? this.priorityQueue.shift()!
        : this.queue.shift()!;
      const jobId = String(++this.jobSeq);
      this.active.set(jobId, job);
      entry.idle = false;

      const { mapName, terrainType, season, chunkI, chunkJ } = job.params;

      // Send map data lazily — once per worker per map name
      if (!entry.sentMaps.has(mapName)) {
        const mapEntry = this.mapData.get(mapName);
        if (mapEntry) {
          entry.worker.postMessage({
            type: 'mapData',
            mapName,
            indices: mapEntry.indices,
            width: mapEntry.width,
            height: mapEntry.height,
          });
          entry.sentMaps.add(mapName);
        }
      }

      entry.worker.postMessage({ type: 'renderChunk', jobId, mapName, terrainType, season, chunkI, chunkJ });
    }
  }

  private _onMessage(entry: WorkerEntry, msg: WorkerOutMsg): void {
    // 'ready' is handled by the one-shot init listener; ignore here
    if (msg.type === 'ready') return;

    const job = this.active.get(msg.jobId);
    this.active.delete(msg.jobId);
    entry.idle = true;

    if (job) {
      if (msg.type === 'chunkDone') {
        // postMessage delivers Buffers/Uint8Arrays via structured clone;
        // wrap each element as a proper Buffer for downstream callers.
        job.resolve(msg.pngs.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)));
      } else {
        job.reject(new Error(msg.message));
      }
    }

    this._drain();
  }
}
