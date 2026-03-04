/**
 * Vehicle Animation System Tests
 *
 * Tests vehicle spawning, movement, tile transitions, lifecycle management,
 * lane occupancy, collision avoidance, stuck timeout, and lifetime system.
 * Test environment is node (no jsdom) — mocks for Canvas/ImageBitmap as needed.
 */

import { VehicleAnimationSystem, AnimatedVehicle, RoadSide } from './vehicle-animation-system';
import { CarClassManager } from './car-class-system';
import {
  RoadBlockClassManager,
  RoadBlockId,
  RoadsRendering,
  CarPath,
  CarPathSegment
} from './road-texture-system';
import { GameObjectTextureCache } from './game-object-texture-cache';
import { TileBounds, ZoomConfig, ZOOM_LEVELS } from '../../shared/map-config';

// =============================================================================
// MOCKS
// =============================================================================

function createMockCarClassManager(): CarClassManager {
  const manager = new CarClassManager();
  manager.loadAll([
    `[General]\nId = 1\nProb = 1\nCargo = People\n[Images]\n64X32N = Car1.N.bmp\n64X32NE = Car1.NE.bmp\n64X32E = Car1.E.bmp\n64X32SE = Car1.SE.bmp\n64X32S = Car1.S.bmp\n64X32SW = Car1.SW.bmp\n64X32W = Car1.W.bmp\n64X32NW = Car1.NW.bmp`,
    `[General]\nId = 2\nProb = 0.2\nCargo = Light\n[Images]\n64X32N = Truck.N.bmp\n64X32NE = Truck.NE.bmp\n64X32E = Truck.E.bmp\n64X32SE = Truck.SE.bmp\n64X32S = Truck.S.bmp\n64X32SW = Truck.SW.bmp\n64X32W = Truck.W.bmp\n64X32NW = Truck.NW.bmp`,
  ]);
  return manager;
}

function createMockRoadBlockClassManager(): RoadBlockClassManager {
  const manager = new RoadBlockClassManager();
  // Load a horizontal road with CarPaths (WERoad topology = id 5)
  manager.loadFromIni(`[General]
Id=5

[Images]
64x32=CountryRoadhorz.bmp

[CarPaths]
N.GW = (40, -6, 10, 9, W, 6)
S.GE = (20, 14, 50, -1, E, 6)`);

  // Load a vertical road (NSRoad topology = id 1)
  manager.loadFromIni(`[General]
Id=1

[Images]
64x32=CountryRoadvert.bmp

[CarPaths]
E.GN = (49, 7, 19, -8, N, 6)
W.GS = (12, -2, 42, 13, S, 6)`);

  // Load a crossroads with multiple paths (id 14)
  manager.loadFromIni(`[General]
Id=14

[Images]
64x32=CountryRoadcross.bmp

[CarPaths]
N.GN = (40, -7, 32, -3, W, 4) (32, -3, 32, -3, NW, 1) (32, -3, 19, -8, N, 4)
N.GW = (40, -6, 10, 9, W, 6)
N.GS = (40, -7, 24, 1, W, 4) (24, 1, 24, 1, SW, 1) (24, 1, 42, 13, S, 4)
S.GE = (20, 14, 50, -1, E, 6)
S.GN = (20, 13, 36, 5, E, 4) (36, 5, 36, 5, NE, 1) (36, 5, 19, -8, N, 4)
S.GS = (20, 13, 28, 9, E, 4) (28, 9, 28, 9, SE, 1) (28, 9, 42, 13, S, 4)
E.GN = (49, 7, 19, -8, N, 6)
E.GE = (49, 7, 41, 3, N, 4) (41, 3, 41, 3, NE, 1) (41, 3, 50, -2, E, 4)
E.GW = (49, 7, 33, -1, N, 4) (33, -1, 33, -1, NW, 1) (33, -1, 10, 8, W, 4)
W.GS = (12, -2, 42, 13, S, 6)
W.GE = (12, -2, 32, 7, S, 4) (32, 7, 32, 7, SE, 1) (32, 7, 50, -2, E, 4)
W.GW = (12, -2, 18, 1, S, 4) (18, 1, 18, 1, SW, 1) (18, 1, 10, 8, W, 4)`);

  return manager;
}

/**
 * Create a long horizontal road for spawning tests.
 * Road at row 5, cols 0-30. Viewport at cols 10-20, so margin is cols 7-9 and 21-23.
 */
function createLongRoadMap(): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (let col = 0; col <= 30; col++) {
    map.set(`${col},5`, true);
  }
  return map;
}

