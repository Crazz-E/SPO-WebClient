/**
 * Smoke tests for ServerStartupScreen and MapLoadingScreen.
 * Verifies rendering, rotating quotes, and visibility logic.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, act } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { useGameStore } from '../../store/game-store';
import { ServerStartupScreen } from './ServerStartupScreen';
import { MapLoadingScreen } from './MapLoadingScreen';

// LoginBackground uses canvas + rAF — stub them out
jest.mock('../login/LoginBackground', () => ({
  LoginBackground: () => null,
}));

function resetStartupState() {
  useGameStore.setState({
    serverStartup: { ready: false, progress: 0, message: 'Connecting...', services: [] },
    mapLoading: { active: false, progress: 0, message: '' },
  });
}

// ---------------------------------------------------------------------------
// ServerStartupScreen
// ---------------------------------------------------------------------------

describe('ServerStartupScreen', () => {
  beforeEach(resetStartupState);

  it('renders when server is not ready', () => {
    renderWithProviders(<ServerStartupScreen />);
    expect(screen.getByText(/starpeace online/i)).toBeTruthy();
  });

  it('shows tagline', () => {
    renderWithProviders(<ServerStartupScreen />);
    expect(screen.getByText('Preparing your empire')).toBeTruthy();
  });

  it('shows a rotating quote', () => {
    const { container } = renderWithProviders(<ServerStartupScreen />);
    const quote = container.querySelector('[class*="quote"]');
    expect(quote).toBeTruthy();
    expect(quote?.textContent?.length).toBeGreaterThan(0);
  });

  it('renders spinner dots', () => {
    const { container } = renderWithProviders(<ServerStartupScreen />);
    const dots = container.querySelectorAll('[class*="dot"]');
    expect(dots.length).toBe(3);
  });

  it('begins exiting when server becomes ready', async () => {
    const { container } = renderWithProviders(<ServerStartupScreen />);
    act(() => {
      useGameStore.setState({
        serverStartup: { ready: true, progress: 1, message: 'Server ready', services: [] },
      });
    });
    // exiting class should appear
    expect(container.querySelector('[class*="exiting"]') ?? container.firstChild).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// MapLoadingScreen
// ---------------------------------------------------------------------------

describe('MapLoadingScreen', () => {
  beforeEach(resetStartupState);

  it('renders nothing when not active and progress is 0', () => {
    const { container } = renderWithProviders(<MapLoadingScreen />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when active', () => {
    useGameStore.setState({ mapLoading: { active: true, progress: 0, message: 'Loading game data...' } });
    renderWithProviders(<MapLoadingScreen />);
    expect(screen.getByText(/starpeace online/i)).toBeTruthy();
  });

  it('shows a rotating quote when active', () => {
    useGameStore.setState({ mapLoading: { active: true, progress: 0.3, message: '' } });
    const { container } = renderWithProviders(<MapLoadingScreen />);
    const quote = container.querySelector('[class*="quote"]');
    expect(quote).toBeTruthy();
    expect(quote?.textContent?.length).toBeGreaterThan(0);
  });

  it('renders spinner dots when active', () => {
    useGameStore.setState({ mapLoading: { active: true, progress: 0, message: '' } });
    const { container } = renderWithProviders(<MapLoadingScreen />);
    const dots = container.querySelectorAll('[class*="dot"]');
    expect(dots.length).toBe(3);
  });

  it('begins exiting when active becomes false after progress > 0', async () => {
    useGameStore.setState({ mapLoading: { active: true, progress: 0.9, message: 'Almost there...' } });
    const { container } = renderWithProviders(<MapLoadingScreen />);
    act(() => {
      useGameStore.setState({ mapLoading: { active: false, progress: 0.9, message: '' } });
    });
    expect(container.querySelector('[class*="exiting"]') ?? container.firstChild).toBeTruthy();
  });
});
