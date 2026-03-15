/**
 * InfoWidget — Top-right structured glass card with financial stats, game date, and identity.
 *
 * Three-section layout inspired by city-builder UIs (SimCity, Anno 1800):
 *  1. Header: server name + compact date
 *  2. Financial: cash (prominent) + income/h (color-coded)
 *  3. Identity: rank, name, role, company, facilities progress bar
 *
 * Debt tint at failureLevel >= 1, pulsing alert at >= 2.
 */

import { useGameStore } from '../../store/game-store';
import { useUiStore } from '../../store/ui-store';
import { NobilityBadge } from '../chat/NobilityBadge';
import { Sparkline } from '../common';
import { NOBILITY_TIERS } from '../../../shared/types/domain-types';
import styles from './InfoWidget.module.css';

const COMPACT_DATE: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: '2-digit',
};

function formatCompactDate(date: Date | null): string {
  if (!date) return '...';
  return date.toLocaleDateString('en-US', COMPACT_DATE);
}

/** Determine sign of income string for color coding. */
function incomeSign(income: string): 'positive' | 'negative' | 'neutral' {
  const cleaned = income.replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  if (Number.isNaN(num) || num === 0) return 'neutral';
  return num > 0 ? 'positive' : 'negative';
}

/** Format income with sign prefix and dollar sign. */
function formatIncome(income: string): string {
  const sign = incomeSign(income);
  const cleaned = income.replace(/[^0-9.,]/g, '');
  if (sign === 'positive') return `+$${cleaned}/h`;
  if (sign === 'negative') return `-$${cleaned}/h`;
  return `$0/h`;
}

export function InfoWidget() {
  const username = useGameStore((s) => s.username);
  const worldName = useGameStore((s) => s.worldName);
  const companyName = useGameStore((s) => s.companyName);
  const tycoonStats = useGameStore((s) => s.tycoonStats);
  const gameDate = useGameStore((s) => s.gameDate);
  const ownerRole = useGameStore((s) => s.ownerRole);
  const cashHistory = useGameStore((s) => s.cashHistory);
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);
  const rightPanel = useUiStore((s) => s.rightPanel);

  const failureLevel = tycoonStats?.failureLevel ?? 0;

  const widgetClass = [
    styles.widget,
    failureLevel >= 2 ? styles.alertPulse : failureLevel >= 1 ? styles.debtTint : '',
    rightPanel ? styles.shifted : '',
  ]
    .filter(Boolean)
    .join(' ');

  const sign = tycoonStats ? incomeSign(tycoonStats.incomePerHour) : 'neutral';
  const incomeClass =
    sign === 'positive' ? styles.incomePositive
      : sign === 'negative' ? styles.incomeNegative
        : styles.incomeNeutral;

  const facilitiesPercent = tycoonStats
    ? Math.min(100, Math.round((tycoonStats.buildingCount / Math.max(1, tycoonStats.maxBuildings)) * 100))
    : 0;

  return (
    <div className={widgetClass}>
      {/* Header: Server + Date */}
      <div className={styles.header}>
        <span className={styles.server}>
          {worldName ? worldName.toUpperCase() : 'OFFLINE'}
        </span>
        <span className={styles.date}>{formatCompactDate(gameDate)}</span>
      </div>

      {/* Financial section */}
      {tycoonStats && (
        <div className={styles.financial}>
          <div className={styles.cashRow}>
            <span className={styles.cashSymbol}>$</span>
            <span className={styles.cash}>{tycoonStats.cash}</span>
          </div>
          <div className={styles.incomeRow}>
            <span className={incomeClass}>
              {formatIncome(tycoonStats.incomePerHour)}
            </span>
          </div>
          {cashHistory.length >= 2 && (
            <div className={styles.sparklineRow}>
              <Sparkline data={cashHistory} color="gold" width={180} height={16} />
            </div>
          )}
        </div>
      )}

      {/* Identity section */}
      <div className={styles.identity}>
        {tycoonStats && (
          <div className={styles.row}>
            <span className={styles.rankBadge}>#{tycoonStats.ranking}</span>
            <span className={styles.separator}>&middot;</span>
            <span className={styles.name}>{username || 'Unknown'}</span>
            {ownerRole && (
              <>
                <span className={styles.separator}>&middot;</span>
                <span className={styles.role}>{ownerRole}</span>
              </>
            )}
          </div>
        )}

        {tycoonStats && (tycoonStats.levelName || (tycoonStats.nobPoints ?? 0) >= 500) && (
          <div className={styles.row}>
            {tycoonStats.levelName && (
              <span className={styles.levelName}>{tycoonStats.levelName}</span>
            )}
            {(tycoonStats.nobPoints ?? 0) >= 500 && (
              <NobilityBadge
                nobilityTier={
                  (NOBILITY_TIERS.find(t => (tycoonStats.nobPoints ?? 0) >= t.minPoints)
                    ?? NOBILITY_TIERS[NOBILITY_TIERS.length - 1]).label
                }
                modifiers={0}
                size="sm"
              />
            )}
          </div>
        )}

        <div className={styles.row}>
          <span
            className={styles.company}
            onClick={() => toggleLeftPanel('empire')}
            title="Empire Overview (E)"
          >
            {companyName || 'No Company'} &#x203a;
          </span>
        </div>

        {tycoonStats && (
          <div className={styles.facilitiesRow}>
            <span className={styles.facilitiesLabel}>
              {tycoonStats.buildingCount}/{tycoonStats.maxBuildings}
            </span>
            <div className={styles.facilitiesBar}>
              <div
                className={styles.facilitiesFill}
                style={{ width: `${facilitiesPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
