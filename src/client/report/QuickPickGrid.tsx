/**
 * The mobile report sheet: six one-tap options, and typing is optional.
 *
 * That is the whole ergonomics argument. Typing on a phone breaks the test session you are in
 * the middle of, so a report made of taps alone has to be enough for triage — which it is,
 * because the geometry numbers and the journal carry the evidence, not the prose.
 */

import { useState } from 'react';
import type { BugReportKind, MobileQuickPick, ReportAnchor } from '../../shared/bug-report-schema';
import type { GeometryCapture } from '../../shared/bug-report-schema';
import { describeTarget } from './geometry';
import styles from './QuickPickGrid.module.css';

const PICKS: ReadonlyArray<{ value: MobileQuickPick; label: string }> = [
  { value: 'too-small', label: 'Too small' },
  { value: 'covered', label: 'Covered' },
  { value: 'out-of-reach', label: 'Out of reach' },
  { value: 'cut-off', label: 'Cut off' },
  { value: 'no-response', label: 'Does not respond' },
  { value: 'wrong-data', label: 'Wrong data' },
  // Not a defect symptom: "this works, but could be better" -- see bug-report-schema.ts's own
  // comment on BugReportKind's `suggestion` value.
  { value: 'could-be-better', label: 'Could be better' },
];

/**
 * The report kind, derived from the picks rather than asked for separately — one less decision
 * on a phone. `could-be-better` wins over every other pick first: it is the reporter saying
 * outright "this isn't broken", and a defect symptom picked alongside it by habit must not
 * override that. Otherwise data beats action beats appearance, because that is the order in
 * which a wrong answer costs the most.
 */
export function kindFromPicks(picks: MobileQuickPick[]): BugReportKind {
  if (picks.includes('could-be-better')) return 'suggestion';
  if (picks.includes('wrong-data')) return 'wrong-data';
  if (picks.includes('no-response')) return 'broken-action';
  return 'visual';
}

export interface QuickPickSubmission {
  quickPicks: MobileQuickPick[];
  kind: BugReportKind;
  freeText: string;
}

export interface QuickPickGridProps {
  anchor: ReportAnchor;
  geometry?: GeometryCapture;
  onSubmit: (submission: QuickPickSubmission) => void;
  onCancel: () => void;
  submitting?: boolean;
}

function describeAnchor(anchor: ReportAnchor): string {
  return anchor.kind === 'dom'
    ? anchor.componentChain.join(' › ') || anchor.cssChain
    : `map tile ${anchor.tileX},${anchor.tileY} (${anchor.layer})`;
}

export function QuickPickGrid({ anchor, geometry, onSubmit, onCancel, submitting }: QuickPickGridProps) {
  const [picks, setPicks] = useState<MobileQuickPick[]>([]);
  const [freeText, setFreeText] = useState('');

  const toggle = (value: MobileQuickPick): void => {
    setPicks(current =>
      current.includes(value) ? current.filter(p => p !== value) : [...current, value]
    );
  };

  // What the measurements already say, shown before anything is typed: it tells the human the
  // capture worked, and it is the same text triage will read.
  const findings = geometry ? describeTarget(geometry) : [];

  return (
    <div className={styles.backdrop} data-testid="report-quick-pick">
      <div className={styles.sheet} role="dialog" aria-label="Report a bug">
        <h2 className={styles.title}>What is wrong?</h2>
        <ul className={styles.findings}>
          <li className={styles.finding}>{describeAnchor(anchor)}</li>
          {findings.map(finding => <li key={finding} className={styles.finding}>{finding}</li>)}
        </ul>

        <div className={styles.grid}>
          {PICKS.map(pick => (
            <button
              key={pick.value}
              type="button"
              className={`${styles.pick} ${picks.includes(pick.value) ? styles.pickActive : ''}`}
              aria-pressed={picks.includes(pick.value)}
              onClick={() => toggle(pick.value)}
            >
              {pick.label}
            </button>
          ))}
        </div>

        <textarea
          className={styles.textarea}
          value={freeText}
          onChange={e => setFreeText(e.target.value)}
          aria-label="Anything else (optional)"
          placeholder="Anything else (optional)"
        />

        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            // Picks alone are a complete report; only an entirely empty one is refused.
            disabled={submitting || (picks.length === 0 && freeText.trim() === '')}
            onClick={() => onSubmit({ quickPicks: picks, kind: kindFromPicks(picks), freeText })}
          >
            {submitting ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
