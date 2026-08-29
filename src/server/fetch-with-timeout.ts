import fetch from 'node-fetch';
import type { RequestInit, Response } from 'node-fetch';
import { TIMEOUTS } from '../shared/constants';

/** True for the abort/timeout rejections of node-fetch v2 (AbortError) and undici (TimeoutError). */
export function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

/** fetch that always aborts at a deadline. Default deadline: TIMEOUTS.FETCH (30 s). */
export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = TIMEOUTS.FETCH,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) as unknown as RequestInit['signal'] });
}
