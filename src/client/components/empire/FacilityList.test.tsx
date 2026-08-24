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

// At the root of the tree the Location IS the id — that is what a delete or a
// rename addresses (`TFavorites.LocateItem`, `Kernel/Favorites.pas:312-334`).
const fav = (id: number, name: string, x: number, y: number): FavoritesItem =>
  ({ id, name, x, y, path: String(id) } as FavoritesItem);
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
    // `^Mill` — the row's own button, not the "Rename Mill" / "Remove Mill"
    // actions that now sit beside it.
    fireEvent.click(screen.getByRole('button', { name: /^Mill/ }));
    expect(onNavigateToBuilding).toHaveBeenCalledWith(1, 1);
    expect(useUiStore.getState().rightPanel).toBe('building');
  });

  it('keeps the empty state when there are no favorites at all', () => {
    renderWithProviders(<FacilityList facilities={[]} />);
    expect(screen.getByText('No facilities found')).toBeTruthy();
  });

  // ── the write half: remove and rename address the item by its Location ────

  it('removes by Location, and says "remove from list" rather than "delete"', () => {
    const onRemoveFavorite = jest.fn();
    renderWithProviders(<FacilityList facilities={[fav(4210, 'Mill', 1, 1)]} />, {
      clientCallbacks: createSpiedCallbacks({ onRemoveFavorite }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Mill from list' }));

    expect(onRemoveFavorite).toHaveBeenCalledWith('4210', 'Mill');
  });

  it('renames on Enter, sending the Location and the new name', () => {
    const onRenameFavorite = jest.fn();
    renderWithProviders(<FacilityList facilities={[fav(4210, 'Mill', 1, 1)]} />, {
      clientCallbacks: createSpiedCallbacks({ onRenameFavorite }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rename Mill' }));
    const input = screen.getByRole('textbox', { name: 'Rename Mill' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Moulin du Nord' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameFavorite).toHaveBeenCalledWith('4210', 'Moulin du Nord');
  });

  it('stops the input at the 50 characters the server would keep', () => {
    renderWithProviders(<FacilityList facilities={[fav(4210, 'Mill', 1, 1)]} />, {
      clientCallbacks: createSpiedCallbacks({}),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rename Mill' }));

    expect(screen.getByRole('textbox', { name: 'Rename Mill' }).getAttribute('maxlength')).toBe('50');
  });

  it('Escape cancels without sending anything', () => {
    const onRenameFavorite = jest.fn();
    renderWithProviders(<FacilityList facilities={[fav(4210, 'Mill', 1, 1)]} />, {
      clientCallbacks: createSpiedCallbacks({ onRenameFavorite }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rename Mill' }));
    const input = screen.getByRole('textbox', { name: 'Rename Mill' });
    fireEvent.change(input, { target: { value: 'Moulin du Nord' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onRenameFavorite).not.toHaveBeenCalled();
    expect(screen.getByText('Mill')).toBeTruthy();
  });

  it('an unchanged or emptied name is not a rename — no round trip is spent', () => {
    const onRenameFavorite = jest.fn();
    renderWithProviders(<FacilityList facilities={[fav(4210, 'Mill', 1, 1)]} />, {
      clientCallbacks: createSpiedCallbacks({ onRenameFavorite }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rename Mill' }));
    const input = screen.getByRole('textbox', { name: 'Rename Mill' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameFavorite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Mill' }));
    const again = screen.getByRole('textbox', { name: 'Rename Mill' });
    fireEvent.change(again, { target: { value: '   ' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(onRenameFavorite).not.toHaveBeenCalled();
  });

  it('commits the rename when the input loses focus', () => {
    const onRenameFavorite = jest.fn();
    renderWithProviders(<FacilityList facilities={[fav(4210, 'Mill', 1, 1)]} />, {
      clientCallbacks: createSpiedCallbacks({ onRenameFavorite }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rename Mill' }));
    const input = screen.getByRole('textbox', { name: 'Rename Mill' });
    fireEvent.change(input, { target: { value: 'Moulin' } });
    fireEvent.blur(input);

    expect(onRenameFavorite).toHaveBeenCalledWith('4210', 'Moulin');
  });
});
