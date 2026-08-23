import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../__tests__/setup/render-helpers';
import { useUiStore } from '../../store/ui-store';
import { RightRail } from './RightRail';

describe('RightRail', () => {
  beforeEach(() => useUiStore.getState().clearSurfaces());

  it('moves aside for ANY open surface (map, build, government…), not only the legacy right panels', () => {
    renderWithProviders(<RightRail />);
    const nav = screen.getByRole('navigation', { name: 'Map controls' });
    expect(nav.className).not.toContain('shifted');
    act(() => useUiStore.getState().toggleMapSurface());
    expect(nav.className).toContain('shifted');
    act(() => useUiStore.getState().clearSurfaces());
    act(() => useUiStore.getState().toggleBuildSurface());
    expect(nav.className).toContain('shifted');
    act(() => useUiStore.getState().clearSurfaces());
    expect(nav.className).not.toContain('shifted');
  });

  it('zoom, minimap, debug and refresh reach the client', () => {
    const onZoomIn = jest.fn(), onZoomOut = jest.fn(), onToggleMinimap = jest.fn(), onToggleDebugOverlay = jest.fn(), onRefreshMap = jest.fn();
    renderWithProviders(<RightRail />, { clientCallbacks: createSpiedCallbacks({ onZoomIn, onZoomOut, onToggleMinimap, onToggleDebugOverlay, onRefreshMap }) });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom In (+)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom Out (-)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Minimap' }));
    fireEvent.click(screen.getByRole('button', { name: 'Debug (D)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh (R)' }));
    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onToggleMinimap).toHaveBeenCalledTimes(1);
    expect(onToggleDebugOverlay).toHaveBeenCalledTimes(1);
    expect(onRefreshMap).toHaveBeenCalledTimes(1);
  });
});
