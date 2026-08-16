/**
 * Server-log correlation — the second evidence stream of a live run.
 *
 * The Delphi servers publish their logs over plain HTTP
 * (`http://158.69.153.134/logs/<SERVER>/<Category> YY-MM-DD.log`,
 * doc/E2E-LIVE-CAMPAIGN.md §2.2). Three of them bracket ONE of our sessions
 * with certainty and say whether the server suffered while we were there:
 *
 *   IS `Survival`  — LOGON trace: `LOGON ATTEMPT: User=<tycoon>` …
 *                    `LOGON SUCCESS: ClientViewId=<id>` … `Start Disconnecting <tycoon>`.
 *                    `ClientViewId` is the object id our own `Logon` returned —
 *                    the join key, exact, not time-based.
 *   IS `Clients`   — one TSV row per session: tycoon ⇥ IP ⇥ login ⇥ logout ⇥ exit code
 *                    (0 = clean).
 *   MS `Survival`  — simulation heartbeat every ~15 s; a gap while we were
 *                    logged in is the distress signal.
 *
 * Timestamps are server-local, 12-hour, 1 s precision, no date (the file name
 * carries it). Observed 2026-08-16: server clock ≈ UTC; the offset is measured
 * per run from the LOGON SUCCESS line, never assumed.
 *
 * Fetching is injected so the parsers and the verdict are testable offline
 * against real sampled lines.
 */

import * as http from 'http';

export const DEFAULT_LOG_BASE = 'http://158.69.153.134/logs';

export type LogServer = 'FIVEINTERFACESERVER' | 'FIVEMODELSERVER' | 'FIVECACHESERVER' | 'FIVEMAILSERVER';

/** `YY-MM-DD` of a UTC instant — the server's file-name date (server clock ≈ UTC). */
export function logDateOf(at: Date): string {
  const y = String(at.getUTCFullYear()).slice(2);
  const m = String(at.getUTCMonth() + 1).padStart(2, '0');
  const d = String(at.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function logUrl(base: string, server: LogServer, category: string, date: string): string {
  return `${base.replace(/\/$/, '')}/${server}/${encodeURIComponent(`${category} ${date}.log`)}`;
}

/** Plain-HTTP GET. The endpoint has no TLS; WebFetch-style upgrades fail. */
export function fetchText(url: string, timeoutMs = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`GET ${url} → HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('latin1')));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`GET ${url} timed out`)));
    req.on('error', reject);
  });
}

// ── Parsing ────────────────────────────────────────────────────────────────

/** `H:MM:SS AM` → seconds since local midnight. Tolerates a missing space after AM/PM. */
export function parseClock(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i.exec(text.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (m[4].toUpperCase() === 'PM') h += 12;
  return h * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
}

/** Seconds since UTC midnight of an instant. */
export function utcSecondsOfDay(at: Date): number {
  return at.getUTCHours() * 3600 + at.getUTCMinutes() * 60 + at.getUTCSeconds();
}

export function formatClock(sec: number): string {
  const s = ((sec % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')} ${ampm}`;
}

export interface SurvivalLine {
  /** Seconds since server-local midnight, or null when the line carries no clock. */
  at: number | null;
  text: string;
  raw: string;
}

/** IS / MS `Survival`: `H:MM:SS AM - msg` or `H:MM:SS AM msg` (or `H:MM:SS PMmsg`). */
export function parseSurvival(text: string): SurvivalLine[] {
  return text.split(/\r?\n/).filter(l => l.length > 0).map(raw => {
    const m = /^(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM))\s*(?:-\s*)?(.*)$/i.exec(raw);
    if (!m) return { at: null, text: raw.trim(), raw };
    return { at: parseClock(m[1]), text: m[2].trim(), raw };
  });
}

export interface ClientsRow {
  tycoon: string;
  ip: string;
  login: number | null;
  logout: number | null;
  exitCode: number;
  raw: string;
}

/** IS `Clients`: `tycoon ⇥ IP ⇥ login ⇥ logout ⇥ exit-code`. */
export function parseClients(text: string): ClientsRow[] {
  const rows: ClientsRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const cols = raw.split('\t');
    if (cols.length < 5) continue;
    rows.push({
      tycoon: cols[0].trim(), ip: cols[1].trim(),
      login: parseClock(cols[2]), logout: parseClock(cols[3]),
      exitCode: parseInt(cols[4], 10), raw,
    });
  }
  return rows;
}

