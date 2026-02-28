/**
 * QuickStats — Revenue/sales summary bar at top of building inspector.
 */

import type { BuildingFocusInfo } from '@/shared/types';
import { ProgressBar } from '../common';
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
          <ProgressBar value={constructionPct / 100} variant="warning" height={4} />
        </div>
      ) : (
        focus.salesInfo && (
          <div className={styles.stat}>
            <span className={styles.value}>{focus.salesInfo}</span>
            <span className={styles.label}>Sales</span>
          </div>
        )
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
