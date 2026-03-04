/**
 * Vehicle Animation System
 *
 * Animates vehicles on road tiles using pre-defined CarPaths from road block INI files.
 * Matches the Delphi legacy client (Car.pas) behavior:
 * - Lane system: up to 4 cars per tile (one per road side: N/S/E/W)
 * - Viewport-margin spawning: cars appear at scene edges and drive inward
 * - Collision avoidance with direction prediction at intersections
 * - Stuck timeout: cars blocked for 6s are killed
 * - Lifetime system: 32 blocks initial, extend by 5 if visible and < 5 turns
 *
 * Performance guarantees:
 * - Active only at Z2/Z3 (zero cost at Z0/Z1)
 * - Max 40 vehicles rendered per frame
 * - Viewport culling: only visible vehicles are drawn
 * - Pre-cached textures: no fetching during render
 * - deltaTime-based animation (frame-rate independent)
 */

import { CarClassManager, CarDirection } from './car-class-system';
import { RoadBlockClassManager, CarPath, RoadBlockId, RoadsRendering, roadBlockId } from './road-texture-system';
import { GameObjectTextureCache, ObjectAtlasRect } from './game-object-texture-cache';
import { PLATFORM_SHIFT } from './concrete-texture-system';
import { TileBounds, ZoomConfig } from '../../shared/map-config';

// =============================================================================
// TYPES
// =============================================================================

/** Road side / lane a vehicle occupies within a tile (matches Delphi TRoadSide) */
export type RoadSide = 'N' | 'S' | 'E' | 'W';

export interface AnimatedVehicle {
  id: number;
  carClassId: number;
  // Current tile in the world (col, row)
  tileX: number;    // column (j)
  tileY: number;    // row (i)
  // Path traversal state
  currentPath: CarPath;
  segmentIndex: number;
  progress: number;  // 0-1 within current segment
  // Visual state
  direction: string; // Current sprite direction (N, NE, E, SE, S, SW, W, NW)
  pixelX: number;    // Pixel offset X within tile (relative to tile center, 64x32 base)
  pixelY: number;    // Pixel offset Y within tile
  speed: number;     // Tiles per second (how fast the vehicle crosses one tile)
  alive: boolean;
  // Lane tracking (Delphi: TRoadSide)
  roadSide: RoadSide;
  // Stuck detection (Delphi: cStoppedCarDeathDelay)
  stoppedSince: number | null;
  // Lifetime tracking (Delphi: fBlocksToMove, fTurnsMade)
  blocksRemaining: number;
  turnCount: number;
  isVisible: boolean;
}

// =============================================================================
// CONSTANTS (matching Delphi Car.pas)
// =============================================================================

/** Vehicle speed in tiles per second (Delphi: cCarSpeed = 0.5 blocks/sec) */
const CAR_SPEED = 0.5;

/** Max vehicles in viewport (Delphi: cMaxViewCars = 40) */
const MAX_VIEW_CARS = 40;

/** Seconds between spawn attempts (compromise between Delphi's ~10s and responsive feel) */
const SPAWN_COOLDOWN = 2.0;

/** Kill stuck cars after this many ms (Delphi: cStoppedCarDeathDelay = 6000) */
const STOPPED_CAR_DEATH_DELAY_MS = 6000;

/** Initial blocks a car can travel (Delphi: cBlocksToMove = 32) */
const BLOCKS_TO_MOVE_INITIAL = 32;

/** Blocks added when lifetime is extended (Delphi: cBlocksToMoveInc = 5) */
const BLOCKS_TO_MOVE_INCREMENT = 5;

/** Max turns before car won't get lifetime extension (Delphi: cMaxTurnsAllowed = 5) */
const MAX_TURNS_ALLOWED = 5;

/** Spawn margin in tiles outside viewport (Delphi: cCarsXMargin/cCarsYMargin = 3) */
const VIEWPORT_MARGIN = 3;

/** Minimum tiles a vehicle must be able to travel from spawn point */
const MIN_SPAWN_PATH_LENGTH = 3;

