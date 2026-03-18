/**
 * reconnect-utils — Pure helpers for WebSocket auto-reconnect backoff.
 * Kept separate so logic can be unit-tested without a browser environment.
 */

export const MAX_RECONNECT_ATTEMPTS = 5;

/** Delay in ms for each attempt index (0-based). Last value is the cap. */
export const RECONNECT_DELAYS_MS = [2000, 4000, 8000, 16000, 30000] as const;

/**
 * Returns the delay (ms) to wait before the given attempt.
 * Clamps to the last value for attempts beyond the array length.
 */
export function getReconnectDelay(attempt: number): number {
  return RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
}

/** Returns true when no more reconnect attempts should be made. */
export function isMaxAttempts(attempt: number): boolean {
  return attempt >= MAX_RECONNECT_ATTEMPTS;
}
