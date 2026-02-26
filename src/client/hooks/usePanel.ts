/**
 * usePanel — Hook for panel open/close with animation state.
 * Manages the visible+animating two-phase pattern for CSS transitions.
 */

import { useState, useEffect, useCallback } from 'react';

interface PanelAnimationState {
  /** Whether the panel DOM should be mounted */
  visible: boolean;
  /** Whether the panel is in its "open" CSS state */
  animating: boolean;
  /** Trigger close animation then unmount */
  close: () => void;
}

const ANIMATION_DURATION = 250;

export function usePanel(open: boolean): PanelAnimationState {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      // Trigger animation on next frame for CSS transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    } else if (visible) {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), ANIMATION_DURATION);
      return () => clearTimeout(timer);
    }
  }, [open, visible]);

  const close = useCallback(() => {
    setAnimating(false);
    setTimeout(() => setVisible(false), ANIMATION_DURATION);
  }, []);

  return { visible, animating, close };
}