/**
 * Direction offsets for tile adjacency.
 *
 * In the CarPaths system:
 * - N/S are the "vertical" road direction (Roadvert = NS)
 * - E/W are the "horizontal" road direction (Roadhorz = WE)
 */
const EXIT_DIRECTION_OFFSETS: Record<string, { dRow: number; dCol: number }> = {
  'N': { dRow: -1, dCol: 0 },
  'S': { dRow: 1, dCol: 0 },
  'E': { dRow: 0, dCol: 1 },
  'W': { dRow: 0, dCol: -1 },
};

/**
 * When entering from a direction, the entry key is the opposite of the exit.
 * If a vehicle exits tile A going "N", it enters tile B from "S".
 */
const OPPOSITE_DIRECTION: Record<string, string> = {
  'N': 'S',
  'S': 'N',
  'E': 'W',
  'W': 'E',
};

// =============================================================================
// VEHICLE ANIMATION SYSTEM
// =============================================================================

export class VehicleAnimationSystem {
  private vehicles: AnimatedVehicle[] = [];
  private nextVehicleId: number = 0;
  private spawnCooldownRemaining: number = 0;

  // Lane occupancy: "col,row" → set of occupied road sides
  private laneOccupancy: Map<string, Set<RoadSide>> = new Map();

  // Cached margin road tiles for spawning (invalidated on bounds change)
  private marginCandidateCache: Array<{ col: number; row: number }> | null = null;
  private lastBoundsKey: string = '';

  // State
  private paused: boolean = false;
  private enabled: boolean = true;

  // Dependencies
  private carClassManager: CarClassManager | null = null;
  private roadBlockClassManager: RoadBlockClassManager | null = null;
  private gameObjectTextureCache: GameObjectTextureCache | null = null;
  private roadTilesMap: Map<string, boolean> | null = null;
  private roadsRendering: RoadsRendering | null = null;
  private getLandId: ((col: number, row: number) => number) | null = null;
  private hasConcrete: ((col: number, row: number) => boolean) | null = null;

  // Injectable time source for testability (defaults to performance.now)
  private getNow: () => number = () => performance.now();

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  setCarClassManager(manager: CarClassManager): void {
    this.carClassManager = manager;
  }

  setRoadBlockClassManager(manager: RoadBlockClassManager): void {
    this.roadBlockClassManager = manager;
  }

  setGameObjectTextureCache(cache: GameObjectTextureCache): void {
    this.gameObjectTextureCache = cache;
  }

  setRoadData(
    roadTilesMap: Map<string, boolean>,
    roadsRendering: RoadsRendering | null,
    getLandId: (col: number, row: number) => number,
    hasConcrete: (col: number, row: number) => boolean
  ): void {
    if (this.roadTilesMap !== roadTilesMap) {
      this.marginCandidateCache = null;
    }
    this.roadTilesMap = roadTilesMap;
    this.roadsRendering = roadsRendering;
    this.getLandId = getLandId;
    this.hasConcrete = hasConcrete;
  }

