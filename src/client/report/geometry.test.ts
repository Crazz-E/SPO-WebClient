import { describe, it, expect } from '@jest/globals';
import type { ElementGeometry, GeometryCapture } from '../../shared/bug-report-schema';
import {
  MIN_TOUCH_TARGET_PX,
  analyzeGeometry,
  describeTarget,
  isKeyboardOpen,
  isUndersizedTarget,
  type GeometryProbe,
} from './geometry';

const STYLES: ElementGeometry['styles'] = {
  fontSize: '14px', padding: '4px', overflow: 'visible',
  position: 'static', zIndex: 'auto', transform: 'none',
};

function element(selector: string, rect: ElementGeometry['rect']): ElementGeometry {
  return { selector, rect, styles: STYLES };
}

function probe(over: Partial<GeometryProbe> = {}): GeometryProbe {
  return {
    elements: [element('button.tax', { x: 10, y: 20, width: 100, height: 48 })],
    centrePoint: null,
    clipParentRect: null,
    viewport: { width: 390, height: 844 },
    devicePixelRatio: 3,
    visualViewportHeight: 844,
    safeAreaInsets: { top: 47, right: 0, bottom: 34, left: 0 },
    ...over,
  };
}

describe('isUndersizedTarget — the 44 px boundary', () => {
  it('passes at exactly 44 px on both axes', () => {
    expect(isUndersizedTarget({ x: 0, y: 0, width: MIN_TOUCH_TARGET_PX, height: MIN_TOUCH_TARGET_PX })).toBe(false);
  });

  it('fails just under, on either axis', () => {
    expect(isUndersizedTarget({ x: 0, y: 0, width: 43.9, height: 44 })).toBe(true);
    expect(isUndersizedTarget({ x: 0, y: 0, width: 44, height: 43.9 })).toBe(true);
    expect(isUndersizedTarget({ x: 0, y: 0, width: 28, height: 28 })).toBe(true);
  });

  it('a long thin control is undersized on its short axis alone', () => {
    expect(isUndersizedTarget({ x: 0, y: 0, width: 300, height: 30 })).toBe(true);
  });
});

