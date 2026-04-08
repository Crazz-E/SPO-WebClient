/**
 * reconnect-utils — Pure helpers for WebSocket auto-reconnect backoff.
 * Kept separate so logic can be unit-tested without a browser environment.
 *
 * Two-phase strategy (mirrors Delphi TReconnectThread which never gives up):
 *   Phase 1 (FAST): Exponential backoff [2s, 4s, 8s, 16s, 30s] — 5 attempts
 *   Phase 2 (SLOW): Fixed 30s interval — continues for 5 more minutes (10 attempts)
 *   Total: up to 15 attempts over ~6 minutes before giving up.
 */

/** Fast-phase attempts with exponential backoff. */
export const FAST_PHASE_DELAYS_MS = [2000, 4000, 8000, 16000, 30000] as const;

/** Slow-phase: fixed interval after fast phase exhausted. */
export const SLOW_PHASE_INTERVAL_MS = 30_000;

/** Total slow-phase attempts (30s × 10 = 5 min of slow retries). */
export const SLOW_PHASE_MAX_ATTEMPTS = 10;

/** Total max attempts across both phases. */
export const MAX_RECONNECT_ATTEMPTS = FAST_PHASE_DELAYS_MS.length + SLOW_PHASE_MAX_ATTEMPTS;

/**
 * Returns the delay (ms) to wait before the given attempt (0-based).
 * Fast phase: escalating delays. Slow phase: fixed 30s.
 */
export function getReconnectDelay(attempt: number): number {
  if (attempt < FAST_PHASE_DELAYS_MS.length) {
    return FAST_PHASE_DELAYS_MS[attempt];
  }
  return SLOW_PHASE_INTERVAL_MS;
}

/** Returns true when no more reconnect attempts should be made. */
export function isMaxAttempts(attempt: number): boolean {
  return attempt >= MAX_RECONNECT_ATTEMPTS;
}

/** Returns true when we're in the slow-poll phase (for UI messaging). */
export function isSlowPhase(attempt: number): boolean {
  return attempt >= FAST_PHASE_DELAYS_MS.length;
}
