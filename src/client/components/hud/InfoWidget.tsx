/**
 * InfoWidget — Top-right glass card showing game date, rank, company, facilities, and cash.
 *
 * Replaces the old full-width TopBar. Compact, always visible (z-300).
 * Debt tint at failureLevel >= 1.
 */

import { useGameStore } from '../../store/game-store';
import { useUiStore } from '../../store/ui-store';
import styles from './InfoWidget.module.css';

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

function formatGameDate(date: Date | null): string {
  if (!date) return '...';
  return date.toLocaleDateString('en-US', DATE_FORMAT);
}

export function InfoWidget() {
  const username = useGameStore((s) => s.username);
  const companyName = useGameStore((s) => s.companyName);
  const tycoonStats = useGameStore((s) => s.tycoonStats);
  const gameDate = useGameStore((s) => s.gameDate);
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);

  const failureLevel = tycoonStats?.failureLevel ?? 0;

  const widgetClass = [
    styles.widget,
    failureLevel >= 2 ? styles.alertPulse : failureLevel >= 1 ? styles.debtTint : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={widgetClass}>
      {/* Row 1: Game date */}
      <div className={styles.row}>
        <span className={styles.date}>{formatGameDate(gameDate)}</span>
      </div>

      {/* Row 2: Rank + player name */}
      {tycoonStats && (
        <div className={styles.row}>
          <span className={styles.rank}>#{tycoonStats.ranking}</span>
          <span className={styles.separator}>&middot;</span>
          <span className={styles.name}>{username || 'Unknown'}</span>
        </div>
      )}

      {/* Row 3: Company name (clickable → Profile) */}
      <div className={styles.row}>
        <span
          className={styles.company}
          onClick={() => toggleLeftPanel('empire')}
          title="Empire Overview (E)"
        >
          {companyName || 'No Company'}
        </span>
      </div>

      {/* Row 4: Facilities count */}
      {tycoonStats && (
        <div className={styles.row}>
          <span className={styles.facilities}>
            {tycoonStats.buildingCount}/{tycoonStats.maxBuildings} facilities
          </span>
        </div>
      )}

      {/* Row 5: Cash + Income */}
      {tycoonStats && (
        <div className={styles.row}>
          <span className={styles.cash}>${tycoonStats.cash}</span>
          <span className={styles.separator}>&middot;</span>
          <span className={styles.income}>{tycoonStats.incomePerHour}/h</span>
        </div>
      )}
    </div>
  );
}
