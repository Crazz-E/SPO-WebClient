/**
 * Assembling a `BugReport` and depositing it.
 *
 * Deliberately thin. The one thing worth saying about it is `createdAtUtc`: UTC to the
 * millisecond is the key that lets a triage session grep
 * `FIVEMODELSERVER/Survival <date>.log` at http://158.69.153.134/logs/ and prove whether the
 * frame reached the object server-side. Without it triage can only guess.
 *
 * What this module does NOT do is correlate element → store → message. That is expensive and
 * brittle here; the triage session does it better by reading `src/client/handlers/` and
 * `src/client/store/` against the verbatim journal.
 */

import {
  BUG_REPORT_SCHEMA_VERSION,
  computeAnchorKey,
  type BugReport,
  type BugReportKind,
  type BugReportProfile,
  type GeometryCapture,
  type MobileQuickPick,
  type ReportAnchor,
} from '../../shared/bug-report-schema';
import { reportJournal } from './journal';

export const BUG_REPORT_ENDPOINT = '/api/bug-report';

export interface ReportDraft {
  profile: BugReportProfile;
  kind: BugReportKind;
  anchor: ReportAnchor;
  username: string;
  world: string;
  observed?: string;
  expected?: string;
  quickPicks?: MobileQuickPick[];
  freeText?: string;
  geometry?: GeometryCapture;
}

/** Drop the keys the schema would rather not see at all than see empty. */
function withoutEmpty<T extends Record<string, unknown>>(value: T): T {
  const out = {} as Record<string, unknown>;
  for (const [key, v] of Object.entries(value)) {
    if (v !== undefined && v !== '') out[key] = v;
  }
  return out as T;
}

/** A complete report, ready to POST. Split out so tests can assert on it without a fetch. */
export function buildReport(draft: ReportDraft): BugReport {
  const viewport = typeof window === 'undefined'
    ? { width: 0, height: 0 }
    : { width: window.innerWidth, height: window.innerHeight };

  return withoutEmpty({
    version: BUG_REPORT_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    profile: draft.profile,
    kind: draft.kind,
    createdAtUtc: new Date().toISOString(),
    username: draft.username,
    world: draft.world,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    viewport,
    anchor: draft.anchor,
    anchorKey: computeAnchorKey(draft.anchor),
    observed: draft.observed,
    expected: draft.expected,
    quickPicks: draft.quickPicks,
    freeText: draft.freeText,
    geometry: draft.geometry,
    journal: reportJournal.snapshot(),
  }) as BugReport;
}

export interface SubmitOutcome {
  ok: boolean;
  /** The queue filename on success, the gateway's reason on failure. */
  detail: string;
}

/** POST the report. Never throws — the caller surfaces the outcome as a toast. */
export async function submitReport(draft: ReportDraft): Promise<SubmitOutcome> {
  const report = buildReport(draft);
  try {
    const response = await fetch(BUG_REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    const body = (await response.json().catch(() => ({}))) as { file?: string; error?: string };
    return response.ok
      ? { ok: true, detail: body.file ?? report.id }
      : { ok: false, detail: body.error ?? `HTTP ${response.status}` };
  } catch (err: unknown) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
