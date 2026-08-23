/**
 * Switch · Checkbox · Radio — the three toggle controls of the design system
 * (doc/ux/handoff/00-socle.md §2.6, board doc/ux/design/system/Controles.dc.html).
 *
 * Every one of them wraps a NATIVE `<input>` (styled with `appearance: none`, laid over its
 * drawn control) inside a `<label>`, so the whole row is the hit target and the browser gives
 * us keyboard, form participation and screen-reader semantics for free — no more `div onClick`.
 *
 *  - `Switch`   : `<input type="checkbox" role="switch">`, label on the left by default
 *                 (Settings rows), `aria-checked` explicit when `checked` is controlled.
 *  - `Checkbox` : 18 px gold box, check drawn by an inline SVG sibling; `indeterminate`
 *                 is a DOM property, not an attribute, so it is set through an effect.
 *  - `Radio`    : 18 px circle, checked = 5 px gold ring over the page background.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import styles from './Toggle.module.css';

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'>;

interface ToggleBaseProps extends NativeInputProps {
  /** Visible label — the accessible name of the input. */
  label: ReactNode;
  /** Secondary line under the label, 12 px tertiary. */
  description?: ReactNode;
}

function LabelText({ label, description }: { label: ReactNode; description?: ReactNode }) {
  return (
    <span className={styles.text}>
      <span className={styles.label}>{label}</span>
      {description !== undefined && description !== null && (
        <span className={styles.description}>{description}</span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ Switch */

export interface SwitchProps extends ToggleBaseProps {
  /** `'start'` (default) puts the label on the left and the switch on the right, as in Settings rows. */
  labelPosition?: 'start' | 'end';
  /** `'md'` 40×22 (default) · `'lg'` 48×28 for touch. */
  size?: 'md' | 'lg';
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, description, labelPosition = 'start', size = 'md', className, checked, ...rest },
  ref,
) {
  const text = <LabelText label={label} description={description} />;
  const control = (
    <span className={`${styles.control} ${styles.switchTrack} ${size === 'lg' ? styles.switchLg : ''}`}>
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        className={styles.input}
        checked={checked}
        aria-checked={checked === undefined ? undefined : checked}
        {...rest}
      />
      <span className={styles.switchThumb} aria-hidden="true" />
    </span>
  );
  return (
    <label className={`${styles.row} ${labelPosition === 'start' ? styles.labelStart : ''} ${className ?? ''}`}>
      {labelPosition === 'start' ? (
        <>
          {text}
          {control}
        </>
      ) : (
        <>
          {control}
          {text}
        </>
      )}
    </label>
  );
});

/* ---------------------------------------------------------------- Checkbox */

export interface CheckboxProps extends ToggleBaseProps {
  /** Mixed state (e.g. "some of the rows"). A DOM property — mirrored onto the input by effect. */
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, indeterminate = false, className, ...rest },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={`${styles.row} ${className ?? ''}`}>
      <span className={`${styles.control} ${styles.box}`}>
        <input ref={inputRef} type="checkbox" className={styles.input} {...rest} />
        <svg
          className={styles.check}
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span className={styles.dash} aria-hidden="true" />
      </span>
      <LabelText label={label} description={description} />
    </label>
  );
});

/* ------------------------------------------------------------------- Radio */

export type RadioProps = ToggleBaseProps;

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, description, className, ...rest },
  ref,
) {
  return (
    <label className={`${styles.row} ${className ?? ''}`}>
      <span className={`${styles.control} ${styles.circle}`}>
        <input ref={ref} type="radio" className={styles.input} {...rest} />
      </span>
      <LabelText label={label} description={description} />
    </label>
  );
});
