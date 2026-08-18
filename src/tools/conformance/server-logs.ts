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

/**
 * Lines that read like trouble. Surfaced, not judged — a human triages them.
 *
 * `malformed query` was ADDED on 2026-08-18, and its absence was a real hole,
 * not a detail: the plan asked to "promote the malformed-query signature from
 * displayed to fatal", and it turned out never to have been displayed at all.
 * The line carries none of the words this pattern looked for — no `error`, no
 * `exception`, no `fail` — so `Malformed query in TRDOQueryServer.ExecQuery`,
 * the line the shared Interface Server wrote on every connection for 75
 * minutes, went straight past. Promoting it from `anomalies` would have been a
 * no-op.
 */
const TROUBLE = /error|exception|access violation|malformed query|fail|timeout|survival|renewing/i;

export function troubleLines(lines: SurvivalLine[]): SurvivalLine[] {
  return lines.filter(l => TROUBLE.test(l.text) && !/^LOGON|^CheckUserAccount|^Account validation/i.test(l.text));
}

/**
 * The two signatures that are not "trouble" but PROOF — promoted from displayed
 * to fatal on 2026-08-18.
 *
 * Every other pattern in {@link TROUBLE} is ambiguous by design: `timeout`,
 * `renewing` and `fail` appear on a healthy busy server, so they are surfaced
 * for a human and never judged. These two are different in kind — they are what
 * a Delphi server writes when it has ALREADY been corrupted, and a run that
 * produced one has no business exiting 0:
 *
 *  - `Malformed query in TRDOQueryServer.ExecQuery` — the query dispatcher can
 *    no longer parse what it is given. On 2026-08-18 this line repeated on
 *    every connection, including the Model Server's own `RefreshArea` pushes,
 *    from the frame that corrupted the process onward
 *    (`FIVEINTERFACESERVER/Survival 26-08-18.log:136`).
 *  - `Access violation` — the process read or wrote memory it does not own. It
 *    is the direct symptom of the `"*"`-on-a-function mechanism: a result
 *    written through a register the dispatcher never set.
 *
 * They are matched inside OUR session bracket only. A pathology outside it is
 * someone else's, and attributing it to this run is the exact mistake the
 * pre-flight probe exists to avoid.
 */
export const FATAL_SIGNATURES: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: /Malformed query in TRDOQueryServer\.ExecQuery/i,
    why: 'the query dispatcher can no longer parse its input — the 2026-08-18 signature, which persisted on every connection',
  },
  {
    pattern: /Access violation/i,
    why: 'the process touched memory it does not own — the direct symptom of a result written through an unset register',
  },
];

/**
 * The lines that are proof rather than noise, with the reason each is fatal.
 *
 * Fed the bracket's RAW lines, deliberately — never the already-filtered
 * `anomalies`. Chaining the two would make this detector depend on
 * {@link TROUBLE} matching first, which is exactly how the malformed-query
 * signature stayed invisible until 2026-08-18. A fatal signature must be its
 * own oracle.
 */
export function fatalAnomalies(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    for (const { pattern, why } of FATAL_SIGNATURES) {
      if (pattern.test(line)) {
        out.push(`IS Survival, inside our session bracket: "${line.trim()}" — ${why}`);
        break;
      }
    }
  }
  return out;
}

// ── ISCnx — the only channel that sees an Interface Server freeze ──────────

