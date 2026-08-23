/**
 * PromptDialog — a `Dialog` with one text field. Keeps the historical API
 * (`onSubmit(value)` / `onCancel`, `placeholder`, `defaultValue`) used by `ui-store.requestPrompt`.
 * Enter submits when the trimmed value is non-empty; the field is labelled by the message.
 */

import { useCallback, useId, useState } from 'react';
import { Dialog } from './Dialog';
import styles from './PromptDialog.module.css';

export interface PromptDialogProps {
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  title,
  message,
  placeholder,
  defaultValue = '',
  submitLabel = 'Submit',
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputId = useId();
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0;

  const submit = useCallback(() => {
    if (canSubmit) onSubmit(trimmed);
  }, [canSubmit, onSubmit, trimmed]);

  return (
    <Dialog
      title={title}
      description={message}
      kind="info"
      primary={{ label: submitLabel, onClick: submit, disabled: !canSubmit }}
      onClose={onCancel}
    >
      <input
        id={inputId}
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canSubmit) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        aria-label={message}
        autoFocus
        spellCheck={false}
        autoComplete="off"
      />
    </Dialog>
  );
}
