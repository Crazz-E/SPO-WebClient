import fetch from 'node-fetch';
import type { RequestInit, Response } from 'node-fetch';
import { TIMEOUTS } from '../shared/constants';

export class FetchTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Fetch timed out after ${timeoutMs}ms: ${url}`);
    this.name = 'FetchTimeoutError';
  }
}

/**
 * Wraps node-fetch with an enforced deadline. Overrides any `init.signal` the
 * caller passes — no current call site sets one — so the mapping from an
 * abort to `FetchTimeoutError` stays sound.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = TIMEOUTS.FETCH,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs) as unknown as RequestInit['signal'],
    });
  } catch (err: unknown) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'AbortError' || name === 'TimeoutError') throw new FetchTimeoutError(url, timeoutMs);
    throw err;
  }
}
