/**
 * `civicTabGroupIds` — the inverse of GROUP_TO_CIVIC_TAB.
 *
 * A civic tab consolidates several server groups, and the section-at-a-time
 * inspector reads them together when the tab opens. Getting this list wrong
 * shows an empty Administration or Demographics tab, so it is pinned here
 * against the mapping and against what the building actually declares.
 */

import { describe, it, expect } from '@jest/globals';
import { civicTabGroupIds } from '../CivicTabConfig';
import type { BuildingDetailsTab } from '@/shared/types';

function tabs(...ids: string[]): BuildingDetailsTab[] {
  return ids.map((id, i) => ({ id, name: id, order: i, icon: '', handlerName: id }));
}

const CAPITOL = tabs('capitolGeneral', 'capitolTowns', 'ministeries', 'townTaxes', 'votes');
const TOWN_HALL = tabs('townGeneral', 'townJobs', 'townRes', 'townServices', 'votes');

describe('civicTabGroupIds', () => {
  it('gives Administration the three governance groups of a Capitol', () => {
    expect(civicTabGroupIds('administration', CAPITOL).sort())
      .toEqual(['capitolTowns', 'ministeries', 'townTaxes']);
  });

  it('gives Demographics the three population groups of a Town Hall', () => {
    expect(civicTabGroupIds('demographics', TOWN_HALL).sort())
      .toEqual(['townJobs', 'townRes', 'townServices']);
  });

  it('gives Elections the votes group', () => {
    expect(civicTabGroupIds('elections', CAPITOL)).toEqual(['votes']);
  });

  /**
   * Overview owns the general group and READS the votes group — the ruler
   * banner takes its name, votes and campaign figures from it. Both have to
   * arrive together or the banner opens blank.
   */
  it('gives Overview the general group AND the votes group it reads', () => {
    expect(civicTabGroupIds('overview', CAPITOL).sort()).toEqual(['capitolGeneral', 'votes']);
    expect(civicTabGroupIds('overview', TOWN_HALL).sort()).toEqual(['townGeneral', 'votes']);
  });

  it('does not name votes for a building that declares none', () => {
    expect(civicTabGroupIds('overview', tabs('townGeneral'))).toEqual(['townGeneral']);
  });

  it('names each group once, even when a tab both owns and reads it', () => {
    const ids = civicTabGroupIds('overview', CAPITOL);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives Politics nothing — its content comes from PoliticsData', () => {
    expect(civicTabGroupIds('politics', CAPITOL)).toEqual([]);
  });

  /**
   * A Town Hall has no `capitolTowns` or `ministeries`. Asking the server for
   * them would read properties the facility does not have.
   */
  it('never names a group the building does not declare', () => {
    expect(civicTabGroupIds('administration', TOWN_HALL)).toEqual([]);
  });

  it('returns nothing at all for a building with no groups', () => {
    for (const tab of ['overview', 'administration', 'demographics', 'elections'] as const) {
      expect(civicTabGroupIds(tab, [])).toEqual([]);
    }
  });
});
