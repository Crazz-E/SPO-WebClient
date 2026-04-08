import {
  MAX_RECONNECT_ATTEMPTS,
  FAST_PHASE_DELAYS_MS,
  SLOW_PHASE_INTERVAL_MS,
  SLOW_PHASE_MAX_ATTEMPTS,
  getReconnectDelay,
  isMaxAttempts,
  isSlowPhase,
} from './reconnect-utils';

describe('reconnect-utils', () => {
  describe('two-phase constants', () => {
    it('MAX_RECONNECT_ATTEMPTS = fast + slow phases', () => {
      expect(MAX_RECONNECT_ATTEMPTS).toBe(FAST_PHASE_DELAYS_MS.length + SLOW_PHASE_MAX_ATTEMPTS);
    });

    it('fast phase delays are strictly increasing', () => {
      for (let i = 1; i < FAST_PHASE_DELAYS_MS.length; i++) {
        expect(FAST_PHASE_DELAYS_MS[i]).toBeGreaterThan(FAST_PHASE_DELAYS_MS[i - 1]);
      }
    });

    it('slow phase interval is 30s', () => {
      expect(SLOW_PHASE_INTERVAL_MS).toBe(30_000);
    });
  });

  describe('getReconnectDelay', () => {
    it.each([
      [0, 2000],
      [1, 4000],
      [2, 8000],
      [3, 16000],
      [4, 30000],
    ])('fast phase: attempt %i returns %ims', (attempt, expected) => {
      expect(getReconnectDelay(attempt)).toBe(expected);
    });

    it('slow phase: returns fixed 30s interval', () => {
      // Attempt indices >= FAST_PHASE_DELAYS_MS.length enter slow phase
      const slowStart = FAST_PHASE_DELAYS_MS.length;
      expect(getReconnectDelay(slowStart)).toBe(SLOW_PHASE_INTERVAL_MS);
      expect(getReconnectDelay(slowStart + 5)).toBe(SLOW_PHASE_INTERVAL_MS);
      expect(getReconnectDelay(99)).toBe(SLOW_PHASE_INTERVAL_MS);
    });

    it('matches FAST_PHASE_DELAYS_MS entries directly', () => {
      FAST_PHASE_DELAYS_MS.forEach((delay, i) => {
        expect(getReconnectDelay(i)).toBe(delay);
      });
    });
  });

  describe('isMaxAttempts', () => {
    it('returns false below the max', () => {
      expect(isMaxAttempts(0)).toBe(false);
      expect(isMaxAttempts(MAX_RECONNECT_ATTEMPTS - 1)).toBe(false);
    });

    it('returns true at the max', () => {
      expect(isMaxAttempts(MAX_RECONNECT_ATTEMPTS)).toBe(true);
    });

    it('returns true above the max', () => {
      expect(isMaxAttempts(MAX_RECONNECT_ATTEMPTS + 1)).toBe(true);
      expect(isMaxAttempts(99)).toBe(true);
    });
  });

  describe('isSlowPhase', () => {
    it('returns false during fast phase', () => {
      for (let i = 0; i < FAST_PHASE_DELAYS_MS.length; i++) {
        expect(isSlowPhase(i)).toBe(false);
      }
    });

    it('returns true at and beyond fast phase boundary', () => {
      expect(isSlowPhase(FAST_PHASE_DELAYS_MS.length)).toBe(true);
      expect(isSlowPhase(FAST_PHASE_DELAYS_MS.length + 1)).toBe(true);
      expect(isSlowPhase(99)).toBe(true);
    });
  });
});
