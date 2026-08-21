/**
 * TownsTab tests — the president's per-town levy slider.
 *
 * Same write discipline as the mayor's sliders: one frame per gesture. The
 * levy is only collected while `> 0` (`Kernel/WorldPolitics.pas:1765`), so a
 * duplicate costs nothing in the model — it still costs a frame and a round
 * trip, and the count is what tells a reader the guard is doing its job.
 */

import { describe, it, expect } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react';
import { createSpiedCallbacks, renderWithProviders } from '../../__tests__/setup/render-helpers';
import { TownsTab } from './TownsTab';
import type { BuildingPropertyValue } from '@/shared/types';

const TOWNS: BuildingPropertyValue[] = [
  { name: 'TownCount', value: '2' },
  { name: 'Town0', value: 'Helartia' },
  { name: 'TownPopulation0', value: '18372' },
  { name: 'TownTax0', value: '5' },
  { name: 'HasMayor0', value: '1' },
  { name: 'Town1', value: 'Flumenia' },
  { name: 'TownPopulation1', value: '9000' },
  { name: 'TownTax1', value: '0' },
  { name: 'HasMayor1', value: '0' },
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
