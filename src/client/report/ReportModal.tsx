/**
 * The desktop report form.
 *
 * *Observed* arrives pre-filled from the flagged element's own text. That is the point of the
 * whole feature: it removes half the typing, and it records what the screen actually said at
 * the moment of the report rather than what the reporter remembers it said.
 */

import { useState } from 'react';
import type { BugReportKind, ReportAnchor } from '../../shared/bug-report-schema';
import styles from './ReportModal.module.css';

const KINDS: ReadonlyArray<{ value: BugReportKind; label: string }> = [
  { value: 'wrong-data', label: 'Wrong data' },
  { value: 'broken-action', label: 'Broken action' },
  { value: 'visual', label: 'Visual' },
  // Not a defect kind: "this works, but could be better" -- the one pick that lets a
  // preference reach the board through this channel at all. See bug-report-schema.ts's own
  // comment on BugReportKind's `suggestion` value.
  { value: 'suggestion', label: 'Could be better' },
];

export interface ReportModalSubmission {
  kind: BugReportKind;
  observed: string;
  expected: string;
  freeText: string;
}

export interface ReportModalProps {
  anchor: ReportAnchor;
  /** The flagged element's text, used to pre-fill *observed*. */
  observedDefault: string;
  onSubmit: (submission: ReportModalSubmission) => void;
  onCancel: () => void;
  submitting?: boolean;
}

/** A one-line description of what was flagged, so the human can see they hit the right thing. */
function describeAnchor(anchor: ReportAnchor): string {
  return anchor.kind === 'dom'
    ? anchor.componentChain.join(' › ') || anchor.cssChain
    : `map tile ${anchor.tileX},${anchor.tileY} (${anchor.layer}${anchor.visualClass ? ` · ${anchor.visualClass}` : ''})`;
}

export function ReportModal({ anchor, observedDefault, onSubmit, onCancel, submitting }: ReportModalProps) {
  const [kind, setKind] = useState<BugReportKind>('wrong-data');
  const [observed, setObserved] = useState(observedDefault);
  const [expected, setExpected] = useState('');
  const [freeText, setFreeText] = useState('');

  return (
    <div className={styles.backdrop} data-testid="report-modal">
      <div className={styles.dialog} role="dialog" aria-label="Report a bug">
        <h2 className={styles.title}>Report a bug</h2>
        <p className={styles.anchor}>{describeAnchor(anchor)}</p>

        <div className={styles.kinds}>
          {KINDS.map(k => (
            <button
              key={k.value}
              type="button"
              className={`${styles.kind} ${kind === k.value ? styles.kindActive : ''}`}
              aria-pressed={kind === k.value}
              onClick={() => setKind(k.value)}
            >
              {k.label}
            </button>
          ))}
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Observed</span>
          <input
            className={styles.input}
            value={observed}
            onChange={e => setObserved(e.target.value)}
            aria-label="Observed"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Expected</span>
          <input
            className={styles.input}
            value={expected}
            onChange={e => setExpected(e.target.value)}
            aria-label="Expected"
            autoFocus
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Anything else (optional)</span>
          <textarea
            className={styles.textarea}
            value={freeText}
            onChange={e => setFreeText(e.target.value)}
            aria-label="Anything else"
          />
        </label>

        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            disabled={submitting}
            onClick={() => onSubmit({ kind, observed, expected, freeText })}
          >
            {submitting ? 'Sending…' : 'Send report'}
          </button>
        </div>
      </div>
    </div>
  );
}
