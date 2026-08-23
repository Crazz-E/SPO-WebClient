/**
 * Chip — pill for a navigation stack, a filter, or a status word (doc/ux/handoff/00-socle.md §2.4).
 *
 * Three variants:
 *  - `stack`  — a crumb in the sheet's navigation pile; the active one is the current screen;
 *  - `filter` — a toggle in a filter row; the active one is pressed;
 *  - `status` — a 6 px dot + a word (Stopped / Undersupplied / In production). The word carries
 *    the meaning, the colour only repeats it.
 *
 * Interactive when `onClick` is given (a `<button>`), static otherwise (a `<span>`).
 * Sizes: 32 px desktop (`md`), 44 px touch (`lg`).
 */

import type { MouseEventHandler, ReactNode } from 'react';
import styles from './Chip.module.css';

export type ChipVariant = 'stack' | 'filter' | 'status';
/** sm = 24 px status tag inline with text; md = 32 px control; lg = 44 px touch target. */
export type ChipSize = 'sm' | 'md' | 'lg';
export type ChipTone = 'neutral' | 'success' | 'warning' | 'error';

export interface ChipProps {
  variant?: ChipVariant;
  /** Pressed filter / current stack crumb. */
  active?: boolean;
  /** Small mono counter after the label. */
  count?: number;
  size?: ChipSize;
  /** Status chips only — dot and text colour. */
  tone?: ChipTone;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Chip({
  variant = 'filter',
  active = false,
  count,
  size = 'md',
  tone = 'neutral',
  onClick,
  disabled,
  children,
  className,
  title,
}: ChipProps) {
  const classes = [
    styles.chip,
    styles[variant],
    styles[size],
    active ? styles.active : '',
    variant === 'status' ? styles[tone] : '',
    className ?? '',
  ].join(' ');

  const current = variant === 'stack' && active ? 'true' : undefined;

  const content = (
    <>
      {variant === 'status' && <span className={styles.dot} aria-hidden="true" />}
      {children}
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-pressed={variant === 'filter' ? active : undefined}
        aria-current={current}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={classes} title={title} aria-current={current}>
      {content}
    </span>
  );
}
