/**
 * The DOM half of the geometry capture: read the numbers, hand them to `analyzeGeometry`.
 *
 * Deliberately thin and free of arithmetic — everything that can be decided from numbers alone
 * lives in `geometry.ts`, where the node project can test it.
 */

import type { ElementGeometry, GeometryCapture } from '../../shared/bug-report-schema';
import { MAX_GEOMETRY_ELEMENTS } from '../../shared/bug-report-schema';
import { cssChainOf } from './dom-anchor';
import { analyzeGeometry, type GeometryProbe, type Insets } from './geometry';

/** The computed properties worth carrying: the ones that explain a layout going wrong. */
const STYLE_KEYS = ['fontSize', 'padding', 'overflow', 'position', 'zIndex', 'transform'] as const;

function readStyles(style: CSSStyleDeclaration): ElementGeometry['styles'] {
  const [fontSize, padding, overflow, position, zIndex, transform] =
    STYLE_KEYS.map(key => style[key] || '');
  return { fontSize, padding, overflow, position, zIndex, transform };
}

function readRect(element: Element): ElementGeometry['rect'] {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

/**
 * The safe-area insets, read through the `--sai-*` custom properties rather than a probe
 * element: `env()` is only usable inside a declaration, and the tokens already exist for the
 * CSS that positions the FAB. One mechanism, one place to change it.
 */
function readSafeAreaInsets(): Insets {
  const style = getComputedStyle(document.documentElement);
  const px = (name: string): number => Number.parseFloat(style.getPropertyValue(name)) || 0;
  return {
    top: px('--sai-top'),
    right: px('--sai-right'),
    bottom: px('--sai-bottom'),
    left: px('--sai-left'),
  };
}

/** The nearest ancestor that clips, i.e. the first one whose overflow is not `visible`. */
function nearestClipParent(element: Element): Element | null {
  let parent = element.parentElement;
  while (parent && parent !== document.documentElement) {
    const { overflow, overflowX, overflowY } = getComputedStyle(parent);
    if ([overflow, overflowX, overflowY].some(value => value && value !== 'visible')) return parent;
    parent = parent.parentElement;
  }
  return null;
}

/** What sits at the element's own centre — the occlusion that actually blocks a tap. */
function probeCentre(element: Element, rect: ElementGeometry['rect']): GeometryProbe['centrePoint'] {
  if (typeof document.elementFromPoint !== 'function') return null;
  const found = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  if (!found) return null;
  return { cssChain: cssChainOf(found), isSelfOrDescendant: element.contains(found) };
}

/** Read everything the analysis needs, for the flagged element and its ancestors. */
export function collectGeometry(element: Element): GeometryCapture {
  const elements: ElementGeometry[] = [];
  let current: Element | null = element;
  for (let depth = 0; current && depth < MAX_GEOMETRY_ELEMENTS; depth++) {
    elements.push({
      selector: cssChainOf(current),
      rect: readRect(current),
      styles: readStyles(getComputedStyle(current)),
    });
    current = current.parentElement;
  }

  const clipParent = nearestClipParent(element);
  const visualViewport = (window as Window & { visualViewport?: { height: number } }).visualViewport;

  return analyzeGeometry({
    elements,
    centrePoint: probeCentre(element, elements[0].rect),
    clipParentRect: clipParent ? readRect(clipParent) : null,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio || 1,
    // null, not innerHeight: "the browser does not say" and "the keyboard is closed" are
    // different answers, and only the first is honest here.
    visualViewportHeight: visualViewport ? visualViewport.height : null,
    safeAreaInsets: readSafeAreaInsets(),
  });
}
