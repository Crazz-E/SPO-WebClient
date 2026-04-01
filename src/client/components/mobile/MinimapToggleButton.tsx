/**
 * MinimapToggleButton — Top-right triangle button that opens the minimap fullscreen on mobile.
 * Tap the triangle to open; tap on the fullscreen minimap to teleport + auto-close.
 */

import { Map } from 'lucide-react';
import { useUiStore } from '../../store/ui-store';
import styles from './MinimapToggleButton.module.css';

export function MinimapToggleButton() {
  const toggle = useUiStore((s) => s.toggleMinimapFullscreen);

  return (
    <button
      className={styles.trigger}
      onClick={toggle}
      aria-label="Open minimap"
    >
      <Map size={16} />
    </button>
  );
}
