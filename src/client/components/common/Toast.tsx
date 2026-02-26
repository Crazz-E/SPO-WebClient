/**
 * Toast — Notification messages with auto-dismiss.
 */

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import styles from './Toast.module.css';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
  icon?: ReactNode;
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

/** Show a toast notification */
export function showToast(message: string, variant: ToastVariant = 'info', icon?: ReactNode) {
  const toast: ToastMessage = { id: String(++nextId), message, variant, icon };
  currentToasts = [...currentToasts, toast];
  notifyListeners();

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    currentToasts = currentToasts.filter((t) => t.id !== toast.id);
    notifyListeners();
  }, 4000);
}

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
    currentToasts = currentToasts.filter((t) => t.id !== id);
    notifyListeners();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${styles[toast.variant]}`}
        >
          {toast.icon && <span className={styles.icon}>{toast.icon}</span>}
          <span className={styles.message}>{toast.message}</span>
          <button
            className={styles.dismiss}
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
