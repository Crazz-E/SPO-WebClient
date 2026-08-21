/**
 * Model-server log evidence.
 *
 * The only proof that a write reached the object rather than being reported confirmed and
 * discarded (OB-28). Civic RDO members log on entry, *before* their `try`, so a line in
 * FIVEMODELSERVER's Survival log means the frame arrived.
 *
 * Reading a log is not probing the server (CLAUDE.md) — it is an open IIS listing.
 *
 * Windowing is done by **byte offset**, not by timestamp: we record the log's length
 * before the write and read only what was appended after. That needs no knowledge of the
 * Delphi timestamp format and no assumption about the server's timezone.
 */

import { toErrorMessage } from '../shared/error-utils';
import { LIVE_LOG_BASE } from './config';

/** Markers proving a civic write entered its handler. doc/E2E-POLICY.md §5. */
export const LOG_MARKERS: Record<string, string> = {
  RDOSetTaxValue: 'Setting Tax value:',
  RDOSetMinSalaryValue: 'Setting Min Wage:',
  CacheTown: 'Caching Town..',
};

export interface LogWindow {
  /** Full URL of the log being watched. */
  url: string;
  /** Byte length at the moment the window opened. */
  offset: number;
  openedAt: string;
}

/** Newest `Survival <YY-MM-DD>.log` in the listing — avoids guessing the server's date. */
export async function findCurrentSurvivalLog(base: string = LIVE_LOG_BASE): Promise<string> {
  const listing = await fetchText(base);
  const names = new Set<string>();
  const pattern = /Survival[%20\s][\d-]+\.log/gi;
  for (const match of listing.matchAll(pattern)) names.add(match[0]);
  if (names.size === 0) {
    throw new Error(`No Survival log found in the listing at ${base}`);
  }
  // YY-MM-DD sorts lexicographically, so the last name is the newest day.
  const newest = Array.from(names).sort().pop() as string;
  return base + newest.replace(/\s/g, '%20');
}

/** Record where the log currently ends, before the write is issued. */
export async function openLogWindow(url: string): Promise<LogWindow> {
  return { url, offset: await logLength(url), openedAt: new Date().toISOString() };
}

/** Everything appended to the log since the window opened. */
export async function readSince(window: LogWindow): Promise<string> {
  const response = await fetch(window.url, { headers: { Range: `bytes=${window.offset}-` } });
  if (response.status === 416) return ''; // Nothing appended yet.
  if (!response.ok) {
    throw new Error(`Log read failed (${response.status}) for ${window.url}`);
  }
  const text = await response.text();
  // A server that ignores Range returns 200 and the whole file — slice it ourselves.
  return response.status === 206 ? text : text.slice(window.offset);
}

/**
 * Poll the log tail until `marker` appears or the deadline passes.
 * Returns the matching line, or null if it never arrived.
 */
export async function awaitMarker(
  window: LogWindow,
  marker: string,
  timeoutMs: number,
  pollMs = 2_000,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<string | null> {
  const deadline = now() + timeoutMs;
  for (;;) {
    const tail = await readSince(window);
    const line = tail.split(/\r?\n/).find(l => l.includes(marker));
    if (line) return line.trim();
    if (now() >= deadline) return null;
    await sleep(pollMs);
  }
}

async function logLength(url: string): Promise<number> {
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) {
    throw new Error(`Cannot read log length (${response.status}) for ${url}`);
  }
  const header = response.headers.get('content-length');
  const length = Number(header);
  if (header === null || !Number.isFinite(length)) {
    throw new Error(`Log at ${url} reported no usable content-length`);
  }
  return length;
}

async function fetchText(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (err: unknown) {
    // `new Error(msg, { cause })` needs lib ES2022; this tree targets ES2020, so the
    // cause is attached as a property instead. It is kept because the underlying network
    // error is what tells an operator whether the log host is down or merely slow.
    const wrapped = new Error(`Cannot reach the model-server logs at ${url}: ${toErrorMessage(err)}`);
    (wrapped as Error & { cause?: unknown }).cause = err;
    throw wrapped;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms).unref?.();
  });
}
