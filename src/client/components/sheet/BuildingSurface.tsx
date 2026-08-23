/**
 * BuildingSurface — the `building` content of the universal sheet.
 *
 * One surface for every building (socle-3c). A civic building (Capitol, Town Hall) used to
 * open a centred modal with its own header; opening any picker from it destroyed the
 * inspector (audit §1.1 P6). Now it is the same sheet content as a factory, with the civic
 * header (President / Mayor, refresh) drawn here and the inspector body below it.
 */

import { RefreshCw } from 'lucide-react';
import { useBuildingStore } from '../../store/building-store';
import { usePoliticsStore } from '../../store/politics-store';
import { useClient } from '../../context';
import { isCivicBuilding } from '@/shared/building-details/civic-buildings';
import { BuildingInspector } from '../building';
import { getCivicSubtitle } from '../building/civic-subtitle';
import { IconButton } from '../common';
import styles from './BuildingSurface.module.css';

export function BuildingSurface() {
  const details = useBuildingStore((s) => s.details);
  const focusedBuilding = useBuildingStore((s) => s.focusedBuilding);
  const politicsData = usePoliticsStore((s) => s.data);
  const client = useClient();

  const visualClass = details?.visualClass ?? focusedBuilding?.visualClass;
  const civic = visualClass ? isCivicBuilding(visualClass) : false;

  if (!civic) return <BuildingInspector />;

  const title = details?.buildingName ?? focusedBuilding?.buildingName ?? 'City Government';
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h2 className={styles.title} tabIndex={-1}>{title}</h2>
          {details && <span className={styles.subtitle}>{getCivicSubtitle(details, politicsData)}</span>}
        </div>
        <IconButton
          icon={<RefreshCw size={16} />}
          label="Refresh"
          size="sm"
          variant="ghost"
          disabled={!details}
          onClick={() => {
            if (details) client.onRefreshBuilding(details.x, details.y);
          }}
        />
      </div>
      <div className={styles.body}>
        <BuildingInspector hideHeader />
      </div>
    </div>
  );
}
