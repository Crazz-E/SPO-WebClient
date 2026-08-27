/**
 * The star in the inspector header — the "add to Empire list" half of the
 * Favorites tree (OB-10).
 *
 * Two things are worth pinning: only the owner is offered it, and a facility
 * already in the list gets a DISABLED control rather than a vanished one — a
 * control that disappears reads as a bug, a disabled one explains itself.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, resetStores, createSpiedCallbacks } from '../../../__tests__/setup/render-helpers';
import { useBuildingStore } from '../../../store/building-store';
import { useEmpireStore } from '../../../store/empire-store';
import { BuildingInspector } from '../BuildingInspector';
import type { BuildingFocusInfo, BuildingDetailsResponse, FavoritesLinkItem } from '@/shared/types';

const focus: BuildingFocusInfo = {
  buildingId: 'bld-1',
  buildingName: 'Small Factory',
  ownerName: 'TestCo',
  x: 100,
  y: 200,
  xsize: 2,
  ysize: 2,
  visualClass: '300',
} as BuildingFocusInfo;

const details: BuildingDetailsResponse = {
  buildingId: 'bld-1',
  x: 100,
  y: 200,
  visualClass: '300',
  templateName: 'SrvGeneral',
  buildingName: 'Small Factory',
  ownerName: 'TestCo',
  securityId: 'sec-1',
  canGovern: true,
  tabs: [{ id: 'general', name: 'GENERAL', order: 0, icon: 'G', handlerName: 'SrvGeneral' }],
  groups: { general: [] },
  timestamp: 0,
} as unknown as BuildingDetailsResponse;

function seed(isOwner: boolean, favorites: FavoritesLinkItem[] = []): void {
  useBuildingStore.getState().setFocus(focus);
  useBuildingStore.setState({ details, isLoading: false, isOwner });
  useEmpireStore.getState().setFacilities(favorites);
}

describe('BuildingInspector — add to Empire list', () => {
  beforeEach(() => {
    resetStores();
    useEmpireStore.getState().reset();
  });

  it('sends the building name and its coordinates', () => {
    const onAddFavorite = jest.fn();
    seed(true);

    renderWithProviders(<BuildingInspector />, {
      clientCallbacks: createSpiedCallbacks({ onAddFavorite }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to Empire list' }));

    expect(onAddFavorite).toHaveBeenCalledWith('Small Factory', 100, 200);
  });

  it('is not offered to someone who does not own the building', () => {
    seed(false);
    renderWithProviders(<BuildingInspector />, { clientCallbacks: createSpiedCallbacks({}) });
    expect(screen.queryByRole('button', { name: 'Add to Empire list' })).toBeNull();
  });

  it('is disabled, not hidden, once the facility is already in the list', () => {
    const onAddFavorite = jest.fn();
    // Matched on coordinates: the favourite keeps the name it was given, and a
    // building rename never updates it.
    seed(true, [{ id: 7, name: 'An older name', x: 100, y: 200, path: '7', kind: 1 }]);

    renderWithProviders(<BuildingInspector />, {
      clientCallbacks: createSpiedCallbacks({ onAddFavorite }),
    });

    const button = screen.getByRole('button', { name: 'Already in your Empire list' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onAddFavorite).not.toHaveBeenCalled();
  });

  it('a favourite at other coordinates does not disable it', () => {
    seed(true, [{ id: 7, name: 'Elsewhere', x: 1, y: 2, path: '7', kind: 1 }]);
    renderWithProviders(<BuildingInspector />, { clientCallbacks: createSpiedCallbacks({}) });
    expect(screen.getByRole('button', { name: 'Add to Empire list' })).toBeTruthy();
  });
});
