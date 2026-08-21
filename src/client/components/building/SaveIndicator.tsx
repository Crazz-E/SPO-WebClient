/**
 * SaveIndicator — inline visual feedback for optimistic SET commands.
 *
 * Renders next to slider/input values to show:
 *  - Pending: pulsing gold dot while server processes the change
 *  - Confirmed: brief green checkmark that auto-fades
 *  - Failed: red "!" with error text that auto-clears
 *
 * `confirmedMessage` replaces the checkmark with a sentence. It exists because
 * a checkmark is a claim — "the server holds this value now" — and some members
 * cannot support that claim. `RDOSetTaxValue` is the case in hand: it is a
 * Pascal `procedure`, so nothing comes back, and its cached read-back only
 * refreshes when the Town Hall object's TTL expires (`Kernel/Population.pas:1192`),
 * because the server invalidates the TOWN rather than the facility that carries
 * `Tax<i>Percent` (`:1285`). A tick there would be inventing a confirmation.
 * A sentence says what actually happened instead.
 */

import { useEffect, useRef } from 'react';
import { useBuildingStore } from '@/client/store/building-store';
import styles from './SaveIndicator.module.css';

/** A checkmark is read at a glance; a sentence is not. */
const CONFIRMED_DWELL_MS = 1500;
const MESSAGE_DWELL_MS = 5000;

interface SaveIndicatorProps {
  /** Unique key matching the pendingKey used in setBuildingProperty. */
  propertyKey: string;
  /** Shown instead of the checkmark when the write cannot be confirmed. */
  confirmedMessage?: string;
}

export function SaveIndicator({ propertyKey, confirmedMessage }: SaveIndicatorProps) {
  const pending = useBuildingStore((s) => s.pendingUpdates.get(propertyKey));
  const confirmed = useBuildingStore((s) => s.confirmedUpdates.get(propertyKey));
  const failed = useBuildingStore((s) => s.failedUpdates.get(propertyKey));
  const clearConfirmed = useBuildingStore((s) => s.clearConfirmed);
  const clearFailed = useBuildingStore((s) => s.clearFailed);

  // Auto-clear confirmed once its animation completes
  const confirmedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (confirmed) {
      const dwell = confirmedMessage ? MESSAGE_DWELL_MS : CONFIRMED_DWELL_MS;
      confirmedTimer.current = setTimeout(() => clearConfirmed(propertyKey), dwell);
      return () => clearTimeout(confirmedTimer.current);
    }
  }, [confirmed, propertyKey, clearConfirmed, confirmedMessage]);

  // Auto-clear failed after 4s
  const failedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (failed) {
      failedTimer.current = setTimeout(() => clearFailed(propertyKey), 4000);
      return () => clearTimeout(failedTimer.current);
    }
  }, [failed, propertyKey, clearFailed]);

  if (pending) {
    return (
      <span className={`${styles.indicator} ${styles.pending}`}>
        <span className={styles.pendingDot} />
      </span>
    );
  }

  if (confirmed) {
    if (confirmedMessage) {
      return (
        <span className={`${styles.indicator} ${styles.notice}`} role="status">
          {confirmedMessage}
        </span>
      );
    }
    return (
      <span className={`${styles.indicator} ${styles.confirmed}`}>
        <span className={styles.checkmark}>&#10003;</span>
      </span>
    );
  }

  if (failed) {
    return (
      <span className={`${styles.indicator} ${styles.failed}`} title={failed.error}>
        <span className={styles.failedIcon}>!</span>
        <span className={styles.failedText}>Failed</span>
      </span>
    );
  }

  return null;
}
