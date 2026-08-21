/**
 * VotesTab — the candidate list of `VotesSheet.pas`.
 *
 * One list, not a stat strip plus a list: the reference client renders the
 * sitting ruler as the FIRST ROW of the same ListView as the candidates
 * (`VotesSheet.pas:172-174`, image index 1 at `:231`) and sorts every row by
 * campaign points, descending (`:219-224`). The ruler is on the ballot like everyone else, and
 * separating him out hid the one comparison the tab exists to make.
 */

import { useCallback, useMemo } from 'react';
import { Check, Crown } from 'lucide-react';
import type { BuildingPropertyValue } from '@/shared/types';
import { useClient } from '../../context';
import { buildValueMap, getNum, formatCompact } from './capitol-utils';
import styles from './PoliticsPanel.module.css';

interface VotesTabProps {
  properties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
}

interface BallotRow {
  key: string;
  name: string;
  votes: number;
  rating: number;
  points: number;
  isRuler: boolean;
}

export function VotesTab({ properties }: VotesTabProps) {
  const client = useClient();

  const valueMap = useMemo(() => buildValueMap(properties), [properties]);

  const rows = useMemo<BallotRow[]>(() => {
    const map = valueMap;
    const out: BallotRow[] = [];

    // `VotesSheet.pas:173` — "el presidente" goes in first, and only when the
    // cache carries both his name and his points; emitted at `:174`.
    const rulerName = map.get('RulerName') ?? '';
    const rulerPoints = map.get('RulerCmpPnts') ?? '';
    if (rulerName !== '' && rulerPoints !== '') {
      out.push({
        key: `ruler:${rulerName}`,
        name: rulerName,
        votes: getNum(map, 'RulerVotes'),
        rating: getNum(map, 'RulerCmpRat'),
        points: getNum(map, 'RulerCmpPnts'),
        isRuler: true,
      });
    }

    // `:170-183` — one row per campaign, skipping any whose name, votes or
    // points the cache left empty, exactly as the reference client does.
    const count = getNum(map, 'CampaignCount');
    for (let i = 0; i < count; i++) {
      const name = map.get(`Candidate${i}`) ?? '';
      if (name === '' || (map.get(`Votes${i}`) ?? '') === '' || (map.get(`CmpPnts${i}`) ?? '') === '') continue;
      out.push({
        key: `cand:${i}:${name}`,
        name,
        votes: getNum(map, `Votes${i}`),
        rating: getNum(map, `CmpRat${i}`),
        points: getNum(map, `CmpPnts${i}`),
        isRuler: false,
      });
    }

    // `:206-211` — insertion sort on points, descending, ties keeping page order.
    return out.sort((a, b) => b.points - a.points);
  }, [valueMap]);

  // `RDOVoteOf(voter)` on CurrBlock, folded into the votes group server-side.
  const voteOf = valueMap.get('VoteOf') ?? '';

  const handleVote = useCallback(
    (candidateName: string) => {
      client.onBuildingAction('voteCandidate', { Candidate: candidateName });
    },
    [client],
  );

  if (rows.length === 0) {
    return <div className={styles.empty}>No candidates running for election</div>;
  }

  return (
    <div className={styles.section}>
      <h4 className={styles.sectionTitle}>Ballot</h4>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th aria-label="Marker" />
            <th>Candidate</th>
            <th>Rating</th>
            <th>Valid Votes</th>
            <th>Points</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isVotedFor = voteOf !== '' && row.name === voteOf;
            return (
              <tr key={row.key} className={isVotedFor ? styles.votedRow : undefined}>
                <td className={styles.ballotMarker}>
                  {/* `VotesSheet.pas:229-234`: image 0 is your vote (set at `:311`,
                      `:330-331`), image 1 the
                      sitting ruler, none for an ordinary candidate. Your vote
                      wins the cell when the ruler is who you voted for. */}
                  {isVotedFor
                    ? <Check size={14} aria-label="Your vote" />
                    : row.isRuler
                      ? <Crown size={14} aria-label="In office" />
                      : null}
                </td>
                <td>{row.name}</td>
                <td>{row.rating}%</td>
                <td>{formatCompact(row.votes)}</td>
                <td>{formatCompact(row.points)}</td>
                <td>
                  {isVotedFor ? null : (
                    <button className={styles.actionBtn} onClick={() => handleVote(row.name)}>
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
  );
}
