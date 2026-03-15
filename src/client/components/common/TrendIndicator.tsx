/**
 * TrendIndicator — Shows directional trend with arrow and percentage.
 * Renders ▲ +12.5% (green) or ▼ -3.2% (red) or — 0% (neutral).
 */

import styles from './TrendIndicator.module.css';

interface TrendIndicatorProps {
  /** Percentage change value (e.g., 12.5 = +12.5%) */
  value: number;
  /** Show directional arrow. Default true. */
  showArrow?: boolean;
  /** Show percentage value. Default true. */
  showValue?: boolean;
  /** Size variant. Default 'sm'. */
  size?: 'sm' | 'md';
  className?: string;
}

export function TrendIndicator({
  value,
  showArrow = true,
  showValue = true,
  size = 'sm',
  className,
}: TrendIndicatorProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const variant = isPositive ? styles.positive : isNegative ? styles.negative : styles.neutral;
  const sizeClass = size === 'md' ? styles.md : styles.sm;
  const arrow = isPositive ? '\u25B2' : isNegative ? '\u25BC' : '\u2014';
  const formatted = isPositive ? `+${value.toFixed(1)}%` : isNegative ? `${value.toFixed(1)}%` : '0%';

  return (
    <span className={`${styles.trend} ${variant} ${sizeClass} ${className ?? ''}`}>
      {showArrow && <span className={styles.arrow}>{arrow}</span>}
      {showValue && <span>{formatted}</span>}
    </span>
  );
}
