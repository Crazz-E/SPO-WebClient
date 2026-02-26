/**
 * QuickStats — Revenue/sales summary bar at top of building inspector.
 */

import type { BuildingFocusInfo } from '@/shared/types';
import styles from './QuickStats.module.css';

interface QuickStatsProps {
  focus: BuildingFocusInfo;
}

export function QuickStats({ focus }: QuickStatsProps) {
  return (
    <div className={styles.bar}>
      {focus.revenue && (
        <div className={styles.stat}>
          <span className={styles.value}>{focus.revenue}</span>
          <span className={styles.label}>Revenue</span>
        </div>
      )}
      {focus.salesInfo && (
        <div className={styles.stat}>
          <span className={styles.value}>{focus.salesInfo}</span>
          <span className={styles.label}>Sales</span>
        </div>
      )}
      {focus.detailsText && (
        <div className={styles.detail}>{focus.detailsText}</div>
      )}
    </div>
  );
}
