/**
 * ElectionsSection — Merged Ratings + Votes into one coherent elections view.
 * Combines Popular/IFEL ratings (from PoliticsData) with candidate voting (from RDO).
 */

import type { BuildingPropertyValue } from '@/shared/types';
import { usePoliticsStore } from '../../store/politics-store';
import { useClient } from '../../context';
import { ProgressBar } from '../common';
import { VotesTab } from './VotesTab';
import styles from './PoliticsPanel.module.css';

interface ElectionsSectionProps {
  votesProperties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
  isCandidate: boolean;
  holdsOffice: boolean;
}

export function ElectionsSection({
  votesProperties,
  buildingX,
  buildingY,
  isCandidate,
  holdsOffice,
}: ElectionsSectionProps) {
  const client = useClient();
  const data = usePoliticsStore((s) => s.data);

  return (
    <>
      {/* Popular ratings */}
      {data?.popularRatings && data.popularRatings.length > 0 && (
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
      {data?.ifelRatings && data.ifelRatings.length > 0 && (
        <>
          <div className={styles.sectionDivider} />
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
        </>
      )}

      {/* Candidates + voting (from VotesTab) */}
      {votesProperties.length > 0 && (
        <>
          <div className={styles.sectionDivider} />
          <section className={styles.section}>
            <VotesTab properties={votesProperties} buildingX={buildingX} buildingY={buildingY} />
          </section>
        </>
      )}

      {/* Active campaigns */}
      {data?.campaigns && data.campaigns.length > 0 && (
        <>
          <div className={styles.sectionDivider} />
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
        </>
      )}

      {/* Campaign action */}
      {!holdsOffice && (
        <div className={styles.section}>
          {isCandidate ? (
            <button
              className={styles.cancelCampaignBtn}
              onClick={() => client.onCancelCampaign(buildingX, buildingY)}
            >
              Cancel Campaign
            </button>
          ) : (
            <button
              className={styles.launchBtn}
              onClick={() => client.onLaunchCampaign(buildingX, buildingY)}
              disabled={data?.canLaunchCampaign === false}
              title={data?.canLaunchCampaign === false ? (data.campaignMessage ?? 'Not eligible to start a campaign') : undefined}
            >
              Start Campaign
            </button>
          )}
          {data?.campaignMessage && (
            <p className={styles.campaignMessage}>{data.campaignMessage}</p>
          )}
        </div>
      )}
    </>
  );
}