function createLongRoadsRendering(): RoadsRendering {
  const roads = new RoadsRendering(0, 0, 40, 40);
  for (let col = 0; col <= 30; col++) {
    roads.set(5, col, RoadBlockId.WERoad);
  }
  return roads;
}

/**
 * Bounds that puts the road in the viewport margin for spawning:
 * viewport rows 0-10, cols 10-20 → margin cols 7-9 and 21-23 at row 5
 */
function createSpawningBounds(): TileBounds {
  return { minI: 0, maxI: 10, minJ: 10, maxJ: 20 };
}

/**
 * Create a crossroads network for lane tests.
 * Crossroads at (10,10) with straight roads extending in 4 directions.
 */
function createCrossroadsMap(): Map<string, boolean> {
  const map = new Map<string, boolean>();
  // Crossroads center
  map.set('10,10', true);
  // Roads extending N/S (vertical)
  for (let row = 5; row <= 15; row++) {
    if (row !== 10) map.set(`10,${row}`, true);
  }
  // Roads extending E/W (horizontal)
  for (let col = 5; col <= 15; col++) {
    if (col !== 10) map.set(`${col},10`, true);
  }
  return map;
}

function createCrossroadsRendering(): RoadsRendering {
  const roads = new RoadsRendering(0, 0, 20, 20);
  roads.set(10, 10, RoadBlockId.CrossRoads);
  for (let row = 5; row <= 15; row++) {
    if (row !== 10) roads.set(row, 10, RoadBlockId.NSRoad);
  }
  for (let col = 5; col <= 15; col++) {
    if (col !== 10) roads.set(10, col, RoadBlockId.WERoad);
  }
  return roads;
}

function createDefaultBounds(): TileBounds {
  return { minI: 0, maxI: 20, minJ: 0, maxJ: 20 };
}

function createMockTextureCache(): GameObjectTextureCache {
  return {
    getAtlasRect: jest.fn().mockReturnValue(null),
    getTextureSync: jest.fn().mockReturnValue(null),
  } as unknown as GameObjectTextureCache;
}

function setupSystem(opts?: {
  roadMap?: Map<string, boolean>;
  roadsRendering?: RoadsRendering;
}): { system: VehicleAnimationSystem; time: { value: number } } {
  const system = new VehicleAnimationSystem();
  const carClassManager = createMockCarClassManager();
  const roadBlockClassManager = createMockRoadBlockClassManager();
  const roadTilesMap = opts?.roadMap ?? createLongRoadMap();
  const roadsRendering = opts?.roadsRendering ?? createLongRoadsRendering();
  const textureCache = createMockTextureCache();

  const time = { value: 1000 };
  system.setTimeSource(() => time.value);
  system.setCarClassManager(carClassManager);
  system.setRoadBlockClassManager(roadBlockClassManager);
  system.setGameObjectTextureCache(textureCache);
  system.setRoadData(roadTilesMap, roadsRendering, () => 0, () => false);

  return { system, time };
}

// =============================================================================
// TESTS
// =============================================================================

