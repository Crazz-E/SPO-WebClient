/**
 * TownsTab tests — the president's per-town levy slider.
 *
 * Same write discipline as the mayor's sliders: one frame per gesture. The
 * levy is only collected while `> 0` (`Kernel/WorldPolitics.pas:1765`), so a
 * duplicate costs nothing in the model — it still costs a frame and a round
 * trip, and the count is what tells a reader the guard is doing its job.
 */

import { describe, it, expect } from '@jest/globals';
import { fireEvent, screen, within } from '@testing-library/react';
import { createSpiedCallbacks, renderWithProviders } from '../../__tests__/setup/render-helpers';
import { TownsTab } from './TownsTab';
import type { BuildingPropertyValue } from '@/shared/types';

const TOWNS: BuildingPropertyValue[] = [
  { name: 'TownCount', value: '2' },
  { name: 'Town0', value: 'Helartia' },
  { name: 'TownPopulation0', value: '18372' },
  { name: 'TownTax0', value: '5' },
  { name: 'HasMayor0', value: '1' },
  { name: 'TownQOL0', value: '68' },
  { name: 'TownRating0', value: '75' },
  { name: 'TownQOS0', value: '72' },
  { name: 'TownWealth0', value: '41' },
  { name: 'Town1', value: 'Flumenia' },
  { name: 'TownPopulation1', value: '9000' },
  { name: 'TownTax1', value: '0' },
  { name: 'HasMayor1', value: '0' },
  { name: 'TownQOL1', value: '55' },
  { name: 'TownRating1', value: '62' },
  { name: 'TownQOS1', value: '60' },
  { name: 'TownWealth1', value: '33' },
];

function renderTowns(canGovern = true) {
  const sent: string[] = [];
  const callbacks = createSpiedCallbacks({
    onSetBuildingProperty: (...args: unknown[]) => { sent.push(args[3] as string); },
  });
  renderWithProviders(
    <TownsTab properties={TOWNS} buildingX={1} buildingY={2} canGovern={canGovern} />,
    { clientCallbacks: callbacks },
  );
  const sliders = screen.queryAllByRole('slider');
  return { sent, sliders };
}

describe('TownsTab levy slider', () => {
  it('lists every town the Capitol reports', () => {
    renderTowns();
    expect(screen.getByText('Helartia')).toBeTruthy();
    expect(screen.getByText('Flumenia')).toBeTruthy();
  });

  it('names each slider after its town — the rows are otherwise identical', () => {
    renderTowns();
    expect(screen.getByLabelText('Tax rate for Helartia')).toBeTruthy();
    expect(screen.getByLabelText('Tax rate for Flumenia')).toBeTruthy();
  });

  it('emits one frame per gesture, not one per event that ends it', () => {
    const { sent, sliders } = renderTowns();

    fireEvent.change(sliders[0], { target: { value: '12' } });
    fireEvent.keyUp(sliders[0]);
    fireEvent.blur(sliders[0]);

    expect(sent).toEqual(['12']);
  });

  it('stays silent when the gesture lands back on the town figure', () => {
    const { sent, sliders } = renderTowns();

    fireEvent.change(sliders[0], { target: { value: '12' } });
    fireEvent.change(sliders[0], { target: { value: '5' } });
    fireEvent.blur(sliders[0]);

    expect(sent).toEqual([]);
  });

  it('emits again once the next gesture lands somewhere new', () => {
    const { sent, sliders } = renderTowns();

    fireEvent.change(sliders[0], { target: { value: '12' } });
    fireEvent.blur(sliders[0]);
    fireEvent.change(sliders[0], { target: { value: '20' } });
    fireEvent.blur(sliders[0]);

    expect(sent).toEqual(['12', '20']);
  });

  it('shows a plain figure, not a slider, to anyone who is not president', () => {
    const { sliders } = renderTowns(false);
    expect(sliders).toHaveLength(0);
  });
});

describe('TownsTab columns', () => {
  it('labels the header row Town, Pop., QOL, Rating, Commerce, Wealth, Tax, Mayor', () => {
    renderTowns();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Town', 'Pop.', 'QOL', 'Rating', 'Commerce', 'Wealth', 'Tax', 'Mayor', '']);
  });

  it('carries TownWealth0 under Wealth, TownQOS0 under Commerce, and TownRating0 under Rating', () => {
    renderTowns();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    const row = screen.getByText('Helartia').closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell');

    expect(cells[headers.indexOf('Wealth')].textContent).toBe('41%');
    expect(cells[headers.indexOf('Commerce')].textContent).toBe('72%');
    expect(cells[headers.indexOf('Rating')].textContent).toBe('75%');
  });
});
