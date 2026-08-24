/**
 * FacilityList — Scrollable list of owned facilities, grouped by state (H6).
 *
 * Three sections: "Losing money" (server alert bit on a loaded building),
 * "Status unknown" (zone never loaded — honestly unknown, never assumed
 * healthy), "Operating". Clicking a row pans the map and opens the building
 * inspector — which also loads the zone and resolves an unknown state.
 */

import { memo, useCallback, useMemo } from 'react';
import { useUiStore } from '../../store/ui-store';
import { useBuildingStore } from '../../store/building-store';
import { useMapStore } from '../../store/map-store';
import { useClient } from '../../context';
import type { FavoritesItem } from '@/shared/types';
import { classifyFacilities } from './facility-status';
import styles from './FacilityList.module.css';

type FacilityState = 'losing' | 'unknown' | 'operating';

interface FacilityRowProps {
  facility: FavoritesItem;
  state: FacilityState;
  onClick: (facility: FavoritesItem) => void;
}

const DOT_CLASS: Record<FacilityState, string> = {
  losing: 'dotLosing',
  unknown: 'dotUnknown',
  operating: 'dotOperating',
};

const FacilityRow = memo(function FacilityRow({ facility, state, onClick }: FacilityRowProps) {
  return (
    <button
      className={styles.row}
      onClick={() => onClick(facility)}
    >
      <div className={styles.rowLeft}>
        <span className={styles.name}>
          <span className={`${styles.dot} ${styles[DOT_CLASS[state]]}`} aria-hidden="true" />
          {facility.name}
        </span>
        <span className={styles.category}>{facility.x}, {facility.y}</span>
      </div>
    </button>
  );
});

interface FacilityListProps {
  facilities: FavoritesItem[];
}

export function FacilityList({ facilities }: FacilityListProps) {
  const openRightPanel = useUiStore((s) => s.openRightPanel);
  const source = useMapStore((s) => s.source);
  const client = useClient();

  const groups = useMemo(
    () => classifyFacilities(facilities, source?.getAllBuildings?.() ?? []),
    [facilities, source],
  );

  const handleClick = useCallback((facility: FavoritesItem) => {
    useBuildingStore.getState().setLoading(true);
    openRightPanel('building');
    client.onNavigateToBuilding(facility.x, facility.y);
  }, [openRightPanel, client]);

  if (facilities.length === 0) {
    return (
      <div className={styles.empty}>
        No facilities found
      </div>
    );
  }

  return (
    <div className={styles.list}>
      <div className={styles.sectionHeader}>
        Losing money{groups.losing.length > 0 ? ` (${groups.losing.length})` : ''}
      </div>
      {groups.losing.length === 0 ? (
        <div className={styles.sectionEmpty}>
          No facility is losing money in the areas you&apos;ve visited.
        </div>
      ) : (
        groups.losing.map((f) => (
          <FacilityRow key={f.id} facility={f} state="losing" onClick={handleClick} />
        ))
      )}

      {groups.unknown.length > 0 && (
        <>
          <div className={styles.sectionHeader}>Status unknown</div>
          <div className={styles.sectionNote}>Not visited yet — tap to check.</div>
          {groups.unknown.map((f) => (
            <FacilityRow key={f.id} facility={f} state="unknown" onClick={handleClick} />
          ))}
        </>
      )}

      {groups.operating.length > 0 && (
        <>
          <div className={styles.sectionHeader}>Operating</div>
          {groups.operating.map((f) => (
            <FacilityRow key={f.id} facility={f} state="operating" onClick={handleClick} />
          ))}
        </>
      )}
    </div>
  );
}
