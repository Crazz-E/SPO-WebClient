/**
 * Field — a labelled form control (doc/ux/handoff/00-socle.md §2.3).
 *
 * The audit found exactly one `htmlFor` in the whole client (audit §3.1): every other input
 * is labelled by its placeholder, and errors are toasts or red borders. `Field` makes the
 * right thing the easy thing: it generates the ids, binds `<label for>`, wires help and error
 * text through `aria-describedby`, sets `aria-invalid` / `aria-required`, and says the error
 * in words next to an icon — never by colour alone.
 *
 * Usage: `<Field label="Password" required error={err}>{(a11y) => <input {...a11y} />}</Field>`
 * — the render-prop receives the attributes to spread on the control. A plain child element
 * also works; it is cloned with those attributes.
 */

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import styles from './Field.module.css';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  required?: boolean;
}

export interface FieldProps {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Visually hide the label (the control still has it for assistive tech). */
  hideLabel?: boolean;
  className?: string;
  children: ReactElement<Partial<FieldControlProps>> | ((a11y: FieldControlProps) => ReactNode);
}

export function Field({ label, help, error, required, hideLabel, className, children }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  // Help is hidden while an error shows, so it must not be referenced then either.
  const describedBy = [help && !error ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  const a11y: FieldControlProps = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required ? true : undefined,
    required: required || undefined,
  };

  const control = typeof children === 'function' ? children(a11y) : isValidElement(children) ? cloneElement(children, a11y) : children;

  return (
    <div className={`${styles.field} ${error ? styles.hasError : ''} ${className ?? ''}`}>
      <label htmlFor={id} className={`${styles.label} ${hideLabel ? styles.srOnly : ''}`}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            {' '}*
          </span>
        )}
      </label>
      {control}
      {help && !error && (
        <span id={helpId} className={styles.help}>
          {help}
        </span>
      )}
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          <AlertCircle size={12} aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  );
}
