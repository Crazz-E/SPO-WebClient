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
  imageSmoothingEnabled: boolean;
}

interface MockContext {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  imageSmoothingEnabled: boolean;
  fillRect: jest.Mock;
  strokeRect: jest.Mock;
  beginPath: jest.Mock;
  closePath: jest.Mock;
  moveTo: jest.Mock;
  lineTo: jest.Mock;
  stroke: jest.Mock;
  fill: jest.Mock;
  arc: jest.Mock;
  fillText: jest.Mock;
  createLinearGradient: jest.Mock;
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
    imageSmoothingEnabled: true,
  };
  allElements.push(el);
  return el;
}

function createMockCtx(): MockContext {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    imageSmoothingEnabled: true,
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    beginPath: jest.fn(),
    closePath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    arc: jest.fn(),
    fillText: jest.fn(),
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    scale: jest.fn(),
    drawImage: jest.fn(),
    createImageData: jest.fn((w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    })),
    putImageData: jest.fn(),
  };
}

/** Build a small terrain pixel data array (100×100, all grass with some water). */
function createTerrainPixelData(width = 100, height = 100): { pixelData: Uint8Array; width: number; height: number } {
  const pixelData = new Uint8Array(width * height);
  // Fill with ZoneA (grass = landClass 0, bits 7-6 = 0x00)
  pixelData.fill(0x00);
  // Add some water (ZoneD = landClass 3, bits 7-6 = 0xC0) in the corners
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      pixelData[y * width + x] = 0xC0;
    }
  }
  return { pixelData, width, height };
}

