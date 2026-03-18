/**
 * MobileInfoBar — Slim horizontal top bar replacing desktop InfoWidget on mobile.
 *
 * Single row: [World + Date] [Cash] [Income/h] [Rank + Name]
 * Glass background, 36px tall, z-300.
 * Tap to open favorites/empire panel.
 */

import { useGameStore } from '../../store/game-store';
import { useUiStore } from '../../store/ui-store';
import styles from './MobileInfoBar.module.css';

/** Determine sign of income string for color coding. */
function incomeSign(income: string): 'positive' | 'negative' | 'neutral' {
  const cleaned = income.replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  if (Number.isNaN(num) || num === 0) return 'neutral';
  return num > 0 ? 'positive' : 'negative';
}

/** Format income with sign prefix. */
function formatIncome(income: string): string {
  const sign = incomeSign(income);
  const cleaned = income.replace(/[^0-9.,]/g, '');
  if (sign === 'positive') return `+$${cleaned}/h`;
  if (sign === 'negative') return `-$${cleaned}/h`;
  return '$0/h';
}

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
          <span className={styles.cash}>${tycoonStats.cash}</span>
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
