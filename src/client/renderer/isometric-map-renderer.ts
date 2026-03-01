/**
 * IsometricMapRenderer
 *
 * Complete map renderer using isometric terrain with game objects (buildings, roads, overlays).
 *
 * Layers (back to front):
 * 1. Terrain base (IsometricTerrainRenderer) — flat only, no vegetation
 * 2. Vegetation overlay — special terrain tiles (trees, decorations)
 * 3. Concrete (pavement around buildings)
 * 4. Roads
 * 5. Buildings
 * 6. Zone overlay (colored zones)
 * 7. Placement preview
 * 8. Road drawing preview
 * 9. UI overlays
 */

import { IsometricTerrainRenderer } from './isometric-terrain-renderer';
import { GameObjectTextureCache } from './game-object-texture-cache';
import { VegetationFlatMapper } from './vegetation-flat-mapper';
import { TouchHandler2D } from './touch-handler-2d';
import {
  Point,
  Rect,
  TileBounds,
  ZOOM_LEVELS,
  ZoomConfig,
  Rotation,
  Season,
  TerrainData
} from '../../shared/map-config';
import {
  MapBuilding,
  MapSegment,
  SurfaceData,
  FacilityDimensions,
  RoadDrawingState
} from '../../shared/types';
import {
  RoadsRendering,
  RoadBlockClassManager,
  renderRoadSegment,
  loadRoadBlockClassFromIni,
  RoadBlockId,
  roadBlockId,
  detectSmoothCorner,
  isJunctionTopology,
  rotateRoadBlockId,

  isBridge,
  ROAD_TYPE,
  LandClass,
  LandType,
  landClassOf,
  landTypeOf,
  isWater
} from './road-texture-system';
import { formatLandId, landTypeName, landClassName, decodeLandId, isSpecialTile, rotateLandId } from '../../shared/land-utils';
import {
  ConcreteBlockClassManager,
  loadConcreteBlockClassFromIni,
  getConcreteId,
  buildNeighborConfig,
  canReceiveConcrete,
  CONCRETE_NONE,
  CONCRETE_FULL,
  PLATFORM_IDS,
  PLATFORM_SHIFT,
  ConcreteMapData,
  ConcreteCfg
} from './concrete-texture-system';
// painter-algorithm's (i+j) sort is NORTH-only; we use screenY-based sort instead
import { CarClassManager } from './car-class-system';
import { VehicleAnimationSystem } from './vehicle-animation-system';

interface CachedZone {
  x: number;
  y: number;
  w: number;
  h: number;
  buildings: MapBuilding[];
  segments: MapSegment[];
  lastLoadTime: number; // Timestamp when zone was loaded
  forceRefresh?: boolean; // Flag to force reload on next visibility check
}

interface PlacementPreview {
  i: number;  // Map coordinate i
  j: number;  // Map coordinate j
  buildingName: string;
  cost: number;
  area: number;
  zoneRequirement: string;
  xsize: number;
  ysize: number;
  visualClass: string;  // For loading the building texture preview
}

/**
 * Zone Request Manager
 *
 * Manages zone loading with:
 * - Movement-aware request delays (send when movement stops, not during)
 * - Zoom-based delay strategy (Z3 immediate, Z0 longest delay)
 * - Request queue with prioritization by distance to camera
 * - Server-safe concurrent request limit (max 3)
 * - Timeout handling and cleanup
 */
class ZoneRequestManager {
  // Queue of pending zone requests (sorted by priority)
  private zoneQueue: Array<{x: number, y: number, priority: number}> = [];

  // Currently loading zones with timestamps for timeout detection
  private loadingZones: Map<string, number> = new Map();

  // Movement state tracking
  private isMoving: boolean = false;
  private movementStopTimer: number | null = null;

  // Zoom-based delay configuration (milliseconds)
  private readonly ZOOM_DELAYS = {
    0: 500,  // Z0 (farthest) - wait for movement fully stops
    1: 300,  // Z1 - moderate delay
    2: 100,  // Z2 - short delay
    3: 0     // Z3 (closest) - immediate
  };

  // Server limit: max 3 concurrent requests
  private readonly MAX_CONCURRENT = 3;
  private readonly REQUEST_TIMEOUT = 15000; // 15s timeout

  // Zone staleness threshold (5 minutes)
  private readonly ZONE_EXPIRY_MS = 5 * 60 * 1000;

  constructor(
    private onLoadZone: (x: number, y: number, w: number, h: number) => void,
    private zoneSize: number = 64
  ) {}

  /**
   * Mark camera as moving (called during pan/zoom/rotate)
   */
  public markMoving(): void {
    this.isMoving = true;

    // Clear any pending movement stop timer
    if (this.movementStopTimer !== null) {
      clearTimeout(this.movementStopTimer);
      this.movementStopTimer = null;
    }
  }

  /**
   * Mark camera as stopped (called after pan/zoom/rotate ends)
   * Triggers delayed zone loading based on zoom level
   */
  public markStopped(currentZoom: number): void {
    this.isMoving = false;

    // Clear any pending timer
    if (this.movementStopTimer !== null) {
      clearTimeout(this.movementStopTimer);
    }

    // Use zoom-based delay
    const delay = this.ZOOM_DELAYS[currentZoom as keyof typeof this.ZOOM_DELAYS] || 500;

    this.movementStopTimer = window.setTimeout(() => {
      this.processQueue();
    }, delay);
  }

  /**
   * Request zones for visible area
   * Queues all needed zones and processes them based on movement state
   */
  public requestVisibleZones(
    visibleBounds: TileBounds,
    cachedZones: Map<string, CachedZone>,
    cameraPos: {i: number, j: number},
    currentZoom: number
  ): void {
    // Calculate zone boundaries (aligned to zoneSize grid)
    const minI = Math.min(visibleBounds.minI, visibleBounds.maxI);
    const maxI = Math.max(visibleBounds.minI, visibleBounds.maxI);
    const minJ = Math.min(visibleBounds.minJ, visibleBounds.maxJ);
    const maxJ = Math.max(visibleBounds.minJ, visibleBounds.maxJ);

    const startZoneX = Math.floor(minJ / this.zoneSize) * this.zoneSize;
    const endZoneX = Math.ceil(maxJ / this.zoneSize) * this.zoneSize;
    const startZoneY = Math.floor(minI / this.zoneSize) * this.zoneSize;
    const endZoneY = Math.ceil(maxI / this.zoneSize) * this.zoneSize;

    // Collect zones that need loading (new or stale)
    const zonesToAdd: Array<{x: number, y: number, priority: number}> = [];
    const now = Date.now();

    for (let zx = startZoneX; zx < endZoneX; zx += this.zoneSize) {
      for (let zy = startZoneY; zy < endZoneY; zy += this.zoneSize) {
        const key = `${zx},${zy}`;
        const cached = cachedZones.get(key);

        // Check if zone needs refresh
        let needsLoad = false;

        if (!cached) {
          // Zone not loaded yet
          needsLoad = true;
        } else {
          // Zone exists - check if stale or force refresh
          const age = now - cached.lastLoadTime;
          const isStale = age > this.ZONE_EXPIRY_MS;

          if (cached.forceRefresh || isStale) {
            // Remove stale zone from cache so it gets reloaded
            cachedZones.delete(key);
            needsLoad = true;

            if (isStale) {
              console.log(`[ZoneRequestManager] Zone ${key} is stale (${Math.floor(age / 1000)}s old), reloading`);
            } else {
              console.log(`[ZoneRequestManager] Zone ${key} marked for force refresh, reloading`);
            }
          }
        }

        if (!needsLoad) {
          continue;
        }

        // Skip if already loading
        if (this.loadingZones.has(key)) {
          continue;
        }

        // Skip if already in queue
        if (this.zoneQueue.some(z => z.x === zx && z.y === zy)) {
          continue;
        }

        // Calculate priority (distance to camera center)
        const centerX = zx + this.zoneSize / 2;
        const centerY = zy + this.zoneSize / 2;
        const distSq = (centerX - cameraPos.j) ** 2 + (centerY - cameraPos.i) ** 2;

        zonesToAdd.push({ x: zx, y: zy, priority: distSq });
      }
    }

    // Add new zones to queue and sort by priority (closest first)
    this.zoneQueue.push(...zonesToAdd);
    this.zoneQueue.sort((a, b) => a.priority - b.priority);

    // For Z3 (closest zoom), process immediately even during movement
    if (currentZoom === 3 && !this.isMoving) {
      this.processQueue();
    }
  }

  /**
   * Process zone queue - send requests up to concurrent limit
   */
  private processQueue(): void {
    // Clean up timed-out requests
    this.cleanupTimedOutRequests();

    // Calculate how many requests we can send
    const currentLoading = this.loadingZones.size;
    const slotsAvailable = this.MAX_CONCURRENT - currentLoading;

    if (slotsAvailable <= 0 || this.zoneQueue.length === 0) {
      return;
    }

    // Send up to slotsAvailable requests
    const zonesToRequest = this.zoneQueue.splice(0, slotsAvailable);

    for (const zone of zonesToRequest) {
      const key = `${zone.x},${zone.y}`;
      this.loadingZones.set(key, Date.now());
      this.onLoadZone(zone.x, zone.y, this.zoneSize, this.zoneSize);
    }
  }

  /**
   * Mark zone as loaded (called when response arrives)
   */
  public markZoneLoaded(x: number, y: number): void {
    // Align to zone grid
    const alignedX = Math.floor(x / this.zoneSize) * this.zoneSize;
    const alignedY = Math.floor(y / this.zoneSize) * this.zoneSize;
    const key = `${alignedX},${alignedY}`;

    this.loadingZones.delete(key);

    // Process more zones if queue not empty
    if (this.zoneQueue.length > 0 && !this.isMoving) {
      this.processQueue();
    }
  }

  /**
   * Clean up requests that have timed out
   */
  private cleanupTimedOutRequests(): void {
    const now = Date.now();
    const timedOut: string[] = [];

    this.loadingZones.forEach((timestamp, key) => {
      if (now - timestamp > this.REQUEST_TIMEOUT) {
        timedOut.push(key);
      }
    });

    timedOut.forEach(key => {
      console.warn(`[ZoneRequestManager] Zone ${key} request timed out`);
      this.loadingZones.delete(key);
    });
  }

  /**
   * Clear all pending requests and queue
   */
  public clear(): void {
    this.zoneQueue = [];
    this.loadingZones.clear();
    this.isMoving = false;

    if (this.movementStopTimer !== null) {
      clearTimeout(this.movementStopTimer);
      this.movementStopTimer = null;
    }
  }

  /**
   * Get current queue size (for debugging)
   */
  public getQueueSize(): number {
    return this.zoneQueue.length;
  }

  /**
   * Get current loading count (for debugging)
   */
  public getLoadingCount(): number {
    return this.loadingZones.size;
  }
}

