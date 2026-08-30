/**
 * FacilityList — Scrollable list of owned facilities, grouped by state (H6).
 *
 * Three sections: "Losing money" (server alert bit on a loaded building),
 * "Status unknown" (zone never loaded — honestly unknown, never assumed
 * healthy), "Operating". Clicking a row pans the map and opens the building
 * inspector — which also loads the zone and resolves an unknown state.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { useUiStore } from '../../store/ui-store';
import { useBuildingStore } from '../../store/building-store';
import { useMapStore } from '../../store/map-store';
import { useClient } from '../../context';
import type { FavoritesItem } from '@/shared/types';
import { classifyFacilities } from './facility-status';
import styles from './FacilityList.module.css';

type FacilityState = 'losing' | 'unknown' | 'operating';

/**
 * `TFavorites.RDORenameItem` keeps the first 50 characters and drops the rest
 * (`Kernel/Favorites.pas:283`). The input stops there so the player never types
 * a name the server will silently shorten.
 */
const FAV_NAME_MAX = 50;

interface FacilityRowProps {
  facility: FavoritesItem;
  state: FacilityState;
  onClick: (facility: FavoritesItem) => void;
  onRename: (facility: FavoritesItem, name: string) => void;
  onRemove: (facility: FavoritesItem) => void;
}

const DOT_CLASS: Record<FacilityState, string> = {
  losing: 'dotLosing',
  unknown: 'dotUnknown',
  operating: 'dotOperating',
};

const FacilityRow = memo(function FacilityRow({
  facility, state, onClick, onRename, onRemove,
}: FacilityRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(facility.name);

  const startEditing = () => {
    setDraft(facility.name);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    // An unchanged or empty name is not a rename — do not spend a round trip
    // on it, and never send the empty string the server would happily store.
    if (next && next !== facility.name) {
      onRename(facility, next);
    }
  };

  if (editing) {
    return (
      <div className={styles.row}>
        <input
          className={styles.renameInput}
          value={draft}
          maxLength={FAV_NAME_MAX}
          autoFocus
          aria-label={`Rename ${facility.name}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className={styles.row}>
      <button
        className={styles.rowMain}
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
      <div className={styles.rowActions}>
        <button
          className={styles.rowAction}
          title={`Rename ${facility.name}`}
          aria-label={`Rename ${facility.name}`}
          onClick={startEditing}
        >
          ✎
        </button>
        <button
          className={styles.rowAction}
          // "Remove from list", never "delete": this removes the bookmark, it
          // does not touch the building.
          title={`Remove ${facility.name} from list`}
          aria-label={`Remove ${facility.name} from list`}
          onClick={() => onRemove(facility)}
        >
          ✕
        </button>
      </div>
    </div>
  );
});

interface FacilityListProps {
  facilities: FavoritesItem[];
}

export function FacilityList({ facilities }: FacilityListProps) {
  const openRightPanel = useUiStore((s) => s.openRightPanel);
  const source = useMapStore((s) => s.source);
  const client = useClient();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const groups = useMemo(
    () => classifyFacilities(facilities, source?.getAllBuildings?.() ?? []),
    [facilities, source],
  );

  const handleClick = useCallback((facility: FavoritesItem) => {
    useBuildingStore.getState().setLoading(true);
    openRightPanel('building');
    client.onNavigateToBuilding(facility.x, facility.y);
  }, [openRightPanel, client]);

  const handleRename = useCallback((facility: FavoritesItem, name: string) => {
    client.onRenameFavorite(facility.path, name);
  }, [client]);

  const handleRemove = useCallback((facility: FavoritesItem) => {
    client.onRemoveFavorite(facility.path, facility.name);
  }, [client]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const renderTreeItem = (item: FavoritesItem, level: number, state: FacilityState) => {
    const isFolder = item.kind === 0;
    const isExpanded = expandedFolders.has(item.path);
    const indentStyle = { paddingLeft: `${level * 20}px` };

    if (isFolder) {
      return (
        <div key={item.id}>
          <div
            className={styles.row}
            style={indentStyle}
          >
            <button
              className={styles.rowMain}
              onClick={() => toggleFolder(item.path)}
              style={{ flex: 1, textAlign: 'left' }}
            >
              <div className={styles.rowLeft}>
                <span className={styles.name}>
                  <span aria-hidden="true">
                    {isExpanded ? '📁' : '📂'}
                  </span>
                  {' '}
                  {item.name}
                </span>
              </div>
            </button>
          </div>
          {isExpanded && item.children && item.children.map((child) =>
            renderTreeItem(child, level + 1, state)
          )}
        </div>
      );
    }

    // Render as item (kind === 1)
    return (
      <div key={item.id} style={indentStyle}>
        <FacilityRow
          facility={item}
          state={state}
          onClick={handleClick}
          onRename={handleRename}
          onRemove={handleRemove}
        />
        {item.children && item.children.map((child) =>
          renderTreeItem(child, level + 1, state)
        )}
      </div>
    );
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
      <div className={styles.sectionHeader}>
        Losing money{groups.losing.length > 0 ? ` (${groups.losing.length})` : ''}
      </div>
      {groups.losing.length === 0 ? (
        <div className={styles.sectionEmpty}>
          No facility is losing money in the areas you&apos;ve visited.
        </div>
      ) : (
        groups.losing.map((f) => renderTreeItem(f, 0, 'losing'))
      )}

      {groups.unknown.length > 0 && (
        <>
          <div className={styles.sectionHeader}>Status unknown</div>
          <div className={styles.sectionNote}>Not visited yet — tap to check.</div>
          {groups.unknown.map((f) => renderTreeItem(f, 0, 'unknown'))}
        </>
      )}

      {groups.operating.length > 0 && (
        <>
          <div className={styles.sectionHeader}>Operating</div>
          {groups.operating.map((f) => renderTreeItem(f, 0, 'operating'))}
        </>
      )}
    </div>
  );
}
