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
import type { FavoritesItem, FavoriteFolder } from '@/shared/types';
import { classifyFacilities } from './facility-status';
import styles from './FacilityList.module.css';

type FacilityState = 'losing' | 'unknown' | 'operating';

/**
 * `TFavorites.RDORenameItem` keeps the first 50 characters and drops the rest
 * (`Kernel/Favorites.pas:283`). The input stops there so the player never types
 * a name the server will silently shorten.
 */
const FAV_NAME_MAX = 50;

/** `<select>` value tokens — the root's real path is `''`, which a `<select>`
 * cannot distinguish from "no selection", so both get their own token. */
const MOVE_PLACEHOLDER = '__placeholder__';
const MOVE_ROOT_TOKEN = '__root__';

/** A move destination: the root, or a folder — value is the Location path. */
interface MoveDestination {
  path: string;
  label: string;
}

/** Everything but `excludeParent` (the item's current folder), root first. */
function moveDestinations(folders: readonly FavoriteFolder[], excludeParent: string): MoveDestination[] {
  const options: MoveDestination[] = [{ path: '', label: 'Root' }];
  for (const f of folders) {
    if (f.path === excludeParent) continue;
    options.push({ path: f.path, label: f.name });
  }
  return options;
}

/** The folder Location an item's path currently sits in — '' for the root. */
function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.substring(0, i);
}

interface FacilityRowProps {
  facility: FavoritesItem;
  state: FacilityState;
  folders: readonly FavoriteFolder[];
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
  const destinations = useMemo(
    () => moveDestinations(folders, parentOf(facility.path)),
    [folders, facility.path],
  );

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
        {destinations.length > 0 && (
          <select
            className={styles.moveSelect}
            aria-label={`Move ${facility.name} to…`}
            value={MOVE_PLACEHOLDER}
            onChange={(e) => {
              const token = e.target.value;
              e.target.value = MOVE_PLACEHOLDER;
              if (token === MOVE_PLACEHOLDER) return;
              onMove(facility, token === MOVE_ROOT_TOKEN ? '' : token);
            }}
          >
            <option value={MOVE_PLACEHOLDER} disabled>Move to…</option>
            {destinations.map((d) => (
              <option key={d.path || MOVE_ROOT_TOKEN} value={d.path || MOVE_ROOT_TOKEN}>{d.label}</option>
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

interface FolderRowProps {
  folder: FavoriteFolder;
  nonEmpty: boolean;
  onRename: (folder: FavoriteFolder, name: string) => void;
  onRemove: (folder: FavoriteFolder) => void;
}

const FolderRow = memo(function FolderRow({ folder, nonEmpty, onRename, onRemove }: FolderRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);

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
      <div className={styles.row}>
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
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowLeft}>
          <span className={styles.name}>📁 {folder.name}</span>
        </div>
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
          title={nonEmpty ? 'Empty the folder first' : `Delete ${folder.name}`}
          aria-label={`Delete ${folder.name}`}
          disabled={nonEmpty}
          onClick={() => onRemove(folder)}
        >
          ✕
        </button>
      </div>
    </div>
  );
});

interface FacilityListProps {
  facilities: FavoritesItem[];
  folders?: FavoriteFolder[];
}

export function FacilityList({ facilities, folders = [] }: FacilityListProps) {
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

  const handleRename = useCallback((facility: FavoritesItem, name: string) => {
    client.onRenameFavorite(facility.path, name);
  }, [client]);

  const handleRemove = useCallback((facility: FavoritesItem) => {
    client.onRemoveFavorite(facility.path, facility.name);
  }, [client]);

  const handleMove = useCallback((facility: FavoritesItem, destPath: string) => {
    client.onMoveFavorite(facility.path, destPath, facility.name);
  }, [client]);

  const handleFolderRename = useCallback((folder: FavoriteFolder, name: string) => {
    client.onRenameFavorite(folder.path, name);
  }, [client]);

  const handleFolderRemove = useCallback((folder: FavoriteFolder) => {
    client.onRemoveFavorite(folder.path, folder.name);
  }, [client]);

  const handleNewFolder = useCallback(() => {
    useUiStore.getState().requestPrompt('New folder', 'Folder name:', (name) => {
      const t = name.trim().slice(0, FAV_NAME_MAX);
      if (t) client.onCreateFavoriteFolder(t);
    });
  }, [client]);

  const nonEmptyFolders = useMemo(() => {
    const others = [...facilities.map((f) => f.path), ...folders.map((f) => f.path)];
    const set = new Set<string>();
    for (const folder of folders) {
      if (others.some((p) => p.startsWith(`${folder.path}/`))) set.add(folder.path);
    }
    return set;
  }, [facilities, folders]);

  return (
    <div className={styles.list}>
      <button className={styles.newFolderButton} onClick={handleNewFolder}>
        + New Folder
      </button>

      {folders.length > 0 && (
        <>
          <div className={styles.sectionHeader}>Folders</div>
          {folders.map((f) => (
            <FolderRow
              key={f.path}
              folder={f}
              nonEmpty={nonEmptyFolders.has(f.path)}
              onRename={handleFolderRename}
              onRemove={handleFolderRemove}
            />
          ))}
        </>
      )}

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
