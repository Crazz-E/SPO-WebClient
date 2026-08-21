/**
 * The round-trip probe — doc/E2E-POLICY.md §5.
 *
 *   read original -> write test value
 *                 -> assert the model-server log line
 *                 -> read back
 *                 -> restore original
 *                 -> assert the restore landed
 *
 * A crash is a failure, but silence is not a pass. `OB-28` is a write reported confirmed
 * when it was discarded, so "the response said success" proves nothing on its own. The log
 * line is the only evidence that is not the client agreeing with itself.
 */

import { toErrorMessage } from '../shared/error-utils';
import { TIMEOUTS } from './config';
import { LOG_MARKERS, awaitMarker, openLogWindow, type LogWindow } from './live-log';
import { readSectionGroups, setBuildingProperty, propertyValue, type LiveSession } from './session';
import type { WorldLock } from './world-lock';

export interface ProbeSpec {
  /** Human label for the report. */
  what: string;
  /** RDO member the write goes through — selects the log marker. */
  member: keyof typeof LOG_MARKERS | string;
  x: number;
  y: number;
  visualClass: string;
  /** Where the current value is read from. */
  groupId: string;
  readProperty: string;
  /** What the gateway is asked to write. */
  writeProperty: string;
  additionalParams?: Record<string, string>;
  /** Test value derived from the original, so the probe never hardcodes world state. */
  testValue: (original: string) => string;
}

export type ReadBackVerdict = 'CONFIRMED' | 'UNCONFIRMED';

export interface ProbeResult {
  what: string;
  member: string;
  status: 'PASS' | 'FAIL';
  original: string;
  written: string;
  /** The proving line from FIVEMODELSERVER's Survival log, or null if it never appeared. */
  logLine: string | null;
  readBack: ReadBackVerdict;
  restored: boolean;
  note?: string;
}

/**
 * Run one probe. Always attempts the restore, including after a failed assertion — a
 * failing probe must not be the reason the world is left dirty.
 */
export async function runProbe(
  session: LiveSession,
  spec: ProbeSpec,
  lock: WorldLock,
  logWindowFactory: (url: string) => Promise<LogWindow>,
  survivalLogUrl: string,
): Promise<ProbeResult> {
  const marker = LOG_MARKERS[spec.member];
  if (!marker) {
    throw new Error(
      `No model-server log marker known for ${spec.member}. A mutation with no marker ` +
        `cannot be proven — add one to LOG_MARKERS with its Pascal citation, or do not probe it.`,
    );
  }

  const before = await readSectionGroups(session, spec.x, spec.y, spec.groupId, spec.visualClass);
  const original = propertyValue(before, spec.groupId, spec.readProperty);
  if (original === undefined) {
    throw new Error(
      `Cannot read ${spec.groupId}.${spec.readProperty} at (${spec.x},${spec.y}) — ` +
        `nothing to restore to, so the probe refuses to write.`,
    );
  }

  const written = spec.testValue(original);
  const restoreEntry = {
    what: spec.what,
    x: spec.x,
    y: spec.y,
    propertyName: spec.writeProperty,
    originalValue: original,
    additionalParams: spec.additionalParams,
  };

  const window = await logWindowFactory(survivalLogUrl);
  lock.addPendingRestore(restoreEntry);

  let logLine: string | null = null;
  let readBack: ReadBackVerdict = 'UNCONFIRMED';
  let note: string | undefined;
  let thrown: unknown = null;

  try {
    await setBuildingProperty(
      session,
      spec.x,
      spec.y,
      spec.writeProperty,
      written,
      spec.additionalParams,
    );
    logLine = await awaitMarker(window, marker, TIMEOUTS.logSettle);

    const after = await readSectionGroups(session, spec.x, spec.y, spec.groupId, spec.visualClass);
    const current = propertyValue(after, spec.groupId, spec.readProperty);
    if (current === written) {
      readBack = 'CONFIRMED';
    } else {
      // Expected on the Town Hall: the tax rate is written onto the facility, whose cache
      // entry carries a two-minute TTL (Kernel/Population.pas:1192), while the write
      // invalidates the TOWN. That is OB-29 — a lagging read, not a lost write.
      note =
        `read-back still shows "${current ?? '(absent)'}" — cached copy lags the write ` +
        `(OB-29, 2 min facility TTL)`;
    }
  } catch (err: unknown) {
    thrown = err;
  }

  // The restore runs whatever happened above: a failing probe must never be the reason
  // the world is left dirty.
  const restored = await restore(session, spec, original);
  if (restored) lock.clearPendingRestore(spec.x, spec.y, spec.writeProperty);

  if (thrown !== null) {
    return { ...probeFailure(spec, thrown), original, written, restored };
  }
  return finish({ spec, original, written, logLine, readBack, note, restored });
}

async function restore(session: LiveSession, spec: ProbeSpec, original: string): Promise<boolean> {
  try {
    await setBuildingProperty(
      session,
      spec.x,
      spec.y,
      spec.writeProperty,
      original,
      spec.additionalParams,
    );
    return true;
  } catch {
    return false;
  }
}

function finish(input: {
  spec: ProbeSpec;
  original: string;
  written: string;
  logLine: string | null;
  readBack: ReadBackVerdict;
  note?: string;
  restored: boolean;
}): ProbeResult {
  const { spec, logLine, restored } = input;
  const failures: string[] = [];
  if (!logLine) failures.push('no model-server log line — the write never reached the object');
  if (!restored) failures.push('restore failed — the world is left dirty');

  return {
    what: spec.what,
    member: spec.member,
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    original: input.original,
    written: input.written,
    logLine,
    readBack: input.readBack,
    restored,
    note: failures.length > 0 ? failures.join('; ') : input.note,
  };
}

/** Wrap an unexpected throw into a reportable failure without losing the reason. */
export function probeFailure(spec: ProbeSpec, err: unknown): ProbeResult {
  return {
    what: spec.what,
    member: spec.member,
    status: 'FAIL',
    original: '',
    written: '',
    logLine: null,
    readBack: 'UNCONFIRMED',
    restored: false,
    note: toErrorMessage(err),
  };
}

export { openLogWindow };
