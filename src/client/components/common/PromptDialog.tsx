import { useState, useCallback } from 'react';
import styles from './ConfirmDialog.module.css';

interface PromptDialogProps {
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  title,
  message,
  placeholder,
  defaultValue = '',
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const [inputValue, setInputValue] = useState(defaultValue);
  const canSubmit = inputValue.trim().length > 0;

  const handleSubmit = useCallback(() => {
    if (canSubmit) onSubmit(inputValue.trim());
  }, [canSubmit, inputValue, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && canSubmit) onSubmit(inputValue.trim());
      if (e.key === 'Escape') onCancel();
    },
    [canSubmit, inputValue, onSubmit, onCancel],
  );

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.message}>{message}</p>
        <input
          className={styles.input}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus
          spellCheck={false}
        />
        <div className={styles.buttons}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={styles.confirmBtn}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