  /**
   * Legacy API — kept as no-op for backward compatibility.
   * Viewport-margin spawning replaced building-proximity spawning.
   */
  setBuildingTiles(_tiles: Set<string>): void {
    // No-op: spawning now uses viewport margins instead of building proximity
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.vehicles = [];
      this.laneOccupancy.clear();
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** Override the time source (for deterministic tests) */
  setTimeSource(getNow: () => number): void {
    this.getNow = getNow;
  }

  isActive(): boolean {
    return this.enabled && this.vehicles.length > 0;
  }

  getVehicleCount(): number {
    return this.vehicles.length;
  }

  /** Get a snapshot of vehicles (for testing) */
  getVehicles(): ReadonlyArray<Readonly<AnimatedVehicle>> {
    return this.vehicles;
  }

  clear(): void {
    this.vehicles = [];
    this.laneOccupancy.clear();
    this.spawnCooldownRemaining = 0;
    this.marginCandidateCache = null;
  }

  // ==========================================================================
  // LANE OCCUPANCY
  // ==========================================================================

  private tileKey(col: number, row: number): string {
    return `${col},${row}`;
  }

  private isLaneFree(col: number, row: number, lane: RoadSide): boolean {
    const lanes = this.laneOccupancy.get(this.tileKey(col, row));
    return !lanes || !lanes.has(lane);
  }

  private occupyLane(col: number, row: number, lane: RoadSide): void {
    const key = this.tileKey(col, row);
    let lanes = this.laneOccupancy.get(key);
    if (!lanes) {
      lanes = new Set();
      this.laneOccupancy.set(key, lanes);
    }
    lanes.add(lane);
  }

  private releaseLane(col: number, row: number, lane: RoadSide): void {
    const key = this.tileKey(col, row);
    const lanes = this.laneOccupancy.get(key);
    if (lanes) {
      lanes.delete(lane);
      if (lanes.size === 0) this.laneOccupancy.delete(key);
    }
  }

  private rebuildLaneOccupancy(): void {
    this.laneOccupancy.clear();
    for (const v of this.vehicles) {
      if (v.alive) this.occupyLane(v.tileX, v.tileY, v.roadSide);
    }
  }

  /** Get occupied lane count for a tile (for testing) */
  getLaneCount(col: number, row: number): number {
    const lanes = this.laneOccupancy.get(this.tileKey(col, row));
    return lanes ? lanes.size : 0;
  }

  // ==========================================================================
  // UPDATE (called every frame)
  // ==========================================================================

  update(deltaTime: number, bounds: TileBounds): void {
    if (!this.enabled || this.paused) return;
    if (!this.carClassManager || !this.roadBlockClassManager || !this.roadTilesMap) return;

    // Cap deltaTime to prevent huge jumps after tab switch
    const dt = Math.min(deltaTime, 0.1);
    const now = this.getNow();

    // Update existing vehicles
    for (const vehicle of this.vehicles) {
      this.updateVehicle(vehicle, dt, bounds, now);
    }

    // Remove dead vehicles and rebuild lane occupancy
    const prevCount = this.vehicles.length;
    this.vehicles = this.vehicles.filter(v => v.alive);
    if (this.vehicles.length !== prevCount) {
      this.rebuildLaneOccupancy();
    }

    // Try to spawn new vehicles
    this.spawnCooldownRemaining -= dt;
    if (this.spawnCooldownRemaining <= 0 && this.vehicles.length < MAX_VIEW_CARS) {
      this.trySpawnVehicle(bounds);
      this.spawnCooldownRemaining = SPAWN_COOLDOWN;
    }
  }

  // ==========================================================================
  // RENDER (called every frame after update)
  // ==========================================================================

  render(
    ctx: CanvasRenderingContext2D,
    mapToScreen: (i: number, j: number) => { x: number; y: number },
    zoomConfig: ZoomConfig,
    canvasWidth: number,
    canvasHeight: number,
    isOnWaterPlatform?: (col: number, row: number) => boolean
  ): void {
    if (!this.enabled || this.vehicles.length === 0) return;
    if (!this.gameObjectTextureCache) return;

    // CarPaths coordinates are in 64x32 tile image space.
    // scaleFactor converts from that space to the current zoom's screen space.
    const scaleFactor = zoomConfig.tileWidth / 64;
    const halfWidth = zoomConfig.tileWidth / 2;
    const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);

    for (const vehicle of this.vehicles) {
      // mapToScreen returns the tile's top diamond vertex (screen position).
      // CarPaths coordinates are in tile image space: (0,0) = top-left of 64x32 tile image.
      // The tile image is drawn at (sx - halfWidth, sy), so:
      //   tile image (px, py) -> screen (sx - halfWidth + px*scale, sy + py*scale)
      const screenPos = mapToScreen(vehicle.tileY, vehicle.tileX);
      const screenX = screenPos.x - halfWidth + vehicle.pixelX * scaleFactor;
      const onPlatform = isOnWaterPlatform ? isOnWaterPlatform(vehicle.tileX, vehicle.tileY) : false;
      const screenY = screenPos.y + vehicle.pixelY * scaleFactor - (onPlatform ? platformYShift : 0);

      const filename = this.carClassManager!.getImageFilename(vehicle.carClassId, vehicle.direction);
      if (!filename) continue;

      // Car sprites are small (15-33px wide) -- draw at NATIVE pixel size, centered on path position
      const atlasRect = this.gameObjectTextureCache.getAtlasRect('CarImages', filename);
      if (atlasRect) {
        const sw = atlasRect.sw;
        const sh = atlasRect.sh;
        const drawX = Math.round(screenX - sw / 2);
        const drawY = Math.round(screenY - sh / 2);

        if (drawX + sw < 0 || drawX > canvasWidth || drawY + sh < 0 || drawY > canvasHeight) continue;

        ctx.drawImage(
          atlasRect.atlas,
          atlasRect.sx, atlasRect.sy, sw, sh,
          drawX, drawY, sw, sh
        );
      } else {
        const texture = this.gameObjectTextureCache.getTextureSync('CarImages', filename);
        if (texture) {
          const drawX = Math.round(screenX - texture.width / 2);
          const drawY = Math.round(screenY - texture.height / 2);

          if (drawX + texture.width < 0 || drawX > canvasWidth ||
              drawY + texture.height < 0 || drawY > canvasHeight) continue;

          ctx.drawImage(texture, drawX, drawY);
        }
      }
    }
  }

