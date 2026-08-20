/**
 * ElectionsSection — the ballot, and only the ballot.
 *
 * This tab used to carry three things at once: the ballot, the Popular/IFEL
 * ratings, and the campaign buttons. The last two now live on the Politics tab,
 * where they come from the server's own campaign page rather than from a
 * client-side guess — and where Voyager puts them.
 *
 * Keeping both would have meant two "Start Campaign" buttons on one modal, gated
 * by two different rules: this one inferred candidacy from the `Candidate{i}`
 * series and from `PoliticsData.campaigns`, while `tycooncampaign.asp` reports
 * the answer directly (`:222-224`) along with the reason when it is no. Two
 * controls for one action, disagreeing, is worse than one that is right.
 *
 * The split matches the reference client, which has a Votes SHEET
 * (`VotesSheet.pas`, this tab) and a separate Politics PAGE (`politics.asp`).
 */

import type { BuildingPropertyValue } from '@/shared/types';
import { useBuildingStore } from '../../store/building-store';
import { VotesTab } from './VotesTab';
import styles from './PoliticsPanel.module.css';

interface ElectionsSectionProps {
  votesProperties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
}

export function ElectionsSection({
  votesProperties,
  buildingX,
  buildingY,
}: ElectionsSectionProps) {
  if (votesProperties.length === 0) {
    return <div className={styles.empty}>No election is being held here.</div>;
  }

  return (
    <>
      <VotesTab properties={votesProperties} buildingX={buildingX} buildingY={buildingY} />
      <p className={styles.railNote}>
        Ratings, campaigns and the candidates&apos; programmes are on the{' '}
        <button
          className={styles.inlineLink}
          onClick={() => useBuildingStore.getState().setCurrentTab('politics')}
        >
          Politics
        </button>{' '}
        tab.
      </p>
    </>
  );
}
