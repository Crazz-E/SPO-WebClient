/**
 * SliderInput — Range slider with label and value display.
 * Used for building property editing (demand %, price %, quality threshold).
 */

import { useCallback } from 'react';
import styles from './SliderInput.module.css';

interface SliderInputProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Suffix displayed after the value (e.g. "%") */
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}

export function SliderInput({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  suffix = '',
  disabled = false,
  onChange,
  onCommit,
}: SliderInputProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  const handleBlur = useCallback(() => {
    onCommit?.(value);
  }, [onCommit, value]);

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={`${styles.container} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        className={styles.slider}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onMouseUp={handleBlur}
        onTouchEnd={handleBlur}
        style={{
          background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${percentage}%, var(--bg-tertiary) ${percentage}%, var(--bg-tertiary) 100%)`,
        }}
        aria-label={label}
      />
    </div>
  );
}
