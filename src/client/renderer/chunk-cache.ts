/**
 * ChunkCache
 *
 * Pre-renders terrain into chunks for significantly faster rendering.
 * Instead of drawing 2000+ individual tiles per frame, draws ~6-12 pre-rendered chunks.
 *
 * Performance improvement: 10-20x faster terrain rendering
 *
 * Architecture:
 * - Map divided into CHUNK_SIZE × CHUNK_SIZE tile chunks (default 32×32)
 * - Each chunk rendered once to an OffscreenCanvas
 * - Chunks contain FLAT terrain only (vegetation/special tiles replaced by their flat center equivalent)
 * - Vegetation is rendered as a separate overlay layer by IsometricMapRenderer
 * - Chunks cached by zoom level (different zoom = different cache)
 * - LRU eviction when cache exceeds MAX_CHUNKS
 * - Async rendering doesn't block main thread
 */

import { ZOOM_LEVELS, ZoomConfig, Point } from '../../shared/map-config';
import { config as appConfig } from '../../shared/config';
import { TextureCache, getFallbackColor } from './texture-cache';
import { TextureAtlasCache } from './texture-atlas-cache';
import { isSpecialTile } from '../../shared/land-utils';

// Chunk configuration
export const CHUNK_SIZE = 32; // tiles per chunk dimension (32×32 = 1024 tiles per chunk)
/**
 * Maximum cached chunks per zoom level.
 * Sized so visible chunks + preload buffer fit without LRU thrashing.
 * Memory per zoom:
 *   z0: 300 * ~135 KB = ~40 MB  (tiny 260x130 canvases)
 *   z1: 160 * ~541 KB = ~86 MB  (small 520x260 canvases)
 *   z2:  96 * ~2.1 MB = ~202 MB (medium 1040x520 canvases)
 *   z3:  48 * ~8.6 MB = ~413 MB (large 2080x1040 canvases)
 */
export const MAX_CHUNKS_PER_ZOOM: Record<number, number> = {
  0: 300,
  1: 160,
  2: 96,
  3: 48,
};

/** Bit mask to extract LandClass only (Center, variant 0) — flattens vegetation */
const FLAT_MASK = 0xC0;

// Check if OffscreenCanvas is available (not in Node.js test environment)
const isOffscreenCanvasSupported = typeof OffscreenCanvas !== 'undefined';

/**
 * Calculate chunk canvas dimensions for isometric rendering
 * Based on seamless tiling formula where tiles overlap by half their dimensions
 * Flat-only: no extra height needed for tall textures
 *
 * Height: tile (0,0) at y = u*chunkSize extends to y = u*(chunkSize+1),
 * so canvas must be at least u*(chunkSize+1) = u*chunkSize + tileHeight.
 */
function calculateChunkCanvasDimensions(chunkSize: number, config: ZoomConfig): { width: number; height: number } {
  const u = config.u;

  const width = u * (2 * chunkSize - 1) + config.tileWidth;
  const height = u * chunkSize + config.tileHeight;

  return { width, height };
}

/**
 * Calculate the screen offset for a tile within a chunk's local canvas
 * Uses seamless tiling formula where tiles overlap by half their dimensions
 */
function getTileScreenPosInChunk(
  localI: number,
  localJ: number,
  chunkSize: number,
  config: ZoomConfig
): Point {
  const u = config.u;

  const x = u * (chunkSize - localI + localJ);
  const y = (u / 2) * ((chunkSize - localI) + (chunkSize - localJ));

  return { x, y };
}

/**
 * Get the screen position of a chunk's top-left corner in the main canvas
 * Uses seamless tiling formula for consistent positioning
 */
function getChunkScreenPosition(
  chunkI: number,
  chunkJ: number,
  chunkSize: number,
  config: ZoomConfig,
  mapHeight: number,
  mapWidth: number,
  origin: Point
): Point {
  const u = config.u;

  const baseI = chunkI * chunkSize;
  const baseJ = chunkJ * chunkSize;

  // Screen position of tile (baseI, baseJ) in world space using seamless formula
  const worldX = u * (mapHeight - baseI + baseJ) - origin.x;
  const worldY = (u / 2) * ((mapHeight - baseI) + (mapWidth - baseJ)) - origin.y;

  // The chunk canvas has tile (0,0) at position getTileScreenPosInChunk(0, 0, ...)
  const localOrigin = getTileScreenPosInChunk(0, 0, chunkSize, config);

  return {
    x: worldX - localOrigin.x,
    y: worldY - localOrigin.y
  };
}

