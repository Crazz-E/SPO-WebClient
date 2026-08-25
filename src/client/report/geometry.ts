/**
 * The geometry analysis — pure maths, no DOM.
 *
 * Mobile is the ergonomics profile, and its whole design follows from one decision: **numbers,
 * not pixels**. A screenshot forces the triage session to delegate its reading to a sub-agent
 * and yields a subjective impression. What an autonomous session can act on is
 * "28×28 px target against a 44 px minimum", "overflows its parent by 12 px on the right",
 * "covered by nav.bottom" — comparable against a threshold, and free of any dependency.
 *
 * Nothing here touches the DOM; `geometry-collect.ts` does the reading and hands the numbers
 * over. That separation is what lets this module be tested in the node project.
 */

import type { ElementGeometry, GeometryCapture } from '../../shared/bug-report-schema';
import { MAX_GEOMETRY_ELEMENTS } from '../../shared/bug-report-schema';

/** The WCAG 2.1 target size everything on a phone is measured against. */
export const MIN_TOUCH_TARGET_PX = 44;

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** What the collector reads for the flagged element and each ancestor. */
export interface GeometryProbe {
  /** The flagged element first, then each ancestor outward. Trimmed to 8 here. */
  elements: ElementGeometry[];
  /**
   * The node `document.elementFromPoint` returned at the element's own centre, and whether
   * that node is the element itself or one of its descendants. The collector answers the
   * second question because only it can walk the tree.
   */
  centrePoint: { cssChain: string; isSelfOrDescendant: boolean } | null;
  /** Rect of the nearest scroll/clip ancestor, or `null` when nothing clips the element. */
  clipParentRect: { x: number; y: number; width: number; height: number } | null;
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  visualViewportHeight: number | null;
  safeAreaInsets: Insets;
}

/**
 * How far the element escapes its clipping parent, per edge, in pixels. Zero on an edge that
 * stays inside — a negative number would say "there is room left", which is not what the field
 * is for.
 */
function overflowAgainst(
  element: ElementGeometry['rect'],
  parent: { x: number; y: number; width: number; height: number },
): Insets {
  return {
    top: Math.max(0, parent.y - element.y),
    left: Math.max(0, parent.x - element.x),
    right: Math.max(0, (element.x + element.width) - (parent.x + parent.width)),
    bottom: Math.max(0, (element.y + element.height) - (parent.y + parent.height)),
  };
}

/** Turn one probe into the block that rides in the report. */
export function analyzeGeometry(probe: GeometryProbe): GeometryCapture {
  const elements = probe.elements.slice(0, MAX_GEOMETRY_ELEMENTS);
  const target = elements[0];

  return {
    elements,
    // The element covering its own centre is the occlusion that matters: a node overlapping
    // only an edge still leaves the control usable.
    occludedBy: probe.centrePoint && !probe.centrePoint.isSelfOrDescendant
      ? probe.centrePoint.cssChain
      : null,
    overflowParent: target && probe.clipParentRect
      ? overflowAgainst(target.rect, probe.clipParentRect)
      : null,
    viewport: probe.viewport,
    orientation: probe.viewport.width > probe.viewport.height ? 'landscape' : 'portrait',
    devicePixelRatio: probe.devicePixelRatio,
    visualViewportHeight: probe.visualViewportHeight,
    safeAreaInsets: probe.safeAreaInsets,
  };
}

/**
 * Is the target below the minimum touch size?
 *
 * A predicate rather than a field in the report: the report carries the measured numbers,
 * which stay true, and the threshold is a judgement that may move. Triage applies the same
 * function to the stored rect.
 */
export function isUndersizedTarget(rect: ElementGeometry['rect']): boolean {
  return rect.width < MIN_TOUCH_TARGET_PX || rect.height < MIN_TOUCH_TARGET_PX;
}

/**
 * The on-screen keyboard, inferred: `visualViewport.height` shrinks when it opens while
 * `innerHeight` does not. Unknown — not `false` — when the browser has no visualViewport.
 */
export function isKeyboardOpen(capture: GeometryCapture): boolean | null {
  if (capture.visualViewportHeight === null) return null;
  return capture.visualViewportHeight < capture.viewport.height;
}

/** A one-line summary of what is wrong with the target, for the sheet and for triage. */
export function describeTarget(capture: GeometryCapture): string[] {
  const findings: string[] = [];
  const target = capture.elements[0];
  if (target && isUndersizedTarget(target.rect)) {
    findings.push(
      `target ${Math.round(target.rect.width)}×${Math.round(target.rect.height)} px, below the ${MIN_TOUCH_TARGET_PX} px minimum`
    );
  }
  if (capture.occludedBy) findings.push(`covered by ${capture.occludedBy}`);
  const overflow = capture.overflowParent;
  if (overflow) {
    const edges = (Object.entries(overflow) as Array<[keyof Insets, number]>)
      .filter(([, px]) => px > 0)
      .map(([edge, px]) => `${edge} ${Math.round(px)} px`);
    if (edges.length > 0) findings.push(`escapes its parent: ${edges.join(', ')}`);
  }
  if (isKeyboardOpen(capture)) findings.push('the on-screen keyboard was open');
  return findings;
}
