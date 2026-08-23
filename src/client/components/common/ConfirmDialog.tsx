/**
 * ConfirmDialog — thin wrapper over `Dialog` that keeps the historical API
 * (`confirmText` typed guard, `onConfirm` / `onCancel`) so callers and `ui-store.requestConfirm`
 * keep working. New code should pass `ConfirmOptions` through `requestConfirm` instead.
 */

import { Dialog, type DialogKind, type DialogRow } from './Dialog';

export interface ConfirmDialogProps {
  title: string;
  message: string;
  /** Text the user must type to enable the confirm button. Defaults to "CONFIRM" when `kind` is
   *  omitted (the historical behaviour); pass `null` to confirm with a single click. */
  confirmText?: string | null;
  kind?: DialogKind;
  rows?: DialogRow[];
  confirmLabel?: string;
  cancelLabel?: string;
  dontAskAgainKey?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmText,
  kind,
  rows,
  confirmLabel = 'Confirm',
  cancelLabel,
  dontAskAgainKey,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Historical default: the only caller (demolish) relied on a typed guard. Keep it unless the
  // caller states a kind — a `spend` or `info` dialog confirms with one click.
  const typed = confirmText === undefined ? (kind === undefined ? 'CONFIRM' : undefined) : confirmText ?? undefined;
  const resolvedKind: DialogKind = kind ?? (typed ? 'destructive' : 'info');
  return (
    <Dialog
      title={title}
      description={message}
      kind={resolvedKind}
      rows={rows}
      typeToConfirm={typed}
      dontAskAgainKey={dontAskAgainKey}
      primary={{ label: confirmLabel, onClick: onConfirm }}
      secondary={cancelLabel ? { label: cancelLabel } : undefined}
      onClose={onCancel}
    />
  );
}
