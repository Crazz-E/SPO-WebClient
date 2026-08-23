/**
 * RightRail — Map controls on the right edge.
 *
 * Bottom-right corner, z-200.
 * Zoom in/out, minimap toggle, overlay toggle, refresh.
 */

import { ZoomIn, ZoomOut, Bug, RefreshCw, Map } from 'lucide-react';
import { IconButton } from '../common';
import { useUiStore } from '../../store/ui-store';
import { useClient } from '../../context';
import styles from './RightRail.module.css';

export function RightRail() {
  const client = useClient();
  const surfaceOpen = useUiStore((s) => s.stack.length > 0);

  const railClass = [styles.rail, surfaceOpen ? styles.shifted : ''].filter(Boolean).join(' ');

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
          icon={<Map size={18} />}
          label="Toggle Minimap"
          size="md"
          variant="glass"
          onClick={() => client.onToggleMinimap()}
        />
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
