/**
 * RatingsRail — the four left sub-tabs of the Politics page (`ratingtabs.asp`).
 *
 *   POPULAR RATING   read-only  (`popularratings.asp`)
 *   TYCOONS' RATINGS ratable    (`tycoonratings.asp` -> RDOSetRatingFrom)
 *   IFEL's RATING    read-only  (`ifelratings.asp`)
 *   PUBLICITY        ruler only (`mayorpub.asp` -> RDOSetPublicity)
 *
 * `ratingtabs.asp:75-135` hides all but IFEL when the seat is vacant
 * (`if Obj.HasRuler`) — there is nobody to rate and nobody buying publicity.
 */

import { useCallback } from 'react';
import type { PoliticsData, PoliticsRatingEntry } from '@/shared/types';
import { usePoliticsStore, type RatingRail } from '../../store/politics-store';
import { useGameStore } from '../../store/game-store';
import { useClient } from '../../context';
import { ProgressBar } from '../common';
import styles from './PoliticsPanel.module.css';

interface RatingsRailProps {
  data: PoliticsData;
}

const RAIL_LABELS: Record<RatingRail, string> = {
  popular: 'Popular',
  tycoons: "Tycoons'",
  ifel: "IFEL's",
  publicity: 'Publicity',
};

/**
 * The eleven values Voyager's own rating form offers — 0 to 100 by 10
 * (`boardmsg.asp:344-355`). The in-page dropdown of `tycoonratings.asp:154-158`
 * offers only five; the wider range is the one the server has always accepted.
 */
const RATING_CHOICES = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];

/** `mayorpub.asp:187-191` — five levels, labels from `ePolitics.lng:8-12`. */
const PUBLICITY_CHOICES: Array<{ value: number; label: string }> = [
  { value: 100, label: 'Highest' },
  { value: 75, label: 'High' },
  { value: 50, label: 'Normal' },
  { value: 25, label: 'Low' },
  { value: 0, label: 'Lowest' },
];

function ReadOnlyRatings({ rows }: { rows: PoliticsRatingEntry[] }) {
  if (rows.length === 0) {
    return <div className={styles.politicsEmptyRail}>No ratings published for this office.</div>;
  }
  return (
    <div className={styles.ratings}>
      {rows.map((rating) => (
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
  );
}

export function RatingsRail({ data }: RatingsRailProps) {
  const client = useClient();
  const activeRail = usePoliticsStore((s) => s.activeRatingRail);
  const setActiveRail = usePoliticsStore((s) => s.setActiveRatingRail);
  const pendingRatings = usePoliticsStore((s) => s.pendingRatings);
  const pendingPublicity = usePoliticsStore((s) => s.pendingPublicity);
  const username = useGameStore((s) => s.username);

  const isRuler = username !== '' && data.mayorName.toLowerCase() === username.toLowerCase();

  const handleRate = useCallback((ratingId: string, value: string) => {
    client.onSetPoliticsRating(ratingId, parseInt(value, 10));
  }, [client]);

  const handlePublicity = useCallback((ratingId: string, value: string) => {
    client.onSetPoliticsPublicity(ratingId, parseInt(value, 10));
  }, [client]);

  // `ratingtabs.asp:75` / `:118` — the two ruler-dependent rails.
  const rails: RatingRail[] = data.hasRuler
    ? ['popular', 'tycoons', 'ifel', 'publicity']
    : ['ifel'];
  const rail = rails.includes(activeRail) ? activeRail : rails[0];

  return (
    <>
      <div className={styles.railBar} role="tablist" aria-label="Ratings">
        {rails.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={rail === id}
            className={rail === id ? `${styles.railTab} ${styles.railTabActive}` : styles.railTab}
            onClick={() => setActiveRail(id)}
          >
            {RAIL_LABELS[id]}
          </button>
        ))}
      </div>

      <div className={styles.railBody}>
        {rail === 'popular' && <ReadOnlyRatings rows={data.popularRatings} />}
        {rail === 'ifel' && <ReadOnlyRatings rows={data.ifelRatings} />}

        {rail === 'tycoons' && (
          data.tycoonsRatings.length === 0 ? (
            <div className={styles.politicsEmptyRail}>No ratings published for this office.</div>
          ) : (
            <>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Criterion</th>
                    <th>Rating</th>
                    <th>Your opinion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tycoonsRatings.map((rating) => {
                    const sent = rating.id ? pendingRatings.get(rating.id) : undefined;
                    return (
                      <tr key={rating.name}>
                        <td>{rating.name}</td>
                        <td className={sent === undefined ? undefined : styles.ratingSuperseded}>
                          {rating.value}%
                        </td>
                        <td>
                          {/* A row with no cache id has no RatingId to send back
                              — the rail shows it, but it cannot be rated. */}
                          {rating.id === undefined ? (
                            <span className={styles.ratingUnavailable}>—</span>
                          ) : (
                            <select
                              className={styles.ratingSelect}
                              aria-label={`Your rating for ${rating.name}`}
                              value={sent ?? ''}
                              onChange={(e) => handleRate(rating.id!, e.target.value)}
                            >
                              <option value="" disabled>Rate…</option>
                              {RATING_CHOICES.map((v) => (
                                <option key={v} value={v}>{v}%</option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* StrTycoonRatings_1 — ePolitics.lng:50. The sent value is not the
                  new rating: the server mixes it with everyone else's, weighted
                  by prestige, and the figure above only moves at the next cache. */}
              <p className={styles.railNote}>
                Values you send are marked. They are mixed with those sent by other
                tycoons, weighted by personal prestige, and take effect at the next
                survey — the rating shown does not change immediately.
              </p>
            </>
          )
        )}

        {rail === 'publicity' && (
          <>
            {data.publicityAds && <p className={styles.railLead}>{data.publicityAds}</p>}
            {data.publicity.length === 0 ? (
              <div className={styles.politicsEmptyRail}>No publicity criteria published.</div>
            ) : (
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Criterion</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {data.publicity.map((row) => {
                    const level = pendingPublicity.get(row.id) ?? row.level;
                    return (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>
                          {/* `mayorpub.asp:52` — only the office holder may move
                              these, and `rdoModifyPub.asp:15` re-checks it. */}
                          {isRuler ? (
                            <select
                              className={styles.ratingSelect}
                              aria-label={`Publicity priority for ${row.name}`}
                              value={level}
                              onChange={(e) => handlePublicity(row.id, e.target.value)}
                            >
                              {PUBLICITY_CHOICES.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                              ))}
                            </select>
                          ) : (
                            PUBLICITY_CHOICES.find((c) => c.value === level)?.label ?? '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {isRuler && (
              /* StrMayorPub_3 / StrMayorPub_1 — ePolitics.lng:3,6 */
              <p className={styles.railNote}>
                Change the priorities to distribute your publicity time. Configure
                the providers themselves on the Town Hall&apos;s Advertisement settings.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
