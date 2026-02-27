/**
 * RightRail — Map controls on the right edge.
 *
 * Bottom-right corner, z-200.
 * Zoom in/out, minimap toggle, overlay toggle, refresh.
 */

import { ZoomIn, ZoomOut, Layers, RefreshCw } from 'lucide-react';
import { IconButton } from '../common';
import { useClient } from '../../context';
import styles from './RightRail.module.css';

export function RightRail() {
  const client = useClient();

  return (
    <nav className={styles.rail} aria-label="Map controls">
      {/* Zoom controls */}
      <div className={styles.group}>
        <IconButton
          icon={<ZoomIn size={18} />}
          label="Zoom In (+)"
          size="md"
          variant="glass"
          onClick={() => client.onZoomIn()}
        />
        <IconButton
          icon={<ZoomOut size={18} />}
          label="Zoom Out (-)"
          size="md"
          variant="glass"
          onClick={() => client.onZoomOut()}
        />
      </div>

      <div className={styles.divider} />

      {/* Map utilities */}
      <div className={styles.group}>
        <IconButton
          icon={<Layers size={18} />}
          label="Overlays (D)"
          size="md"
          variant="glass"
          onClick={() => client.onToggleDebugOverlay()}
        />
        <IconButton
          icon={<RefreshCw size={18} />}
          label="Refresh (R)"
          size="md"
          variant="glass"
          onClick={() => client.onRefreshMap()}
        />
      </div>
    </nav>
  );
}
