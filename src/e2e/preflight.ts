/**
 * Pre-flight — doc/E2E-POLICY.md §6.
 *
 * A failed pre-flight is an ENVIRONMENT abort, not a failed attempt. The distinction is
 * the whole point: a server in maintenance must not burn one of the three tries and must
 * not be diagnosed as a bug in the diff.
 */

import { toErrorMessage } from '../shared/error-utils';
import { HTTP_BASE, LIVE_LOG_BASE } from './config';
import { findCurrentSurvivalLog } from './live-log';

export interface PreflightCheck {
  what: string;
  ok: boolean;
  detail?: string;
}

export interface PreflightResult {
  ok: boolean;
  checks: PreflightCheck[];
  /** Set when the failure is environmental rather than a defect in the change. */
  environmentAbort: boolean;
  survivalLogUrl?: string;
}

interface StartupStatus {
  phase?: string;
}

/** How long to wait for the gateway to declare itself ready before calling it an abort. */
const READINESS_TIMEOUT_MS = 120_000;

/**
 * `/api/startup-status` is a **Server-Sent Events** stream, not a JSON document
 * (server.ts:603-631). While the gateway is still building its caches the stream stays
 * open and emits a progress event per step; once ready it emits one final event and ends.
 *
 * So: read it as text — which naturally waits out a cold boot — and take the last `data:`
 * payload. The timeout is what stops a gateway stuck mid-initialisation from hanging the
 * whole gate.
 */
export function parseStartupStream(body: string): StartupStatus {
  const payloads = body
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice('data:'.length).trim())
    .filter(Boolean);

  const last = payloads[payloads.length - 1];
  if (!last) return {};
  try {
    return JSON.parse(last) as StartupStatus;
  } catch {
    return {};
  }
}

export async function preflight(
  fetchImpl: typeof fetch = fetch,
  findLog: typeof findCurrentSurvivalLog = findCurrentSurvivalLog,
): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];
  let survivalLogUrl: string | undefined;

  // 1. The local gateway must be up and past its startup phases.
  try {
    const response = await fetchImpl(`${HTTP_BASE}/api/startup-status`, {
      signal: AbortSignal.timeout(READINESS_TIMEOUT_MS),
    });
    const status = parseStartupStream(await response.text());
    checks.push({
      what: 'gateway is ready',
      ok: response.ok && status.phase === 'ready',
      detail: `phase=${status.phase ?? 'unknown'}`,
    });
  } catch (err: unknown) {
    checks.push({
      what: 'gateway is ready',
      ok: false,
      detail: `${HTTP_BASE} unreachable — start it with \`npm run dev\` (${toErrorMessage(err)})`,
    });
  }

  // 2. The model-server log must be readable, or no mutation can ever be proven.
  try {
    survivalLogUrl = await findLog();
    checks.push({ what: 'model-server log reachable', ok: true, detail: survivalLogUrl });
  } catch (err: unknown) {
    checks.push({
      what: 'model-server log reachable',
      ok: false,
      detail: `${LIVE_LOG_BASE} — ${toErrorMessage(err)}`,
    });
  }

  const ok = checks.every(c => c.ok);
  return { ok, checks, environmentAbort: !ok, survivalLogUrl };
}