export class IsometricMapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Core terrain renderer
  private terrainRenderer: IsometricTerrainRenderer;

  // Vegetation→flat mapping near dynamic content
  private vegetationMapper: VegetationFlatMapper;

  // Game object texture cache (roads, buildings, etc.)
  private gameObjectTextureCache: GameObjectTextureCache;

  // Game objects
  private cachedZones: Map<string, CachedZone> = new Map();
  private allBuildings: MapBuilding[] = [];
  private allSegments: MapSegment[] = [];

  // Road tiles map for texture type detection
  private roadTilesMap: Map<string, boolean> = new Map();

  // Pre-computed concrete adjacency tiles (tiles within 1 tile of any building)
  private concreteTilesSet: Set<string> = new Set();

  // Pre-computed building occupation map — invalidated on zone change, reused across frame
  private cachedOccupiedTiles: Set<string> | null = null;

  // Road texture system
  private roadBlockClassManager: RoadBlockClassManager;
  private roadsRendering: RoadsRendering | null = null;
  private roadBlockClassesLoaded: boolean = false;

  // Concrete texture system
  private concreteBlockClassManager: ConcreteBlockClassManager;
  private concreteBlockClassesLoaded: boolean = false;

  // Building dimensions cache
  private facilityDimensionsCache: Map<string, FacilityDimensions> = new Map();

  // Mouse state
  private isDragging: boolean = false;
  private rightClickDragged: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private hoveredBuilding: MapBuilding | null = null;
  private selectedBuilding: MapBuilding | null = null;
  private selectedBuildingDrawnTop: { x: number; y: number; textureHeight: number } | null = null;
  private selectionPulseTime: number = 0;
  private mouseMapI: number = 0;
  private mouseMapJ: number = 0;
  private mouseHasEnteredCanvas: boolean = false;

  // Zone loading - managed by ZoneRequestManager
  private zoneRequestManager: ZoneRequestManager | null = null;

  // Callbacks
  private onLoadZone: ((x: number, y: number, w: number, h: number) => void) | null = null;
  private onBuildingClick: ((x: number, y: number, visualClass?: string) => void) | null = null;
  private onCancelPlacement: (() => void) | null = null;
  private onPlacementConfirm: ((x: number, y: number) => void) | null = null;
  private onFetchFacilityDimensions: ((visualClass: string) => Promise<FacilityDimensions | null>) | null = null;
  private onRoadSegmentComplete: ((x1: number, y1: number, x2: number, y2: number) => void) | null = null;
  private onCancelRoadDrawing: (() => void) | null = null;
  private onRoadDemolishClick: ((x: number, y: number) => void) | null = null;
  private onEmptyMapClick: (() => void) | null = null;

  // Zone overlay
  private zoneOverlayEnabled: boolean = false;
  private zoneOverlayData: SurfaceData | null = null;
  private zoneOverlayX1: number = 0;
  private zoneOverlayY1: number = 0;

  // Placement preview
  private placementPreview: PlacementPreview | null = null;
  private placementMode: boolean = false;

  // Road drawing
  private roadDrawingMode: boolean = false;
  private roadDrawingState: RoadDrawingState = {
    isDrawing: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    isMouseDown: false,
    mouseDownTime: 0
  };
  private roadCostPerTile: number = 2000000;

  // Map loaded flag
  private mapLoaded: boolean = false;
  private mapName: string = '';

  // Debug mode
  private debugMode: boolean = false;
  private debugShowTileInfo: boolean = true;
  private debugShowBuildingInfo: boolean = true;
  private debugShowConcreteInfo: boolean = true;
  private debugShowRoadInfo: boolean = false;
  private debugShowWaterGrid: boolean = false;

  // Debug: track why each concrete tile was added (building buffer / junction 3×3)
  private debugConcreteSourceMap: Map<string, 'building' | 'junction'> = new Map();

  // Touch handler for mobile
  private touchHandler: TouchHandler2D | null = null;

  // Vegetation display control
  private vegetationEnabled: boolean = true;
  private hideVegetationOnMove: boolean = false;
  private isCameraMoving: boolean = false;
  private cameraStopTimer: number | null = null;
  private readonly CAMERA_STOP_DEBOUNCE_MS = 200;

  // Render debouncing (RAF-based, prevents redundant renders per frame)
  private pendingRender: number | null = null;

  // Ground layer cache (OffscreenCanvas bakes terrain+veg+concrete+roads at Z2/Z3)
  private groundCanvas: OffscreenCanvas | null = null;
  private groundCtx: OffscreenCanvasRenderingContext2D | null = null;
  private groundCacheValid: boolean = false;
  private groundCacheZoom: number = -1;
  private groundCacheRotation: Rotation = Rotation.NORTH;
  private groundCacheOriginX: number = 0;
  private groundCacheOriginY: number = 0;
  // Extra frustum culling padding during ground cache rebuild (extends viewport clip)
  private cullingPadding: number = 0;

  // Vehicle animation system
  private carClassManager: CarClassManager = new CarClassManager();
  private vehicleSystem: VehicleAnimationSystem | null = null;
  private vehicleSystemReady: boolean = false;
  private animationLoopRunning: boolean = false;
  private lastRenderTime: number = 0;

  constructor(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas with id "${canvasId}" not found`);
    }

    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context');
    }
    this.ctx = ctx;

    // Create terrain renderer (shares canvas, mouse controls handled by this class)
    this.terrainRenderer = new IsometricTerrainRenderer(canvas, { disableMouseControls: true });

    // Create vegetation→flat mapper (replaces vegetation textures near buildings/roads)
    this.vegetationMapper = new VegetationFlatMapper(2);

    // Disable terrain renderer's debug info - this renderer handles its own overlay at the end
    this.terrainRenderer.setShowDebugInfo(false);

    // Wire up render delegation: when terrain chunks become ready, rebuild ground cache
    // and trigger a full-pipeline render (prevents blinking where buildings/roads disappear)
    this.terrainRenderer.setOnRenderNeeded(() => {
      // Invalidate content (new chunks available) but keep position valid
      this.groundCacheValid = false;
      this.requestRender();
    });

    // Create game object texture cache (roads, buildings, etc.)
    this.gameObjectTextureCache = new GameObjectTextureCache();

    // Setup callback to re-render when textures are loaded
    this.gameObjectTextureCache.setOnTextureLoaded((category, name) => {
      if (category === 'BuildingImages' || category === 'RoadBlockImages' || category === 'ConcreteImages' || category === 'CarImages') {
        // Re-render when textures become available (debounced)
        this.requestRender();
      }
    });

    // Load road, concrete, and car atlases in parallel (single render when all done)
    Promise.all([
      this.gameObjectTextureCache.loadObjectAtlas('road'),
      this.gameObjectTextureCache.loadObjectAtlas('concrete'),
      this.gameObjectTextureCache.loadObjectAtlas('car'),
    ]).then(() => this.requestRender());

    // Initialize road block class manager
    this.roadBlockClassManager = new RoadBlockClassManager();
    this.roadBlockClassManager.setBasePath('/cache/');

    // Load road block classes asynchronously
    this.loadRoadBlockClasses();

    // Initialize concrete block class manager
    this.concreteBlockClassManager = new ConcreteBlockClassManager();
    this.concreteBlockClassManager.setBasePath('/cache/');

    // Load concrete block classes asynchronously
    this.loadConcreteBlockClasses();

    // Load car classes and initialize vehicle animation system
    this.loadCarClasses();

    // Setup event handlers
    this.setupMouseControls();
    this.setupKeyboardControls();
    this.setupTouchControls();

    // Initial render
    this.render();
  }

  /**
   * Setup keyboard controls for map rotation, zoom, and debug overlays.
   * Skips when focus is in a text input or when a UI modal/panel is active
   * (those keys are handled by useKeyboardShortcuts).
   */
  private setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
      // Skip when typing in form fields
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      // 'Q' rotates counter-clockwise (NORTH→WEST→SOUTH→EAST→NORTH)
      if (e.key === 'q' || e.key === 'Q') {
        this.rotateCounterClockwise();
      }
      // '+' or '=' zooms in
      if (e.key === '+' || e.key === '=') {
        this.zoomIn();
      }
      // '-' zooms out
      if (e.key === '-') {
        this.zoomOut();
      }
      // Debug sub-overlays (only active when debug mode is on)
      if (e.key === '1' && this.debugMode) {
        this.debugShowTileInfo = !this.debugShowTileInfo;
        this.requestRender();
      }
      if (e.key === '2' && this.debugMode) {
        this.debugShowBuildingInfo = !this.debugShowBuildingInfo;
        this.requestRender();
      }
      if (e.key === '3' && this.debugMode) {
        this.debugShowConcreteInfo = !this.debugShowConcreteInfo;
        this.requestRender();
      }
      if (e.key === '4' && this.debugMode) {
        this.debugShowWaterGrid = !this.debugShowWaterGrid;
        this.requestRender();
      }
      if (e.key === '5' && this.debugMode) {
        this.debugShowRoadInfo = !this.debugShowRoadInfo;
        this.requestRender();
      }
    });
  }

  /**
   * Rotate view clockwise (Q: NORTH→EAST→SOUTH→WEST→NORTH)
   */
  private rotateClockwise(): void {
    const current = this.terrainRenderer.getRotation();
    const next = (current + 1) % 4 as Rotation;
    this.terrainRenderer.setRotation(next);
    this.markCameraMoving();

    // Clear vehicles on rotation change (CarPaths are in tile-local coords)
    if (this.vehicleSystem) this.vehicleSystem.clear();

    // Mark zone request manager and trigger delayed zone load
    if (this.zoneRequestManager) {
      const currentZoom = this.terrainRenderer.getZoomLevel();
      this.zoneRequestManager.markMoving();
      this.zoneRequestManager.markStopped(currentZoom);
    }
    this.checkVisibleZones();

    console.log(`[IsometricMapRenderer] Rotation: ${Rotation[next]}`);
    this.requestRender();
  }

  /**
   * Rotate view counter-clockwise (E: NORTH→WEST→SOUTH→EAST→NORTH)
   */
  private rotateCounterClockwise(): void {
    const current = this.terrainRenderer.getRotation();
    const next = (current + 3) % 4 as Rotation; // +3 is equivalent to -1 mod 4
    this.terrainRenderer.setRotation(next);
    this.markCameraMoving();

    // Clear vehicles on rotation change (CarPaths are in tile-local coords)
    if (this.vehicleSystem) this.vehicleSystem.clear();

    // Mark zone request manager and trigger delayed zone load
    if (this.zoneRequestManager) {
      const currentZoom = this.terrainRenderer.getZoomLevel();
      this.zoneRequestManager.markMoving();
      this.zoneRequestManager.markStopped(currentZoom);
    }
    this.checkVisibleZones();

    console.log(`[IsometricMapRenderer] Rotation: ${Rotation[next]}`);
    this.requestRender();
  }

  public zoomIn(): void {
    this.terrainRenderer.setZoomLevel(this.terrainRenderer.getZoomLevel() + 1);
    if (this.zoneRequestManager) {
      this.zoneRequestManager.markStopped(this.terrainRenderer.getZoomLevel());
    }
    this.requestRender();
  }

  public zoomOut(): void {
    this.terrainRenderer.setZoomLevel(this.terrainRenderer.getZoomLevel() - 1);
    if (this.zoneRequestManager) {
      this.zoneRequestManager.markStopped(this.terrainRenderer.getZoomLevel());
    }
    this.requestRender();
  }

  /**
   * Setup touch controls for mobile (pan, pinch-zoom, rotation snap, double-tap)
   */
  private setupTouchControls(): void {
    this.touchHandler = new TouchHandler2D(this.canvas, {
      onPan: (dx, dy) => {
        // Convert screen delta to map delta (rotation-aware, same logic as mouse drag)
        const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
        const u = config.u;
        const a = (dx + 2 * dy) / (4 * u);
        const b = (2 * dy - dx) / (4 * u);

        let deltaI: number;
        let deltaJ: number;
        switch (this.terrainRenderer.getRotation()) {
          case Rotation.NORTH: deltaI = a;  deltaJ = b;  break;
          case Rotation.EAST:  deltaI = -b; deltaJ = a;  break;
          case Rotation.SOUTH: deltaI = -a; deltaJ = -b; break;
          case Rotation.WEST:  deltaI = b;  deltaJ = -a; break;
          default:             deltaI = a;  deltaJ = b;
        }
        this.terrainRenderer.pan(deltaI, deltaJ);
        this.markCameraMoving();

        // Mark zone request manager as moving
        if (this.zoneRequestManager) {
          this.zoneRequestManager.markMoving();
        }

        this.requestRender();
      },
      onPanEnd: () => {
        // Mark movement stopped and trigger delayed zone loading
        if (this.zoneRequestManager) {
          const currentZoom = this.terrainRenderer.getZoomLevel();
          this.zoneRequestManager.markStopped(currentZoom);
        }

        // Also request immediately (manager will handle delay internally)
        this.checkVisibleZones();
      },
      onZoom: (delta) => {
        const current = this.terrainRenderer.getZoomLevel();
        const newZoom = current + delta;
        this.terrainRenderer.setZoomLevel(newZoom);
        this.terrainRenderer.clearDistantZoomCaches(newZoom);

        // Clear vehicles when zooming out of Z2/Z3
        if (current >= 2 && newZoom < 2 && this.vehicleSystem) {
          this.vehicleSystem.clear();
          this.animationLoopRunning = false;
        }
        if (current < 2 && newZoom >= 2) {
          this.startAnimationLoop();
        }

        // Mark as moving then stopped (triggers delayed zone load based on new zoom)
        if (this.zoneRequestManager) {
          this.zoneRequestManager.markMoving();
          this.zoneRequestManager.markStopped(newZoom);
        }

        this.checkVisibleZones();
        this.requestRender();
      },
      onRotate: (direction) => {
        if (direction === 'cw') {
          this.rotateClockwise();
        } else {
          this.rotateCounterClockwise();
        }
      },
      onDoubleTap: (x, y) => {
        // Center camera on tapped location
        const mapPos = this.terrainRenderer.screenToMap(x, y);
        this.terrainRenderer.centerOn(mapPos.x, mapPos.y);
        this.requestRender();
      },
    });
  }

  // =========================================================================
  // MAP LOADING
  // =========================================================================

  /**
   * Load terrain for a map
   */
  public async loadMap(mapName: string): Promise<TerrainData> {
    this.mapName = mapName;

    const terrainData = await this.terrainRenderer.loadMap(mapName);
    this.mapLoaded = true;

    // Clear cached zones when loading new map
    this.cachedZones.clear();
    if (this.zoneRequestManager) {
      this.zoneRequestManager.clear();
    }
    this.allBuildings = [];
    this.allSegments = [];

    this.render();

    // NOTE: Do NOT call checkVisibleZones() here - let the callback be set first
    // Zone loading will be triggered via triggerZoneCheck() when setOnLoadZone() is called
    // (See map-navigation-ui.ts setOnLoadZone method which calls triggerZoneCheck)

    return terrainData;
  }

  /**
   * Check if map is loaded
   */
  isLoaded(): boolean {
    return this.mapLoaded && this.terrainRenderer.isLoaded();
  }

  /**
   * Load road block class configurations from the server
   */
  private async loadRoadBlockClasses(): Promise<void> {
    try {
      const response = await fetch('/api/road-block-classes');
      if (!response.ok) {
        console.error('[IsometricMapRenderer] Failed to load road block classes:', response.status);
        return;
      }

      const data = await response.json();
      const files: Array<{ filename: string; content: string }> = data.files || [];

      console.log(`[IsometricMapRenderer] Loading ${files.length} road block classes...`);

      for (const file of files) {
        this.roadBlockClassManager.loadFromIni(file.content);
      }

      this.roadBlockClassesLoaded = true;
      console.log(`[IsometricMapRenderer] Road block classes loaded successfully`);

      // Re-render to show road textures
      this.requestRender();
    } catch (error) {
      console.error('[IsometricMapRenderer] Error loading road block classes:', error);
    }
  }

  /**
   * Load concrete block class configurations from the server
   */
  private async loadConcreteBlockClasses(): Promise<void> {
    try {
      const response = await fetch('/api/concrete-block-classes');
      if (!response.ok) {
        console.error('[IsometricMapRenderer] Failed to load concrete block classes:', response.status);
        return;
      }

      const data = await response.json();
      const files: Array<{ filename: string; content: string }> = data.files || [];

      console.log(`[IsometricMapRenderer] Loading ${files.length} concrete block classes...`);

      for (const file of files) {
        const config = loadConcreteBlockClassFromIni(file.content);
        console.log(`[ConcreteINI] ${file.filename}: ID=${config.id} (0x${config.id.toString(16)}) -> ${config.imagePath}`);
        this.concreteBlockClassManager.loadFromIni(file.content);
      }

      this.concreteBlockClassesLoaded = true;
      console.log(`[IsometricMapRenderer] Concrete block classes loaded successfully (${this.concreteBlockClassManager.getClassCount()} classes)`);

      // Debug: Check if platform IDs are loaded
      const platformIds = [0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88];
      console.log('[ConcreteDebug] === PLATFORM ID CHECK ===');
      for (const id of platformIds) {
        const hasClass = this.concreteBlockClassManager.hasClass(id);
        const filename = this.concreteBlockClassManager.getImageFilename(id);
        console.log(`[ConcreteDebug] Platform ID 0x${id.toString(16)} (${id}): loaded=${hasClass}, texture=${filename}`);
      }

      // List all loaded IDs
      const allIds = this.concreteBlockClassManager.getAllIds();
      console.log(`[ConcreteDebug] All ${allIds.length} loaded IDs:`, allIds.map(id => `0x${id.toString(16)}(${id})`).join(', '));

      // Re-render to show concrete textures
      this.requestRender();
    } catch (error) {
      console.error('[IsometricMapRenderer] Error loading concrete block classes:', error);
    }
  }

  /**
   * Load car class configurations from the server and initialize the vehicle animation system
   */
  private async loadCarClasses(): Promise<void> {
    try {
      const response = await fetch('/api/car-classes');
      if (!response.ok) {
        console.error('[IsometricMapRenderer] Failed to load car classes:', response.status);
        return;
      }

      const data = await response.json();
      const files: Array<{ filename: string; content: string }> = data.files || [];

      console.log(`[IsometricMapRenderer] Loading ${files.length} car classes...`);

      for (const file of files) {
        this.carClassManager.loadFromIni(file.content);
      }

      console.log(`[IsometricMapRenderer] Car classes loaded: ${this.carClassManager.getClassCount()} classes`);

      // Initialize vehicle animation system
      this.vehicleSystem = new VehicleAnimationSystem();
      this.vehicleSystem.setCarClassManager(this.carClassManager);
      this.vehicleSystem.setRoadBlockClassManager(this.roadBlockClassManager);
      this.vehicleSystem.setGameObjectTextureCache(this.gameObjectTextureCache);
      this.vehicleSystemReady = true;
    } catch (error) {
      console.error('[IsometricMapRenderer] Error loading car classes:', error);
    }
  }

  /**
   * Start the continuous animation loop for vehicles.
   * Only runs when vehicles are active (Z2/Z3 + vehicles exist).
   */
  private startAnimationLoop(): void {
    if (this.animationLoopRunning) return;
    this.animationLoopRunning = true;
    this.lastRenderTime = performance.now();

    const loop = () => {
      if (!this.animationLoopRunning) return;

      const zoom = this.terrainRenderer.getZoomLevel();
      // Only animate at Z2 and Z3
      if (zoom >= 2 && this.vehicleSystemReady && this.vehicleSystem) {
        this.requestRender();
        requestAnimationFrame(loop);
      } else {
        this.animationLoopRunning = false;
      }
    };

    requestAnimationFrame(loop);
  }

  /**
   * Draw animated vehicles on roads (layer between buildings and zone overlay).
   * Active only at Z2 and Z3 zoom levels.
   */
  private drawVehicles(bounds: TileBounds, deltaTime: number, occupiedTiles: Set<string>): void {
    const zoom = this.terrainRenderer.getZoomLevel();
    if (zoom < 2) return;
    if (!this.vehicleSystemReady || !this.vehicleSystem) return;

    // Update road data dependencies for the vehicle system
    this.vehicleSystem.setRoadData(
      this.roadTilesMap,
      this.roadsRendering,
      (col, row) => {
        const terrainLoader = this.terrainRenderer.getTerrainLoader();
        return terrainLoader.getLandId(col, row);
      },
      (col, row) => this.hasConcrete(col, row)
    );

    // Pass building tile positions for proximity-based spawning
    this.vehicleSystem.setBuildingTiles(occupiedTiles);

    // Pause during camera movement
    this.vehicleSystem.setPaused(this.isCameraMoving);

    // Update vehicle positions and spawn new vehicles
    this.vehicleSystem.update(deltaTime, bounds);

    // Render visible vehicles
    const config = ZOOM_LEVELS[zoom];
    this.vehicleSystem.render(
      this.ctx,
      (i: number, j: number) => this.terrainRenderer.mapToScreen(i, j),
      config,
      this.canvas.width,
      this.canvas.height,
      (col: number, row: number) => this.isOnWaterPlatform(col, row)
    );

    // Start animation loop if vehicles are active
    if (this.vehicleSystem.isActive() || this.vehicleSystem.getVehicleCount() === 0) {
      this.startAnimationLoop();
    }
  }

  // =========================================================================
  // ZONE MANAGEMENT
  // =========================================================================

  /**
   * Add a cached zone with buildings and segments
   * Note: Cache key is aligned to zone grid (64-tile boundaries) for consistency
   */
  public addCachedZone(
    x: number,
    y: number,
    w: number,
    h: number,
    buildings: MapBuilding[],
    segments: MapSegment[]
  ) {
    // Align coordinates to zone grid for consistent cache keys
    const zoneSize = 64;
    const alignedX = Math.floor(x / zoneSize) * zoneSize;
    const alignedY = Math.floor(y / zoneSize) * zoneSize;
    const key = `${alignedX},${alignedY}`;

    // Check if zone data actually changed (avoid redundant ground cache rebuilds)
    const existing = this.cachedZones.get(key);
    const segmentsChanged = !existing ||
      existing.segments.length !== segments.length ||
      existing.buildings.length !== buildings.length;

    this.cachedZones.set(key, {
      x: alignedX,
      y: alignedY,
      w,
      h,
      buildings,
      segments,
      lastLoadTime: Date.now(),
      forceRefresh: false
    });

    // Notify zone request manager that zone is loaded
    if (this.zoneRequestManager) {
      this.zoneRequestManager.markZoneLoaded(alignedX, alignedY);
    }

    // Rebuild aggregated lists
    this.rebuildAggregatedData();

    // Fetch dimensions for new buildings
    this.fetchDimensionsForBuildings(buildings);

    // Only invalidate ground cache if zone content actually changed
    if (segmentsChanged) {
      this.invalidateGroundCache();
    }
    this.requestRender();
  }

  /**
   * Rebuild all buildings and segments from cached zones
   */
  private rebuildAggregatedData() {
    this.allBuildings = [];
    this.allSegments = [];
    this.roadTilesMap.clear();
    this.cachedOccupiedTiles = null; // Invalidate occupation cache

    this.cachedZones.forEach(zone => {
      this.allBuildings.push(...zone.buildings);
      this.allSegments.push(...zone.segments);
    });

    // Build road tiles map for connectivity detection
    this.allSegments.forEach(seg => {
      const minX = Math.min(seg.x1, seg.x2);
      const maxX = Math.max(seg.x1, seg.x2);
      const minY = Math.min(seg.y1, seg.y2);
      const maxY = Math.max(seg.y1, seg.y2);

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          this.roadTilesMap.set(`${x},${y}`, true);
        }
      }
    });

    // Rebuild road topology FIRST — needed to identify junctions for concrete placement
    this.rebuildRoadsRendering();

    // Pre-compute concrete adjacency tiles:
    // 1. Tiles within 1 tile of any building
    // 2. Water road junctions (corners, T, crossroads) + their adjacent connected road tiles
    // On water (ZoneD), only place concrete on deep water (Center) tiles — skip edges/corners
    this.concreteTilesSet.clear();
    this.debugConcreteSourceMap.clear();
    const terrainLoaderForConcrete = this.terrainRenderer.getTerrainLoader();
    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const bw = dims?.xsize || 1;
      const bh = dims?.ysize || 1;

      // Expand building bounds by 1 tile in each direction
      for (let y = building.y - 1; y < building.y + bh + 1; y++) {
        for (let x = building.x - 1; x < building.x + bw + 1; x++) {
          // Filter out water edge/corner tiles — only ldtCenter accepts concrete
          if (terrainLoaderForConcrete) {
            const landId = terrainLoaderForConcrete.getLandId(x, y);
            if (!canReceiveConcrete(landId)) continue;
          }
          const key = `${x},${y}`;
          this.concreteTilesSet.add(key);
          this.debugConcreteSourceMap.set(key, 'building');
        }
      }
    }

    // Add concrete platforms around water road junctions (corners, T, crossroads)
    // Bridge textures don't support these topologies, so they need a concrete platform
    // with regular road textures. Also adds concrete to the one adjacent tile in each
    // connected direction (transition from bridge to platform road).
    this.addWaterRoadJunctionConcrete(terrainLoaderForConcrete);

    // Update vegetation→flat zones (used by drawVegetation to hide vegetation near buildings/roads)
    this.vegetationMapper.updateDynamicContent(
      this.allBuildings,
      this.allSegments,
      this.facilityDimensionsCache
    );
  }

  /**
   * Rebuild the RoadsRendering buffer from all segments
   * This computes the topology (shape) of each road tile
   */
  private rebuildRoadsRendering() {
    if (this.allSegments.length === 0) {
      this.roadsRendering = null;
      return;
    }

    // Calculate bounds of all road segments
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const seg of this.allSegments) {
      minX = Math.min(minX, seg.x1, seg.x2);
      maxX = Math.max(maxX, seg.x1, seg.x2);
      minY = Math.min(minY, seg.y1, seg.y2);
      maxY = Math.max(maxY, seg.y1, seg.y2);
    }

    // Add padding for edge cases
    const padding = 1;
    const left = minX - padding;
    const top = minY - padding;
    const width = maxX - minX + 1 + 2 * padding;
    const height = maxY - minY + 1 + 2 * padding;

    // Create rendering buffer
    this.roadsRendering = new RoadsRendering(top, left, width, height);

    // Render all segments into the buffer
    for (const seg of this.allSegments) {
      renderRoadSegment(this.roadsRendering, {
        x1: seg.x1,
        y1: seg.y1,
        x2: seg.x2,
        y2: seg.y2
      });
    }
  }

  /**
   * Check if a road tile exists at the given coordinates
   */
  private hasRoadAt(x: number, y: number): boolean {
    return this.roadTilesMap.has(`${x},${y}`);
  }

  /**
   * Check if a tile is adjacent to an existing road (including diagonal adjacency)
   * Returns true if any of the 8 surrounding tiles has a road
   */
  private isAdjacentToRoad(x: number, y: number): boolean {
    const neighbors = [
      { x: x - 1, y: y },     // West
      { x: x + 1, y: y },     // East
      { x: x, y: y - 1 },     // North
      { x: x, y: y + 1 },     // South
      { x: x - 1, y: y - 1 }, // NW
      { x: x + 1, y: y - 1 }, // NE
      { x: x - 1, y: y + 1 }, // SW
      { x: x + 1, y: y + 1 }  // SE
    ];

    return neighbors.some(n => this.hasRoadAt(n.x, n.y));
  }

  /**
   * Check if a road path connects to existing roads
   * Returns true if:
   * - Any tile of the path is adjacent to an existing road, OR
   * - No roads exist yet (first road on map)
   */
  public checkRoadPathConnectsToExisting(pathTiles: Point[]): boolean {
    // If no roads exist, any road can be built (first road)
    if (this.roadTilesMap.size === 0) {
      return true;
    }

    // Check if any tile of the path connects to existing roads
    for (const tile of pathTiles) {
      // Check if this tile is adjacent to an existing road
      if (this.isAdjacentToRoad(tile.x, tile.y)) {
        return true;
      }
      // Also check if the tile itself overlaps with an existing road (extending from endpoint)
      if (this.hasRoadAt(tile.x, tile.y)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the number of existing road tiles (for checking if any roads exist)
   */
  public getRoadTileCount(): number {
    return this.roadTilesMap.size;
  }

  /**
   * Fetch facility dimensions for buildings and preload their textures
   */
  private async fetchDimensionsForBuildings(buildings: MapBuilding[]) {
    if (!this.onFetchFacilityDimensions) return;

    const uniqueClasses = new Set<string>();
    buildings.forEach(b => {
      if (!this.facilityDimensionsCache.has(b.visualClass)) {
        uniqueClasses.add(b.visualClass);
      }
    });

    for (const visualClass of uniqueClasses) {
      const dims = await this.onFetchFacilityDimensions(visualClass);
      if (dims) {
        this.facilityDimensionsCache.set(visualClass, dims);
      }
    }

    // Rebuild concrete set and invalidate occupation cache with accurate dimensions
    this.cachedOccupiedTiles = null;
    this.rebuildConcreteSet();

    // Preload building textures for all unique visual classes
    this.preloadBuildingTextures(buildings);

    this.requestRender();
  }

  /**
   * Rebuild the pre-computed concrete adjacency set from all buildings.
   * Called when building dimensions change (after fetching from server).
   */
  private rebuildConcreteSet(): void {
    this.concreteTilesSet.clear();
    this.debugConcreteSourceMap.clear();
    const terrainLoader = this.terrainRenderer.getTerrainLoader();
    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const bw = dims?.xsize || 1;
      const bh = dims?.ysize || 1;

      for (let y = building.y - 1; y < building.y + bh + 1; y++) {
        for (let x = building.x - 1; x < building.x + bw + 1; x++) {
          // Filter out water edge/corner tiles — only ldtCenter accepts concrete
          if (terrainLoader) {
            const landId = terrainLoader.getLandId(x, y);
            if (!canReceiveConcrete(landId)) continue;
          }
          const key = `${x},${y}`;
          this.concreteTilesSet.add(key);
          this.debugConcreteSourceMap.set(key, 'building');
        }
      }
    }
    // Also add concrete around water road junctions
    this.addWaterRoadJunctionConcrete(terrainLoader);
  }

  /**
   * Add concrete platforms around road junctions on water.
   *
   * Bridge textures only support straight segments (NS/WE roads and their start/end caps).
   * Corners, T-intersections, and crossroads CANNOT use bridge textures — they need
   * a concrete platform with regular urban road textures.
   *
   * For each junction tile on water, add a 3×3 concrete area:
   * - The junction tile itself
   * - All 8 neighbors (includes connected road tiles at +1 AND border tiles)
   * Roads at +2 and beyond remain bridges (outside the 3×3).
   */
  private addWaterRoadJunctionConcrete(terrainLoader: ReturnType<typeof this.terrainRenderer.getTerrainLoader>): void {
    if (!this.roadsRendering || !terrainLoader) return;

    for (const [key] of this.roadTilesMap) {
      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      const topology = this.roadsRendering.get(y, x);
      if (topology === RoadBlockId.None) continue;
      if (!isJunctionTopology(topology)) continue;

      const landId = terrainLoader.getLandId(x, y);
      if (!isWater(landId)) continue;

      // Add 3×3 area around junction (junction + 8 neighbors)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const nLandId = terrainLoader.getLandId(nx, ny);
          if (canReceiveConcrete(nLandId)) {
            const nKey = `${nx},${ny}`;
            this.concreteTilesSet.add(nKey);
            // Only set source if not already set (building has priority)
            if (!this.debugConcreteSourceMap.has(nKey)) {
              this.debugConcreteSourceMap.set(nKey, 'junction');
            }
          }
        }
      }
    }
  }

  /**
   * Preload building textures for faster rendering
   */
  private preloadBuildingTextures(buildings: MapBuilding[]): void {
    const uniqueClasses = new Set<string>();
    buildings.forEach(b => uniqueClasses.add(b.visualClass));

    const textureFilenames = Array.from(uniqueClasses).map(
      visualClass => GameObjectTextureCache.getBuildingTextureFilename(visualClass)
    );

    this.gameObjectTextureCache.preload('BuildingImages', textureFilenames);
  }

  /**
   * Update map data with buildings and road segments for a zone
   */
  public updateMapData(mapData: { x: number; y: number; w: number; h: number; buildings: MapBuilding[]; segments: MapSegment[] }) {
    this.addCachedZone(mapData.x, mapData.y, mapData.w, mapData.h, mapData.buildings, mapData.segments);
  }

  /**
   * Invalidate a specific zone, forcing it to reload on next visibility check
   * Use this when the server notifies that a specific area has changed
   */
  public invalidateZone(x: number, y: number): void {
    const zoneSize = 64;
    const alignedX = Math.floor(x / zoneSize) * zoneSize;
    const alignedY = Math.floor(y / zoneSize) * zoneSize;
    const key = `${alignedX},${alignedY}`;

    const cached = this.cachedZones.get(key);
    if (cached) {
      cached.forceRefresh = true;
      console.log(`[IsometricMapRenderer] Zone ${key} marked for refresh`);
    }
  }

  /**
   * Invalidate all cached zones, forcing full reload
   * Use this when reconnecting or after major game state changes
   */
  public invalidateAllZones(): void {
    let count = 0;
    this.cachedZones.forEach(zone => {
      zone.forceRefresh = true;
      count++;
    });
    console.log(`[IsometricMapRenderer] Marked ${count} zones for refresh`);
  }

  /**
   * Invalidate zones within a rectangular area
   * Use this when the server notifies that a region has changed
   */
  public invalidateArea(x1: number, y1: number, x2: number, y2: number): void {
    const zoneSize = 64;
    const startX = Math.floor(Math.min(x1, x2) / zoneSize) * zoneSize;
    const endX = Math.ceil(Math.max(x1, x2) / zoneSize) * zoneSize;
    const startY = Math.floor(Math.min(y1, y2) / zoneSize) * zoneSize;
    const endY = Math.ceil(Math.max(y1, y2) / zoneSize) * zoneSize;

    let count = 0;
    for (let x = startX; x < endX; x += zoneSize) {
      for (let y = startY; y < endY; y += zoneSize) {
        const key = `${x},${y}`;
        const cached = this.cachedZones.get(key);
        if (cached) {
          cached.forceRefresh = true;
          count++;
        }
      }
    }
    console.log(`[IsometricMapRenderer] Marked ${count} zones in area for refresh`);
  }

  // =========================================================================
  // CALLBACKS
  // =========================================================================

  public setLoadZoneCallback(callback: (x: number, y: number, w: number, h: number) => void) {
    this.onLoadZone = callback;

    // Initialize zone request manager now that we have the callback
    this.zoneRequestManager = new ZoneRequestManager(callback, 64);
  }

  /**
   * Manually trigger zone checking (useful after callbacks are set up)
   */
  public triggerZoneCheck() {
    this.checkVisibleZones();
  }

  public setBuildingClickCallback(callback: (x: number, y: number, visualClass?: string) => void) {
    this.onBuildingClick = callback;
  }

  public setEmptyMapClickCallback(callback: () => void) {
    this.onEmptyMapClick = callback;
  }

  /** Convert world coordinates to screen pixel position. */
  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return this.terrainRenderer.mapToScreen(worldY, worldX);
  }

  /**
   * Convert a building footprint center to screen position, plus its texture height.
   * Used by StatusOverlay for centered positioning with dynamic vertical offset.
   */
  public worldToScreenCentered(
    worldX: number, worldY: number,
    xsize: number, ysize: number
  ): { x: number; y: number; textureHeight: number } {
    // Prefer the pixel-exact position recorded during drawBuildings().
    // This guarantees the overlay aligns with the actual drawn texture.
    if (this.selectedBuildingDrawnTop) {
      return this.selectedBuildingDrawnTop;
    }

    // Fallback: compute from south-corner anchor (same formula as drawBuildings).
    // Used on the first frame before the renderer has drawn the selected building.
    const rotation = this.terrainRenderer.getRotation();
    let anchorI: number, anchorJ: number;
    switch (rotation) {
      case Rotation.NORTH: anchorI = worldY;              anchorJ = worldX;              break;
      case Rotation.EAST:  anchorI = worldY + ysize - 1;  anchorJ = worldX;              break;
      case Rotation.SOUTH: anchorI = worldY + ysize - 1;  anchorJ = worldX + xsize - 1;  break;
      case Rotation.WEST:  anchorI = worldY;              anchorJ = worldX + xsize - 1;  break;
      default:             anchorI = worldY;              anchorJ = worldX;              break;
    }
    const southCornerScreenPos = this.terrainRenderer.mapToScreen(anchorI, anchorJ);

    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const scaleFactor = config.tileWidth / 64;
    let scaledHeight = 80 * scaleFactor; // fallback

    const building = this.getBuildingAt(worldX, worldY);
    if (building) {
      const textureFilename = GameObjectTextureCache.getBuildingTextureFilename(building.visualClass);
      const texture = this.gameObjectTextureCache.getTextureSync('BuildingImages', textureFilename);
      if (texture) {
        scaledHeight = texture.height * scaleFactor;
      }
    }

    let textureTopY = southCornerScreenPos.y + config.tileHeight - scaledHeight;

    if (this.isOnWaterPlatform(anchorJ, anchorI)) {
      textureTopY -= Math.round(PLATFORM_SHIFT * scaleFactor);
    }

    return { x: southCornerScreenPos.x, y: textureTopY, textureHeight: scaledHeight };
  }

  /** Mark a building as selected (focused) — shows gold pulsing footprint. */
  public setSelectedBuilding(x: number, y: number): void {
    this.selectedBuilding = this.getBuildingAt(x, y);
    this.selectionPulseTime = performance.now();
    this.requestRender();
  }

  /** Clear building selection. */
  public clearSelectedBuilding(): void {
    this.selectedBuilding = null;
    this.selectedBuildingDrawnTop = null;
    this.requestRender();
  }

  public setCancelPlacementCallback(callback: () => void) {
    this.onCancelPlacement = callback;
  }

  public setPlacementConfirmCallback(callback: (x: number, y: number) => void) {
    this.onPlacementConfirm = callback;
  }

  public setFetchFacilityDimensionsCallback(callback: (visualClass: string) => Promise<FacilityDimensions | null>) {
    this.onFetchFacilityDimensions = callback;
  }

  public setRoadSegmentCompleteCallback(callback: (x1: number, y1: number, x2: number, y2: number) => void) {
    this.onRoadSegmentComplete = callback;
  }

  public setCancelRoadDrawingCallback(callback: () => void) {
    this.onCancelRoadDrawing = callback;
  }

  public setRoadDemolishClickCallback(callback: ((x: number, y: number) => void) | null) {
    this.onRoadDemolishClick = callback;
  }

  // =========================================================================
  // CAMERA CONTROL
  // =========================================================================

  /**
   * Center camera on specific coordinates (in original map coordinates x, y)
   */
  public centerOn(x: number, y: number) {
    // Convert from original coordinate system (x, y) to isometric (i, j)
    // In the original system, x was column and y was row
    // In isometric, i is row and j is column
    this.terrainRenderer.centerOn(y, x);
    this.checkVisibleZones();
  }

  /**
   * Get current camera position
   */
  public getCameraPosition(): { x: number; y: number } {
    const pos = this.terrainRenderer.getCameraPosition();
    // Convert back: j = x (column), i = y (row)
    return { x: pos.j, y: pos.i };
  }

  /**
   * Set zoom level (0-3)
   */
  public setZoom(level: number) {
    const previousZoom = this.terrainRenderer.getZoomLevel();
    this.terrainRenderer.setZoomLevel(level);
    this.terrainRenderer.clearDistantZoomCaches(level);

    // Clear vehicles when zooming out of Z2/Z3 range
    if (previousZoom >= 2 && level < 2 && this.vehicleSystem) {
      this.vehicleSystem.clear();
      this.animationLoopRunning = false;
    }
    // Start animation loop when zooming into Z2/Z3 range
    if (previousZoom < 2 && level >= 2) {
      this.startAnimationLoop();
    }

    this.checkVisibleZones();
    this.requestRender();
  }

  /**
   * Get current zoom level
   */
  public getZoom(): number {
    return this.terrainRenderer.getZoomLevel();
  }

  /**
   * Get all loaded buildings (for minimap rendering)
   */
  public getAllBuildings(): MapBuilding[] {
    return this.allBuildings;
  }

  /**
   * Get all loaded road segments (for minimap rendering)
   */
  public getAllSegments(): MapSegment[] {
    return this.allSegments;
  }

  /**
   * Get map dimensions in tiles (for minimap scaling)
   */
  public getMapDimensions(): { width: number; height: number } {
    return this.terrainRenderer.getTerrainLoader().getDimensions();
  }

  /**
   * Get visible tile bounds (for minimap viewport rectangle)
   */
  public getVisibleTileBounds(): TileBounds {
    const viewport: Rect = {
      x: 0,
      y: 0,
      width: this.canvas.width,
      height: this.canvas.height,
    };
    const origin = this.terrainRenderer.getOrigin();
    return this.terrainRenderer.getCoordinateMapper().getVisibleBounds(
      viewport,
      this.terrainRenderer.getZoomLevel(),
      this.terrainRenderer.getRotation(),
      origin
    );
  }

  /**
   * Set terrain season from server WorldSeason property
   */
  public setSeason(season: Season): void {
    this.terrainRenderer.setSeason(season);
    this.requestRender();
  }

  // =========================================================================
  // ZONE OVERLAY
  // =========================================================================

  public setZoneOverlay(enabled: boolean, data?: SurfaceData, x1?: number, y1?: number) {
    this.zoneOverlayEnabled = enabled;
    if (data) {
      this.zoneOverlayData = data;
      this.zoneOverlayX1 = x1 || 0;
      this.zoneOverlayY1 = y1 || 0;
    }
    this.requestRender();
  }

  // =========================================================================
  // PLACEMENT MODE
  // =========================================================================

  public setPlacementMode(
    enabled: boolean,
    buildingName: string = '',
    cost: number = 0,
    area: number = 0,
    zoneRequirement: string = '',
    xsize: number = 1,
    ysize: number = 1,
    visualClass: string = ''
  ) {
    this.placementMode = enabled;
    if (enabled && buildingName) {
      this.placementPreview = {
        i: this.mouseMapI,
        j: this.mouseMapJ,
        buildingName,
        cost,
        area,
        zoneRequirement,
        xsize,
        ysize,
        visualClass
      };
      this.canvas.style.cursor = 'crosshair';
    } else {
      this.placementPreview = null;
      this.canvas.style.cursor = 'grab';
    }
    this.requestRender();
  }

  public getPlacementCoordinates(): { x: number; y: number } | null {
    if (!this.placementPreview) return null;
    return { x: this.placementPreview.j, y: this.placementPreview.i };
  }

  // =========================================================================
  // ROAD DRAWING MODE
  // =========================================================================

  public setRoadDrawingMode(enabled: boolean) {
    this.roadDrawingMode = enabled;
    this.roadDrawingState = {
      isDrawing: false,
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      isMouseDown: false,
      mouseDownTime: 0
    };
    this.canvas.style.cursor = enabled ? 'crosshair' : 'grab';
    this.requestRender();
  }

  public isRoadDrawingModeActive(): boolean {
    return this.roadDrawingMode;
  }

  public setOnRoadSegmentComplete(callback: (x1: number, y1: number, x2: number, y2: number) => void) {
    this.onRoadSegmentComplete = callback;
  }

  public setOnRoadDrawingCancel(callback: () => void) {
    this.onCancelRoadDrawing = callback;
  }

  /**
   * Validate if a road can be built between two points
   * Returns an object with valid flag and optional error message
   */
  public validateRoadPath(x1: number, y1: number, x2: number, y2: number): { valid: boolean; error?: string } {
    // Generate the staircase path
    const pathTiles = this.generateStaircasePath(x1, y1, x2, y2);

    // Check for building collisions
    for (const tile of pathTiles) {
      for (const building of this.allBuildings) {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const bw = dims?.xsize || 1;
        const bh = dims?.ysize || 1;

        if (tile.x >= building.x && tile.x < building.x + bw &&
            tile.y >= building.y && tile.y < building.y + bh) {
          return { valid: false, error: 'Road blocked by building' };
        }
      }
    }

    // Check if road connects to existing roads
    if (!this.checkRoadPathConnectsToExisting(pathTiles)) {
      return { valid: false, error: 'Road must connect to existing road network' };
    }

    return { valid: true };
  }

  // =========================================================================
  // GROUND LAYER CACHE
  // =========================================================================

  /**
   * Get zoom-dependent ground margin (pixels of overscan around viewport).
   * Larger margins = fewer rebuilds during pan, at the cost of more memory.
   */
  private getGroundMargin(): number {
    const zoom = this.terrainRenderer.getZoomLevel();
    // Z1: 16×8 tiles, need large margin to avoid frequent rebuilds
    // Z2: 32×16 tiles, moderate margin
    // Z3: 64×32 tiles, smaller margin (fewer tiles = less rebuild cost)
    if (zoom >= 3) return 512;
    if (zoom >= 2) return 768;
    return 1024; // Z1
  }

  /**
   * Mark the ground cache as needing rebuild on next render.
   */
  private invalidateGroundCache(): void {
    this.groundCacheValid = false;
  }

  /**
   * Create or resize the ground cache OffscreenCanvas to match viewport + margins.
   */
  private ensureGroundCanvas(): void {
    const margin = this.getGroundMargin();
    const w = this.canvas.width + 2 * margin;
    const h = this.canvas.height + 2 * margin;

    if (!this.groundCanvas || this.groundCanvas.width !== w || this.groundCanvas.height !== h) {
      this.groundCanvas = new OffscreenCanvas(w, h);
      this.groundCtx = this.groundCanvas.getContext('2d');
      this.groundCacheValid = false;
    }
  }

  /**
   * Check if the ground cache can be reused (same zoom/rotation, pan within margin).
   */
  private canReuseGroundCache(): boolean {
    if (!this.groundCacheValid || !this.groundCanvas) return false;

    const zoom = this.terrainRenderer.getZoomLevel();
    const rotation = this.terrainRenderer.getRotation();
    if (zoom !== this.groundCacheZoom || rotation !== this.groundCacheRotation) return false;

    const margin = this.getGroundMargin();
    const origin = this.terrainRenderer.getOrigin();
    const dx = Math.abs(origin.x - this.groundCacheOriginX);
    const dy = Math.abs(origin.y - this.groundCacheOriginY);

    return dx < margin && dy < margin;
  }

  /**
   * Get extended tile bounds that include the ground cache margin area.
   * Used during ground cache rebuild to render tiles beyond the viewport.
   */
  private getExtendedBounds(margin: number): TileBounds {
    const origin = this.terrainRenderer.getOrigin();
    const zoom = this.terrainRenderer.getZoomLevel();
    const rotation = this.terrainRenderer.getRotation();

    // Viewport extended by margin on all sides
    const extViewport: Rect = {
      x: -margin,
      y: -margin,
      width: this.canvas.width + 2 * margin,
      height: this.canvas.height + 2 * margin
    };

    return this.terrainRenderer.getCoordinateMapper().getVisibleBounds(
      extViewport, zoom, rotation, origin
    );
  }

  /**
   * Rebuild the ground cache: render terrain + vegetation + concrete + roads
   * to an OffscreenCanvas sized viewport + 2*margin.
   * Uses ctx-swap technique so draw methods render to the cache instead of main canvas.
   */
  private rebuildGroundCache(): void {
    this.ensureGroundCanvas();
    if (!this.groundCtx) return;

    const margin = this.getGroundMargin();
    const origin = this.terrainRenderer.getOrigin();
    const zoom = this.terrainRenderer.getZoomLevel();
    const rotation = this.terrainRenderer.getRotation();
    const chunkCache = this.terrainRenderer.getChunkCache();

    // Clear ground cache
    this.groundCtx.clearRect(0, 0, this.groundCanvas!.width, this.groundCanvas!.height);

    // === Render terrain to ground cache ===
    if (chunkCache && rotation === Rotation.NORTH) {
      // NORTH rotation: use pre-rendered chunks (fast path)
      const extBounds = this.getExtendedBounds(margin);
      const visibleChunks = chunkCache.getVisibleChunksFromBounds(extBounds);

      this.groundCtx.imageSmoothingEnabled = false;
      this.groundCtx.save();
      this.groundCtx.translate(margin, margin);

      for (let ci = visibleChunks.minChunkI; ci <= visibleChunks.maxChunkI; ci++) {
        for (let cj = visibleChunks.minChunkJ; cj <= visibleChunks.maxChunkJ; cj++) {
          // Draw only already-cached chunks (no async trigger — prevents eviction loops)
          chunkCache.drawChunkIfReady(
            this.groundCtx as unknown as CanvasRenderingContext2D,
            ci, cj, zoom, origin
          );
        }
      }

      this.groundCtx.restore();
    } else {
      // Non-NORTH rotations: render terrain tiles directly (chunks are NORTH-only)
      this.renderTerrainTilesToGroundCache(margin);
    }

    // === Ctx-swap: render vegetation, concrete, roads to ground cache ===
    const savedCtx = this.ctx;
    this.ctx = this.groundCtx as unknown as CanvasRenderingContext2D;
    this.ctx.save();
    this.ctx.translate(margin, margin);
    this.cullingPadding = margin;

    const extBounds = this.getExtendedBounds(margin);
    const occupiedTiles = this.buildTileOccupationMap();

    this.drawVegetation(extBounds);
    this.drawConcrete(extBounds);
    this.drawRoads(extBounds, occupiedTiles);

    this.ctx.restore();
    this.cullingPadding = 0;
    this.ctx = savedCtx;

    // Store cache state
    this.groundCacheValid = true;
    this.groundCacheZoom = zoom;
    this.groundCacheRotation = rotation;
    this.groundCacheOriginX = origin.x;
    this.groundCacheOriginY = origin.y;
  }

  /**
   * Render terrain tiles directly to the ground cache (for non-NORTH rotations).
   * Chunks are pre-rendered at NORTH positions, so at other rotations we fall back
   * to tile-by-tile rendering using the rotation-aware coordinate mapper.
   */
  private renderTerrainTilesToGroundCache(margin: number): void {
    if (!this.groundCtx) return;

    const FLAT_MASK = 0xC0;
    const extBounds = this.getExtendedBounds(margin);
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const terrainLoader = this.terrainRenderer.getTerrainLoader();
    const textureCache = this.terrainRenderer.getTextureCache();
    const ctx = this.groundCtx as unknown as CanvasRenderingContext2D;

    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(margin, margin);

    const rotation = this.terrainRenderer.getRotation() as number;

    for (let i = extBounds.minI; i <= extBounds.maxI; i++) {
      for (let j = extBounds.minJ; j <= extBounds.maxJ; j++) {
        let textureId = terrainLoader.getTextureId(j, i);
        if (isSpecialTile(textureId)) {
          textureId = textureId & FLAT_MASK;
        }
        // Rotate directional border textures so edges align with the rotated view
        if (rotation !== 0) {
          textureId = rotateLandId(textureId, rotation);
        }

        const screenPos = this.terrainRenderer.mapToScreen(i, j);
        const sx = Math.round(screenPos.x);
        const sy = Math.round(screenPos.y);

        // Cull if off-screen (with ground cache padding)
        if (sx < -config.tileWidth - margin || sx > this.canvas.width + config.tileWidth + margin ||
            sy < -config.tileHeight - margin || sy > this.canvas.height + config.tileHeight + margin) {
          continue;
        }

        const texture = textureCache.getTextureSync(textureId);
        if (texture) {
          ctx.drawImage(texture, sx - halfWidth, sy, config.tileWidth, config.tileHeight);
        } else {
          // Diamond fallback color
          const color = textureCache.getFallbackColor(textureId);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + halfWidth, sy + config.tileHeight / 2);
          ctx.lineTo(sx, sy + config.tileHeight);
          ctx.lineTo(sx - halfWidth, sy + config.tileHeight / 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  /**
   * Blit the ground cache to the main canvas at the current pan offset.
   * Fast path: one drawImage call instead of rendering thousands of tiles.
   */
  private blitGroundCache(): void {
    if (!this.groundCanvas || !this.groundCacheValid) return;

    const margin = this.getGroundMargin();
    const origin = this.terrainRenderer.getOrigin();

    // Pan offset since cache was built
    const dx = origin.x - this.groundCacheOriginX;
    const dy = origin.y - this.groundCacheOriginY;

    // Source rectangle: viewport-sized portion offset by margin + pan delta
    const srcX = margin + dx;
    const srcY = margin + dy;

    this.ctx.drawImage(
      this.groundCanvas,
      srcX, srcY, this.canvas.width, this.canvas.height,
      0, 0, this.canvas.width, this.canvas.height
    );
  }

  // =========================================================================
  // RENDERING
  // =========================================================================

  /**
   * Schedule a render on the next animation frame (debounced).
   * Multiple calls within the same frame are coalesced into one render.
   * Use this for event-driven updates (mouse move, texture loaded, chunk ready).
   */
  private requestRender(): void {
    if (this.pendingRender !== null) return;
    this.pendingRender = requestAnimationFrame(() => {
      this.pendingRender = null;
      this.render();
    });
  }

  /**
   * Main render loop
   */
  public render() {
    // Calculate deltaTime for animations
    const now = performance.now();
    const deltaTime = this.lastRenderTime > 0 ? (now - this.lastRenderTime) / 1000 : 0;
    this.lastRenderTime = now;

    const zoom = this.terrainRenderer.getZoomLevel();

    if (zoom >= 1) {
      // === Z1/Z2/Z3: Ground cache path ===
      // Bake terrain+vegetation+concrete+roads into OffscreenCanvas.
      // Pan within margin = fast blit. Pan beyond margin = rebuild.
      // Always call terrain renderer to trigger chunk loading + update origin
      this.terrainRenderer.render();

      const canReuse = this.canReuseGroundCache();
      if (canReuse) {
        this.ctx.fillStyle = '#0a0a0f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.blitGroundCache();
      } else {
        this.rebuildGroundCache();
        this.ctx.fillStyle = '#0a0a0f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.blitGroundCache();
      }
    } else {
      // === Z0: Direct rendering (no ground cache) ===
      // Terrain renderer handles its own clear + terrain chunks + preview backdrop
      // Skip vegetation (too small), concrete (early return), roads (8×4px invisible)
      this.terrainRenderer.render();
    }

    if (!this.mapLoaded) return;

    // === Dynamic layers (always drawn directly) ===
    const bounds = this.getVisibleBounds();
    const occupiedTiles = this.buildTileOccupationMap();

    this.drawBuildings(bounds);
    this.drawVehicles(bounds, deltaTime, occupiedTiles);
    this.drawZoneOverlay(bounds);
    this.drawPlacementPreview();
    this.drawRoadDrawingPreview();
    this.drawRoadDemolishPreview();

    // Draw debug overlay if enabled
    if (this.debugMode) {
      this.drawDebugOverlay(bounds);
    }

    // Game info overlay removed — stats available via debug mode (D key)

    // Keep rendering while a building is selected (for pulse animation)
    if (this.selectedBuilding) {
      this.requestRender();
    }
  }

  /**
   * Get visible tile bounds
   */
  private getVisibleBounds(): TileBounds {
    const viewport: Rect = {
      x: 0,
      y: 0,
      width: this.canvas.width,
      height: this.canvas.height
    };

    // Get the actual origin from terrain renderer (camera position in screen coords)
    const origin = this.terrainRenderer.getOrigin();

    return this.terrainRenderer.getCoordinateMapper().getVisibleBounds(
      viewport,
      this.terrainRenderer.getZoomLevel(),
      this.terrainRenderer.getRotation(),
      origin
    );
  }

  /**
   * Build occupied tiles map (buildings have priority over roads).
   * Cached and reused across frame — invalidated when zones change.
   */
  private buildTileOccupationMap(): Set<string> {
    if (this.cachedOccupiedTiles) return this.cachedOccupiedTiles;

    const occupied = new Set<string>();

    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;

      for (let dy = 0; dy < ysize; dy++) {
        for (let dx = 0; dx < xsize; dx++) {
          occupied.add(`${building.x + dx},${building.y + dy}`);
        }
      }
    }

    this.cachedOccupiedTiles = occupied;
    return occupied;
  }

  /**
   * Check if a tile has concrete (building adjacency approach)
   * Uses pre-computed Set for O(1) lookup instead of scanning all buildings
   */
  private hasConcrete(x: number, y: number): boolean {
    return this.concreteTilesSet.has(`${x},${y}`);
  }

  /**
   * Check if a tile is on a water platform (has concrete AND is on water).
   * Used for applying platform Y-shift to concrete, roads, and buildings.
   */
  private isOnWaterPlatform(x: number, y: number): boolean {
    if (!this.hasConcrete(x, y)) return false;
    const terrainLoader = this.terrainRenderer.getTerrainLoader();
    if (!terrainLoader) return false;
    return isWater(terrainLoader.getLandId(x, y));
  }

  /**
   * Check if a building occupies a specific tile.
   * Uses pre-computed occupation map for O(1) lookup.
   */
  private isTileOccupiedByBuilding(x: number, y: number): boolean {
    return this.buildTileOccupationMap().has(`${x},${y}`);
  }

  /**
   * Get building at a specific tile position
   * Returns the building object if found, undefined otherwise
   */
  private getBuildingAtTile(x: number, y: number): MapBuilding | undefined {
    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const bw = dims?.xsize || 1;
      const bh = dims?.ysize || 1;

      if (x >= building.x && x < building.x + bw &&
          y >= building.y && y < building.y + bh) {
        return building;
      }
    }
    return undefined;
  }

  /**
   * Draw concrete tiles around buildings
   * Concrete appears on tiles adjacent to buildings to create paved areas
   */
  private drawConcrete(bounds: TileBounds): void {
    if (!this.concreteBlockClassesLoaded) return;
    // Skip concrete at far zoom levels — tiles are too small (8×4 or 16×8 px) to see concrete detail
    if (this.terrainRenderer.getZoomLevel() <= 1) return;

    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const terrainLoader = this.terrainRenderer.getTerrainLoader();

    // Create map data adapter for concrete calculations
    const mapData: ConcreteMapData = {
      getLandId: (row, col) => {
        if (!terrainLoader) return 0;
        return terrainLoader.getLandId(col, row);
      },
      hasConcrete: (row, col) => this.hasConcrete(col, row),
      hasRoad: (row, col) => this.roadTilesMap.has(`${col},${row}`),
      hasBuilding: (row, col) => this.isTileOccupiedByBuilding(col, row)
    };

    // Collect concrete tiles for painter's algorithm sorting
    const concreteTiles: Array<{
      i: number;
      j: number;
      concreteId: number;
      screenX: number;
      screenY: number;
    }> = [];

    // Iterate visible tiles and collect concrete tiles
    for (let i = bounds.minI; i <= bounds.maxI; i++) {
      for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
        // Skip tiles without concrete
        if (!mapData.hasConcrete(i, j)) continue;

        // Calculate concrete ID with rotation-aware neighbor config
        const concreteRotation = this.terrainRenderer.getRotation() as number;
        const concreteId = getConcreteId(i, j, mapData, concreteRotation);
        if (concreteId === CONCRETE_NONE) continue;

        // Get screen position
        const screenPos = this.terrainRenderer.mapToScreen(i, j);
        concreteTiles.push({
          i,
          j,
          concreteId,
          screenX: screenPos.x,
          screenY: screenPos.y
        });
      }
    }

    // Painter's algorithm: lower screen Y (farther from viewer) drawn first.
    // Using screenY instead of (i+j) makes sorting correct at all rotations.
    concreteTiles.sort((a, b) => a.screenY - b.screenY);

    const scaleFactor = config.tileWidth / 64;

    // Debug: collect texture bounding boxes for overlay
    const debugBoxes: Array<{
      drawX: number; drawY: number; w: number; h: number;
      screenX: number; screenY: number;
      concreteId: number; texW: number; texH: number;
      isPlatform: boolean;
    }> = [];
    const collectDebug = this.debugMode && this.debugShowWaterGrid;

    // Draw sorted concrete tiles
    for (const tile of concreteTiles) {
      const isWaterPlatform = (tile.concreteId & 0x80) !== 0;

      // Get texture filename from class manager
      const filename = this.concreteBlockClassManager.getImageFilename(tile.concreteId);
      if (filename) {
        // Resolve texture dimensions from atlas or individual texture
        let texW = 0, texH = 0;
        const atlasRect = this.gameObjectTextureCache.getAtlasRect('ConcreteImages', filename);
        if (atlasRect) {
          texW = atlasRect.sw;
          texH = atlasRect.sh;
        } else {
          const texture = this.gameObjectTextureCache.getTextureSync('ConcreteImages', filename);
          if (texture) {
            texW = texture.width;
            texH = texture.height;
          }
        }

        if (texW > 0) {
          // Scale to current zoom and center horizontally on tile top vertex
          const scaledWidth = Math.round(texW * scaleFactor);
          const scaledHeight = Math.round(texH * scaleFactor);
          const drawX = tile.screenX - scaledWidth / 2;

          // Position texture so its isometric diamond aligns with the tile.
          // Standard 32px textures: diamond at row 0 → drawY = screenY (no offset).
          // Platform 80px textures: diamond top vertex at row 30 (constant across
          // all platform textures — verified from platC/N/S/E/W/NE/NW/SE/SW BMPs).
          // Edge textures (N/E/W) have wall content starting at row 24 that extends
          // above the diamond; foundation extends below from row 62.
          const PLATFORM_DIAMOND_TOP = 30;
          const yOffset = isWaterPlatform && scaledHeight > config.tileHeight
            ? Math.round(PLATFORM_DIAMOND_TOP * scaleFactor)
            : (scaledHeight - config.tileHeight);
          const drawY = tile.screenY - yOffset;

          if (atlasRect) {
            ctx.drawImage(
              atlasRect.atlas,
              atlasRect.sx, atlasRect.sy, atlasRect.sw, atlasRect.sh,
              drawX, drawY,
              scaledWidth, scaledHeight
            );
          } else {
            const texture = this.gameObjectTextureCache.getTextureSync('ConcreteImages', filename)!;
            ctx.drawImage(texture, drawX, drawY, scaledWidth, scaledHeight);
          }

          if (collectDebug) {
            debugBoxes.push({ drawX, drawY, w: scaledWidth, h: scaledHeight,
              screenX: tile.screenX, screenY: tile.screenY,
              concreteId: tile.concreteId, texW, texH,
              isPlatform: isWaterPlatform });
          }
          continue;
        }
      }

      // Fallback: draw debug colored tile if texture not available
      this.drawDebugConcreteTile(ctx, tile.screenX, tile.screenY, tile.concreteId, config);
    }

    // Debug overlay: draw texture bounding boxes on top of concrete
    if (collectDebug && debugBoxes.length > 0) {
      ctx.save();
      ctx.lineWidth = 1;
      const zoomLevel = this.terrainRenderer.getZoomLevel();
      const showLabels = zoomLevel >= 2;

      for (const box of debugBoxes) {
        // Bounding box outline: magenta for platform, cyan for land
        ctx.strokeStyle = box.isPlatform ? '#ff00ff' : '#00ffff';
        ctx.strokeRect(box.drawX, box.drawY, box.w, box.h);

        // Crosshair at tile screen center (where mapToScreen points)
        ctx.strokeStyle = '#ff0000';
        ctx.beginPath();
        ctx.moveTo(box.screenX - 3, box.screenY);
        ctx.lineTo(box.screenX + 3, box.screenY);
        ctx.moveTo(box.screenX, box.screenY - 3);
        ctx.lineTo(box.screenX, box.screenY + 3);
        ctx.stroke();

        // Label: concrete ID + original texture dims
        if (showLabels) {
          const label = `$${box.concreteId.toString(16).toUpperCase()} ${box.texW}x${box.texH}`;
          ctx.font = '9px monospace';
          ctx.fillStyle = box.isPlatform ? '#ff00ff' : '#00ffff';
          ctx.fillText(label, box.drawX + 1, box.drawY + 9);
        }
      }
      ctx.restore();
    }
  }

  /**
   * Draw a debug colored tile for concrete (when texture not available)
   */
  private drawDebugConcreteTile(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    concreteId: number,
    config: ZoomConfig
  ): void {
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;

    // Choose color based on concrete type
    let color: string;
    if ((concreteId & 0x80) !== 0) {
      // Water platform - blue-gray
      color = 'rgba(100, 120, 140, 0.7)';
    } else if ((concreteId & 0x10) !== 0) {
      // Road concrete - dark gray
      color = 'rgba(80, 80, 80, 0.7)';
    } else if (concreteId === 15) {
      // Special decorative - light pattern
      color = 'rgba(160, 160, 160, 0.7)';
    } else if (concreteId === 12) {
      // Full concrete - medium gray
      color = 'rgba(140, 140, 140, 0.7)';
    } else {
      // Edge/corner concrete - slightly lighter
      color = 'rgba(130, 130, 130, 0.7)';
    }

    // Draw isometric diamond
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + halfWidth, sy + halfHeight);
    ctx.lineTo(sx, sy + config.tileHeight);
    ctx.lineTo(sx - halfWidth, sy + halfHeight);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  /**
   * Draw road segments as isometric tiles with textures
   * Uses the road texture system to determine correct textures based on topology
   *
   * Two-pass rendering (same as terrain special textures):
   * - Pass 1: Standard road tiles (texture height <= 32)
   * - Pass 2: Tall road tiles (bridges) sorted by (i+j) ascending for painter's algorithm
   */
  private drawRoads(bounds: TileBounds, occupiedTiles: Set<string>) {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;
    const terrainLoader = this.terrainRenderer.getTerrainLoader();

    // Standard tile height at base resolution (64×32)
    const BASE_TILE_HEIGHT = 32;

    // Platform elevation for roads on water platforms
    const scaleFactor = config.tileWidth / 64;
    const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);

    // Collect all road tiles into a single array for unified painter's algorithm sorting.
    // Bridges and standard tiles are interleaved so bridges don't render on top of closer roads.
    const allRoadTiles: Array<{
      x: number;
      y: number;
      sx: number;
      sy: number;
      topology: RoadBlockId;
      texture: ImageBitmap | null;
      atlasRect: { atlas: ImageBitmap; sx: number; sy: number; sw: number; sh: number } | null;
      onWaterPlatform: boolean;
      isTall: boolean;
      textureHeight: number;
      roadBlockId: number;
    }> = [];

    for (const [key] of this.roadTilesMap) {
      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      // Skip if occupied by building
      if (occupiedTiles.has(key)) continue;

      // Viewport culling
      if (x < bounds.minJ || x > bounds.maxJ || y < bounds.minI || y > bounds.maxI) {
        continue;
      }

      // Convert to isometric coordinates (x = j, y = i)
      const screenPos = this.terrainRenderer.mapToScreen(y, x);

      // Cull if off-screen (extra margin for tall textures + ground cache padding)
      if (screenPos.x < -config.tileWidth - this.cullingPadding ||
          screenPos.x > this.canvas.width + config.tileWidth + this.cullingPadding ||
          screenPos.y < -config.tileHeight * 2 - this.cullingPadding ||
          screenPos.y > this.canvas.height + config.tileHeight * 2 + this.cullingPadding) {
        continue;
      }

      // Round coordinates for pixel-perfect rendering
      const sx = Math.round(screenPos.x);
      const sy = Math.round(screenPos.y);

      let topology = RoadBlockId.None;
      let texture: ImageBitmap | null = null;
      let atlasRect: { atlas: ImageBitmap; sx: number; sy: number; sw: number; sh: number } | null = null;
      let textureHeight = 0;
      let fullRoadBlockId = 0;

      if (this.roadBlockClassesLoaded && this.roadsRendering) {
        topology = this.roadsRendering.get(y, x);

        if (topology !== RoadBlockId.None) {
          const landId = terrainLoader.getLandId(x, y);
          const onConcrete = this.hasConcrete(x, y);

          // Check for smooth corner: angles use smooth textures,
          // diagonals (adjacent opposite corners) keep regular "oblique" textures
          const smoothResult = detectSmoothCorner(
            y, x, this.roadsRendering,
            (_r, c) => this.hasConcrete(c, _r)
          );

          fullRoadBlockId = smoothResult.isSmooth
            ? smoothResult.roadBlock
            : roadBlockId(topology, landId, onConcrete, false, false);

          // Rotate road texture to match current view rotation.
          // rotateRoadBlockId uses road-texture-system's Rotation enum (same numeric values)
          const viewRotation = this.terrainRenderer.getRotation() as number;
          if (viewRotation !== 0) {
            fullRoadBlockId = rotateRoadBlockId(fullRoadBlockId, viewRotation);
          }

          const texturePath = this.roadBlockClassManager.getImagePath(fullRoadBlockId);
          if (texturePath) {
            const filename = texturePath.split('/').pop() || '';

            // Try atlas first
            const rect = this.gameObjectTextureCache.getAtlasRect('RoadBlockImages', filename);
            if (rect) {
              atlasRect = rect;
              textureHeight = rect.sh;
            } else {
              // Fallback: individual texture
              texture = this.gameObjectTextureCache.getTextureSync('RoadBlockImages', filename);
              if (texture) textureHeight = texture.height;
            }
          }
        }
      }

      // Check if this road is on a water platform (concrete + water = elevated urban road)
      const onWaterPlatform = this.isOnWaterPlatform(x, y);
      const isTall = (texture !== null || atlasRect !== null) && textureHeight > BASE_TILE_HEIGHT;

      allRoadTiles.push({
        x, y, sx, sy, topology, texture, atlasRect,
        onWaterPlatform, isTall, textureHeight,
        roadBlockId: fullRoadBlockId
      });
    }

    // Unified painter's algorithm: sort by screen Y ascending (rotation-aware back-to-front)
    allRoadTiles.sort((a, b) => a.sy - b.sy);

    const scale = config.tileWidth / 64;

    // Single pass: render each tile according to its type, in painter's order.
    // Bridge base + cover textures are drawn together so they respect depth ordering
    // relative to standard road tiles.
    for (const tile of allRoadTiles) {
      if (tile.isTall) {
        // Tall tile (bridge): draw base texture bottom-aligned
        const scaledHeight = tile.textureHeight * scale;
        const yOffset = scaledHeight - config.tileHeight;

        if (tile.atlasRect) {
          const r = tile.atlasRect;
          ctx.drawImage(r.atlas, r.sx, r.sy, r.sw, r.sh, tile.sx - halfWidth, tile.sy - yOffset, config.tileWidth, scaledHeight);
        } else if (tile.texture) {
          ctx.drawImage(tile.texture, tile.sx - halfWidth, tile.sy - yOffset, config.tileWidth, scaledHeight);
        }

        // Draw bridge cover/railing texture immediately on top of base
        if (isBridge(tile.roadBlockId)) {
          const railingPath = this.roadBlockClassManager.getRailingImagePath(tile.roadBlockId);
          if (railingPath) {
            const railingFilename = railingPath.split('/').pop() || '';
            const railingRect = this.gameObjectTextureCache.getAtlasRect('RoadBlockImages', railingFilename);

            if (railingRect) {
              const rScaledHeight = railingRect.sh * scale;
              const rYOffset = rScaledHeight - config.tileHeight;
              ctx.drawImage(
                railingRect.atlas,
                railingRect.sx, railingRect.sy, railingRect.sw, railingRect.sh,
                tile.sx - halfWidth, tile.sy - rYOffset,
                config.tileWidth, rScaledHeight
              );
            } else {
              const railingTex = this.gameObjectTextureCache.getTextureSync('RoadBlockImages', railingFilename);
              if (railingTex) {
                const rScaledHeight = railingTex.height * scale;
                const rYOffset = rScaledHeight - config.tileHeight;
                ctx.drawImage(railingTex, tile.sx - halfWidth, tile.sy - rYOffset, config.tileWidth, rScaledHeight);
              }
            }
          }
        }
      } else {
        // Standard tile: draw at tile size, elevated if on water platform
        const drawSy = tile.onWaterPlatform ? tile.sy - platformYShift : tile.sy;
        if (tile.atlasRect) {
          const r = tile.atlasRect;
          ctx.drawImage(r.atlas, r.sx, r.sy, r.sw, r.sh, tile.sx - halfWidth, drawSy, config.tileWidth, config.tileHeight);
        } else if (tile.texture) {
          ctx.drawImage(tile.texture, tile.sx - halfWidth, drawSy, config.tileWidth, config.tileHeight);
        } else {
          // Fallback: draw colored diamond
          ctx.beginPath();
          ctx.moveTo(tile.sx, drawSy);
          ctx.lineTo(tile.sx - halfWidth, drawSy + halfHeight);
          ctx.lineTo(tile.sx, drawSy + config.tileHeight);
          ctx.lineTo(tile.sx + halfWidth, drawSy + halfHeight);
          ctx.closePath();
          ctx.fillStyle = this.getDebugColorForTopology(tile.topology);
          ctx.fill();
        }
      }
    }
  }

  /**
   * Draw vegetation overlay (special terrain tiles: trees, decorations)
   * Rendered on top of flat terrain base, below concrete/roads/buildings.
   * Vegetation within 2 tiles of buildings/roads is automatically hidden.
   * Can be disabled during camera movement for performance.
   * Uses painter's algorithm: lower tiles (closer to viewer) drawn last.
   */
  private drawVegetation(bounds: TileBounds): void {
    // Skip if vegetation is globally disabled
    if (!this.vegetationEnabled) return;
    // Skip entirely at the farthest zoom level — vegetation is too small to see
    const currentZoom = this.terrainRenderer.getZoomLevel();
    if (currentZoom === 0) return;
    // At z1, auto-enable hide-on-move behavior for performance.
    // At z3 (closest zoom), always show vegetation — detail is important at this level.
    if (currentZoom !== 3 && (this.hideVegetationOnMove || currentZoom === 1) && this.isCameraMoving) return;

    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const terrainLoader = this.terrainRenderer.getTerrainLoader();
    const textureCache = this.terrainRenderer.getTextureCache();
    const atlasCache = this.terrainRenderer.getAtlasCache();
    const useAtlas = atlasCache.isReady();

    const BASE_TILE_HEIGHT = 32;

    // Collect vegetation tiles
    const vegTiles: Array<{
      i: number;
      j: number;
      sx: number;
      sy: number;
      textureId: number;
    }> = [];

    // Extend bounds by 2 tiles to catch tall textures that visually overlap into the viewport
    for (let i = bounds.minI - 2; i <= bounds.maxI + 2; i++) {
      for (let j = bounds.minJ - 2; j <= bounds.maxJ + 2; j++) {
        const textureId = terrainLoader.getTextureId(j, i);

        // Only render special tiles (vegetation/decorations)
        if (!isSpecialTile(textureId)) continue;

        // Skip tiles near buildings/roads (flattened in base terrain)
        if (this.vegetationMapper.shouldFlatten(i, j, textureId)) continue;

        const screenPos = this.terrainRenderer.mapToScreen(i, j);

        // Frustum cull with extra margin for tall textures + ground cache padding
        if (screenPos.x < -config.tileWidth * 2 - this.cullingPadding ||
            screenPos.x > this.canvas.width + config.tileWidth * 2 + this.cullingPadding ||
            screenPos.y < -config.tileHeight * 4 - this.cullingPadding ||
            screenPos.y > this.canvas.height + config.tileHeight * 2 + this.cullingPadding) {
          continue;
        }

        vegTiles.push({
          i, j,
          sx: Math.round(screenPos.x),
          sy: Math.round(screenPos.y),
          textureId,
        });
      }
    }

    // Sort by screen Y ascending for painter's algorithm (rotation-aware back-to-front)
    vegTiles.sort((a, b) => a.sy - b.sy);

    // Draw vegetation tiles
    if (useAtlas) {
      const atlasImg = atlasCache.getAtlas()!;

      for (const tile of vegTiles) {
        const rect = atlasCache.getTileRect(tile.textureId);
        if (!rect) continue;

        if (rect.sh > BASE_TILE_HEIGHT) {
          // Tall texture: draw at full height with upward offset
          const scale = config.tileWidth / 64;
          const scaledHeight = rect.sh * scale;
          const yOffset = scaledHeight - config.tileHeight;

          ctx.drawImage(
            atlasImg,
            rect.sx, rect.sy, rect.sw, rect.sh,
            tile.sx - halfWidth, tile.sy - yOffset,
            config.tileWidth, scaledHeight
          );
        } else {
          // Standard height special texture
          ctx.drawImage(
            atlasImg,
            rect.sx, rect.sy, rect.sw, rect.sh,
            tile.sx - halfWidth, tile.sy,
            config.tileWidth, config.tileHeight
          );
        }
      }
    } else {
      // Fallback: individual textures
      for (const tile of vegTiles) {
        const texture = textureCache.getTextureSync(tile.textureId);
        if (!texture) continue;

        if (texture.height > BASE_TILE_HEIGHT) {
          const scale = config.tileWidth / 64;
          const scaledHeight = texture.height * scale;
          const yOffset = scaledHeight - config.tileHeight;

          ctx.drawImage(
            texture,
            tile.sx - halfWidth, tile.sy - yOffset,
            config.tileWidth, scaledHeight
          );
        } else {
          ctx.drawImage(
            texture,
            tile.sx - halfWidth, tile.sy,
            config.tileWidth, config.tileHeight
          );
        }
      }
    }
  }

  /**
   * Check if a tile is on concrete (urban area)
   * Simple heuristic: check if adjacent to an urban building
   */
  private isOnConcrete(x: number, y: number): boolean {
    const checkRadius = 2;

    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;

      // Check if road tile is within radius of building
      const nearX = x >= building.x - checkRadius && x < building.x + xsize + checkRadius;
      const nearY = y >= building.y - checkRadius && y < building.y + ysize + checkRadius;

      if (nearX && nearY) {
        // Check if building is urban (simplified check)
        const name = dims?.name?.toLowerCase() || '';
        if (this.isUrbanBuilding(name)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a building name suggests it's an urban building
   */
  private isUrbanBuilding(name: string): boolean {
    const urbanKeywords = [
      'office', 'store', 'shop', 'mall', 'bank', 'hotel',
      'hospital', 'clinic', 'school', 'university',
      'restaurant', 'bar', 'club', 'theater', 'cinema',
      'apartment', 'condo', 'tower', 'headquarters'
    ];

    return urbanKeywords.some(keyword => name.includes(keyword));
  }

  /**
   * Get debug color for road topology (used when texture not available)
   */
  private getDebugColorForTopology(topology: RoadBlockId): string {
    switch (topology) {
      case RoadBlockId.NSRoad:
      case RoadBlockId.NSRoadStart:
      case RoadBlockId.NSRoadEnd:
        return '#777'; // Vertical roads - lighter gray

      case RoadBlockId.WERoad:
      case RoadBlockId.WERoadStart:
      case RoadBlockId.WERoadEnd:
        return '#555'; // Horizontal roads - darker gray

      case RoadBlockId.CornerN:
      case RoadBlockId.CornerE:
      case RoadBlockId.CornerS:
      case RoadBlockId.CornerW:
        return '#886'; // Corners - brownish

      case RoadBlockId.LeftPlug:
      case RoadBlockId.RightPlug:
      case RoadBlockId.TopPlug:
      case RoadBlockId.BottomPlug:
        return '#868'; // T-junctions - purplish

      case RoadBlockId.CrossRoads:
        return '#688'; // Crossroads - teal

      default:
        return '#666'; // Default gray
    }
  }

  /**
   * Draw buildings as isometric tiles with textures
   * Uses Painter's algorithm: sort by depth (y + x) so buildings closer to viewer are drawn last
   */
  private drawBuildings(bounds: TileBounds) {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;

    // Pre-filter buildings by visible bounds (with margin for multi-tile buildings)
    const margin = 10; // Generous margin for large buildings
    const visibleBuildings = this.allBuildings.filter(b => {
      const dims = this.facilityDimensionsCache.get(b.visualClass);
      const bw = dims?.xsize || 1;
      const bh = dims?.ysize || 1;
      return b.x + bw > bounds.minJ - margin && b.x < bounds.maxJ + margin &&
             b.y + bh > bounds.minI - margin && b.y < bounds.maxI + margin;
    });

    // Painter's algorithm: sort by screen Y ascending (rotation-aware).
    // Lower screen Y = farther from viewer = draw FIRST (behind).
    const sortedBuildings = visibleBuildings.sort((a, b) => {
      const aScreen = this.terrainRenderer.mapToScreen(a.y, a.x);
      const bScreen = this.terrainRenderer.mapToScreen(b.y, b.x);
      return aScreen.y - bScreen.y;
    });

    sortedBuildings.forEach(building => {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;

      const isHovered = this.hoveredBuilding === building;

      // Try to get building texture
      const textureFilename = GameObjectTextureCache.getBuildingTextureFilename(building.visualClass);
      const texture = this.gameObjectTextureCache.getTextureSync('BuildingImages', textureFilename);

      if (texture) {
        // Calculate zoom scale factor
        // Building textures are designed for 64x32 tile size (zoom level 3)
        // Scale proportionally to current zoom level
        const scaleFactor = config.tileWidth / 64;
        const scaledWidth = texture.width * scaleFactor;
        const scaledHeight = texture.height * scaleFactor;

        // Calculate the anchor point: the SOUTH corner of the building footprint.
        // The south corner (closest to viewer, highest screen Y) changes with rotation:
        //   NORTH: (y, x)  EAST: (y+h-1, x)  SOUTH: (y+h-1, x+w-1)  WEST: (y, x+w-1)
        const rotation = this.terrainRenderer.getRotation();
        let anchorI: number, anchorJ: number;
        switch (rotation) {
          case Rotation.NORTH: anchorI = building.y;              anchorJ = building.x;              break;
          case Rotation.EAST:  anchorI = building.y + ysize - 1;  anchorJ = building.x;              break;
          case Rotation.SOUTH: anchorI = building.y + ysize - 1;  anchorJ = building.x + xsize - 1;  break;
          case Rotation.WEST:  anchorI = building.y;              anchorJ = building.x + xsize - 1;  break;
          default:             anchorI = building.y;              anchorJ = building.x;              break;
        }
        const southCornerScreenPos = this.terrainRenderer.mapToScreen(anchorI, anchorJ);

        // The texture bottom-center should align with the south vertex of the south corner tile
        // South vertex is at screenPos.y + tileHeight
        const drawX = Math.round(southCornerScreenPos.x - scaledWidth / 2);
        let drawY = Math.round(southCornerScreenPos.y + config.tileHeight - scaledHeight);

        // Buildings on water platforms are elevated to match the platform
        if (this.isOnWaterPlatform(anchorJ, anchorI)) {
          const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);
          drawY -= platformYShift;
        }

        // Cull if completely off-screen
        if (drawX + scaledWidth < 0 ||
            drawX > this.canvas.width ||
            drawY + scaledHeight < 0 ||
            drawY > this.canvas.height) {
          return;
        }

        // Draw texture scaled to match current zoom level
        ctx.drawImage(texture, drawX, drawY, scaledWidth, scaledHeight);

        // Draw hover/selection effect ON TOP of texture (visible for tall buildings)
        const isSelected = this.selectedBuilding === building;
        if (isSelected) {
          // Record exact drawn position for StatusOverlay positioning
          this.selectedBuildingDrawnTop = {
            x: southCornerScreenPos.x,
            y: drawY,
            textureHeight: scaledHeight,
          };
        }
        if (isHovered || isSelected) {
          this.drawBuildingSelectionEffect(
            building, xsize, ysize, config, halfWidth, halfHeight,
            isSelected, isHovered
          );
        }

        // Draw construction indicator if building is under construction
        if (textureFilename.startsWith('Construction')) {
          this.drawConstructionIndicator(
            southCornerScreenPos.x,
            southCornerScreenPos.y + halfHeight,
            scaledWidth
          );
        }

        // Draw VisualClass label for debugging/identification
        this.drawBuildingLabel(building.visualClass, southCornerScreenPos.x, southCornerScreenPos.y + halfHeight);
      } else {
        // Texture not loaded yet — skip (will render once texture arrives via onTextureLoaded callback)
        return;
      }
    });
  }

  /**
   * Draw building VisualClass label for identification
   * Skipped at zoom levels 0-1 where tiles are too small for readable labels
   */
  private drawBuildingLabel(visualClass: string, x: number, y: number): void {
    // Skip labels at far zoom levels — tiles are too small for readable text
    if (this.terrainRenderer.getZoomLevel() <= 1) return;

    const ctx = this.ctx;

    // Draw label background
    ctx.font = '10px monospace';
    const text = visualClass;
    const metrics = ctx.measureText(text);
    const padding = 2;
    const bgWidth = metrics.width + padding * 2;
    const bgHeight = 12;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(Math.round(x - bgWidth / 2), Math.round(y - bgHeight / 2), bgWidth, bgHeight);

    // Draw label text
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, Math.round(x), Math.round(y));
  }

  /**
   * Draw construction indicator below a building under construction.
   * Shows an orange "BUILDING" label. Skipped at zoom levels 0-1.
   */
  private drawConstructionIndicator(x: number, y: number, buildingWidth: number): void {
    if (this.terrainRenderer.getZoomLevel() <= 1) return;

    const ctx = this.ctx;
    const label = 'BUILDING';
    ctx.font = '9px monospace';
    const metrics = ctx.measureText(label);
    const padding = 3;
    const barWidth = Math.max(metrics.width + padding * 2, buildingWidth * 0.5);
    const barHeight = 13;

    // Position below the building center
    const bx = Math.round(x - barWidth / 2);
    const by = Math.round(y + 4);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(bx, by, barWidth, barHeight);

    // Orange border top
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(bx, by, barWidth, 2);

    // Label text
    ctx.fillStyle = '#F59E0B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, Math.round(x), Math.round(by + barHeight / 2 + 1));
  }

  /**
   * Draw building footprint as individual tile diamonds (fill only).
   */
  private drawBuildingFootprint(
    building: MapBuilding,
    xsize: number,
    ysize: number,
    config: ZoomConfig,
    halfWidth: number,
    halfHeight: number
  ): void {
    const ctx = this.ctx;

    for (let dy = 0; dy < ysize; dy++) {
      for (let dx = 0; dx < xsize; dx++) {
        const screenPos = this.terrainRenderer.mapToScreen(building.y + dy, building.x + dx);
        const sx = Math.round(screenPos.x);
        const sy = Math.round(screenPos.y);

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - halfWidth, sy + halfHeight);
        ctx.lineTo(sx, sy + config.tileHeight);
        ctx.lineTo(sx + halfWidth, sy + halfHeight);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /**
   * Draw selection/hover effect on top of a building texture.
   * - Selected: gold pulsing footprint with glowing outline
   * - Hover: green semi-transparent footprint with subtle outline
   */
  private drawBuildingSelectionEffect(
    building: MapBuilding,
    xsize: number,
    ysize: number,
    config: ZoomConfig,
    halfWidth: number,
    halfHeight: number,
    isSelected: boolean,
    isHovered: boolean
  ): void {
    const ctx = this.ctx;
    const now = performance.now();

    // Pulsing alpha for selected buildings (0.15 to 0.35 over ~1.5s cycle)
    const pulseAlpha = isSelected
      ? 0.15 + 0.2 * (0.5 + 0.5 * Math.sin((now - this.selectionPulseTime) * 0.004))
      : 0.2;

    // Color: gold for selected, green for hover-only
    const fillColor = isSelected ? '#D4A853' : '#10B981';
    const strokeColor = isSelected ? '#D4A853' : '#10B981';

    // 1. Semi-transparent fill over the footprint
    ctx.globalAlpha = pulseAlpha;
    ctx.fillStyle = fillColor;
    this.drawBuildingFootprint(building, xsize, ysize, config, halfWidth, halfHeight);

    // 2. Glowing outline around the entire footprint perimeter
    ctx.globalAlpha = isSelected ? 0.8 : 0.5;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = isSelected ? 8 : 4;

    this.drawFootprintOutline(building, xsize, ysize, config, halfWidth, halfHeight);

    // Reset context state
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
    ctx.lineWidth = 1;
  }

  /**
   * Draw the outer outline of a building footprint as a single isometric polygon.
   * Traces the 4 edges of the footprint: NE → SE → SW → NW.
   */
  private drawFootprintOutline(
    building: MapBuilding,
    xsize: number,
    ysize: number,
    config: ZoomConfig,
    halfWidth: number,
    halfHeight: number
  ): void {
    const ctx = this.ctx;

    ctx.beginPath();

    // North vertex: top of tile (y, x)
    const topTile = this.terrainRenderer.mapToScreen(building.y, building.x);
    ctx.moveTo(Math.round(topTile.x), Math.round(topTile.y));

    // Trace NE edge: right vertices of tiles along x-axis
    for (let dx = 0; dx < xsize; dx++) {
      const pos = this.terrainRenderer.mapToScreen(building.y, building.x + dx);
      ctx.lineTo(Math.round(pos.x + halfWidth), Math.round(pos.y + halfHeight));
    }

    // Trace SE edge: bottom vertices of tiles along y-axis at x=xsize-1
    for (let dy = 0; dy < ysize; dy++) {
      const pos = this.terrainRenderer.mapToScreen(building.y + dy, building.x + xsize - 1);
      ctx.lineTo(Math.round(pos.x), Math.round(pos.y + config.tileHeight));
    }

    // Trace SW edge: left vertices of tiles along x-axis (reverse) at y=ysize-1
    for (let dx = xsize - 1; dx >= 0; dx--) {
      const pos = this.terrainRenderer.mapToScreen(building.y + ysize - 1, building.x + dx);
      ctx.lineTo(Math.round(pos.x - halfWidth), Math.round(pos.y + halfHeight));
    }

    // Trace NW edge: top vertices back to start along y-axis (reverse) at x=0
    for (let dy = ysize - 1; dy >= 0; dy--) {
      const pos = this.terrainRenderer.mapToScreen(building.y + dy, building.x);
      ctx.lineTo(Math.round(pos.x), Math.round(pos.y));
    }

    ctx.closePath();
    ctx.stroke();
  }

  /**
   * Draw zone overlay as semi-transparent isometric tiles
   */
  private drawZoneOverlay(bounds: TileBounds) {
    if (!this.zoneOverlayEnabled || !this.zoneOverlayData) return;

    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;
    const data = this.zoneOverlayData;

    // Zone color mapping
    const zoneColors: Record<number, string> = {
      0: 'transparent',
      3000: 'rgba(255, 107, 107, 0.3)',  // Residential - Red
      4000: 'rgba(77, 171, 247, 0.3)',   // Commercial - Blue
      5000: 'rgba(255, 212, 59, 0.3)',   // Industrial - Yellow
      6000: 'rgba(81, 207, 102, 0.3)',   // Agricultural - Green
      7000: 'rgba(255, 146, 43, 0.3)',   // Mixed - Orange
      8000: 'rgba(132, 94, 247, 0.3)',   // Special - Purple
      9000: 'rgba(253, 126, 20, 0.3)',   // Other - Bright Orange
    };

    for (let row = 0; row < data.rows.length; row++) {
      const rowData = data.rows[row];
      for (let col = 0; col < rowData.length; col++) {
        const value = rowData[col];
        if (value === 0) continue;

        const worldX = this.zoneOverlayX1 + col;
        const worldY = this.zoneOverlayY1 + row;

        // Convert to isometric (x = j, y = i)
        const screenPos = this.terrainRenderer.mapToScreen(worldY, worldX);

        // Cull if off-screen
        if (screenPos.x < -config.tileWidth || screenPos.x > this.canvas.width + config.tileWidth ||
            screenPos.y < -config.tileHeight || screenPos.y > this.canvas.height + config.tileHeight) {
          continue;
        }

        const color = zoneColors[value] || 'rgba(136, 136, 136, 0.3)';

        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
        ctx.lineTo(screenPos.x, screenPos.y + config.tileHeight);
        ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();
      }
    }
  }

  // Zone color → overlay value mapping
  private static readonly ZONE_COLOR_MAP: Record<string, number> = {
    red: 3000,       // Residential
    blue: 4000,      // Commercial
    yellow: 5000,    // Industrial
    green: 6000,     // Agricultural
    orange: 7000,    // Mixed
    purple: 8000,    // Special
  };

  // Zone color → display name mapping
  private static readonly ZONE_NAME_MAP: Record<string, string> = {
    red: 'RESIDENTIAL',
    blue: 'COMMERCE',
    yellow: 'INDUSTRIAL',
    green: 'AGRICULTURAL',
    orange: 'MIXED',
    purple: 'SPECIAL',
  };

  /**
   * Parse zone requirement text into a zone overlay value.
   * Input: "Building must be located in blue zone or no zone at all."
   * Output: 4000 (Commercial), or 0 if no zone requirement
   */
  private parseZoneRequirementValue(zoneRequirement: string): number {
    if (!zoneRequirement) return 0;
    const match = /(red|blue|yellow|green|orange|purple)\s+zone/i.exec(zoneRequirement);
    if (!match) return 0;
    return IsometricMapRenderer.ZONE_COLOR_MAP[match[1].toLowerCase()] || 0;
  }

  /**
   * Parse zone requirement text into a clean display name.
   * Input: "Building must be located in blue zone or no zone at all."
   * Output: "COMMERCE", or null if no zone requirement
   */
  private parseZoneDisplayName(zoneRequirement: string): string | null {
    if (!zoneRequirement) return null;
    const match = /(red|blue|yellow|green|orange|purple)\s+zone/i.exec(zoneRequirement);
    if (!match) return null;
    return IsometricMapRenderer.ZONE_NAME_MAP[match[1].toLowerCase()] || null;
  }

  /**
   * Compute the canonical NW corner (min x, min y) from the cursor tile.
   * The cursor is always the visual "top" corner of the footprint; the server
   * expects the NW corner regardless of rotation.
   *
   * Derived from Delphi Voyager: Map.pas MouseClick coordinate adjustment.
   */
  private placementNWCorner(
    cursorI: number, cursorJ: number, xsize: number, ysize: number
  ): { nwI: number; nwJ: number } {
    const rotation = this.terrainRenderer.getRotation();
    switch (rotation) {
      case Rotation.NORTH: return { nwI: cursorI,                nwJ: cursorJ };
      case Rotation.EAST:  return { nwI: cursorI - (ysize - 1),  nwJ: cursorJ };
      case Rotation.SOUTH: return { nwI: cursorI - (ysize - 1),  nwJ: cursorJ - (xsize - 1) };
      case Rotation.WEST:  return { nwI: cursorI,                nwJ: cursorJ - (xsize - 1) };
      default:             return { nwI: cursorI,                nwJ: cursorJ };
    }
  }

  /**
   * Return all footprint tiles for a building placed at the cursor tile,
   * accounting for the current view rotation.
   *
   * Uses the Delphi iinc/jinc pattern (Map.pas BuildCheck):
   *   NORTH: i++ j++    EAST: i-- j++    SOUTH: i-- j--    WEST: i++ j--
   *
   * The cursor tile is the visual "top" corner. The footprint extends
   * xsize tiles along the iinc axis and ysize tiles along the jinc axis.
   */
  private getFootprintTiles(
    cursorI: number, cursorJ: number, xsize: number, ysize: number
  ): Array<{ tileI: number; tileJ: number }> {
    const rotation = this.terrainRenderer.getRotation();
    let iinc: number, jinc: number;
    switch (rotation) {
      case Rotation.NORTH: iinc = 1;  jinc = 1;  break;
      case Rotation.EAST:  iinc = -1; jinc = 1;  break;
      case Rotation.SOUTH: iinc = -1; jinc = -1; break;
      case Rotation.WEST:  iinc = 1;  jinc = -1; break;
      default:             iinc = 1;  jinc = 1;  break;
    }

    const tiles: Array<{ tileI: number; tileJ: number }> = [];
    for (let dy = 0; dy < ysize; dy++) {
      for (let dx = 0; dx < xsize; dx++) {
        tiles.push({
          tileI: cursorI + dy * iinc,
          tileJ: cursorJ + dx * jinc,
        });
      }
    }
    return tiles;
  }

  /**
   * Draw building placement preview
   */
  private drawPlacementPreview() {
    if (!this.placementMode || !this.placementPreview) return;
    // Don't draw until mouse has entered the canvas (avoids (0,0) ghost preview)
    if (!this.mouseHasEnteredCanvas) return;

    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;
    const preview = this.placementPreview;

    // Get rotation-aware footprint tiles (cursor = visual top corner)
    const footprint = this.getFootprintTiles(preview.i, preview.j, preview.xsize, preview.ysize);

    // Check for collisions and zone requirements
    let hasCollision = false;
    let hasZoneMismatch = false;

    // Parse required zone value from zone requirement text
    // Text format: "Building must be located in blue zone or no zone at all."
    const requiredZoneValue = this.parseZoneRequirementValue(preview.zoneRequirement);

    for (const tile of footprint) {
      if (hasCollision) break;
      const checkX = tile.tileJ;
      const checkY = tile.tileI;

      // Check building collision
      for (const building of this.allBuildings) {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const bw = dims?.xsize || 1;
        const bh = dims?.ysize || 1;

        if (checkX >= building.x && checkX < building.x + bw &&
            checkY >= building.y && checkY < building.y + bh) {
          hasCollision = true;
          break;
        }
      }

      // Check road collision
      if (!hasCollision) {
        for (const seg of this.allSegments) {
          const minX = Math.min(seg.x1, seg.x2);
          const maxX = Math.max(seg.x1, seg.x2);
          const minY = Math.min(seg.y1, seg.y2);
          const maxY = Math.max(seg.y1, seg.y2);

          if (checkX >= minX && checkX <= maxX &&
              checkY >= minY && checkY <= maxY) {
            hasCollision = true;
            break;
          }
        }
      }

      // Check zone requirement (only if we have overlay data and a required zone)
      if (!hasZoneMismatch && requiredZoneValue > 0 && this.zoneOverlayData) {
        const row = checkY - this.zoneOverlayY1;
        const col = checkX - this.zoneOverlayX1;
        if (row >= 0 && row < this.zoneOverlayData.rows.length &&
            col >= 0 && col < this.zoneOverlayData.rows[row].length) {
          const tileZone = this.zoneOverlayData.rows[row][col];
          // Zone mismatch: tile is not the required zone AND not "no zone" (0 = allowed per "or no zone at all")
          if (tileZone !== requiredZoneValue && tileZone !== 0) {
            hasZoneMismatch = true;
          }
        }
      }
    }

    const isInvalid = hasCollision || hasZoneMismatch;
    const fillColor = isInvalid ? 'rgba(255, 100, 100, 0.5)' : 'rgba(100, 255, 100, 0.5)';
    const strokeColor = isInvalid ? '#ff4444' : '#44ff44';

    // Draw diamond overlay tiles (collision feedback) — rotation-aware
    for (const tile of footprint) {
      const screenPos = this.terrainRenderer.mapToScreen(tile.tileI, tile.tileJ);

      ctx.beginPath();
      ctx.moveTo(screenPos.x, screenPos.y);
      ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
      ctx.lineTo(screenPos.x, screenPos.y + config.tileHeight);
      ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
      ctx.closePath();

      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw building sprite preview (semi-transparent) on top of diamonds
    if (preview.visualClass) {
      const textureFilename = GameObjectTextureCache.getBuildingTextureFilename(preview.visualClass);
      const texture = this.gameObjectTextureCache.getTextureSync('BuildingImages', textureFilename);

      if (texture) {
        const scaleFactor = config.tileWidth / 64;
        const scaledWidth = texture.width * scaleFactor;
        const scaledHeight = texture.height * scaleFactor;

        // Anchor at the south corner of the NW-based footprint (same as drawBuildings).
        // Compute NW corner from cursor, then apply the standard anchor logic.
        const { nwI, nwJ } = this.placementNWCorner(preview.i, preview.j, preview.xsize, preview.ysize);
        const rotation = this.terrainRenderer.getRotation();
        let anchorI: number, anchorJ: number;
        switch (rotation) {
          case Rotation.NORTH: anchorI = nwI;                       anchorJ = nwJ;                       break;
          case Rotation.EAST:  anchorI = nwI + preview.ysize - 1;   anchorJ = nwJ;                       break;
          case Rotation.SOUTH: anchorI = nwI + preview.ysize - 1;   anchorJ = nwJ + preview.xsize - 1;   break;
          case Rotation.WEST:  anchorI = nwI;                       anchorJ = nwJ + preview.xsize - 1;   break;
          default:             anchorI = nwI;                       anchorJ = nwJ;                       break;
        }
        const southCorner = this.terrainRenderer.mapToScreen(anchorI, anchorJ);

        const drawX = Math.round(southCorner.x - scaledWidth / 2);
        const drawY = Math.round(southCorner.y + config.tileHeight - scaledHeight);

        // Draw semi-transparent, tinted red on invalid placement
        ctx.globalAlpha = isInvalid ? 0.4 : 0.7;
        ctx.drawImage(texture, drawX, drawY, scaledWidth, scaledHeight);
        ctx.globalAlpha = 1.0;
      }
    }

    // Draw tooltip
    const centerPos = this.terrainRenderer.mapToScreen(preview.i, preview.j);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(centerPos.x + 20, centerPos.y - 60, 200, 80);

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(preview.buildingName, centerPos.x + 30, centerPos.y - 42);
    ctx.fillText(`Cost: $${preview.cost.toLocaleString()}`, centerPos.x + 30, centerPos.y - 24);
    ctx.fillText(`Size: ${preview.xsize}×${preview.ysize}`, centerPos.x + 30, centerPos.y - 6);
    // Show clean zone name (extracted from full requirement text)
    const zoneName = this.parseZoneDisplayName(preview.zoneRequirement);
    if (zoneName) {
      ctx.fillText(`Zone: ${zoneName}`, centerPos.x + 30, centerPos.y + 12);
    }
  }

  /**
   * Draw road drawing preview
   * Shows either:
   * - A hover indicator for the current tile (when not drawing)
   * - The full path preview (when drawing/dragging)
   */
  private drawRoadDrawingPreview() {
    if (!this.roadDrawingMode) return;

    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;
    const state = this.roadDrawingState;

    // If not drawing, show hover preview for current mouse tile
    if (!state.isDrawing) {
      this.drawRoadHoverIndicator(ctx, config, halfWidth, halfHeight);
      return;
    }

    // Generate staircase path
    const pathTiles = this.generateStaircasePath(
      state.startX, state.startY,
      state.endX, state.endY
    );

    // Check for collisions along path (buildings)
    let hasBuildingCollision = false;
    for (const tile of pathTiles) {
      for (const building of this.allBuildings) {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const bw = dims?.xsize || 1;
        const bh = dims?.ysize || 1;

        if (tile.x >= building.x && tile.x < building.x + bw &&
            tile.y >= building.y && tile.y < building.y + bh) {
          hasBuildingCollision = true;
          break;
        }
      }
      if (hasBuildingCollision) break;
    }

    // Check if road connects to existing roads (or is first road)
    const connectsToRoad = this.checkRoadPathConnectsToExisting(pathTiles);
    const hasConnectionError = !connectsToRoad;

    // Determine colors based on validation
    const hasError = hasBuildingCollision || hasConnectionError;
    const fillColor = hasError ? 'rgba(255, 100, 100, 0.5)' : 'rgba(100, 200, 100, 0.5)';
    const strokeColor = hasError ? '#ff4444' : '#88ff88';

    // Draw path tiles
    for (const tile of pathTiles) {
      const screenPos = this.terrainRenderer.mapToScreen(tile.y, tile.x);

      ctx.beginPath();
      ctx.moveTo(screenPos.x, screenPos.y);
      ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
      ctx.lineTo(screenPos.x, screenPos.y + config.tileHeight);
      ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
      ctx.closePath();

      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw cost tooltip (expanded to show connection status)
    const endPos = this.terrainRenderer.mapToScreen(state.endY, state.endX);
    const tileCount = pathTiles.length;
    const cost = tileCount * this.roadCostPerTile;

    // Determine error message
    let errorMessage = '';
    if (hasBuildingCollision) {
      errorMessage = 'Blocked by building';
    } else if (hasConnectionError) {
      errorMessage = 'Must connect to road';
    }

    const tooltipHeight = errorMessage ? 55 : 40;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(endPos.x + 10, endPos.y - 30, 160, tooltipHeight);

    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Tiles: ${tileCount}`, endPos.x + 20, endPos.y - 12);
    ctx.fillText(`Cost: $${cost.toLocaleString()}`, endPos.x + 20, endPos.y + 4);

    if (errorMessage) {
      ctx.fillStyle = '#ff6666';
      ctx.fillText(`⚠ ${errorMessage}`, endPos.x + 20, endPos.y + 20);
    }
  }

  /**
   * Draw hover indicator for road drawing start point
   * Shows a highlighted tile where the road will start when user clicks
   */
  private drawRoadHoverIndicator(
    ctx: CanvasRenderingContext2D,
    config: { tileWidth: number; tileHeight: number },
    halfWidth: number,
    halfHeight: number
  ) {
    const x = this.mouseMapJ;
    const y = this.mouseMapI;

    // Check if this tile connects to existing roads (or is first road)
    const connectsToRoad = this.checkRoadPathConnectsToExisting([{ x, y }]);
    const hasExistingRoad = this.hasRoadAt(x, y);

    // Check for building collision at this tile
    let hasBuildingCollision = false;
    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const bw = dims?.xsize || 1;
      const bh = dims?.ysize || 1;

      if (x >= building.x && x < building.x + bw &&
          y >= building.y && y < building.y + bh) {
        hasBuildingCollision = true;
        break;
      }
    }

    // Determine color based on validity
    const isValid = !hasBuildingCollision && (connectsToRoad || hasExistingRoad);
    const fillColor = isValid ? 'rgba(100, 200, 255, 0.4)' : 'rgba(255, 150, 100, 0.4)';
    const strokeColor = isValid ? '#66ccff' : '#ff9966';

    // Draw the tile
    const screenPos = this.terrainRenderer.mapToScreen(y, x);

    ctx.beginPath();
    ctx.moveTo(screenPos.x, screenPos.y);
    ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
    ctx.lineTo(screenPos.x, screenPos.y + config.tileHeight);
    ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
    ctx.closePath();

    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw tooltip with info
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(screenPos.x + 15, screenPos.y - 25, 180, 45);

    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Tile: (${x}, ${y})`, screenPos.x + 25, screenPos.y - 8);

    // Show status
    const roadTileCount = this.roadTilesMap.size;
    if (hasBuildingCollision) {
      ctx.fillStyle = '#ff6666';
      ctx.fillText('Blocked by building', screenPos.x + 25, screenPos.y + 8);
    } else if (roadTileCount === 0) {
      ctx.fillStyle = '#66ff66';
      ctx.fillText('Click to start first road', screenPos.x + 25, screenPos.y + 8);
    } else if (connectsToRoad || hasExistingRoad) {
      ctx.fillStyle = '#66ff66';
      ctx.fillText('Click to start drawing', screenPos.x + 25, screenPos.y + 8);
    } else {
      ctx.fillStyle = '#ff6666';
      ctx.fillText(`Must connect to road (${roadTileCount} tiles)`, screenPos.x + 25, screenPos.y + 8);
    }
  }

  /**
   * Draw demolish hover indicator for road demolish mode.
   * Shows a red semi-transparent diamond on tiles that contain a road,
   * or a gray indicator on tiles without a road.
   */
  private drawRoadDemolishPreview() {
    if (!this.onRoadDemolishClick) return;

    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;

    const x = this.mouseMapJ;
    const y = this.mouseMapI;

    const hasRoad = this.hasRoadAt(x, y);

    // Red for tiles with roads (demolish target), gray for empty tiles
    const fillColor = hasRoad ? 'rgba(255, 50, 50, 0.5)' : 'rgba(150, 150, 150, 0.3)';
    const strokeColor = hasRoad ? '#ff3333' : '#999999';

    const screenPos = this.terrainRenderer.mapToScreen(y, x);

    ctx.beginPath();
    ctx.moveTo(screenPos.x, screenPos.y);
    ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
    ctx.lineTo(screenPos.x, screenPos.y + config.tileHeight);
    ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
    ctx.closePath();

    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /**
   * Generate staircase path between two points (for diagonal roads)
   */
  private generateStaircasePath(x1: number, y1: number, x2: number, y2: number): Point[] {
    const tiles: Point[] = [];

    let x = x1;
    let y = y1;
    tiles.push({ x, y });

    const dx = x2 - x1;
    const dy = y2 - y1;
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;

    let remainingX = Math.abs(dx);
    let remainingY = Math.abs(dy);

    while (remainingX > 0 || remainingY > 0) {
      if (remainingX >= remainingY && remainingX > 0) {
        x += sx;
        remainingX--;
      } else if (remainingY > 0) {
        y += sy;
        remainingY--;
      }
      tiles.push({ x, y });
    }

    return tiles;
  }

  /**
   * Draw water concrete debug grid overlay.
   * Shows isometric diamond outlines for every concrete tile on water, color-coded by source:
   *   Green  = building buffer (+1 around buildings)
   *   Blue   = junction 3×3 (corners, T, crossroads on water)
   * Road tiles on water with concrete get an orange outline.
   * Labels show (x,y) coordinates and concreteId hex.
   */
  private drawWaterConcreteGrid(bounds: TileBounds) {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;
    const terrainLoader = this.terrainRenderer.getTerrainLoader();
    const scaleFactor = config.tileWidth / 64;
    const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);

    const mapData: ConcreteMapData = {
      getLandId: (row, col) => terrainLoader ? terrainLoader.getLandId(col, row) : 0,
      hasConcrete: (row, col) => this.hasConcrete(col, row),
      hasRoad: (row, col) => this.roadTilesMap.has(`${col},${row}`),
      hasBuilding: (row, col) => this.isTileOccupiedByBuilding(col, row)
    };

    const sourceColors: Record<string, string> = {
      building: '#00ff00',   // Green
      junction: '#4488ff',   // Blue
    };

    const sourceFills: Record<string, string> = {
      building: 'rgba(0, 255, 0, 0.15)',
      junction: 'rgba(68, 136, 255, 0.15)',
    };

    ctx.save();

    for (let i = bounds.minI; i <= bounds.maxI; i++) {
      for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
        const key = `${j},${i}`;
        if (!this.concreteTilesSet.has(key)) continue;

        // Only show water tiles in this grid
        const landId = terrainLoader ? terrainLoader.getLandId(j, i) : 0;
        if (!isWater(landId)) continue;

        const screenPos = this.terrainRenderer.mapToScreen(i, j);

        // Skip if off-screen
        if (screenPos.x < -50 || screenPos.x > this.canvas.width + 50 ||
            screenPos.y < -50 || screenPos.y > this.canvas.height + 50) {
          continue;
        }

        const isRoadTile = this.roadTilesMap.has(key);
        const source = this.debugConcreteSourceMap.get(key) || 'junction';

        // Apply platform Y shift (same as drawConcrete)
        const drawY = screenPos.y - platformYShift;

        // Draw isometric diamond outline
        ctx.beginPath();
        ctx.moveTo(screenPos.x, drawY);                              // top
        ctx.lineTo(screenPos.x - halfWidth, drawY + halfHeight);     // left
        ctx.lineTo(screenPos.x, drawY + config.tileHeight);          // bottom
        ctx.lineTo(screenPos.x + halfWidth, drawY + halfHeight);     // right
        ctx.closePath();

        // Fill with semi-transparent source color
        if (isRoadTile) {
          ctx.fillStyle = 'rgba(255, 136, 0, 0.12)';
        } else {
          ctx.fillStyle = sourceFills[source] || 'rgba(255, 255, 255, 0.1)';
        }
        ctx.fill();

        // Stroke outline
        if (isRoadTile) {
          ctx.strokeStyle = '#ff8800';  // Orange for road tiles
          ctx.lineWidth = 2;
        } else {
          ctx.strokeStyle = sourceColors[source] || '#ffffff';
          ctx.lineWidth = 1.5;
        }
        ctx.stroke();

        // Label: coordinates + concrete ID (only at Z2+ for readability)
        if (config.tileWidth >= 32) {
          const concreteId = getConcreteId(i, j, mapData);
          const idHex = concreteId !== CONCRETE_NONE
            ? concreteId.toString(16).toUpperCase().padStart(2, '0')
            : '--';

          ctx.font = '8px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = isRoadTile ? '#ff8800' : (sourceColors[source] || '#ffffff');
          ctx.fillText(`${j},${i}`, screenPos.x, drawY + halfHeight - 2);
          ctx.fillText(`$${idHex}`, screenPos.x, drawY + halfHeight + 8);

          // Mark road tiles with 'R' and bridges with 'X'
          if (isRoadTile) {
            const topology = this.roadsRendering ? this.roadsRendering.get(i, j) : RoadBlockId.None;
            const fullRbId = roadBlockId(topology, landId, this.hasConcrete(j, i), false, false);
            const bridgeFlag = isBridge(fullRbId);
            ctx.fillStyle = bridgeFlag ? '#ff4444' : '#ff8800';
            ctx.fillText(bridgeFlag ? 'X' : 'R', screenPos.x, drawY + halfHeight + 18);
          }
        }
      }
    }

    ctx.restore();
  }

  /**
   * Draw debug overlay showing tile metadata across the full screen.
   * Optimized for screenshot analysis by sub-agents:
   * - Every visible tile gets labeled (no mouse-radius limitation)
   * - Compact labels: land type + concrete ID + road status per tile
   * - High-contrast colors on dark backgrounds for OCR readability
   * - Static legend (no mouse-dependent data that changes between captures)
   */
  private drawDebugOverlay(bounds: TileBounds) {
    const ctx = this.ctx;
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const terrainLoader = this.terrainRenderer.getTerrainLoader();
    const halfWidth = config.tileWidth / 2;
    const halfHeight = config.tileHeight / 2;
    const scaleFactor = config.tileWidth / 64;
    const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);

    // Draw water concrete grid overlay (color-coded diamonds)
    if (this.debugShowWaterGrid) {
      this.drawWaterConcreteGrid(bounds);
    }

    // Build mapData adapter once for the whole pass
    const mapData: ConcreteMapData = {
      getLandId: (row, col) => terrainLoader ? terrainLoader.getLandId(col, row) : 0,
      hasConcrete: (row, col) => this.hasConcrete(col, row),
      hasRoad: (row, col) => this.roadTilesMap.has(`${col},${row}`),
      hasBuilding: (row, col) => this.isTileOccupiedByBuilding(col, row)
    };

    // Full-screen tile labels
    const showLabels = this.debugShowTileInfo || this.debugShowRoadInfo || this.debugShowConcreteInfo;
    if (showLabels) {
      ctx.save();
      ctx.font = config.tileWidth >= 32 ? '8px monospace' : '6px monospace';
      ctx.textAlign = 'center';

      for (let i = bounds.minI; i <= bounds.maxI; i++) {
        for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
          const screenPos = this.terrainRenderer.mapToScreen(i, j);

          // Skip if off-screen
          if (screenPos.x < -50 || screenPos.x > this.canvas.width + 50 ||
              screenPos.y < -50 || screenPos.y > this.canvas.height + 50) {
            continue;
          }

          const key = `${j},${i}`;
          const landId = terrainLoader ? terrainLoader.getLandId(j, i) : 0;
          const decoded = decodeLandId(landId);
          const hasRoad = this.roadTilesMap.has(key);
          const hasConcrete = this.concreteTilesSet.has(key);
          const onWater = decoded.isWater;

          // Skip empty tiles (no road, no concrete, no water) to reduce clutter
          if (!hasRoad && !hasConcrete && !onWater && this.debugShowConcreteInfo) continue;

          // Y position: shift up for water platforms
          const isWaterPlatform = hasConcrete && onWater;
          const baseY = isWaterPlatform ? screenPos.y - platformYShift : screenPos.y;
          let labelY = baseY + halfHeight;

          // Line 1: tile coordinates (always shown when debugShowTileInfo)
          if (this.debugShowTileInfo) {
            const landClassChar = ['G', 'M', 'D', 'W'][decoded.landClass] || '?';
            ctx.fillStyle = onWater ? '#00ffff' : 'rgba(255,255,255,0.6)';
            ctx.fillText(`${j},${i} ${landClassChar}`, screenPos.x, labelY - 4);
          }

          // Line 2: concrete ID (when tile has concrete and debugShowConcreteInfo)
          if (this.debugShowConcreteInfo && hasConcrete) {
            const concreteId = getConcreteId(i, j, mapData);
            if (concreteId !== CONCRETE_NONE) {
              const isPlatform = (concreteId & 0x80) !== 0;
              ctx.fillStyle = isPlatform ? '#00ccff' : '#cc88ff';
              ctx.fillText(`$${concreteId.toString(16).toUpperCase().padStart(2, '0')}`, screenPos.x, labelY + 6);
            }
          }

          // Line 3: road info (when tile has road and debugShowRoadInfo)
          if (this.debugShowRoadInfo && hasRoad && this.roadsRendering) {
            const topology = this.roadsRendering.get(i, j);
            const fullRbId = roadBlockId(topology, landId, this.isOnConcrete(j, i), false, false);
            const bridgeFlag = isBridge(fullRbId);
            ctx.fillStyle = bridgeFlag ? '#ff4444' : '#ff8800';
            ctx.fillText(bridgeFlag ? `X:${fullRbId.toString(16).toUpperCase()}` : `R:${fullRbId.toString(16).toUpperCase()}`, screenPos.x, labelY + 16);
          }
        }
      }
      ctx.restore();
    }

    // Highlight mouse tile with yellow diamond
    {
      const screenPos = this.terrainRenderer.mapToScreen(this.mouseMapI, this.mouseMapJ);
      ctx.beginPath();
      ctx.moveTo(screenPos.x, screenPos.y);
      ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
      ctx.lineTo(screenPos.x, screenPos.y + config.tileHeight);
      ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
      ctx.closePath();
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw static legend + mouse-tile detail panel
    this.drawDebugPanel(ctx);
  }

  /**
   * Draw debug info panel
   */
  private drawDebugPanel(ctx: CanvasRenderingContext2D) {
    const terrainLoader = this.terrainRenderer.getTerrainLoader();
    const x = this.mouseMapJ;
    const y = this.mouseMapI;

    const landId = terrainLoader ? terrainLoader.getLandId(x, y) : 0;
    const decoded = decodeLandId(landId);
    const hasConcrete = this.hasConcrete(x, y);
    const hasRoad = this.roadTilesMap.has(`${x},${y}`);

    // --- Top-left: static legend (always visible, useful in screenshots) ---
    const legendLines: Array<{ text: string; color: string }> = [];
    legendLines.push({ text: 'DEBUG [D=off 1=tile 2=bldg 3=conc 4=wgrid 5=road]', color: '#ffff00' });

    // Active toggles indicator
    const toggles = [
      this.debugShowTileInfo ? '1:ON' : '1:off',
      this.debugShowBuildingInfo ? '2:ON' : '2:off',
      this.debugShowConcreteInfo ? '3:ON' : '3:off',
      this.debugShowWaterGrid ? '4:ON' : '4:off',
      this.debugShowRoadInfo ? '5:ON' : '5:off',
    ].join(' ');
    legendLines.push({ text: toggles, color: '#aaaaaa' });

    // Water grid legend (compact, always present when active)
    if (this.debugShowWaterGrid) {
      legendLines.push({ text: 'WATER GRID:', color: '#00ccff' });
      legendLines.push({ text: ' Green=bldg  Blue=junc  Orange=road', color: '#cccccc' });
    }

    // Tile label legend
    if (this.debugShowTileInfo || this.debugShowConcreteInfo || this.debugShowRoadInfo) {
      legendLines.push({ text: 'TILE LABELS:', color: '#ffff00' });
      const parts: string[] = [];
      if (this.debugShowTileInfo) parts.push('j,i+land');
      if (this.debugShowConcreteInfo) parts.push('$XX=concId');
      if (this.debugShowRoadInfo) parts.push('R/X:rbId');
      legendLines.push({ text: ' ' + parts.join('  '), color: '#cccccc' });
    }

    const legendH = 14 + legendLines.length * 14;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(8, 8, 390, legendH);
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    for (let li = 0; li < legendLines.length; li++) {
      ctx.fillStyle = legendLines[li].color;
      ctx.fillText(legendLines[li].text, 14, 22 + li * 14);
    }

    // --- Bottom-left: mouse-tile detail panel (live use, not critical for screenshots) ---
    const detailLines: Array<{ text: string; color: string }> = [];
    detailLines.push({ text: `Tile (${x},${y}) LandId:0x${landId.toString(16).toUpperCase().padStart(2,'0')}`, color: '#ffffff' });
    detailLines.push({ text: `${landClassName(decoded.landClass)} | ${landTypeName(decoded.landType)} | Var:${decoded.landVar}`, color: '#ffffff' });

    if (decoded.isWater) {
      const wtype = decoded.isDeepWater ? 'Deep(Center)' : decoded.isWaterEdge ? 'Edge' : 'Water';
      detailLines.push({ text: `WATER: ${wtype}`, color: '#00ffff' });
    }

    if (hasRoad && this.roadsRendering) {
      const topology = this.roadsRendering.get(y, x);
      const fullRbId = roadBlockId(topology, landId, this.isOnConcrete(x, y), false, false);
      const bridgeFlag = isBridge(fullRbId);
      detailLines.push({ text: `Road: ${bridgeFlag ? 'BRIDGE' : 'ROAD'} rbId=0x${fullRbId.toString(16).toUpperCase()}`, color: bridgeFlag ? '#ff4444' : '#ff8800' });
    }

    if (hasConcrete) {
      const concreteKey = `${x},${y}`;
      const source = this.debugConcreteSourceMap.get(concreteKey) || '?';
      const mapDataLocal: ConcreteMapData = {
        getLandId: (row, col) => terrainLoader ? terrainLoader.getLandId(col, row) : 0,
        hasConcrete: (row, col) => this.hasConcrete(col, row),
        hasRoad: (row, col) => this.roadTilesMap.has(`${col},${row}`),
        hasBuilding: (row, col) => this.isTileOccupiedByBuilding(col, row)
      };
      const concreteId = getConcreteId(y, x, mapDataLocal);
      const cfg = buildNeighborConfig(y, x, mapDataLocal);
      const isPlatform = (concreteId & 0x80) !== 0;
      const neighborStr = this.formatNeighborConfig(cfg);
      let idType: string;
      if (isPlatform) {
        idType = this.getPlatformIdName(concreteId);
      } else if ((concreteId & 0x10) !== 0) {
        idType = `ROAD_CONC`;
      } else if (concreteId === CONCRETE_FULL) {
        idType = 'FULL';
      } else {
        idType = `EDGE(${concreteId & 0x0F})`;
      }
      detailLines.push({ text: `Concrete: $${concreteId.toString(16).toUpperCase().padStart(2,'0')} ${idType} src:${source}`, color: isPlatform ? '#00ccff' : '#cc88ff' });
      detailLines.push({ text: `Neighbors: ${neighborStr}`, color: '#ffffff' });
      const texPath = this.concreteBlockClassManager.getImageFilename(concreteId);
      detailLines.push({ text: texPath ? `Tex: ${texPath}` : `Tex: MISSING id=${concreteId}`, color: texPath ? '#00ff00' : '#ff0000' });
    }

    // Building info (compact)
    if (this.debugShowBuildingInfo) {
      const buildingAtMouse = this.getBuildingAtTile(x, y);
      if (buildingAtMouse) {
        const dims = this.facilityDimensionsCache.get(buildingAtMouse.visualClass);
        detailLines.push({ text: `Bldg: ${buildingAtMouse.visualClass} at(${buildingAtMouse.x},${buildingAtMouse.y}) ${dims ? dims.xsize + 'x' + dims.ysize : 'NO DIMS'}`, color: '#ff8800' });
      }
    }

    const detailH = 10 + detailLines.length * 14;
    const detailY = this.canvas.height - detailH - 55;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(8, detailY, 420, detailH);
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    for (let li = 0; li < detailLines.length; li++) {
      ctx.fillStyle = detailLines[li].color;
      ctx.fillText(detailLines[li].text, 14, detailY + 14 + li * 14);
    }
  }

  /**
   * Format neighbor configuration as visual string
   * Shows [TL T TR / L X R / BL B BR]
   */
  private formatNeighborConfig(cfg: ConcreteCfg): string {
    const c = (b: boolean) => b ? '■' : '□';
    return `${c(cfg[0])}${c(cfg[1])}${c(cfg[2])} ${c(cfg[3])}X${c(cfg[4])} ${c(cfg[5])}${c(cfg[6])}${c(cfg[7])}`;
  }

  /**
   * Get platform ID name for debug display
   */
  private getPlatformIdName(concreteId: number): string {
    switch (concreteId) {
      case PLATFORM_IDS.CENTER: return 'PLATFORM_CENTER ($80)';
      case PLATFORM_IDS.E: return 'PLATFORM_E ($81)';
      case PLATFORM_IDS.N: return 'PLATFORM_N ($82)';
      case PLATFORM_IDS.NE: return 'PLATFORM_NE ($83)';
      case PLATFORM_IDS.NW: return 'PLATFORM_NW ($84)';
      case PLATFORM_IDS.S: return 'PLATFORM_S ($85)';
      case PLATFORM_IDS.SE: return 'PLATFORM_SE ($86)';
      case PLATFORM_IDS.SW: return 'PLATFORM_SW ($87)';
      case PLATFORM_IDS.W: return 'PLATFORM_W ($88)';
      default: return `PLATFORM_??? ($${concreteId.toString(16)})`;
    }
  }


  // =========================================================================
  // MOUSE CONTROLS
  // =========================================================================

  // =========================================================================
  // VEGETATION CONTROL
  // =========================================================================

  /**
   * Mark camera as moving (resets debounce timer).
   * When the timer expires, vegetation is re-rendered.
   */
  private markCameraMoving(): void {
    this.isCameraMoving = true;

    // Reset debounce timer
    if (this.cameraStopTimer !== null) {
      clearTimeout(this.cameraStopTimer);
    }

    this.cameraStopTimer = window.setTimeout(() => {
      this.isCameraMoving = false;
      this.cameraStopTimer = null;
      // Invalidate ground cache so vegetation gets baked in on next render.
      // The cache was built while isCameraMoving was true (vegetation skipped).
      this.invalidateGroundCache();
      this.requestRender();
    }, this.CAMERA_STOP_DEBOUNCE_MS);
  }

  /**
   * Enable/disable vegetation rendering globally
   */
  public setVegetationEnabled(enabled: boolean): void {
    if (this.vegetationEnabled !== enabled) {
      this.vegetationEnabled = enabled;
      this.requestRender();
    }
  }

  /**
   * Check if vegetation rendering is enabled
   */
  public isVegetationEnabled(): boolean {
    return this.vegetationEnabled;
  }

  /**
   * Enable/disable hiding vegetation during camera movement
   */
  public setHideVegetationOnMove(enabled: boolean): void {
    this.hideVegetationOnMove = enabled;
  }

  /**
   * Check if hide-vegetation-on-move is enabled
   */
  public isHideVegetationOnMove(): boolean {
    return this.hideVegetationOnMove;
  }

  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    this.requestRender();
  }

  public setVehicleAnimationsEnabled(enabled: boolean): void {
    if (this.vehicleSystem) {
      this.vehicleSystem.setEnabled(enabled);
      if (!enabled) {
        this.requestRender();
      }
    }
  }

  // =========================================================================
  // MOUSE CONTROLS
  // =========================================================================

  /** Convert screen pixel deltas to rotation-aware map deltas (Jacobian inverse) */
  private screenDeltaToMapDelta(screenDx: number, screenDy: number): { deltaI: number; deltaJ: number } {
    const config = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
    const u = config.u;
    const a = (screenDx + 2 * screenDy) / (2 * u);
    const b = (2 * screenDy - screenDx) / (2 * u);

    switch (this.terrainRenderer.getRotation()) {
      case Rotation.NORTH: return { deltaI: a,  deltaJ: b };
      case Rotation.EAST:  return { deltaI: -b, deltaJ: a };
      case Rotation.SOUTH: return { deltaI: -a, deltaJ: -b };
      case Rotation.WEST:  return { deltaI: b,  deltaJ: -a };
      default:             return { deltaI: a,  deltaJ: b };
    }
  }

  private setupMouseControls() {
    // Disable terrain renderer's built-in mouse controls (we'll handle them)
    // The terrain renderer has its own pan/zoom which we need to coordinate with

    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this.onMouseLeave());
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  }

  private onMouseDown(e: MouseEvent) {
    const mapPos = this.screenToMap(e.clientX, e.clientY);
    this.mouseMapI = mapPos.i;
    this.mouseMapJ = mapPos.j;

    if (e.button === 2) { // Right click
      e.preventDefault();

      if (this.roadDrawingMode && this.onCancelRoadDrawing) {
        this.onCancelRoadDrawing();
        return;
      }

      // Start drag (even in placement mode — cancel only on release without drag)
      this.isDragging = true;
      this.rightClickDragged = false;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
    }

    if (e.button === 0) { // Left click
      if (this.roadDrawingMode) {
        this.roadDrawingState.isDrawing = true;
        this.roadDrawingState.startX = mapPos.j;
        this.roadDrawingState.startY = mapPos.i;
        this.roadDrawingState.endX = mapPos.j;
        this.roadDrawingState.endY = mapPos.i;
        this.requestRender();
      } else if (this.placementMode && this.placementPreview) {
        // Confirm building placement — normalize cursor to NW corner for the server.
        // Server always expects (x=col, y=row) of the NW corner (min coords).
        if (this.onPlacementConfirm) {
          const p = this.placementPreview;
          const { nwI, nwJ } = this.placementNWCorner(p.i, p.j, p.xsize, p.ysize);
          this.onPlacementConfirm(nwJ, nwI); // j=x (col), i=y (row)
        }
      } else if (this.onRoadDemolishClick) {
        // Road demolish mode — only fire if a road tile exists at click location
        const key = `${mapPos.j},${mapPos.i}`;
        if (this.roadTilesMap.has(key)) {
          this.onRoadDemolishClick(mapPos.j, mapPos.i);
        }
      } else {
        // Check building click
        const building = this.getBuildingAt(mapPos.j, mapPos.i);
        if (building && this.onBuildingClick) {
          this.onBuildingClick(building.x, building.y, building.visualClass);
        } else if (!building && this.onEmptyMapClick) {
          this.onEmptyMapClick();
        }
      }
    }
  }

  private onMouseMove(e: MouseEvent) {
    const mapPos = this.screenToMap(e.clientX, e.clientY);
    this.mouseMapI = mapPos.i;
    this.mouseMapJ = mapPos.j;
    this.mouseHasEnteredCanvas = true;

    if (this.isDragging) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;

      // Mark as actual drag if moved more than a few pixels
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.rightClickDragged = true;
      }

      const { deltaI, deltaJ } = this.screenDeltaToMapDelta(dx, dy);
      this.terrainRenderer.pan(deltaI, deltaJ);

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      // Mark camera as moving (for vegetation hide-on-move option)
      this.markCameraMoving();

      // Mark zone request manager as moving (prevents zone requests during drag)
      if (this.zoneRequestManager) {
        this.zoneRequestManager.markMoving();
      }
    }

    if (this.roadDrawingMode && this.roadDrawingState.isDrawing) {
      this.roadDrawingState.endX = mapPos.j;
      this.roadDrawingState.endY = mapPos.i;
    }

    if (this.placementMode && this.placementPreview) {
      this.placementPreview.i = mapPos.i;
      this.placementPreview.j = mapPos.j;
    }

    // Update hover state
    this.hoveredBuilding = this.getBuildingAt(mapPos.j, mapPos.i);
    this.updateCursor();

    this.requestRender();
  }

  private onMouseUp(e: MouseEvent) {
    if (e.button === 2 && this.isDragging) {
      this.isDragging = false;
      this.updateCursor();

      // Right-click release without drag in placement mode → cancel placement
      if (!this.rightClickDragged && this.placementMode && this.onCancelPlacement) {
        this.onCancelPlacement();
        return;
      }

      // Mark movement stopped and trigger delayed zone loading
      if (this.zoneRequestManager) {
        const currentZoom = this.terrainRenderer.getZoomLevel();
        this.zoneRequestManager.markStopped(currentZoom);
      }

      // Also request immediately (manager will handle delay internally)
      this.checkVisibleZones();
    }

    if (e.button === 0 && this.roadDrawingMode && this.roadDrawingState.isDrawing) {
      this.roadDrawingState.isDrawing = false;

      if (this.onRoadSegmentComplete) {
        this.onRoadSegmentComplete(
          this.roadDrawingState.startX,
          this.roadDrawingState.startY,
          this.roadDrawingState.endX,
          this.roadDrawingState.endY
        );
      }
    }
  }

  private onMouseLeave() {
    if (this.isDragging) {
      this.isDragging = false;
      this.updateCursor();

      // Mark movement stopped and trigger delayed zone loading
      if (this.zoneRequestManager) {
        const currentZoom = this.terrainRenderer.getZoomLevel();
        this.zoneRequestManager.markStopped(currentZoom);
      }

      // Also request immediately (manager will handle delay internally)
      this.checkVisibleZones();
    }

  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();

    const oldZoom = this.terrainRenderer.getZoomLevel();
    const newZoom = e.deltaY > 0
      ? Math.max(0, oldZoom - 1)
      : Math.min(3, oldZoom + 1);

    if (newZoom !== oldZoom) {
      // Zoom-to-cursor: record map position under mouse at old zoom
      const rect = this.canvas.getBoundingClientRect();
      const mouseScreenX = e.clientX - rect.left;
      const mouseScreenY = e.clientY - rect.top;
      const mapPosBefore = this.terrainRenderer.screenToMap(mouseScreenX, mouseScreenY);

      // Change zoom (this recalculates origin for the same camera position)
      this.terrainRenderer.setZoomLevel(newZoom);
      this.terrainRenderer.clearDistantZoomCaches(newZoom);

      // Where does that same map position appear on screen at the new zoom?
      const screenPosAfter = this.terrainRenderer.mapToScreen(mapPosBefore.x, mapPosBefore.y);

      // Pan to compensate: move the camera so the map point stays under the mouse
      const screenDx = screenPosAfter.x - mouseScreenX;
      const screenDy = screenPosAfter.y - mouseScreenY;
      if (Math.abs(screenDx) > 0.5 || Math.abs(screenDy) > 0.5) {
        const { deltaI, deltaJ } = this.screenDeltaToMapDelta(screenDx, screenDy);
        this.terrainRenderer.pan(deltaI, deltaJ);
      }

      // Mark as moving then stopped (triggers delayed zone load based on new zoom)
      if (this.zoneRequestManager) {
        this.zoneRequestManager.markMoving();
        this.zoneRequestManager.markStopped(newZoom);
      }

      this.checkVisibleZones();
      this.requestRender();
    }
  }

  private updateCursor() {
    if (this.placementMode || this.roadDrawingMode || this.onRoadDemolishClick) {
      this.canvas.style.cursor = 'crosshair';
    } else if (this.hoveredBuilding) {
      this.canvas.style.cursor = 'pointer';
    } else if (this.isDragging) {
      this.canvas.style.cursor = 'grabbing';
    } else {
      this.canvas.style.cursor = 'grab';
    }
  }

  /**
   * Convert screen coordinates to map coordinates
   */
  private screenToMap(clientX: number, clientY: number): { i: number; j: number } {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    const mapPos = this.terrainRenderer.screenToMap(screenX, screenY);
    // mapPos.x = row (i), mapPos.y = column (j) from coordinate-mapper
    return { i: Math.floor(mapPos.x), j: Math.floor(mapPos.y) };
  }

  /**
   * Get the visual class of a building at its origin coordinates.
   * Uses exact match on building origin (x, y) — no collision check needed.
   */
  public getVisualClassAt(x: number, y: number): string | null {
    for (const building of this.allBuildings) {
      if (building.x === x && building.y === y) {
        return building.visualClass;
      }
    }
    return null;
  }

  /**
   * Get building at map coordinates
   */
  private getBuildingAt(x: number, y: number): MapBuilding | null {
    for (const building of this.allBuildings) {
      const dims = this.facilityDimensionsCache.get(building.visualClass);
      const xsize = dims?.xsize || 1;
      const ysize = dims?.ysize || 1;

      if (x >= building.x && x < building.x + xsize &&
          y >= building.y && y < building.y + ysize) {
        return building;
      }
    }
    return null;
  }

  /**
   * Check and load zones for visible area
   */
  private checkVisibleZones() {
    if (!this.zoneRequestManager) {
      return;
    }

    const bounds = this.getVisibleBounds();
    const cameraPos = this.terrainRenderer.getCameraPosition();
    const currentZoom = this.terrainRenderer.getZoomLevel();

    // Request visible zones (manager handles queuing, prioritization, and delays)
    this.zoneRequestManager.requestVisibleZones(
      bounds,
      this.cachedZones,
      cameraPos,
      currentZoom
    );
  }

  // =========================================================================
  // CLEANUP
  // =========================================================================

  public destroy() {
    // Cancel pending render
    if (this.pendingRender !== null) {
      cancelAnimationFrame(this.pendingRender);
      this.pendingRender = null;
    }

    // Cancel camera stop timer
    if (this.cameraStopTimer !== null) {
      clearTimeout(this.cameraStopTimer);
      this.cameraStopTimer = null;
    }

    // Destroy touch handler
    if (this.touchHandler) {
      this.touchHandler.destroy();
      this.touchHandler = null;
    }

    // Destroy terrain renderer (cancels its own RAF, clears caches)
    this.terrainRenderer.destroy();

    // Clear game object cache
    this.gameObjectTextureCache.clear();

    // Clear data
    this.cachedZones.clear();
    this.allBuildings = [];
    this.allSegments = [];
    this.roadTilesMap.clear();
    this.concreteTilesSet.clear();
    this.facilityDimensionsCache.clear();
    this.selectedBuilding = null;
    this.hoveredBuilding = null;

    // Clear zone request manager
    if (this.zoneRequestManager) {
      this.zoneRequestManager.clear();
      this.zoneRequestManager = null;
    }

    // Null out callbacks
    this.onLoadZone = null;
    this.onBuildingClick = null;
    this.onEmptyMapClick = null;
    this.onCancelPlacement = null;
    this.onPlacementConfirm = null;
    this.onFetchFacilityDimensions = null;
    this.onRoadSegmentComplete = null;
    this.onCancelRoadDrawing = null;
    this.onRoadDemolishClick = null;
  }
}
