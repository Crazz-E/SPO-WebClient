/**
 * Report mode, made visible: a highlight that follows the pointer, and a click that flags
 * instead of acting.
 *
 * Every visual element carries `pointer-events: none` so `document.elementFromPoint` keeps
 * resolving the real control underneath. The interception is done by capture-phase listeners
 * on `window`, not by a shield element — a shield would become the answer to every hit-test.
 */

import { useEffect, useRef, useState } from 'react';
import styles from './ReportModeOverlay.module.css';

export interface ReportModeOverlayProps {
  /** The element the human flagged, with the point they flagged it at. */
  onCapture: (element: Element, clientX: number, clientY: number) => void;
  onCancel: () => void;
}

interface HighlightBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The element under the pointer, ignoring anything this overlay itself rendered. */
function elementUnder(clientX: number, clientY: number): Element | null {
  if (typeof document.elementFromPoint !== 'function') return null;
  return document.elementFromPoint(clientX, clientY);
}

export function ReportModeOverlay({ onCapture, onCancel }: ReportModeOverlayProps) {
  const [box, setBox] = useState<HighlightBox | null>(null);
  // Read through a ref so the listeners can stay registered for the overlay's whole life:
  // re-registering capture-phase handlers on every render would drop events in between.
  const handlers = useRef({ onCapture, onCancel });
  handlers.current = { onCapture, onCancel };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      const element = elementUnder(event.clientX, event.clientY);
      if (!element) return setBox(null);
      const rect = element.getBoundingClientRect();
      setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };

    const onClick = (event: MouseEvent): void => {
      const element = elementUnder(event.clientX, event.clientY);
      // The flagged control must not fire — the human is reporting it, not using it.
      event.preventDefault();
      event.stopPropagation();
      if (element) handlers.current.onCapture(element, event.clientX, event.clientY);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // Capture phase + stopPropagation, so the global Escape handler never unstacks the
      // surface sitting behind the overlay.
      event.preventDefault();
      event.stopPropagation();
      handlers.current.onCancel();
    };

    window.addEventListener('pointermove', onPointerMove, { capture: true });
    window.addEventListener('click', onClick, { capture: true });
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove, { capture: true });
      window.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, []);

  return (
    <div className={styles.layer} data-testid="report-mode-overlay">
      <div className={styles.hint}>Report mode — click what is wrong · Esc to cancel</div>
      {box && (
        <div
          className={styles.highlight}
          data-testid="report-highlight"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        />
      )}
    </div>
  );
}