  // ==========================================================================
  // VEHICLE UPDATE LOGIC
  // ==========================================================================

  private updateVehicle(vehicle: AnimatedVehicle, dt: number, bounds: TileBounds, now: number): void {
    // Update visibility
    vehicle.isVisible = vehicle.tileX >= bounds.minJ && vehicle.tileX <= bounds.maxJ &&
                        vehicle.tileY >= bounds.minI && vehicle.tileY <= bounds.maxI;

    // Check lifetime expiry
    if (vehicle.blocksRemaining <= 0) {
      if (vehicle.isVisible && vehicle.turnCount < MAX_TURNS_ALLOWED) {
        vehicle.blocksRemaining += BLOCKS_TO_MOVE_INCREMENT;
      } else {
        vehicle.alive = false;
        return;
      }
    }

    const segment = vehicle.currentPath.segments[vehicle.segmentIndex];
    if (!segment) {
      vehicle.alive = false;
      return;
    }

    // Advance progress based on speed and segment steps
    const totalSteps = this.getTotalPathSteps(vehicle.currentPath);
    const segmentFraction = segment.steps / totalSteps;
    const progressPerSecond = vehicle.speed / segmentFraction;
    vehicle.progress += progressPerSecond * dt / segment.steps;

    if (vehicle.progress >= 1) {
      vehicle.segmentIndex++;
      vehicle.progress = 0;

      if (vehicle.segmentIndex >= vehicle.currentPath.segments.length) {
        // Reached end of path -> transition to next tile
        if (!this.transitionToNextTile(vehicle)) {
          // Check if dead end or just blocked
          if (!this.hasAnyValidExit(vehicle)) {
            // Dead end -- kill immediately
            vehicle.alive = false;
            return;
          }
          // Blocked at intersection -- start/check stuck timeout
          if (vehicle.stoppedSince === null) {
            vehicle.stoppedSince = now;
          } else if (now - vehicle.stoppedSince >= STOPPED_CAR_DEATH_DELAY_MS) {
            vehicle.alive = false;
            return;
          }
          // Wait at end of current path
          vehicle.segmentIndex = vehicle.currentPath.segments.length - 1;
          vehicle.progress = 1;
        }
      }
    }

    // Interpolate pixel position within current segment
    const seg = vehicle.currentPath.segments[vehicle.segmentIndex];
    if (seg) {
      const t = Math.min(vehicle.progress, 1);
      vehicle.pixelX = seg.startX + (seg.endX - seg.startX) * t;
      vehicle.pixelY = seg.startY + (seg.endY - seg.startY) * t;
      vehicle.direction = seg.direction;
    }
  }

  private getTotalPathSteps(path: CarPath): number {
    let total = 0;
    for (const seg of path.segments) {
      total += seg.steps;
    }
    return total || 1;
  }

