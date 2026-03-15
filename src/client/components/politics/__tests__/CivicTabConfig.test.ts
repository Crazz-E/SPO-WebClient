import { buildCivicTabs, getGeneralGroupId, isCapitolBuilding } from '../CivicTabConfig';
import type { BuildingDetailsTab } from '@/shared/types';

function makeTab(id: string, handlerName?: string): BuildingDetailsTab {
  return { id, name: id, icon: '', order: 0, handlerName: handlerName ?? id };
}

describe('CivicTabConfig', () => {
  describe('buildCivicTabs', () => {
    it('returns 4 tabs for Capitol (all groups present)', () => {
      const serverTabs = [
        makeTab('capitolGeneral'),
        makeTab('capitolTowns'),
        makeTab('ministeries'),
        makeTab('townJobs'),
        makeTab('townRes'),
        makeTab('votes'),
      ];
      const tabs = buildCivicTabs(serverTabs);
      expect(tabs.map((t) => t.id)).toEqual(['overview', 'administration', 'demographics', 'elections']);
    });

    it('returns 3 tabs for TownHall (no towns/ministries)', () => {
      const serverTabs = [
        makeTab('townGeneral'),
        makeTab('townJobs'),
        makeTab('townRes'),
        makeTab('votes'),
      ];
      const tabs = buildCivicTabs(serverTabs);
      expect(tabs.map((t) => t.id)).toEqual(['overview', 'demographics', 'elections']);
    });

    it('always includes elections even without votes group', () => {
      const serverTabs = [makeTab('capitolGeneral')];
      const tabs = buildCivicTabs(serverTabs);
      expect(tabs.some((t) => t.id === 'elections')).toBe(true);
    });

    it('uses human-readable labels', () => {
      const serverTabs = [
        makeTab('capitolGeneral'),
        makeTab('capitolTowns'),
        makeTab('ministeries'),
        makeTab('townJobs'),
        makeTab('townRes'),
        makeTab('votes'),
      ];
      const tabs = buildCivicTabs(serverTabs);
      expect(tabs.map((t) => t.label)).toEqual(['Overview', 'Administration', 'Demographics', 'Elections']);
    });

    it('omits overview if no general group', () => {
      const serverTabs = [makeTab('votes')];
      const tabs = buildCivicTabs(serverTabs);
      expect(tabs.some((t) => t.id === 'overview')).toBe(false);
    });

    it('omits demographics if no jobs/res groups', () => {
      const serverTabs = [makeTab('capitolGeneral'), makeTab('votes')];
      const tabs = buildCivicTabs(serverTabs);
      expect(tabs.some((t) => t.id === 'demographics')).toBe(false);
    });
  });

  describe('getGeneralGroupId', () => {
    it('returns capitolGeneral for Capitol', () => {
      const tabs = [makeTab('capitolGeneral'), makeTab('votes')];
      expect(getGeneralGroupId(tabs)).toBe('capitolGeneral');
    });

    it('returns townGeneral for TownHall', () => {
      const tabs = [makeTab('townGeneral'), makeTab('votes')];
      expect(getGeneralGroupId(tabs)).toBe('townGeneral');
    });

    it('returns undefined when no general group', () => {
      const tabs = [makeTab('votes')];
      expect(getGeneralGroupId(tabs)).toBeUndefined();
    });

    it('prefers capitolGeneral over townGeneral', () => {
      const tabs = [makeTab('capitolGeneral'), makeTab('townGeneral')];
      expect(getGeneralGroupId(tabs)).toBe('capitolGeneral');
    });
  });

  describe('isCapitolBuilding', () => {
    it('returns true when capitolTowns present', () => {
      const tabs = [makeTab('capitolGeneral'), makeTab('capitolTowns')];
      expect(isCapitolBuilding(tabs)).toBe(true);
    });

    it('returns true when ministeries present', () => {
      const tabs = [makeTab('capitolGeneral'), makeTab('ministeries')];
      expect(isCapitolBuilding(tabs)).toBe(true);
    });

    it('returns false for TownHall (no admin groups)', () => {
      const tabs = [makeTab('townGeneral'), makeTab('townJobs'), makeTab('votes')];
      expect(isCapitolBuilding(tabs)).toBe(false);
    });
  });
});
