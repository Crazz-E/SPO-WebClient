/**
 * The DOM collector, under jsdom.
 *
 * jsdom reports every rect as zero and implements neither `elementFromPoint` nor
 * `visualViewport`, so each is stubbed explicitly — which is also what makes the assertions
 * about *what the collector reads* meaningful rather than incidental.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { collectGeometry } from './geometry-collect';

type Rect = { x: number; y: number; width: number; height: number };

function stubRect(element: Element, rect: Rect): void {
  element.getBoundingClientRect = () => ({
    x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height,
    toJSON: () => ({}),
  }) as DOMRect;
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

let button: HTMLButtonElement;
let panel: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.style.setProperty('--sai-top', '47px');
  document.documentElement.style.setProperty('--sai-right', '0px');
  document.documentElement.style.setProperty('--sai-bottom', '34px');
  document.documentElement.style.setProperty('--sai-left', '0px');

  panel = document.createElement('section');
  panel.className = 'panel';
  panel.style.overflow = 'hidden';
  button = document.createElement('button');
  button.className = 'tax';
  button.style.fontSize = '11px';
  button.style.position = 'absolute';
  panel.appendChild(button);
  document.body.appendChild(panel);

  stubRect(button, { x: 10, y: 800, width: 28, height: 28 });
  stubRect(panel, { x: 0, y: 0, width: 390, height: 780 });
  stubRect(document.body, { x: 0, y: 0, width: 390, height: 844 });
  setViewport(390, 844);
  Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
  (document as unknown as { elementFromPoint: unknown }).elementFromPoint = () => button;
});

afterEach(() => {
  delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
  delete (window as unknown as { visualViewport?: unknown }).visualViewport;
  for (const name of ['--sai-top', '--sai-right', '--sai-bottom', '--sai-left']) {
    document.documentElement.style.removeProperty(name);
  }
});

describe('collectGeometry — what it reads', () => {
  it('puts the flagged element first, then its ancestors', () => {
    const capture = collectGeometry(button);
    expect(capture.elements[0].selector).toContain('button.tax');
    expect(capture.elements[1].selector).toContain('section.panel');
    expect(capture.elements.length).toBeGreaterThanOrEqual(3);
  });

  it('carries the measured rect, not jsdom’s zeros', () => {
    expect(collectGeometry(button).elements[0].rect).toEqual({ x: 10, y: 800, width: 28, height: 28 });
  });

  it('reads the documented style subset, and nothing else', () => {
    const styles = collectGeometry(button).elements[0].styles;
    expect(Object.keys(styles).sort()).toEqual(
      ['fontSize', 'overflow', 'padding', 'position', 'transform', 'zIndex']
    );
    expect(styles.fontSize).toBe('11px');
    expect(styles.position).toBe('absolute');
  });

  it('measures the overflow against the nearest clipping ancestor', () => {
    // The button sits at y=800..828; the clipping panel ends at 780.
    expect(collectGeometry(button).overflowParent).toEqual({ top: 0, left: 0, right: 0, bottom: 48 });
  });

  it('reports no clipping parent when nothing hides overflow', () => {
    panel.style.overflow = 'visible';
    expect(collectGeometry(button).overflowParent).toBeNull();
  });

  it('reads the safe-area insets from the --sai-* tokens', () => {
    expect(collectGeometry(button).safeAreaInsets).toEqual({ top: 47, right: 0, bottom: 34, left: 0 });
  });

  it('treats absent --sai-* tokens as zero rather than NaN', () => {
    for (const name of ['--sai-top', '--sai-right', '--sai-bottom', '--sai-left']) {
      document.documentElement.style.removeProperty(name);
    }
    expect(collectGeometry(button).safeAreaInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('reads the viewport, orientation and pixel ratio', () => {
    const capture = collectGeometry(button);
    expect(capture.viewport).toEqual({ width: 390, height: 844 });
    expect(capture.orientation).toBe('portrait');
    expect(capture.devicePixelRatio).toBe(3);
  });
});

describe('collectGeometry — the occlusion probe', () => {
  it('says nothing when the centre is the element itself', () => {
    expect(collectGeometry(button).occludedBy).toBeNull();
  });

  it('says nothing when the centre is a descendant of it', () => {
    const label = document.createElement('span');
    button.appendChild(label);
    (document as unknown as { elementFromPoint: unknown }).elementFromPoint = () => label;
    expect(collectGeometry(button).occludedBy).toBeNull();
  });

  it('names the covering node when the centre is something else', () => {
    const nav = document.createElement('nav');
    nav.className = 'bottom';
    document.body.appendChild(nav);
    (document as unknown as { elementFromPoint: unknown }).elementFromPoint = () => nav;
    expect(collectGeometry(button).occludedBy).toContain('nav.bottom');
  });

  it('survives a browser with no elementFromPoint', () => {
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    expect(collectGeometry(button).occludedBy).toBeNull();
  });

  it('survives elementFromPoint returning nothing', () => {
    (document as unknown as { elementFromPoint: unknown }).elementFromPoint = () => null;
    expect(collectGeometry(button).occludedBy).toBeNull();
  });
});

describe('collectGeometry — visualViewport', () => {
  it('reads it when the browser has one', () => {
    (window as unknown as { visualViewport: unknown }).visualViewport = { height: 520 };
    expect(collectGeometry(button).visualViewportHeight).toBe(520);
  });

  it('reports null when it is missing, rather than pretending the keyboard is closed', () => {
    expect(collectGeometry(button).visualViewportHeight).toBeNull();
  });
});
