/**
 * MobileModeBar — the mode bar of the mobile command bar (handoff 00 §4.2).
 *
 * Roads and zone painting outlive the tap that started them: the sheet closes, the player is
 * back on the map, and until this bar existed nothing on the screen said the next drag would
 * draw a road. It takes the place of BottomNav for as long as the mode lasts — the same words
 * as the desktop mode bar (`useModeDescriptor`) on two lines, plus one 44 px "Done" that
 * leaves the mode. Placement keeps its own PlacementHUD (Cancel / Rotate / Confirm).
 */

import { Check } from 'lucide-react';
import type { ModeDescriptor } from '../hud/use-mode-descriptor';
import styles from './MobileModeBar.module.css';

export function MobileModeBar({ mode }: { mode: ModeDescriptor }) {
  return (
    <div className={styles.bar}>
      <div className={styles.text} role="status" aria-live="polite">
        <span className={styles.line}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.kind}>{mode.kind}</span>
          <span className={styles.title}>{mode.title}</span>
        </span>
        <span className={`${styles.hint} ${mode.invalid ? styles.invalid : ''}`}>
          {mode.hint}
          {mode.overlayNote ? ` · ${mode.overlayNote}` : ''}
        </span>
      </div>
      <button type="button" className={styles.done} onClick={mode.onDone} aria-label={`Done — leave ${mode.kind} mode`}>
        <Check size={20} aria-hidden="true" />
        <span className={styles.doneLabel}>Done</span>
      </button>
    </div>
  );
}