interface ChunkEntry {
  canvas: OffscreenCanvas;
  lastAccess: number;
  ready: boolean;
  rendering: boolean;
}

interface ChunkRenderRequest {
  chunkI: number;
  chunkJ: number;
  zoomLevel: number;
  resolve: () => void;
}

export class ChunkCache {
  // Cache per zoom level: Map<"chunkI,chunkJ", ChunkEntry>
  private caches: Map<number, Map<string, ChunkEntry>> = new Map();
  private accessCounter: number = 0;

  // Dependencies
  private textureCache: TextureCache;
  private atlasCache: TextureAtlasCache | null = null;
  private getTextureId: (x: number, y: number) => number;
  private mapWidth: number = 0;
  private mapHeight: number = 0;

  // Server chunk fetching
  private mapName: string = '';
  private terrainType: string = '';
  private season: number = 2; // Default to Summer
  private useServerChunks: boolean = true;
  private serverChunkFailed: boolean = false; // Set to true after first 404, disables server for session

  // Rendering queue
  private renderQueue: ChunkRenderRequest[] = [];
  private isProcessingQueue: boolean = false;

  // Debounced chunk-ready notification (reduces render thrashing at Z0/Z1)
  private chunkReadyTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly CHUNK_READY_DEBOUNCE_MS = 80; // Batch notifications within this window

  // Stats
  private stats = {
    chunksRendered: 0,
    cacheHits: 0,
    cacheMisses: 0,
    evictions: 0,
    serverChunksLoaded: 0
  };

  // Callback when chunk becomes ready
  private onChunkReady: (() => void) | null = null;

  // Pending await for viewport-ready loading
  private pendingAwait: {
    keys: Set<string>;
    total: number;
    resolve: () => void;
    onProgress?: (done: number, total: number) => void;
  } | null = null;
  private pendingAwaitTimeout: ReturnType<typeof setTimeout> | null = null;

  // Session progress tracking — session resets when the render queue goes idle→active.
  // onChunkProgress is called with (done, total) on every chunk completion and on start.
  private sessionQueued: number = 0;
  private sessionDone: number = 0;
  /** Called with (done, total) whenever chunk loading session progress changes. Public for external wiring. */
  onChunkProgress: ((done: number, total: number) => void) | null = null;

  constructor(
    textureCache: TextureCache,
    getTextureId: (x: number, y: number) => number
  ) {
    this.textureCache = textureCache;
    this.getTextureId = getTextureId;

    // Initialize cache for each zoom level
    for (let i = 0; i <= 3; i++) {
      this.caches.set(i, new Map());
    }
  }

  /**
   * Set map dimensions (call after loading map)
   */
  setMapDimensions(width: number, height: number): void {
    this.mapWidth = width;
    this.mapHeight = height;
  }

  /**
   * Set map info for server chunk fetching.
   * Call after loading a map to enable fetching pre-rendered chunks from the server.
   */
  setMapInfo(mapName: string, terrainType: string, season: number): void {
    const changed = this.mapName !== mapName || this.terrainType !== terrainType || this.season !== season;
    this.mapName = mapName;
    this.terrainType = terrainType;
    this.season = season;
    this.serverChunkFailed = false; // Reset on map change
    if (changed) {
      console.log(`[ChunkCache] Map info set: ${mapName} / ${terrainType} / season=${season}, server chunks enabled`);
    }
  }

  /**
   * Set callback for when a chunk becomes ready (triggers re-render)
   */
  setOnChunkReady(callback: () => void): void {
    this.onChunkReady = callback;
  }

