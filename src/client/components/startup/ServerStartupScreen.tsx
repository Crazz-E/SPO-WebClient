/**
 * ServerStartupScreen — Branded loading screen shown while the server
 * initialises its services. Driven by SSE progress from /api/startup-status.
 * Fades out automatically once the server reports ready.
 *
 * Shows two sections:
 * 1. Cache steps — pre-service file indexing (fast, parallel)
 * 2. Services — heavyweight initialization (update, facilities, mapData) with sub-steps
 */

import { useState, useEffect } from 'react';
import { useGameStore } from '../../store/game-store';
import { LoginBackground } from '../login/LoginBackground';
import { ProgressBar } from '../common/ProgressBar';
import styles from './ServerStartupScreen.module.css';

const SERVICE_LABELS: Record<string, string> = {
  update: 'Downloading game assets',
  facilities: 'Loading building catalog',
  mapData: 'Indexing map data',
};

const STATUS_ICON: Record<string, string> = {
  pending: '\u00B7',   // ·
  running: '\u21BB',   // ↻
  complete: '\u2713',  // ✓
  failed: '\u2717',    // ✗
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting',
  running: 'In progress',
  complete: 'Done',
  failed: 'Failed',
};

export function ServerStartupScreen() {
  const { ready, progress, message, services, cacheSteps } = useGameStore((s) => s.serverStartup);
  const [exiting, setExiting] = useState(false);
  const [unmounted, setUnmounted] = useState(false);

  useEffect(() => {
    if (ready && !exiting) {
      setExiting(true);
      const t = setTimeout(() => setUnmounted(true), 500);
      return () => clearTimeout(t);
    }
  }, [ready, exiting]);

  if (unmounted) return null;

  const hasCacheSteps = cacheSteps && cacheSteps.length > 0;

  return (
    <div className={`${styles.root} ${exiting ? styles.exiting : ''}`}>
      <LoginBackground />
      <div className={styles.content}>
        <h1 className={styles.logo}>Starpeace Online</h1>
        <p className={styles.tagline}>Initializing server</p>

        <div className={styles.progressWrap}>
          <ProgressBar value={progress} variant="gold" height={6} showLabel />
        </div>

        <p className={styles.message}>{message}</p>

        {/* Cache steps (pre-service phase) */}
        {hasCacheSteps && (
          <ul className={styles.serviceList}>
            {cacheSteps.map((step) => (
              <li key={step.name} className={`${styles.serviceRow} ${styles[`status_${step.status}`]}`}>
                <span className={styles.serviceIcon}>{STATUS_ICON[step.status] ?? '\u00B7'}</span>
                <span className={styles.serviceName}>{step.label}</span>
                <span className={styles.serviceStatus}>{STATUS_LABEL[step.status] ?? step.status}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Service steps */}
        {services.length > 0 && (
          <ul className={styles.serviceList}>
            {services.map((svc) => (
              <li key={svc.name} className={`${styles.serviceRow} ${styles[`status_${svc.status}`]}`}>
                <span className={styles.serviceIcon}>{STATUS_ICON[svc.status] ?? '\u00B7'}</span>
                <span className={styles.serviceName}>{SERVICE_LABELS[svc.name] ?? svc.name}</span>
                <span className={styles.serviceStatus}>
                  {svc.subStep && svc.status === 'running'
                    ? svc.subStep
                    : STATUS_LABEL[svc.status] ?? svc.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
