/**
 * IsometricTerrainRenderer
 *
 * Core isometric rendering engine based on Lander.pas algorithm.
 * Renders FLAT terrain from BMP texture IDs using diamond-shaped isometric tiles.
 *
 * All vegetation/special tiles are automatically flattened to their base center
 * equivalent (landId & 0xC0). Vegetation is rendered as a separate overlay
 * by IsometricMapRenderer.
 */

import { TerrainLoader } from './terrain-loader';
import { CoordinateMapper } from './coordinate-mapper';
import { TextureCache, getFallbackColor } from './texture-cache';
import { TextureAtlasCache } from './texture-atlas-cache';
import { ChunkCache, CHUNK_SIZE } from './chunk-cache';
import { isSpecialTile, rotateLandId } from '../../shared/land-utils';
import {
  Point,
  Rect,
  TileBounds,
  ZOOM_LEVELS,
  ZoomConfig,
  Rotation,
  TerrainData,
  Season,
  SEASON_NAMES,
  getTerrainTypeForMap
} from '../../shared/map-config';

/** Bit mask to extract LandClass only (Center, variant 0) — flattens vegetation */
const FLAT_MASK = 0xC0;

export class IsometricTerrainRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Core components
  private terrainLoader: TerrainLoader;
  private coordMapper: CoordinateMapper;
  private textureCache: TextureCache;
  private atlasCache: TextureAtlasCache;
  private chunkCache: ChunkCache | null = null;

  // Rendering mode
  private useTextures: boolean = true;
  private useChunks: boolean = true; // Use chunk-based rendering (10-20x faster)
  private showDebugInfo: boolean = true; // Show debug info overlay

  // View state
  private zoomLevel: number = 2;  // Default zoom (16×32 pixels per tile)
  private rotation: Rotation = Rotation.NORTH;
  private season: Season = Season.SUMMER;  // Default season for textures

  // Camera position in map coordinates (center tile)
  private cameraI: number = 500;
  private cameraJ: number = 500;

  // Screen origin (for Lander.pas formula)
  private origin: Point = { x: 0, y: 0 };

  // State flags
  private loaded: boolean = false;
  private mapName: string = '';

  // Z0 terrain preview — a single low-res image of the entire map used as an
  // instant backdrop while chunks stream in (eliminates blue triangle flicker)
  private terrainPreview: ImageBitmap | null = null;
  private terrainPreviewLoading: boolean = false;
  // Preview origin offset: the preview image's (0,0) corresponds to chunk (0,0)'s
  // screen position. We store the world-space offset so we can position it correctly.
  private previewOriginX: number = 0;
  private previewOriginY: number = 0;

  // Available seasons for current terrain type (auto-detected from server)
  private availableSeasons: Season[] = [Season.WINTER, Season.SPRING, Season.SUMMER, Season.AUTUMN];

  // Rendering stats (for debug info)
  private lastRenderStats = {
    tilesRendered: 0,
    renderTimeMs: 0,
    visibleBounds: { minI: 0, maxI: 0, minJ: 0, maxJ: 0 } as TileBounds
  };

  // Mouse interaction state
  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  // Render debouncing (prevents flickering when multiple chunks become ready)
  private pendingRenderRequest: number | null = null;

  // External render callback: when set, chunk-ready events delegate to the parent renderer
  // instead of triggering terrain-only renders (which cause blinking)
  private onRenderNeeded: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, options?: { disableMouseControls?: boolean }) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context');
    }
    this.ctx = ctx;

    // Initialize components (mapper will be resized after map load)
    this.terrainLoader = new TerrainLoader();
    this.coordMapper = new CoordinateMapper(2000, 2000);
    this.textureCache = new TextureCache();
    this.atlasCache = new TextureAtlasCache();

    // Setup event handlers (can be disabled when used as a sub-renderer)
    if (!options?.disableMouseControls) {
      this.setupMouseControls();
    }
    this.setupResizeHandler();

    // Initial render (loading state)
    this.render();
  }

  /**
   * Load terrain data for a map
   * @param mapName - Name of the map (e.g., 'Shamba', 'Antiqua')
   */
  async loadMap(mapName: string): Promise<TerrainData> {
    // Set terrain type for texture loading
    const terrainType = getTerrainTypeForMap(mapName);
    this.textureCache.setTerrainType(terrainType);
    this.atlasCache.setTerrainType(terrainType);

    // Query available seasons from server and auto-select if current season is unavailable
    await this.fetchAvailableSeasons(terrainType);

    // Set season on atlas cache and trigger atlas load (non-blocking)
    this.atlasCache.setSeason(this.season);
    this.atlasCache.loadAtlas().then(() => {
      // Re-render and clear chunks when atlas becomes available
      if (this.atlasCache.isReady()) {
        this.chunkCache?.clearAll();
        this.requestRender();
      }
    });

    // Load terrain data
    const terrainData = await this.terrainLoader.loadMap(mapName);

    // Update coordinate mapper with actual map dimensions
    this.coordMapper = new CoordinateMapper(
      terrainData.width,
      terrainData.height
    );

    // Initialize chunk cache for fast terrain rendering
    this.chunkCache = new ChunkCache(
      this.textureCache,
      (x, y) => this.terrainLoader.getTextureId(x, y)
    );
    this.chunkCache.setAtlasCache(this.atlasCache);
    this.chunkCache.setMapDimensions(terrainData.width, terrainData.height);
    this.chunkCache.setMapInfo(mapName, terrainType, this.season);
    this.chunkCache.setOnChunkReady(() => {
      if (this.onRenderNeeded) {
        // Delegate to parent renderer for full-pipeline render (prevents blinking)
        this.onRenderNeeded();
      } else {
        this.requestRender();
      }
    });

    // Center camera on map
    this.cameraI = Math.floor(terrainData.height / 2);
    this.cameraJ = Math.floor(terrainData.width / 2);

    // Update origin for centered view
    this.updateOrigin();

    this.mapName = mapName;
    this.loaded = true;

    // Load terrain preview image (non-blocking — instant Z0 backdrop)
    this.loadTerrainPreview(mapName, terrainType, this.season);

    // Render the loaded map
    this.render();

    return terrainData;
  }

  /**
   * Load the terrain preview image — a single low-res image of the entire map.
   * Used as an instant backdrop at Z0/Z1 while chunks stream in.
   */
  private async loadTerrainPreview(mapName: string, terrainType: string, season: number): Promise<void> {
    if (this.terrainPreviewLoading) return;
    this.terrainPreviewLoading = true;

    try {
      const url = `/api/terrain-preview/${encodeURIComponent(mapName)}/${encodeURIComponent(terrainType)}/${season}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.log(`[IsometricRenderer] Terrain preview not available (${response.status})`);
        return;
      }

      const blob = await response.blob();
      this.terrainPreview = await createImageBitmap(blob);

      // Calculate the preview origin offset using the same formula as Z0 chunk positioning.
      // The preview image's top-left corresponds to the minimum screen position across all chunks.
      // We compute this the same way the server does when stitching chunks.
      const mapH = this.terrainLoader.getDimensions().height;
      const mapW = this.terrainLoader.getDimensions().width;
      const z0U = 4;
      const chunkSize = 32; // CHUNK_SIZE
      const localOriginX = z0U * chunkSize;
      const localOriginY = (z0U / 2) * (chunkSize + chunkSize);

      const chunksI = Math.ceil(mapH / chunkSize);
      const chunksJ = Math.ceil(mapW / chunkSize);

      let minX = Infinity, minY = Infinity;
      for (let ci = 0; ci < chunksI; ci++) {
        for (let cj = 0; cj < chunksJ; cj++) {
          const baseI = ci * chunkSize;
          const baseJ = cj * chunkSize;
          const sx = z0U * (mapH - baseI + baseJ) - localOriginX;
          const sy = (z0U / 2) * ((mapH - baseI) + (mapW - baseJ)) - localOriginY;
          minX = Math.min(minX, sx);
          minY = Math.min(minY, sy);
        }
      }

      this.previewOriginX = minX;
      this.previewOriginY = minY;

      console.log(`[IsometricRenderer] Terrain preview loaded: ${this.terrainPreview.width}×${this.terrainPreview.height}`);
      this.requestRender();
    } catch (error) {
      console.warn('[IsometricRenderer] Failed to load terrain preview:', error);
    } finally {
      this.terrainPreviewLoading = false;
    }
  }

  /**
   * Fetch available seasons for a terrain type from server
   * Auto-selects the default season if current season is not available
   */
  private async fetchAvailableSeasons(terrainType: string): Promise<void> {
    try {
      const url = `/api/terrain-info/${encodeURIComponent(terrainType)}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`[IsometricRenderer] Failed to fetch terrain info for ${terrainType}: ${response.status}`);
        return;
      }

      const info = await response.json() as {
        terrainType: string;
        availableSeasons: Season[];
        defaultSeason: Season;
      };

      this.availableSeasons = info.availableSeasons;

      // If current season is not available, switch to default
      if (!info.availableSeasons.includes(this.season)) {
        this.season = info.defaultSeason;
        this.textureCache.setSeason(info.defaultSeason);
        this.atlasCache.setSeason(info.defaultSeason);
        // Clear chunk cache since season changed
        this.chunkCache?.clearAll();
      }
    } catch (error) {
      console.warn(`[IsometricRenderer] Error fetching terrain info:`, error);
    }
  }

  /**
   * Update origin based on camera position
   * The origin is the screen offset that centers the camera tile
   * Uses CoordinateMapper to properly account for rotation
   */
  private updateOrigin(): void {
    // Calculate camera screen position using CoordinateMapper (rotation-aware)
    // Pass origin={0,0} to get the raw screen position without offset
    const cameraScreen = this.coordMapper.mapToScreen(
      this.cameraI, this.cameraJ,
      this.zoomLevel,
      this.rotation,
      { x: 0, y: 0 }
    );

    // Origin makes camera position appear at canvas center
    // Round to integers to prevent sub-pixel chunk positioning (causes seam lines)
    this.origin = {
      x: Math.round(cameraScreen.x - this.canvas.width / 2),
      y: Math.round(cameraScreen.y - this.canvas.height / 2)
    };
  }

  /**
   * Request a render (debounced via requestAnimationFrame)
   * This prevents flickering when multiple chunks become ready simultaneously
   */
  private requestRender(): void {
    if (this.pendingRenderRequest !== null) {
      // Render already scheduled for next frame
      return;
    }

    this.pendingRenderRequest = requestAnimationFrame(() => {
      this.pendingRenderRequest = null;
      this.render();
    });
  }

  /**
   * Main render loop
   */
  render(): void {
    const startTime = performance.now();

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas with dark background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    if (!this.loaded) {
      // Show loading message
      ctx.fillStyle = '#666';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Loading terrain data...', width / 2, height / 2);
      return;
    }

    // Update origin for current camera position
    this.updateOrigin();

    // Get viewport bounds
    const viewport: Rect = {
      x: 0,
      y: 0,
      width: width,
      height: height
    };

    // Calculate visible tile bounds
    const bounds = this.coordMapper.getVisibleBounds(
      viewport,
      this.zoomLevel,
      this.rotation,
      this.origin
    );

    // Render terrain layer
    const tilesRendered = this.renderTerrainLayer(bounds);

    // Render debug info (if not disabled by parent renderer)
    if (this.showDebugInfo) {
      this.renderDebugInfo(bounds, tilesRendered);
    }

    // Update stats
    this.lastRenderStats = {
      tilesRendered,
      renderTimeMs: performance.now() - startTime,
      visibleBounds: bounds
    };
  }

  /**
   * Render the terrain layer (flat only — no vegetation/tall textures)
   * Uses chunk-based rendering for performance (10-20x faster)
   * Falls back to tile-by-tile rendering when chunks not available or rotation is active
   */
  private renderTerrainLayer(bounds: TileBounds): number {
    // Use chunk-based rendering only for NORTH rotation (chunk layout is rotation-unaware)
    if (this.useChunks && this.chunkCache && this.chunkCache.isSupported() && this.rotation === Rotation.NORTH) {
      return this.renderTerrainLayerChunked(bounds);
    }

    // Fallback: tile-by-tile rendering (supports all rotations via CoordinateMapper)
    return this.renderTerrainLayerTiles(bounds);
  }

  /**
   * Chunk-based terrain rendering (fast path)
   * Renders pre-cached chunks instead of individual tiles.
   * At Z0/Z1, draws the terrain preview image as an instant backdrop while chunks load.
   */
  private renderTerrainLayerChunked(bounds: TileBounds): number {
    if (!this.chunkCache) return 0;

    const ctx = this.ctx;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    // Disable image smoothing while drawing chunk canvases to prevent
    // edge bleeding artifacts (dark seam lines between chunks)
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;

    // At Z0/Z1, draw the terrain preview as a base layer before chunks.
    // This provides an instant visual while chunks stream in (no blue triangles).
    if (this.terrainPreview && this.zoomLevel <= 1) {
      this.drawTerrainPreview(ctx);
    }

    // Get visible chunk range from tile bounds (O(1) instead of O(N²))
    const visibleChunks = this.chunkCache.getVisibleChunksFromBounds(bounds);

    let chunksDrawn = 0;
    let tilesRendered = 0;

    // Track actually-visible chunks for preload centering
    let visMinI = visibleChunks.maxChunkI, visMaxI = visibleChunks.minChunkI;
    let visMinJ = visibleChunks.maxChunkJ, visMaxJ = visibleChunks.minChunkJ;

    // Draw visible chunks (with viewport clipping to skip off-screen chunks)
    for (let ci = visibleChunks.minChunkI; ci <= visibleChunks.maxChunkI; ci++) {
      for (let cj = visibleChunks.minChunkJ; cj <= visibleChunks.maxChunkJ; cj++) {
        // Viewport clipping: skip chunks that don't intersect the screen
        const screenBounds = this.chunkCache.getChunkScreenBounds(ci, cj, this.zoomLevel, this.origin);
        if (screenBounds.x + screenBounds.width < 0 || screenBounds.x > canvasWidth ||
            screenBounds.y + screenBounds.height < 0 || screenBounds.y > canvasHeight) {
          continue;
        }

        // Track visible range for preload
        visMinI = Math.min(visMinI, ci);
        visMaxI = Math.max(visMaxI, ci);
        visMinJ = Math.min(visMinJ, cj);
        visMaxJ = Math.max(visMaxJ, cj);

        const drawn = this.chunkCache.drawChunkToCanvas(
          ctx,
          ci, cj,
          this.zoomLevel,
          this.origin
        );

        if (drawn) {
          chunksDrawn++;
          tilesRendered += CHUNK_SIZE * CHUNK_SIZE;
        } else if (this.zoomLevel >= 2) {
          // Chunk not ready - render individual tiles for this chunk
          // Skip at Z0/Z1: tiles are 8×4 / 16×8 px — fallback diamonds are invisible
          // and cost ~1024 fill ops per chunk (up to 65K total at Z0)
          tilesRendered += this.renderChunkTilesFallback(ci, cj);
        }
      }
    }

    // Preload neighboring chunks (anticipate pan) using actually-visible center
    // At z0/z1, visible area is already large; preload only immediate neighbors
    // At z2/z3, visible area is smaller; preload wider ring for smoother panning
    if (visMinI <= visMaxI) {
      const preloadRadius = this.zoomLevel <= 1 ? 1 : 2;
      const centerChunkI = Math.floor((visMinI + visMaxI) / 2);
      const centerChunkJ = Math.floor((visMinJ + visMaxJ) / 2);
      this.chunkCache.preloadChunks(centerChunkI, centerChunkJ, preloadRadius, this.zoomLevel);
    }

    // Restore image smoothing for non-chunk rendering (text, overlays, etc.)
    ctx.imageSmoothingEnabled = prevSmoothing;

    return tilesRendered;
  }

  /**
   * Render individual tiles for a chunk that isn't cached yet
   * Flat only — all special tiles are flattened
   */
  private renderChunkTilesFallback(chunkI: number, chunkJ: number): number {
    const config = ZOOM_LEVELS[this.zoomLevel];
    const tileWidth = config.tileWidth;
    const tileHeight = config.tileHeight;

    const startI = chunkI * CHUNK_SIZE;
    const startJ = chunkJ * CHUNK_SIZE;
    const endI = Math.min(startI + CHUNK_SIZE, this.terrainLoader.getDimensions().height);
    const endJ = Math.min(startJ + CHUNK_SIZE, this.terrainLoader.getDimensions().width);

    let tilesRendered = 0;

    for (let i = startI; i < endI; i++) {
      for (let j = startJ; j < endJ; j++) {
        let textureId = this.terrainLoader.getTextureId(j, i);
        // Flatten special tiles to their base center equivalent
        if (isSpecialTile(textureId)) {
          textureId = textureId & FLAT_MASK;
        }
        // Rotate directional border textures so edges align with the rotated view
        if (this.rotation !== Rotation.NORTH) {
          textureId = rotateLandId(textureId, this.rotation);
        }

        const screenPos = this.coordMapper.mapToScreen(
          i, j,
          this.zoomLevel,
          this.rotation,
          this.origin
        );

        // Skip if off-screen
        if (screenPos.x < -tileWidth || screenPos.x > this.canvas.width + tileWidth ||
            screenPos.y < -tileHeight || screenPos.y > this.canvas.height + tileHeight) {
          continue;
        }

        this.drawIsometricTile(Math.round(screenPos.x), Math.round(screenPos.y), config, textureId);
        tilesRendered++;
      }
    }

    return tilesRendered;
  }

  /**
   * Draw the terrain preview image as a backdrop.
   * The preview is a single image of the entire map at Z0 scale, positioned
   * using the same isometric projection as chunks. At Z1 we scale it 2×.
   */
  private drawTerrainPreview(ctx: CanvasRenderingContext2D): void {
    if (!this.terrainPreview) return;

    // The preview was generated at Z0 scale. At Z1, scale it 2×.
    const scale = this.zoomLevel === 0 ? 1 : 2;

    // Position: the preview's (0,0) in world-space is at (previewOriginX, previewOriginY).
    // Apply the camera origin offset to get screen coordinates.
    const drawX = (this.previewOriginX * scale) - this.origin.x;
    const drawY = (this.previewOriginY * scale) - this.origin.y;
    const drawW = this.terrainPreview.width * scale;
    const drawH = this.terrainPreview.height * scale;

    ctx.drawImage(this.terrainPreview, drawX, drawY, drawW, drawH);
  }

  /**
   * Tile-by-tile terrain rendering (slow path, fallback for non-NORTH rotations)
   * Flat only — all special tiles are flattened
   */
  private renderTerrainLayerTiles(bounds: TileBounds): number {
    const config = ZOOM_LEVELS[this.zoomLevel];
    const tileWidth = config.tileWidth;
    const tileHeight = config.tileHeight;

    let tilesRendered = 0;

    // Render tiles in back-to-front order (painter's algorithm)
    for (let i = bounds.minI; i <= bounds.maxI; i++) {
      for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
        let textureId = this.terrainLoader.getTextureId(j, i);
        // Flatten special tiles to their base center equivalent
        if (isSpecialTile(textureId)) {
          textureId = textureId & FLAT_MASK;
        }
        // Rotate directional border textures so edges align with the rotated view
        if (this.rotation !== Rotation.NORTH) {
          textureId = rotateLandId(textureId, this.rotation);
        }

        const screenPos = this.coordMapper.mapToScreen(
          i, j,
          this.zoomLevel,
          this.rotation,
          this.origin
        );

        // Skip if off-screen
        if (screenPos.x < -tileWidth || screenPos.x > this.canvas.width + tileWidth ||
            screenPos.y < -tileHeight || screenPos.y > this.canvas.height + tileHeight) {
          continue;
        }

        this.drawIsometricTile(Math.round(screenPos.x), Math.round(screenPos.y), config, textureId);
        tilesRendered++;
      }
    }

    return tilesRendered;
  }

  /**
   * Draw a single isometric diamond tile (flat terrain only)
   *
   * When textures are available: Draw the texture
   * When textures are NOT available: Draw a diamond-shaped fallback color
   */
  private drawIsometricTile(
    screenX: number,
    screenY: number,
    config: ZoomConfig,
    textureId: number
  ): void {
    const ctx = this.ctx;
    const halfWidth = config.tileWidth / 2;  // u
    const halfHeight = config.tileHeight / 2;

    // Try to get texture if textures are enabled
    let texture: ImageBitmap | null = null;
    if (this.useTextures) {
      texture = this.textureCache.getTextureSync(textureId);
    }

    if (texture) {
      ctx.drawImage(
        texture,
        screenX - halfWidth,
        screenY,
        config.tileWidth,
        config.tileHeight
      );
    } else {
      // No texture available - draw a diamond-shaped fallback color
      const color = this.textureCache.getFallbackColor(textureId);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);                           // top
      ctx.lineTo(screenX + halfWidth, screenY + halfHeight);  // right
      ctx.lineTo(screenX, screenY + config.tileHeight);       // bottom
      ctx.lineTo(screenX - halfWidth, screenY + halfHeight);  // left
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * Render debug information overlay
   */
  private renderDebugInfo(bounds: TileBounds, tilesRendered: number): void {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.zoomLevel];
    const cacheStats = this.textureCache.getStats();
    const chunkStats = this.chunkCache?.getStats();

    // Draw info panel background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, 10, 420, 210);

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';

    const availableSeasonStr = this.availableSeasons.length === 1
      ? `(only ${SEASON_NAMES[this.availableSeasons[0]]})`
      : `(${this.availableSeasons.length} available)`;

    const lines = [
      `Map: ${this.mapName} (${this.terrainLoader.getDimensions().width}×${this.terrainLoader.getDimensions().height})`,
      `Terrain: ${this.textureCache.getTerrainType()} | Season: ${SEASON_NAMES[this.season]} ${availableSeasonStr}`,
      `Camera: (${Math.round(this.cameraI)}, ${Math.round(this.cameraJ)})`,
      `Zoom Level: ${this.zoomLevel} (${config.tileWidth}×${config.tileHeight}px)`,
      `Visible: i[${bounds.minI}..${bounds.maxI}] j[${bounds.minJ}..${bounds.maxJ}]`,
      `Tiles Rendered: ${tilesRendered}`,
      `Textures: ${this.useTextures ? 'ON' : 'OFF'} | Cache: ${cacheStats.size}/${cacheStats.maxSize} (${(cacheStats.hitRate * 100).toFixed(1)}% hit)`,
      `Chunks: ${this.useChunks ? 'ON' : 'OFF'} | Cached: ${chunkStats?.cacheSizes[this.zoomLevel] || 0} (${((chunkStats?.hitRate || 0) * 100).toFixed(1)}% hit)`,
      `Render Time: ${this.lastRenderStats.renderTimeMs.toFixed(2)}ms`,
      `Controls: Drag=Pan, Wheel=Zoom, T=Textures, C=Chunks, S=Season`
    ];

    lines.forEach((line, index) => {
      ctx.fillText(line, 20, 30 + index * 18);
    });
  }

  /**
   * Setup mouse controls for pan and zoom
   */
  private setupMouseControls(): void {
    // Mouse wheel for zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();

      const oldZoom = this.zoomLevel;

      if (e.deltaY > 0) {
        // Zoom out
        this.zoomLevel = Math.max(0, this.zoomLevel - 1);
      } else {
        // Zoom in
        this.zoomLevel = Math.min(3, this.zoomLevel + 1);
      }

      if (oldZoom !== this.zoomLevel) {
        this.render();
      }
    });

    // Mouse down - start drag
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) { // Left or right click
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
      }
    });

    // Mouse move - drag to pan
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;

      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;

      // Convert screen delta to map delta (rotation-aware)
      const config = ZOOM_LEVELS[this.zoomLevel];
      const u = config.u;

      const a = (dx + 2 * dy) / (2 * u);
      const b = (2 * dy - dx) / (2 * u);

      let deltaI: number;
      let deltaJ: number;
      switch (this.rotation) {
        case Rotation.NORTH: deltaI = a;  deltaJ = b;  break;
        case Rotation.EAST:  deltaI = -b; deltaJ = a;  break;
        case Rotation.SOUTH: deltaI = -a; deltaJ = -b; break;
        case Rotation.WEST:  deltaI = b;  deltaJ = -a; break;
        default:             deltaI = a;  deltaJ = b;
      }

      this.cameraI += deltaI;
      this.cameraJ += deltaJ;

      // Clamp to map bounds
      const dims = this.terrainLoader.getDimensions();
      this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
      this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      this.render();
    });

    // Mouse up - stop drag
    const stopDrag = () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
      }
    };

    this.canvas.addEventListener('mouseup', stopDrag);
    this.canvas.addEventListener('mouseleave', stopDrag);

    // Prevent context menu on right-click
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Initial cursor
    this.canvas.style.cursor = 'grab';

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      if (e.key === 't' || e.key === 'T') {
        this.toggleTextures();
      }
      if (e.key === 'c' || e.key === 'C') {
        this.toggleChunks();
      }
      if (e.key === 's' || e.key === 'S') {
        this.cycleSeason();
      }
    });
  }

  /**
   * Setup window resize handler
   */
  private setupResizeHandler(): void {
    const resizeObserver = new ResizeObserver(() => {
      this.canvas.width = this.canvas.clientWidth;
      this.canvas.height = this.canvas.clientHeight;
      this.render();
    });
    resizeObserver.observe(this.canvas);
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Set zoom level (0-3)
   */
  setZoomLevel(level: number): void {
    this.zoomLevel = Math.max(0, Math.min(3, level));
    this.render();
  }

  /**
   * Get current zoom level
   */
  getZoomLevel(): number {
    return this.zoomLevel;
  }

  /**
   * Enable/disable debug info rendering
   * Used when a parent renderer handles its own debug overlay
   */
  setShowDebugInfo(show: boolean): void {
    this.showDebugInfo = show;
  }

  /**
   * Set rotation (90° snap: N/E/S/W)
   * Clears chunk cache since chunks are rendered without rotation
   */
  setRotation(rotation: Rotation): void {
    if (this.rotation !== rotation) {
      this.rotation = rotation;
      // Chunk cache renders tiles at non-rotated positions, so clear on rotation change
      this.chunkCache?.clearAll();
      this.render();
    }
  }

  /**
   * Get current rotation
   */
  getRotation(): Rotation {
    return this.rotation;
  }

  /**
   * Pan camera by delta in map coordinates
   */
  pan(deltaI: number, deltaJ: number): void {
    this.cameraI += deltaI;
    this.cameraJ += deltaJ;

    // Clamp to map bounds
    const dims = this.terrainLoader.getDimensions();
    this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
    this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));

    this.render();
  }

  /**
   * Center camera on specific map coordinates
   */
  centerOn(i: number, j: number): void {
    this.cameraI = i;
    this.cameraJ = j;

    // Clamp to map bounds
    const dims = this.terrainLoader.getDimensions();
    this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
    this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));

    this.render();
  }

  /**
   * Get camera position
   */
  getCameraPosition(): { i: number; j: number } {
    return { i: this.cameraI, j: this.cameraJ };
  }

  /**
   * Get the current screen origin (for coordinate mapping)
   * Origin is computed so that camera position appears at canvas center
   */
  getOrigin(): Point {
    return this.origin;
  }

  /**
   * Convert screen coordinates to map coordinates
   */
  screenToMap(screenX: number, screenY: number): Point {
    return this.coordMapper.screenToMap(
      screenX, screenY,
      this.zoomLevel,
      this.rotation,
      this.origin
    );
  }

  /**
   * Convert map coordinates to screen coordinates
   */
  mapToScreen(i: number, j: number): Point {
    return this.coordMapper.mapToScreen(
      i, j,
      this.zoomLevel,
      this.rotation,
      this.origin
    );
  }

  /**
   * Get terrain loader (for accessing terrain data)
   */
  getTerrainLoader(): TerrainLoader {
    return this.terrainLoader;
  }

  /**
   * Get coordinate mapper
   */
  getCoordinateMapper(): CoordinateMapper {
    return this.coordMapper;
  }

  /**
   * Get texture cache for advanced operations
   */
  getTextureCache(): TextureCache {
    return this.textureCache;
  }

  /**
   * Get atlas cache for vegetation overlay rendering
   */
  getAtlasCache(): TextureAtlasCache {
    return this.atlasCache;
  }

  /**
   * Get chunk cache for direct chunk rendering (used by ground layer cache)
   */
  getChunkCache(): ChunkCache | null {
    return this.chunkCache;
  }

  /**
   * Invalidate specific chunks (e.g., after dynamic content changes)
   */
  invalidateChunks(chunkI: number, chunkJ: number): void {
    this.chunkCache?.invalidateChunk(chunkI, chunkJ);
  }

  /**
   * Check if map is loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Get map name
   */
  getMapName(): string {
    return this.mapName;
  }

  /**
   * Get last render statistics
   */
  getRenderStats(): typeof this.lastRenderStats {
    return { ...this.lastRenderStats };
  }

  /**
   * Set external render callback.
   * When set, chunk-ready events call this instead of triggering a terrain-only render.
   * This prevents blinking: the parent renderer can do a full-pipeline render
   * (terrain + buildings + roads) instead of a terrain-only render.
   */
  setOnRenderNeeded(callback: (() => void) | null): void {
    this.onRenderNeeded = callback;
  }

  /**
   * Clear chunk caches for zoom levels far from the current one.
   * Keeps current and ±1 adjacent zoom levels to allow smooth transitions.
   */
  clearDistantZoomCaches(currentZoom: number): void {
    if (!this.chunkCache) return;
    for (let z = 0; z <= 3; z++) {
      if (Math.abs(z - currentZoom) > 1) {
        this.chunkCache.clearZoomLevel(z);
      }
    }
  }

  /**
   * Destroy renderer and release all resources.
   * Cancels pending RAF, clears all caches.
   */
  destroy(): void {
    if (this.pendingRenderRequest !== null) {
      cancelAnimationFrame(this.pendingRenderRequest);
      this.pendingRenderRequest = null;
    }
    this.onRenderNeeded = null;
    this.terrainLoader.unload();
    this.textureCache.clear();
    this.atlasCache.clear();
    this.chunkCache?.clearAll();
    this.chunkCache = null;
    this.loaded = false;
  }

  /**
   * Unload and cleanup
   */
  unload(): void {
    this.terrainLoader.unload();
    this.textureCache.clear();
    this.atlasCache.clear();
    this.chunkCache?.clearAll();
    this.chunkCache = null;
    this.loaded = false;
    this.mapName = '';
    this.render();
  }

  // =========================================================================
  // TEXTURE API
  // =========================================================================

  /**
   * Toggle texture rendering on/off
   */
  toggleTextures(): void {
    this.useTextures = !this.useTextures;
    console.log(`[IsometricRenderer] Textures: ${this.useTextures ? 'ON' : 'OFF'}`);
    this.render();
  }

  /**
   * Toggle chunk-based rendering on/off
   * When OFF, uses tile-by-tile rendering (slower but useful for debugging)
   */
  toggleChunks(): void {
    this.useChunks = !this.useChunks;
    console.log(`[IsometricRenderer] Chunks: ${this.useChunks ? 'ON' : 'OFF'}`);
    this.render();
  }

  /**
   * Set texture rendering mode
   */
  setTextureMode(enabled: boolean): void {
    this.useTextures = enabled;
    this.render();
  }

  /**
   * Check if texture rendering is enabled
   */
  isTextureMode(): boolean {
    return this.useTextures;
  }

  /**
   * Preload textures for visible area
   */
  async preloadTextures(): Promise<void> {
    if (!this.loaded) return;

    const viewport: Rect = {
      x: 0,
      y: 0,
      width: this.canvas.width,
      height: this.canvas.height
    };

    const bounds = this.coordMapper.getVisibleBounds(
      viewport,
      this.zoomLevel,
      this.rotation,
      this.origin
    );

    // Collect unique texture IDs in visible area
    const textureIds = new Set<number>();
    for (let i = bounds.minI; i <= bounds.maxI; i++) {
      for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
        textureIds.add(this.terrainLoader.getTextureId(j, i));
      }
    }

    // Preload all visible textures
    await this.textureCache.preload(Array.from(textureIds));
    this.render();
  }

  // =========================================================================
  // SEASON API
  // =========================================================================

  /**
   * Set the season for terrain textures
   * @param season - Season (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
   */
  setSeason(season: Season): void {
    if (this.season !== season) {
      this.season = season;
      this.textureCache.setSeason(season);
      this.atlasCache.setSeason(season);
      // Clear chunk cache and update map info since textures changed
      this.chunkCache?.clearAll();
      if (this.mapName) {
        const terrainType = getTerrainTypeForMap(this.mapName);
        this.chunkCache?.setMapInfo(this.mapName, terrainType, season);
      }
      console.log(`[IsometricRenderer] Season changed to ${SEASON_NAMES[season]}`);
      // Trigger atlas reload for new season (non-blocking)
      this.atlasCache.loadAtlas().then(() => {
        if (this.atlasCache.isReady()) {
          this.chunkCache?.clearAll();
          this.requestRender();
        }
      });
      this.render();
    }
  }

  /**
   * Get current season
   */
  getSeason(): Season {
    return this.season;
  }

  /**
   * Get current season name
   */
  getSeasonName(): string {
    return SEASON_NAMES[this.season];
  }

  /**
   * Cycle to next season (for keyboard shortcut)
   * Only cycles through available seasons for this terrain type
   */
  cycleSeason(): void {
    if (this.availableSeasons.length <= 1) {
      console.log(`[IsometricRenderer] Only one season available, cannot cycle`);
      return;
    }

    // Find current index in available seasons
    const currentIndex = this.availableSeasons.indexOf(this.season);
    const nextIndex = (currentIndex + 1) % this.availableSeasons.length;
    const nextSeason = this.availableSeasons[nextIndex];
    this.setSeason(nextSeason);
  }

  /**
   * Get available seasons for current terrain type
   */
  getAvailableSeasons(): Season[] {
    return [...this.availableSeasons];
  }
}
