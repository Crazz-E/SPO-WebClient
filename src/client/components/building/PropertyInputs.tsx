/**
 * PropertyInputs — Editable input components for building property values.
 *
 * SliderInput: range slider with debounced server update
 * TextInput: text field with debounced server update
 * CurrencyInput: currency field with edit/commit/cancel workflow
 *
 * Extracted from PropertyGroup.tsx.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { formatCurrency } from '@/shared/building-details';
import { useBuildingStore } from '../../store/building-store';
import { SaveIndicator } from './SaveIndicator';
import styles from './PropertyGroup.module.css';

// =============================================================================
// SLIDER INPUT (editable numeric property)
// =============================================================================

export interface SliderInputProps {
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  rdoName: string;
  pendingKey?: string;
  onPropertyChange: (name: string, value: number) => void;
}

export function SliderInput({ value, min, max, step, unit, rdoName, pendingKey, onPropertyChange }: SliderInputProps) {
  const [localVal, setLocalVal] = useState(isNaN(value) ? min : value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Revert local value on server failure
  const failedUpdates = useBuildingStore((s) => s.failedUpdates);
  useEffect(() => {
    if (!pendingKey) return;
    const failed = failedUpdates.get(pendingKey);
    if (failed) {
      setLocalVal(parseFloat(failed.originalValue) || min);
    }
  }, [failedUpdates, pendingKey, min]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = parseFloat(e.target.value);
      setLocalVal(newVal);

      // Debounce server call
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onPropertyChange(rdoName, newVal);
      }, 300);
    },
    [rdoName, onPropertyChange],
  );

  return (
    <div className={styles.sliderContainer}>
      <input
        type="range"
        className={styles.slider}
        min={min}
        max={max}
        step={step}
        value={localVal}
        onChange={handleChange}
      />
      <span className={styles.sliderValue}>
        {localVal}{unit ?? ''}
        {pendingKey && <SaveIndicator propertyKey={pendingKey} />}
      </span>
    </div>
  );
}

// =============================================================================
// TEXT INPUT (editable widestring property, e.g., Name)
// =============================================================================

export interface TextInputProps {
  value: string;
  rdoName: string;
  pendingKey?: string;
  onStringPropertyChange: (name: string, value: string) => void;
}

export function TextInput({ value, rdoName, pendingKey, onStringPropertyChange }: TextInputProps) {
  const [localVal, setLocalVal] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Revert local value on server failure
  const failedUpdates = useBuildingStore((s) => s.failedUpdates);
  useEffect(() => {
    if (!pendingKey) return;
    const failed = failedUpdates.get(pendingKey);
    if (failed) {
      setLocalVal(failed.originalValue);
    }
  }, [failedUpdates, pendingKey]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = e.target.value;
      setLocalVal(newVal);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onStringPropertyChange(rdoName, newVal);
      }, 500);
    },
    [rdoName, onStringPropertyChange],
  );

  return (
    <span className={styles.textInputWrapper}>
      <input
        type="text"
        className={styles.textInput}
        value={localVal}
        onChange={handleChange}
        maxLength={40}
      />
      {pendingKey && <SaveIndicator propertyKey={pendingKey} />}
    </span>
  );
}

// =============================================================================
// CURRENCY INPUT (editable currency value in table cells)
// =============================================================================

export function CurrencyInput({
  value,
  rdoName,
  pendingKey,
  onPropertyChange,
}: {
  value: number;
  rdoName: string;
  pendingKey?: string;
  onPropertyChange: (name: string, value: number) => void;
}) {
  const [localVal, setLocalVal] = useState(isNaN(value) ? '' : formatCurrency(value));
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const commitRef = useRef(false);

  const pendingUpdates = useBuildingStore((s) => s.pendingUpdates);
  const pending = pendingKey ? pendingUpdates.get(pendingKey) : undefined;

  const failedUpdates = useBuildingStore((s) => s.failedUpdates);
  useEffect(() => {
    if (!pendingKey) return;
    const failed = failedUpdates.get(pendingKey);
    if (failed) {
      setLocalVal(formatCurrency(parseFloat(failed.originalValue) || 0));
    }
  }, [failedUpdates, pendingKey]);

  // Sync from server when not editing and no pending update in flight
  useEffect(() => {
    if (!isEditing && !pending && !isNaN(value)) {
      setLocalVal(formatCurrency(value));
    }
  }, [value, isEditing, pending]);

  const cancel = useCallback(() => {
    setIsEditing(false);
    setLocalVal(isNaN(value) ? '' : formatCurrency(value));
  }, [value]);

  const commit = useCallback(() => {
    commitRef.current = true;
    setIsEditing(false);
    const parsed = parseFloat(localVal.replace(/[^0-9.-]/g, ''));
    if (!isNaN(parsed) && parsed !== value) {
      onPropertyChange(rdoName, parsed);
      setLocalVal(formatCurrency(parsed));
    } else {
      setLocalVal(isNaN(value) ? '' : formatCurrency(value));
    }
  }, [localVal, rdoName, value, onPropertyChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commit();
        inputRef.current?.blur();
      }
      if (e.key === 'Escape') {
        cancel();
        inputRef.current?.blur();
      }
    },
    [commit, cancel],
  );

  const handleBlur = useCallback(() => {
    // If the user clicked the confirm button, commitRef is already true — don't cancel.
    // Use requestAnimationFrame to let the tick button's mousedown fire first.
    requestAnimationFrame(() => {
      if (!commitRef.current) {
        cancel();
      }
      commitRef.current = false;
    });
  }, [cancel]);

  return (
    <span className={styles.currencyInputWrapper}>
      <input
        ref={inputRef}
        type="text"
        className={styles.currencyInput}
        value={localVal}
        onFocus={() => {
          setIsEditing(true);
          commitRef.current = false;
          setLocalVal(isNaN(value) ? '' : String(value));
        }}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {isEditing && (
        <button
          type="button"
          className={styles.currencyConfirmBtn}
          onMouseDown={(e) => {
            e.preventDefault(); // keep focus on input until commit
            commit();
          }}
          title="Confirm"
        >
          &#10003;
        </button>
      )}
      {!isEditing && pendingKey && (
        <span className={styles.currencyIndicator}>
          <SaveIndicator propertyKey={pendingKey} />
        </span>
      )}
    </span>
  );
}
