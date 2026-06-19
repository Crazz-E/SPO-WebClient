/**
 * Town Hall demographics parser.
 *
 * Turns the free-text status sections of a Town Hall's RefreshObject /
 * SwitchFocusEx ExtraInfo into a structured {@link TownHallDemographics} object.
 *
 * The Delphi server (TTownHall.GetStatusText in Kernel/Population.pas) emits the
 * three ":-:" status sections that the existing focus parser stores on
 * BuildingFocusInfo as `salesInfo` / `detailsText` / `hintsText`:
 *   - sttMain      -> "<total> inhabitants"                                 (salesInfo)
 *   - sttSecondary -> "<n> <Class> class (<p>% unemp), ..."                 (detailsText)
 *   - sttHint      -> concatenated per-class GetMoveReport(pkHigh/Middle/Low) (hintsText)
 *
 * Movement reports are concatenated with no separator on the wire, e.g.
 *   "No High class movements. 3 citizens of Middle class moved out last day.2% due to
 *    salaries and work conditions, 19% due to residential conditions, ...No Low class movements."
 * so this parser splits them apart on a zero-width boundary before each report start.
 *
 * This is parsing-only: it interprets a string already received and never builds
 * or modifies any RDO command.
 */

import type {
  TownHallDemographics,
  TownHallClassStat,
  TownHallMovement,
  TownHallMovementReason,
} from '../types';

/** Parse a localized integer like "18,372" into 18372. */
function parseLocaleInt(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10) || 0;
}

/** Matches each "<count> <Class> class (<pct>% unemp)" clause (sttSecondary). */
const CLASS_RE = /([\d,]+)\s+(High|Middle|Low) class\s+\((\d+)%\s+unemp\)/g;

/** Matches the total inhabitants figure (sttMain). */
const INHABITANTS_RE = /([\d,]+)\s+inhabitants/;

/**
 * Zero-width boundary before each per-class movement report. Used to split the
 * concatenated reports apart — on the wire they carry no separator.
 */
const REPORT_BOUNDARY =
  /(?=No (?:High|Middle|Low) class movements\.|\d[\d,]* citizens of (?:High|Middle|Low) class moved)/;

/** Parse the comma-separated "<pct>% due to <reason>" tail of a movement report. */
function parseMovementReasons(tail: string): TownHallMovementReason[] {
  const reasons: TownHallMovementReason[] = [];
  if (!tail) return reasons;
  for (const chunk of tail.split(/,\s*/)) {
    // "due to" is optional — immigration clauses can read "<pct>% to find job".
    const m = chunk.match(/(\d+)%\s+(?:due to\s+)?(.+?)\.?\s*$/);
    if (m) {
      const reason = m[2].trim();
      if (reason) reasons.push({ pct: parseInt(m[1], 10), reason });
    }
  }
  return reasons;
}

/** Parse the per-class citizen movement reports (sttHint). */
function parseMovements(hintsText: string): TownHallMovement[] {
  const movements: TownHallMovement[] = [];
  if (!hintsText) return movements;

  for (const report of hintsText.split(REPORT_BOUNDARY).map((r) => r.trim()).filter(Boolean)) {
    const none = report.match(/^No (High|Middle|Low) class movements\.?/);
    if (none) {
      movements.push({ className: none[1], direction: 'none', count: 0, reasons: [] });
      continue;
    }
    const moved = report.match(
      /^([\d,]+) citizens of (High|Middle|Low) class moved (in|out) last day\.?(.*)$/s,
    );
    if (moved) {
      movements.push({
        className: moved[2],
        direction: moved[3] === 'in' ? 'in' : 'out',
        count: parseLocaleInt(moved[1]),
        reasons: parseMovementReasons(moved[4]),
      });
    }
  }
  return movements;
}

/**
 * Parse Town Hall demographics from the three focus status sections.
 *
 * @returns the structured demographics, or `null` when the text carries no
 *   class breakdown (i.e. the focused building is not a Town Hall) — callers
 *   use this to leave non-Town-Hall buildings untouched.
 */
export function parseTownHallDemographics(fields: {
  salesInfo?: string;
  detailsText?: string;
  hintsText?: string;
}): TownHallDemographics | null {
  const salesInfo = fields.salesInfo ?? '';
  const detailsText = fields.detailsText ?? '';
  const hintsText = fields.hintsText ?? '';

  // Per-class breakdown lives in the secondary section. No matches => not a Town Hall.
  const classes: TownHallClassStat[] = [];
  for (const m of detailsText.matchAll(CLASS_RE)) {
    classes.push({
      className: m[2],
      population: parseLocaleInt(m[1]),
      populationLabel: m[1],
      unemploymentPct: parseInt(m[3], 10),
    });
  }
  if (classes.length === 0) return null;

  // Total inhabitants (main section); the trailing ':' artifact is harmless here.
  const inhab = INHABITANTS_RE.exec(salesInfo) ?? INHABITANTS_RE.exec(detailsText);
  const totalInhabitants = inhab ? parseLocaleInt(inhab[1]) : 0;
  const totalInhabitantsLabel = inhab ? inhab[1] : '0';

  return {
    totalInhabitants,
    totalInhabitantsLabel,
    classes,
    movements: parseMovements(hintsText),
  };
}
