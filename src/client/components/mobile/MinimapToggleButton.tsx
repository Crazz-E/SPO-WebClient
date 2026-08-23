/**
 * MinimapToggleButton — Top-right triangle button on mobile: opens the Map surface (Carte lot)
 * in the sheet — the data map with Back / Next, nearest Town Hall, zoom. Tap a spot to go there.
 */

import { Map } from 'lucide-react';
import { useUiStore } from '../../store/ui-store';
import styles from './MinimapToggleButton.module.css';

export function MinimapToggleButton() {
  const toggle = useUiStore((s) => s.toggleMapSurface);

  return (
    <button
      className={styles.trigger}
      onClick={toggle}
      aria-label="Open map"
    >
      <Map size={16} />
    </button>
  );
}
