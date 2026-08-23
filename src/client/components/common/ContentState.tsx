/**
 * EmptyState / ErrorState — content states rendered INSIDE the zone concerned, never over the
 * whole sheet (doc/ux/handoff/00-socle.md §2.11, Surfaces board "États de contenu").
 *
 * Both are a centred column: icon 28 px, a 13 px title, an optional 12 px description, an
 * optional button. `ErrorState` is a live region (`role="alert"`) and carries a "Retry" that
 * replays the read of that zone — the caller passes what to replay.
 */

import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './Button';
import styles from './ContentState.module.css';

export interface EmptyStateProps {
  /** 28 px glyph, decorative. */
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`${styles.state} ${className ?? ''}`}>
      {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      <span className={styles.title}>{title}</span>
      {description && <span className={styles.description}>{description}</span>}
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick} className={styles.action}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  /** Replays the read of the zone. No button without it. */
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = 'Could not load this section',
  description,
  onRetry,
  retryLabel = 'Retry',
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={`${styles.state} ${styles.error} ${className ?? ''}`}>
      <span className={`${styles.icon} ${styles.errorIcon}`} aria-hidden="true">
        <AlertCircle size={28} strokeWidth={1.5} />
      </span>
      <span className={styles.title}>{title}</span>
      {description && <span className={styles.description}>{description}</span>}
      {onRetry && (
        <Button variant="primary" size="sm" onClick={onRetry} className={styles.action}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
