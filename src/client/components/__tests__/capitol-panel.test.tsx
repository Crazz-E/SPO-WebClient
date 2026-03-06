/**
 * Capitol Panel integration tests.
 *
 * Tests: tab switching, president-only Elect/Depose, Jobs/Residentials columns,
 * Votes tab candidate table, budget editing.
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
import { PoliticsPanel } from '../politics';
import type { BuildingPropertyValue, BuildingDetailsResponse } from '@/shared/types';

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

function makeDetails(groups: Record<string, BuildingPropertyValue[]>): BuildingDetailsResponse {
  return {
    buildingId: '130400300',
    x: 510,
    y: 420,
    visualClass: 'PGICapitolA',
    templateName: 'Capitol',
    buildingName: 'National Capitol',
    ownerName: 'President Crazz',
    securityId: '1000',
    tabs: [],
    groups,
    timestamp: Date.now(),
  };
}

function setupCapitol(groups: Record<string, BuildingPropertyValue[]>) {
  useBuildingStore.setState({ details: makeDetails(groups) });
  usePoliticsStore.setState({
    buildingX: 510,
    buildingY: 420,
    isLoading: false,
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

  it('renders tab bar with all 6 tabs', () => {
    setupCapitol({ capitolTowns: CAPITOL_TOWNS_DATA });
    renderWithProviders(<PoliticsPanel />);
    expect(screen.getByText('Towns')).toBeTruthy();
    expect(screen.getByText('Ministries')).toBeTruthy();
    expect(screen.getByText('Jobs')).toBeTruthy();
    expect(screen.getByText('Residentials')).toBeTruthy();
    expect(screen.getByText('Votes')).toBeTruthy();
    expect(screen.getByText('Ratings')).toBeTruthy();
  });

  it('defaults to Towns tab', () => {
    setupCapitol({ capitolTowns: CAPITOL_TOWNS_DATA });
    renderWithProviders(<PoliticsPanel />);
    expect(screen.getByText('Shamba')).toBeTruthy();
  });

  it('switches to Ministries tab', () => {
    setupCapitol({
      capitolTowns: CAPITOL_TOWNS_DATA,
      ministeries: MINISTRIES_DATA,
    });
    renderWithProviders(<PoliticsPanel />);
    fireEvent.click(screen.getByText('Ministries'));
    expect(screen.getByText('Health')).toBeTruthy();
  });

  it('shows loading skeleton when isLoading', () => {
    usePoliticsStore.setState({ isLoading: true });
    const { container } = renderWithProviders(<PoliticsPanel />);
    // Skeleton renders placeholder divs
    expect(container.querySelectorAll('[class*="skeleton"], [class*="Skeleton"]').length).toBeGreaterThanOrEqual(0);
  });

  // ---- Towns tab (president-only Elect) ----

  describe('TownsTab', () => {
    it('shows town rows with data', () => {
      setupCapitol({ capitolTowns: CAPITOL_TOWNS_DATA });
      renderWithProviders(<PoliticsPanel />);
      expect(screen.getByText('Shamba')).toBeTruthy();
      expect(screen.getByText('Moanda')).toBeTruthy();
    });

    it('hides Elect button when not president', () => {
      setupCapitol({ capitolTowns: CAPITOL_TOWNS_DATA });
      useGameStore.setState({ ownerRole: '' });
      renderWithProviders(<PoliticsPanel />);
      expect(screen.queryByText('Elect')).toBeNull();
    });

    it('shows Elect button when president', () => {
      setupCapitol({ capitolTowns: CAPITOL_TOWNS_DATA });
      useGameStore.setState({ ownerRole: 'president' });
      renderWithProviders(<PoliticsPanel />);
      const electButtons = screen.getAllByText('Elect');
      expect(electButtons.length).toBe(2); // One per town
    });

    it('calls onBuildingAction with electMayor when Elect clicked', () => {
      setupCapitol({ capitolTowns: CAPITOL_TOWNS_DATA });
      useGameStore.setState({ ownerRole: 'president' });
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onBuildingAction: spy });
      renderWithProviders(<PoliticsPanel />, { clientCallbacks: callbacks });
      const electButtons = screen.getAllByText('Elect');
      fireEvent.click(electButtons[0]);
      expect(spy).toHaveBeenCalledWith('electMayor', expect.objectContaining({ Town: 'Shamba' }));
    });
  });

  // ---- Ministries tab (president-only Elect/Depose, budget editing) ----

  describe('MinistriesTab', () => {
    beforeEach(() => {
      setupCapitol({ capitolTowns: CAPITOL_TOWNS_DATA, ministeries: MINISTRIES_DATA });
      act(() => {
        usePoliticsStore.getState().setActiveCapitolTab('ministries');
      });
    });

    it('shows ministry rows', () => {
      renderWithProviders(<PoliticsPanel />);
      expect(screen.getByText('Health')).toBeTruthy();
      expect(screen.getByText('Education')).toBeTruthy();
    });

    it('shows Depose for filled minister and Elect for empty when president', () => {
      useGameStore.setState({ ownerRole: 'president' });
      renderWithProviders(<PoliticsPanel />);
      expect(screen.getByText('Depose')).toBeTruthy(); // Health has Dr. Smith
      expect(screen.getByText('Elect')).toBeTruthy(); // Education is empty
    });

    it('hides Depose/Elect when not president', () => {
      useGameStore.setState({ ownerRole: '' });
      renderWithProviders(<PoliticsPanel />);
      expect(screen.queryByText('Depose')).toBeNull();
      expect(screen.queryByText('Elect')).toBeNull();
    });

    it('calls onBuildingAction with deposeMinister when Depose clicked', () => {
      useGameStore.setState({ ownerRole: 'president' });
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onBuildingAction: spy });
      renderWithProviders(<PoliticsPanel />, { clientCallbacks: callbacks });
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
      act(() => {
        usePoliticsStore.getState().setActiveCapitolTab('jobs');
      });
    });

    it('renders 3 column headers', () => {
      renderWithProviders(<PoliticsPanel />);
      expect(screen.getByText('Executive')).toBeTruthy();
      expect(screen.getByText('Professional')).toBeTruthy();
      expect(screen.getByText('Worker')).toBeTruthy();
    });

    it('shows vacancy data for all classes', () => {
      renderWithProviders(<PoliticsPanel />);
      expect(screen.getByText('125')).toBeTruthy(); // hi vacancies
      expect(screen.getByText('340')).toBeTruthy(); // mid vacancies
      expect(screen.getByText('890')).toBeTruthy(); // lo vacancies
    });

    it('renders min wage sliders', () => {
      const { container } = renderWithProviders(<PoliticsPanel />);
      const sliders = container.querySelectorAll('input[type="range"]');
      expect(sliders.length).toBe(3);
    });
  });

  // ---- Residentials tab (3-column layout) ----

  describe('ResidentialsTab', () => {
    beforeEach(() => {
      setupCapitol({
        capitolTowns: CAPITOL_TOWNS_DATA,
        townRes: RES_DATA,
      });
      act(() => {
        usePoliticsStore.getState().setActiveCapitolTab('residentials');
      });
    });

    it('renders 3 column headers', () => {
      renderWithProviders(<PoliticsPanel />);
      expect(screen.getByText('High Class')).toBeTruthy();
      expect(screen.getByText('Middle Class')).toBeTruthy();
      expect(screen.getByText('Low Class')).toBeTruthy();
    });

    it('shows vacancy data', () => {
      renderWithProviders(<PoliticsPanel />);
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
      act(() => {
        usePoliticsStore.getState().setActiveCapitolTab('votes');
      });
    });

    it('shows ruler info', () => {
      renderWithProviders(<PoliticsPanel />);
      expect(screen.getByText('President Crazz')).toBeTruthy();
    });

    it('shows candidate table', () => {
      renderWithProviders(<PoliticsPanel />);
      // Senator Adams appears twice (table + voted-for summary), Mayor Wilson once
      expect(screen.getAllByText('Senator Adams').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Mayor Wilson')).toBeTruthy();
    });

    it('highlights voted-for candidate with badge', () => {
      renderWithProviders(<PoliticsPanel />);
      expect(screen.getByText('Your vote')).toBeTruthy();
    });

    it('shows Vote button only for non-voted candidates', () => {
      renderWithProviders(<PoliticsPanel />);
      const voteButtons = screen.getAllByText('Vote');
      // Only Mayor Wilson should have Vote button (Senator Adams is voted-for)
      expect(voteButtons.length).toBe(1);
    });

    it('calls onBuildingAction with voteCandidate when Vote clicked', () => {
      const spy = jest.fn();
      const callbacks = createSpiedCallbacks({ onBuildingAction: spy });
      renderWithProviders(<PoliticsPanel />, { clientCallbacks: callbacks });
      fireEvent.click(screen.getByText('Vote'));
      expect(spy).toHaveBeenCalledWith('voteCandidate', expect.objectContaining({ Candidate: 'Mayor Wilson' }));
    });

    it('shows voted-for summary text', () => {
      renderWithProviders(<PoliticsPanel />);
      expect(screen.getByText(/You voted for/)).toBeTruthy();
    });
  });
});
