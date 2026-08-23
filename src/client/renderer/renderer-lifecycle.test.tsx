/**
 * Lifecycle test of IsometricMapRenderer against a real DOM (jsdom): the class
 * is CONSTRUCTED for real — heavy collaborators are jest-mocked — so the
 * document/window listeners of the N6 arrow-key pan are wired and torn down by
 * the actual setup/destroy code, not a crafted `this`.
 *
 * The fine-grained input arbitration (thresholds, click-on-release) is covered
 * in renderer-input.test.ts; this file covers construction, listener wiring,
 * the rAF pan loop, and destroy().
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('./isometric-terrain-renderer');
jest.mock('./game-object-texture-cache');
jest.mock('./vegetation-flat-mapper');
jest.mock('./touch-handler-2d');
jest.mock('./road-texture-system');
jest.mock('./concrete-texture-system');
jest.mock('./car-class-system');
jest.mock('./vehicle-animation-system');

import { IsometricMapRenderer } from './isometric-map-renderer';

type AnyRecord = Record<string, unknown>;

function mockCtx(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    strokeStyle: '',
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    closePath: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    fillText: jest.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('IsometricMapRenderer lifecycle (N6 arrow-key pan wiring)', () => {
  let rafSpy: jest.Mock<(cb: FrameRequestCallback) => number>;
  let rafCallbacks: FrameRequestCallback[];
  let renderer: IsometricMapRenderer;

  beforeEach(() => {
    document.body.innerHTML = '<canvas id="game-map"></canvas>';
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(mockCtx() as unknown as ReturnType<HTMLCanvasElement['getContext']>);
    rafCallbacks = [];
    rafSpy = jest.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    (globalThis as AnyRecord).requestAnimationFrame = rafSpy;
    renderer = new IsometricMapRenderer('game-map');
    // The auto-mocked terrain renderer returns undefined everywhere — the pan
    // math needs a real zoom level to look up ZOOM_LEVELS
    ((renderer as unknown as AnyRecord).terrainRenderer as AnyRecord).getZoomLevel =
      jest.fn(() => 2);
    // Driving rAF callbacks by hand also fires coalesced requestRender() frames;
    // the full draw pipeline needs OffscreenCanvas, which jsdom lacks — stub it out
    (renderer as unknown as AnyRecord).render = jest.fn();
    rafSpy.mockClear();
    rafCallbacks.length = 0;
  });

  afterEach(() => {
    renderer.destroy();
    jest.restoreAllMocks();
  });

  const internals = () => renderer as unknown as AnyRecord;
  const terrainPan = () =>
    (internals().terrainRenderer as AnyRecord).pan as jest.Mock;
  const key = (type: 'keydown' | 'keyup', k: string) =>
    document.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));

  it('constructs against a real canvas and wires its listeners', () => {
    expect(internals().canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(internals().leftButtonDown).toBe(false);
    expect(internals().heldPanKeys).toBeInstanceOf(Set);
  });

  it('an arrow keydown on document starts the pan loop, keyup ends it', () => {
    let now = 1000;
    jest.spyOn(performance, 'now').mockImplementation(() => now);

    key('keydown', 'ArrowRight');
    expect((internals().heldPanKeys as Set<string>).has('ArrowRight')).toBe(true);
    expect(internals().keyboardPanRunning).toBe(true);
    expect(rafSpy).toHaveBeenCalled();

    // Drive one frame by hand: 100 ms later the camera has moved.
    // (Earlier queued frames may be coalesced requestRender() callbacks —
    // the pan step is the one scheduled by the keydown, i.e. the last.)
    now += 100;
    const step = rafCallbacks[rafCallbacks.length - 1];
    step(now);
    expect(terrainPan()).toHaveBeenCalledTimes(1);

    key('keyup', 'ArrowRight');
    expect(internals().keyboardPanRunning).toBe(false);

    // The loop notices the stop on its next scheduled frame and goes quiet
    const next = rafCallbacks[rafCallbacks.length - 1];
    now += 100;
    next(now);
    expect(terrainPan()).toHaveBeenCalledTimes(1);
  });

  it('window blur drops every held arrow', () => {
    key('keydown', 'ArrowLeft');
    key('keydown', 'ArrowUp');
    window.dispatchEvent(new Event('blur'));
    expect((internals().heldPanKeys as Set<string>).size).toBe(0);
    expect(internals().keyboardPanRunning).toBe(false);
  });

  it('Q on document no longer rotates — the hook owns rotation (N7)', () => {
    key('keydown', 'q');
    const setRotation = (internals().terrainRenderer as AnyRecord).setRotation as jest.Mock;
    expect(setRotation).not.toHaveBeenCalled();
  });

  it('destroy() unhooks the document and window listeners', () => {
    renderer.destroy();
    key('keydown', 'ArrowRight');
    expect(internals().keyboardPanRunning).toBe(false);
    expect((internals().heldPanKeys as Set<string>).size).toBe(0);
    // destroy is idempotent for the afterEach teardown
  });
});