describe('analyzeGeometry — overflow against the clipping parent', () => {
  it('reports zero on every edge when the element sits inside', () => {
    const capture = analyzeGeometry(probe({
      elements: [element('button', { x: 20, y: 20, width: 40, height: 40 })],
      clipParentRect: { x: 0, y: 0, width: 200, height: 200 },
    }));
    expect(capture.overflowParent).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('measures each edge it escapes, in pixels', () => {
    const capture = analyzeGeometry(probe({
      elements: [element('button', { x: -5, y: -12, width: 220, height: 230 })],
      clipParentRect: { x: 0, y: 0, width: 200, height: 200 },
    }));
    expect(capture.overflowParent).toEqual({ top: 12, left: 5, right: 15, bottom: 18 });
  });

  it('never reports a negative — "room to spare" is not an overflow', () => {
    const capture = analyzeGeometry(probe({
      elements: [element('button', { x: 50, y: 50, width: 10, height: 10 })],
      clipParentRect: { x: 0, y: 0, width: 200, height: 200 },
    }));
    expect(Object.values(capture.overflowParent as Record<string, number>).every(v => v === 0)).toBe(true);
  });

  it('is null when nothing clips the element', () => {
    expect(analyzeGeometry(probe({ clipParentRect: null })).overflowParent).toBeNull();
  });

  it('is null when there is no element to measure', () => {
    const capture = analyzeGeometry(probe({ elements: [], clipParentRect: { x: 0, y: 0, width: 1, height: 1 } }));
    expect(capture.overflowParent).toBeNull();
  });
});

describe('analyzeGeometry — the occlusion verdict', () => {
  it('says nothing when the centre resolves to the element itself', () => {
    const capture = analyzeGeometry(probe({
      centrePoint: { cssChain: 'body > button.tax', isSelfOrDescendant: true },
    }));
    expect(capture.occludedBy).toBeNull();
  });

  it('says nothing when the centre resolves to a descendant — the label inside the button', () => {
    const capture = analyzeGeometry(probe({
      centrePoint: { cssChain: 'body > button.tax > span', isSelfOrDescendant: true },
    }));
    expect(capture.occludedBy).toBeNull();
  });

  it('names the covering node when the centre resolves to something else', () => {
    const capture = analyzeGeometry(probe({
      centrePoint: { cssChain: 'body > nav.bottom', isSelfOrDescendant: false },
    }));
    expect(capture.occludedBy).toBe('body > nav.bottom');
  });

  it('says nothing when the browser could not answer at all', () => {
    expect(analyzeGeometry(probe({ centrePoint: null })).occludedBy).toBeNull();
  });
});

describe('analyzeGeometry — the rest of the capture', () => {
  it('reads orientation from the viewport, portrait when square', () => {
    expect(analyzeGeometry(probe({ viewport: { width: 390, height: 844 } })).orientation).toBe('portrait');
    expect(analyzeGeometry(probe({ viewport: { width: 844, height: 390 } })).orientation).toBe('landscape');
    expect(analyzeGeometry(probe({ viewport: { width: 500, height: 500 } })).orientation).toBe('portrait');
  });

  it('keeps at most eight elements — the flagged one first', () => {
    const many = Array.from({ length: 12 }, (_, i) => element(`div.level${i}`, { x: 0, y: 0, width: 10, height: 10 }));
    const capture = analyzeGeometry(probe({ elements: many }));
    expect(capture.elements).toHaveLength(8);
    expect(capture.elements[0].selector).toBe('div.level0');
  });

  it('passes the device facts straight through', () => {
    const capture = analyzeGeometry(probe());
    expect(capture.devicePixelRatio).toBe(3);
    expect(capture.visualViewportHeight).toBe(844);
    expect(capture.safeAreaInsets).toEqual({ top: 47, right: 0, bottom: 34, left: 0 });
  });
});

describe('isKeyboardOpen', () => {
  const base = analyzeGeometry(probe());

  it('is true when the visual viewport is shorter than the layout viewport', () => {
    expect(isKeyboardOpen({ ...base, visualViewportHeight: 520 })).toBe(true);
  });

  it('is false when they agree', () => {
    expect(isKeyboardOpen({ ...base, visualViewportHeight: 844 })).toBe(false);
  });

  it('is null — not false — when the browser does not say', () => {
    // "unknown" and "closed" are different answers, and only the first is honest.
    expect(isKeyboardOpen({ ...base, visualViewportHeight: null })).toBeNull();
  });
});

describe('describeTarget', () => {
  function capture(over: Partial<GeometryCapture> = {}): GeometryCapture {
    return { ...analyzeGeometry(probe()), ...over };
  }

  it('says nothing about a control that is fine', () => {
    expect(describeTarget(capture())).toEqual([]);
  });

  it('reports an undersized target with its actual numbers', () => {
    const small = capture({ elements: [element('button', { x: 0, y: 0, width: 28.4, height: 28 })] });
    expect(describeTarget(small)).toEqual(['target 28×28 px, below the 44 px minimum']);
  });

  it('names what covers it', () => {
    expect(describeTarget(capture({ occludedBy: 'nav.bottom' }))).toEqual(['covered by nav.bottom']);
  });

  it('lists only the edges that actually overflow', () => {
    const cut = capture({ overflowParent: { top: 0, right: 12, bottom: 0, left: 0 } });
    expect(describeTarget(cut)).toEqual(['escapes its parent: right 12 px']);
  });

  it('stays quiet when the element is clipped but escapes nowhere', () => {
    expect(describeTarget(capture({ overflowParent: { top: 0, right: 0, bottom: 0, left: 0 } }))).toEqual([]);
  });

  it('mentions the keyboard, and combines findings', () => {
    const messy = capture({
      elements: [element('button', { x: 0, y: 0, width: 30, height: 30 })],
      occludedBy: 'nav.bottom',
      visualViewportHeight: 400,
    });
    expect(describeTarget(messy)).toEqual([
      'target 30×30 px, below the 44 px minimum',
      'covered by nav.bottom',
      'the on-screen keyboard was open',
    ]);
  });
});
