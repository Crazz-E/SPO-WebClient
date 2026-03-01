/**
 * Tests for worldToScreenCentered() — the overlay positioning method.
 *
 * Uses Object.create to bypass IsometricMapRenderer's DOM-dependent constructor,
 * injecting only the dependencies that worldToScreenCentered() actually touches.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { Rotation, ZOOM_LEVELS } from '../../shared/map-config';
import { PLATFORM_SHIFT } from './concrete-texture-system';
import { IsometricMapRenderer } from './isometric-map-renderer';
import type { MapBuilding } from '../../shared/types';

// Stub modules that IsometricMapRenderer imports but worldToScreenCentered doesn't use
jest.mock('./isometric-terrain-renderer', () => ({ IsometricTerrainRenderer: jest.fn() }));
jest.mock('./vegetation-flat-mapper', () => ({ VegetationFlatMapper: jest.fn() }));
jest.mock('./touch-handler-2d', () => ({ TouchHandler2D: jest.fn() }));
jest.mock('./car-class-system', () => ({ CarClassManager: jest.fn() }));
jest.mock('./vehicle-animation-system', () => ({ VehicleAnimationSystem: jest.fn() }));

function makeBuilding(partial: Partial<MapBuilding> & { x: number; y: number; visualClass: string }): MapBuilding {
  return {
    tycoonId: 0, options: 0, level: 0, alert: false, attack: 0,
    ...partial,
  };
}

/** Create a renderer instance without calling the DOM-dependent constructor. */
function createTestRenderer(overrides: {
  rotation?: Rotation;
  zoomLevel?: number;
  mapToScreen?: (i: number, j: number) => { x: number; y: number };
  building?: MapBuilding | null;
  textureHeight?: number;
  isOnWaterPlatform?: boolean;
}) {
  const rotation = overrides.rotation ?? Rotation.NORTH;
  const zoomLevel = overrides.zoomLevel ?? 3; // 64x32 tiles (scaleFactor = 1)
  const mapToScreenFn = overrides.mapToScreen ?? ((i: number, j: number) => ({
    x: (j - i) * (ZOOM_LEVELS[zoomLevel].tileWidth / 2),
    y: (j + i) * (ZOOM_LEVELS[zoomLevel].tileHeight / 2),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderer = Object.create(IsometricMapRenderer.prototype) as any;

  // Inject the minimal dependencies that worldToScreenCentered touches
  renderer.terrainRenderer = {
    getRotation: () => rotation,
    getZoomLevel: () => zoomLevel,
    mapToScreen: mapToScreenFn,
  };

  const building = overrides.building ?? null;
  renderer.allBuildings = building ? [building] : [];

  // facilityDimensionsCache.get returns dims for getBuildingAt footprint check
  renderer.facilityDimensionsCache = {
    get: () => building ? { xsize: building.visualClass === 'small' ? 1 : 4, ysize: building.visualClass === 'small' ? 1 : 4 } : undefined,
  };

  // Texture cache mock
  const texH = overrides.textureHeight ?? 0;
  renderer.gameObjectTextureCache = {
    getTextureSync: () => texH > 0 ? { width: 128, height: texH } : null,
  };

  // isOnWaterPlatform
  const onWater = overrides.isOnWaterPlatform ?? false;
  renderer.isOnWaterPlatform = () => onWater;

  // No recorded position by default — fallback path is used
  renderer.selectedBuildingDrawnTop = null;

  return renderer as IsometricMapRenderer;
}

describe('worldToScreenCentered', () => {
  // At zoom level 3: tileWidth=64, tileHeight=32, scaleFactor = 64/64 = 1
  const ZOOM = 3;
  const TILE_H = ZOOM_LEVELS[ZOOM].tileHeight; // 32

  describe('south-corner anchor selection per rotation', () => {
    const worldX = 10;
    const worldY = 20;
    const xsize = 3;
    const ysize = 4;

    // Track which (i, j) was passed to mapToScreen
    let capturedI: number;
    let capturedJ: number;

    const capturingMapToScreen = (i: number, j: number) => {
      capturedI = i;
      capturedJ = j;
      return { x: 500, y: 400 };
    };

    it('NORTH rotation: south corner = (worldY, worldX)', () => {
      const renderer = createTestRenderer({
        rotation: Rotation.NORTH, zoomLevel: ZOOM,
        mapToScreen: capturingMapToScreen,
      });
      renderer.worldToScreenCentered(worldX, worldY, xsize, ysize);
      expect(capturedI).toBe(worldY);     // 20
      expect(capturedJ).toBe(worldX);     // 10
    });

    it('EAST rotation: south corner = (worldY + ysize - 1, worldX)', () => {
      const renderer = createTestRenderer({
        rotation: Rotation.EAST, zoomLevel: ZOOM,
        mapToScreen: capturingMapToScreen,
      });
      renderer.worldToScreenCentered(worldX, worldY, xsize, ysize);
      expect(capturedI).toBe(worldY + ysize - 1);  // 23
      expect(capturedJ).toBe(worldX);               // 10
    });

    it('SOUTH rotation: south corner = (worldY + ysize - 1, worldX + xsize - 1)', () => {
      const renderer = createTestRenderer({
        rotation: Rotation.SOUTH, zoomLevel: ZOOM,
        mapToScreen: capturingMapToScreen,
      });
      renderer.worldToScreenCentered(worldX, worldY, xsize, ysize);
      expect(capturedI).toBe(worldY + ysize - 1);   // 23
      expect(capturedJ).toBe(worldX + xsize - 1);   // 12
    });

    it('WEST rotation: south corner = (worldY, worldX + xsize - 1)', () => {
      const renderer = createTestRenderer({
        rotation: Rotation.WEST, zoomLevel: ZOOM,
        mapToScreen: capturingMapToScreen,
      });
      renderer.worldToScreenCentered(worldX, worldY, xsize, ysize);
      expect(capturedI).toBe(worldY);                // 20
      expect(capturedJ).toBe(worldX + xsize - 1);   // 12
    });
  });

  describe('texture-top Y formula', () => {
    it('returns southCornerScreenPos.y + tileHeight - scaledHeight for textured building', () => {
      const southScreenY = 400;
      const textureH = 200; // raw texture height
      // scaleFactor at zoom 3 = 1, so scaledHeight = 200

      const renderer = createTestRenderer({
        rotation: Rotation.NORTH, zoomLevel: ZOOM,
        mapToScreen: () => ({ x: 500, y: southScreenY }),
        building: makeBuilding({ x: 10, y: 20, visualClass: 'big' }),
        textureHeight: textureH,
      });

      const result = renderer.worldToScreenCentered(10, 20, 4, 4);
      // textureTopY = 400 + 32 - 200 = 232
      expect(result.y).toBe(southScreenY + TILE_H - textureH);
      expect(result.y).toBe(232);
    });

    it('uses fallback height (80 * scaleFactor) when no texture loaded', () => {
      const southScreenY = 300;
      const renderer = createTestRenderer({
        rotation: Rotation.NORTH, zoomLevel: ZOOM,
        mapToScreen: () => ({ x: 500, y: southScreenY }),
        // no building, so no texture lookup
      });

      const result = renderer.worldToScreenCentered(10, 20, 1, 1);
      // fallback scaledHeight = 80 * 1 = 80
      // textureTopY = 300 + 32 - 80 = 252
      expect(result.y).toBe(southScreenY + TILE_H - 80);
      expect(result.y).toBe(252);
    });

    it('scales texture height with zoom level', () => {
      const zoom2 = 2; // tileWidth = 32, scaleFactor = 32/64 = 0.5
      const southScreenY = 300;
      const textureH = 200;

      const renderer = createTestRenderer({
        rotation: Rotation.NORTH, zoomLevel: zoom2,
        mapToScreen: () => ({ x: 500, y: southScreenY }),
        building: makeBuilding({ x: 10, y: 20, visualClass: 'big' }),
        textureHeight: textureH,
      });

      const tileH2 = ZOOM_LEVELS[zoom2].tileHeight; // 16
      const scaledH = textureH * 0.5; // 100
      const result = renderer.worldToScreenCentered(10, 20, 4, 4);
      expect(result.y).toBe(southScreenY + tileH2 - scaledH);
      expect(result.textureHeight).toBe(scaledH);
    });
  });

  describe('horizontal center', () => {
    it('returns southCornerScreenPos.x as horizontal center', () => {
      const renderer = createTestRenderer({
        rotation: Rotation.NORTH, zoomLevel: ZOOM,
        mapToScreen: () => ({ x: 750, y: 400 }),
      });

      const result = renderer.worldToScreenCentered(10, 20, 2, 2);
      expect(result.x).toBe(750);
    });
  });

  describe('water platform shift', () => {
    it('subtracts PLATFORM_SHIFT * scaleFactor when on water platform', () => {
      const southScreenY = 400;
      const textureH = 120;

      const renderer = createTestRenderer({
        rotation: Rotation.NORTH, zoomLevel: ZOOM,
        mapToScreen: () => ({ x: 500, y: southScreenY }),
        building: makeBuilding({ x: 10, y: 20, visualClass: 'big' }),
        textureHeight: textureH,
        isOnWaterPlatform: true,
      });

      const result = renderer.worldToScreenCentered(10, 20, 4, 4);
      const baseY = southScreenY + TILE_H - textureH; // 400 + 32 - 120 = 312
      const shift = Math.round(PLATFORM_SHIFT * 1); // 12 * 1 = 12
      expect(result.y).toBe(baseY - shift);
      expect(result.y).toBe(300);
    });

    it('does not shift when not on water platform', () => {
      const southScreenY = 400;
      const textureH = 120;

      const renderer = createTestRenderer({
        rotation: Rotation.NORTH, zoomLevel: ZOOM,
        mapToScreen: () => ({ x: 500, y: southScreenY }),
        building: makeBuilding({ x: 10, y: 20, visualClass: 'big' }),
        textureHeight: textureH,
        isOnWaterPlatform: false,
      });

      const result = renderer.worldToScreenCentered(10, 20, 4, 4);
      expect(result.y).toBe(southScreenY + TILE_H - textureH); // 312
    });
  });

  describe('1x1 vs large building consistency', () => {
    it('both sizes produce textureTopY relative to their own south corner', () => {
      // 1x1 building
      const renderer1x1 = createTestRenderer({
        rotation: Rotation.NORTH, zoomLevel: ZOOM,
        mapToScreen: (i, j) => ({ x: (j - i) * 32, y: (j + i) * 16 }),
        building: makeBuilding({ x: 50, y: 50, visualClass: 'small' }),
        textureHeight: 60,
      });

      // 4x4 building at same world position
      const renderer4x4 = createTestRenderer({
        rotation: Rotation.NORTH, zoomLevel: ZOOM,
        mapToScreen: (i, j) => ({ x: (j - i) * 32, y: (j + i) * 16 }),
        building: makeBuilding({ x: 50, y: 50, visualClass: 'big' }),
        textureHeight: 300,
      });

      const result1 = renderer1x1.worldToScreenCentered(50, 50, 1, 1);
      const result4 = renderer4x4.worldToScreenCentered(50, 50, 4, 4);

      // Both should use the SAME south corner for NORTH rotation: (worldY=50, worldX=50)
      // So both have the same southCornerScreenPos
      const expectedSouthScreenY = (50 + 50) * 16; // 1600
      expect(result1.y).toBe(expectedSouthScreenY + TILE_H - 60);   // 1572
      expect(result4.y).toBe(expectedSouthScreenY + TILE_H - 300);  // 1332

      // The large building's texture top is much higher on screen (lower Y value)
      expect(result4.y).toBeLessThan(result1.y);
    });
  });

  describe('recorded position from drawBuildings', () => {
    it('returns recorded position when available', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const renderer = createTestRenderer({ rotation: Rotation.NORTH, zoomLevel: ZOOM }) as any;

      // Simulate drawBuildings recording the position
      renderer.selectedBuildingDrawnTop = { x: 333, y: 111, textureHeight: 200 };

      const result = renderer.worldToScreenCentered(10, 20, 4, 4);
      expect(result.x).toBe(333);
      expect(result.y).toBe(111);
      expect(result.textureHeight).toBe(200);
    });

    it('falls back to computed position when no recording exists', () => {
      const southScreenY = 400;
      const renderer = createTestRenderer({
        rotation: Rotation.NORTH, zoomLevel: ZOOM,
        mapToScreen: () => ({ x: 500, y: southScreenY }),
        building: makeBuilding({ x: 10, y: 20, visualClass: 'big' }),
        textureHeight: 150,
      });
      // selectedBuildingDrawnTop is null by default

      const result = renderer.worldToScreenCentered(10, 20, 4, 4);
      expect(result.y).toBe(southScreenY + TILE_H - 150); // 282
      expect(result.x).toBe(500);
    });

    it('recorded position takes priority over computed', () => {
      const renderer = createTestRenderer({
        rotation: Rotation.NORTH, zoomLevel: ZOOM,
        mapToScreen: () => ({ x: 500, y: 400 }),
        building: makeBuilding({ x: 10, y: 20, visualClass: 'big' }),
        textureHeight: 150,
      });

      // Set recorded position (different from what computation would give)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (renderer as any).selectedBuildingDrawnTop = { x: 999, y: 888, textureHeight: 777 };

      const result = renderer.worldToScreenCentered(10, 20, 4, 4);
      // Should return recorded, not computed
      expect(result.x).toBe(999);
      expect(result.y).toBe(888);
      expect(result.textureHeight).toBe(777);
    });
  });
});
