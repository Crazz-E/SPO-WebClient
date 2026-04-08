/**
 * Graceful Degradation — withFallback utility for RDO requests.
 *
 * Mirrors Delphi InterfaceServer.pas pattern: all proxy method calls wrapped
 * in try-except, returning default values on failure. The UI continues
 * working with stale/default data rather than crashing.
 *
 * Use for NON-CRITICAL reads where showing default/stale data is better
 * than showing an error. Do NOT use for mutations where the user needs
 * to know it failed.
 */

import { toErrorMessage } from '../../shared/error-utils';

type LogFn = {
  warn(...args: unknown[]): void;
};

/**
 * Execute an async RDO operation, returning a fallback value on failure.
 * Logs the error but does not propagate it.
 *
 * @param operation  The async function to attempt (typically an RDO request)
 * @param fallback   The default value to return on failure
 * @param label      A label for logging (e.g., "getServerBusy", "getBuildingStatus")
 * @param log        Logger instance
 *
 * @example
 * // Instead of:
 * // let status: string;
 * // try { status = await getStatus(); } catch { status = ''; }
 * //
 * // Use:
 * const status = await withFallback(() => getStatus(), '', 'getStatus', this.log);
 */
export async function withFallback<T>(
  operation: () => Promise<T>,
  fallback: T,
  label: string,
  log: LogFn,
): Promise<T> {
  try {
    return await operation();
  } catch (err: unknown) {
    log.warn(`[Fallback] ${label} failed, using default:`, toErrorMessage(err));
    return fallback;
  }
}