/**
 * A hard freeze of the Interface Server writes **nothing**: no exception, no
 * `Start Disconnecting`, and — decisively — **no `Clients` row at all**. The
 * 2026-08-14 freeze ended `IS/Survival` on `LOGON SUCCESS: ClientViewId=7272232`
 * and the file simply stopped. `Clients exit code 0` therefore detects a freeze
 * only by the row's *absence*, never by its value.
 *
 * The one positive witness is **external**: the Model Server pushes
 * `ModelStatusChanged` to the IS twice per binary-backup cycle and logs each
 * unanswered push on its `<ISCnx>` channel. Those lines are the freeze detector.
 *
 * Three shapes, all in `MS/Survival`, and all carrying a **full date** — unlike
 * every other line of the file, which has only a clock. `parseSurvival` leaves
 * them with `at: null` for that reason, which is why they need their own parser.
 *
 *   2026-08-14 9:29:58 PM <ISCnx> (10)- Query timed out sel 6944144 call ModelStatusChanged "*" "#1"; Time: 10000
 *   2026-08-15 10:10:09 AM ISCnx Error writing to socket
 *   Start disconnecting: (ISCnx) 2026-08-15 10:10:09 AM
 *
 * Measured on the preserved corpus (`report/campaign/logs-cache/2026-08-17-preserve/MS`):
 *
 *   - **Specificity: 0 false positives.** 08-10, 08-11, 08-12, 08-13 and 08-16
 *     carry **0** ISCnx lines across ~151 probe cycles. 08-11 includes a 3 h
 *     *world* suspension with a continuous integrator counter and still logs
 *     zero — the channel reports IS liveness, not model health, so a simulation
 *     tick cannot trip it. 08-14 carries 8, 08-15 carries 29, 08-17 carries 4:
 *     every ISCnx line in the corpus belongs to a freeze.
 *   - **Sensitivity is delayed.** The probe is the backup cycle, whose observed
 *     interval is 2763–2798 s (median 2771, n=30 on 08-16), plus the 10 s query
 *     timeout the line itself reports (`Time: 10000`).
 *
 * So the oracle concludes only after ~47 min. A campaign wave lasting minutes
 * normally contains **zero** probes: silence at the end of a wave is not
 * evidence of health, only absence of evidence. `livenessConclusiveAt` says when
 * it becomes evidence.
 */
export const ISCNX_PROBE_INTERVAL_SEC = 2798;
export const ISCNX_QUERY_TIMEOUT_SEC = 10;
export const ISCNX_CONCLUSION_WINDOW_SEC = ISCNX_PROBE_INTERVAL_SEC + ISCNX_QUERY_TIMEOUT_SEC;

export type IsCnxKind = 'query-timeout' | 'write-error' | 'disconnect';

export interface IsCnxEvent {
  /** Seconds since server-local midnight, or null when the line carries no clock. */
  at: number | null;
  /** `YYYY-MM-DD` as the line itself states it — these lines are the only dated ones. */
  date: string | null;
  kind: IsCnxKind;
  raw: string;
}

const ISCNX_DATED = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM))\s+(.*)$/i;
const ISCNX_DISCONNECT = /^(?:Start|End) disconnecting:\s*\(ISCnx\)\s*(?:(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)))?/i;

/** Every `<ISCnx>` event in an MS Survival file, in file order. */
export function parseIsCnxEvents(text: string): IsCnxEvent[] {
  const events: IsCnxEvent[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.includes('ISCnx')) continue;

    const disconnect = ISCNX_DISCONNECT.exec(line);
    if (disconnect) {
      events.push({
        at: disconnect[2] ? parseClock(disconnect[2]) : null,
        date: disconnect[1] ?? null,
        kind: 'disconnect',
        raw: line,
      });
      continue;
    }

    const dated = ISCNX_DATED.exec(line);
    if (!dated) continue;
    const body = dated[3];
    const kind: IsCnxKind = /Query timed out/i.test(body) ? 'query-timeout'
      : /Error writing to socket/i.test(body) ? 'write-error'
      : 'query-timeout';
    events.push({ at: parseClock(dated[2]), date: dated[1], kind, raw: line });
  }
  return events;
}

