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

      {focus.detailsText && (
        <div className={styles.detail}>{focus.detailsText}</div>
      )}

      {focus.hintsText && (
        <div className={styles.hint}>{focus.hintsText}</div>
      )}
    </div>
  );
}
