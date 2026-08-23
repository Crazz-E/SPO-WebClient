/**
 * Toast — transient notifications (doc/ux/handoff/00-socle.md §2.9).
 *
 * Each toast carries an icon AND a word for its severity (Done / Notice / Warning / Failed),
 * so meaning never rides on colour alone (WCAG 1.4.1; audit §3.2). An optional action
 * ("View", "Retry") makes a toast useful instead of merely informative.
 *
 * Two live regions are mounted PERMANENTLY — `role="status"` (polite) for info/success/
 * warning and `role="alert"` (assertive) for errors — because a region created in the same
 * tick as its first message is not announced by most screen readers (audit §3.2). Errors do
 * not auto-dismiss: a failure the player did not see is a failure that did not happen for them.
 *
 * Stacks newest-on-top, max 3 visible, click-to-dismiss.
 */

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { Check, AlertTriangle, Info, XCircle } from 'lucide-react';
import styles from './Toast.module.css';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
  /** Short word shown before the message; defaults per variant (Done / Notice / Warning / Failed). */
  title?: string;
  icon?: ReactNode;
  action?: ToastAction;
  createdAt: number;
}

export interface ToastOptions {
  title?: string;
  icon?: ReactNode;
  action?: ToastAction;
}

export const AUTO_DISMISS_MS = 15000;
export const MAX_VISIBLE = 3;

export const DEFAULT_TITLES: Record<ToastVariant, string> = {
  info: 'Notice',
  success: 'Done',
  warning: 'Warning',
  error: 'Failed',
};

/** A plain options object — not a React element (`$$typeof`), not a string, not an array. */
function isToastOptions(x: ReactNode | ToastOptions | undefined): x is ToastOptions {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && !('$$typeof' in x);
}

/** Global toast state — subscribe from components */
let toastListeners: Array<(toasts: ToastMessage[]) => void> = [];
let currentToasts: ToastMessage[] = [];
let nextId = 0;

function notifyListeners() {
  for (const listener of toastListeners) {
    listener([...currentToasts]);
  }
}

/**
 * Show a toast. Returns its id. The third argument keeps the historical `icon` shape
 * (`showToast(msg, variant, icon)`) and also accepts a `ToastOptions` object.
 * Errors stay until dismissed; everything else auto-dismisses after AUTO_DISMISS_MS.
 */
export function showToast(message: string, variant: ToastVariant = 'info', iconOrOptions?: ReactNode | ToastOptions): string {
  const options: ToastOptions = isToastOptions(iconOrOptions) ? iconOrOptions : { icon: iconOrOptions };
  const toast: ToastMessage = {
    id: String(++nextId),
    message,
    variant,
    title: options.title,
    icon: options.icon,
    action: options.action,
    createdAt: Date.now(),
  };
  currentToasts = [...currentToasts, toast];
  notifyListeners();

  if (variant !== 'error') {
    setTimeout(() => {
      currentToasts = currentToasts.filter((t) => t.id !== toast.id);
      notifyListeners();
    }, AUTO_DISMISS_MS);
  }

  return toast.id;
}

/** Compute visible toasts and hidden count (exported for testing) */
export function getVisibleToasts(toasts: ToastMessage[]): {
  visible: ToastMessage[];
  hiddenCount: number;
} {
  const reversed = toasts.slice().reverse();
  return {
    visible: reversed.slice(0, MAX_VISIBLE),
    hiddenCount: Math.max(0, toasts.length - MAX_VISIBLE),
  };
}

/** Dismiss a toast by id */
export function dismissToast(id: string) {
  currentToasts = currentToasts.filter((t) => t.id !== id);
  notifyListeners();
}

/** Reset all state (for testing) */
export function resetToasts() {
  currentToasts = [];
  toastListeners = [];
  nextId = 0;
}

/** Subscribe to toast changes (for testing) */
export function subscribeToasts(listener: (toasts: ToastMessage[]) => void): () => void {
  toastListeners.push(listener);
  return () => {
    toastListeners = toastListeners.filter((l) => l !== listener);
  };
}

const variantClass: Record<ToastVariant, string> = {
  info: styles.info,
  success: styles.success,
  warning: styles.warning,
  error: styles.error,
};

function VariantIcon({ variant }: { variant: ToastVariant }) {
  const props = { size: 16, 'aria-hidden': true as const };
  switch (variant) {
    case 'success':
      return <Check {...props} />;
    case 'warning':
      return <AlertTriangle {...props} />;
    case 'error':
      return <XCircle {...props} />;
    default:
      return <Info {...props} />;
  }
}

function ToastCard({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const title = toast.title ?? DEFAULT_TITLES[toast.variant];
  return (
    <div className={`${styles.toast} ${variantClass[toast.variant]}`} data-variant={toast.variant}>
      <span className={styles.icon}>{toast.icon ?? <VariantIcon variant={toast.variant} />}</span>
      <span className={styles.message}>
        <strong className={styles.title}>{title}</strong>
        <span aria-hidden="true"> — </span>
        {toast.message}
      </span>
      {toast.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className={styles.dismiss} onClick={() => onDismiss(toast.id)} aria-label={`Dismiss: ${title}`}>
        &times;
      </button>
      {toast.variant !== 'error' && (
        <div className={styles.progressTrack} aria-hidden="true">
          <div className={styles.progressBar} style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }} />
        </div>
      )}
    </div>
  );
}

/** Toast container — mount once at root. The live regions exist even when empty. */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    toastListeners.push(setToasts);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setToasts);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    dismissToast(id);
  }, []);

  const { visible, hiddenCount } = getVisibleToasts(toasts);
  const polite = visible.filter((t) => t.variant !== 'error');
  const assertive = visible.filter((t) => t.variant === 'error');

  return (
    <div className={styles.container}>
      <div role="alert" aria-live="assertive" aria-atomic="false" className={styles.region}>
        {assertive.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
      <div role="status" aria-live="polite" aria-atomic="false" className={styles.region}>
        {polite.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
        ))}
        {hiddenCount > 0 && <div className={styles.overflow}>+{hiddenCount} more</div>}
      </div>
    </div>
  );
}
