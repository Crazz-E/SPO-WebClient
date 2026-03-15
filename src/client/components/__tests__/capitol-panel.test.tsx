/**
 * Capitol Panel integration tests.
 *
 * Tests: consolidated civic tabs (Overview, Administration, Demographics, Elections),
 * president-only Elect/Depose, Jobs/Housing columns, candidate table, budget editing,
 * campaign buttons.
 *
 * Civic buildings now use consolidated tabs:
 *   Overview | Administration | Demographics | Elections
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent, act } from '@testing-library/react';
import {
  renderWithProviders,
  resetStores,
  createSpiedCallbacks,
} from '../../__tests__/setup/render-helpers';
import { usePoliticsStore } from '../../store/politics-store';
import { useBuildingStore } from '../../store/building-store';
import { useGameStore } from '../../store/game-store';
import { BuildingInspector } from '../building/BuildingInspector';
import type { BuildingPropertyValue, BuildingDetailsResponse, BuildingDetailsTab, PoliticsData } from '@/shared/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CAPITOL_TOWNS_DATA: BuildingPropertyValue[] = [
  { name: 'ActualRuler', value: 'President Crazz' },
  { name: 'TownCount', value: '2' },
  { name: 'Town0', value: 'Shamba' },
  { name: 'TownPopulation0', value: '125000' },
  { name: 'TownRating0', value: '75' },
  { name: 'TownQOL0', value: '68' },
  { name: 'TownQOS0', value: '72' },
  { name: 'TownWealth0', value: '15000000' },
  { name: 'TownTax0', value: '15' },
  { name: 'HasMayor0', value: '1' },
  { name: 'Town1', value: 'Moanda' },
  { name: 'TownPopulation1', value: '85000' },
  { name: 'TownRating1', value: '62' },
  { name: 'TownQOL1', value: '55' },
  { name: 'TownQOS1', value: '60' },
  { name: 'TownWealth1', value: '8000000' },
  { name: 'TownTax1', value: '12' },
  { name: 'HasMayor1', value: '0' },
];

const MINISTRIES_DATA: BuildingPropertyValue[] = [
  { name: 'ActualRuler', value: 'President Crazz' },
  { name: 'MinisterCount', value: '2' },
  { name: 'MinistryId0', value: '0' },
  { name: 'Ministry0.0', value: 'Health' },
  { name: 'Minister0', value: 'Dr. Smith' },
  { name: 'MinisterRating0', value: '78' },
  { name: 'MinisterBudget0', value: '2000000' },
  { name: 'MinistryId1', value: '1' },
  { name: 'Ministry1.0', value: 'Education' },
  { name: 'Minister1', value: '' },
  { name: 'MinisterRating1', value: '0' },
  { name: 'MinisterBudget1', value: '1500000' },
];

const JOBS_DATA: BuildingPropertyValue[] = [
  { name: 'hiWorkDemand', value: '125' },
  { name: 'hiPrivateWorkDemand', value: '45' },
  { name: 'hiSalary', value: '72' },
  { name: 'hiSalaryValue', value: '65' },
  { name: 'hiMinSalary', value: '150' },
  { name: 'hiActualMinSalary', value: '0' },
  { name: 'midWorkDemand', value: '340' },
  { name: 'midPrivateWorkDemand', value: '120' },
  { name: 'midSalary', value: '58' },
  { name: 'midSalaryValue', value: '50' },
  { name: 'midMinSalary', value: '100' },
  { name: 'midActualMinSalary', value: '0' },
  { name: 'loWorkDemand', value: '890' },
  { name: 'loPrivateWorkDemand', value: '350' },
  { name: 'loSalary', value: '45' },
  { name: 'loSalaryValue', value: '38' },
  { name: 'loMinSalary', value: '60' },
  { name: 'loActualMinSalary', value: '0' },
];

const RES_DATA: BuildingPropertyValue[] = [
  { name: 'hiResDemand', value: '250' },
  { name: 'hiRentPrice', value: '350' },
  { name: 'hiResQ', value: '1200' },
  { name: 'midResDemand', value: '800' },
  { name: 'midRentPrice', value: '120' },
  { name: 'midResQ', value: '5400' },
  { name: 'loResDemand', value: '1500' },
  { name: 'loRentPrice', value: '45' },
  { name: 'loResQ', value: '12000' },
];

const VOTES_DATA: BuildingPropertyValue[] = [
  { name: 'RulerName', value: 'President Crazz' },
  { name: 'RulerVotes', value: '15200' },
  { name: 'RulerCmpRat', value: '72' },
  { name: 'RulerCmpPnts', value: '8500' },
  { name: 'VoteOf', value: 'Senator Adams' },
  { name: 'CampaignCount', value: '2' },
  { name: 'Candidate0', value: 'Senator Adams' },
  { name: 'Votes0', value: '8900' },
  { name: 'CmpRat0', value: '45' },
  { name: 'CmpPnts0', value: '4200' },
  { name: 'Candidate1', value: 'Mayor Wilson' },
  { name: 'Votes1', value: '6300' },
  { name: 'CmpRat1', value: '38' },
  { name: 'CmpPnts1', value: '3100' },
];

/** Build a tab entry for the BuildingDetailsResponse. */
function makeTab(id: string, name: string, order: number): BuildingDetailsTab {
  return { id, name, icon: name.charAt(0), order, handlerName: id };
}

