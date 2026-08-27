/**
 * EmpireOverview — Strategic command center for the LeftPanel.
 *
 * Fetches the player's owned facilities via RDOFavoritesGetSubItems
 * on mount, then displays a searchable/sortable facility list.
 *
 * Issue #129 added a second view: the Favorites tree can hold folders, which
 * the flat list has no room for (a folder carries no coordinates to sort or
 * navigate to). "Folders" is a separate view rather than a replacement — the
 * health-grouped list stays the default, and the tree is fetched only once
 * the player actually asks to see it.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useEmpireStore } from '../../store/empire-store';
import { useBuildingStore } from '../../store/building-store';
import { useUiStore } from '../../store/ui-store';
import { useClient } from '../../context';
import { FacilityList } from './FacilityList';
import { FavoritesTree } from './FavoritesTree';
import { Skeleton, SkeletonLines } from '../common';
import type { FavoritesItem, FavoritesLinkItem } from '@/shared/types';
import styles from './EmpireOverview.module.css';

type ViewMode = 'list' | 'folders';

export function EmpireOverview() {
  const facilities = useEmpireStore((s) => s.facilities);
  const isLoading = useEmpireStore((s) => s.isLoading);
  const openRightPanel = useUiStore((s) => s.openRightPanel);
  const client = useClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'x'>('name');
  const [view, setView] = useState<ViewMode>('list');
  const [treeItems, setTreeItems] = useState<FavoritesItem[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  // Fetch owned facilities on mount
  useEffect(() => {
    client.onRequestFacilities();
  }, [client]);

  // The tree read is separate from the flat list — it also carries folders,
  // which fetchOwnedFacilities filters out — and costs nothing until the
  // player switches to that view.
  const loadTree = useCallback(() => {
    setTreeLoading(true);
    client.onFetchFavoritesFolder('')
      .then(setTreeItems)
      .finally(() => setTreeLoading(false));
  }, [client]);

  useEffect(() => {
    if (view === 'folders') loadTree();
  }, [view, loadTree]);

  const filteredFacilities = useMemo(() => {
    let list = [...facilities];

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'x':
          return a.x - b.x || a.y - b.y;
        default:
          return 0;
      }
    });

    return list;
  }, [facilities, searchQuery, sortBy]);

  const handleNavigate = useCallback((facility: FavoritesLinkItem) => {
    useBuildingStore.getState().setLoading(true);
    openRightPanel('building');
    client.onNavigateToBuilding(facility.x, facility.y);
  }, [openRightPanel, client]);

  if (isLoading) {
    return (
      <div className={styles.overview}>
        <div className={styles.loading}>
          <Skeleton width="100%" height="80px" />
          <SkeletonLines lines={5} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overview}>
      <div className={styles.viewToggle}>
        <button
          type="button"
          className={`${styles.viewToggleBtn} ${view === 'list' ? styles.viewToggleBtnActive : ''}`}
          aria-pressed={view === 'list'}
          onClick={() => setView('list')}
        >
          List
        </button>
        <button
          type="button"
          className={`${styles.viewToggleBtn} ${view === 'folders' ? styles.viewToggleBtnActive : ''}`}
          aria-pressed={view === 'folders'}
          onClick={() => setView('folders')}
        >
          Folders
        </button>
      </div>

      {view === 'list' ? (
        <>
          {/* Search and sort controls */}
          <div className={styles.controls}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search facilities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className={styles.sortSelect}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'x')}
            >
              <option value="name">Name</option>
              <option value="x">Location</option>
            </select>
          </div>

          {/* Facility list */}
          <FacilityList facilities={filteredFacilities} />
        </>
      ) : treeLoading ? (
        <div className={styles.loading}>
          <SkeletonLines lines={5} />
        </div>
      ) : (
        <FavoritesTree items={treeItems} onNavigate={handleNavigate} onRootChanged={loadTree} />
      )}
    </div>
  );
}
