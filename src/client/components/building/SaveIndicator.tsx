/**
 * SaveIndicator — inline visual feedback for optimistic SET commands.
 *
 * Renders next to slider/input values to show:
 *  - Pending: pulsing gold dot while server processes the change
 *  - Confirmed: brief green checkmark that auto-fades
 *  - Failed: red "!" + "Failed — reason", announced as an alert, auto-clears
 *
 * A checkmark is a claim — "the server holds this value now" — and most writes
 * cannot support it. Which of the two the indicator shows is decided by the
 * VERDICT the gateway returned, not by the call site: `'confirmed'` gets the
 * tick, `'unconfirmed'` gets the muted "Sent" instead (OB-1). The two used to
 * render identically, so a connection the server discarded looked exactly like
 * one it made.
 *
 * `confirmedMessage` is what an unconfirmed write says in place of "Sent" when
 * the call site has something more useful to tell the player. `RDOSetTaxValue`
 * is the case in hand: a Pascal `procedure`, so nothing comes back, and its
 * cached read-back only refreshes when the Town Hall object's TTL expires
 * (`Kernel/Population.pas:1192`), because the server invalidates the TOWN
 * rather than the facility that carries `Tax<i>Percent` (`:1285`). It is
 * ignored on a confirmed write, which needs no excuse.
 */

import { useEffect, useRef } from 'react';
import { useBuildingStore } from '@/client/store/building-store';
import styles from './SaveIndicator.module.css';

/** A checkmark is read at a glance; a sentence is not. */
const CONFIRMED_DWELL_MS = 1500;
const MESSAGE_DWELL_MS = 5000;

/**
 * What an unconfirmed write says when the call site offers no better sentence.
 * Short enough to sit beside a slider, and it does not claim the write landed.
 */
const SENT_LABEL = 'Sent';
const SENT_TITLE = 'Sent to the server, which did not confirm it';

interface SaveIndicatorProps {
  /** Unique key matching the pendingKey used in setBuildingProperty. */
  propertyKey: string;
  /** Shown instead of "Sent" when the write comes back unconfirmed. */
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
      const dwell = confirmed.verdict === 'unconfirmed' ? MESSAGE_DWELL_MS : CONFIRMED_DWELL_MS;
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
      <span className={`${styles.indicator} ${styles.pending}`} title="Saving…">
        <span className={styles.pendingDot} aria-hidden="true" />
        <span className={styles.srOnly}>Saving…</span>
      </span>
    );
  }

  if (confirmed) {
    // OB-1: the verdict decides, not the call site. An unconfirmed write says so
    // — in the call site's own words when it has them, otherwise in one word.
    if (confirmed.verdict === 'unconfirmed') {
      if (confirmedMessage) {
        return (
          <span className={`${styles.indicator} ${styles.notice}`} role="status">
            {confirmedMessage}
          </span>
        );
      }
      return (
        <span className={`${styles.indicator} ${styles.sent}`} role="status" title={SENT_TITLE}>
          <span className={styles.sentIcon} aria-hidden="true">&#8599;</span>
          <span className={styles.sentText}>{SENT_LABEL}</span>
          <span className={styles.srOnly}>{SENT_TITLE}</span>
        </span>
      );
    }
    return (
      <span className={`${styles.indicator} ${styles.confirmed}`} title="Saved">
        <span className={styles.checkmark} aria-hidden="true">&#10003;</span>
        <span className={styles.srOnly}>Saved</span>
      </span>
    );
  }

  // A failure is said in words and announced (role="alert"); the server's reason is
  // visible, not hidden in a tooltip — audit §3.2 found the failed state was silent.
  if (failed) {
    return (
      <span className={`${styles.indicator} ${styles.failed}`} role="alert" title={failed.error}>
        <span className={styles.failedIcon} aria-hidden="true">!</span>
        <span className={styles.failedText}>Failed</span>
        {failed.error && <span className={styles.failedReason}>— {failed.error}</span>}
      </span>
    );
  }

  return null;
}
