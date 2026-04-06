/**
 * BuildingInspectorModal — Centered modal for civic buildings (Capitol, TownHall).
 *
 * Wraps the standard BuildingInspector in a wider centered modal
 * to accommodate dense tab content (coverage, towns, ministers, votes).
 */

import { RefreshCw, X } from 'lucide-react';
import { useUiStore } from '../../store/ui-store';
import { useBuildingStore } from '../../store/building-store';
import { usePoliticsStore } from '../../store/politics-store';
import { useClient } from '../../context';
import { BuildingInspector } from '../building/BuildingInspector';
import { ErrorBoundary, IconButton } from '../common';
import { isCapitolBuilding } from '../politics/CivicTabConfig';
import styles from './BuildingInspectorModal.module.css';

/**
 * Derive the subtitle for civic modals.
 * Capitol → "President: {rulerName}"
 * TownHall → "Mayor: {mayorName}"
 * Uses ActualRuler from building data or mayorName from PoliticsData.
 */
function getCivicSubtitle(
  details: NonNullable<ReturnType<typeof useBuildingStore.getState>['details']>,
  politicsData: ReturnType<typeof usePoliticsStore.getState>['data'],
): string {
  const isCapitol = isCapitolBuilding(details.tabs);

  // Try ActualRuler from building groups (capitolTowns or ministeries both have it)
  const rulerFromGroups = findPropertyValue(details, 'ActualRuler')
    ?? findPropertyValue(details, 'RulerName');

  if (isCapitol) {
    const name = rulerFromGroups ?? details.ownerName;
    return `President: ${name}`;
  }

  // TownHall: use mayorName from PoliticsData, or ActualRuler, or ownerName
  const name = politicsData?.mayorName ?? rulerFromGroups ?? details.ownerName;
  return `Mayor: ${name}`;
}

/** Search all property groups for a named value. */
function findPropertyValue(
  details: NonNullable<ReturnType<typeof useBuildingStore.getState>['details']>,
  propName: string,
): string | undefined {
  for (const group of Object.values(details.groups)) {
    for (const prop of group) {
      if (prop.name === propName && prop.value) return prop.value;
    }
  }
  return undefined;
}

export function BuildingInspectorModal() {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);
  const details = useBuildingStore((s) => s.details);
  const focusedBuilding = useBuildingStore((s) => s.focusedBuilding);
  const politicsData = usePoliticsStore((s) => s.data);
  const client = useClient();

  if (modal !== 'buildingInspector') return null;

  const handleClose = () => {
    closeModal();
    useBuildingStore.getState().clearFocus();
  };

  const handleRefresh = () => {
    if (details) client.onRefreshBuilding(details.x, details.y);
  };

  return (
    <>
      <div className={styles.backdrop} onClick={handleClose} aria-hidden="true" />
      <div className={styles.modal} role="dialog" aria-label={details?.buildingName ?? 'Building Inspector'}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>{details?.buildingName ?? focusedBuilding?.buildingName ?? 'City Government'}</h2>
            {details && (
              <div className={styles.subtitle}>
                <span className={styles.roleLabel}>{getCivicSubtitle(details, politicsData)}</span>
                {details.x !== undefined && details.y !== undefined && (
                  <span className={styles.coords}>{details.x}, {details.y}</span>
                )}
              </div>
            )}
          </div>
          <div className={styles.headerActions}>
            <IconButton
              icon={<RefreshCw size={16} />}
              label="Refresh"
              size="sm"
              variant="ghost"
              onClick={handleRefresh}
            />
            <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className={styles.body}>
          <ErrorBoundary>
            <BuildingInspector hideHeader />
          </ErrorBoundary>
        </div>
      </div>
    </>
  );
}