/** Default Capitol tabs matching what the server sends. */
const CAPITOL_TABS: BuildingDetailsTab[] = [
  makeTab('capitolGeneral', 'General', 0),
  makeTab('capitolTowns', 'Towns', 10),
  makeTab('ministeries', 'Ministries', 20),
  makeTab('townJobs', 'Jobs', 30),
  makeTab('townRes', 'Residentials', 40),
  makeTab('votes', 'Votes', 50),
  makeTab('townServices', 'Services', 60),
  makeTab('townProducts', 'Products', 70),
];

function makeDetails(groups: Record<string, BuildingPropertyValue[]>, tabs?: BuildingDetailsTab[]): BuildingDetailsResponse {
  return {
    buildingId: '130400300',
    x: 510,
    y: 420,
    visualClass: 'PGICapitolA',
    templateName: 'Capitol',
    buildingName: 'National Capitol',
    ownerName: 'President Crazz',
    securityId: '1000',
    tabs: tabs ?? CAPITOL_TABS,
    groups,
    timestamp: Date.now(),
  };
}

const MOCK_FOCUS = {
  buildingId: '130400300',
  buildingName: 'National Capitol',
  ownerName: 'President Crazz',
  salesInfo: '',
  revenue: '',
  detailsText: '',
  hintsText: '',
  x: 510,
  y: 420,
  xsize: 3,
  ysize: 3,
  visualClass: 'PGICapitolA',
};

function setupCapitol(groups: Record<string, BuildingPropertyValue[]>, tabs?: BuildingDetailsTab[]) {
  useBuildingStore.setState({
    details: makeDetails(groups, tabs),
    focusedBuilding: MOCK_FOCUS,
    isLoading: false,
  });
  usePoliticsStore.setState({
    buildingX: 510,
    buildingY: 420,
    isLoading: false,
  });
}