export interface LogonBlock {
  attemptAt: number | null;
  successAt: number | null;
  clientViewId: string | null;
  ip: string | null;
  disconnectAt: number | null;
  /** Every line from ATTEMPT to the disconnect trace (inclusive). */
  lines: SurvivalLine[];
}

/**
 * Slice the IS Survival log into one block per LOGON ATTEMPT of `user`,
 * ending at that user's `Start Disconnecting` (or the next attempt / EOF).
 */
export function findLogonBlocks(lines: SurvivalLine[], user: string): LogonBlock[] {
  const blocks: LogonBlock[] = [];
  const attempt = new RegExp(`^LOGON ATTEMPT: User=${escapeRe(user)}\\s*$`, 'i');
  const success = /^LOGON SUCCESS: ClientViewId=(\d+)/i;
  const ipLine = new RegExp(`^${escapeRe(user)}\\.IP = (\\S+)`, 'i');
  const disconnect = new RegExp(`^Start Disconnecting ${escapeRe(user)}\\s*$`, 'i');

  let current: LogonBlock | null = null;
  for (const line of lines) {
    if (attempt.test(line.text)) {
      current = { attemptAt: line.at, successAt: null, clientViewId: null, ip: null, disconnectAt: null, lines: [line] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
    const s = success.exec(line.text);
    if (s && current.successAt === null) { current.successAt = line.at; current.clientViewId = s[1]; continue; }
    const ip = ipLine.exec(line.text);
    if (ip) { current.ip = ip[1]; continue; }
    if (disconnect.test(line.text)) { current.disconnectAt = line.at; current = null; }
  }
  return blocks;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lines that read like trouble. Surfaced, not judged — a human triages them. */
const TROUBLE = /error|exception|access violation|fail|timeout|survival|renewing/i;

export function troubleLines(lines: SurvivalLine[]): SurvivalLine[] {
  return lines.filter(l => TROUBLE.test(l.text) && !/^LOGON|^CheckUserAccount|^Account validation/i.test(l.text));
}

/** Heartbeat gaps in MS Survival strictly inside [from, to] (server seconds). */
export function heartbeatGaps(msLines: SurvivalLine[], from: number, to: number, maxGapSec = 45): Array<{ from: number; to: number; gapSec: number }> {
  // Look a while around the window: the gap that matters may start before it and end after it.
  const stamps = msLines.map(l => l.at).filter((a): a is number => a !== null && a >= from - 600 && a <= to + 600);
  const gaps: Array<{ from: number; to: number; gapSec: number }> = [];
  for (let i = 1; i < stamps.length; i++) {
    const gap = stamps[i] - stamps[i - 1];
    if (gap > maxGapSec && stamps[i] >= from && stamps[i - 1] <= to) gaps.push({ from: stamps[i - 1], to: stamps[i], gapSec: gap });
  }
  return gaps;
}

// ── Verdict ────────────────────────────────────────────────────────────────

export interface SessionFacts {
  username: string;
  /** The ClientViewId our `Logon` returned. */
  clientViewId: string;
  /** UTC instant at which `Logon` was answered. */
  loginAt: Date;
  /** UTC instant at which the session was closed. */
  logoffAt: Date;
}

export interface ServerLogVerdict {
  /** LOGON block whose ClientViewId equals ours — the join. */
  bracketFound: boolean;
  serverLoginAt: string | null;
  serverDisconnectAt: string | null;
  serverIp: string | null;
  /** serverLoginSec − ourLoginSec, in seconds; null when no bracket. */
  clockOffsetSec: number | null;
  clientsRow: { login: string | null; logout: string | null; exitCode: number } | null;
  /** IS Survival lines inside our bracket that read like trouble. */
  anomalies: string[];
  heartbeatGaps: Array<{ from: string; to: string; gapSec: number }>;
  /** Other LOGON blocks of the same user that day (context: how many runs today). */
  otherSessionsToday: number;
  /** Non-empty when a hard pathology was found: exit code ≠ 0, missing bracket, heartbeat gap. */
  failures: string[];
}

export interface DayLogs {
  isSurvival: string;
  isClients: string;
  msSurvival: string;
}

export function correlateSession(facts: SessionFacts, logs: DayLogs): ServerLogVerdict {
  const is = parseSurvival(logs.isSurvival);
  const ms = parseSurvival(logs.msSurvival);
  const blocks = findLogonBlocks(is, facts.username);
  const ours = blocks.find(b => b.clientViewId === facts.clientViewId) ?? null;
  const failures: string[] = [];

  const verdict: ServerLogVerdict = {
    bracketFound: ours !== null,
    serverLoginAt: ours?.successAt != null ? formatClock(ours.successAt) : null,
    serverDisconnectAt: ours?.disconnectAt != null ? formatClock(ours.disconnectAt) : null,
    serverIp: ours?.ip ?? null,
    clockOffsetSec: null,
    clientsRow: null,
    anomalies: [],
    heartbeatGaps: [],
    otherSessionsToday: blocks.filter(b => b !== ours).length,
    failures,
  };

  if (!ours) {
    failures.push(`no LOGON SUCCESS block with ClientViewId=${facts.clientViewId} for ${facts.username} in IS Survival`);
    return verdict;
  }

  const ourLoginSec = utcSecondsOfDay(facts.loginAt);
  if (ours.successAt !== null) verdict.clockOffsetSec = ours.successAt - ourLoginSec;

  const from = ours.successAt ?? ours.attemptAt ?? ourLoginSec;
  const to = ours.disconnectAt ?? (utcSecondsOfDay(facts.logoffAt) + (verdict.clockOffsetSec ?? 0));

  verdict.anomalies = troubleLines(ours.lines).map(l => l.raw);

  // The Clients row is written at logout; match on tycoon + login time (±2 s).
  const rows = parseClients(logs.isClients).filter(r => r.tycoon.toLowerCase() === facts.username.toLowerCase());
  const row = rows.find(r => r.login !== null && Math.abs(r.login - from) <= 2) ?? null;
  if (row) {
    verdict.clientsRow = { login: row.login != null ? formatClock(row.login) : null, logout: row.logout != null ? formatClock(row.logout) : null, exitCode: row.exitCode };
    if (row.exitCode !== 0) failures.push(`Clients exit code ${row.exitCode} (expected 0)`);
  } else {
    failures.push(`no Clients row for ${facts.username} at ${formatClock(from)} (±2 s) — logout not recorded yet, or abnormal end`);
  }

  verdict.heartbeatGaps = heartbeatGaps(ms, from, to).map(g => ({ from: formatClock(g.from), to: formatClock(g.to), gapSec: g.gapSec }));
  if (verdict.heartbeatGaps.length) failures.push(`MS Survival heartbeat gap(s) during our session: ${verdict.heartbeatGaps.map(g => `${g.gapSec}s at ${g.from}`).join(', ')}`);

  return verdict;
}

/** Fetch the day's three files (plus the next day's when the session crossed midnight). */
export async function fetchDayLogs(base: string, facts: Pick<SessionFacts, 'loginAt' | 'logoffAt'>, fetch: (url: string) => Promise<string> = fetchText): Promise<DayLogs> {
  const dates = [...new Set([logDateOf(facts.loginAt), logDateOf(facts.logoffAt)])];
  const get = async (server: LogServer, category: string): Promise<string> => {
    const parts: string[] = [];
    for (const d of dates) parts.push(await fetch(logUrl(base, server, category, d)));
    return parts.join('\n');
  };
  const [isSurvival, isClients, msSurvival] = await Promise.all([
    get('FIVEINTERFACESERVER', 'Survival'),
    get('FIVEINTERFACESERVER', 'Clients'),
    get('FIVEMODELSERVER', 'Survival'),
  ]);
  return { isSurvival, isClients, msSurvival };
}

export function formatServerLogVerdict(v: ServerLogVerdict): string {
  const lines = [
    `[server-logs] bracket: ${v.bracketFound ? `found — LOGON SUCCESS ${v.serverLoginAt}, disconnect ${v.serverDisconnectAt ?? '?'}, IP ${v.serverIp ?? '?'}` : 'NOT FOUND'}`,
    `[server-logs] clock offset (server − ours): ${v.clockOffsetSec ?? '?'} s · other ${v.otherSessionsToday} session(s) of this user today`,
    `[server-logs] Clients row: ${v.clientsRow ? `${v.clientsRow.login} → ${v.clientsRow.logout}, exit code ${v.clientsRow.exitCode}` : 'none'}`,
    `[server-logs] MS heartbeat gaps in bracket: ${v.heartbeatGaps.length}`,
    `[server-logs] IS anomalies in bracket: ${v.anomalies.length}${v.anomalies.length ? '\n' + v.anomalies.map(a => `    ${a}`).join('\n') : ''}`,
  ];
  if (v.failures.length) lines.push(`[server-logs] FAILURES:\n${v.failures.map(f => `    ${f}`).join('\n')}`);
  return lines.join('\n');
}
