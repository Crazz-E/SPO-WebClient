/**
 * Tests for useSheetGesture hook — snap point logic and velocity detection.
 *
 * Since the test environment is node (no jsdom), we test the snap logic
 * directly by extracting the core functions, and test the hook integration
 * via the mobile-components test suite.
 */

import { describe, it, expect, jest } from '@jest/globals';

/**
 * Extracted snap-point resolution logic (mirrors useSheetGesture internals).
 * This lets us unit-test the decision logic without needing a DOM.
 */
type SnapPoint = 'peek' | 'half' | 'full';

interface SnapInput {
  deltaY: number;
  velocity: number;   // px/s, positive = downward
  currentSnap: SnapPoint;
}

type SnapResult = { action: 'snap'; snap: SnapPoint } | { action: 'dismiss' };

const VELOCITY_THRESHOLD = 800;
const DISMISS_THRESHOLD = 80;

function resolveSnap({ deltaY, velocity, currentSnap }: SnapInput): SnapResult {
  // Fast flick down → dismiss
  if (velocity > VELOCITY_THRESHOLD) return { action: 'dismiss' };
  // Fast flick up → full
  if (velocity < -VELOCITY_THRESHOLD) return { action: 'snap', snap: 'full' };

  // Slow drag: determine direction and snap
  if (deltaY > DISMISS_THRESHOLD && currentSnap === 'peek') return { action: 'dismiss' };
  if (deltaY > 60) {
    if (currentSnap === 'full') return { action: 'snap', snap: 'half' };
    if (currentSnap === 'half') return { action: 'snap', snap: 'peek' };
    return { action: 'dismiss' };
  }
  if (deltaY < -60) {
    if (currentSnap === 'peek') return { action: 'snap', snap: 'half' };
    if (currentSnap === 'half') return { action: 'snap', snap: 'full' };
  }
  // Small movement → stay
  return { action: 'snap', snap: currentSnap };
}

describe('useSheetGesture — snap resolution logic', () => {
  describe('velocity-based snapping', () => {
    it('fast flick down dismisses regardless of snap', () => {
      expect(resolveSnap({ deltaY: 100, velocity: 900, currentSnap: 'full' }))
        .toEqual({ action: 'dismiss' });
      expect(resolveSnap({ deltaY: 50, velocity: 1200, currentSnap: 'peek' }))
        .toEqual({ action: 'dismiss' });
    });

    it('fast flick up goes to full regardless of snap', () => {
      expect(resolveSnap({ deltaY: -100, velocity: -900, currentSnap: 'peek' }))
        .toEqual({ action: 'snap', snap: 'full' });
      expect(resolveSnap({ deltaY: -50, velocity: -1200, currentSnap: 'half' }))
        .toEqual({ action: 'snap', snap: 'full' });
    });
  });

  describe('slow drag — step-based snapping', () => {
    it('drag up from peek → half', () => {
      expect(resolveSnap({ deltaY: -80, velocity: -200, currentSnap: 'peek' }))
        .toEqual({ action: 'snap', snap: 'half' });
    });

    it('drag up from half → full', () => {
      expect(resolveSnap({ deltaY: -80, velocity: -200, currentSnap: 'half' }))
        .toEqual({ action: 'snap', snap: 'full' });
    });

    it('drag up from full → stays at full', () => {
      expect(resolveSnap({ deltaY: -80, velocity: -200, currentSnap: 'full' }))
        .toEqual({ action: 'snap', snap: 'full' });
    });

    it('drag down from full → half', () => {
      expect(resolveSnap({ deltaY: 80, velocity: 200, currentSnap: 'full' }))
        .toEqual({ action: 'snap', snap: 'half' });
    });

    it('drag down from half → peek', () => {
      expect(resolveSnap({ deltaY: 80, velocity: 200, currentSnap: 'half' }))
        .toEqual({ action: 'snap', snap: 'peek' });
    });

    it('drag down from peek → dismiss', () => {
      expect(resolveSnap({ deltaY: 80, velocity: 200, currentSnap: 'peek' }))
        .toEqual({ action: 'dismiss' });
    });
  });

  describe('dismiss threshold', () => {
    it('drag down past dismiss threshold from peek → dismiss', () => {
      expect(resolveSnap({ deltaY: 100, velocity: 300, currentSnap: 'peek' }))
        .toEqual({ action: 'dismiss' });
    });

    it('drag down within threshold from peek → still dismissed (>60)', () => {
      expect(resolveSnap({ deltaY: 70, velocity: 200, currentSnap: 'peek' }))
        .toEqual({ action: 'dismiss' });
    });
  });

  describe('small movements — stay at current snap', () => {
    it('tiny drag from peek stays', () => {
      expect(resolveSnap({ deltaY: 20, velocity: 100, currentSnap: 'peek' }))
        .toEqual({ action: 'snap', snap: 'peek' });
    });

    it('tiny drag from half stays', () => {
      expect(resolveSnap({ deltaY: -30, velocity: -100, currentSnap: 'half' }))
        .toEqual({ action: 'snap', snap: 'half' });
    });

    it('tiny drag from full stays', () => {
      expect(resolveSnap({ deltaY: 10, velocity: 50, currentSnap: 'full' }))
        .toEqual({ action: 'snap', snap: 'full' });
    });

    it('zero movement stays', () => {
      expect(resolveSnap({ deltaY: 0, velocity: 0, currentSnap: 'half' }))
        .toEqual({ action: 'snap', snap: 'half' });
    });
  });
});
