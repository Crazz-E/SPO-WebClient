/**
 * The single mount point of the bug-reporting feature.
 *
 * Mounted from `main.tsx` rather than `App.tsx` so it survives the Login → Game transition,
 * and lazily so that a build without `SPO_BUG_REPORT` never fetches the chunk at all.
 *
 * It owns three things and nothing else: arming the journal, the F8 listener, and the
 * armed → captured → submitted walk between the overlay and the modal.
 */

import { useCallback, useEffect, useState } from 'react';
import { useClient } from '../context';
import { useUiStore } from '../store/ui-store';
import { showToast } from '../components/common/Toast';
import type { ReportAnchor } from '../../shared/bug-report-schema';
import { reportJournal } from './journal';
import { resolveDomAnchor } from './dom-anchor';
import { submitReport } from './report-submit';
import { ReportModeOverlay } from './ReportModeOverlay';
import { ReportModal, type ReportModalSubmission } from './ReportModal';

/** The map canvas, the one element the DOM walk cannot describe. */
const CANVAS_ID = 'game-canvas';

interface Captured {
  anchor: ReportAnchor;
  observedDefault: string;
}

export function BugReportRoot() {
  const client = useClient();
  const [armed, setArmed] = useState(false);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The journal runs from mount, not from arming: nobody arms a mode *before* noticing a
  // problem, and the 60 seconds that led up to F8 are the evidence.
  useEffect(() => {
    reportJournal.arm(
      listener => useUiStore.subscribe(listener),
      () => useUiStore.getState().stack,
    );
    return () => reportJournal.disarm();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'F8') return;
      event.preventDefault();
      setArmed(current => !current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const onCapture = useCallback((element: Element, clientX: number, clientY: number) => {
    setArmed(false);
    if (element.id === CANVAS_ID) {
      const probe = client.onGetCanvasAnchor?.(clientX, clientY) ?? null;
      if (!probe) {
        showToast('The map is not ready — nothing to anchor the report on.', 'warning');
        return;
      }
      const screenshotDataUrl = client.onGetCanvasScreenshot?.() ?? undefined;
      setCaptured({
        anchor: { kind: 'canvas', ...probe, ...(screenshotDataUrl ? { screenshotDataUrl } : {}) },
        observedDefault: '',
      });
      return;
    }
    const anchor = resolveDomAnchor(element);
    setCaptured({ anchor, observedDefault: anchor.text });
  }, [client]);

  const onSubmit = useCallback(async (submission: ReportModalSubmission) => {
    if (!captured) return;
    setSubmitting(true);
    const outcome = await submitReport({
      profile: 'desktop',
      kind: submission.kind,
      anchor: captured.anchor,
      username: client.onGetUsername?.() ?? '',
      world: client.onGetWorld?.() ?? '',
      observed: submission.observed,
      expected: submission.expected,
      freeText: submission.freeText,
    });
    setSubmitting(false);
    setCaptured(null);
    if (outcome.ok) showToast(`Report queued: ${outcome.detail}`, 'success', { title: 'Reported' });
    else showToast(`Report not sent: ${outcome.detail}`, 'error');
  }, [captured, client]);

  return (
    <>
      {armed && !captured && (
        <ReportModeOverlay onCapture={onCapture} onCancel={() => setArmed(false)} />
      )}
      {captured && (
        <ReportModal
          anchor={captured.anchor}
          observedDefault={captured.observedDefault}
          onSubmit={onSubmit}
          onCancel={() => setCaptured(null)}
          submitting={submitting}
        />
      )}
    </>
  );
}
