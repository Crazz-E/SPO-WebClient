/**
 * RightRail — Map controls on the right edge.
 *
 * Bottom-right corner, z-200.
 * Compass, zoom in/out, minimap toggle, overlay toggles, refresh.
 */

import { Compass, ZoomIn, ZoomOut, Map, Layers, RefreshCw } from 'lucide-react';
import { IconButton } from '../common';
import styles from './RightRail.module.css';

export function RightRail() {
  // Bridge callbacks for map controls
  const getBridge = () =>
    (window.__spoReactCallbacks ?? {}) as Record<string, (...args: unknown[]) => void>;

  return (
    <nav className={styles.rail} aria-label="Map controls">
      {/* Compass */}
      <div className={styles.group}>
        <IconButton
          icon={<Compass size={22} />}
          label="Compass"
          size="lg"
          variant="glass"
        />
      </div>

      <div className={styles.divider} />

      {/* Zoom controls */}
      <div className={styles.group}>
        <IconButton
          icon={<ZoomIn size={18} />}
          label="Zoom In (+)"
          size="md"
          variant="glass"
        />
        <IconButton
          icon={<ZoomOut size={18} />}
          label="Zoom Out (-)"
          size="md"
          variant="glass"
        />
      </div>

      <div className={styles.divider} />

      {/* Map utilities */}
      <div className={styles.group}>
        <IconButton
          icon={<Map size={18} />}
          label="Minimap"
          size="md"
          variant="glass"
        />
        <IconButton
          icon={<Layers size={18} />}
          label="Overlays"
          size="md"
          variant="glass"
        />
        <IconButton
          icon={<RefreshCw size={18} />}
          label="Refresh (R)"
          size="md"
          variant="glass"
          onClick={() => getBridge().onRefreshMap?.()}
        />
      </div>
    </nav>
  );
}
