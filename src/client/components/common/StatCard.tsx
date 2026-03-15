/**
 * StatCard — Compact card with label, value, optional trend and sparkline.
 * Used in financial summaries and overview grids.
 */

import styles from './StatCard.module.css';
import { TrendIndicator } from './TrendIndicator';
import { Sparkline } from './Sparkline';

type StatCardVariant = 'default' | 'profit' | 'loss' | 'gold';

interface StatCardProps {
  label: string;
  value: string | number;
  /** Percentage change for trend indicator */
  trend?: number;
  /** Data points for inline sparkline */
  sparklineData?: number[];
  /** Color variant. Default 'default'. */
  variant?: StatCardVariant;
  /** Compact sizing. Default false. */
  compact?: boolean;
  className?: string;
}

const variantToValueClass: Record<StatCardVariant, string> = {
  default: '',
  profit: styles.valueProfit ?? '',
  loss: styles.valueLoss ?? '',
  gold: styles.valueGold ?? '',
};

export function StatCard({
  label,
  value,
  trend,
  sparklineData,
  variant = 'default',
  compact = false,
  className,
}: StatCardProps) {
  const sparkColor = variant === 'profit' ? 'positive' as const
    : variant === 'loss' ? 'negative' as const
    : variant === 'gold' ? 'gold' as const
    : undefined;

  return (
    <div className={`${styles.card} ${compact ? styles.compact : ''} ${className ?? ''}`}>
      <div className={styles.label}>{label}</div>
      <div className={styles.row}>
        <div className={`${styles.value} ${variantToValueClass[variant]}`}>
          {value}
        </div>
        {trend != null && <TrendIndicator value={trend} size="sm" />}
      </div>
      {sparklineData && sparklineData.length >= 2 && (
        <div className={styles.sparkline}>
          <Sparkline data={sparklineData} width={100} height={20} color={sparkColor} />
        </div>
      )}
    </div>
  );
}
