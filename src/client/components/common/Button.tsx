/**
 * Button — the one text button of the design system (doc/ux/handoff/00-socle.md §2.1).
 *
 * Five variants, three sizes, a loading state that disables the button and announces itself,
 * an optional keyboard hint. Replaces the per-module `.closeBtn` / `.submitBtn` / `.retryBtn`
 * recipes one flow at a time — nothing here is specific to a screen.
 *
 * Rules the variants encode (brief §4, handoff §2.1):
 *  - `primary` is gold and there is at most one per surface;
 *  - `danger` only acts after a confirmation `Dialog` — it is a style, not a guard;
 *  - `loading` implies `disabled` and `aria-busy`.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Spinner + disabled + aria-busy. The label stays visible so the layout does not jump. */
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  /** Keyboard hint rendered in a <kbd>, e.g. "R" or "Esc". Decorative — the shortcut itself is bound elsewhere. */
  kbd?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    kbd,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className ?? ''}`}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : (
        iconLeft && <span className={styles.icon} aria-hidden="true">{iconLeft}</span>
      )}
      {children}
      {iconRight && <span className={styles.icon} aria-hidden="true">{iconRight}</span>}
      {kbd && <kbd className={styles.kbd} aria-hidden="true">{kbd}</kbd>}
    </button>
  );
});
