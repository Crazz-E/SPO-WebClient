/**
 * FacilityList — Scrollable list of owned facilities, grouped by state (H6).
 *
 * Three sections: "Losing money" (server alert bit on a loaded building),
 * "Status unknown" (zone never loaded — honestly unknown, never assumed
 * healthy), "Operating". Clicking a row pans the map and opens the building
 * inspector — which also loads the zone and resolves an unknown state.
 *
 * Above the three sections, a "Folders" section lists the tree's folders
 * (nested ones indented); each link row also gets a "Move to…" select.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { useUiStore } from '../../store/ui-store';
import { useBuildingStore } from '../../store/building-store';
import { useMapStore } from '../../store/map-store';
import { useClient } from '../../context';
import type { FavoritesItem } from '@/shared/types';
import { classifyFacilities, flattenFolders, type FolderRow } from './facility-status';
import styles from './FacilityList.module.css';

type FacilityState = 'losing' | 'unknown' | 'operating';

/**
 * `TFavorites.RDORenameItem` keeps the first 50 characters and drops the rest
 * (`Kernel/Favorites.pas:283`). The input stops there so the player never types
 * a name the server will silently shorten.
 */
const FAV_NAME_MAX = 50;

/**
 * `Move to…` uses the empty string as the select's own placeholder value, so
 * the root of the tree — which is ALSO addressed by the empty Location —
 * needs a distinct sentinel to appear as its own `<option>`.
 */
const ROOT_PATH = ' root';

interface FacilityRowProps {
  facility: FavoritesItem;
  state: FacilityState;
  folders: FolderRow[];
  onClick: (facility: FavoritesItem) => void;
  onRename: (facility: FavoritesItem, name: string) => void;
  onRemove: (facility: FavoritesItem) => void;
  onMove: (facility: FavoritesItem, destPath: string) => void;
}

const DOT_CLASS: Record<FacilityState, string> = {
  losing: 'dotLosing',
  unknown: 'dotUnknown',
  operating: 'dotOperating',
};

const FacilityRow = memo(function FacilityRow({
  facility, state, folders, onClick, onRename, onRemove, onMove,
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
        {folders.length > 0 && (
          <select
            className={styles.moveSelect}
            aria-label={`Move ${facility.name} to…`}
            value=""
            onChange={(e) => {
              const destPath = e.target.value;
              if (destPath !== '') onMove(facility, destPath === ROOT_PATH ? '' : destPath);
              e.target.value = '';
            }}
          >
            <option value="" disabled>Move to…</option>
            <option value={ROOT_PATH}>Root</option>
            {folders.map(({ folder, depth }) => (
              <option key={folder.path} value={folder.path}>
                {'  '.repeat(depth)}{folder.name}
              </option>
            ))}
          </select>
        )}
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

interface FolderListRowProps {
  row: FolderRow;
  onRename: (folder: FavoritesItem, name: string) => void;
  onRemove: (folder: FavoritesItem) => void;
}

const FolderListRow = memo(function FolderListRow({ row, onRename, onRemove }: FolderListRowProps) {
  const { folder, depth } = row;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const childCount = folder.children?.length ?? 0;
  const empty = childCount === 0;

  const startEditing = () => {
    setDraft(folder.name);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== folder.name) {
      onRename(folder, next);
    }
  };

  if (editing) {
    return (
      <div className={styles.row} style={{ paddingLeft: depth * 16 }}>
        <input
          className={styles.renameInput}
          value={draft}
          maxLength={FAV_NAME_MAX}
          autoFocus
          aria-label={`Rename ${folder.name}`}
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
    <div className={styles.row} style={{ paddingLeft: depth * 16 }}>
      <div className={styles.rowLeft}>
        <span className={styles.name}>📁 {folder.name}</span>
        <span className={styles.category}>{childCount} item{childCount === 1 ? '' : 's'}</span>
      </div>
      <div className={styles.rowActions}>
        <button
          className={styles.rowAction}
          title={`Rename ${folder.name}`}
          aria-label={`Rename ${folder.name}`}
          onClick={startEditing}
        >
          ✎
        </button>
        <button
          className={styles.rowAction}
          disabled={!empty}
          title={empty ? `Remove ${folder.name}` : `${folder.name} is not empty — remove or move its contents first`}
          aria-label={`Remove ${folder.name}`}
          onClick={() => { if (empty) onRemove(folder); }}
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

  const groups = useMemo(
    () => classifyFacilities(facilities, source?.getAllBuildings?.() ?? []),
    [facilities, source],
  );
  const folders = useMemo(() => flattenFolders(facilities), [facilities]);

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

  const handleMove = useCallback((facility: FavoritesItem, destPath: string) => {
    client.onMoveFavorite(facility.path, destPath, facility.name);
  }, [client]);

  const handleNewFolder = useCallback(() => {
    useUiStore.getState().requestPrompt(
      'New folder', 'Name:',
      (name) => { const t = name.trim(); if (t) client.onCreateFavoriteFolder('', t); },
      { placeholder: 'e.g. Farms' },
    );
  }, [client]);

  const isEmpty = facilities.length === 0;

  return (
    <div className={styles.list}>
      <div className={styles.listHead}>
        <button className={styles.newFolderButton} onClick={handleNewFolder}>
          + New Folder
        </button>
      </div>

      {isEmpty ? (
        <div className={styles.empty}>
          No facilities found
        </div>
      ) : (
        <>
          {folders.length > 0 && (
            <>
              <div className={styles.sectionHeader}>Folders</div>
              {folders.map((row) => (
                <FolderListRow
                  key={row.folder.path}
                  row={row}
                  onRename={handleRename}
                  onRemove={handleRemove}
                />
              ))}
            </>
          )}

          <div className={styles.sectionHeader}>
            Losing money{groups.losing.length > 0 ? ` (${groups.losing.length})` : ''}
          </div>
          {groups.losing.length === 0 ? (
            <div className={styles.sectionEmpty}>
              No facility is losing money in the areas you&apos;ve visited.
            </div>
          ) : (
            groups.losing.map((f) => (
              <FacilityRow
                key={f.id}
                facility={f}
                state="losing"
                folders={folders}
                onClick={handleClick}
                onRename={handleRename}
                onRemove={handleRemove}
                onMove={handleMove}
              />
            ))
          )}

          {groups.unknown.length > 0 && (
            <>
              <div className={styles.sectionHeader}>Status unknown</div>
              <div className={styles.sectionNote}>Not visited yet — tap to check.</div>
              {groups.unknown.map((f) => (
                <FacilityRow
                  key={f.id}
                  facility={f}
                  state="unknown"
                  folders={folders}
                  onClick={handleClick}
                  onRename={handleRename}
                  onRemove={handleRemove}
                  onMove={handleMove}
                />
              ))}
            </>
          )}

          {groups.operating.length > 0 && (
            <>
              <div className={styles.sectionHeader}>Operating</div>
              {groups.operating.map((f) => (
                <FacilityRow
                  key={f.id}
                  facility={f}
                  state="operating"
                  folders={folders}
                  onClick={handleClick}
                  onRename={handleRename}
                  onRemove={handleRemove}
                  onMove={handleMove}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
