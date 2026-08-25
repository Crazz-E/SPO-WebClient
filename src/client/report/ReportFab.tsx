/**
 * The mobile report button: a draggable 56×56 target that arms report mode on a tap.
 *
 * 56 px is comfortably over the 44 px minimum — the same threshold `geometry.ts` measures
 * every flagged control against, so the reporting tool had better clear it.
 *
 * It renders outside the canvas and outside `MobileShell`, which is what keeps map pan and
 * zoom untouched: the renderer's touch listeners are attached to the canvas element only.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './ReportFab.module.css';

/** Movement under this counts as a tap, not a drag. */
export const TAP_SLOP_PX = 8;
export const FAB_SIZE_PX = 56;
export const FAB_POSITION_KEY = 'spo-report-fab-pos';

export interface FabPosition {
  x: number;
  y: number;
}

export interface ReportFabProps {
  armed: boolean;
  onToggleArmed: () => void;
}

function readInsets(): { top: number; right: number; bottom: number; left: number } {
  const style = getComputedStyle(document.documentElement);
  const px = (name: string): number => Number.parseFloat(style.getPropertyValue(name)) || 0;
  return {
    top: px('--sai-top'), right: px('--sai-right'),
    bottom: px('--sai-bottom'), left: px('--sai-left'),
  };
}

/** Keep the button reachable: inside the viewport, clear of the safe-area insets. */
export function clampToViewport(
  position: FabPosition,
  viewport: { width: number; height: number },
  insets: { top: number; right: number; bottom: number; left: number },
): FabPosition {
  const maxX = Math.max(insets.left, viewport.width - insets.right - FAB_SIZE_PX);
  const maxY = Math.max(insets.top, viewport.height - insets.bottom - FAB_SIZE_PX);
  return {
    x: Math.min(Math.max(position.x, insets.left), maxX),
    y: Math.min(Math.max(position.y, insets.top), maxY),
  };
}

/** Right edge, above where BottomNav sits. */
function defaultPosition(): FabPosition {
  return {
    x: window.innerWidth - FAB_SIZE_PX - 12,
    y: window.innerHeight - FAB_SIZE_PX - 56 - 24,
  };
}

function loadPosition(): FabPosition | null {
  try {
    const raw = window.localStorage.getItem(FAB_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FabPosition>;
    return typeof parsed?.x === 'number' && typeof parsed?.y === 'number'
      ? { x: parsed.x, y: parsed.y }
      : null;
  } catch {
    // A corrupt or unavailable localStorage is not a reason to lose the button.
    return null;
  }
}

function savePosition(position: FabPosition): void {
  try {
    window.localStorage.setItem(FAB_POSITION_KEY, JSON.stringify(position));
  } catch {
    // Private mode, quota, disabled storage — the button still works, it just forgets.
  }
}

export function ReportFab({ armed, onToggleArmed }: ReportFabProps) {
  const [position, setPosition] = useState<FabPosition>(() =>
    clampToViewport(
      loadPosition() ?? defaultPosition(),
      { width: window.innerWidth, height: window.innerHeight },
      readInsets(),
    )
  );
  // Drag bookkeeping in a ref: it changes on every pointermove and must not re-render.
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const onToggle = useRef(onToggleArmed);
  onToggle.current = onToggleArmed;

  useEffect(() => {
    const onResize = (): void => {
      setPosition(current =>
        clampToViewport(current, { width: window.innerWidth, height: window.innerHeight }, readInsets())
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
    // Capture, so a fast drag that leaves the button still belongs to it.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [position.x, position.y]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) <= TAP_SLOP_PX) return;
    state.moved = true;
    setPosition(clampToViewport(
      { x: state.originX + dx, y: state.originY + dy },
      { width: window.innerWidth, height: window.innerHeight },
      readInsets(),
    ));
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (state.moved) {
      setPosition(current => { savePosition(current); return current; });
      return;
    }
    onToggle.current();
  }, []);

  return (
    <button
      type="button"
      className={`${styles.fab} ${armed ? styles.armed : ''}`}
      style={{ left: position.x, top: position.y }}
      aria-label={armed ? 'Cancel report mode' : 'Report a bug'}
      aria-pressed={armed}
      data-testid="report-fab"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className={styles.glyph} aria-hidden="true">🐞</span>
    </button>
  );
}
