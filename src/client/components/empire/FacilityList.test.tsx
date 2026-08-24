/**
 * H6 — the grouped My facilities list: Losing money / Status unknown /
 * Operating, honest about what has never been loaded.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../__tests__/setup/render-helpers';
import { useUiStore } from '../../store/ui-store';
import { useMapStore } from '../../store/map-store';
import { FacilityList } from './FacilityList';
import type { FavoritesItem, MapBuilding } from '@/shared/types';
import type { MinimapRendererAPI } from '../../ui/minimap-colormap';

const fav = (id: number, name: string, x: number, y: number): FavoritesItem =>
  ({ id, name, x, y } as FavoritesItem);
const bld = (x: number, y: number, alert: boolean): MapBuilding =>
  ({ visualClass: '100', tycoonId: 1, options: 0, x, y, level: 0, alert, attack: 0 } as unknown as MapBuilding);

function seedSource(buildings: MapBuilding[]): void {
  useMapStore.getState().setSource({
    getAllBuildings: () => buildings,
  } as unknown as MinimapRendererAPI);
}

describe('FacilityList (H6)', () => {
  beforeEach(() => {
    useUiStore.getState().clearSurfaces();
    useMapStore.getState().setSource(null);
  });

  it('groups favorites into the three honest buckets', () => {
    seedSource([bld(1, 1, true), bld(2, 2, false)]);
    renderWithProviders(
      <FacilityList facilities={[fav(1, 'Mill', 1, 1), fav(2, 'Farm', 2, 2), fav(3, 'Dome', 9, 9)]} />,
    );
    expect(screen.getByText('Losing money (1)')).toBeTruthy();
    expect(screen.getByText('Status unknown')).toBeTruthy();
    expect(screen.getByText('Not visited yet — tap to check.')).toBeTruthy();
    expect(screen.getByText('Operating')).toBeTruthy();
    expect(screen.getByText('Mill')).toBeTruthy();
    expect(screen.getByText('Dome')).toBeTruthy();
  });

  it('states plainly when no loaded facility is losing money', () => {
    seedSource([bld(2, 2, false)]);
    renderWithProviders(<FacilityList facilities={[fav(2, 'Farm', 2, 2)]} />);
    expect(screen.getByText("No facility is losing money in the areas you've visited.")).toBeTruthy();
  });

  it('without a renderer source, everything is honestly unknown', () => {
    renderWithProviders(<FacilityList facilities={[fav(1, 'Mill', 1, 1)]} />);
    expect(screen.getByText('Status unknown')).toBeTruthy();
  });

  it('a row still pans the map and opens the inspector', () => {
    seedSource([bld(1, 1, true)]);
    const onNavigateToBuilding = jest.fn();
    renderWithProviders(<FacilityList facilities={[fav(1, 'Mill', 1, 1)]} />, {
      clientCallbacks: createSpiedCallbacks({ onNavigateToBuilding }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Mill/ }));
    expect(onNavigateToBuilding).toHaveBeenCalledWith(1, 1);
    expect(useUiStore.getState().rightPanel).toBe('building');
  });

  it('keeps the empty state when there are no favorites at all', () => {
    renderWithProviders(<FacilityList facilities={[]} />);
    expect(screen.getByText('No facilities found')).toBeTruthy();
  });
});
