/**
 * ElectionsTab — Unified elections view merging the old VotesTab + RatingsTab.
 *
 * Sections (top to bottom):
 * 1. Ruler banner (compact)
 * 2. Election countdown
 * 3. Candidates table + Vote buttons
 * 4. Popular & IFEL ratings
 * 5. Active campaigns
 * 6. Start/Cancel campaign actions
 */

import { useCallback } from 'react';
import type { BuildingPropertyValue } from '@/shared/types';
import { useClient } from '../../context';
import { useGameStore } from '../../store/game-store';
import { usePoliticsStore } from '../../store/politics-store';
import { ProgressBar } from '../common';
import { buildValueMap, getNum, formatCompact, formatPercent } from './capitol-utils';
import styles from './PoliticsPanel.module.css';

interface ElectionsTabProps {
  voteProperties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
  isCandidate: boolean;
  holdsOffice: boolean;
}

export function ElectionsTab({ voteProperties, buildingX, buildingY, isCandidate, holdsOffice }: ElectionsTabProps) {
  const client = useClient();
  const username = useGameStore((s) => s.username);
  const data = usePoliticsStore((s) => s.data);

  const valueMap = buildValueMap(voteProperties);
  const rulerName = valueMap.get('RulerName') ?? '';
  const rulerVotes = getNum(valueMap, 'RulerVotes');
  const rulerRating = getNum(valueMap, 'RulerCmpRat');
  const rulerPoints = getNum(valueMap, 'RulerCmpPnts');
  const voteOf = valueMap.get('VoteOf') ?? '';
  const candidateCount = getNum(valueMap, 'CampaignCount');

  const candidates = Array.from({ length: candidateCount }, (_, i) => ({
    index: i,
    name: valueMap.get(`Candidate${i}`) ?? '',
    votes: getNum(valueMap, `Votes${i}`),
    rating: getNum(valueMap, `CmpRat${i}`),
    points: getNum(valueMap, `CmpPnts${i}`),
  }));

  const handleVote = useCallback(
    (candidateName: string) => {
      client.onBuildingAction('voteCandidate', {
        Candidate: candidateName,
      });
    },
    [client],
  );

  return (
    <>
      {/* ── Ruler banner ── */}
      {rulerName && (
        <div className={styles.rulerBanner}>
          <span className={styles.rulerBannerName}>{rulerName}</span>
          <span className={styles.rulerBannerStat}>Votes: {formatCompact(rulerVotes)}</span>
          <span className={styles.rulerBannerStat}>Rating: {formatPercent(rulerRating)}</span>
          <span className={styles.rulerBannerStat}>Points: {formatCompact(rulerPoints)}</span>
        </div>
      )}

      {/* ── Election countdown ── */}
      {data && (
        <section className={styles.section}>
          <div className={styles.countdown}>
            <span className={styles.countdownValue}>{data.yearsToElections}</span>
            <span className={styles.countdownLabel}>years until next election</span>
          </div>
        </section>
      )}

      {/* ── Candidates table ── */}
      {candidates.length > 0 ? (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Candidates</h4>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Votes</th>
                <th>Rating</th>
                <th>Points</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const isVotedFor = voteOf !== '' && c.name === voteOf;
                return (
                  <tr key={c.index} className={isVotedFor ? styles.votedRow : undefined}>
                    <td>
                      {c.name}
                      {isVotedFor && <span className={styles.votedBadge}>Your vote</span>}
                    </td>
                    <td>{formatCompact(c.votes)}</td>
                    <td>{formatPercent(c.rating)}</td>
                    <td>{formatCompact(c.points)}</td>
                    <td>
                      {isVotedFor ? null : (
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleVote(c.name)}
                        >
                          Vote
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.empty}>No candidates running for election</div>
      )}

      {/* ── Popular ratings ── */}
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

      {/* ── IFEL ratings ── */}
      {data?.ifelRatings && data.ifelRatings.length > 0 && (
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

      {/* ── Active campaigns ── */}
      {data?.campaigns && data.campaigns.length > 0 && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Active Campaigns</h4>
          <div className={styles.campaigns}>
            {data.campaigns.map((campaign, i) => (
              <div key={i} className={styles.campaignCard}>
                <span className={styles.campaignName}>{campaign.candidateName}</span>
                <span className={styles.campaignStatus}>Rating: {formatPercent(campaign.rating)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Campaign action — hidden for office holders ── */}
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
