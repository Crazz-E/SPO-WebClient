import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_DELAYS_MS,
  getReconnectDelay,
  isMaxAttempts,
} from './reconnect-utils';

describe('reconnect-utils', () => {
  describe('getReconnectDelay', () => {
    it.each([
      [0, 2000],
      [1, 4000],
      [2, 8000],
      [3, 16000],
      [4, 30000],
    ])('attempt %i returns %ims', (attempt, expected) => {
      expect(getReconnectDelay(attempt)).toBe(expected);
    });

    it('clamps to last delay for attempts beyond array length', () => {
      expect(getReconnectDelay(5)).toBe(30000);
      expect(getReconnectDelay(99)).toBe(30000);
    });

    it('matches RECONNECT_DELAYS_MS entries directly', () => {
      RECONNECT_DELAYS_MS.forEach((delay, i) => {
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

  describe('constants', () => {
    it('MAX_RECONNECT_ATTEMPTS is 5', () => {
      expect(MAX_RECONNECT_ATTEMPTS).toBe(5);
    });

    it('RECONNECT_DELAYS_MS has exactly MAX_RECONNECT_ATTEMPTS entries', () => {
      expect(RECONNECT_DELAYS_MS.length).toBe(MAX_RECONNECT_ATTEMPTS);
    });

    it('delays are strictly increasing', () => {
      for (let i = 1; i < RECONNECT_DELAYS_MS.length; i++) {
        expect(RECONNECT_DELAYS_MS[i]).toBeGreaterThan(RECONNECT_DELAYS_MS[i - 1]);
      }
    });
  });
});