  /**
   * Set texture atlas cache for atlas-based rendering.
   * When set and ready, chunks render from the atlas instead of individual textures.
   */
  setAtlasCache(atlas: TextureAtlasCache | null): void {
    this.atlasCache = atlas;
  }

  /**
   * Get cache key for a chunk
   */
  private getKey(chunkI: number, chunkJ: number): string {
    return `${chunkI},${chunkJ}`;
  }

  /**
   * Get chunk coordinates for a tile
   */
  static getChunkCoords(tileI: number, tileJ: number): { chunkI: number; chunkJ: number } {
    return {
      chunkI: Math.floor(tileI / CHUNK_SIZE),
      chunkJ: Math.floor(tileJ / CHUNK_SIZE)
    };
  }

  /**
   * Check if chunk rendering is supported (requires OffscreenCanvas)
   */
  isSupported(): boolean {
    return isOffscreenCanvasSupported;
  }

  /**
   * Get a chunk canvas (sync - returns null if not ready, triggers async render)
   */
  getChunkSync(
    chunkI: number,
    chunkJ: number,
    zoomLevel: number
  ): OffscreenCanvas | null {
    // Not supported in this environment (e.g., Node.js tests)
    if (!isOffscreenCanvasSupported) return null;

    const cache = this.caches.get(zoomLevel);
    if (!cache) return null;

    const key = this.getKey(chunkI, chunkJ);
    const entry = cache.get(key);

    if (entry && entry.ready) {
      // Move to end of Map iteration order (insertion-order LRU)
      cache.delete(key);
      cache.set(key, entry);
      this.stats.cacheHits++;
      return entry.canvas;
    }

    // Not ready - trigger async render if not already rendering
    if (!entry || !entry.rendering) {
      this.stats.cacheMisses++;
      this.queueChunkRender(chunkI, chunkJ, zoomLevel);
    }

    return null;
  }

  /**
   * Queue a chunk for async rendering
   */
  private queueChunkRender(chunkI: number, chunkJ: number, zoomLevel: number): void {
    const cache = this.caches.get(zoomLevel)!;
    const key = this.getKey(chunkI, chunkJ);

    // Mark as rendering
    if (!cache.has(key)) {
      const config = ZOOM_LEVELS[zoomLevel];
      const dims = calculateChunkCanvasDimensions(CHUNK_SIZE, config);

      cache.set(key, {
        canvas: new OffscreenCanvas(dims.width, dims.height),
        lastAccess: ++this.accessCounter,
        ready: false,
        rendering: true
      });
    } else {
      const entry = cache.get(key)!;
      entry.rendering = true;
    }

    // Session progress tracking: reset counters when queue was idle, then count this chunk
    if (this.sessionQueued === this.sessionDone) {
      this.sessionQueued = 0;
      this.sessionDone = 0;
    }
    this.sessionQueued++;
    this.onChunkProgress?.(this.sessionDone, this.sessionQueued);

    // Add to queue
    this.renderQueue.push({
      chunkI,
      chunkJ,
      zoomLevel,
      resolve: () => {}
    });

    // Process queue
    this.processRenderQueue();
  }

  /**
   * Get concurrency level based on zoom level in the current queue.
   * Z0/Z1 chunks are tiny (260×130 / 520×260 px) — safe to parallelize more aggressively.
   */
  private getConcurrency(zoomLevel: number): number {
    if (zoomLevel <= 0) return 16; // Z0: 260×130px chunks, ~20-50KB each
    if (zoomLevel <= 1) return 12; // Z1: 520×260px chunks, ~100KB each
    return 6; // Z2/Z3: larger chunks, keep at 6
  }

  /**
   * Schedule a debounced chunk-ready notification.
   * At Z0, dozens of chunks complete in rapid succession — coalescing notifications
   * reduces full pipeline re-renders from ~11 to ~2-3.
   */
  private scheduleChunkReadyNotification(): void {
    if (!this.onChunkReady) return;

    if (this.chunkReadyTimer !== null) {
      clearTimeout(this.chunkReadyTimer);
    }

    this.chunkReadyTimer = setTimeout(() => {
      this.chunkReadyTimer = null;
      if (this.onChunkReady) {
        this.onChunkReady();
      }
    }, this.CHUNK_READY_DEBOUNCE_MS);
  }

