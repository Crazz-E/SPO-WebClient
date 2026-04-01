/**
 * QuickStats — Revenue/sales summary bar at top of building inspector.
 */

import type { BuildingFocusInfo } from '@/shared/types';
import { ProgressBar, MiniBar } from '../common';
import { parseSalesLines, salesVariant } from './StatusOverlay';
import styles from './QuickStats.module.css';

interface QuickStatsProps {
  focus: BuildingFocusInfo;
}

/** Parse "X% completed." pattern from salesInfo. Returns 0..100 or null. */
export function parseConstructionPercent(text: string): number | null {
  const match = text.match(/^(\d+)%\s*completed\.?$/i);
  return match ? parseInt(match[1], 10) : null;
}

/** Parsed detail entry from detailsText. */
export interface DetailEntry {
  label: string;
  value: string;
}

/** Known detail keys from the SPO server.
 *  Ordered longest-first so greedy match picks the right key.
 *  Expand this list as new formats are discovered via [DETAILS-DEBUG] logging. */
const KNOWN_DETAIL_KEYS: string[] = [
  'Potential customers (per day)',
  'Research Implementation',
  'Actual customers',
  'Upgrade Level',
  'Desirability',
  'Professionals',
  'Items Sold',
  'Efficiency',
  'Producing',
  'Storing',
  'Workers',
];

/** Build the key-matching regex once.
 *  Matches known keys literally, dynamic "X Coverage" keys, and
 *  a generic fallback for any "CapitalWord(s):" pattern. */
const KEY_PATTERN = new RegExp(
  '(' +
  KNOWN_DETAIL_KEYS.map(k => k.replace(/[()]/g, '\\$&')).join('|') +
  '|[A-Z][a-z]+ Coverage' +       // dynamic coverage keys (School, Hospital, etc.)
  '|[A-Z][A-Za-z]+(?: [A-Za-z]+)?' + // generic 1-2 word capitalized key
  '):\\s*',
  'g',
);

/** Parse detailsText into structured key-value entries.
 *  Uses a hybrid known-key dictionary + generic fallback approach.
 *  Handles all known SPO building formats including production, retail,
 *  public facilities, storage, and workforce details.
 */
export function parseDetailsText(text: string): DetailEntry[] {
  if (!text || !text.includes(':')) return [];

  // Normalize: insert space after period before uppercase to fix "1.Workers" → "1. Workers"
  let normalized = text.replace(/\.(?=[A-Z])/g, '. ');

  // Strip preamble: leading text before first key that has no colon (e.g. "Drug Store.")
  const firstKeyMatch = KEY_PATTERN.exec(normalized);
  KEY_PATTERN.lastIndex = 0; // reset stateful regex
  if (firstKeyMatch && firstKeyMatch.index > 0) {
    const preamble = normalized.substring(0, firstKeyMatch.index).trim();
    // Only strip if preamble contains no colon (pure label text, not a key:value)
    if (!preamble.includes(':')) {
      normalized = normalized.substring(firstKeyMatch.index);
    }
  }

  // Scan for all key positions using matchAll
  const matches = [...normalized.matchAll(KEY_PATTERN)];
  if (matches.length === 0) return [];

  const entries: DetailEntry[] = [];

  // Collect any non-key text before the first match as a "Status" entry
  if (matches[0].index > 0) {
    const before = normalized.substring(0, matches[0].index).trim().replace(/\.$/, '');
    if (before) {
      entries.push({ label: 'Status', value: before });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const label = matches[i][1];
    const valueStart = matches[i].index + matches[i][0].length;
    const valueEnd = i + 1 < matches.length ? matches[i + 1].index : normalized.length;
    const value = normalized.substring(valueStart, valueEnd).trim().replace(/\.?\s*$/, '');
    if (value) {
      entries.push({ label, value });
    }
  }

  return entries;
}

export function QuickStats({ focus }: QuickStatsProps) {
  const constructionPct = focus.salesInfo
    ? parseConstructionPercent(focus.salesInfo)
    : null;

  return (
    <div className={styles.bar}>
      {focus.revenue && (
        <div className={styles.stat}>
          <span className={styles.value}>{focus.revenue}</span>
          <span className={styles.label}>Revenue</span>
        </div>
      )}

      {constructionPct !== null ? (
        <div className={styles.construction}>
          <div className={styles.constructionHeader}>
            <span className={styles.constructionLabel}>Construction</span>
            <span className={styles.constructionPct}>{constructionPct}%</span>
          </div>
          <ProgressBar value={constructionPct / 100} variant="gold" height={4} />
        </div>
      ) : (
        focus.salesInfo && (() => {
          const lines = parseSalesLines(focus.salesInfo);
          if (lines.length > 0) {
            return (
              <div className={styles.salesList}>
                <span className={styles.label}>Sales</span>
                {lines.map((line, i) => (
                  <div key={i} className={styles.salesRow}>
                    <div className={styles.salesRowHeader}>
                      <span className={styles.salesCategory}>{line.category}</span>
                    </div>
                    <MiniBar
                      value={line.percent / 100}
                      label={`${line.percent}%`}
                      variant={line.percent >= 80 ? 'success' : line.percent >= 40 ? 'gold' : 'warning'}
                      height={4}
                    />
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div className={styles.stat}>
              <span className={styles.value}>{focus.salesInfo}</span>
              <span className={styles.label}>Sales</span>
            </div>
          );
        })()
      )}

      {focus.detailsText && (() => {
        const entries = parseDetailsText(focus.detailsText);
        if (entries.length > 0) {
          return (
            <div className={styles.detailGrid}>
              {entries.map((entry, i) => (
                <div key={i} className={styles.detailRow}>
                  <span className={styles.detailLabel}>{entry.label}</span>
                  <span className={styles.detailValue}>{entry.value}</span>
                </div>
              ))}
            </div>
          );
        }
        return <div className={styles.detail}>{focus.detailsText}</div>;
      })()}

      {focus.hintsText && (
        <div className={styles.hint}>{focus.hintsText}</div>
      )}
    </div>
  );
}
