/**
 * The pull half of the human-first bug-report intake pipeline: a dev machine (SPO-Pipeline's
 * orchestrator, which has the initiative — this box is not reachable from outside) periodically
 * fetches queued reports over HTTPS instead of production pushing them anywhere.
 *
 * Three routes, gated by a shared bearer token (SPO_REPORT_PULL_TOKEN) — deliberately NOT gated
 * by SPO_BUG_REPORT: capture and export are different exposures, and draining an already-queued
 * report should still be possible with capture turned off.
 *
 *   GET  /api/report-pull/list                 -> {ok:true, reports:[{file, bytes, sha256}]}
 *   GET  /api/report-pull/fetch?file=<name>     -> raw bytes, Content-Type: application/json,
 *                                                   header X-SPO-Report-Sha256
 *   POST /api/report-pull/ack  {file, sha256}   -> {ok:true} — moves the file into <queueDir>/
 *                                                   pulled/ with a one-line disposition sidecar,
 *                                                   same convention the pipeline itself uses for
 *                                                   its own archive/. {ok:true, already:true} if
 *                                                   the file is already in pulled/ (idempotent —
 *                                                   the caller may have missed the first 200).
 *
 * No route in this file ever parses report CONTENT — list stats and hashes, fetch streams bytes,
 * ack moves a file by name. Schema knowledge stays in bug-report-schema.ts, read only by whoever
 * eventually opens the bytes (SPO-Pipeline's `npm run report:card`, on the OTHER end of the pull).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { toErrorMessage } from '../shared/error-utils';

/** The exact shape depositBugReport's own fileStamp() produces — see bug-report-endpoint.ts. */
const REPORT_FILENAME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_(desktop|mobile)_[0-9a-f]+\.json$/;

/** At most this many entries in one `list` reply — a pull cycle is bounded either way. */
const MAX_LIST_ENTRIES = 50;

/** How long a report sits in pulled/ before the retention sweep removes it — a safety net for
 * a dev-side ack that lands but is somehow never actually processed, not a promise of storage. */
const DEFAULT_RETENTION_DAYS = 7;

export interface ReportListEntry {
  file: string;
  bytes: number;
  sha256: string;
}

function isSafeReportFilename(name: string): boolean {
  return REPORT_FILENAME_RE.test(name);
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Constant-time-ish token compare: same-length buffers only reach timingSafeEqual (which throws
 * on a length mismatch), so a wrong-length guess is rejected the same way a same-length wrong
 * guess is — neither branch leaks length via a thrown exception reaching the caller.
 */
export function tokenMatches(presented: string | undefined, expected: string | null): boolean {
  if (!expected || expected.length < 32) return false; // unset/short token: pull stays off
  if (!presented) return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** list — stat + hash every top-level *.json report filename, oldest-looking first (lexical —
 * same "the timestamp prefix IS chronological order" fact the pipeline itself already relies on). */
export function listReports(queueDir: string): { status: 200; body: { ok: true; reports: ReportListEntry[] } } {
  let names: string[];
  try {
    names = fs
      .readdirSync(queueDir, { withFileTypes: true })
      .filter((d) => d.isFile() && isSafeReportFilename(d.name))
      .map((d) => d.name)
      .sort();
  } catch {
    names = []; // missing queueDir is an empty queue, not an error — same rule the local scan uses
  }

  const reports: ReportListEntry[] = [];
  for (const file of names.slice(0, MAX_LIST_ENTRIES)) {
    try {
      const buf = fs.readFileSync(path.join(queueDir, file));
      reports.push({ file, bytes: buf.length, sha256: sha256Hex(buf) });
    } catch {
      // Vanished between readdir and read (e.g. concurrently acked) — just not listed this time.
    }
  }
  return { status: 200, body: { ok: true, reports } };
}

/** fetch — validated filename only, raw bytes back. Never trusts a caller-supplied path. */
export function fetchReport(
  queueDir: string,
  file: string | null,
): { status: 200; body: Buffer; sha256: string } | { status: 400 | 404; body: { error: string } } {
  if (!file || !isSafeReportFilename(file)) {
    return { status: 400, body: { error: 'file must be a valid report filename' } };
  }
  const full = path.join(queueDir, file);
  let buf: Buffer;
  try {
    buf = fs.readFileSync(full);
  } catch {
    return { status: 404, body: { error: 'Not found' } };
  }
  return { status: 200, body: buf, sha256: sha256Hex(buf) };
}

function pulledDisposition(file: string, peerIp: string, now: Date): string {
  return `pulled: ${now.toISOString()} — ${peerIp}\n`;
}

/** Deletes pulled/ entries (and their sidecars) older than retentionDays — run inline on every
 * ack, no separate cron: the same "no second moving part" reasoning the pipeline's own
 * moveReportTo call sites already follow. Never throws — a sweep failure must not fail the ack
 * that triggered it. */
function sweepPulled(pulledDir: string, retentionDays: number, now: Date): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(pulledDir).filter((f) => f.endsWith('.json'));
  } catch {
    return;
  }
  const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  for (const file of entries) {
    const full = path.join(pulledDir, file);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoffMs) {
        fs.rmSync(full, { force: true });
        fs.rmSync(`${full}.disposition.txt`, { force: true });
      }
    } catch {
      // one bad entry must not stop the sweep over the rest
    }
  }
}

