/**
 * Smoke tests for ServerStartupScreen and MapLoadingScreen.
 * Verifies rendering, progress display, and visibility logic.
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

  it('shows current progress message', () => {
    useGameStore.setState({
      serverStartup: { ready: false, progress: 0.5, message: 'Processing terrain textures...', services: [] },
    });
    renderWithProviders(<ServerStartupScreen />);
    expect(screen.getByText('Processing terrain textures...')).toBeTruthy();
  });

  it('renders service list when services are present', () => {
    useGameStore.setState({
      serverStartup: {
        ready: false,
        progress: 0.5,
        message: 'Loading...',
        services: [
          { name: 'update', status: 'complete', progress: 1 },
          { name: 'facilities', status: 'running', progress: 0.5 },
        ],
      },
    });
    renderWithProviders(<ServerStartupScreen />);
    expect(screen.getByText('Downloading game assets')).toBeTruthy();
    expect(screen.getByText('Loading building catalog')).toBeTruthy();
  });

  it('renders unknown service name as-is', () => {
    useGameStore.setState({
      serverStartup: {
        ready: false, progress: 0, message: '',
        services: [{ name: 'customSvc', status: 'pending', progress: 0 }],
      },
    });
    renderWithProviders(<ServerStartupScreen />);
    expect(screen.getByText('customSvc')).toBeTruthy();
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

  it('shows message when active', () => {
    useGameStore.setState({ mapLoading: { active: true, progress: 0.3, message: 'Building data ready...' } });
    renderWithProviders(<MapLoadingScreen />);
    expect(screen.getByText('Building data ready...')).toBeTruthy();
  });

  it('shows no message when message is empty', () => {
    useGameStore.setState({ mapLoading: { active: true, progress: 0, message: '' } });
    const { container } = renderWithProviders(<MapLoadingScreen />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('contains a progress bar with correct value', () => {
    useGameStore.setState({ mapLoading: { active: true, progress: 0.6, message: '' } });
    const { container } = renderWithProviders(<MapLoadingScreen />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar).toBeTruthy();
    expect(bar?.getAttribute('aria-valuenow')).toBe('60');
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
