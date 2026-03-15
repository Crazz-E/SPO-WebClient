/**
 * VotesTab — Candidate table with vote buttons and voted-for highlight.
 */

import { useCallback } from 'react';
import type { BuildingPropertyValue } from '@/shared/types';
import { useClient } from '../../context';
import { useGameStore } from '../../store/game-store';
import { buildValueMap, getNum, formatCompact } from './capitol-utils';
import styles from './PoliticsPanel.module.css';

interface VotesTabProps {
  properties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
}

export function VotesTab({ properties, buildingX, buildingY }: VotesTabProps) {
  const client = useClient();
  const username = useGameStore((s) => s.username);

  const valueMap = buildValueMap(properties);
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
      {/* Ruler info */}
      {rulerName && (
        <div className={styles.rulerInfo}>
          <div className={styles.rulerStat}>
            <span className={styles.rulerStatLabel}>Ruler</span>
            <span className={styles.rulerStatValue}>{rulerName}</span>
          </div>
          <div className={styles.rulerStat}>
            <span className={styles.rulerStatLabel}>Votes</span>
            <span className={styles.rulerStatValue}>{formatCompact(rulerVotes)}</span>
          </div>
          <div className={styles.rulerStat}>
            <span className={styles.rulerStatLabel}>Rating</span>
            <span className={styles.rulerStatValue}>{rulerRating}%</span>
          </div>
          <div className={styles.rulerStat}>
            <span className={styles.rulerStatLabel}>Points</span>
            <span className={styles.rulerStatValue}>{formatCompact(rulerPoints)}</span>
          </div>
        </div>
      )}

      {/* Candidate table */}
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
                    <td>{c.rating}%</td>
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

    </>
  );
}