/** Switch the active tab in the building store. */
function switchTab(tabId: string) {
  act(() => {
    useBuildingStore.getState().setCurrentTab(tabId);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CapitolPanel', () => {
  beforeEach(() => {
    resetStores();
    usePoliticsStore.getState().reset();
    useGameStore.setState({ ownerRole: '', isPublicOfficeRole: false });
  });

  // ---- Consolidated tab structure ----

  it('renders consolidated civic tabs (Overview, Administration, Demographics, Elections)', () => {
    setupCapitol({
      capitolGeneral: [{ name: 'ActualRuler', value: 'President Crazz' }],
      capitolTowns: CAPITOL_TOWNS_DATA,
      ministeries: MINISTRIES_DATA,
      townJobs: JOBS_DATA,
      townRes: RES_DATA,
      votes: VOTES_DATA,
    });
    renderWithProviders(<BuildingInspector hideHeader />);
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Administration')).toBeTruthy();
    expect(screen.getByText('Demographics')).toBeTruthy();
    expect(screen.getByText('Elections')).toBeTruthy();
  });

  it('defaults to Overview tab showing ruler info', () => {
    setupCapitol({
      capitolGeneral: [{ name: 'ActualRuler', value: 'President Crazz' }],
      votes: VOTES_DATA,
    });
    renderWithProviders(<BuildingInspector hideHeader />);
    // Ruler name appears in banner + general properties
    expect(screen.getAllByText('President Crazz').length).toBeGreaterThanOrEqual(1);
  });

  // ---- Administration tab (Towns + Ministries) ----

  describe('Administration tab', () => {
    beforeEach(() => {
      setupCapitol({
        capitolGeneral: [{ name: 'ActualRuler', value: 'President Crazz' }],
        capitolTowns: CAPITOL_TOWNS_DATA,
        ministeries: MINISTRIES_DATA,
        votes: VOTES_DATA,
      });
    });

    it('shows towns and ministries stacked', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      expect(screen.getByText('Shamba')).toBeTruthy();
      expect(screen.getByText('Moanda')).toBeTruthy();
      expect(screen.getByText('Health')).toBeTruthy();
      expect(screen.getByText('Education')).toBeTruthy();
    });

    it('hides Elect button when not president', () => {
      useGameStore.setState({ ownerRole: '' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      expect(screen.queryByText('Elect')).toBeNull();
    });

    it('shows Elect buttons when president', () => {
      useGameStore.setState({ ownerRole: 'president' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      const electButtons = screen.getAllByText('Elect');
      // 2 town Elect + 1 ministry Elect (Education empty)
      expect(electButtons.length).toBe(3);
    });

    it('calls onBuildingAction with electMayor when Elect clicked on town', () => {
      useGameStore.setState({ ownerRole: 'president' });
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onBuildingAction: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('administration');
      const electButtons = screen.getAllByText('Elect');
      fireEvent.click(electButtons[0]);
      expect(spy).toHaveBeenCalledWith('electMayor', expect.objectContaining({ Town: 'Shamba' }));
    });

    it('shows Depose for filled minister when president', () => {
      useGameStore.setState({ ownerRole: 'president' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      expect(screen.getByText('Depose')).toBeTruthy();
    });

    it('hides Depose when not president', () => {
      useGameStore.setState({ ownerRole: '' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      expect(screen.queryByText('Depose')).toBeNull();
    });

    it('calls onBuildingAction with deposeMinister when Depose clicked', () => {
      useGameStore.setState({ ownerRole: 'president' });
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onBuildingAction: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('administration');
      fireEvent.click(screen.getByText('Depose'));
      expect(spy).toHaveBeenCalledWith('deposeMinister', expect.objectContaining({ MinistryId: '0' }));
    });
  });

  // ---- Demographics tab (Jobs + Housing) ----

  describe('Demographics tab', () => {
    beforeEach(() => {
      setupCapitol({
        capitolGeneral: [{ name: 'ActualRuler', value: 'President Crazz' }],
        capitolTowns: CAPITOL_TOWNS_DATA,
        townJobs: JOBS_DATA,
        townRes: RES_DATA,
        votes: VOTES_DATA,
      });
    });

    it('renders Employment and Housing sections', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('demographics');
      expect(screen.getByText('Employment')).toBeTruthy();
      expect(screen.getByText('Housing')).toBeTruthy();
    });

    it('renders 3 job column headers', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('demographics');
      expect(screen.getByText('Executive')).toBeTruthy();
      expect(screen.getByText('Professional')).toBeTruthy();
      expect(screen.getByText('Worker')).toBeTruthy();
    });

    it('renders 3 housing column headers', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('demographics');
      expect(screen.getByText('High Class')).toBeTruthy();
      expect(screen.getByText('Middle Class')).toBeTruthy();
      expect(screen.getByText('Low Class')).toBeTruthy();
    });

    it('shows vacancy data for jobs', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('demographics');
      expect(screen.getByText('125')).toBeTruthy(); // hi vacancies
      expect(screen.getByText('340')).toBeTruthy(); // mid vacancies
      expect(screen.getByText('890')).toBeTruthy(); // lo vacancies
    });

    it('shows vacancy data for housing', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('demographics');
      expect(screen.getByText('250')).toBeTruthy(); // hi vacancies
      expect(screen.getByText('800')).toBeTruthy(); // mid vacancies
    });

    it('renders min wage sliders', () => {
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('demographics');
      const sliders = container.querySelectorAll('input[type="range"]');
      expect(sliders.length).toBe(3);
    });

    it('disables min wage sliders when no civic role', () => {
      useGameStore.setState({ ownerRole: '', isPublicOfficeRole: false });
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('demographics');
      const sliders = container.querySelectorAll('input[type="range"]');
      sliders.forEach((slider) => {
        expect((slider as HTMLInputElement).disabled).toBe(true);
      });
    });

    it('disables min wage sliders for mayor in Capitol', () => {
      useGameStore.setState({ ownerRole: 'mayor', isPublicOfficeRole: true });
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('demographics');
      const sliders = container.querySelectorAll('input[type="range"]');
      sliders.forEach((slider) => {
        expect((slider as HTMLInputElement).disabled).toBe(true);
      });
    });

    it('enables min wage sliders for mayor in Town Hall', () => {
      const townHallTabs: BuildingDetailsTab[] = [
        makeTab('townGeneral', 'General', 0),
        makeTab('townJobs', 'Jobs', 30),
        makeTab('townRes', 'Residentials', 40),
      ];
      setupCapitol({ townJobs: JOBS_DATA, townRes: RES_DATA }, townHallTabs);
      useGameStore.setState({ ownerRole: 'mayor', isPublicOfficeRole: true });
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('demographics');
      const sliders = container.querySelectorAll('input[type="range"]');
      sliders.forEach((slider) => {
        expect((slider as HTMLInputElement).disabled).toBe(false);
      });
    });

    it('enables min wage sliders when president', () => {
      useGameStore.setState({ ownerRole: 'president', isPublicOfficeRole: true });
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('demographics');
      const sliders = container.querySelectorAll('input[type="range"]');
      sliders.forEach((slider) => {
        expect((slider as HTMLInputElement).disabled).toBe(false);
      });
    });
  });

  // ---- Elections tab (Ratings + Votes + Campaigns) ----

  describe('Elections tab', () => {
    const MOCK_POLITICS_DATA: PoliticsData = {
      townName: 'Paraiso',
      yearsToElections: 33,
      mayorName: 'Mayor Chen',
      mayorPrestige: 620,
      mayorRating: 68,
      tycoonsRating: 55,
      campaignCount: 0,
      popularRatings: [],
      ifelRatings: [],
      tycoonsRatings: [],
      campaigns: [],
      canLaunchCampaign: true,
      campaignMessage: '',
    };

    function setupElectionsTab(opts: {
      username?: string;
      ownerRole?: string;
      isPublicOfficeRole?: boolean;
      votesData?: BuildingPropertyValue[];
      politicsData?: typeof MOCK_POLITICS_DATA;
    } = {}) {
      const votesData = opts.votesData ?? VOTES_DATA;
      setupCapitol({ votes: votesData });
      usePoliticsStore.setState({ data: opts.politicsData ?? MOCK_POLITICS_DATA });
      const role = (opts.ownerRole ?? '').toLowerCase();
      useGameStore.setState({
        username: opts.username ?? 'TestPlayer',
        ownerRole: opts.ownerRole ?? '',
        isPublicOfficeRole: opts.isPublicOfficeRole ?? (
          role.includes('president') || role.includes('mayor') || role.includes('minister')
        ),
      });
    }

    it('shows candidate table', () => {
      setupElectionsTab();
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.getAllByText('Senator Adams').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Mayor Wilson')).toBeTruthy();
    });

    it('highlights voted-for candidate with badge', () => {
      setupElectionsTab();
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.getByText('Your vote')).toBeTruthy();
    });

    it('shows Vote button only for non-voted candidates', () => {
      setupElectionsTab();
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      const voteButtons = screen.getAllByText('Vote');
      expect(voteButtons.length).toBe(1);
    });

    it('calls onBuildingAction with voteCandidate when Vote clicked', () => {
      setupElectionsTab();
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onBuildingAction: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('elections');
      fireEvent.click(screen.getByText('Vote'));
      expect(spy).toHaveBeenCalledWith('voteCandidate', expect.objectContaining({ Candidate: 'Mayor Wilson' }));
    });

    it('shows "Start Campaign" when user is not an office holder and not a candidate', () => {
      setupElectionsTab();
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.getByText('Start Campaign')).toBeTruthy();
      expect(screen.queryByText('Cancel Campaign')).toBeNull();
    });

    it('shows "Cancel Campaign" when user is already a candidate', () => {
      setupElectionsTab({ username: 'Senator Adams' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.getByText('Cancel Campaign')).toBeTruthy();
      expect(screen.queryByText('Start Campaign')).toBeNull();
    });

    it('hides both buttons when user is president', () => {
      setupElectionsTab({ ownerRole: 'President of Shamba' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.queryByText('Start Campaign')).toBeNull();
      expect(screen.queryByText('Cancel Campaign')).toBeNull();
    });

    it('hides both buttons when user is mayor', () => {
      setupElectionsTab({ ownerRole: 'Mayor', isPublicOfficeRole: true });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.queryByText('Start Campaign')).toBeNull();
      expect(screen.queryByText('Cancel Campaign')).toBeNull();
    });

    it('hides both buttons when user is minister', () => {
      setupElectionsTab({ ownerRole: 'Minister', isPublicOfficeRole: true });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.queryByText('Start Campaign')).toBeNull();
      expect(screen.queryByText('Cancel Campaign')).toBeNull();
    });

    it('calls onLaunchCampaign with correct coords when Start Campaign clicked', () => {
      setupElectionsTab();
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onLaunchCampaign: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('elections');
      fireEvent.click(screen.getByText('Start Campaign'));
      expect(spy).toHaveBeenCalledWith(510, 420);
    });

    it('calls onCancelCampaign with correct coords when Cancel Campaign clicked', () => {
      setupElectionsTab({ username: 'Senator Adams' });
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onCancelCampaign: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('elections');
      fireEvent.click(screen.getByText('Cancel Campaign'));
      expect(spy).toHaveBeenCalledWith(510, 420);
    });

    it('displays campaign message when present', () => {
      setupElectionsTab({
        politicsData: { ...MOCK_POLITICS_DATA, campaignMessage: 'Your prestige is too low.' },
      });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.getByText('Your prestige is too low.')).toBeTruthy();
    });

    it('hides campaign message when empty', () => {
      setupElectionsTab({
        politicsData: { ...MOCK_POLITICS_DATA, campaignMessage: '' },
      });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.queryByText('Your prestige is too low.')).toBeNull();
    });

    it('detects isCandidate case-insensitively', () => {
      setupElectionsTab({ username: 'senator adams' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.getByText('Cancel Campaign')).toBeTruthy();
    });

    it('derives isCandidate from PoliticsData.campaigns when votes group is empty', () => {
      setupElectionsTab({
        username: 'Senator Adams',
        votesData: [],
        politicsData: {
          ...MOCK_POLITICS_DATA,
          campaigns: [{ candidateName: 'Senator Adams', rating: 45 }],
        },
      });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.getByText('Cancel Campaign')).toBeTruthy();
      expect(screen.queryByText('Start Campaign')).toBeNull();
    });

    it('disables Start Campaign when canLaunchCampaign is false', () => {
      setupElectionsTab({
        politicsData: {
          ...MOCK_POLITICS_DATA,
          canLaunchCampaign: false,
          campaignMessage: 'Your prestige is too low to run for office.',
        },
      });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      const btn = screen.getByText('Start Campaign');
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });

    it('enables Start Campaign when canLaunchCampaign is true', () => {
      setupElectionsTab({
        politicsData: { ...MOCK_POLITICS_DATA, canLaunchCampaign: true },
      });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      const btn = screen.getByText('Start Campaign');
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    });

    // ---- Town Hall context ----

    it('shows Start Campaign in Town Hall context', () => {
      setupElectionsTab();
      usePoliticsStore.setState({ townName: 'Olympus' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.getByText('Start Campaign')).toBeTruthy();
    });

    it('shows Cancel Campaign in Town Hall context when user is candidate', () => {
      setupElectionsTab({ username: 'Senator Adams' });
      usePoliticsStore.setState({ townName: 'Olympus' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.getByText('Cancel Campaign')).toBeTruthy();
    });

    it('hides buttons in Town Hall context when user is mayor', () => {
      setupElectionsTab({ ownerRole: 'Mayor', isPublicOfficeRole: true });
      usePoliticsStore.setState({ townName: 'Olympus' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.queryByText('Start Campaign')).toBeNull();
      expect(screen.queryByText('Cancel Campaign')).toBeNull();
    });

    it('shows Cancel Campaign in Town Hall context via PoliticsData.campaigns', () => {
      setupElectionsTab({
        username: 'TestPlayer',
        votesData: [],
        politicsData: {
          ...MOCK_POLITICS_DATA,
          campaigns: [{ candidateName: 'TestPlayer', rating: 30 }],
        },
      });
      usePoliticsStore.setState({ townName: 'Olympus' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.getByText('Cancel Campaign')).toBeTruthy();
    });
  });
});
