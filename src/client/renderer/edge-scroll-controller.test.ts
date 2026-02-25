/**
 * Tests for EdgeScrollController
 * Node test environment — no jsdom. Uses mocked requestAnimationFrame/performance.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { EdgeScrollCallbacks } from './edge-scroll-controller';

// ---------------------------------------------------------------------------
// RAF / performance mock
// ---------------------------------------------------------------------------
let rafCallback: (() => void) | null = null;
let rafId = 0;
let mockTime = 0;

beforeEach(() => {
  jest.clearAllMocks();
  rafCallback = null;
  rafId = 0;
  mockTime = 0;

  (globalThis as Record<string, unknown>).requestAnimationFrame = jest.fn((cb: () => void) => {
    rafCallback = cb;
    return ++rafId;
  });
  (globalThis as Record<string, unknown>).cancelAnimationFrame = jest.fn();
  (globalThis as Record<string, unknown>).performance = { now: jest.fn(() => mockTime) };
});

function advanceFrame(dtMs: number): void {
  mockTime += dtMs;
  if (rafCallback) {
    const cb = rafCallback;
    rafCallback = null;
    cb();
  }
}

const { EdgeScrollController } = require('./edge-scroll-controller') as typeof import('./edge-scroll-controller');

function createCallbacks(): EdgeScrollCallbacks & { onPan: jest.Mock; onScrollStart: jest.Mock; onScrollStop: jest.Mock } {
  return {
    onPan: jest.fn(),
    onScrollStart: jest.fn(),
    onScrollStop: jest.fn(),
  };
}

describe('EdgeScrollController', () => {
  const W = 800;
  const H = 600;

  it('should not scroll when mouse is in center', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(400, 300, W, H);
    expect(cb.onScrollStart).not.toHaveBeenCalled();
    expect(cb.onPan).not.toHaveBeenCalled();
  });

  it('should start scrolling when mouse is at left edge', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(5, 300, W, H);
    expect(cb.onScrollStart).toHaveBeenCalledTimes(1);
    expect(ctrl.isScrolling()).toBe(true);
  });

  it('should start scrolling when mouse is at right edge', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(795, 300, W, H);
    expect(cb.onScrollStart).toHaveBeenCalledTimes(1);
  });

  it('should start scrolling when mouse is at top edge', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(400, 5, W, H);
    expect(cb.onScrollStart).toHaveBeenCalledTimes(1);
  });

  it('should start scrolling when mouse is at bottom edge', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(400, 595, W, H);
    expect(cb.onScrollStart).toHaveBeenCalledTimes(1);
  });

  it('should produce negative dx when at left edge', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(0, 300, W, H);
    // First tick fires at same time as start (dt=0), advance to get a real delta
    advanceFrame(0); // first tick (dt=0, produces 0)
    advanceFrame(16); // second tick (dt=16ms, produces real delta)
    const lastCall = cb.onPan.mock.calls[cb.onPan.mock.calls.length - 1] as [number, number];
    expect(lastCall[0]).toBeLessThan(0);
  });

  it('should produce positive dx when at right edge', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(800, 300, W, H);
    advanceFrame(0);
    advanceFrame(16);
    const lastCall = cb.onPan.mock.calls[cb.onPan.mock.calls.length - 1] as [number, number];
    expect(lastCall[0]).toBeGreaterThan(0);
  });

  it('should produce negative dy when at top edge', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(400, 0, W, H);
    advanceFrame(0);
    advanceFrame(16);
    const lastCall = cb.onPan.mock.calls[cb.onPan.mock.calls.length - 1] as [number, number];
    expect(lastCall[1]).toBeLessThan(0);
  });

  it('should produce positive dy when at bottom edge', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(400, 600, W, H);
    advanceFrame(0);
    advanceFrame(16);
    const lastCall = cb.onPan.mock.calls[cb.onPan.mock.calls.length - 1] as [number, number];
    expect(lastCall[1]).toBeGreaterThan(0);
  });

  it('should produce both dx and dy when in a corner', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(0, 0, W, H); // top-left corner
    advanceFrame(0);
    advanceFrame(16);
    const lastCall = cb.onPan.mock.calls[cb.onPan.mock.calls.length - 1] as [number, number];
    expect(lastCall[0]).toBeLessThan(0);
    expect(lastCall[1]).toBeLessThan(0);
  });

  it('should stop scrolling when mouse moves to center', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(0, 300, W, H);
    expect(ctrl.isScrolling()).toBe(true);

    ctrl.updateMousePosition(400, 300, W, H);
    expect(ctrl.isScrolling()).toBe(false);
    expect(cb.onScrollStop).toHaveBeenCalledTimes(1);
  });

  it('should fire onScrollStart only once while scrolling continues', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(5, 300, W, H);
    ctrl.updateMousePosition(10, 300, W, H);
    ctrl.updateMousePosition(3, 300, W, H);
    expect(cb.onScrollStart).toHaveBeenCalledTimes(1);
  });

  it('should stop via stop() and fire onScrollStop', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(0, 300, W, H);
    ctrl.stop();
    expect(ctrl.isScrolling()).toBe(false);
    expect(cb.onScrollStop).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('should not fire onScrollStop when stop() called while not scrolling', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.stop();
    expect(cb.onScrollStop).not.toHaveBeenCalled();
  });

  it('should scale onPan with elapsed time (frame-rate independence)', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(0, 300, W, H);

    advanceFrame(0);  // first tick (dt=0)
    advanceFrame(16); // 16ms frame
    // Find the first call with non-zero dx
    const call16 = cb.onPan.mock.calls[cb.onPan.mock.calls.length - 1] as [number, number];
    const dx16 = call16[0];

    advanceFrame(32); // 32ms frame
    const call32 = cb.onPan.mock.calls[cb.onPan.mock.calls.length - 1] as [number, number];
    const dx32 = call32[0];

    // 32ms frame should produce roughly 2x the delta of 16ms frame
    expect(Math.abs(dx32)).toBeCloseTo(Math.abs(dx16) * 2, 1);
  });

  it('should not scroll when disabled', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.setEnabled(false);
    ctrl.updateMousePosition(0, 300, W, H);
    expect(cb.onScrollStart).not.toHaveBeenCalled();
    expect(ctrl.isScrolling()).toBe(false);
  });

  it('should stop scrolling when disabled while active', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(0, 300, W, H);
    expect(ctrl.isScrolling()).toBe(true);

    ctrl.setEnabled(false);
    expect(ctrl.isScrolling()).toBe(false);
    expect(cb.onScrollStop).toHaveBeenCalledTimes(1);
  });

  it('should accept custom config', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb, { edgeSize: 50 });
    // At x=40 (within 50px edge), should trigger
    ctrl.updateMousePosition(40, 300, W, H);
    expect(ctrl.isScrolling()).toBe(true);
  });

  it('should not scroll with zero-size canvas', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(0, 0, 0, 0);
    expect(cb.onScrollStart).not.toHaveBeenCalled();
  });

  it('should clean up on destroy', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    ctrl.updateMousePosition(0, 300, W, H);
    ctrl.destroy();
    expect(ctrl.isScrolling()).toBe(false);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('should report enabled state', () => {
    const cb = createCallbacks();
    const ctrl = new EdgeScrollController(cb);
    expect(ctrl.isEnabled()).toBe(true);
    ctrl.setEnabled(false);
    expect(ctrl.isEnabled()).toBe(false);
  });
});
