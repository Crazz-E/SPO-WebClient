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
import { screen, fireEvent, act, within } from '@testing-library/react';
import {
  renderWithProviders,
  resetStores,
  createSpiedCallbacks,
} from '../../__tests__/setup/render-helpers';
import { usePoliticsStore } from '../../store/politics-store';
import { useBuildingStore } from '../../store/building-store';
import { useGameStore } from '../../store/game-store';
import { useNewspaperStore } from '../../store/newspaper-store';
import { useUiStore } from '../../store/ui-store';
import { BuildingInspector } from '../building/BuildingInspector';
import type { BuildingPropertyValue, BuildingDetailsResponse, BuildingDetailsTab, PoliticsData } from '@/shared/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CAPITOL_TOWNS_DATA: BuildingPropertyValue[] = [
  { name: 'ActualRuler', value: 'President SPO_test3' },
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
  { name: 'ActualRuler', value: 'President SPO_test3' },
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
  { name: 'RulerName', value: 'President SPO_test3' },
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
/**
 * A Town Hall tax table. Tax0 is taxed at 10%, Tax1 is subsidised (a negative
 * cached percent — BasicTaxes.pas:235-238), Tax2 is a tkValue tax, which no
 * stock world actually registers but the group models.
 *
 * **The key shapes here were verified against the live server** on 2026-08-20
 * (planitia / Helartia): `TaxCount=47`, `Tax0Id=100`, `Tax0Name0='Farms'` — no
 * dot in the MLS suffix — and `Tax0Kind='0'`, the numeric ordinal. The mock
 * server disagreed on all three before that run (see OB-26), so do not "tidy"
 * these names: they are what the server actually sends.
 *
 * `Tax0LastYear` is the one field whose live format was not captured. It is
 * rendered as raw text and never parsed, so its shape cannot break the tab.
 */
const TOWN_TAXES_DATA: BuildingPropertyValue[] = [
  { name: 'TaxCount', value: '3' },
  { name: 'Tax0Id', value: '100' },
  { name: 'Tax0Name0', value: 'Farms' },
  { name: 'Tax0Kind', value: '0' },
  { name: 'Tax0Percent', value: '10' },
  { name: 'Tax0LastYear', value: '$80 508' },
  { name: 'Tax1Id', value: '110' },
  { name: 'Tax1Name0', value: 'Business Machines' },
  { name: 'Tax1Kind', value: '0' },
  { name: 'Tax1Percent', value: '-10' },
  { name: 'Tax1LastYear', value: '$0' },
  { name: 'Tax2Id', value: '120' },
  { name: 'Tax2Name0', value: 'Car industries' },
  { name: 'Tax2Kind', value: '1' },
  { name: 'Tax2Percent', value: '250' },
  { name: 'Tax2LastYear', value: '$0' },
];

const TOWN_HALL_TAX_TABS: BuildingDetailsTab[] = [
  makeTab('townGeneral', 'General', 0),
  makeTab('townTaxes', 'Taxes', 20),
];


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

function makeDetails(groups: Record<string, BuildingPropertyValue[]>, tabs?: BuildingDetailsTab[], canGovern = false): BuildingDetailsResponse {
  return {
    buildingId: '130400300',
    x: 510,
    y: 420,
    visualClass: 'PGICapitolA',
    templateName: 'Capitol',
    buildingName: 'National Capitol',
    ownerName: 'President SPO_test3',
    // The real shape: TTycoon.GetSecurityId wraps each id in separators
    // (Kernel/Kernel.pas:11135-11154). A bare '1000' would never match.
    securityId: '-1000-',
    canGovern,
    tabs: tabs ?? CAPITOL_TABS,
    groups,
    timestamp: Date.now(),
  };
}

