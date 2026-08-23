import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { useUiStore } from '../../store/ui-store';
import { useGameStore } from '../../store/game-store';
import { MobileInfoBar } from './MobileInfoBar';

describe('MobileInfoBar', () => {
  beforeEach(() => {
    useUiStore.getState().clearSurfaces();
    useUiStore.getState().setMobileTab('build');
    useGameStore.setState({ worldName: 'planitia', username: 'SPO_test3', tycoonStats: { cash: '1000', incomePerHour: '10', ranking: 3, buildingCount: 1, maxBuildings: 9 } as never });
  });

  it('a tap opens the Profile surface in the sheet (the former Fav tab is gone)', () => {
    renderWithProviders(<MobileInfoBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Open empire overview' }));
    expect(useUiStore.getState().mobileTab).toBe('map');
    expect(useUiStore.getState().stack.map((s) => s.kind)).toEqual(['empire']);
  });
});
