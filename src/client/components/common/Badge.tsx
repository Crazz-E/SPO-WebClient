/**
 * Badge — Status badges and notification counts.
 */

import styles from './Badge.module.css';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'gold';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  /** Display as small dot (no text) */
  dot?: boolean;
  className?: string;
}

export function Badge({ children, variant = 'default', dot, className }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[variant]} ${dot ? styles.dot : ''} ${className ?? ''}`}>
      {!dot && children}
    </span>
  );
}

/** Notification count badge (e.g., unread mail) */
interface CountBadgeProps {
  count: number;
  max?: number;
  className?: string;
}

export function CountBadge({ count, max = 99, className }: CountBadgeProps) {
  if (count <= 0) return null;
  const display = count > max ? `${max}+` : String(count);

  return (
    <span className={`${styles.countBadge} ${className ?? ''}`}>
      {display}
    </span>
  );
}
