/**
 * TopBar — Ultra-slim translucent stats strip at top of viewport.
 *
 * 36px height, always visible (z-300).
 * Left: company name pill. Right: rank, cash (gold), income/hr, buildings.
 * Debt tint at failureLevel >= 1.
 */

import { useGameStore } from '../../store/game-store';
import { useUiStore } from '../../store/ui-store';
import styles from './TopBar.module.css';

export function TopBar() {
  const companyName = useGameStore((s) => s.companyName);
  const tycoonStats = useGameStore((s) => s.tycoonStats);
  const gameDate = useGameStore((s) => s.gameDate);
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);

  const failureLevel = tycoonStats?.failureLevel ?? 0;

  return (
    <header
      className={`${styles.bar} ${failureLevel >= 2 ? styles.alertPulse : failureLevel >= 1 ? styles.debtTint : ''}`}
    >
      {/* Left section — company pill */}
      <div className={styles.left}>
        <button
          className={styles.companyPill}
          onClick={() => toggleLeftPanel('empire')}
          title="Empire Overview (E)"
        >
          {companyName || 'No Company'}
        </button>
      </div>

      {/* Center — game date */}
      {gameDate && (
        <div className={styles.center}>
          <span className={styles.date}>{gameDate}</span>
        </div>
      )}

      {/* Right section — tycoon stats */}
      <div className={styles.right}>
        {tycoonStats && (
          <>
            <span className={styles.stat} title="Ranking">
              #{tycoonStats.ranking}
            </span>
            <span className={styles.statGold} title="Cash">
              ${tycoonStats.cash}
            </span>
            <span className={styles.stat} title="Income per hour">
              {tycoonStats.incomePerHour}/h
            </span>
            <span className={styles.stat} title="Buildings">
              {tycoonStats.buildingCount}/{tycoonStats.maxBuildings}
            </span>
          </>
        )}
      </div>
    </header>
  );
}
