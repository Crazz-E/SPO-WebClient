/**
 * FavoritesTree — a single-level tree view of the Favorites tree (issue #129).
 *
 * The server's tree can nest arbitrarily deep (`TFavorites.LocateItem` walks a
 * '/'-separated path of any length, `Kernel/Favorites.pas:312-334`), but this
 * view only ever shows two levels: the list it was given, and — for a folder
 * the player opens — its direct children. A child folder is drawn but is not
 * itself expandable; descending further is a future card, not this one.
 *
 * Each root folder tracks its own `expanded` flag and its own fetched
 * children, cached the first time it is opened so re-opening costs no round
 * trip. Root items are given by the caller (`EmpireOverview`, which already
 * holds the tree read for the flat list); a folder's children are fetched
 * lazily through `onFetchFavoritesFolder`, matching the "no round trip for
 * what is not open yet" rule the rest of the Empire panel follows.
 */

import { useCallback, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, MapPin, Plus } from 'lucide-react';
import { useClient } from '../../context';
import { useUiStore } from '../../store/ui-store';
import type { FavoritesItem, FavoritesLinkItem } from '@/shared/types';
import styles from './FavoritesTree.module.css';

export interface FavoritesTreeProps {
  /** The root of the tree — folders and links alike. */
  items: FavoritesItem[];
  onNavigate: (item: FavoritesLinkItem) => void;
  /** Called after a folder is created at the root, so the caller can re-read it. */
  onRootChanged?: () => void;
}

interface FolderState {
  expanded: boolean;
  loading: boolean;
  children?: FavoritesItem[];
  error?: string;
}

export function FavoritesTree({ items, onNavigate, onRootChanged }: FavoritesTreeProps) {
  const client = useClient();
  const [folderState, setFolderState] = useState<Map<string, FolderState>>(new Map());

  const toggleFolder = useCallback((folder: FavoritesItem) => {
    if (folder.kind !== 0) return;
    const path = folder.path;

    setFolderState((prev) => {
      const current = prev.get(path);
      const next = new Map(prev);
      next.set(path, {
        expanded: !(current?.expanded ?? false),
        loading: !current?.expanded && !current?.children,
        children: current?.children,
        error: undefined,
      });
      return next;
    });

    const current = folderState.get(path);
    const alreadyOpen = current?.expanded ?? false;
    if (alreadyOpen || current?.children) return; // collapsing, or already cached

    client.onFetchFavoritesFolder(path).then((children) => {
      setFolderState((prev) => {
        const next = new Map(prev);
        next.set(path, { expanded: true, loading: false, children });
        return next;
      });
    }).catch(() => {
      setFolderState((prev) => {
        const next = new Map(prev);
        next.set(path, { expanded: true, loading: false, error: 'Could not read this folder.' });
        return next;
      });
    });
  }, [client, folderState]);

  const handleAddFolder = useCallback(() => {
    useUiStore.getState().requestPrompt('New folder', 'Folder name:', (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      client.onAddFavoriteFolder('', trimmed).then((result) => {
        if (result.success) onRootChanged?.();
      }).catch(() => { /* onAddFavoriteFolder already reports its own failure */ });
    }, { placeholder: 'e.g. Farms' });
  }, [client, onRootChanged]);

  return (
    <div className={styles.tree}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.addFolderBtn} onClick={handleAddFolder}>
          <Plus size={12} />
          New folder
        </button>
      </div>
      {items.length === 0 ? (
        <div className={styles.empty}>No facilities found</div>
      ) : (
        <ul className={styles.list} role="tree" aria-label="Favorites">
          {items.map((item) => (
            <TreeNode
              key={item.path}
              item={item}
              state={item.kind === 0 ? folderState.get(item.path) : undefined}
              onToggle={toggleFolder}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TreeNode({ item, state, onToggle, onNavigate }: {
  item: FavoritesItem;
  state?: FolderState;
  onToggle: (folder: FavoritesItem) => void;
  onNavigate: (item: FavoritesLinkItem) => void;
}) {
  if (item.kind === 1) {
    return <LinkRow item={item} onNavigate={onNavigate} />;
  }

  const expanded = state?.expanded ?? false;

  return (
    <li className={styles.row} role="treeitem" aria-expanded={expanded}>
      <button type="button" className={styles.folderRow} onClick={() => onToggle(item)}>
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Folder size={13} className={styles.folderIcon} />
        <span className={styles.name}>{item.name}</span>
      </button>
      {expanded && (
        <ul className={styles.children} role="group">
          {state?.loading && <li className={styles.hint}>Loading…</li>}
          {state?.error && <li className={styles.hint}>{state.error}</li>}
          {!state?.loading && !state?.error && (state?.children?.length ?? 0) === 0 && (
            <li className={styles.hint}>Empty folder</li>
          )}
          {!state?.loading && !state?.error && state?.children?.map((child) => (
            <ChildNode key={child.path} item={child} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * A depth-1 row. `TREE_SCOPE` keeps expansion to one level: a folder found
 * here is shown so its presence is not hidden, but it has no disclosure
 * control of its own.
 */
function ChildNode({ item, onNavigate }: { item: FavoritesItem; onNavigate: (item: FavoritesLinkItem) => void }) {
  if (item.kind === 1) {
    return <LinkRow item={item} onNavigate={onNavigate} />;
  }
  return (
    <li className={styles.row} role="treeitem">
      <span className={styles.folderRow}>
        <Folder size={13} className={styles.folderIcon} />
        <span className={styles.name}>{item.name}</span>
      </span>
    </li>
  );
}

function LinkRow({ item, onNavigate }: { item: FavoritesLinkItem; onNavigate: (item: FavoritesLinkItem) => void }) {
  return (
    <li className={styles.row} role="treeitem">
      <button type="button" className={styles.linkRow} onClick={() => onNavigate(item)}>
        <MapPin size={13} className={styles.linkIcon} />
        <span className={styles.name}>{item.name}</span>
        <span className={styles.coords}>{item.x}, {item.y}</span>
      </button>
    </li>
  );
}
