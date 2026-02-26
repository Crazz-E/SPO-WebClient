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
import { GlassCard, Skeleton } from '../common';
import type { BuildingCategory, BuildingInfo } from '@/shared/types';
import styles from './BuildMenu.module.css';

type Phase = 'categories' | 'facilities';

export function BuildMenu() {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);

  const [phase, setPhase] = useState<Phase>('categories');
  const [categories, setCategories] = useState<BuildingCategory[]>([]);
  const [facilities, setFacilities] = useState<BuildingInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const getBridge = useCallback(
    () => (window.__spoReactCallbacks ?? {}) as Record<string, (...args: unknown[]) => void>,
    [],
  );

  // Load categories when opened
  useEffect(() => {
    if (modal !== 'buildMenu') return;
    setPhase('categories');
    setIsLoading(true);
    // Request categories from bridge
    getBridge().onRequestBuildingCategories?.();
  }, [modal, getBridge]);

  // Register handlers for receiving data from bridge
  useEffect(() => {
    window.__spoBuildMenuHandlers = {
      setCategories: (cats: BuildingCategory[]) => {
        setCategories(cats);
        setIsLoading(false);
      },
      setFacilities: (facs: BuildingInfo[]) => {
        setFacilities(facs);
        setIsLoading(false);
      },
    };
    return () => {
      window.__spoBuildMenuHandlers = undefined;
    };
  }, []);

  const handleCategorySelect = useCallback(
    (category: BuildingCategory) => {
      setSelectedCategory(category.kindName);
      setPhase('facilities');
      setIsLoading(true);
      getBridge().onRequestBuildingFacilities?.(category.kind, category.cluster);
    },
    [getBridge],
  );

  const handleFacilitySelect = useCallback(
    (facility: BuildingInfo) => {
      closeModal();
      getBridge().onPlaceBuilding?.(facility.facilityClass, facility.visualClassId);
    },
    [closeModal, getBridge],
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
