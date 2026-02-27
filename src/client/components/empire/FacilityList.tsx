/**
 * FacilityList — Scrollable list of owned facilities.
 * Clicking a row pans the map and opens the building inspector.
 */

import { useUiStore } from '../../store/ui-store';
import { useClient } from '../../context';
import type { OwnedFacility } from '../../store/empire-store';
import styles from './FacilityList.module.css';

interface FacilityListProps {
  facilities: OwnedFacility[];
}

const STATUS_ICONS: Record<string, string> = {
  operating: '\u25CF', // ●
  alert: '\u26A0',     // ⚠
  upgrading: '\u2191',  // ↑
  closed: '\u2715',     // ✕
};

export function FacilityList({ facilities }: FacilityListProps) {
  const openRightPanel = useUiStore((s) => s.openRightPanel);
  const client = useClient();

  const handleClick = (facility: OwnedFacility) => {
    openRightPanel('building');
    client.onNavigateToBuilding(facility.x, facility.y);
  };

  if (facilities.length === 0) {
    return (
      <div className={styles.empty}>
        No facilities found
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {facilities.map((f) => (
        <button
          key={f.buildingId}
          className={styles.row}
          onClick={() => handleClick(f)}
        >
          <div className={styles.rowLeft}>
            <span className={styles.name}>{f.name}</span>
            <span className={styles.category}>{f.category}</span>
          </div>
          <div className={styles.rowRight}>
            <span className={styles.revenue}>${f.revenue}/h</span>
            <span className={`${styles.status} ${styles[f.status]}`}>
              {STATUS_ICONS[f.status] ?? ''} {f.status}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
