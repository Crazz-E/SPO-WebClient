/**
 * useSheetGesture — Touch gesture hook for BottomSheet drag-to-snap.
 *
 * Tracks touchstart/touchmove/touchend on a drag handle to move the sheet
 * via translateY for 60fps performance. Snaps to peek/half/full on release.
 * Velocity-based: fast flick up → full, fast flick down → dismiss.
 */

import { useRef, useCallback, useState, type RefObject } from 'react';

export type SnapPoint = 'peek' | 'half' | 'full';

interface SheetGestureOptions {
  /** Called when the user flicks down past the dismiss threshold */
  onDismiss: () => void;
  /** Initial snap point (default: 'peek') */
  initialSnap?: SnapPoint;
}

interface SheetGestureResult {
  /** Ref to attach to the sheet element */
  sheetRef: RefObject<HTMLDivElement | null>;
  /** Ref to attach to the drag handle element */
  handleRef: RefObject<HTMLElement | null>;
  /** Current snap point */
  snap: SnapPoint;
  /** Set snap point programmatically */
  setSnap: (snap: SnapPoint) => void;
  /** Current translateY offset during drag (0 when not dragging) */
  dragOffset: number;
  /** Whether the user is currently dragging */
  isDragging: boolean;
  /** Touch event handlers to attach to the handle */
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: () => void;
}

/** Velocity threshold (px/s) to trigger snap-to-full or dismiss */
const VELOCITY_THRESHOLD = 800;

/** Distance (px) below peek to trigger dismiss */
const DISMISS_THRESHOLD = 80;

export function useSheetGesture(options: SheetGestureOptions): SheetGestureResult {
  const { onDismiss, initialSnap = 'peek' } = options;
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLElement | null>(null);

  const [snap, setSnap] = useState<SnapPoint>(initialSnap);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Touch tracking refs (don't trigger re-renders during drag)
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const lastTouchY = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartY.current = touch.clientY;
    lastTouchY.current = touch.clientY;
    touchStartTime.current = Date.now();
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const deltaY = touch.clientY - touchStartY.current;
    lastTouchY.current = touch.clientY;
    setDragOffset(deltaY);
  }, []);

  const handleTouchEnd = useCallback(() => {
    const deltaY = lastTouchY.current - touchStartY.current;
    const elapsed = Date.now() - touchStartTime.current;
    const velocity = elapsed > 0 ? (deltaY / elapsed) * 1000 : 0; // px/s

    setIsDragging(false);
    setDragOffset(0);

    // Fast flick down → dismiss
    if (velocity > VELOCITY_THRESHOLD) {
      onDismiss();
      return;
    }

    // Fast flick up → go to full
    if (velocity < -VELOCITY_THRESHOLD) {
      setSnap('full');
      return;
    }

    // Slow drag: determine direction and snap accordingly
    if (deltaY > DISMISS_THRESHOLD && snap === 'peek') {
      // Dragged down past peek → dismiss
      onDismiss();
    } else if (deltaY > 60) {
      // Dragged down → go one step down
      if (snap === 'full') setSnap('half');
      else if (snap === 'half') setSnap('peek');
      else onDismiss();
    } else if (deltaY < -60) {
      // Dragged up → go one step up
      if (snap === 'peek') setSnap('half');
      else if (snap === 'half') setSnap('full');
    }
    // else: small movement → stay at current snap
  }, [snap, onDismiss]);

  return {
    sheetRef,
    handleRef,
    snap,
    setSnap,
    dragOffset,
    isDragging,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
