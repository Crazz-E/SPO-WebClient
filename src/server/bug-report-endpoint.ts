/**
 * The deposit half of the dev-only bug-reporting feature: a POSTed report becomes a file in
 * a local queue that a later `/triage-report` session turns into kanban cards.
 *
 * The logic lives here rather than inline in `server.ts` because that module binds sockets
 * at import time, so no test can load it. `src/server/__tests__/cache-endpoint.test.ts`
 * works around that by re-implementing the route under test; this module exists so the
 * behaviour is tested for real instead of mirrored.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateBugReport, MAX_BODY_BYTES, type BugReport } from '../shared/bug-report-schema';
import { toErrorMessage } from '../shared/error-utils';

/**
 * Deliberately outside the worktree: `npm run finish` retires worktrees, and a queue that
 * lived inside one would disappear with the branch that produced the reports.
 */
export const DEFAULT_QUEUE_DIR = path.join(os.homedir(), '.spo-reports');

export interface DepositResult {
  status: 200 | 400 | 404 | 500;
  body: { ok?: true; file?: string; error?: string };
}

/** `2026-08-24T09:15:00.123Z` -> `2026-08-24T09-15-00-123Z`, safe as a filename component. */
function fileStamp(createdAtUtc: string): string {
  return createdAtUtc.replace(/[:.]/g, '-');
}

/**
 * Parse -> validate -> stamp `receivedAtUtc` -> write one file. Pure of req/res.
 *
 * `enabled: false` answers 404 rather than 403: in a normal deployment the endpoint does
 * not exist, and nothing about the response should suggest it might.
 */
export function depositBugReport(
  rawBody: string,
  opts: { enabled: boolean; queueDir: string },
): DepositResult {
  if (!opts.enabled) {
    return { status: 404, body: { error: 'Not found' } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } };
  }

  const validation = validateBugReport(parsed);
  if (!validation.ok) {
    return { status: 400, body: { error: validation.error } };
  }

  // The client never sets this: whatever it sent is replaced by the gateway's own clock.
  const report: BugReport = { ...validation.report, receivedAtUtc: new Date().toISOString() };
  const file = `${fileStamp(report.createdAtUtc)}_${report.profile}_${report.anchorKey}.json`;

  try {
    fs.mkdirSync(opts.queueDir, { recursive: true });
    fs.writeFileSync(path.join(opts.queueDir, file), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  } catch (err: unknown) {
    return { status: 500, body: { error: `Could not write the report: ${toErrorMessage(err)}` } };
  }

  return { status: 200, body: { ok: true, file } };
}

/** Just enough of `http.IncomingMessage` to stream a body — so a test can pass a fake. */
export interface BugReportRequest {
  on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
}

/** Just enough of `http.ServerResponse` to answer with JSON. */
export interface BugReportResponse {
  writeHead(status: number, headers: Record<string, string>): unknown;
  end(body: string): unknown;
}

export interface BugReportRequestDeps {
  enabled: boolean;
  queueDir: string;
  /** `false` means the caller is over its allowance; the answer is 429. */
  allowRequest: () => boolean;
}

/**
 * The whole `POST /api/bug-report` route.
 *
 * It lives here rather than in `server.ts` for one reason: nothing can import `server.ts`,
 * so every line written there is untested by construction. The route body is transport —
 * accumulate, cap, answer — and `depositBugReport` above holds the decisions.
 */
export function handleBugReportRequest(
  req: BugReportRequest,
  res: BugReportResponse,
  deps: BugReportRequestDeps,
): void {
  const answer = (result: DepositResult | { status: number; body: unknown }): void => {
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.body));
  };

  if (!deps.allowRequest()) {
    answer({ status: 429, body: { error: 'Too many bug reports. Try again in a minute.' } });
    return;
  }

  const chunks: Buffer[] = [];
  let bodySize = 0;
  req.on('data', (chunk: Buffer) => {
    bodySize += chunk.length;
    // Past the cap the bytes are dropped rather than buffered — the answer is already decided.
    if (bodySize <= MAX_BODY_BYTES) chunks.push(chunk);
  });
  req.on('end', () => {
    if (bodySize > MAX_BODY_BYTES) {
      answer({ status: 413, body: { error: 'Payload too large' } });
      return;
    }
    answer(depositBugReport(Buffer.concat(chunks).toString('utf8'), {
      enabled: deps.enabled,
      queueDir: deps.queueDir,
    }));
  });
}
