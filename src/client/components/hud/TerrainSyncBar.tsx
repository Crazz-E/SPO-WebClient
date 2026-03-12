/**
 * TerrainSyncBar — Top-center floating bar shown while terrain chunks are rendering.
 * Visible during in-game navigation to uncached areas; hidden during the initial
 * MapLoadingScreen overlay (which has its own progress). Not gated by debug mode.
 */

import { useGameStore } from '../../store/game-store';
import { ProgressBar } from '../common/ProgressBar';
import styles from './TerrainSyncBar.module.css';

export function TerrainSyncBar() {
  const { active, done, total } = useGameStore((s) => s.chunkLoading);
  const mapActive = useGameStore((s) => s.mapLoading.active);

  // Only show while chunks are loading AND the initial map overlay is gone
  if (!active || mapActive || done >= total || total === 0) return null;

  const pct = done / total;

  return (
    <div className={styles.root} role="status" aria-label={`Loading terrain: ${done} of ${total} chunks`}>
      <span className={styles.label}>Rendering terrain {done}/{total}</span>
      <ProgressBar value={pct} variant="primary" height={3} />
    </div>
  );
}
