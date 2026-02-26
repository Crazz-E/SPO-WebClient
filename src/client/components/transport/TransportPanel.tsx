/**
 * TransportPanel — Train list with route info in the right panel.
 */

import { useTransportStore } from '../../store/transport-store';
import { Skeleton } from '../common';
import { Train } from 'lucide-react';
import styles from './TransportPanel.module.css';

const STATUS_COLORS: Record<string, string> = {
  running: 'var(--success)',
  stopped: 'var(--text-disabled)',
  loading: 'var(--warning)',
};

export function TransportPanel() {
  const data = useTransportStore((s) => s.data);
  const selectedTrain = useTransportStore((s) => s.selectedTrain);
  const selectTrain = useTransportStore((s) => s.selectTrain);
  const isLoading = useTransportStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className={styles.panel}>
        <div className={styles.loading}>
          <Skeleton width="100%" height="64px" />
          <Skeleton width="100%" height="64px" />
          <Skeleton width="100%" height="64px" />
        </div>
      </div>
    );
  }

  if (!data || !data.trains || data.trains.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <Train size={32} className={styles.emptyIcon} />
          <span>No trains available</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.trainList}>
        {data.trains.map((train) => (
          <button
            key={train.trainId}
            className={`${styles.trainCard} ${selectedTrain?.trainId === train.trainId ? styles.selected : ''}`}
            onClick={() => selectTrain(train)}
          >
            <div className={styles.trainHeader}>
              <Train size={16} className={styles.trainIcon} />
              <span className={styles.trainName}>{train.name}</span>
              <span
                className={styles.trainStatus}
                style={{ color: STATUS_COLORS[train.status] ?? 'var(--text-muted)' }}
              >
                {train.status}
              </span>
            </div>
            {train.routeStops && train.routeStops.length > 0 && (
              <div className={styles.route}>
                {train.routeStops.map((stop, i) => (
                  <span key={i} className={styles.stop}>
                    {stop.stationName}
                    {i < train.routeStops.length - 1 && <span className={styles.arrow}>→</span>}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
