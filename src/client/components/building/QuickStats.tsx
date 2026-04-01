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

/** Parse detailsText into structured key-value entries.
 *  Handles formats like:
 *  - "Upgrade Level: 1  Storing: 211370 kg of Fresh Food at 51% qualiy index."
 *  - "Drug Store.  Upgrade Level: 1  Items Sold: 18/h  Efficiency: 92%"
 *  Returns empty array if text doesn't contain "Key: value" patterns.
 */
export function parseDetailsText(text: string): DetailEntry[] {
  if (!text || !text.includes(':')) return [];

  // Split on key boundaries: a capital letter word followed by colon,
  // preceded by double-space or sentence boundary (period + space).
  // We use a lookahead split to keep the keys.
  const segments = text.split(/(?:^|\s{2,}|(?<=\.)\s+)(?=[A-Z][A-Za-z ]*:)/);
  const entries: DetailEntry[] = [];

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0 || colonIdx === 0) continue;
    const label = trimmed.substring(0, colonIdx).trim();
    const value = trimmed.substring(colonIdx + 1).trim().replace(/\.$/, '');
    if (label && value) {
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
