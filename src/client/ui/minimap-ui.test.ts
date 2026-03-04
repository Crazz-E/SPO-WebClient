/**
 * Tests for MinimapUI — canvas minimap component.
 *
 * Environment: node (no jsdom) — DOM elements mocked as plain objects.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { MinimapRendererAPI } from './minimap-ui';

// ---------------------------------------------------------------------------
// DOM mock infrastructure
// ---------------------------------------------------------------------------

interface MockElement {
  id: string;
  style: Record<string, string>;
  width: number;
  height: number;
  children: MockElement[];
  parentElement: MockElement | null;
  appendChild: jest.Mock;
  removeChild: jest.Mock;
  addEventListener: jest.Mock;
  onmousedown: ((e: unknown) => void) | null;
  getContext: jest.Mock;
}

interface MockContext {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  fillRect: jest.Mock;
  strokeRect: jest.Mock;
  beginPath: jest.Mock;
  moveTo: jest.Mock;
  lineTo: jest.Mock;
  stroke: jest.Mock;
  save: jest.Mock;
  restore: jest.Mock;
  translate: jest.Mock;
  rotate: jest.Mock;
  scale: jest.Mock;
  drawImage: jest.Mock;
  createImageData: jest.Mock;
  putImageData: jest.Mock;
}

let allElements: MockElement[];
let mockCtx: MockContext;

function createMockElement(): MockElement {
  const el: MockElement = {
    id: '',
    style: {},
    width: 0,
    height: 0,
    children: [],
    parentElement: null,
    appendChild: jest.fn(function (this: MockElement, child: MockElement) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    }),
    removeChild: jest.fn(function (this: MockElement, child: MockElement) {
      this.children = this.children.filter(c => c !== child);
      child.parentElement = null;
      return child;
    }),
    addEventListener: jest.fn(),
    onmousedown: null,
    getContext: jest.fn(() => mockCtx),
  };
  allElements.push(el);
  return el;
}

function createMockCtx(): MockContext {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    scale: jest.fn(),
    drawImage: jest.fn(),
    createImageData: jest.fn(() => ({
      data: new Uint8ClampedArray(200 * 200 * 4),
    })),
    putImageData: jest.fn(),
  };
}

function createMockRenderer(overrides: Partial<MinimapRendererAPI> = {}): MinimapRendererAPI {
  return {
    getCameraPosition: jest.fn(() => ({ x: 50, y: 50 })),
    centerOn: jest.fn(),
    getAllBuildings: jest.fn(() => [
      { visualClass: '1', tycoonId: 1, options: 0, x: 10, y: 20, level: 0, alert: false, attack: 0 },
      { visualClass: '2', tycoonId: 1, options: 1, x: 30, y: 40, level: 0, alert: true, attack: 0 },
    ]),
    getAllSegments: jest.fn(() => [
      { x1: 10, y1: 20, x2: 12, y2: 20, unknown1: 0, unknown2: 0, unknown3: 0, unknown4: 0, unknown5: 0, unknown6: 0 },
    ]),
    getMapDimensions: jest.fn(() => ({ width: 100, height: 100 })),
    getVisibleTileBounds: jest.fn(() => ({ minI: 20, maxI: 40, minJ: 30, maxJ: 60 })),
    getZoom: jest.fn(() => 2),
    getRotation: jest.fn(() => 0),
    getTerrainPixelData: jest.fn(() => null),
    ...overrides,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  allElements = [];
  mockCtx = createMockCtx();

  const bodyEl = createMockElement();

  (globalThis as Record<string, unknown>).document = {
    createElement: jest.fn(() => createMockElement()),
    body: bodyEl,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const { MinimapUI } = require('./minimap-ui') as typeof import('./minimap-ui');

describe('MinimapUI', () => {
  it('should start hidden', () => {
    const minimap = new MinimapUI();
    expect(minimap.isVisible()).toBe(false);
  });

  it('should auto-show when setRenderer is called', () => {
    const minimap = new MinimapUI();
    minimap.setRenderer(createMockRenderer());

    // setRenderer() auto-calls show()
    expect(minimap.isVisible()).toBe(true);

    minimap.destroy();
  });

  it('should show/hide via toggle', () => {
    const minimap = new MinimapUI();
    minimap.setRenderer(createMockRenderer());

    // Already visible from setRenderer()
    expect(minimap.isVisible()).toBe(true);

    minimap.toggle();
    expect(minimap.isVisible()).toBe(false);

    minimap.toggle();
    expect(minimap.isVisible()).toBe(true);

    minimap.destroy();
  });

  it('should create canvas on setRenderer (auto-show)', () => {
    const minimap = new MinimapUI();
    minimap.setRenderer(createMockRenderer());

    // Should have created container + canvas
    const container = allElements.find(el => el.id === 'minimap-container');
    expect(container).toBeDefined();

    minimap.destroy();
  });

  it('should render buildings and roads when visible', () => {
    const renderer = createMockRenderer();
    const minimap = new MinimapUI();
    minimap.setRenderer(renderer);

    // Initial render is called on setRenderer() → show()
    expect(renderer.getAllBuildings).toHaveBeenCalled();
    expect(renderer.getAllSegments).toHaveBeenCalled();
    expect(renderer.getMapDimensions).toHaveBeenCalled();
    expect(renderer.getVisibleTileBounds).toHaveBeenCalled();

    minimap.destroy();
  });

  it('should call centerOn when clicking the minimap', () => {
    const renderer = createMockRenderer();
    const minimap = new MinimapUI();
    minimap.setRenderer(renderer);

    // Find the canvas (element with onmousedown and width=200)
    const canvas = allElements.find(el => el.onmousedown !== null && el.width === 200);
    expect(canvas).toBeDefined();

    // Simulate click at center (100, 100) of 200x200 canvas on a 100x100 map
    canvas!.onmousedown!({ offsetX: 100, offsetY: 100, preventDefault: jest.fn(), stopPropagation: jest.fn() });
    expect(renderer.centerOn).toHaveBeenCalledWith(50, 50);

    minimap.destroy();
  });

  it('should not render with zero map dimensions', () => {
    const renderer = createMockRenderer({
      getMapDimensions: jest.fn(() => ({ width: 0, height: 0 })),
    });
    const minimap = new MinimapUI();
    minimap.setRenderer(renderer);

    // fillRect should only be called if dimensions are non-zero (for background clear)
    // With zero dimensions, render() returns early before drawing
    expect(mockCtx.beginPath).not.toHaveBeenCalled();

    minimap.destroy();
  });

  it('should clean up on destroy', () => {
    const minimap = new MinimapUI();
    minimap.setRenderer(createMockRenderer());

    expect(minimap.isVisible()).toBe(true);

    minimap.destroy();
    // After destroy, container should be removed
    expect(minimap.isVisible()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Rotation sync tests
  // ---------------------------------------------------------------------------

  describe('rotation sync', () => {
    it('should apply base -45° rotation for NORTH (rotation=0)', () => {
      const renderer = createMockRenderer({ getRotation: jest.fn(() => 0) });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.rotate).toHaveBeenCalledWith(-Math.PI / 4);
      expect(mockCtx.scale).toHaveBeenCalledWith(Math.SQRT1_2, Math.SQRT1_2);
      expect(mockCtx.restore).toHaveBeenCalled();

      minimap.destroy();
    });

    it('should apply base + 90° rotation for EAST (rotation=1)', () => {
      const renderer = createMockRenderer({ getRotation: jest.fn(() => 1) });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      expect(mockCtx.rotate).toHaveBeenCalledWith(Math.PI / 4);
      expect(mockCtx.scale).toHaveBeenCalledWith(Math.SQRT1_2, Math.SQRT1_2);

      minimap.destroy();
    });

    it('should apply base + 180° rotation for SOUTH (rotation=2)', () => {
      const renderer = createMockRenderer({ getRotation: jest.fn(() => 2) });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      expect(mockCtx.rotate).toHaveBeenCalledWith(3 * Math.PI / 4);
      expect(mockCtx.scale).toHaveBeenCalledWith(Math.SQRT1_2, Math.SQRT1_2);

      minimap.destroy();
    });

    it('should apply base + 270° rotation for WEST (rotation=3)', () => {
      const renderer = createMockRenderer({ getRotation: jest.fn(() => 3) });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      expect(mockCtx.rotate).toHaveBeenCalledWith(5 * Math.PI / 4);
      expect(mockCtx.scale).toHaveBeenCalledWith(Math.SQRT1_2, Math.SQRT1_2);

      minimap.destroy();
    });

    it('should translate around canvas center with rotate and scale', () => {
      const renderer = createMockRenderer({ getRotation: jest.fn(() => 1) });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      // Canvas is 200x200, center = (100, 100)
      const translateCalls = mockCtx.translate.mock.calls;
      // First translate: to center
      expect(translateCalls[0]).toEqual([100, 100]);
      // Second translate: back from center (after rotate + scale)
      expect(translateCalls[1]).toEqual([-100, -100]);

      minimap.destroy();
    });

    it('should inverse-transform click for SOUTH rotation', () => {
      const renderer = createMockRenderer({ getRotation: jest.fn(() => 2) });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      const canvas = allElements.find(el => el.onmousedown !== null && el.width === 200);
      expect(canvas).toBeDefined();

      // Click at (150, 150) with SOUTH rotation (totalAngle = -PI/4 + PI = 3PI/4)
      // dx=50, dy=50, invAngle=-3PI/4
      // cos(-3PI/4) ≈ -0.7071, sin(-3PI/4) ≈ -0.7071
      // rdx = 50*(-0.7071) - 50*(-0.7071) = 0
      // rdy = 50*(-0.7071) + 50*(-0.7071) = -70.71
      // rx = 100 + 0/0.7071 = 100, ry = 100 + (-70.71)/0.7071 = 0
      // mapX = round(100/200*100)=50, mapY = max(0, round(0/200*100))=0
      canvas!.onmousedown!({ offsetX: 150, offsetY: 150, preventDefault: jest.fn(), stopPropagation: jest.fn() });
      expect(renderer.centerOn).toHaveBeenCalledWith(50, 0);

      minimap.destroy();
    });

    it('should inverse-transform click for EAST rotation', () => {
      const renderer = createMockRenderer({ getRotation: jest.fn(() => 1) });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      const canvas = allElements.find(el => el.onmousedown !== null && el.width === 200);
      expect(canvas).toBeDefined();

      // Click at top-center (100, 0) with EAST rotation (totalAngle = -PI/4 + PI/2 = PI/4)
      // dx=0, dy=-100, invAngle=-PI/4
      // cos(-PI/4) ≈ 0.7071, sin(-PI/4) ≈ -0.7071
      // rdx = 0*(0.7071) - (-100)*(-0.7071) = -70.71
      // rdy = 0*(-0.7071) + (-100)*(0.7071) = -70.71
      // rx = 100 + (-70.71)/0.7071 = 0, ry = 100 + (-70.71)/0.7071 = 0
      // mapX = max(0, 0) = 0, mapY = max(0, 0) = 0
      canvas!.onmousedown!({ offsetX: 100, offsetY: 0, preventDefault: jest.fn(), stopPropagation: jest.fn() });
      expect(renderer.centerOn).toHaveBeenCalledWith(0, 0);

      minimap.destroy();
    });

    it('should inverse-transform center click for NORTH rotation', () => {
      const renderer = createMockRenderer({ getRotation: jest.fn(() => 0) });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      const canvas = allElements.find(el => el.onmousedown !== null && el.width === 200);
      // Center click is invariant under rotation+scale: (100,100) → (50, 50)
      canvas!.onmousedown!({ offsetX: 100, offsetY: 100, preventDefault: jest.fn(), stopPropagation: jest.fn() });
      expect(renderer.centerOn).toHaveBeenCalledWith(50, 50);

      minimap.destroy();
    });
  });

  // ---------------------------------------------------------------------------
  // Terrain background tests
  // ---------------------------------------------------------------------------

  describe('terrain background', () => {
    function createTerrainData(width: number, height: number): { pixelData: Uint8Array; width: number; height: number } {
      // Fill with mixed land classes: first half water (0xC0), second half grass (0x00)
      const data = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          data[y * width + x] = y < height / 2 ? 0x00 : 0xC0; // Grass then Water
        }
      }
      return { pixelData: data, width, height };
    }

    it('should not draw terrain background when getTerrainPixelData returns null', () => {
      const renderer = createMockRenderer({ getTerrainPixelData: jest.fn(() => null) });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      // drawImage should not be called (no terrain background)
      expect(mockCtx.drawImage).not.toHaveBeenCalled();

      minimap.destroy();
    });

    it('should draw terrain background when pixel data is available', () => {
      const terrain = createTerrainData(100, 100);
      const renderer = createMockRenderer({
        getTerrainPixelData: jest.fn(() => terrain),
      });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      // drawImage should be called for the terrain background canvas
      expect(mockCtx.drawImage).toHaveBeenCalled();

      minimap.destroy();
    });

    it('should cache terrain canvas across renders', () => {
      const terrain = createTerrainData(100, 100);
      const renderer = createMockRenderer({
        getTerrainPixelData: jest.fn(() => terrain),
      });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      const createElementMock = (document as unknown as { createElement: jest.Mock }).createElement;
      const callCountAfterFirst = createElementMock.mock.calls.length;

      // Trigger another render via timer
      jest.advanceTimersByTime(500);

      // No additional createElement for terrain canvas (cached)
      // The total calls should not increase by a new terrain canvas creation
      const callCountAfterSecond = createElementMock.mock.calls.length;
      expect(callCountAfterSecond).toBe(callCountAfterFirst);

      minimap.destroy();
    });

    it('should rebuild terrain canvas when map dimensions change', () => {
      const terrain1 = createTerrainData(100, 100);
      const terrain2 = createTerrainData(200, 200);
      let currentTerrain = terrain1;

      const renderer = createMockRenderer({
        getTerrainPixelData: jest.fn(() => currentTerrain),
        getMapDimensions: jest.fn(() => ({
          width: currentTerrain.width,
          height: currentTerrain.height,
        })),
      });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      const createElementMock = (document as unknown as { createElement: jest.Mock }).createElement;
      const callsAfterFirst = createElementMock.mock.calls.length;

      // Switch to different terrain
      currentTerrain = terrain2;
      jest.advanceTimersByTime(500);

      // Should have created a new terrain canvas element
      const callsAfterSecond = createElementMock.mock.calls.length;
      expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);

      minimap.destroy();
    });

    it('should generate correct colors for land classes', () => {
      // Create a 4x1 terrain: one tile of each land class
      const data = new Uint8Array(4);
      data[0] = 0x00; // ZoneA (Grass)     — bits 7-6 = 00
      data[1] = 0x40; // ZoneB (MidGrass)  — bits 7-6 = 01
      data[2] = 0x80; // ZoneC (DryGround) — bits 7-6 = 10
      data[3] = 0xC0; // ZoneD (Water)     — bits 7-6 = 11

      const renderer = createMockRenderer({
        getTerrainPixelData: jest.fn(() => ({ pixelData: data, width: 4, height: 1 })),
        getMapDimensions: jest.fn(() => ({ width: 4, height: 1 })),
      });

      // The terrain canvas is built internally — we verify it calls createImageData and putImageData
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      expect(mockCtx.createImageData).toHaveBeenCalled();
      expect(mockCtx.putImageData).toHaveBeenCalled();

      minimap.destroy();
    });
  });
});
