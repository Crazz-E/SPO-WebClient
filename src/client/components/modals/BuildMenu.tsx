/**
 * BuildMenu — Centered modal for building construction.
 *
 * Two phases:
 * 1. Category grid — building type categories with icons
 * 2. Facility list — buildings within selected category
 *
 * Selecting a building closes the menu and starts placement mode.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { useUiStore } from '../../store/ui-store';
import { useClient } from '../../context';
import { GlassCard, Skeleton } from '../common';
import type { BuildingCategory } from '@/shared/types';
import styles from './BuildMenu.module.css';

type Phase = 'categories' | 'facilities';

export function BuildMenu() {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);
  const categories = useUiStore((s) => s.buildMenuCategories);
  const facilities = useUiStore((s) => s.buildMenuFacilities);

  const client = useClient();
  const [phase, setPhase] = useState<Phase>('categories');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Load categories when opened
  useEffect(() => {
    if (modal !== 'buildMenu') return;
    setPhase('categories');
    setIsLoading(true);
    client.onRequestBuildingCategories();
  }, [modal, client]);

  // Stop loading when store receives data
  useEffect(() => {
    if (categories.length > 0) setIsLoading(false);
  }, [categories]);

  useEffect(() => {
    if (facilities.length > 0) setIsLoading(false);
  }, [facilities]);

  const handleCategorySelect = useCallback(
    (category: BuildingCategory) => {
      setSelectedCategory(category.kindName);
      setPhase('facilities');
      setIsLoading(true);
      client.onRequestBuildingFacilities(category.kind, category.cluster);
    },
    [client],
  );

  const handleFacilitySelect = useCallback(
    (facility: { facilityClass: string; visualClassId: number; available: boolean }) => {
      closeModal();
      client.onPlaceBuilding(facility.facilityClass, facility.visualClassId);
    },
    [closeModal, client],
  );

  if (modal !== 'buildMenu') return null;

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={closeModal} aria-hidden="true" />

      <div className={styles.modal} role="dialog" aria-label="Build Menu">
        {/* Header */}
        <div className={styles.header}>
          {phase === 'facilities' && (
            <button className={styles.backBtn} onClick={() => setPhase('categories')}>
              <ArrowLeft size={16} />
            </button>
          )}
          <h2 className={styles.title}>
            {phase === 'categories' ? 'Build' : selectedCategory}
          </h2>
          <button className={styles.closeBtn} onClick={closeModal} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {isLoading && (
            <div className={styles.loadingGrid}>
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} width="100%" height="80px" />
              ))}
            </div>
          )}

          {!isLoading && phase === 'categories' && (
            <div className={styles.categoryGrid}>
              {categories.map((cat) => (
                <GlassCard
                  key={cat.kind}
                  className={styles.categoryCard}
                  onClick={() => handleCategorySelect(cat)}
                >
                  <span className={styles.categoryName}>{cat.kindName}</span>
                  {cat.tycoonLevel > 0 && (
                    <span className={styles.levelBadge}>Lv.{cat.tycoonLevel}</span>
                  )}
                </GlassCard>
              ))}
            </div>
          )}

          {!isLoading && phase === 'facilities' && (
            <div className={styles.facilityList}>
              {facilities.map((fac) => (
                <button
                  key={fac.facilityClass}
                  className={`${styles.facilityCard} ${!fac.available ? styles.unavailable : ''}`}
                  onClick={() => fac.available && handleFacilitySelect(fac)}
                  disabled={!fac.available}
                >
                  <div className={styles.facilityInfo}>
                    <span className={styles.facilityName}>{fac.name}</span>
                    <span className={styles.facilityDesc}>{fac.description}</span>
                  </div>
                  <div className={styles.facilityMeta}>
                    <span className={styles.facilityCost}>${fac.cost.toLocaleString()}</span>
                    <span className={styles.facilityArea}>{fac.area}m²</span>
                  </div>
                </button>
              ))}
              {facilities.length === 0 && (
                <div className={styles.empty}>No buildings available in this category</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
