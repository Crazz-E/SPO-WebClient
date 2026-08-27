/**
 * EmpireOverview — issue #129 added the "Folders" view alongside the
 * existing health-grouped flat list. What matters here: the flat list stays
 * the default (no behavior regression), the tree view is fetched only once
 * chosen (no round trip for a view the player never opens), and switching
 * views does not lose either one's data.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../__tests__/setup/render-helpers';
import { useEmpireStore } from '../../store/empire-store';
import { EmpireOverview } from './EmpireOverview';
import type { FavoritesItem } from '@/shared/types';

describe('EmpireOverview', () => {
  beforeEach(() => {
    useEmpireStore.getState().reset();
  });

  it('defaults to the List view, unchanged from before folders existed', () => {
    useEmpireStore.getState().setFacilities([{ id: 1, name: 'Mill', x: 10, y: 20, path: '1', kind: 1 }]);
    renderWithProviders(<EmpireOverview />);

    expect(screen.getByPlaceholderText('Search facilities...')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the loading skeleton while the flat list is still loading', () => {
    useEmpireStore.setState({ isLoading: true });
    const { container } = renderWithProviders(<EmpireOverview />);
    expect(container.querySelector('[class*="loading"]')).toBeTruthy();
  });

  it('fetches the tree only once "Folders" is chosen, not on mount', async () => {
    const onFetchFavoritesFolder = jest.fn(async (..._args: unknown[]): Promise<FavoritesItem[]> => []);
    renderWithProviders(<EmpireOverview />, {
      clientCallbacks: createSpiedCallbacks({ onFetchFavoritesFolder }),
    });

    expect(onFetchFavoritesFolder).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));

    expect(onFetchFavoritesFolder).toHaveBeenCalledWith('');
    await waitFor(() => expect(screen.getByText('No facilities found')).toBeTruthy());
  });

  it('renders the tree once the root read comes back', async () => {
    const items: FavoritesItem[] = [
      { id: 9, name: 'My Farms', path: '9', kind: 0 },
      { id: 1, name: 'Mill', x: 10, y: 20, path: '1', kind: 1 },
    ];
    const onFetchFavoritesFolder = jest.fn(async (..._args: unknown[]) => items);
    renderWithProviders(<EmpireOverview />, {
      clientCallbacks: createSpiedCallbacks({ onFetchFavoritesFolder }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));

    await waitFor(() => expect(screen.getByText('My Farms')).toBeTruthy());
    expect(screen.getByText('Mill')).toBeTruthy();
    // The search/sort controls belong to the List view only.
    expect(screen.queryByPlaceholderText('Search facilities...')).toBeNull();
  });

  it('switching back to List keeps showing the flat list, unaffected by the tree view', async () => {
    useEmpireStore.getState().setFacilities([{ id: 1, name: 'Mill', x: 10, y: 20, path: '1', kind: 1 }]);
    const onFetchFavoritesFolder = jest.fn(async (..._args: unknown[]): Promise<FavoritesItem[]> => []);
    renderWithProviders(<EmpireOverview />, {
      clientCallbacks: createSpiedCallbacks({ onFetchFavoritesFolder }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));
    await waitFor(() => expect(onFetchFavoritesFolder).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByPlaceholderText('Search facilities...')).toBeTruthy();
    expect(screen.getByText('Mill')).toBeTruthy();
  });

  it('a navigate from the tree opens the building panel, same as the flat list', async () => {
    const onNavigateToBuilding = jest.fn();
    const onFetchFavoritesFolder = jest.fn(async (..._args: unknown[]): Promise<FavoritesItem[]> => [
      { id: 1, name: 'Mill', x: 10, y: 20, path: '1', kind: 1 },
    ]);
    renderWithProviders(<EmpireOverview />, {
      clientCallbacks: createSpiedCallbacks({ onFetchFavoritesFolder, onNavigateToBuilding }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));
    await waitFor(() => expect(screen.getByText('Mill')).toBeTruthy());
    fireEvent.click(screen.getByText('Mill'));

    expect(onNavigateToBuilding).toHaveBeenCalledWith(10, 20);
  });
});
