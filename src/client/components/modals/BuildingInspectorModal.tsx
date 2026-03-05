/**
 * BuildingInspectorModal — Centered modal for civic buildings (Capitol, TownHall).
 *
 * Wraps the standard BuildingInspector in a wider centered modal
 * to accommodate dense tab content (coverage, towns, ministers, votes).
 */

import { X } from 'lucide-react';
import { useUiStore } from '../../store/ui-store';
import { useBuildingStore } from '../../store/building-store';
import { BuildingInspector } from '../building/BuildingInspector';
import { ErrorBoundary } from '../common';
import styles from './BuildingInspectorModal.module.css';

export function BuildingInspectorModal() {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);
  const details = useBuildingStore((s) => s.details);

  if (modal !== 'buildingInspector') return null;

  const handleClose = () => {
    closeModal();
    useBuildingStore.getState().clearFocus();
  };

  return (
    <>
      <div className={styles.backdrop} onClick={handleClose} aria-hidden="true" />
      <div className={styles.modal} role="dialog" aria-label={details?.buildingName ?? 'Building Inspector'}>
        <div className={styles.header}>
          <h2 className={styles.title}>{details?.buildingName ?? 'City Government'}</h2>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className={styles.body}>
          <ErrorBoundary>
            <BuildingInspector />
          </ErrorBoundary>
        </div>
      </div>
    </>
  );
}
