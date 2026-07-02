import {
  MAX_RECONNECT_ATTEMPTS,
  FAST_PHASE_DELAYS_MS,
  SLOW_PHASE_INTERVAL_MS,
  SLOW_PHASE_MAX_ATTEMPTS,
  applyJitter,
  getReconnectDelay,
  isMaxAttempts,
  isSlowPhase,
} from './reconnect-utils';

/** random() = 0.5 → jitter factor exactly 1.0 → base delay unchanged. */
const midRandom = () => 0.5;

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
    ])('fast phase: attempt %i returns %ims base delay (jitter factor 1.0)', (attempt, expected) => {
      expect(getReconnectDelay(attempt, midRandom)).toBe(expected);
    });

    it('slow phase: returns fixed 30s base interval (jitter factor 1.0)', () => {
      // Attempt indices >= FAST_PHASE_DELAYS_MS.length enter slow phase
      const slowStart = FAST_PHASE_DELAYS_MS.length;
      expect(getReconnectDelay(slowStart, midRandom)).toBe(SLOW_PHASE_INTERVAL_MS);
      expect(getReconnectDelay(slowStart + 5, midRandom)).toBe(SLOW_PHASE_INTERVAL_MS);
      expect(getReconnectDelay(99, midRandom)).toBe(SLOW_PHASE_INTERVAL_MS);
    });

    it('matches FAST_PHASE_DELAYS_MS entries directly (jitter factor 1.0)', () => {
      FAST_PHASE_DELAYS_MS.forEach((delay, i) => {
        expect(getReconnectDelay(i, midRandom)).toBe(delay);
      });
    });
  });

  describe('jitter (audit V5 — desynchronize the thundering herd)', () => {
    it('applyJitter spans exactly ±25% of the base delay', () => {
      expect(applyJitter(10_000, () => 0)).toBe(7_500);   // floor
      expect(applyJitter(10_000, () => 0.5)).toBe(10_000); // midpoint
      expect(applyJitter(10_000, () => 1)).toBe(12_500);  // ceiling (random() < 1 in practice)
    });

    it('every real delay stays within the ±25% band', () => {
      for (let attempt = 0; attempt < MAX_RECONNECT_ATTEMPTS; attempt++) {
        const base = attempt < FAST_PHASE_DELAYS_MS.length
          ? FAST_PHASE_DELAYS_MS[attempt]
          : SLOW_PHASE_INTERVAL_MS;
        for (let i = 0; i < 20; i++) {
          const delay = getReconnectDelay(attempt);
          expect(delay).toBeGreaterThanOrEqual(base * 0.75);
          expect(delay).toBeLessThanOrEqual(base * 1.25);
        }
      }
    });

    it('delays are actually spread (not constant) across draws', () => {
      const draws = new Set(Array.from({ length: 50 }, () => getReconnectDelay(0)));
      expect(draws.size).toBeGreaterThan(1);
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
