/**
 * PoliticsHome — the "Government" surface (doc/ux/missing-features.md P1, P2).
 *
 * Until now `rightPanel: 'politics'` was declared but rendered nothing on desktop and an
 * empty sheet on mobile; the only way to a town's taxes was to find its Town Hall on the
 * map by hand. This surface gives politics a front door, with what the client already has:
 *  - the Capitol (`onOpenCapitol`, which resolves the capitol coordinates the server sent),
 *  - the list of towns (`onSearchMenuTowns`, the directory page the Search panel reads),
 *    each opening its Town Hall through `onNavigateToBuilding(x, y)` — the same focus path a
 *    click on the map takes, so no new RDO member is involved.
 */

import { useEffect } from 'react';
import { Landmark, Building2, Users, ChevronRight } from 'lucide-react';
import { useClient } from '../../context';
import { useSearchStore } from '../../store/search-store';
import { useGameStore } from '../../store/game-store';
import { Button, ErrorState, Skeleton } from '../common';
import type { TownInfo } from '@/shared/types';
import styles from './PoliticsHome.module.css';

export function PoliticsHome() {
  const client = useClient();
  const townsData = useSearchStore((s) => s.townsData);
  const isLoading = useSearchStore((s) => s.isLoading);
  const capitolCoords = useGameStore((s) => s.capitolCoords);
  const ownerRole = useGameStore((s) => s.ownerRole);

  // One directory read, once per session (the Search panel shares the same store slot).
  useEffect(() => {
    if (!townsData) client.onSearchMenuTowns();
  }, [client, townsData]);

  const towns: TownInfo[] = townsData?.towns ?? [];

  return (
    <div className={styles.root}>
      {ownerRole && (
        <p className={styles.role}>
          You are <strong>{ownerRole}</strong>.
        </p>
      )}

      <section className={styles.section} aria-labelledby="politics-capitol">
        <h3 id="politics-capitol" className={styles.sectionTitle}>Capitol</h3>
        <Button
          variant="secondary"
          iconLeft={<Landmark size={16} />}
          iconRight={<ChevronRight size={14} />}
          onClick={() => client.onOpenCapitol()}
          disabled={!capitolCoords}
          title={capitolCoords ? undefined : 'No Capitol found in this world'}
          className={styles.wide}
        >
          Open the Capitol
        </Button>
      </section>

      <section className={styles.section} aria-labelledby="politics-towns">
        <h3 id="politics-towns" className={styles.sectionTitle}>
          Towns <span className={styles.count}>{towns.length > 0 ? towns.length : ''}</span>
        </h3>
        {isLoading && towns.length === 0 && (
          <div aria-busy="true" className={styles.list}>
            <Skeleton height="44px" />
            <Skeleton height="44px" />
            <Skeleton height="44px" />
          </div>
        )}
        {!isLoading && townsData && towns.length === 0 && (
          <ErrorState title="No towns returned" description="The directory answered with an empty list." onRetry={() => client.onSearchMenuTowns()} />
        )}
        {towns.length > 0 && (
          <ul className={styles.list} role="list">
            {towns.map((town) => (
              <li key={town.name}>
                <button
                  type="button"
                  className={styles.townRow}
                  onClick={() => client.onNavigateToBuilding(town.x, town.y)}
                  title={`Open the Town Hall of ${town.name}`}
                >
                  <span className={styles.townIcon} aria-hidden="true"><Building2 size={16} /></span>
                  <span className={styles.townMain}>
                    <span className={styles.townName}>{town.name}</span>
                    <span className={styles.townMeta}>
                      {town.mayor ? `Mayor: ${town.mayor}` : 'No mayor'}
                      {' · '}
                      <Users size={11} aria-hidden="true" /> {town.population.toLocaleString()}
                      {' · QoL '}{town.qualityOfLife}%
                    </span>
                  </span>
                  <ChevronRight size={16} className={styles.chevron} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
