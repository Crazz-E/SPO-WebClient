/**
 * MobileSearchPill — the search row of the mobile command bar (handoff 00 §4.2).
 *
 * A 44 px glass pill just above the tile row, on the map tab only: one tap opens the
 * CommandPalette (my facilities, towns, x,y, commands — T7). Hidden while a sheet is open or a
 * building is being placed, like the chat banner and the map triangle.
 */

import { Search } from 'lucide-react';
import { useUiStore } from '../../store/ui-store';
import styles from './MobileSearchPill.module.css';

export function MobileSearchPill() {
  const openCommandPalette = useUiStore((s) => s.openCommandPalette);
  return (
    <button type="button" className={styles.pill} onClick={openCommandPalette} aria-label="Search or run a command">
      <Search size={16} aria-hidden="true" />
      <span className={styles.text}>Search my facilities, a town, a command…</span>
    </button>
  );
}
