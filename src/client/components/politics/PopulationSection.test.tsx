/**
 * PopulationSection component tests.
 *
 * Verifies the Town Hall population display: total inhabitants, per-class
 * breakdown with unemployment, and citizen movement reports.
 */

import { describe, it, expect } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { PopulationSection } from './PopulationSection';
import type { TownHallDemographics } from '@/shared/types';

const DEMOGRAPHICS: TownHallDemographics = {
  totalInhabitants: 18372,
  totalInhabitantsLabel: '18,372',
  classes: [
    { className: 'High', population: 253, populationLabel: '253', unemploymentPct: 0 },
    { className: 'Middle', population: 905, populationLabel: '905', unemploymentPct: 41 },
    { className: 'Low', population: 17214, populationLabel: '17,214', unemploymentPct: 86 },
  ],
  movements: [
    { className: 'High', direction: 'none', count: 0, reasons: [] },
    {
      className: 'Middle',
      direction: 'out',
      count: 3,
      reasons: [
        { pct: 2, reason: 'salaries and work conditions' },
        { pct: 54, reason: 'lack of products and services' },
      ],
    },
    { className: 'Low', direction: 'none', count: 0, reasons: [] },
  ],
};

describe('PopulationSection', () => {
  it('renders nothing when there are no demographics', () => {
    const { container } = renderWithProviders(<PopulationSection demographics={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the total population', () => {
    renderWithProviders(<PopulationSection demographics={DEMOGRAPHICS} />);
    expect(screen.getByText('Total Population')).toBeTruthy();
    expect(screen.getByText('18,372')).toBeTruthy();
  });

  it('shows the three class rows with population and unemployment', () => {
    renderWithProviders(<PopulationSection demographics={DEMOGRAPHICS} />);
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('Middle')).toBeTruthy();
    expect(screen.getByText('Low')).toBeTruthy();
    expect(screen.getByText('253')).toBeTruthy();
    expect(screen.getByText('17,214')).toBeTruthy();
    // Unemployment MiniBar labels
    expect(screen.getByText('41%')).toBeTruthy();
    expect(screen.getByText('86%')).toBeTruthy();
  });

  it('shows movement badges and the emigration reason breakdown', () => {
    renderWithProviders(<PopulationSection demographics={DEMOGRAPHICS} />);
    expect(screen.getByText('Citizen Movements (last day)')).toBeTruthy();
    // High and Low have no movements
    expect(screen.getAllByText('No movements')).toHaveLength(2);
    // Middle emigration
    expect(screen.getByText(/3 moved out/)).toBeTruthy();
    expect(screen.getByText('lack of products and services')).toBeTruthy();
    expect(screen.getByText('54%')).toBeTruthy();
  });

  it('renders an immigration badge with "moved in"', () => {
    const immigration: TownHallDemographics = {
      ...DEMOGRAPHICS,
      movements: [{ className: 'High', direction: 'in', count: 12, reasons: [] }],
    };
    renderWithProviders(<PopulationSection demographics={immigration} />);
    expect(screen.getByText(/12 moved in/)).toBeTruthy();
  });

  it('hides the total card when total inhabitants is zero', () => {
    const zeroTotal: TownHallDemographics = {
      ...DEMOGRAPHICS,
      totalInhabitants: 0,
      totalInhabitantsLabel: '0',
    };
    renderWithProviders(<PopulationSection demographics={zeroTotal} />);
    expect(screen.queryByText('Total Population')).toBeNull();
    // Class breakdown still renders
    expect(screen.getByText('High')).toBeTruthy();
  });
});
