/**
 * PoliticsPanel — Town politics, elections, campaigns in the right panel.
 */

import { usePoliticsStore } from '../../store/politics-store';
import { ProgressBar, Skeleton } from '../common';
import styles from './PoliticsPanel.module.css';

export function PoliticsPanel() {
  const data = usePoliticsStore((s) => s.data);
  const townName = usePoliticsStore((s) => s.townName);
  const isLoading = usePoliticsStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className={styles.panel}>
        <div className={styles.loading}>
          <Skeleton width="100%" height="40px" />
          <Skeleton width="100%" height="120px" />
          <Skeleton width="100%" height="80px" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          Select a town hall to view politics
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.townHeader}>
        <h3 className={styles.townName}>{townName || data.townName || 'Town Politics'}</h3>
        {data.mayorName && (
          <span className={styles.mayor}>Mayor: {data.mayorName}</span>
        )}
      </div>

      {/* Election countdown */}
      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Election</h4>
        <div className={styles.countdown}>
          <span className={styles.countdownValue}>{data.yearsToElections}</span>
          <span className={styles.countdownLabel}>years until next election</span>
        </div>
      </section>

      {/* Approval ratings */}
      {data.popularRatings && data.popularRatings.length > 0 && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Popular Ratings</h4>
          <div className={styles.ratings}>
            {data.popularRatings.map((rating) => (
              <div key={rating.name} className={styles.ratingRow}>
                <span className={styles.ratingName}>{rating.name}</span>
                <ProgressBar
                  value={rating.value / 100}
                  variant={rating.value >= 50 ? 'success' : 'warning'}
                  label={`${rating.value}%`}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active campaigns */}
      {data.campaigns && data.campaigns.length > 0 && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Active Campaigns</h4>
          <div className={styles.campaigns}>
            {data.campaigns.map((campaign, i) => (
              <div key={i} className={styles.campaignCard}>
                <span className={styles.campaignName}>{campaign.candidateName}</span>
                <span className={styles.campaignStatus}>Rating: {campaign.rating}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.canLaunchCampaign && (
        <div className={styles.section}>
          <button className={styles.launchBtn}>Launch Campaign</button>
        </div>
      )}
    </div>
  );
}
