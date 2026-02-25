/**
 * Tests for MinimapUI — Phase 2.1 minimap component
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
}

let allElements: MockElement[];
let mockCtx: MockContext;
let keydownHandlers: ((e: unknown) => void)[];

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
    ...overrides,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  allElements = [];
  mockCtx = createMockCtx();
  keydownHandlers = [];

  const bodyEl = createMockElement();

  (globalThis as Record<string, unknown>).document = {
    createElement: jest.fn(() => createMockElement()),
    body: bodyEl,
    addEventListener: jest.fn((_event: string, handler: (e: unknown) => void) => {
      keydownHandlers.push(handler);
    }),
    removeEventListener: jest.fn((_event: string, handler: (e: unknown) => void) => {
      keydownHandlers = keydownHandlers.filter(h => h !== handler);
    }),
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

  it('should show/hide via toggle', () => {
    const minimap = new MinimapUI();
    minimap.setRenderer(createMockRenderer());

    minimap.toggle();
    expect(minimap.isVisible()).toBe(true);

    minimap.toggle();
    expect(minimap.isVisible()).toBe(false);
  });

  it('should create canvas on show', () => {
    const minimap = new MinimapUI();
    minimap.setRenderer(createMockRenderer());

    minimap.show();

    // Should have created container + canvas
    const container = allElements.find(el => el.id === 'minimap-container');
    expect(container).toBeDefined();
  });

  it('should render buildings and roads when visible', () => {
    const renderer = createMockRenderer();
    const minimap = new MinimapUI();
    minimap.setRenderer(renderer);

    minimap.show();

    // Initial render is called on show()
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

    minimap.show();

    // Find the canvas (second element — first is container)
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

    minimap.show();

    // fillRect should only be called if dimensions are non-zero (for background clear)
    // With zero dimensions, render() returns early before drawing
    expect(mockCtx.beginPath).not.toHaveBeenCalled();

    minimap.destroy();
  });

  it('should toggle via M key press', () => {
    const minimap = new MinimapUI();
    minimap.setRenderer(createMockRenderer());

    expect(minimap.isVisible()).toBe(false);

    // Simulate pressing 'M'
    for (const handler of keydownHandlers) {
      handler({ key: 'm', target: { tagName: 'DIV' } });
    }
    expect(minimap.isVisible()).toBe(true);

    // Press 'M' again to hide
    for (const handler of keydownHandlers) {
      handler({ key: 'M', target: { tagName: 'DIV' } });
    }
    expect(minimap.isVisible()).toBe(false);

    minimap.destroy();
  });

  it('should not toggle when typing in input field', () => {
    const minimap = new MinimapUI();
    minimap.setRenderer(createMockRenderer());

    for (const handler of keydownHandlers) {
      handler({ key: 'm', target: { tagName: 'INPUT' } });
    }
    expect(minimap.isVisible()).toBe(false);

    minimap.destroy();
  });

  it('should clean up on destroy', () => {
    const minimap = new MinimapUI();
    minimap.setRenderer(createMockRenderer());

    minimap.show();
    expect(minimap.isVisible()).toBe(true);

    minimap.destroy();
    // After destroy, container should be removed
    expect(minimap.isVisible()).toBe(false);
  });
});
