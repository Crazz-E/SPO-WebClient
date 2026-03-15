/**
 * OverviewSection — Ruler banner + election countdown + general building properties.
 * Consolidates ruler info (previously repeated on Towns/Ministries tabs) into one place.
 */

import type { BuildingPropertyValue } from '@/shared/types';
import { usePoliticsStore } from '../../store/politics-store';
import { useGameStore } from '../../store/game-store';
import { PropertyGroup } from '../building/PropertyGroup';
import { ProgressBar } from '../common';
import { buildValueMap, getNum, formatCompact, isPresidentRole } from './capitol-utils';
import { isCapitolBuilding } from './CivicTabConfig';
import type { BuildingDetailsTab } from '@/shared/types';
import styles from './PoliticsPanel.module.css';

interface OverviewSectionProps {
  generalProperties: BuildingPropertyValue[];
  votesProperties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
  serverTabs: BuildingDetailsTab[];
}

export function OverviewSection({
  generalProperties,
  votesProperties,
  buildingX,
  buildingY,
  serverTabs,
}: OverviewSectionProps) {
  const ownerRole = useGameStore((s) => s.ownerRole);
  const data = usePoliticsStore((s) => s.data);
  const isCapitol = isCapitolBuilding(serverTabs);

  // Ruler info from votes group
  const valueMap = buildValueMap(votesProperties);
  const rulerName = valueMap.get('RulerName') ?? valueMap.get('ActualRuler') ?? '';
  const rulerVotes = getNum(valueMap, 'RulerVotes');
  const rulerRating = getNum(valueMap, 'RulerCmpRat');
  const rulerPoints = getNum(valueMap, 'RulerCmpPnts');

  const roleTitle = isCapitol ? 'President' : 'Mayor';
  const townName = data?.townName ?? '';

  // Filter general properties (remove Name — shown in modal header)
  const filteredGeneral = generalProperties.filter((p) => p.name !== 'Name');

  return (
    <>
      {/* Ruler banner */}
      {rulerName && (
        <div className={styles.rulerBanner}>
          <div className={styles.rulerAvatar}>
            {rulerName.charAt(0).toUpperCase()}
          </div>
          <div className={styles.rulerInfo}>
            <div className={styles.rulerName}>{rulerName}</div>
            <div className={styles.rulerRole}>
              {roleTitle}{townName ? ` of ${townName}` : ''}
            </div>
          </div>
          <div className={styles.rulerStats}>
            <div className={styles.rulerStat}>
              <div className={styles.rulerStatValue}>{formatCompact(rulerVotes)}</div>
              <div className={styles.rulerStatLabel}>Votes</div>
            </div>
            <div className={styles.rulerStat}>
              <div className={styles.rulerStatValue}>{rulerRating}%</div>
              <div className={styles.rulerStatLabel}>Rating</div>
            </div>
            <div className={styles.rulerStat}>
              <div className={styles.rulerStatValue}>{formatCompact(rulerPoints)}</div>
              <div className={styles.rulerStatLabel}>Points</div>
            </div>
          </div>
        </div>
      )}

      {/* Election countdown */}
      {data && (
        <div className={styles.countdownBar}>
          <span className={styles.countdownValue}>{data.yearsToElections}</span>
          <span className={styles.countdownLabel}>
            {data.yearsToElections === 1 ? 'year' : 'years'} until next {isCapitol ? 'presidential' : 'mayoral'} election
          </span>
        </div>
      )}

      {/* General building properties */}
      {filteredGeneral.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>General Information</h4>
          <PropertyGroup properties={filteredGeneral} buildingX={buildingX} buildingY={buildingY} />
        </div>
      )}
    </>
  );
}
