/**
 * EmpireOverview — Strategic command center for the LeftPanel.
 *
 * Financial summary cards at top, facility list below,
 * collapsible sub-sections for P&L, bank, auto-connections.
 */

import { useState, useMemo } from 'react';
import { useEmpireStore } from '../../store/empire-store';
import { FinancialSummary } from './FinancialSummary';
import { FacilityList } from './FacilityList';
import { Skeleton, SkeletonLines } from '../common';
import styles from './EmpireOverview.module.css';

export function EmpireOverview() {
  const facilities = useEmpireStore((s) => s.facilities);
  const totalRevenue = useEmpireStore((s) => s.totalRevenue);
  const totalExpenses = useEmpireStore((s) => s.totalExpenses);
  const netProfit = useEmpireStore((s) => s.netProfit);
  const isLoading = useEmpireStore((s) => s.isLoading);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'revenue' | 'status'>('name');

  const filteredFacilities = useMemo(() => {
    let list = [...facilities];

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((f) => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
    }

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'revenue':
          return parseFloat(b.revenue) - parseFloat(a.revenue);
        case 'status':
          return a.status.localeCompare(b.status);
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
      {/* Financial summary cards */}
      <FinancialSummary
        revenue={totalRevenue}
        expenses={totalExpenses}
        profit={netProfit}
        facilityCount={facilities.length}
      />

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
          onChange={(e) => setSortBy(e.target.value as 'name' | 'revenue' | 'status')}
        >
          <option value="name">Name</option>
          <option value="revenue">Revenue</option>
          <option value="status">Status</option>
        </select>
      </div>

      {/* Facility list */}
      <FacilityList facilities={filteredFacilities} />
    </div>
  );
}
