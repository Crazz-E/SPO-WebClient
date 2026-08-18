/**
 * The campaign emergency brake — `.rdo-live/HALT`.
 *
 * ## @deprecated 2026-08-18 — RETIRED CONCEPT, DO NOT BUILD ON IT
 *
 * The developer's ruling, 2026-08-18: **the HALT mechanism is obsolete as a
 * concept**, not merely in its automatic form. Withdrawing the automatic
 * trigger (see below) left a hand-written file that nobody writes, guarding a
 * campaign whose prevention had already moved elsewhere — the emission guard
 * (separator + arity + parameter types adjudicated per member) — and whose
 * detection had moved to the `ISCnx` oracle and the pre-flight liveness probe.
 * A brake that is never pulled is not a safety device; it is a runbook step
 * that will be wrong on the day it matters.
 *
 * The module is left **wired but frozen**: `run.ts` still calls
 * `readExistingHalt` before a live run, and `HaltRecord` still appears in
 * `types.ts`, `report.ts` and `runner.ts`. Unwiring it is a change with its own
 * tests and its own coverage, not a side effect of this note — it is filed in
 * `doc/BACKLOG-OPEN.md`. Until then the only expected state of `.rdo-live/HALT`
 * is **absent**.
 *
 * The history below is kept because the *reasons* the automatic trigger was
 * weak are the reasons the whole idea is weak. Read it before anyone proposes
 * a successor.
 *
 * A **manual** stop. When the file exists, no live run starts. Nothing in this
 * codebase writes it: a human does, deliberately, when they want every agent of
 * the campaign to stop touching the shared server.
 *
 * ## Why there is no automatic trigger — do not reintroduce one
 *
 * Until 2026-08-18 this module also armed itself: any RDO rejection at the
 * ceiling delay (`IS_PROXY_TIMEOUT_MS` = 180 s) wrote HALT and stopped the
 * campaign. **The developer withdrew that rule**, and the reasons it was weak
 * are worth keeping so the idea does not come back by good intentions:
 *
 * - **It was blind where it mattered most.** Login goes out under `DIRECTORY`
 *   (20 s) and `FAST` (60 s) — both below the ceiling, so neither could ever
 *   arm it — and login is exactly the phase of both observed production freezes
 *   (2026-08-14 and 2026-08-17).
 * - **It was blind to transport B.** A fire-and-forget frame arms no deadline at
 *   all, so a wave of `writeRdoFrame` pushes against a frozen server would have
 *   raised nothing (~30 rows of the coverage matrix are transport B).
 * - **It fired too late to prevent anything.** The frame that freezes the server
 *   has already left when its own timeout expires.
 * - **It would have stopped mostly on other people's incidents.** Two freezes in
 *   four days, neither caused by us, on a shared server.
 *
 * Prevention lives elsewhere and is a mechanism, not a timer: separator + arity
 * + parameter types adjudicated per member, compiled into the emission guard.
 * Detection and attribution live in the `ISCnx` oracle and the pre-wave liveness
 * probe. See `report/plan-campagne-live-rdo.md` §6.0.
 *
 * ## The file
 *
 * Hand-written, so treat its content as untrusted: any JSON object carrying an
 * `at` string is accepted, every other field is optional, and a file that will
 * not parse **still means stop**.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Bus root — repo root, deliberately NOT under `src/`: it must survive a session and stay inspectable. */
export const RDO_LIVE_DIR = '.rdo-live';
export const HALT_PATH = path.join(RDO_LIVE_DIR, 'HALT');

/**
 * What a HALT file may carry. Only `at` is required — the file is written by
 * hand, and refusing to stop because a field is missing would invert the point.
 */
export interface HaltRecord {
  /** UTC, ISO 8601. Server logs are read as UTC; a local stamp has already cost one investigation. */
  at: string;
  reason?: string;
  /** The frame that went unanswered, QueryId elided. */
  lastFrame?: string | null;
  member?: string | null;
  socket?: string | null;
  clientViewId?: string | null;
  /** Campaign wave the stop belongs to. */
  wave?: string | null;
  /** Where in the suite it happened (`suite/step`). */
  where?: string | null;
}

/** Filesystem seam, so the brake is testable without touching the disk. */
export interface HaltStore {
  exists(path: string): boolean;
  read(path: string): string;
}

export const defaultHaltStore: HaltStore = {
  exists: p => fs.existsSync(p),
  read: p => fs.readFileSync(p, 'utf-8'),
};

export function parseHalt(content: string): HaltRecord | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const at = (parsed as { at?: unknown }).at;
    return typeof at === 'string' ? (parsed as HaltRecord) : null;
  } catch {
    return null;
  }
}

/**
 * Protocol rule R3 — read HALT before any live action, without exception.
 * Returns the record when the campaign is stopped, null when it may proceed.
 *
 * An unparseable file is still a stop: someone wrote something there on purpose,
 * and guessing that they meant "carry on" is the one reading that can hurt.
 */
export function readExistingHalt(store: HaltStore = defaultHaltStore): HaltRecord | null {
  if (!store.exists(HALT_PATH)) return null;
  return parseHalt(store.read(HALT_PATH)) ?? {
    at: 'unknown',
    reason: `${HALT_PATH} exists but is not readable JSON — treated as a stop`,
  };
}

/** One line a human reads and acts on. */
export function formatHaltNotice(record: HaltRecord): string {
  return [
    `[HALT] campaign stopped — ${record.reason ?? 'no reason recorded'}`,
    `[HALT] at ${record.at} · ${record.where ?? 'unknown step'} · wave ${record.wave ?? 'unnamed'}`,
    `[HALT] frame: ${record.lastFrame ?? '(not recorded)'}`,
    `[HALT] socket ${record.socket ?? '?'} · ClientViewId ${record.clientViewId ?? '?'}`,
    `[HALT] ${HALT_PATH} is present. Clear it deliberately — it is a manual brake,`,
    '[HALT] so someone stopped this campaign on purpose.',
  ].join('\n');
}
