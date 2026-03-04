/**
 * RightRail — Map controls on the right edge.
 *
 * Bottom-right corner, z-200.
 * Zoom in/out, minimap toggle, overlay toggle, refresh.
 */

import { ZoomIn, ZoomOut, Bug, RefreshCw } from 'lucide-react';
import { IconButton } from '../common';
import { useUiStore } from '../../store/ui-store';
import { useClient } from '../../context';
import styles from './RightRail.module.css';

export function RightRail() {
  const client = useClient();
  const rightPanel = useUiStore((s) => s.rightPanel);

  const railClass = [styles.rail, rightPanel ? styles.shifted : ''].filter(Boolean).join(' ');

  return (
    <nav className={railClass} aria-label="Map controls">
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
          icon={<Bug size={18} />}
          label="Debug (D)"
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