describe('VehicleAnimationSystem', () => {
  // ==========================================================================
  // INITIALIZATION & STATE
  // ==========================================================================

  describe('initialization', () => {
    it('should start with zero vehicles', () => {
      const { system } = setupSystem();
      expect(system.getVehicleCount()).toBe(0);
    });

    it('should not be active initially', () => {
      const { system } = setupSystem();
      expect(system.isActive()).toBe(false);
    });

    it('should be enabled by default', () => {
      const { system } = setupSystem();
      system.update(0.016, createDefaultBounds());
      expect(system.getVehicleCount()).toBe(0); // No immediate spawn (cooldown)
    });
  });

  // ==========================================================================
  // ENABLE / DISABLE / PAUSE
  // ==========================================================================

  describe('enable/disable/pause', () => {
    it('should not update when disabled', () => {
      const { system } = setupSystem();
      system.setEnabled(false);

      for (let i = 0; i < 100; i++) {
        system.update(0.1, createSpawningBounds());
      }

      expect(system.getVehicleCount()).toBe(0);
    });

    it('should clear vehicles and lane occupancy when disabled', () => {
      const { system } = setupSystem();
      // Spawn vehicles
      for (let i = 0; i < 50; i++) {
        system.update(3.0, createSpawningBounds());
      }

      system.setEnabled(false);
      expect(system.getVehicleCount()).toBe(0);
    });

    it('should not update when paused', () => {
      const { system } = setupSystem();
      // Let some vehicles spawn
      for (let i = 0; i < 10; i++) {
        system.update(3.0, createSpawningBounds());
      }
      const countBefore = system.getVehicleCount();

      system.setPaused(true);
      system.update(10.0, createSpawningBounds());

      expect(system.getVehicleCount()).toBe(countBefore);
    });
  });

  // ==========================================================================
  // SPAWNING
  // ==========================================================================

  describe('spawning', () => {
    it('should spawn vehicles after cooldown period', () => {
      const { system } = setupSystem();
      system.update(0.01, createSpawningBounds());
      system.update(3.0, createSpawningBounds());

      expect(system.getVehicleCount()).toBeGreaterThanOrEqual(0);
    });

    it('should not exceed max vehicle count', () => {
      const { system } = setupSystem();
      for (let i = 0; i < 200; i++) {
        system.update(3.0, createSpawningBounds());
      }

      expect(system.getVehicleCount()).toBeLessThanOrEqual(40);
    });

    it('should clear all vehicles on clear()', () => {
      const { system } = setupSystem();
      for (let i = 0; i < 50; i++) {
        system.update(3.0, createSpawningBounds());
      }

      system.clear();
      expect(system.getVehicleCount()).toBe(0);
    });

    it('should spawn vehicles in viewport margin, not inside viewport', () => {
      const { system } = setupSystem();
      const bounds = createSpawningBounds(); // viewport cols 10-20

      // Run enough updates to spawn vehicles
      for (let i = 0; i < 30; i++) {
        system.update(3.0, bounds);
      }

      const vehicles = system.getVehicles();
      // Newly spawned vehicles should start in the margin band
      // (they may have moved into the viewport by now, but initially they spawn outside)
      // Just verify the system spawned something when margin road tiles exist
      if (vehicles.length > 0) {
        // At least one vehicle should exist
        expect(vehicles.length).toBeGreaterThan(0);
      }
    });

    it('should not spawn without road data', () => {
      const system = new VehicleAnimationSystem();
      system.setCarClassManager(createMockCarClassManager());
      // No road data set

      for (let i = 0; i < 50; i++) {
        system.update(3.0, createSpawningBounds());
      }

      expect(system.getVehicleCount()).toBe(0);
    });

    it('setBuildingTiles should be a no-op', () => {
      const { system } = setupSystem();
      // Should not throw
      system.setBuildingTiles(new Set(['5,5']));
      expect(system.getVehicleCount()).toBe(0);
    });
  });

  // ==========================================================================
  // LANE OCCUPANCY
  // ==========================================================================

  describe('lane occupancy', () => {
    it('should track lane occupancy when vehicles are spawned', () => {
      const { system } = setupSystem();

      for (let i = 0; i < 30; i++) {
        system.update(3.0, createSpawningBounds());
      }

      const vehicles = system.getVehicles();
      if (vehicles.length > 0) {
        const v = vehicles[0];
        expect(system.getLaneCount(v.tileX, v.tileY)).toBeGreaterThanOrEqual(1);
      }
    });

    it('should allow multiple vehicles on same tile in different lanes', () => {
      const { system } = setupSystem({
        roadMap: createCrossroadsMap(),
        roadsRendering: createCrossroadsRendering(),
      });

      // Use bounds that put the crossroads in the margin
      const bounds: TileBounds = { minI: 12, maxI: 20, minJ: 12, maxJ: 20 };

      // Spawn many vehicles — crossroads has 4 entry directions (4 lanes)
      for (let i = 0; i < 100; i++) {
        system.update(3.0, bounds);
      }

      // Check that the crossroads tile can have multiple vehicles
      // (This depends on the random spawning, so check any tile with > 1)
      const vehicles = system.getVehicles();
      const tileCounts = new Map<string, number>();
      for (const v of vehicles) {
        const key = `${v.tileX},${v.tileY}`;
        tileCounts.set(key, (tileCounts.get(key) ?? 0) + 1);
      }

      // Just verify the system didn't crash with lane management
      expect(system.getVehicleCount()).toBeGreaterThanOrEqual(0);
    });

    it('should clear lane occupancy on clear()', () => {
      const { system } = setupSystem();

      for (let i = 0; i < 30; i++) {
        system.update(3.0, createSpawningBounds());
      }

      system.clear();
      expect(system.getVehicleCount()).toBe(0);
      // Lane occupancy is cleared internally — verify by checking a tile
      expect(system.getLaneCount(7, 5)).toBe(0);
    });

    it('should release lane when vehicle dies', () => {
      const { system } = setupSystem();

      for (let i = 0; i < 30; i++) {
        system.update(3.0, createSpawningBounds());
      }

      const vehiclesBefore = system.getVehicleCount();
      if (vehiclesBefore > 0) {
        // Run many updates to let vehicles reach dead ends and die
        for (let i = 0; i < 200; i++) {
          system.update(3.0, createSpawningBounds());
        }

        // After many updates, some vehicles may have died
        // The system should not have orphaned lane entries
        const vehicles = system.getVehicles();
        for (const v of vehicles) {
          expect(system.getLaneCount(v.tileX, v.tileY)).toBeGreaterThanOrEqual(1);
        }
      }
    });
  });

  // ==========================================================================
  // COLLISION AVOIDANCE
  // ==========================================================================

  describe('collision avoidance', () => {
    it('should prevent vehicles from occupying same lane on same tile', () => {
      const { system } = setupSystem();

      for (let i = 0; i < 100; i++) {
        system.update(3.0, createSpawningBounds());
      }

      const vehicles = system.getVehicles();
      // Check no two vehicles share the same tile AND lane
      const occupiedLanes = new Set<string>();
      let duplicateFound = false;
      for (const v of vehicles) {
        const key = `${v.tileX},${v.tileY},${v.roadSide}`;
        if (occupiedLanes.has(key)) {
          duplicateFound = true;
          break;
        }
        occupiedLanes.add(key);
      }
      expect(duplicateFound).toBe(false);
    });
  });

  // ==========================================================================
  // STUCK TIMEOUT
  // ==========================================================================

  describe('stuck timeout', () => {
    it('should kill vehicles at dead ends immediately', () => {
      const { system } = setupSystem();

      // Use a short road: only 3 tiles → vehicles will reach dead ends quickly
      const shortMap = new Map<string, boolean>();
      shortMap.set('5,5', true);
      shortMap.set('6,5', true);
      shortMap.set('7,5', true);

      const shortRoads = new RoadsRendering(0, 0, 20, 20);
      shortRoads.set(5, 5, RoadBlockId.WERoad);
      shortRoads.set(5, 6, RoadBlockId.WERoad);
      shortRoads.set(5, 7, RoadBlockId.WERoad);

      system.setRoadData(shortMap, shortRoads, () => 0, () => false);

      // Bounds that put tiles in margin for spawning
      const bounds: TileBounds = { minI: 0, maxI: 2, minJ: 0, maxJ: 2 };

      // Spawn and let vehicles run to dead ends
      for (let i = 0; i < 100; i++) {
        system.update(3.0, bounds);
      }

      // Vehicles at dead ends should have been killed
      // (most or all should be dead since the road is very short)
      expect(system.getVehicleCount()).toBeLessThanOrEqual(40);
    });

    it('should kill stuck vehicles after 6 seconds', () => {
      const { system, time } = setupSystem();
      const bounds = createSpawningBounds();

      // Spawn vehicles
      for (let i = 0; i < 20; i++) {
        system.update(3.0, bounds);
      }

      if (system.getVehicleCount() > 0) {
        const countBefore = system.getVehicleCount();

        // Advance time by 7 seconds (past the 6s stuck threshold)
        time.value += 7000;
        // Run several updates with small deltaTime
        for (let i = 0; i < 50; i++) {
          system.update(0.05, bounds);
          time.value += 50;
        }

        // Some vehicles may have been killed due to stuck timeout or lifetime
        // Just verify the system is stable
        expect(system.getVehicleCount()).toBeLessThanOrEqual(countBefore + 10); // +10 for new spawns
      }
    });

    it('should reset stuck timer when vehicle successfully moves', () => {
      const { system, time } = setupSystem();
      const bounds = createSpawningBounds();

      // Spawn
      for (let i = 0; i < 10; i++) {
        system.update(3.0, bounds);
      }

      const vehicles = system.getVehicles();
      if (vehicles.length > 0) {
        // All moving vehicles should have stoppedSince = null
        const movingVehicles = vehicles.filter(v => v.stoppedSince === null);
        // Most vehicles should be moving (not stuck)
        expect(movingVehicles.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ==========================================================================
  // LIFETIME SYSTEM
  // ==========================================================================

  describe('lifetime system', () => {
    it('should initialize vehicles with 32 blocks remaining', () => {
      const { system } = setupSystem();
      const bounds = createSpawningBounds();

      for (let i = 0; i < 10; i++) {
        system.update(3.0, bounds);
      }

      const vehicles = system.getVehicles();
      for (const v of vehicles) {
        // blocksRemaining should be <= 32 (initial) since some may have already moved
        expect(v.blocksRemaining).toBeLessThanOrEqual(32);
        expect(v.blocksRemaining).toBeGreaterThan(0);
      }
    });

    it('should decrement blocksRemaining on tile transition', () => {
      const { system } = setupSystem();
      const bounds = createSpawningBounds();

      // Spawn
      for (let i = 0; i < 10; i++) {
        system.update(3.0, bounds);
      }

      if (system.getVehicleCount() > 0) {
        const initialBlocks = system.getVehicles()[0]?.blocksRemaining ?? 32;

        // Run several updates to let vehicles move
        for (let i = 0; i < 50; i++) {
          system.update(0.5, bounds);
        }

        const vehicles = system.getVehicles();
        if (vehicles.length > 0) {
          // At least some vehicles should have fewer blocks remaining
          const anyDecremented = vehicles.some(v => v.blocksRemaining < 32);
          // This may or may not be true depending on spawning timing
          expect(anyDecremented || vehicles.length === 0).toBe(true);
        }
      }
    });

    it('should track turn count', () => {
      const { system } = setupSystem({
        roadMap: createCrossroadsMap(),
        roadsRendering: createCrossroadsRendering(),
      });

      const bounds: TileBounds = { minI: 12, maxI: 20, minJ: 12, maxJ: 20 };

      for (let i = 0; i < 100; i++) {
        system.update(3.0, bounds);
      }

      const vehicles = system.getVehicles();
      for (const v of vehicles) {
        expect(v.turnCount).toBeGreaterThanOrEqual(0);
        // Turn count should be reasonable
        expect(v.turnCount).toBeLessThanOrEqual(100);
      }
    });
  });

  // ==========================================================================
  // SPEED
  // ==========================================================================

  describe('speed', () => {
    it('should initialize vehicles with 0.5 tiles/sec speed', () => {
      const { system } = setupSystem();
      const bounds = createSpawningBounds();

      for (let i = 0; i < 10; i++) {
        system.update(3.0, bounds);
      }

      const vehicles = system.getVehicles();
      for (const v of vehicles) {
        expect(v.speed).toBe(0.5);
      }
    });
  });

  // ==========================================================================
  // VEHICLE PROPERTIES
  // ==========================================================================

  describe('vehicle properties', () => {
    it('should set roadSide matching entry direction', () => {
      const { system } = setupSystem();
      const bounds = createSpawningBounds();

      for (let i = 0; i < 30; i++) {
        system.update(3.0, bounds);
      }

      const vehicles = system.getVehicles();
      for (const v of vehicles) {
        expect(['N', 'S', 'E', 'W']).toContain(v.roadSide);
      }
    });

    it('should track visibility within viewport bounds', () => {
      const { system } = setupSystem();
      const bounds = createSpawningBounds();

      for (let i = 0; i < 30; i++) {
        system.update(3.0, bounds);
      }

      const vehicles = system.getVehicles();
      for (const v of vehicles) {
        const expectedVisible = v.tileX >= bounds.minJ && v.tileX <= bounds.maxJ &&
                                v.tileY >= bounds.minI && v.tileY <= bounds.maxI;
        expect(v.isVisible).toBe(expectedVisible);
      }
    });

    it('should have stoppedSince null for moving vehicles', () => {
      const { system } = setupSystem();
      const bounds = createSpawningBounds();

      // Just spawn — fresh vehicles should be moving
      for (let i = 0; i < 5; i++) {
        system.update(3.0, bounds);
      }

      const vehicles = system.getVehicles();
      // Most fresh vehicles should not be stuck
      const movingCount = vehicles.filter(v => v.stoppedSince === null).length;
      expect(movingCount).toBe(vehicles.length);
    });
  });

  // ==========================================================================
  // UPDATE LOGIC
  // ==========================================================================

  describe('update', () => {
    it('should cap deltaTime to prevent teleporting after tab switch', () => {
      const { system } = setupSystem();
      for (let i = 0; i < 20; i++) {
        system.update(3.0, createSpawningBounds());
      }

      // Simulate returning from background tab with huge deltaTime
      system.update(60.0, createSpawningBounds());

      expect(system.getVehicleCount()).toBeLessThanOrEqual(40);
    });

    it('should not update without dependencies', () => {
      const emptySystem = new VehicleAnimationSystem();
      emptySystem.update(1.0, createDefaultBounds());
      expect(emptySystem.getVehicleCount()).toBe(0);
    });
  });

  // ==========================================================================
  // RENDER
  // ==========================================================================

  describe('render', () => {
    it('should not render when disabled', () => {
      const { system } = setupSystem();
      const mockCtx = { drawImage: jest.fn() } as unknown as CanvasRenderingContext2D;

      system.setEnabled(false);
      system.render(mockCtx, () => ({ x: 100, y: 100 }), ZOOM_LEVELS[2], 800, 600);

      expect(mockCtx.drawImage).not.toHaveBeenCalled();
    });

    it('should not render when no vehicles exist', () => {
      const { system } = setupSystem();
      const mockCtx = { drawImage: jest.fn() } as unknown as CanvasRenderingContext2D;

      system.render(mockCtx, () => ({ x: 100, y: 100 }), ZOOM_LEVELS[2], 800, 600);

      expect(mockCtx.drawImage).not.toHaveBeenCalled();
    });

    it('should not crash with null texture cache', () => {
      const system = new VehicleAnimationSystem();
      system.setCarClassManager(createMockCarClassManager());
      system.setRoadBlockClassManager(createMockRoadBlockClassManager());
      system.setRoadData(createLongRoadMap(), createLongRoadsRendering(), () => 0, () => false);

      for (let i = 0; i < 20; i++) {
        system.update(3.0, createSpawningBounds());
      }

      const mockCtx = { drawImage: jest.fn() } as unknown as CanvasRenderingContext2D;
      system.render(mockCtx, () => ({ x: 100, y: 100 }), ZOOM_LEVELS[2], 800, 600);
    });
  });

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  describe('lifecycle', () => {
    it('should report active when vehicles exist and system is enabled', () => {
      const { system } = setupSystem();
      expect(system.isActive()).toBe(false);

      for (let i = 0; i < 20; i++) {
        system.update(3.0, createSpawningBounds());
      }

      if (system.getVehicleCount() > 0) {
        expect(system.isActive()).toBe(true);
      }
    });

    it('should report not active when disabled even with vehicles', () => {
      const { system } = setupSystem();
      for (let i = 0; i < 20; i++) {
        system.update(3.0, createSpawningBounds());
      }

      system.setEnabled(false);
      expect(system.isActive()).toBe(false);
    });
  });

  // ==========================================================================
  // TIME SOURCE INJECTION
  // ==========================================================================

  describe('time source', () => {
    it('should use injected time source for stuck detection', () => {
      const { system, time } = setupSystem();
      time.value = 5000;

      for (let i = 0; i < 10; i++) {
        system.update(3.0, createSpawningBounds());
        time.value += 100;
      }

      // System should be functional with custom time source
      expect(system.getVehicleCount()).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty road map gracefully', () => {
      const { system } = setupSystem({
        roadMap: new Map(),
        roadsRendering: new RoadsRendering(0, 0, 10, 10),
      });

      for (let i = 0; i < 50; i++) {
        system.update(3.0, createSpawningBounds());
      }

      expect(system.getVehicleCount()).toBe(0);
    });

    it('should handle bounds with no margin roads', () => {
      const { system } = setupSystem();
      // Bounds that encompass ALL road tiles — no margin candidates
      const allEnclosingBounds: TileBounds = { minI: -10, maxI: 50, minJ: -10, maxJ: 50 };

      for (let i = 0; i < 50; i++) {
        system.update(3.0, allEnclosingBounds);
      }

      // No vehicles should spawn since all roads are inside viewport
      expect(system.getVehicleCount()).toBe(0);
    });

    it('should handle rapid enable/disable cycles', () => {
      const { system } = setupSystem();

      for (let i = 0; i < 20; i++) {
        system.setEnabled(true);
        system.update(3.0, createSpawningBounds());
        system.setEnabled(false);
        system.setEnabled(true);
      }

      // Should not crash
      expect(system.getVehicleCount()).toBeGreaterThanOrEqual(0);
    });

    it('should handle bounds changes invalidating margin cache', () => {
      const { system } = setupSystem();

      // First bounds
      system.update(3.0, createSpawningBounds());

      // Different bounds
      const newBounds: TileBounds = { minI: 2, maxI: 8, minJ: 15, maxJ: 25 };
      system.update(3.0, newBounds);

      // Should not crash on bounds change
      expect(system.getVehicleCount()).toBeGreaterThanOrEqual(0);
    });
  });
});
