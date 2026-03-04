/**
 * Toast — Phone-style notification cards with auto-dismiss.
 * Stacks newest-on-top, max 3 visible, click-to-dismiss, 15s auto-read.
 */

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import styles from './Toast.module.css';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
  icon?: ReactNode;
  createdAt: number;
}

export const AUTO_DISMISS_MS = 15000;
export const MAX_VISIBLE = 3;

/** Global toast state — subscribe from components */
let toastListeners: Array<(toasts: ToastMessage[]) => void> = [];
let currentToasts: ToastMessage[] = [];
let nextId = 0;

function notifyListeners() {
  for (const listener of toastListeners) {
    listener([...currentToasts]);
  }
}

/** Show a toast notification */
export function showToast(message: string, variant: ToastVariant = 'info', icon?: ReactNode) {
  const toast: ToastMessage = {
    id: String(++nextId),
    message,
    variant,
    icon,
    createdAt: Date.now(),
  };
  currentToasts = [...currentToasts, toast];
  notifyListeners();

  setTimeout(() => {
    currentToasts = currentToasts.filter((t) => t.id !== toast.id);
    notifyListeners();
  }, AUTO_DISMISS_MS);
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

const dotClass: Record<ToastVariant, string> = {
  info: styles.dotInfo,
  success: styles.dotSuccess,
  warning: styles.dotWarning,
  error: styles.dotError,
};

const progressClass: Record<ToastVariant, string> = {
  info: styles.progressInfo,
  success: styles.progressSuccess,
  warning: styles.progressWarning,
  error: styles.progressError,
};

/** Toast container — mount once at root */
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

  if (toasts.length === 0) return null;

  const { visible, hiddenCount } = getVisibleToasts(toasts);

  return (
    <div className={styles.container} role="status" aria-live="polite">
      {visible.map((toast) => (
        <div
          key={toast.id}
          className={styles.toast}
          onClick={() => dismiss(toast.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') dismiss(toast.id);
          }}
        >
          <span className={`${styles.dot} ${dotClass[toast.variant]}`} />
          {toast.icon && <span className={styles.icon}>{toast.icon}</span>}
          <span className={styles.message}>{toast.message}</span>
          <button
            className={styles.dismiss}
            onClick={(e) => {
              e.stopPropagation();
              dismiss(toast.id);
            }}
            aria-label="Dismiss"
          >
            &times;
          </button>
          <div className={styles.progressTrack}>
            <div
              className={`${styles.progressBar} ${progressClass[toast.variant]}`}
              style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }}
            />
          </div>
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className={styles.overflow}>+{hiddenCount} more</div>
      )}
    </div>
  );
}