  /**
   * Process render queue with parallel fetching.
   * Concurrency scales with zoom level (tiny Z0 chunks allow more parallelism).
   * Notifications are debounced to reduce render thrashing at far zoom.
   */
  private async processRenderQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    const queueStart = performance.now();
    let processed = 0;
    const FRAME_BUDGET_MS = 8; // Yield to browser every 8ms (half a 16ms frame)

    while (this.renderQueue.length > 0) {
      const batchStart = performance.now();

      // Determine concurrency from the first item's zoom level
      const currentZoom = this.renderQueue[0].zoomLevel;
      const concurrency = this.getConcurrency(currentZoom);

      // Grab up to concurrency items from the queue
      const batch = this.renderQueue.splice(0, concurrency);

      const promises = batch.map(async (request) => {
        const t0 = performance.now();
        await this.renderChunk(request.chunkI, request.chunkJ, request.zoomLevel);
        const dt = performance.now() - t0;

        if (dt > 50) {
          console.log(`[ChunkCache] render ${request.chunkI},${request.chunkJ} z${request.zoomLevel}: ${dt.toFixed(0)}ms (queue: ${this.renderQueue.length})`);
        }
      });

      await Promise.all(promises);
      processed += batch.length;

      // Debounced notification — coalesces rapid batch completions
      this.scheduleChunkReadyNotification();

      // Frame budget: yield to browser if we've been processing too long
      if (performance.now() - batchStart > FRAME_BUDGET_MS && this.renderQueue.length > 0) {
        const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 0);
        await new Promise<void>(resolve => raf(() => resolve()));
      }
    }

    // Ensure at least one final notification fires after queue is drained
    this.scheduleChunkReadyNotification();

    // Emit final completion when session is fully done
    if (this.sessionQueued > 0 && this.sessionDone >= this.sessionQueued) {
      this.onChunkProgress?.(this.sessionQueued, this.sessionQueued);
    }

    const totalDt = performance.now() - queueStart;
    if (processed > 1) {
      console.log(`[ChunkCache] queue done: ${processed} chunks in ${totalDt.toFixed(0)}ms (avg ${(totalDt / processed).toFixed(0)}ms/chunk)`);
    }

    this.isProcessingQueue = false;
  }

  /**
   * Flatten a texture ID: replace vegetation/special tiles with their flat center equivalent.
   * Keeps LandClass (bits 7-6), zeros LandType and LandVar.
   */
  private flattenTextureId(textureId: number): number {
    if (isSpecialTile(textureId)) {
      return textureId & FLAT_MASK;
    }
    return textureId;
  }

  /**
   * Render a single chunk: try server-side pre-rendered PNG first, fall back to local rendering.
   */
  private async renderChunk(chunkI: number, chunkJ: number, zoomLevel: number): Promise<void> {
    // Try server chunk first (only if map info is set and server hasn't failed)
    if (this.useServerChunks && !this.serverChunkFailed && this.mapName) {
      const success = await this.fetchServerChunk(chunkI, chunkJ, zoomLevel);
      if (success) return;
    }

    // Fall back to local rendering
    await this.renderChunkLocally(chunkI, chunkJ, zoomLevel);
  }

  /**
   * Fetch a pre-rendered chunk PNG from the server.
   * @returns true if successful, false if failed (caller should fall back to local rendering)
   */
  private async fetchServerChunk(chunkI: number, chunkJ: number, zoomLevel: number): Promise<boolean> {
    const cache = this.caches.get(zoomLevel)!;
    const key = this.getKey(chunkI, chunkJ);
    const entry = cache.get(key);
    if (!entry) return false;

    try {
      const t0 = performance.now();
      const cdnUrl = appConfig.cdn.url;
      const cdnPath = `/chunks/${encodeURIComponent(this.mapName)}/${encodeURIComponent(this.terrainType)}/${this.season}/z${zoomLevel}/chunk_${chunkI}_${chunkJ}.webp`;
      const url = cdnUrl ? `${cdnUrl}${cdnPath}` : `/cdn${cdnPath}`;
      const response = await fetch(url);
      const tFetch = performance.now();

      if (!response.ok) {
        if (response.status === 404) {
          // Server doesn't have chunks — disable for this session
          console.warn('[ChunkCache] Server chunks not available, falling back to local rendering');
          this.serverChunkFailed = true;
        }
        return false;
      }

      const blob = await response.blob();
      const tBlob = performance.now();
      const bitmap = await createImageBitmap(blob);
      const tBitmap = performance.now();

      // Get target dimensions for this zoom level
      const config = ZOOM_LEVELS[zoomLevel];
      const dims = calculateChunkCanvasDimensions(CHUNK_SIZE, config);
      const ctx = entry.canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        return false;
      }

      ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);

      // Server provides correctly-sized chunk for each zoom level
      ctx.drawImage(bitmap, 0, 0);

      const tDraw = performance.now();
      bitmap.close();

      // Mark as ready
      entry.ready = true;
      entry.rendering = false;
      this.stats.chunksRendered++;
      this.stats.serverChunksLoaded++;

      // Evict if needed
      this.evictIfNeeded(zoomLevel);

      // Update session progress and check pending awaitChunksReady()
      this.notifyChunkComplete(key);

      // Notification is batched in processRenderQueue()

      const total = tDraw - t0;
      if (total > 30) {
        console.log(`[ChunkCache] fetch ${chunkI},${chunkJ} z${zoomLevel}: fetch=${(tFetch - t0).toFixed(0)}ms blob=${(tBlob - tFetch).toFixed(0)}ms bitmap=${(tBitmap - tBlob).toFixed(0)}ms draw=${(tDraw - tBitmap).toFixed(0)}ms total=${total.toFixed(0)}ms (${(blob.size / 1024).toFixed(0)} KB)`);
      }

      return true;
    } catch (error: unknown) {
      // Network error — fall back to local
      console.warn(`[ChunkCache] Server chunk fetch failed for ${chunkI},${chunkJ}:`, error);
      return false;
    }
  }

  /**
   * Render a single chunk locally (flat terrain only — no tall/vegetation textures).
   * This is the fallback path when server chunks are not available.
   */
  private async renderChunkLocally(chunkI: number, chunkJ: number, zoomLevel: number): Promise<void> {
    const cache = this.caches.get(zoomLevel)!;
    const key = this.getKey(chunkI, chunkJ);
    const entry = cache.get(key);

    if (!entry) return;

    const config = ZOOM_LEVELS[zoomLevel];
    const ctx = entry.canvas.getContext('2d');
    if (!ctx) return;

    // Disable image smoothing: texture scaling must produce hard (binary) alpha edges.
    // With smoothing ON, scaled tiles get semi-transparent border pixels that create
    // visible dark seam lines at chunk boundaries (compositing artifact).
    ctx.imageSmoothingEnabled = false;

    // Clear canvas
    ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);

    // Calculate tile range for this chunk
    const startI = chunkI * CHUNK_SIZE;
    const startJ = chunkJ * CHUNK_SIZE;
    const endI = Math.min(startI + CHUNK_SIZE, this.mapHeight);
    const endJ = Math.min(startJ + CHUNK_SIZE, this.mapWidth);

    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;

    // Check if atlas is available (preferred: single drawImage source rect)
    const atlas = this.atlasCache?.isReady() ? this.atlasCache : null;

    if (atlas) {
      // ===== ATLAS-BASED RENDERING =====
      const atlasImg = atlas.getAtlas()!;

      for (let i = startI; i < endI; i++) {
        for (let j = startJ; j < endJ; j++) {
          const textureId = this.flattenTextureId(this.getTextureId(j, i));

          const rect = atlas.getTileRect(textureId);
          const localI = i - startI;
          const localJ = j - startJ;
          const screenPos = getTileScreenPosInChunk(localI, localJ, CHUNK_SIZE, config);
          const x = Math.round(screenPos.x);
          const y = Math.round(screenPos.y);

          if (rect) {
            ctx.drawImage(
              atlasImg,
              rect.sx, rect.sy, rect.sw, rect.sh,
              x - halfWidth, y,
              config.tileWidth, config.tileHeight
            );
          } else {
            // Fallback color for missing tiles
            const color = getFallbackColor(textureId);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + halfWidth, y + halfHeight);
            ctx.lineTo(x, y + config.tileHeight);
            ctx.lineTo(x - halfWidth, y + halfHeight);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    } else {
      // ===== INDIVIDUAL TEXTURE RENDERING (fallback) =====
      // Collect unique texture IDs for preloading
      const textureIds = new Set<number>();
      for (let i = startI; i < endI; i++) {
        for (let j = startJ; j < endJ; j++) {
          textureIds.add(this.flattenTextureId(this.getTextureId(j, i)));
        }
      }

      // Preload all textures for this chunk (season is set on textureCache)
      await this.textureCache.preload(Array.from(textureIds));

      for (let i = startI; i < endI; i++) {
        for (let j = startJ; j < endJ; j++) {
          const textureId = this.flattenTextureId(this.getTextureId(j, i));
          const texture = this.textureCache.getTextureSync(textureId);

          const localI = i - startI;
          const localJ = j - startJ;
          const screenPos = getTileScreenPosInChunk(localI, localJ, CHUNK_SIZE, config);
          const x = Math.round(screenPos.x);
          const y = Math.round(screenPos.y);

          if (texture) {
            ctx.drawImage(
              texture,
              x - halfWidth, y,
              config.tileWidth, config.tileHeight
            );
          } else {
            const color = getFallbackColor(textureId);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + halfWidth, y + halfHeight);
            ctx.lineTo(x, y + config.tileHeight);
            ctx.lineTo(x - halfWidth, y + halfHeight);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }

    // Mark as ready
    entry.ready = true;
    entry.rendering = false;
    this.stats.chunksRendered++;

    // Evict if needed
    this.evictIfNeeded(zoomLevel);

    // Update session progress and check pending awaitChunksReady()
    this.notifyChunkComplete(key);

    // Notification is batched in processRenderQueue()
  }

  /**
   * Draw a chunk to the main canvas
   */
  drawChunkToCanvas(
    ctx: CanvasRenderingContext2D,
    chunkI: number,
    chunkJ: number,
    zoomLevel: number,
    origin: Point
  ): boolean {
    const chunk = this.getChunkSync(chunkI, chunkJ, zoomLevel);
    if (!chunk) return false;

    const config = ZOOM_LEVELS[zoomLevel];
    const screenPos = getChunkScreenPosition(
      chunkI,
      chunkJ,
      CHUNK_SIZE,
      config,
      this.mapHeight,
      this.mapWidth,
      origin
    );

    ctx.drawImage(chunk, Math.round(screenPos.x), Math.round(screenPos.y));
    return true;
  }

  /**
   * Draw a chunk if it's already cached (no async render trigger).
   * Used by the ground layer cache to avoid re-queuing evicted chunks.
   */
  drawChunkIfReady(
    ctx: CanvasRenderingContext2D,
    chunkI: number,
    chunkJ: number,
    zoomLevel: number,
    origin: Point
  ): boolean {
    if (!isOffscreenCanvasSupported) return false;

    const cache = this.caches.get(zoomLevel);
    if (!cache) return false;

    const key = this.getKey(chunkI, chunkJ);
    const entry = cache.get(key);
    if (!entry || !entry.ready) return false;

    // Move to end of Map iteration order (insertion-order LRU)
    cache.delete(key);
    cache.set(key, entry);

    const config = ZOOM_LEVELS[zoomLevel];
    const screenPos = getChunkScreenPosition(
      chunkI,
      chunkJ,
      CHUNK_SIZE,
      config,
      this.mapHeight,
      this.mapWidth,
      origin
    );

    ctx.drawImage(entry.canvas, Math.round(screenPos.x), Math.round(screenPos.y));
    return true;
  }

  /**
   * Get screen position of a chunk for visibility testing
   */
  getChunkScreenBounds(
    chunkI: number,
    chunkJ: number,
    zoomLevel: number,
    origin: Point
  ): { x: number; y: number; width: number; height: number } {
    const config = ZOOM_LEVELS[zoomLevel];
    const dims = calculateChunkCanvasDimensions(CHUNK_SIZE, config);
    const screenPos = getChunkScreenPosition(
      chunkI,
      chunkJ,
      CHUNK_SIZE,
      config,
      this.mapHeight,
      this.mapWidth,
      origin
    );

    return {
      x: screenPos.x,
      y: screenPos.y,
      width: dims.width,
      height: dims.height
    };
  }

  /**
   * Get visible chunk range from pre-computed tile bounds.
   * O(1) — converts tile bounds to chunk bounds with ±1 padding for isometric overlap.
   */
  getVisibleChunksFromBounds(
    tileBounds: { minI: number; maxI: number; minJ: number; maxJ: number }
  ): { minChunkI: number; maxChunkI: number; minChunkJ: number; maxChunkJ: number } {
    const maxChunkI = Math.ceil(this.mapHeight / CHUNK_SIZE);
    const maxChunkJ = Math.ceil(this.mapWidth / CHUNK_SIZE);

    return {
      minChunkI: Math.max(0, Math.floor(tileBounds.minI / CHUNK_SIZE) - 1),
      maxChunkI: Math.min(maxChunkI - 1, Math.floor(tileBounds.maxI / CHUNK_SIZE) + 1),
      minChunkJ: Math.max(0, Math.floor(tileBounds.minJ / CHUNK_SIZE) - 1),
      maxChunkJ: Math.min(maxChunkJ - 1, Math.floor(tileBounds.maxJ / CHUNK_SIZE) + 1),
    };
  }

  /**
   * Preload chunks for a specific area (anticipate pan)
   */
  preloadChunks(
    centerChunkI: number,
    centerChunkJ: number,
    radius: number,
    zoomLevel: number
  ): void {
    const maxChunkI = Math.ceil(this.mapHeight / CHUNK_SIZE);
    const maxChunkJ = Math.ceil(this.mapWidth / CHUNK_SIZE);

    for (let di = -radius; di <= radius; di++) {
      for (let dj = -radius; dj <= radius; dj++) {
        const ci = centerChunkI + di;
        const cj = centerChunkJ + dj;

        if (ci >= 0 && ci < maxChunkI && cj >= 0 && cj < maxChunkJ) {
          // This will trigger async render if not cached
          this.getChunkSync(ci, cj, zoomLevel);
        }
      }
    }
  }

  /**
   * Wait for specific chunks to become ready.
   * Triggers loading for each chunk via getChunkSync(), then returns a Promise
   * that resolves once all specified chunks have entry.ready === true.
   * Includes a safety timeout (default 15s) to prevent infinite waiting.
   */
  awaitChunksReady(
    chunks: Array<{ i: number; j: number }>,
    zoomLevel: number,
    timeoutMs: number = 15_000,
    onProgress?: (done: number, total: number) => void
  ): Promise<void> {
    const cache = this.caches.get(zoomLevel);
    if (!cache) return Promise.resolve();

    // Determine which chunks are not yet ready
    const pendingKeys = new Set<string>();
    for (const { i, j } of chunks) {
      const key = this.getKey(i, j);
      const entry = cache.get(key);
      if (!entry || !entry.ready) {
        pendingKeys.add(key);
      }
    }

    // All already ready — resolve immediately
    if (pendingKeys.size === 0) {
      onProgress?.(chunks.length, chunks.length);
      return Promise.resolve();
    }

    // Emit initial progress (0/total)
    onProgress?.(chunks.length - pendingKeys.size, chunks.length);

    // Trigger loading for all pending chunks
    for (const { i, j } of chunks) {
      const key = this.getKey(i, j);
      if (pendingKeys.has(key)) {
        this.getChunkSync(i, j, zoomLevel);
      }
    }

    return new Promise<void>((resolve) => {
      this.pendingAwait = { keys: pendingKeys, total: chunks.length, resolve, onProgress };

      // Safety timeout — resolve even if some chunks fail
      this.pendingAwaitTimeout = setTimeout(() => {
        if (this.pendingAwait) {
          console.warn(`[ChunkCache] awaitChunksReady timed out with ${this.pendingAwait.keys.size} chunks remaining`);
          this.pendingAwait.resolve();
          this.pendingAwait = null;
          this.pendingAwaitTimeout = null;
        }
      }, timeoutMs);
    });
  }

  /**
   * Called when a chunk becomes ready. Updates session progress and checks pending await.
   */
  private notifyChunkComplete(key: string): void {
    this.sessionDone++;
    this.onChunkProgress?.(this.sessionDone, this.sessionQueued);
    this.checkPendingAwait(key);
  }

  /**
   * Check if a newly-ready chunk satisfies a pending awaitChunksReady() call.
   */
  private checkPendingAwait(key: string): void {
    if (!this.pendingAwait) return;
    this.pendingAwait.keys.delete(key);
    const done = this.pendingAwait.total - this.pendingAwait.keys.size;
    this.pendingAwait.onProgress?.(done, this.pendingAwait.total);
    if (this.pendingAwait.keys.size === 0) {
      if (this.pendingAwaitTimeout !== null) {
        clearTimeout(this.pendingAwaitTimeout);
        this.pendingAwaitTimeout = null;
      }
      this.pendingAwait.resolve();
      this.pendingAwait = null;
    }
  }

  /**
   * LRU eviction for a specific zoom level
   */
  private evictIfNeeded(zoomLevel: number): void {
    const cache = this.caches.get(zoomLevel)!;

    const maxChunks = MAX_CHUNKS_PER_ZOOM[zoomLevel] ?? 96;
    while (cache.size > maxChunks) {
      // Insertion-order LRU: first key in Map is the oldest accessed
      const firstKey = cache.keys().next().value;
      if (firstKey === undefined) break;

      const entry = cache.get(firstKey);
      // Skip entries still rendering (move to end and try next)
      if (entry && (!entry.ready || entry.rendering)) {
        cache.delete(firstKey);
        cache.set(firstKey, entry);
        break; // Safety: avoid infinite loop if all entries are rendering
      }

      cache.delete(firstKey);
      this.stats.evictions++;
    }
  }

  /**
   * Clear cache for a specific zoom level (call when zoom changes)
   */
  clearZoomLevel(zoomLevel: number): void {
    const cache = this.caches.get(zoomLevel);
    if (cache) {
      cache.clear();
    }
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
    this.renderQueue = [];
    // Cancel any pending debounced notification
    if (this.chunkReadyTimer !== null) {
      clearTimeout(this.chunkReadyTimer);
      this.chunkReadyTimer = null;
    }
    // Cancel any pending awaitChunksReady
    if (this.pendingAwait) {
      if (this.pendingAwaitTimeout !== null) {
        clearTimeout(this.pendingAwaitTimeout);
        this.pendingAwaitTimeout = null;
      }
      this.pendingAwait.resolve();
      this.pendingAwait = null;
    }
    this.stats = {
      chunksRendered: 0,
      cacheHits: 0,
      cacheMisses: 0,
      evictions: 0,
      serverChunksLoaded: 0
    };
  }

  /**
   * Invalidate a specific chunk (e.g., if terrain changes)
   */
  invalidateChunk(chunkI: number, chunkJ: number, zoomLevel?: number): void {
    if (zoomLevel !== undefined) {
      const cache = this.caches.get(zoomLevel);
      if (cache) {
        cache.delete(this.getKey(chunkI, chunkJ));
      }
    } else {
      // Invalidate at all zoom levels
      for (const cache of this.caches.values()) {
        cache.delete(this.getKey(chunkI, chunkJ));
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    chunksRendered: number;
    cacheHits: number;
    cacheMisses: number;
    evictions: number;
    serverChunksLoaded: number;
    hitRate: number;
    cacheSizes: Record<number, number>;
    queueLength: number;
  } {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    const cacheSizes: Record<number, number> = {};

    for (const [level, cache] of this.caches) {
      cacheSizes[level] = cache.size;
    }

    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.cacheHits / total : 0,
      cacheSizes,
      queueLength: this.renderQueue.length
    };
  }
}
