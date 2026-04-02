/**
 * MobileInfoBar — Slim horizontal top bar replacing desktop InfoWidget on mobile.
 *
 * Single row: [World + Date] [Cash] [Income/h] [Rank + Name]
 * Glass background, 36px tall, z-300.
 * Tap to open favorites/empire panel.
 */

import { formatMoney, formatIncome, incomeSign } from '../../format-utils';
import { useGameStore } from '../../store/game-store';
import { useUiStore } from '../../store/ui-store';
import styles from './MobileInfoBar.module.css';

/** Format date compactly: "Aug 27, 92" */
function formatDate(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export function MobileInfoBar() {
  const worldName = useGameStore((s) => s.worldName);
  const tycoonStats = useGameStore((s) => s.tycoonStats);
  const gameDate = useGameStore((s) => s.gameDate);
  const username = useGameStore((s) => s.username);
  const setMobileTab = useUiStore((s) => s.setMobileTab);

  const handleTap = () => {
    setMobileTab('favorites');
  };

  const sign = tycoonStats ? incomeSign(tycoonStats.incomePerHour) : 'neutral';
  const incomeClass =
    sign === 'positive' ? styles.incomePositive
      : sign === 'negative' ? styles.incomeNegative
        : styles.incomeNeutral;

  return (
    <button className={styles.bar} onClick={handleTap} aria-label="Open empire overview">
      {/* World + Date */}
      <span className={styles.world}>
        {worldName ? worldName.toUpperCase() : 'OFFLINE'}
      </span>
      <span className={styles.date}>{formatDate(gameDate)}</span>

      {/* Financial */}
      {tycoonStats && (
        <>
          <span className={styles.cash}>{formatMoney(tycoonStats.cash)}</span>
          <span className={incomeClass}>{formatIncome(tycoonStats.incomePerHour)}</span>
        </>
      )}

      {/* Identity */}
      {tycoonStats && (
        <span className={styles.identity}>
          #{tycoonStats.ranking} {username}
        </span>
      )}
    </button>
  );
}
