import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../__tests__/setup/render-helpers';
import { useUiStore } from '../../store/ui-store';
import { useGameStore } from '../../store/game-store';
import { useModeDescriptor } from '../hud/use-mode-descriptor';
import { MobileModeBar } from './MobileModeBar';

/** Renders whatever mode is active, exactly as MobileShell does */
function Harness() {
  const mode = useModeDescriptor();
  return mode ? <MobileModeBar mode={mode} /> : <span>NO MODE</span>;
}

describe('MobileModeBar', () => {
  beforeEach(() => {
    useUiStore.setState({ isPlacingBuilding: false, placementValid: false, placingFacility: null });
    useGameStore.setState({ isRoadBuildingMode: false, isRoadDemolishMode: false, isZonePaintingMode: false, tycoonStats: null, overlayBeforeMode: null });
  });

  it('says nothing when no mode runs', () => {
    renderWithProviders(<Harness />);
    expect(screen.getByText('NO MODE')).toBeTruthy();
  });

  it('road building: kind, what to do, the tariff, and Done leaves the mode', () => {
    const onBuildRoad = jest.fn();
    renderWithProviders(<Harness />, { clientCallbacks: createSpiedCallbacks({ onBuildRoad }) });
    act(() => useGameStore.setState({ isRoadBuildingMode: true }));
    const bar = screen.getByRole('status');
    expect(bar.textContent).toContain('Road');
    expect(bar.textContent).toContain('Build');
    expect(bar.textContent).toContain('$2,000,000 per tile');
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    expect(onBuildRoad).toHaveBeenCalledTimes(1);
  });

  it('road demolition: Done toggles the mode off', () => {
    const onDemolishRoad = jest.fn();
    renderWithProviders(<Harness />, { clientCallbacks: createSpiedCallbacks({ onDemolishRoad }) });
    act(() => useGameStore.setState({ isRoadDemolishMode: true }));
    expect(screen.getByRole('status').textContent).toContain('Demolish');
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    expect(onDemolishRoad).toHaveBeenCalledTimes(1);
  });

  it('zone painting: says what happened to the overlay, and Done cancels', () => {
    const onCancelZonePainting = jest.fn();
    renderWithProviders(<Harness />, { clientCallbacks: createSpiedCallbacks({ onCancelZonePainting }) });
    act(() => useGameStore.setState({ isZonePaintingMode: true, overlayBeforeMode: { type: 'none' } }));
    const bar = screen.getByRole('status');
    expect(bar.textContent).toContain('Zones');
    expect(bar.textContent).toContain('Drag a rectangle on the map');
    expect(bar.textContent).toContain('Zones overlay shown for this mode');
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    expect(onCancelZonePainting).toHaveBeenCalledTimes(1);
  });

  it('placement (the shell keeps its own HUD, but the words are the same) marks an invalid spot', () => {
    renderWithProviders(<Harness />);
    act(() => {
      useUiStore.getState().setPlacingFacility({ name: 'Textile Mill', cost: 240000 });
      useUiStore.getState().setIsPlacingBuilding(true);
      useUiStore.getState().setPlacementValid(false);
    });
    expect(screen.getByRole('status').textContent).toContain('Invalid spot');
    expect(screen.getByRole('button', { name: /Done/ }).getAttribute('aria-label')).toContain('Placement');
  });
});
