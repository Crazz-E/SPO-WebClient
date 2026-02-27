/**
 * SearchPanel — World directory search with breadcrumb navigation.
 *
 * Home page: category cards (Towns, Tycoons, People, Rankings, Banks).
 * Drill-down pages with back navigation.
 */

import { useEffect } from 'react';
import { ChevronRight, Building2, Users, UserSearch, Trophy, Landmark } from 'lucide-react';
import { useSearchStore, type SearchPage } from '../../store/search-store';
import { useClient } from '../../context';
import { GlassCard, Skeleton } from '../common';
import styles from './SearchPanel.module.css';

const CATEGORIES: { id: SearchPage; label: string; icon: React.ReactNode }[] = [
  { id: 'towns', label: 'Towns', icon: <Building2 size={20} /> },
  { id: 'tycoon', label: 'Tycoons', icon: <Users size={20} /> },
  { id: 'people', label: 'People', icon: <UserSearch size={20} /> },
  { id: 'rankings', label: 'Rankings', icon: <Trophy size={20} /> },
  { id: 'banks', label: 'Banks', icon: <Landmark size={20} /> },
];

export function SearchPanel() {
  const currentPage = useSearchStore((s) => s.currentPage);
  const isLoading = useSearchStore((s) => s.isLoading);
  const navigateTo = useSearchStore((s) => s.navigateTo);
  const goBack = useSearchStore((s) => s.goBack);
  const pageHistory = useSearchStore((s) => s.pageHistory);
  const client = useClient();

  // Request home data when opened
  useEffect(() => {
    client.onSearchMenuHome();
  }, [client]);

  return (
    <div className={styles.panel}>
      {/* Breadcrumb navigation */}
      {currentPage !== 'home' && (
        <div className={styles.breadcrumb}>
          <button className={styles.breadcrumbLink} onClick={goBack}>
            {pageHistory.length > 0 ? '← Back' : '← Home'}
          </button>
          <ChevronRight size={12} className={styles.breadcrumbSep} />
          <span className={styles.breadcrumbCurrent}>
            {CATEGORIES.find((c) => c.id === currentPage)?.label ?? currentPage}
          </span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className={styles.loading}>
          <Skeleton width="100%" height="60px" />
          <Skeleton width="100%" height="60px" />
          <Skeleton width="100%" height="60px" />
        </div>
      )}

      {/* Home — category grid */}
      {!isLoading && currentPage === 'home' && (
        <div className={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <GlassCard
              key={cat.id}
              className={styles.categoryCard}
              onClick={() => navigateTo(cat.id)}
            >
              <span className={styles.categoryIcon}>{cat.icon}</span>
              <span className={styles.categoryLabel}>{cat.label}</span>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Drill-down pages — placeholder content from stores */}
      {!isLoading && currentPage !== 'home' && (
        <div className={styles.pageContent}>
          <div className={styles.placeholder}>
            {CATEGORIES.find((c) => c.id === currentPage)?.label ?? currentPage} data
            — populated from store when server responds
          </div>
        </div>
      )}
    </div>
  );
}