/** ack — moves the acknowledged file into <queueDir>/pulled/, writes the disposition sidecar,
 * sweeps old pulled/ entries. Idempotent: a file already in pulled/ answers {already:true}
 * rather than erroring, since the caller may be retrying after missing the first 200. */
export function ackReport(
  queueDir: string,
  file: string | null,
  sha256: string | null,
  opts: { peerIp: string; now?: Date; retentionDays?: number },
): { status: 200; body: { ok: true; already?: true } } | { status: 400 | 404 | 409; body: { error: string } } {
  if (!file || !isSafeReportFilename(file)) {
    return { status: 400, body: { error: 'file must be a valid report filename' } };
  }
  const now = opts.now ?? new Date();
  const pulledDir = path.join(queueDir, 'pulled');
  const pulledFull = path.join(pulledDir, file);

  if (fs.existsSync(pulledFull)) {
    return { status: 200, body: { ok: true, already: true } };
  }

  const full = path.join(queueDir, file);
  let buf: Buffer;
  try {
    buf = fs.readFileSync(full);
  } catch {
    return { status: 404, body: { error: 'Not found' } };
  }

  if (sha256 && sha256Hex(buf) !== sha256) {
    return { status: 409, body: { error: 'sha256 mismatch — the file changed since it was fetched' } };
  }

  try {
    fs.mkdirSync(pulledDir, { recursive: true });
    fs.renameSync(full, pulledFull);
    fs.writeFileSync(`${pulledFull}.disposition.txt`, pulledDisposition(file, opts.peerIp, now));
  } catch (err: unknown) {
    return { status: 400, body: { error: `Could not move the report: ${toErrorMessage(err)}` } };
  }

  sweepPulled(pulledDir, opts.retentionDays ?? DEFAULT_RETENTION_DAYS, now);
  return { status: 200, body: { ok: true } };
}

// ---- transport ----------------------------------------------------------------------------

export interface ReportPullRequest {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
  on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
}

export interface ReportPullResponse {
  writeHead(status: number, headers: Record<string, string>): unknown;
  end(body?: string | Buffer): unknown;
}

export interface ReportPullDeps {
  /** null/short (<32 chars) disables the whole surface — every route answers 404. */
  token: string | null;
  queueDir: string;
  peerIp: string;
  now?: Date;
  retentionDays?: number;
  /** `false` means the caller is over its allowance; the answer is 429, checked BEFORE auth
   * (same ordering handleBugReportRequest already uses) so a rate-limited caller never even
   * exercises the token compare. Defaults to always-allowed — server.ts is the only real
   * caller and always supplies this; tests may omit it. */
  allowRequest?: () => boolean;
}

function rateLimitedOr429(deps: ReportPullDeps, res: ReportPullResponse): boolean {
  if (deps.allowRequest && !deps.allowRequest()) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too many requests. Try again in a minute.' }));
    return true;
  }
  return false;
}

function authOr404(req: ReportPullRequest, deps: ReportPullDeps, res: ReportPullResponse): boolean {
  const header = req.headers.authorization;
  const presented = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!tokenMatches(presented, deps.token)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return false;
  }
  return true;
}

/** GET /api/report-pull/list */
export function handleReportPullList(req: ReportPullRequest, res: ReportPullResponse, deps: ReportPullDeps): void {
  if (rateLimitedOr429(deps, res)) return;
  if (!authOr404(req, deps, res)) return;
  const result = listReports(deps.queueDir);
  res.writeHead(result.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result.body));
}

/** GET /api/report-pull/fetch?file=<name> */
export function handleReportPullFetch(req: ReportPullRequest, res: ReportPullResponse, deps: ReportPullDeps): void {
  if (rateLimitedOr429(deps, res)) return;
  if (!authOr404(req, deps, res)) return;
  const file = new URL(req.url ?? '', 'http://internal').searchParams.get('file');
  const result = fetchReport(deps.queueDir, file);
  if (result.status !== 200) {
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.body));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'X-SPO-Report-Sha256': result.sha256 });
  res.end(result.body);
}

/** POST /api/report-pull/ack  body: {file, sha256} */
export function handleReportPullAck(req: ReportPullRequest, res: ReportPullResponse, deps: ReportPullDeps): void {
  if (rateLimitedOr429(deps, res)) return;
  if (!authOr404(req, deps, res)) return;

  const chunks: Buffer[] = [];
  let bodySize = 0;
  const MAX_ACK_BODY = 4096; // {file, sha256} never needs more; drop the excess, same as the deposit route
  req.on('data', (chunk: Buffer) => {
    bodySize += chunk.length;
    if (bodySize <= MAX_ACK_BODY) chunks.push(chunk);
  });
  req.on('end', () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }
    const body = parsed as { file?: unknown; sha256?: unknown };
    const file = typeof body.file === 'string' ? body.file : null;
    const sha256 = typeof body.sha256 === 'string' ? body.sha256 : null;
    const result = ackReport(deps.queueDir, file, sha256, {
      peerIp: deps.peerIp,
      now: deps.now,
      retentionDays: deps.retentionDays,
    });
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.body));
  });
}

export { isSafeReportFilename };
