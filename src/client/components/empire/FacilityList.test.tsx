/**
 * H6 — the grouped My facilities list: Losing money / Status unknown /
 * Operating, honest about what has never been loaded.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, screen, fireEvent } from '@testing-library/react';
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
const folder = (id: number, name: string, children: FavoritesItem[] = []): FavoritesItem =>
  ({ id, name, x: 0, y: 0, kind: 0, path: String(id), children } as FavoritesItem);
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

  // ── folders: create, move, delete ──────────────────────────────────────

  it('the New folder button prompts for a name and creates it at the root', () => {
    const onCreateFavoriteFolder = jest.fn();
    renderWithProviders(<FacilityList facilities={[fav(1, 'Mill', 1, 1)]} />, {
      clientCallbacks: createSpiedCallbacks({ onCreateFavoriteFolder }),
    });

    fireEvent.click(screen.getByRole('button', { name: '+ New folder' }));
    act(() => useUiStore.getState().promptPayload?.onSubmit('Farms'));

    expect(onCreateFavoriteFolder).toHaveBeenCalledWith('', 'Farms');
  });

  it('does not create a folder from a blank name', () => {
    const onCreateFavoriteFolder = jest.fn();
    renderWithProviders(<FacilityList facilities={[]} />, {
      clientCallbacks: createSpiedCallbacks({ onCreateFavoriteFolder }),
    });

    fireEvent.click(screen.getByRole('button', { name: '+ New folder' }));
    act(() => useUiStore.getState().promptPayload?.onSubmit('   '));

    expect(onCreateFavoriteFolder).not.toHaveBeenCalled();
  });

  it('the move picker lists every folder but excludes the item being moved and its own subtree', () => {
    const tree = [folder(1, 'Farms', [folder(2, 'Cotton', [])]), fav(3, 'Mill', 5, 5)];
    renderWithProviders(<FacilityList facilities={tree} />, {
      clientCallbacks: createSpiedCallbacks({}),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Move Farms to another folder' }));
    const options = screen.getByRole('combobox', { name: 'Move Farms to folder' })
      .querySelectorAll('option');
    const labels = Array.from(options).map((o) => o.textContent?.trim());

    expect(labels).toContain('(top level)');
    // "Farms" itself and its child "Cotton" are excluded — moving into either
    // would only be refused by the server.
    expect(labels.some((l) => l?.includes('Farms'))).toBe(false);
    expect(labels.some((l) => l?.includes('Cotton'))).toBe(false);
  });

  it('moving a link sends its Location and the chosen destination', () => {
    const onMoveFavorite = jest.fn();
    const tree = [folder(1, 'Farms', []), fav(2, 'Mill', 5, 5)];
    renderWithProviders(<FacilityList facilities={tree} />, {
      clientCallbacks: createSpiedCallbacks({ onMoveFavorite }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Move Mill to another folder' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Move Mill to folder' }), { target: { value: '1' } });

    expect(onMoveFavorite).toHaveBeenCalledWith('2', '1', 'Mill');
  });

  it('hides the remove action behind a disabled state for a non-empty folder', () => {
    const tree = [folder(1, 'Farms', [fav(2, 'Mill', 5, 5)])];
    renderWithProviders(<FacilityList facilities={tree} />, {
      clientCallbacks: createSpiedCallbacks({}),
    });

    const removeButton = screen.getByRole('button', { name: 'Empty the folder first' });
    expect(removeButton).toBeDisabled();
  });

  it('lets an empty folder be removed', () => {
    const onRemoveFavorite = jest.fn();
    const tree = [folder(1, 'Farms', [])];
    renderWithProviders(<FacilityList facilities={tree} />, {
      clientCallbacks: createSpiedCallbacks({ onRemoveFavorite }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Farms from list' }));

    expect(onRemoveFavorite).toHaveBeenCalledWith('1', 'Farms');
  });

  it('expanding a folder reveals its children, collapsing hides them again', () => {
    const tree = [folder(1, 'Farms', [fav(2, 'Mill', 5, 5)])];
    renderWithProviders(<FacilityList facilities={tree} />, {
      clientCallbacks: createSpiedCallbacks({}),
    });

    expect(screen.queryByText('Mill')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Farms/ }));
    expect(screen.getByText('Mill')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Farms/ }));
    expect(screen.queryByText('Mill')).toBeNull();
  });
});
