/**
 * Capitol Panel integration tests.
 *
 * Tests: tab switching, president-only Elect/Depose, Jobs/Residentials columns,
 * Votes tab candidate table, budget editing.
 *
 * After the PoliticsPanel → BuildingInspector merge, the civic tabs are now
 * rendered inside BuildingInspector when a civic building is detected.
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
  { name: 'hiActualMinSalary', value: '150' },
  { name: 'midWorkDemand', value: '340' },
  { name: 'midPrivateWorkDemand', value: '120' },
  { name: 'midSalary', value: '58' },
  { name: 'midSalaryValue', value: '50' },
  { name: 'midActualMinSalary', value: '100' },
  { name: 'loWorkDemand', value: '890' },
  { name: 'loPrivateWorkDemand', value: '350' },
  { name: 'loSalary', value: '45' },
  { name: 'loSalaryValue', value: '38' },
  { name: 'loActualMinSalary', value: '60' },
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

  // ---- Tab switching ----

  it('renders civic tabs including synthetic Ratings tab', () => {
    setupCapitol({ capitolTowns: CAPITOL_TOWNS_DATA });
    renderWithProviders(<BuildingInspector hideHeader />);
    // Standard server tabs
    expect(screen.getByText('Towns')).toBeTruthy();
    expect(screen.getByText('Ministries')).toBeTruthy();
    expect(screen.getByText('Jobs')).toBeTruthy();
    expect(screen.getByText('Residentials')).toBeTruthy();
    expect(screen.getByText('Votes')).toBeTruthy();
    // Synthetic tab injected by BuildingInspector
    expect(screen.getByText('Ratings')).toBeTruthy();
  });

  it('defaults to first tab (General)', () => {
    setupCapitol({
      capitolGeneral: [{ name: 'ActualRuler', value: 'President Crazz' }],
      capitolTowns: CAPITOL_TOWNS_DATA,
    });
    renderWithProviders(<BuildingInspector hideHeader />);
    // General tab is first (order 0), rendered as generic PropertyGroup
    expect(screen.getByText('President Crazz')).toBeTruthy();
  });

  it('switches to Towns tab with rich component', () => {
    setupCapitol({ capitolTowns: CAPITOL_TOWNS_DATA });
    renderWithProviders(<BuildingInspector hideHeader />);
    fireEvent.click(screen.getByText('Towns'));
    expect(screen.getByText('Shamba')).toBeTruthy();
    expect(screen.getByText('Moanda')).toBeTruthy();
  });

  it('switches to Ministries tab', () => {
    setupCapitol({
      capitolTowns: CAPITOL_TOWNS_DATA,
      ministeries: MINISTRIES_DATA,
    });
    renderWithProviders(<BuildingInspector hideHeader />);
    fireEvent.click(screen.getByText('Ministries'));
    expect(screen.getByText('Health')).toBeTruthy();
  });

  // ---- Towns tab (president-only Elect) ----

  describe('TownsTab', () => {
    beforeEach(() => {
      setupCapitol({ capitolTowns: CAPITOL_TOWNS_DATA });
    });

    it('shows town rows with data', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('capitolTowns');
      expect(screen.getByText('Shamba')).toBeTruthy();
      expect(screen.getByText('Moanda')).toBeTruthy();
    });

    it('hides Elect button when not president', () => {
      useGameStore.setState({ ownerRole: '' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('capitolTowns');
      expect(screen.queryByText('Elect')).toBeNull();
    });

    it('shows Elect button when president', () => {
      useGameStore.setState({ ownerRole: 'president' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('capitolTowns');
      const electButtons = screen.getAllByText('Elect');
      expect(electButtons.length).toBe(2); // One per town
    });

    it('calls onBuildingAction with electMayor when Elect clicked', () => {
      useGameStore.setState({ ownerRole: 'president' });
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onBuildingAction: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('capitolTowns');
      const electButtons = screen.getAllByText('Elect');
      fireEvent.click(electButtons[0]);
      expect(spy).toHaveBeenCalledWith('electMayor', expect.objectContaining({ Town: 'Shamba' }));
    });
  });

  // ---- Ministries tab (president-only Elect/Depose, budget editing) ----

  describe('MinistriesTab', () => {
    beforeEach(() => {
      setupCapitol({ capitolTowns: CAPITOL_TOWNS_DATA, ministeries: MINISTRIES_DATA });
    });

    it('shows ministry rows', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ministeries');
      expect(screen.getByText('Health')).toBeTruthy();
      expect(screen.getByText('Education')).toBeTruthy();
    });

    it('shows Depose for filled minister and Elect for empty when president', () => {
      useGameStore.setState({ ownerRole: 'president' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ministeries');
      expect(screen.getByText('Depose')).toBeTruthy(); // Health has Dr. Smith
      expect(screen.getByText('Elect')).toBeTruthy(); // Education is empty
    });

    it('hides Depose/Elect when not president', () => {
      useGameStore.setState({ ownerRole: '' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ministeries');
      expect(screen.queryByText('Depose')).toBeNull();
      expect(screen.queryByText('Elect')).toBeNull();
    });

    it('calls onBuildingAction with deposeMinister when Depose clicked', () => {
      useGameStore.setState({ ownerRole: 'president' });
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onBuildingAction: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('ministeries');
      fireEvent.click(screen.getByText('Depose'));
      expect(spy).toHaveBeenCalledWith('deposeMinister', expect.objectContaining({ MinistryId: '0' }));
    });
  });

  // ---- Jobs tab (3-column layout) ----

  describe('JobsTab', () => {
    beforeEach(() => {
      setupCapitol({
        capitolTowns: CAPITOL_TOWNS_DATA,
        townJobs: JOBS_DATA,
      });
    });

    it('renders 3 column headers', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('townJobs');
      expect(screen.getByText('Executive')).toBeTruthy();
      expect(screen.getByText('Professional')).toBeTruthy();
      expect(screen.getByText('Worker')).toBeTruthy();
    });

    it('shows vacancy data for all classes', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('townJobs');
      expect(screen.getByText('125')).toBeTruthy(); // hi vacancies
      expect(screen.getByText('340')).toBeTruthy(); // mid vacancies
      expect(screen.getByText('890')).toBeTruthy(); // lo vacancies
    });

    it('renders min wage sliders', () => {
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('townJobs');
      const sliders = container.querySelectorAll('input[type="range"]');
      expect(sliders.length).toBe(3);
    });

    it('disables min wage sliders when no civic role', () => {
      useGameStore.setState({ ownerRole: '', isPublicOfficeRole: false });
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('townJobs');
      const sliders = container.querySelectorAll('input[type="range"]');
      sliders.forEach((slider) => {
        expect((slider as HTMLInputElement).disabled).toBe(true);
      });
    });

    it('enables min wage sliders when mayor', () => {
      useGameStore.setState({ ownerRole: 'mayor', isPublicOfficeRole: true });
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('townJobs');
      const sliders = container.querySelectorAll('input[type="range"]');
      sliders.forEach((slider) => {
        expect((slider as HTMLInputElement).disabled).toBe(false);
      });
    });

    it('disables min wage sliders for minister role', () => {
      useGameStore.setState({ ownerRole: 'minister', isPublicOfficeRole: true });
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('townJobs');
      const sliders = container.querySelectorAll('input[type="range"]');
      sliders.forEach((slider) => {
        expect((slider as HTMLInputElement).disabled).toBe(true);
      });
    });

    it('enables min wage sliders when president', () => {
      useGameStore.setState({ ownerRole: 'president', isPublicOfficeRole: true });
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('townJobs');
      const sliders = container.querySelectorAll('input[type="range"]');
      sliders.forEach((slider) => {
        expect((slider as HTMLInputElement).disabled).toBe(false);
      });
    });
  });

  // ---- Residentials tab (3-column layout) ----

  describe('ResidentialsTab', () => {
    beforeEach(() => {
      setupCapitol({
        capitolTowns: CAPITOL_TOWNS_DATA,
        townRes: RES_DATA,
      });
    });

    it('renders 3 column headers', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('townRes');
      expect(screen.getByText('High Class')).toBeTruthy();
      expect(screen.getByText('Middle Class')).toBeTruthy();
      expect(screen.getByText('Low Class')).toBeTruthy();
    });

    it('shows vacancy data', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('townRes');
      expect(screen.getByText('250')).toBeTruthy(); // hi vacancies
      expect(screen.getByText('800')).toBeTruthy(); // mid vacancies
    });
  });

  // ---- Votes tab (candidate table + vote buttons) ----

  describe('VotesTab', () => {
    beforeEach(() => {
      setupCapitol({
        capitolTowns: CAPITOL_TOWNS_DATA,
        votes: VOTES_DATA,
      });
    });

    it('shows ruler info', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('votes');
      expect(screen.getByText('President Crazz')).toBeTruthy();
    });

    it('shows candidate table', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('votes');
      // Senator Adams appears twice (table + voted-for summary), Mayor Wilson once
      expect(screen.getAllByText('Senator Adams').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Mayor Wilson')).toBeTruthy();
    });

    it('highlights voted-for candidate with badge', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('votes');
      expect(screen.getByText('Your vote')).toBeTruthy();
    });

    it('shows Vote button only for non-voted candidates', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('votes');
      const voteButtons = screen.getAllByText('Vote');
      // Only Mayor Wilson should have Vote button (Senator Adams is voted-for)
      expect(voteButtons.length).toBe(1);
    });

    it('calls onBuildingAction with voteCandidate when Vote clicked', () => {
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onBuildingAction: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('votes');
      fireEvent.click(screen.getByText('Vote'));
      expect(spy).toHaveBeenCalledWith('voteCandidate', expect.objectContaining({ Candidate: 'Mayor Wilson' }));
    });

    it('shows voted-for summary text', () => {
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('votes');
      expect(screen.getByText(/You voted for/)).toBeTruthy();
    });
  });

  // ---- Ratings tab: Start/Cancel Campaign ----

  describe('Ratings tab campaign button', () => {
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

    function setupRatingsTab(opts: {
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

    it('shows "Start Campaign" when user is not mayor and not a candidate', () => {
      setupRatingsTab();
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      expect(screen.getByText('Start Campaign')).toBeTruthy();
      expect(screen.queryByText('Cancel Campaign')).toBeNull();
    });

    it('shows "Cancel Campaign" when user is already a candidate', () => {
      setupRatingsTab({ username: 'Senator Adams' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      expect(screen.getByText('Cancel Campaign')).toBeTruthy();
      expect(screen.queryByText('Start Campaign')).toBeNull();
    });

    it('hides both buttons when user is president', () => {
      setupRatingsTab({ ownerRole: 'President of Shamba' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      expect(screen.queryByText('Start Campaign')).toBeNull();
      expect(screen.queryByText('Cancel Campaign')).toBeNull();
    });

    it('hides both buttons when user is mayor', () => {
      setupRatingsTab({ ownerRole: 'Mayor', isPublicOfficeRole: true });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      expect(screen.queryByText('Start Campaign')).toBeNull();
      expect(screen.queryByText('Cancel Campaign')).toBeNull();
    });

    it('hides both buttons when user is minister', () => {
      setupRatingsTab({ ownerRole: 'Minister', isPublicOfficeRole: true });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      expect(screen.queryByText('Start Campaign')).toBeNull();
      expect(screen.queryByText('Cancel Campaign')).toBeNull();
    });

    it('calls onLaunchCampaign with correct coords when Start Campaign clicked', () => {
      setupRatingsTab();
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onLaunchCampaign: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('ratings');
      fireEvent.click(screen.getByText('Start Campaign'));
      expect(spy).toHaveBeenCalledWith(510, 420);
    });

    it('calls onCancelCampaign with correct coords when Cancel Campaign clicked', () => {
      setupRatingsTab({ username: 'Senator Adams' });
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onCancelCampaign: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('ratings');
      fireEvent.click(screen.getByText('Cancel Campaign'));
      expect(spy).toHaveBeenCalledWith(510, 420);
    });

    it('displays campaign message when present', () => {
      setupRatingsTab({
        politicsData: { ...MOCK_POLITICS_DATA, campaignMessage: 'Your prestige is too low.' },
      });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      expect(screen.getByText('Your prestige is too low.')).toBeTruthy();
    });

    it('hides campaign message when empty', () => {
      setupRatingsTab({
        politicsData: { ...MOCK_POLITICS_DATA, campaignMessage: '' },
      });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      expect(screen.queryByText('Your prestige is too low.')).toBeNull();
    });

    it('detects isCandidate case-insensitively', () => {
      setupRatingsTab({ username: 'senator adams' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      expect(screen.getByText('Cancel Campaign')).toBeTruthy();
    });

    it('derives isCandidate from PoliticsData.campaigns when votes group is empty', () => {
      setupRatingsTab({
        username: 'Senator Adams',
        votesData: [], // no votes group data
        politicsData: {
          ...MOCK_POLITICS_DATA,
          campaigns: [{ candidateName: 'Senator Adams', rating: 45 }],
        },
      });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      expect(screen.getByText('Cancel Campaign')).toBeTruthy();
      expect(screen.queryByText('Start Campaign')).toBeNull();
    });

    it('disables Start Campaign when canLaunchCampaign is false', () => {
      setupRatingsTab({
        politicsData: {
          ...MOCK_POLITICS_DATA,
          canLaunchCampaign: false,
          campaignMessage: 'Your prestige is too low to run for office.',
        },
      });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      const btn = screen.getByText('Start Campaign');
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });

    it('enables Start Campaign when canLaunchCampaign is true', () => {
      setupRatingsTab({
        politicsData: { ...MOCK_POLITICS_DATA, canLaunchCampaign: true },
      });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      const btn = screen.getByText('Start Campaign');
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    });

    // ---- Town Hall context (townName set) ----

    it('shows Start Campaign in Town Hall context (townName set)', () => {
      setupRatingsTab();
      usePoliticsStore.setState({ townName: 'Olympus' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      expect(screen.getByText('Start Campaign')).toBeTruthy();
    });

    it('shows Cancel Campaign in Town Hall context when user is candidate', () => {
      setupRatingsTab({ username: 'Senator Adams' });
      usePoliticsStore.setState({ townName: 'Olympus' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      expect(screen.getByText('Cancel Campaign')).toBeTruthy();
    });

    it('hides buttons in Town Hall context when user is mayor', () => {
      setupRatingsTab({ ownerRole: 'Mayor', isPublicOfficeRole: true });
      usePoliticsStore.setState({ townName: 'Olympus' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      expect(screen.queryByText('Start Campaign')).toBeNull();
      expect(screen.queryByText('Cancel Campaign')).toBeNull();
    });

    it('shows Cancel Campaign in Town Hall context via PoliticsData.campaigns', () => {
      setupRatingsTab({
        username: 'TestPlayer',
        votesData: [], // Town Hall has no votes group
        politicsData: {
          ...MOCK_POLITICS_DATA,
          campaigns: [{ candidateName: 'TestPlayer', rating: 30 }],
        },
      });
      usePoliticsStore.setState({ townName: 'Olympus' });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('ratings');
      expect(screen.getByText('Cancel Campaign')).toBeTruthy();
    });
  });
});
