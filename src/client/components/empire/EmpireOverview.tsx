/**
 * EmpireOverview — Strategic command center for the LeftPanel.
 *
 * Fetches the player's owned facilities via RDOFavoritesGetSubItems
 * on mount, then displays a searchable/sortable facility list.
 */

import { useState, useMemo, useEffect } from 'react';
import { useEmpireStore } from '../../store/empire-store';
import { useClient } from '../../context';
import { FacilityList } from './FacilityList';
import { Skeleton, SkeletonLines } from '../common';
import styles from './EmpireOverview.module.css';

export function EmpireOverview() {
  const facilities = useEmpireStore((s) => s.facilities);
  const isLoading = useEmpireStore((s) => s.isLoading);
  const client = useClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'x'>('name');

  // Fetch owned facilities on mount
  useEffect(() => {
    client.onRequestFacilities();
  }, [client]);

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
    </div>
  );
}