  /** Check if the vehicle's current exit direction leads to any road tile */
  private hasAnyValidExit(vehicle: AnimatedVehicle): boolean {
    const exitDir = vehicle.currentPath.exitDirection;
    const offset = EXIT_DIRECTION_OFFSETS[exitDir];
    if (!offset) return false;
    const newRow = vehicle.tileY + offset.dRow;
    const newCol = vehicle.tileX + offset.dCol;
    return this.roadTilesMap?.has(`${newCol},${newRow}`) ?? false;
  }

  /**
   * Check if a vehicle in an adjacent lane on the target tile has an exit direction
   * that would cross the target lane (Delphi's PredictDir deadlock prevention).
   */
  private hasCollisionRisk(col: number, row: number, targetLane: RoadSide): boolean {
    for (const other of this.vehicles) {
      if (!other.alive) continue;
      if (other.tileX !== col || other.tileY !== row) continue;
      if (other.roadSide === targetLane) continue;

      // Risk if the other vehicle's exit direction is opposite to our entry
      const otherExit = other.currentPath.exitDirection;
      if (OPPOSITE_DIRECTION[otherExit] === targetLane) {
        return true;
      }
    }
    return false;
  }

  private transitionToNextTile(vehicle: AnimatedVehicle): boolean {
    const exitDir = vehicle.currentPath.exitDirection;
    const offset = EXIT_DIRECTION_OFFSETS[exitDir];
    if (!offset) return false;

    const newRow = vehicle.tileY + offset.dRow;
    const newCol = vehicle.tileX + offset.dCol;

    if (!this.roadTilesMap?.has(`${newCol},${newRow}`)) return false;

    const entryDir = OPPOSITE_DIRECTION[exitDir] as RoadSide;

    // Lane collision check
    if (!this.isLaneFree(newCol, newRow, entryDir)) return false;

    // Direction prediction at intersections
    if (this.hasCollisionRisk(newCol, newRow, entryDir)) return false;

    const nextPath = this.findCarPathForTile(newCol, newRow, entryDir);
    if (!nextPath) return false;

    // Track direction changes
    if (nextPath.exitDirection !== vehicle.currentPath.exitDirection) {
      vehicle.turnCount++;
    }

    // Release old lane, occupy new lane
    this.releaseLane(vehicle.tileX, vehicle.tileY, vehicle.roadSide);

    vehicle.tileX = newCol;
    vehicle.tileY = newRow;
    vehicle.currentPath = nextPath;
    vehicle.roadSide = entryDir;
    vehicle.segmentIndex = 0;
    vehicle.progress = 0;
    vehicle.stoppedSince = null; // Moving again
    vehicle.blocksRemaining--;

    this.occupyLane(newCol, newRow, entryDir);
    return true;
  }

  // ==========================================================================
  // SPAWNING (viewport-margin, matching Delphi cCarsXMargin/cCarsYMargin)
  // ==========================================================================

  /**
   * Build cached list of road tiles in the viewport margin band.
   * These are tiles within VIEWPORT_MARGIN tiles outside the visible area.
   */
  private buildMarginCandidates(bounds: TileBounds): Array<{ col: number; row: number }> {
    const result: Array<{ col: number; row: number }> = [];
    if (!this.roadTilesMap) return result;

    const margin = VIEWPORT_MARGIN;

    for (const [key] of this.roadTilesMap) {
      const [colStr, rowStr] = key.split(',');
      const col = parseInt(colStr, 10);
      const row = parseInt(rowStr, 10);

      const inViewport = col >= bounds.minJ && col <= bounds.maxJ &&
                         row >= bounds.minI && row <= bounds.maxI;
      const inMargin = col >= bounds.minJ - margin && col <= bounds.maxJ + margin &&
                       row >= bounds.minI - margin && row <= bounds.maxI + margin;

      if (inMargin && !inViewport) {
        result.push({ col, row });
      }
    }

    return result;
  }