/** The last clock seen in a Survival file — how far the log we read actually extends. */
export function lastStampOf(lines: SurvivalLine[]): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].at !== null) return lines[i].at;
  }
  return null;
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
  /**
   * `<ISCnx>` events in MS Survival covering our bracket and the conclusion
   * window after it. Non-empty means the Interface Server stopped answering the
   * Model Server — the freeze signature (O5).
   */
  isCnxEvents: Array<{ at: string | null; date: string | null; kind: IsCnxKind; raw: string }>;
  /**
   * Server clock at which the ISCnx oracle becomes conclusive for this session
   * (session end + one probe interval + the query timeout).
   */
  livenessConclusiveAt: string | null;
  /**
   * True only when the MS log we read already extends past
   * `livenessConclusiveAt`. False means "no freeze seen **yet**" — re-read the
   * log after that time before calling the session clean.
   */
  livenessConclusive: boolean;
  /** Other LOGON blocks of the same user that day (context: how many runs today). */
  otherSessionsToday: number;
  /** Non-empty when a hard pathology was found: exit code ≠ 0, missing bracket, heartbeat gap, ISCnx event. */
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
    isCnxEvents: [],
    livenessConclusiveAt: null,
    livenessConclusive: false,
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
  // Two signatures are proof, not noise: they fail the run (2026-08-18). Read
  // off the bracket's own lines, not off `anomalies` — see fatalAnomalies.
  failures.push(...fatalAnomalies(ours.lines.map(l => l.raw)));

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

  // O5 — the freeze oracle. An MS heartbeat gap is NOT it: the Model Server
  // keeps ticking happily while the Interface Server is frozen (2026-08-14, 34
  // unanswered pushes over 12 h with a nominal MS heartbeat throughout). Only
  // ISCnx sees the silence.
  const conclusiveAt = to + ISCNX_CONCLUSION_WINDOW_SEC;
  verdict.livenessConclusiveAt = formatClock(conclusiveAt);
  const lastMs = lastStampOf(ms);
  verdict.livenessConclusive = lastMs !== null && lastMs >= conclusiveAt;

  // Events are attributed from the session start (a freeze can only be caused by
  // a frame we already sent) to the end of the conclusion window.
  verdict.isCnxEvents = parseIsCnxEvents(logs.msSurvival)
    .filter(e => e.at === null || (e.at >= from && e.at <= conclusiveAt))
    .map(e => ({ at: e.at !== null ? formatClock(e.at) : null, date: e.date, kind: e.kind, raw: e.raw }));

  if (verdict.isCnxEvents.length) {
    failures.push(
      `MS <ISCnx> event(s) covering our session — the Interface Server stopped answering the Model ` +
      `Server, which is the freeze signature: ${verdict.isCnxEvents.map(e => `${e.kind} at ${e.at ?? '?'}`).join(', ')}`
    );
  }

  // `livenessConclusive: false` is deliberately NOT a failure. A run correlates
  // its logs seconds after logoff, so the probe that would reveal a freeze has
  // not fired yet — every live run would fail, and the git gate would never
  // open. It is an OPEN MEASUREMENT, not a verdict: reported loudly here and in
  // the report JSON, and re-read after `livenessConclusiveAt` by whoever closes
  // the wave. What the old O5 got wrong was calling that state "clean"; calling
  // it "failed" would be the mirror error.

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
    `[server-logs] O5 ISCnx (freeze oracle): ${v.isCnxEvents.length} event(s) · ` +
      `${v.livenessConclusive ? `conclusive (window closed ${v.livenessConclusiveAt})` : `INCONCLUSIVE until ${v.livenessConclusiveAt ?? '?'}`}` +
      `${v.isCnxEvents.length ? '\n' + v.isCnxEvents.map(e => `    ${e.raw}`).join('\n') : ''}`,
    `[server-logs] IS anomalies in bracket: ${v.anomalies.length}${v.anomalies.length ? '\n' + v.anomalies.map(a => `    ${a}`).join('\n') : ''}`,
  ];
  if (v.failures.length) lines.push(`[server-logs] FAILURES:\n${v.failures.map(f => `    ${f}`).join('\n')}`);
  return lines.join('\n');
}