const MOCK_FOCUS = {
  buildingId: '130400300',
  buildingName: 'National Capitol',
  ownerName: 'President SPO_test3',
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

function setupCapitol(groups: Record<string, BuildingPropertyValue[]>, tabs?: BuildingDetailsTab[], canGovern = false) {
  useBuildingStore.setState({
    details: makeDetails(groups, tabs, canGovern),
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
/**
 * The civic gate is decided by the gateway and shipped on the details
 * (`grantAccess` over the facility SecurityId), because the requester half is
 * the InitClient proxy id — a pointer the browser never receives. Tests flip the
 * decision rather than the ids.
 */
function grantGovernance(canGovern: boolean) {
  const details = useBuildingStore.getState().details;
  if (!details) throw new Error('grantGovernance called before setupCapitol');
  act(() => {
    useBuildingStore.setState({ details: { ...details, canGovern } });
  });
}

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
    // Not the governing tycoon by default; each test opts in.
    useGameStore.setState({ ownerRole: '', isPublicOfficeRole: false });
  });

// ---- Taxes (the mayor's core power) ----

  describe('Taxes tab', () => {
    function setupTownHallTaxes() {
      setupCapitol({ townTaxes: TOWN_TAXES_DATA }, TOWN_HALL_TAX_TABS);
    }

    it('renders the tax table, which no tab used to show at all', () => {
      setupTownHallTaxes();
      grantGovernance(true);
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      expect(screen.getByText('Farms')).toBeTruthy();
      expect(screen.getByText('Business Machines')).toBeTruthy();
      expect(screen.getByText('$80 508')).toBeTruthy();
    });

    it('shows a subsidised tax as the word, not as a negative percentage', () => {
      setupTownHallTaxes();
      grantGovernance(true);
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      expect(screen.getByText('Subsidized')).toBeTruthy();
      expect(screen.getByText('10%')).toBeTruthy();
      expect(screen.queryByText('-10%')).toBeNull();
    });

    it('shows no editor until a row is selected', () => {
      setupTownHallTaxes();
      grantGovernance(true);
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      expect(container.querySelector('input[type="radio"]')).toBeNull();
      expect(screen.getByText(/Select a tax/)).toBeTruthy();
    });

    it('hides the editor entirely from a player who does not govern the town', () => {
      setupTownHallTaxes();
      grantGovernance(false);
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      fireEvent.click(screen.getByText('Farms'));
      // Voyager hides it rather than disabling it (TownTaxesSheet.pas:493-512).
      expect(container.querySelector('input[type="radio"]')).toBeNull();
      expect(screen.queryByText(/Select a tax/)).toBeNull();
      // …but the table itself stays readable.
      expect(screen.getByText('Farms')).toBeTruthy();
    });

    it('reveals the rate editor when a percent tax is selected', () => {
      setupTownHallTaxes();
      grantGovernance(true);
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      fireEvent.click(screen.getByText('Farms'));
      expect(screen.getByText('Tax: 10%')).toBeTruthy();
      expect(container.querySelector('input[type="range"]')).toBeTruthy();
    });

    it('sends the rate on release, once', () => {
      setupTownHallTaxes();
      grantGovernance(true);
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onSetBuildingProperty: spy });
      const { container } = renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('administration');
      fireEvent.click(screen.getByText('Farms'));
      const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
      fireEvent.change(slider, { target: { value: '49' } });
      // Dragging alone must not emit — Voyager fires on MouseUp only.
      expect(spy).not.toHaveBeenCalled();
      fireEvent.pointerUp(slider);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(510, 420, 'RDOSetTaxValue', '49', { index: '0' });
    });

    it('commits a keyboard change, which onPointerUp alone would lose', () => {
      setupTownHallTaxes();
      grantGovernance(true);
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onSetBuildingProperty: spy });
      const { container } = renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('administration');
      fireEvent.click(screen.getByText('Farms'));
      const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
      fireEvent.change(slider, { target: { value: '11' } });
      fireEvent.keyUp(slider);
      expect(spy).toHaveBeenCalledWith(510, 420, 'RDOSetTaxValue', '11', { index: '0' });
    });

    it('sends the literal -10 when subsidising, never the slider value', () => {
      setupTownHallTaxes();
      grantGovernance(true);
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onSetBuildingProperty: spy });
      const { container } = renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('administration');
      fireEvent.click(screen.getByText('Farms'));
      const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
      fireEvent.change(slider, { target: { value: '73' } });
      const subsidize = screen.getByLabelText('Subsidize', { selector: 'input' });
      fireEvent.click(subsidize);
      // TownTaxesSheet.pas:336-338 — the constant, not the 73 on the bar.
      expect(spy).toHaveBeenCalledWith(510, 420, 'RDOSetTaxValue', '-10', { index: '0' });
    });

    it('hides the rate control on an already-subsidised tax', () => {
      setupTownHallTaxes();
      grantGovernance(true);
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      fireEvent.click(screen.getByText('Business Machines'));
      // A subsidy carries no percentage (TownTaxesSheet.pas:403-406).
      expect(container.querySelector('input[type="range"]')).toBeNull();
      expect(screen.queryByText(/^Tax: /)).toBeNull();
    });

    it('offers a currency field and a Set button for a tkValue tax', () => {
      setupTownHallTaxes();
      grantGovernance(true);
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onSetBuildingProperty: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('administration');
      fireEvent.click(screen.getByText('Car industries'));
      const field = screen.getByLabelText(/Amount per unit/);
      fireEvent.change(field, { target: { value: '425' } });
      fireEvent.click(screen.getByText('Set'));
      expect(spy).toHaveBeenCalledWith(510, 420, 'RDOSetTaxValue', '425', { index: '2' });
    });
  });


  // ---- Consolidated tab structure ----

  it('renders consolidated civic tabs (Overview, Administration, Demographics, Elections)', () => {
    setupCapitol({
      capitolGeneral: [{ name: 'ActualRuler', value: 'President SPO_test3' }],
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
      capitolGeneral: [{ name: 'ActualRuler', value: 'President SPO_test3' }],
      votes: VOTES_DATA,
    });
    renderWithProviders(<BuildingInspector hideHeader />);
    // Ruler name appears in banner + general properties
    expect(screen.getAllByText('President SPO_test3').length).toBeGreaterThanOrEqual(1);
  });

  // ---- Administration tab (Towns + Ministries) ----

  describe('Administration tab', () => {
    beforeEach(() => {
      setupCapitol({
        capitolGeneral: [{ name: 'ActualRuler', value: 'President SPO_test3' }],
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
      // A real other player, not an absent one — the gate must reject them.
      grantGovernance(false);
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      expect(screen.queryByText('Elect')).toBeNull();
    });

    it('shows Elect buttons when president', () => {
      grantGovernance(true);
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      const electButtons = screen.getAllByText('Elect');
      // 1 town Elect (Moanda, HasMayor1='0') + 1 ministry Elect (Education empty).
      // Shamba has a mayor, and RDOSitMayor only fills a vacant seat
      // (WorldPolitics.pas:1801), so it offers no button at all.
      expect(electButtons.length).toBe(2);
    });

    it('offers no Elect on a town that already has a mayor', () => {
      grantGovernance(true);
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      // Shamba (HasMayor0='1') and Moanda (HasMayor1='0') sit in the same table;
      // only the vacant one may be filled.
      const shambaRow = screen.getByText('Shamba').closest('tr');
      const moandaRow = screen.getByText('Moanda').closest('tr');
      expect(shambaRow?.querySelector('button')).toBeNull();
      expect(moandaRow?.querySelector('button')?.textContent).toBe('Elect');
    });

    it('calls onBuildingAction with electMayor when Elect clicked on town', () => {
      grantGovernance(true);
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onBuildingAction: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('administration');
      const electButtons = screen.getAllByText('Elect');
      fireEvent.click(electButtons[0]);
      // Moanda, not Shamba: the only town whose seat is vacant.
      expect(spy).toHaveBeenCalledWith('electMayor', expect.objectContaining({ Town: 'Moanda' }));
    });

    it('shows Depose for filled minister when president', () => {
      grantGovernance(true);
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      expect(screen.getByText('Depose')).toBeTruthy();
    });

    it('hides Depose when not president', () => {
      grantGovernance(false);
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('administration');
      expect(screen.queryByText('Depose')).toBeNull();
    });

    it('calls onBuildingAction with deposeMinister when Depose clicked', () => {
      grantGovernance(true);
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
        capitolGeneral: [{ name: 'ActualRuler', value: 'President SPO_test3' }],
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
      grantGovernance(false);
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('demographics');
      const sliders = container.querySelectorAll('input[type="range"]');
      sliders.forEach((slider) => {
        expect((slider as HTMLInputElement).disabled).toBe(true);
      });
    });

    it('disables min wage sliders for a mayor visiting the Capitol', () => {
      // The very case the old role-label gate got wrong: holding office
      // somewhere is not permission to set the world's wage floor. This tycoon
      // is simply not in the Capitol's SecurityId.
      useGameStore.setState({ ownerRole: 'mayor', isPublicOfficeRole: true });
      grantGovernance(false);
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
      grantGovernance(true);
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('demographics');
      const sliders = container.querySelectorAll('input[type="range"]');
      sliders.forEach((slider) => {
        expect((slider as HTMLInputElement).disabled).toBe(false);
      });
    });

    it('enables min wage sliders when president', () => {
      grantGovernance(true);
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
      isCapitol: false,
      hasRuler: true,
      yearsToElections: 33,
      mayorName: 'Mayor Chen',
      mayorPrestige: 620,
      mayorRating: 68,
      tycoonsRating: 55,
      ifelRating: 61,
      mandateNo: 2,
      rulerPhotoUrl: '',
      popularRatings: [],
      ifelRatings: [],
      tycoonsRatings: [],
      publicity: [],
      publicityAds: '',
      campaignCount: 0,
      campaigns: [],
      campaignState: 'available',
      campaignMessage: '',
      canLaunchCampaign: true,
      prestigeThreshold: 200,
      projects: [],
      promise: '',
      townHallId: 90210,
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

    it('marks the row you voted for', () => {
      setupElectionsTab();
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      // VotesSheet.pas:216-221 — image index 0, rendered here as a check icon
      // rather than a word, so the label is where the meaning lives.
      const marker = screen.getByLabelText('Your vote');
      expect(marker.closest('tr')?.textContent).toContain('Senator Adams');
    });

    // VotesSheet.pas:159-161 — the sitting ruler is the FIRST row of the same
    // list as the candidates, not a separate strip beside it.
    it('puts the sitting ruler on the ballot, marked as in office', () => {
      setupElectionsTab();
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      const marker = screen.getByLabelText('In office');
      expect(marker.closest('tr')?.textContent).toContain('President SPO_test3');
    });

    // VotesSheet.pas:206-211 — insertion sort on campaign points, descending.
    it('sorts the ballot by points, descending', () => {
      setupElectionsTab();
      const { container } = renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      const names = Array.from(container.querySelectorAll('tbody tr'))
        .map((row) => row.querySelectorAll('td')[1]?.textContent);
      expect(names).toEqual(['President SPO_test3', 'Senator Adams', 'Mayor Wilson']);
    });

    it('offers a Vote button on every row except the one you voted for', () => {
      setupElectionsTab();
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      // Three rows, one of them already yours.
      expect(screen.getAllByText('Vote').length).toBe(2);
    });

    it('calls onBuildingAction with voteCandidate when Vote clicked', () => {
      setupElectionsTab();
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onBuildingAction: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('elections');
      const row = screen.getByText('Mayor Wilson').closest('tr')!;
      fireEvent.click(within(row).getByText('Vote'));
      expect(spy).toHaveBeenCalledWith('voteCandidate', expect.objectContaining({ Candidate: 'Mayor Wilson' }));
    });

    // The ruler runs on his own record like anyone else (`:161` gives him a row
    // with points), so voting for him is a vote, not a no-op.
    it('lets you vote for the sitting ruler', () => {
      setupElectionsTab();
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onBuildingAction: spy });
      renderWithProviders(<BuildingInspector hideHeader />, { clientCallbacks: callbacks });
      switchTab('elections');
      const row = screen.getByText('President SPO_test3').closest('tr')!;
      fireEvent.click(within(row).getByText('Vote'));
      expect(spy).toHaveBeenCalledWith('voteCandidate', expect.objectContaining({ Candidate: 'President SPO_test3' }));
    });

    // The campaign controls moved to the Politics tab, where they come from
    // `tycooncampaign.asp`'s own report instead of a client-side guess at
    // candidacy. Their tests moved with them, to
    // `politics/__tests__/politics-section.test.tsx`.
    it('points at the Politics tab for ratings and campaigns', () => {
      setupElectionsTab();
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.queryByText('Start Campaign')).toBeNull();
      // The tab strip carries a "Politics" button too; this one is the
      // cross-reference in the note under the ballot.
      const note = screen.getByText(/Ratings, campaigns and/);
      fireEvent.click(within(note).getByText('Politics'));
      expect(useBuildingStore.getState().currentTab).toBe('politics');
    });

    it('says so when the building holds no election', () => {
      setupElectionsTab({ votesData: [] });
      renderWithProviders(<BuildingInspector hideHeader />);
      switchTab('elections');
      expect(screen.getByText('No election is being held here.')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// The two buttons Voyager puts on the General sheet
// ---------------------------------------------------------------------------

describe('CivicOverview — the two Voyager buttons', () => {
  const TOWN_TABS: BuildingDetailsTab[] = [
    makeTab('townGeneral', 'General', 0),
    makeTab('votes', 'Votes', 1),
  ];

  function setupTownHall(general: BuildingPropertyValue[]) {
    useBuildingStore.setState({
      details: { ...makeDetails({ townGeneral: general, votes: [] }, TOWN_TABS), visualClass: 'PGITownHallA' },
      focusedBuilding: { ...MOCK_FOCUS, buildingName: 'Town Hall' },
      isLoading: false,
    });
    usePoliticsStore.setState({ buildingX: 510, buildingY: 420, isLoading: false });
  }

  beforeEach(() => {
    resetStores();
    usePoliticsStore.getState().reset();
    useNewspaperStore.getState().reset();
  });

  // `TownHallSheet.pas:320` opens a second window; the modal has none, so the
  // button selects the Politics tab instead.
  it('"Visit Politics Page" selects the Politics tab', () => {
    setupTownHall([{ name: 'ActualRuler', value: 'Mayor Chen' }, { name: 'NewspaperName', value: 'Helartia Herald' }]);
    renderWithProviders(<BuildingInspector hideHeader />);
    switchTab('overview');
    fireEvent.click(screen.getByText('Visit Politics Page'));
    expect(useBuildingStore.getState().currentTab).toBe('politics');
  });

  // `TownHallSheet.pas:343` — "Rate the Mayor" opens `boardreader.asp` with the
  // town's own paper, not anything under Politics/.
  it('"Rate the Mayor" opens the newspaper on the town paper', () => {
    setupTownHall([{ name: 'Town', value: 'Helartia' }, { name: 'NewspaperName', value: 'Helartia Herald' }]);
    renderWithProviders(<BuildingInspector hideHeader />);
    switchTab('overview');
    fireEvent.click(screen.getByText('Rate the Mayor'));
    expect(useUiStore.getState().modal).toBe('newspaper');
    expect(useNewspaperStore.getState().context).toEqual({
      paperName: 'Helartia Herald',
      townName: 'Helartia',
      isCapitol: false,
      buildingX: 510,
      buildingY: 420,
    });
  });

  it('a town with no paper says so instead of offering a dead button', () => {
    setupTownHall([{ name: 'Town', value: 'Helartia' }]);
    renderWithProviders(<BuildingInspector hideHeader />);
    switchTab('overview');
    expect(screen.queryByText('Rate the Mayor')).toBeNull();
    expect(screen.getByText('This town has no newspaper.')).toBeTruthy();
  });

  // `CapitolSheet.pas` has no RateMayor button at all.
  it('the Capitol offers only the politics page, named for the President', () => {
    setupCapitol({
      capitolGeneral: [{ name: 'ActualRuler', value: 'President SPO_test3' }],
      capitolTowns: CAPITOL_TOWNS_DATA,
      votes: [],
    });
    renderWithProviders(<BuildingInspector hideHeader />);
    switchTab('overview');
    expect(screen.getByText('Visit President Politics Page')).toBeTruthy();
    expect(screen.queryByText('Rate the Mayor')).toBeNull();
  });
});
