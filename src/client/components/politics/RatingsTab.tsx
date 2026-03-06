/**
 * RatingsTab — Popular ratings, IFEL ratings, tycoon ratings, campaigns.
 * Extracted from the original PoliticsPanel. Uses ASP-fetched PoliticsData.
 */

import { usePoliticsStore } from '../../store/politics-store';
import { useClient } from '../../context';
import { ProgressBar } from '../common';
import styles from './PoliticsPanel.module.css';

interface RatingsTabProps {
  buildingX: number;
  buildingY: number;
}

export function RatingsTab({ buildingX, buildingY }: RatingsTabProps) {
  const client = useClient();
  const data = usePoliticsStore((s) => s.data);

  if (!data) {
    return <div className={styles.empty}>No ratings data available</div>;
  }

  return (
    <>
      {/* Election countdown */}
      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Election</h4>
        <div className={styles.countdown}>
          <span className={styles.countdownValue}>{data.yearsToElections}</span>
          <span className={styles.countdownLabel}>years until next election</span>
        </div>
      </section>

      {/* Popular ratings */}
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
                  showLabel
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* IFEL ratings */}
      {data.ifelRatings && data.ifelRatings.length > 0 && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>IFEL Ratings</h4>
          <div className={styles.ratings}>
            {data.ifelRatings.map((rating) => (
              <div key={rating.name} className={styles.ratingRow}>
                <span className={styles.ratingName}>{rating.name}</span>
                <ProgressBar
                  value={rating.value / 100}
                  variant={rating.value >= 50 ? 'success' : 'warning'}
                  showLabel
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
          <button
            className={styles.launchBtn}
            onClick={() => client.onLaunchCampaign(buildingX, buildingY)}
          >
            Launch Campaign
          </button>
        </div>
      )}
    </>
  );
}
