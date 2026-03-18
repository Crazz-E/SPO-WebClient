/**
 * ReconnectingOverlay — Shown on top of GameScreen when status is 'reconnecting'.
 * Keeps the game canvas visible underneath while auto-reconnect is in progress.
 */

import { useGameStore } from '../../store/game-store';
import { useClient } from '../../context';
import styles from './ReconnectingOverlay.module.css';
import spinnerStyles from '../startup/LoadingSpinner.module.css';

export function ReconnectingOverlay() {
  const status = useGameStore((s) => s.status);
  const attempt = useGameStore((s) => s.reconnectAttempt);
  const client = useClient();

  if (status !== 'reconnecting') return null;

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={styles.card}>
        <div className={spinnerStyles.spinner}>
          <div className={spinnerStyles.dot} />
          <div className={spinnerStyles.dot} />
          <div className={spinnerStyles.dot} />
        </div>
        <p className={styles.title}>Connection lost</p>
        <p className={styles.attempt}>
          Reconnecting… attempt {attempt} of 5
        </p>
        <button
          className={styles.retryBtn}
          onClick={() => client.onTriggerReconnect()}
        >
          Try now
        </button>
      </div>
    </div>
  );
}
