/**
 * PoliticsSection — the Politics page of Voyager, inside the civic modal.
 *
 * Voyager renders `politics.asp` as a full-screen frameset: a header, then a
 * two-column body — the ruler and his ratings on the left, the opposition and
 * your campaign on the right. The same two columns live here, side by side on a
 * wide modal and stacked on a narrow one; nothing goes full screen.
 *
 * It is also the one civic tab that FETCHES. `getPoliticsData` costs five HTTP
 * round-trips to the world's IIS plus two cache reads, so nothing is requested
 * until this tab is mounted — the loading model the gate work settled on.
 */

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePoliticsStore } from '../../store/politics-store';
import { useClient } from '../../context';
import { SkeletonLines, IconButton } from '../common';
import { RulerCard } from './RulerCard';
import { RatingsRail } from './RatingsRail';
import { CampaignPanel } from './CampaignPanel';
import styles from './PoliticsPanel.module.css';

interface PoliticsSectionProps {
  buildingX: number;
  buildingY: number;
}

export function PoliticsSection({ buildingX, buildingY }: PoliticsSectionProps) {
  const client = useClient();
  const data = usePoliticsStore((s) => s.data);
  const loadState = usePoliticsStore((s) => s.loadState);
  const townName = usePoliticsStore((s) => s.townName);
  const isCapitol = usePoliticsStore((s) => s.isCapitol);

  // The lazy load, and the only place the Politics data is ever requested.
  // `loadState` returning to `idle` — which `ClientBridge.refreshPoliticsData`
  // does after a mutation — re-runs this, so one effect serves both paths.
  useEffect(() => {
    if (loadState === 'idle') {
      client.onRequestPoliticsData(townName, buildingX, buildingY, isCapitol);
    }
  }, [loadState, townName, buildingX, buildingY, isCapitol, client]);

  if (loadState === 'idle' || loadState === 'loading') {
    return (
      <div className={styles.loading}>
        <SkeletonLines lines={6} />
      </div>
    );
  }

  if (!data) {
    return <div className={styles.empty}>Politics data is not available.</div>;
  }

  const years = data.yearsToElections;
  const place = data.isCapitol ? 'Capitol' : data.townName || 'Town Hall';

  return (
    <div className={styles.politicsPage}>
      {/* `header.asp` — the place and the countdown, one line. */}
      <header className={styles.politicsHeader}>
        <span className={styles.politicsPlace}>{place}</span>
        <span className={styles.politicsCountdown}>
          {years} {years === 1 ? 'year' : 'years'} to elections
        </span>
        <IconButton
          icon={<RefreshCw size={14} />}
          label="Refresh politics data"
          size="sm"
          variant="ghost"
          onClick={() => usePoliticsStore.getState().setLoadState('idle')}
        />
      </header>

      <div className={styles.politicsColumns}>
        <div className={styles.politicsColumn}>
          <RulerCard data={data} />
          <RatingsRail data={data} />
        </div>
        <div className={styles.politicsColumn}>
          <CampaignPanel data={data} buildingX={buildingX} buildingY={buildingY} />
        </div>
      </div>
    </div>
  );
}
