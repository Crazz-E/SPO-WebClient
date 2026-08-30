/**
 * FacilityList — Scrollable list of owned facilities, grouped by state (H6).
 *
 * Three sections: "Losing money" (server alert bit on a loaded building),
 * "Status unknown" (zone never loaded — honestly unknown, never assumed
 * healthy), "Operating". Clicking a row pans the map and opens the building
 * inspector — which also loads the zone and resolves an unknown state.
 *
 * Folders are new ground on top of that: a "New folder" button creates one
 * at the root, every row (link or folder) can be moved into any other folder
 * via an inline picker, and a folder's own remove action is only offered
 * once it is empty — the player empties it explicitly rather than the client
 * doing a recursive delete on their behalf.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { useUiStore } from '../../store/ui-store';
import { useBuildingStore } from '../../store/building-store';
import { useMapStore } from '../../store/map-store';
import { useClient } from '../../context';
import type { FavoritesItem } from '@/shared/types';
import { classifyFacilities, type FacilityState } from './facility-status';
import styles from './FacilityList.module.css';

/**
 * `TFavorites.RDORenameItem` keeps the first 50 characters and drops the rest
 * (`Kernel/Favorites.pas:283`). The input stops there so the player never types
 * a name the server will silently shorten.
 */
const FAV_NAME_MAX = 50;

const FAV_KIND_FOLDER = 0;

/** One entry a player can move an item into: `(top level)` plus every folder. */
interface FolderOption {
  path: string;
  name: string;
  depth: number;
}

/**
 * Flatten the tree's folders depth-first, excluding `excludePath` and its own
 * subtree — the server refuses moving a folder into itself or a descendant
 * anyway (`Favorites.pas:239-247`); filtering here avoids offering a choice
 * that can only fail.
 */
function collectFolderOptions(
  items: readonly FavoritesItem[], excludePath: string, depth: number, out: FolderOption[],
): void {
  for (const item of items) {
    if (item.kind !== FAV_KIND_FOLDER) continue;
    if (item.path === excludePath || item.path.startsWith(`${excludePath}/`)) continue;
    out.push({ path: item.path, name: item.name, depth });
    if (item.children) collectFolderOptions(item.children, excludePath, depth + 1, out);
  }
}

interface FacilityRowProps {
  facility: FavoritesItem;
  state: FacilityState;
  depth: number;
  isExpanded: boolean;
  folderOptions: FolderOption[];
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
  facility, state, depth, isExpanded, folderOptions, onClick, onRename, onRemove, onMove,
}: FacilityRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(facility.name);
  const [moving, setMoving] = useState(false);

  const isFolder = facility.kind === FAV_KIND_FOLDER;
  const hasChildren = (facility.children?.length ?? 0) > 0;
  const style = { '--depth': depth } as React.CSSProperties;

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
      <div className={`${styles.row} ${styles.depth}`} style={style}>
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

  if (moving) {
    return (
      <div className={`${styles.row} ${styles.depth}`} style={style}>
        <select
          className={styles.moveSelect}
          aria-label={`Move ${facility.name} to folder`}
          autoFocus
          defaultValue=""
          onChange={(e) => {
            setMoving(false);
            onMove(facility, e.target.value);
          }}
          onBlur={() => setMoving(false)}
        >
          <option value="" disabled>Move to…</option>
          <option value="">(top level)</option>
          {folderOptions.map((f) => (
            <option key={f.path} value={f.path}>
              {'–'.repeat(f.depth)} {f.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className={`${styles.row} ${styles.depth}`} style={style}>
      <button
        className={styles.rowMain}
        onClick={() => onClick(facility)}
      >
        <div className={styles.rowLeft}>
          <span className={styles.name}>
            <span className={`${styles.dot} ${styles[DOT_CLASS[state]]}`} aria-hidden="true" />
            {isFolder && <span aria-hidden="true">{isExpanded ? '📂' : '📁'} </span>}
            {facility.name}
          </span>
          {!isFolder && <span className={styles.category}>{facility.x}, {facility.y}</span>}
        </div>
      </button>
      <div className={styles.rowActions}>
        {!isFolder && (
          <button
            className={styles.rowAction}
            title={`Rename ${facility.name}`}
            aria-label={`Rename ${facility.name}`}
            onClick={startEditing}
          >
            ✎
          </button>
        )}
        <button
          className={styles.rowAction}
          title={`Move ${facility.name} to another folder`}
          aria-label={`Move ${facility.name} to another folder`}
          onClick={() => setMoving(true)}
        >
          ➜
        </button>
        <button
          className={styles.rowAction}
          // "Remove from list", never "delete": this removes the bookmark, it
          // does not touch the building.
          title={isFolder && hasChildren ? 'Empty the folder first' : `Remove ${facility.name} from list`}
          aria-label={isFolder && hasChildren ? 'Empty the folder first' : `Remove ${facility.name} from list`}
          disabled={isFolder && hasChildren}
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

  const handleClick = useCallback((facility: FavoritesItem) => {
    if (facility.kind === FAV_KIND_FOLDER) {
      toggleFolder(facility.path);
      return;
    }
    useBuildingStore.getState().setLoading(true);
    openRightPanel('building');
    client.onNavigateToBuilding(facility.x, facility.y);
  }, [openRightPanel, client, toggleFolder]);

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
      'New folder',
      'Name:',
      (name) => { const t = name.trim(); if (t) client.onCreateFavoriteFolder('', t); },
      { placeholder: 'e.g. Cotton farms' },
    );
  }, [client]);

  const renderTreeItem = (item: FavoritesItem, level: number) => {
    const isFolder = item.kind === FAV_KIND_FOLDER;
    const isExpanded = expandedFolders.has(item.path);
    const state = groups.stateByPath.get(item.path) ?? 'unknown';
    const folderOptions: FolderOption[] = [];
    collectFolderOptions(facilities, item.path, 0, folderOptions);

    return (
      <div key={item.id}>
        <FacilityRow
          facility={item}
          state={state}
          depth={level}
          isExpanded={isExpanded}
          folderOptions={folderOptions}
          onClick={handleClick}
          onRename={handleRename}
          onRemove={handleRemove}
          onMove={handleMove}
        />
        {isFolder && isExpanded && item.children && item.children.map((child) =>
          renderTreeItem(child, level + 1)
        )}
      </div>
    );
  };

  return (
    <div className={styles.list}>
      <button className={styles.newFolderButton} onClick={handleNewFolder}>
        + New folder
      </button>

      {facilities.length === 0 ? (
        <div className={styles.empty}>
          No facilities found
        </div>
      ) : (
        <>
          <div className={styles.sectionHeader}>
            Losing money{groups.losing.length > 0 ? ` (${groups.losing.length})` : ''}
          </div>
          {groups.losing.length === 0 ? (
            <div className={styles.sectionEmpty}>
              No facility is losing money in the areas you&apos;ve visited.
            </div>
          ) : (
            groups.losing.map((f) => renderTreeItem(f, 0))
          )}

          {groups.unknown.length > 0 && (
            <>
              <div className={styles.sectionHeader}>Status unknown</div>
              <div className={styles.sectionNote}>Not visited yet — tap to check.</div>
              {groups.unknown.map((f) => renderTreeItem(f, 0))}
            </>
          )}

          {groups.operating.length > 0 && (
            <>
              <div className={styles.sectionHeader}>Operating</div>
              {groups.operating.map((f) => renderTreeItem(f, 0))}
            </>
          )}
        </>
      )}
    </div>
  );
}
