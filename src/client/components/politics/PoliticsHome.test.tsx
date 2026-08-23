import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../__tests__/setup/render-helpers';
import { useSearchStore } from '../../store/search-store';
import { useGameStore } from '../../store/game-store';
import { PoliticsHome } from './PoliticsHome';
import type { WsRespSearchMenuTowns } from '@/shared/types';

const TOWNS = {
  type: 'RESP_SEARCH_MENU_TOWNS',
  towns: [
    { name: 'Helartia', mayor: 'SPO_test3', population: 12400, unemploymentPercent: 4, qualityOfLife: 71, x: 120, y: 340, path: '', classId: 'TownHall' },
    { name: 'Nova Roma', mayor: '', population: 800, unemploymentPercent: 9, qualityOfLife: 40, x: 900, y: 20, path: '', classId: 'TownHall' },
  ],
} as unknown as WsRespSearchMenuTowns;

describe('PoliticsHome', () => {
  beforeEach(() => {
    useSearchStore.setState({ townsData: null, isLoading: false });
    useGameStore.setState({ capitolCoords: null, ownerRole: '' });
  });

  it('asks for the towns once when none are loaded', () => {
    const onSearchMenuTowns = jest.fn();
    renderWithProviders(<PoliticsHome />, { clientCallbacks: createSpiedCallbacks({ onSearchMenuTowns }) });
    expect(onSearchMenuTowns).toHaveBeenCalledTimes(1);
  });

  it('does not re-ask when the towns are already in the store', () => {
    useSearchStore.setState({ townsData: TOWNS });
    const onSearchMenuTowns = jest.fn();
    renderWithProviders(<PoliticsHome />, { clientCallbacks: createSpiedCallbacks({ onSearchMenuTowns }) });
    expect(onSearchMenuTowns).not.toHaveBeenCalled();
  });

  it('lists towns with mayor and opens the Town Hall through the focus path', () => {
    useSearchStore.setState({ townsData: TOWNS });
    const onNavigateToBuilding = jest.fn();
    renderWithProviders(<PoliticsHome />, { clientCallbacks: createSpiedCallbacks({ onNavigateToBuilding }) });
    expect(screen.getByText('Helartia')).toBeTruthy();
    expect(screen.getByText(/Mayor: SPO_test3/)).toBeTruthy();
    expect(screen.getByText(/No mayor/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Helartia/ }));
    expect(onNavigateToBuilding).toHaveBeenCalledWith(120, 340);
  });

  it('the Capitol button is disabled until the server sent its coordinates', () => {
    const onOpenCapitol = jest.fn();
    renderWithProviders(<PoliticsHome />, { clientCallbacks: createSpiedCallbacks({ onOpenCapitol }) });
    const btn = screen.getByRole('button', { name: /Open the Capitol/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    act(() => useGameStore.setState({ capitolCoords: { x: 1, y: 2 } }));
    fireEvent.click(screen.getByRole('button', { name: /Open the Capitol/ }));
    expect(onOpenCapitol).toHaveBeenCalledTimes(1);
  });

  it('shows the player role and a retry when the directory answers empty', () => {
    useGameStore.setState({ ownerRole: 'Mayor' });
    useSearchStore.setState({ townsData: { ...TOWNS, towns: [] } });
    const onSearchMenuTowns = jest.fn();
    renderWithProviders(<PoliticsHome />, { clientCallbacks: createSpiedCallbacks({ onSearchMenuTowns }) });
    expect(screen.getByText('Mayor')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onSearchMenuTowns).toHaveBeenCalledTimes(1);
  });

  it('shows skeletons while loading', () => {
    useSearchStore.setState({ townsData: null, isLoading: true });
    const { container } = renderWithProviders(<PoliticsHome />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