  private trySpawnVehicle(bounds: TileBounds): void {
    if (!this.roadTilesMap || !this.carClassManager) return;

    // Cache margin candidates, invalidate when bounds change
    const boundsKey = `${bounds.minI},${bounds.maxI},${bounds.minJ},${bounds.maxJ}`;
    if (this.lastBoundsKey !== boundsKey) {
      this.marginCandidateCache = null;
      this.lastBoundsKey = boundsKey;
    }
    if (!this.marginCandidateCache) {
      this.marginCandidateCache = this.buildMarginCandidates(bounds);
    }

    if (this.marginCandidateCache.length === 0) return;

    const maxAttempts = Math.min(5, this.marginCandidateCache.length);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const idx = Math.floor(Math.random() * this.marginCandidateCache.length);
      const tile = this.marginCandidateCache[idx];

      // Try all 4 entry directions
      const directions: RoadSide[] = ['N', 'S', 'E', 'W'];
      const shuffled = [...directions].sort(() => Math.random() - 0.5);

      for (const entryDir of shuffled) {
        // Lane-based check: only this specific lane needs to be free
        if (!this.isLaneFree(tile.col, tile.row, entryDir)) continue;

        const carPath = this.findCarPathForTile(tile.col, tile.row, entryDir);
        if (!carPath) continue;

        const pathLength = this.measurePathLength(tile.col, tile.row, carPath);
        if (pathLength < MIN_SPAWN_PATH_LENGTH) continue;

        const carClass = this.carClassManager.getRandomClass();
        if (!carClass) return;

        const firstSegment = carPath.segments[0];
        const vehicle: AnimatedVehicle = {
          id: this.nextVehicleId++,
          carClassId: carClass.id,
          tileX: tile.col,
          tileY: tile.row,
          currentPath: carPath,
          segmentIndex: 0,
          progress: 0,
          direction: firstSegment.direction,
          pixelX: firstSegment.startX,
          pixelY: firstSegment.startY,
          speed: CAR_SPEED,
          alive: true,
          roadSide: entryDir,
          stoppedSince: null,
          blocksRemaining: BLOCKS_TO_MOVE_INITIAL,
          turnCount: 0,
          isVisible: false,
        };

        this.vehicles.push(vehicle);
        this.occupyLane(tile.col, tile.row, entryDir);
        return;
      }
    }
  }

  /**
   * Measure how many tiles a vehicle can travel from a starting tile/path.
   * Simulates tile transitions without creating a vehicle.
   */
  private measurePathLength(startCol: number, startRow: number, startPath: CarPath): number {
    let col = startCol;
    let row = startRow;
    let path = startPath;
    let length = 1;
    const maxCheck = 20;

    while (length < maxCheck) {
      const exitDir = path.exitDirection;
      const offset = EXIT_DIRECTION_OFFSETS[exitDir];
      if (!offset) break;

      const nextRow = row + offset.dRow;
      const nextCol = col + offset.dCol;

      if (!this.roadTilesMap?.has(`${nextCol},${nextRow}`)) break;

      const entryDir = OPPOSITE_DIRECTION[exitDir];
      const nextPath = this.findCarPathForTile(nextCol, nextRow, entryDir);
      if (!nextPath) break;

      col = nextCol;
      row = nextRow;
      path = nextPath;
      length++;
    }

    return length;
  }

  // ==========================================================================
  // PATH LOOKUP
  // ==========================================================================

  private findCarPathForTile(col: number, row: number, entryDirection: string): CarPath | null {
    if (!this.roadsRendering || !this.roadBlockClassManager) return null;

    const topology = this.roadsRendering.get(row, col);
    if (topology === RoadBlockId.None) return null;

    const landId = this.getLandId ? this.getLandId(col, row) : 0;
    const onConcrete = this.hasConcrete ? this.hasConcrete(col, row) : false;
    const fullRoadBlockId = roadBlockId(topology, landId, onConcrete, false, false);

    const config = this.roadBlockClassManager.getClass(fullRoadBlockId);
    if (!config || config.carPaths.length === 0) return null;

    const matchingPaths = config.carPaths.filter(p => p.entryDirection === entryDirection);
    if (matchingPaths.length === 0) return null;

    return matchingPaths[Math.floor(Math.random() * matchingPaths.length)];
  }
}
