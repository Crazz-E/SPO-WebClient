/**
 * MiniBar — Compact inline progress bar for data rows and table cells.
 * More compact than ProgressBar, designed to sit inside dense data layouts.
 */

import styles from './MiniBar.module.css';

type MiniBarVariant = 'primary' | 'gold' | 'success' | 'warning' | 'error';

interface MiniBarProps {
  /** Value between 0 and 1 */
  value: number;
  /** Optional label (e.g., "72%"). Shown to the right. */
  label?: string;
  /** Color variant. Default 'primary'. */
  variant?: MiniBarVariant;
  /** Show label. Default true. */
  showLabel?: boolean;
  /** Bar height in pixels. Default 6. */
  height?: number;
  className?: string;
}

export function MiniBar({
  value,
  label,
  variant = 'primary',
  showLabel = true,
  height = 6,
  className,
}: MiniBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const displayLabel = label ?? `${Math.round(clamped * 100)}%`;

  return (
    <div className={`${styles.container} ${className ?? ''}`}>
      <div className={styles.track} style={{ height }}>
        <div
          className={`${styles.fill} ${styles[variant]}`}
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
      {showLabel && <span className={styles.label}>{displayLabel}</span>}
    </div>
  );
}