function createMockRenderer(overrides: Partial<MinimapRendererAPI> = {}): MinimapRendererAPI {
  return {
    getCameraPosition: jest.fn(() => ({ x: 50, y: 50 })),
    centerOn: jest.fn(),
    getMapDimensions: jest.fn(() => ({ width: 100, height: 100 })),
    getMapName: jest.fn(() => 'Shamba'),
    getSeason: jest.fn(() => 2),
    getTerrainType: jest.fn(() => 'Alien Swamp'),
    getVisibleTileBounds: jest.fn(() => ({ minI: 20, maxI: 60, minJ: 25, maxJ: 65 })),
    getTerrainPixelData: jest.fn(() => createTerrainPixelData()),
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

  it('should query map name on render', () => {
    const renderer = createMockRenderer();
    const minimap = new MinimapUI();
    minimap.setRenderer(renderer);

    expect(renderer.getMapName).toHaveBeenCalled();

    minimap.destroy();
  });

  it('should not render when map name is empty', () => {
    const renderer = createMockRenderer({
      getMapName: jest.fn(() => ''),
    });
    const minimap = new MinimapUI();
    minimap.setRenderer(renderer);

    // render() should return early — no fillRect or drawImage
    expect(mockCtx.fillRect).not.toHaveBeenCalled();

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
  // Terrain colormap tests
  // ---------------------------------------------------------------------------

  describe('terrain colormap', () => {
    it('should build colormap from terrain pixel data', () => {
      const renderer = createMockRenderer();
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      // Should have called getTerrainPixelData to build colormap
      expect(renderer.getTerrainPixelData).toHaveBeenCalled();

      minimap.destroy();
    });

    it('should draw terrain with rotation transform', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      // render() should apply translate + rotate(45°) + scale
      expect(mockCtx.translate).toHaveBeenCalled();
      expect(mockCtx.rotate).toHaveBeenCalledWith(Math.PI / 4);
      expect(mockCtx.scale).toHaveBeenCalled();
      expect(mockCtx.drawImage).toHaveBeenCalled();

      minimap.destroy();
    });

    it('should handle null terrain data gracefully', () => {
      const renderer = createMockRenderer({
        getTerrainPixelData: jest.fn(() => null),
      });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      // Should still render (just dark background + border), no crash
      expect(minimap.isVisible()).toBe(true);
      // drawImage should NOT be called since there's no terrain data
      expect(mockCtx.drawImage).not.toHaveBeenCalled();

      minimap.destroy();
    });

    it('should create colormap with createImageData', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      // buildTerrainColormap uses createImageData + putImageData
      expect(mockCtx.createImageData).toHaveBeenCalled();
      expect(mockCtx.putImageData).toHaveBeenCalled();

      minimap.destroy();
    });
  });

  // ---------------------------------------------------------------------------
  // Click-to-navigate tests (with 45° rotation)
  // ---------------------------------------------------------------------------

  describe('click-to-navigate', () => {
    it('should call centerOn when clicking the minimap', () => {
      const renderer = createMockRenderer();
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      const container = allElements.find(el => el.id === 'minimap-container');
      expect(container).toBeDefined();

      // Click at center of 220px minimap → should map to center of 100x100 map
      container!.onmousedown!({ offsetX: 110, offsetY: 110, preventDefault: jest.fn(), stopPropagation: jest.fn() });
      expect(renderer.centerOn).toHaveBeenCalled();

      minimap.destroy();
    });

    it('should map center click to center of map', () => {
      const renderer = createMockRenderer();
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      const container = allElements.find(el => el.id === 'minimap-container');

      // Click at dead center (110, 110) of 220px minimap
      // After reverse transform: center pixel → center of terrain grid → (50, 50) tile
      container!.onmousedown!({ offsetX: 110, offsetY: 110, preventDefault: jest.fn(), stopPropagation: jest.fn() });

      const calls = (renderer.centerOn as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1] as number[];
      expect(lastCall[0]).toBe(50);  // x = j = center of 100 width
      expect(lastCall[1]).toBe(50);  // y = i = center of 100 height

      minimap.destroy();
    });

    it('should map top vertex click to tile (maxI, maxJ)', () => {
      const renderer = createMockRenderer();
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      const container = allElements.find(el => el.id === 'minimap-container');

      // Top vertex of 220px diamond = (110, 0)
      // After swap+flip, top of diamond = tile (maxI, maxJ) = (99, 99)
      container!.onmousedown!({ offsetX: 110, offsetY: 0, preventDefault: jest.fn(), stopPropagation: jest.fn() });

      const calls = (renderer.centerOn as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1] as number[];
      // Due to padding, the exact top vertex won't map to (99,99) precisely
      // but it should be in the high range
      expect(lastCall[0]).toBeGreaterThanOrEqual(90);
      expect(lastCall[1]).toBeGreaterThanOrEqual(90);

      minimap.destroy();
    });

    it('should not navigate when terrain data is null', () => {
      const renderer = createMockRenderer({
        getTerrainPixelData: jest.fn(() => null),
      });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      const container = allElements.find(el => el.id === 'minimap-container');
      container!.onmousedown!({ offsetX: 110, offsetY: 110, preventDefault: jest.fn(), stopPropagation: jest.fn() });

      // No terrain canvas → should not call centerOn
      expect(renderer.centerOn).not.toHaveBeenCalled();

      minimap.destroy();
    });
  });

  // ---------------------------------------------------------------------------
  // Screen-space overlay tests (border)
  // ---------------------------------------------------------------------------

  describe('screen-space overlays', () => {
    it('should draw diamond border using createLinearGradient', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      // drawDiamondBorder calls createLinearGradient for the border stroke
      expect(mockCtx.createLinearGradient).toHaveBeenCalled();

      minimap.destroy();
    });

    it('should not draw vertex handle dots (no arc calls)', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      // No vertex dots — resize affordance removed
      expect(mockCtx.arc).not.toHaveBeenCalled();

      minimap.destroy();
    });

    it('should have wrapper with exactly 1 child (container only)', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      expect(wrapper).toBeDefined();
      expect(wrapper!.children.length).toBe(1);
      expect(wrapper!.children[0].id).toBe('minimap-container');

      minimap.destroy();
    });
  });

  // ---------------------------------------------------------------------------
  // Viewport indicator tests
  // ---------------------------------------------------------------------------

  describe('viewport indicator', () => {
    it('should draw viewport rectangle via strokeRect', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      // drawViewportInGrid calls fillRect (fill) + strokeRect (outline)
      expect(mockCtx.strokeRect).toHaveBeenCalled();

      minimap.destroy();
    });

    it('should not draw viewport when map dimensions are zero', () => {
      const renderer = createMockRenderer({
        getMapDimensions: jest.fn(() => ({ width: 0, height: 0 })),
      });
      const minimap = new MinimapUI();
      minimap.setRenderer(renderer);

      // No strokeRect for viewport
      expect(mockCtx.strokeRect).not.toHaveBeenCalled();

      minimap.destroy();
    });

    it('should draw viewport in terrain grid space (inside save/restore)', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      // Verify save/restore pairs were called (terrain transform + border)
      expect(mockCtx.save.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(mockCtx.restore.mock.calls.length).toBeGreaterThanOrEqual(2);

      minimap.destroy();
    });
  });

  // ---------------------------------------------------------------------------
  // Diamond shape tests
  // ---------------------------------------------------------------------------

  describe('diamond shape', () => {
    it('should apply diamond clip-path to container', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      const container = allElements.find(el => el.id === 'minimap-container');
      expect(container).toBeDefined();
      expect(container!.style.cssText).toContain('clip-path');
      expect(container!.style.cssText).toContain('polygon');

      minimap.destroy();
    });

    it('should set wrapper width and height equal to medium preset=220', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      expect(wrapper).toBeDefined();
      // window.innerWidth=0 → isMobile()=false → default SIZE_MAP.medium=220
      expect(wrapper!.style.cssText).toContain('width: 220px');
      expect(wrapper!.style.cssText).toContain('height: 220px');

      minimap.destroy();
    });

    it('should use MOBILE_SIZE=140 with square wrapper when innerWidth is mobile', () => {
      const origWindow = (globalThis as Record<string, unknown>).window;
      (globalThis as Record<string, unknown>).window = { innerWidth: 375 };

      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      expect(wrapper).toBeDefined();
      // MOBILE_SIZE=140, wrapper is square
      expect(wrapper!.style.cssText).toContain('width: 140px');
      expect(wrapper!.style.cssText).toContain('height: 140px');

      minimap.destroy();
      (globalThis as Record<string, unknown>).window = origWindow;
    });
  });

  // ---------------------------------------------------------------------------
  // Preset size tests
  // ---------------------------------------------------------------------------

  describe('setSize', () => {
    it('should resize to small preset (160px)', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      minimap.setSize('small');

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      expect(wrapper!.style.width).toBe('160px');
      expect(wrapper!.style.height).toBe('160px');

      minimap.destroy();
    });

    it('should resize to large preset (320px)', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      minimap.setSize('large');

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      expect(wrapper!.style.width).toBe('320px');
      expect(wrapper!.style.height).toBe('320px');

      minimap.destroy();
    });

    it('should ignore setSize on mobile', () => {
      const origWindow = (globalThis as Record<string, unknown>).window;
      (globalThis as Record<string, unknown>).window = { innerWidth: 375 };

      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      minimap.setSize('large');

      const wrapper = allElements.find(el => el.id === 'minimap-wrapper');
      // Should remain at MOBILE_SIZE=140, not large=320
      expect(wrapper!.style.cssText).toContain('width: 140px');

      minimap.destroy();
      (globalThis as Record<string, unknown>).window = origWindow;
    });

    it('should update canvas dimensions on setSize', () => {
      const minimap = new MinimapUI();
      minimap.setRenderer(createMockRenderer());

      minimap.setSize('small');

      // Find the canvas element (3rd created element: body, wrapper, container, canvas)
      const canvas = allElements.find(el => el.getContext.mock?.calls?.length > 0);
      expect(canvas).toBeDefined();
      expect(canvas!.width).toBe(160);
      expect(canvas!.height).toBe(160);

      minimap.destroy();
    });
  });
});
