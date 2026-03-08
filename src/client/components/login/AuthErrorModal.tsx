/**
 * AuthErrorModal — Glassmorphic error overlay for authentication failures.
 *
 * Displays the error message and code from the RDOLogonUser response.
 * Escape key, backdrop click, or "Try Again" button dismiss the modal.
 */

import { useEffect, useCallback } from 'react';
import { GlassCard } from '../common';
import styles from './AuthErrorModal.module.css';

interface AuthErrorModalProps {
  error: { code: number; message: string };
  onDismiss: () => void;
}

export function AuthErrorModal({ error, onDismiss }: AuthErrorModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    },
    [onDismiss],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onDismiss();
    },
    [onDismiss],
  );

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <GlassCard maxWidth={380} className={styles.card}>
        <div className={styles.icon}>!</div>
        <h2 className={styles.title}>Authentication Failed</h2>
        <p className={styles.message}>{error.message}</p>
        {error.code > 0 && (
          <p className={styles.errorCode}>Error code: {error.code}</p>
        )}
        <button className={styles.retryBtn} onClick={onDismiss} autoFocus>
          Try Again
        </button>
      </GlassCard>
    </div>
  );
}
