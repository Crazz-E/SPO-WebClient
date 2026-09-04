/**
 * Tests for profile-store state management.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { useProfileStore } from './profile-store';
import type { CurriculumData, BankAccountData, PolicyData } from '@/shared/types';

const mockCurriculum: CurriculumData = {
  tycoonName: 'TestTycoon',
  currentLevel: 3,
  currentLevelName: 'Entrepreneur',
  currentLevelDescription: 'A seasoned entrepreneur',
  currentLevelBadgeUrl: '',
  currentLevelCondition: '',
  levelReqStatus: '',
  nextLevelName: 'Mogul',
  nextLevelDescription: 'A powerful mogul',
  nextLevelRequirements: 'Reach $10M fortune',
  canUpgrade: true,
  isUpgradeRequested: false,
  fortune: '$1,500,000',
  averageProfit: '$50,000',
  prestige: 120,
  facPrestige: 80,
  researchPrestige: 40,
  budget: '1500000',
  ranking: 5,
  facCount: 12,
  facMax: 50,
  area: 100,
  nobPoints: 45,
  tournamentOn: false,
  abilityTotal: 0,
  abilityRankingPoints: 0,
  abilityLevelPoints: 0,
  abilityLoanPoints: 0,
  rankings: [],
  curriculumItems: [],
};

const mockBank: BankAccountData = {
  balance: '250000',
  maxLoan: '500000',
  totalLoans: '100000',
  maxTransfer: '1000000',
  loans: [],
  totalNextPayment: '5000',
  defaultInterest: 5,
  defaultTerm: 10,
};

const mockPolicy: PolicyData = {
  policies: [
    { tycoonName: 'TestPlayer', yourPolicy: 0, theirPolicy: 1 },
  ],
  alliesAllowed: true,
};

describe('Profile Store', () => {
  beforeEach(() => {
    useProfileStore.getState().reset();
  });

  it('should start with all tab data null', () => {
    const state = useProfileStore.getState();
    expect(state.profile).toBeNull();
    expect(state.curriculum).toBeNull();
    expect(state.bankAccount).toBeNull();
    expect(state.profitLoss).toBeNull();
    expect(state.companies).toBeNull();
    expect(state.autoConnections).toBeNull();
    expect(state.policy).toBeNull();
    // refreshCounter is non-zero after beforeEach reset() (increment-based reset)
    expect(state.refreshCounter).toBeGreaterThan(0);
  });

  it('setCurriculum should store curriculum data and clear loading', () => {
    useProfileStore.getState().setLoading(true);
    useProfileStore.getState().setCurriculum(mockCurriculum);
    const state = useProfileStore.getState();
    expect(state.curriculum).toEqual(mockCurriculum);
    expect(state.isLoading).toBe(false);
  });

  it('setBankAccount should store bank data and clear loading', () => {
    useProfileStore.getState().setLoading(true);
    useProfileStore.getState().setBankAccount(mockBank);
    const state = useProfileStore.getState();
    expect(state.bankAccount).toEqual(mockBank);
    expect(state.isLoading).toBe(false);
  });

  it('setPolicy should store policy data and clear loading', () => {
    useProfileStore.getState().setLoading(true);
    useProfileStore.getState().setPolicy(mockPolicy);
    const state = useProfileStore.getState();
    expect(state.policy).toEqual(mockPolicy);
    expect(state.isLoading).toBe(false);
  });

  it('incrementRefresh should bump the counter', () => {
    const before = useProfileStore.getState().refreshCounter;
    useProfileStore.getState().incrementRefresh();
    expect(useProfileStore.getState().refreshCounter).toBe(before + 1);
    useProfileStore.getState().incrementRefresh();
    expect(useProfileStore.getState().refreshCounter).toBe(before + 2);
  });

  describe('supplier search state', () => {
    it('openSupplierSearch should set context and clear results', () => {
      useProfileStore.getState().openSupplierSearch('coal', 'Coal');
      const state = useProfileStore.getState();
      expect(state.supplierSearch).toEqual({ fluidId: 'coal', fluidName: 'Coal' });
      expect(state.supplierSearchResults).toEqual([]);
      expect(state.supplierSearchLoading).toBe(false);
    });

    it('setSupplierSearchResults should populate results and clear loading', () => {
      useProfileStore.getState().setSupplierSearchLoading(true);
      const results = [
        { facilityName: 'Coal Mine', companyName: 'TestCo', x: 100, y: 200, price: '80', quality: '40' },
      ];
      useProfileStore.getState().setSupplierSearchResults(results);
      const state = useProfileStore.getState();
      expect(state.supplierSearchResults).toEqual(results);
      expect(state.supplierSearchLoading).toBe(false);
    });

    it('setSupplierSearchLoading should update loading flag', () => {
      useProfileStore.getState().setSupplierSearchLoading(true);
      expect(useProfileStore.getState().supplierSearchLoading).toBe(true);
      useProfileStore.getState().setSupplierSearchLoading(false);
      expect(useProfileStore.getState().supplierSearchLoading).toBe(false);
    });

    it('clearSupplierSearch should reset all supplier search state', () => {
      useProfileStore.getState().openSupplierSearch('coal', 'Coal');
      useProfileStore.getState().setSupplierSearchResults([
        { facilityName: 'Mine', companyName: 'Co', x: 1, y: 2 },
      ]);
      useProfileStore.getState().clearSupplierSearch();
      const state = useProfileStore.getState();
      expect(state.supplierSearch).toBeNull();
      expect(state.supplierSearchResults).toEqual([]);
      expect(state.supplierSearchLoading).toBe(false);
    });

    it('reset should also clear supplier search state', () => {
      useProfileStore.getState().openSupplierSearch('steel', 'Steel');
      useProfileStore.getState().reset();
      const state = useProfileStore.getState();
      expect(state.supplierSearch).toBeNull();
      expect(state.supplierSearchResults).toEqual([]);
      expect(state.supplierSearchLoading).toBe(false);
    });
  });

  describe('setCurrentTab()', () => {
    it('should default to no open section', () => {
      expect(useProfileStore.getState().currentTab).toBeNull();
    });

    it('should open a section and close it again with null', () => {
      useProfileStore.getState().setCurrentTab('policy');
      expect(useProfileStore.getState().currentTab).toBe('policy');

      useProfileStore.getState().setCurrentTab(null);
      expect(useProfileStore.getState().currentTab).toBeNull();
    });
  });

  describe('company Profit & Loss drill-down', () => {
    const TREE = { root: { label: 'Net Profit (losses)', level: 0, amount: '1250000', children: [] } };

    it('starts null', () => {
      expect(useProfileStore.getState().companyProfitLoss).toBeNull();
    });

    it('openCompanyProfitLoss opens a loading view, without touching isLoading', () => {
      useProfileStore.getState().openCompanyProfitLoss('Green Co', 'A');
      expect(useProfileStore.getState().companyProfitLoss).toEqual({
        companyName: 'Green Co', cluster: 'A', status: 'loading', data: null, error: null,
      });
      expect(useProfileStore.getState().isLoading).toBe(false);
    });

    it('setCompanyProfitLoss with data moves the view to loaded', () => {
      useProfileStore.getState().openCompanyProfitLoss('Green Co', 'A');
      useProfileStore.getState().setCompanyProfitLoss('Green Co', TREE);
      expect(useProfileStore.getState().companyProfitLoss).toEqual({
        companyName: 'Green Co', cluster: 'A', status: 'loaded', data: TREE, error: null,
      });
    });

    it('setCompanyProfitLoss with null + error moves the view to error', () => {
      useProfileStore.getState().openCompanyProfitLoss('Green Co', 'A');
      useProfileStore.getState().setCompanyProfitLoss('Green Co', null, 'boom');
      expect(useProfileStore.getState().companyProfitLoss).toEqual({
        companyName: 'Green Co', cluster: 'A', status: 'error', data: null, error: 'boom',
      });
    });

    it('a response for another company than the one currently open is ignored', () => {
      useProfileStore.getState().openCompanyProfitLoss('Green Co', 'A');
      useProfileStore.getState().setCompanyProfitLoss('Stale Co', TREE);
      expect(useProfileStore.getState().companyProfitLoss).toMatchObject({ companyName: 'Green Co', status: 'loading' });
    });

    it('closeCompanyProfitLoss, setCurrentTab and reset all clear the view, none touches isLoading', () => {
      useProfileStore.getState().openCompanyProfitLoss('Green Co', 'A');
      useProfileStore.getState().closeCompanyProfitLoss();
      expect(useProfileStore.getState().companyProfitLoss).toBeNull();

      useProfileStore.getState().openCompanyProfitLoss('Green Co', 'A');
      useProfileStore.getState().setCurrentTab('companies');
      expect(useProfileStore.getState().companyProfitLoss).toBeNull();
      expect(useProfileStore.getState().isLoading).toBe(false);

      useProfileStore.getState().openCompanyProfitLoss('Green Co', 'A');
      useProfileStore.getState().reset();
      expect(useProfileStore.getState().companyProfitLoss).toBeNull();
      expect(useProfileStore.getState().isLoading).toBe(false);
    });
  });

  describe('reset()', () => {
    it('should clear all tab data and increment counter on reset', () => {
      // Populate state
      useProfileStore.getState().setCurriculum(mockCurriculum);
      useProfileStore.getState().setBankAccount(mockBank);
      useProfileStore.getState().setPolicy(mockPolicy);
      useProfileStore.getState().incrementRefresh();
      useProfileStore.getState().setCurrentTab('bank');

      // Verify populated
      expect(useProfileStore.getState().curriculum).not.toBeNull();
      expect(useProfileStore.getState().bankAccount).not.toBeNull();
      expect(useProfileStore.getState().currentTab).toBe('bank');

      const counterBefore = useProfileStore.getState().refreshCounter;

      // Reset
      useProfileStore.getState().reset();

      const state = useProfileStore.getState();
      expect(state.profile).toBeNull();
      expect(state.curriculum).toBeNull();
      expect(state.bankAccount).toBeNull();
      expect(state.profitLoss).toBeNull();
      expect(state.companies).toBeNull();
      expect(state.autoConnections).toBeNull();
      expect(state.policy).toBeNull();
      // reset() increments counter to guarantee useEffect re-triggers
      expect(state.refreshCounter).toBe(counterBefore + 1);
      expect(state.currentTab).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });
});
