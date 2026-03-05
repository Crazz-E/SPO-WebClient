/**
 * Tests for BuildingInspectorModal — store integration tests.
 *
 * Test environment is node (no jsdom). We test the store interactions and logic,
 * not React rendering.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { useUiStore } from '../../store/ui-store';
import { useBuildingStore } from '../../store/building-store';

describe('BuildingInspectorModal (store integration)', () => {
  beforeEach(() => {
    useUiStore.getState().closeModal();
    useBuildingStore.getState().clearFocus();
  });

  it('should open buildingInspector modal for civic buildings', () => {
    useUiStore.getState().openModal('buildingInspector');
    expect(useUiStore.getState().modal).toBe('buildingInspector');
  });

  it('should close modal and clear building focus together', () => {
    useBuildingStore.getState().setFocus({
      buildingName: 'National Capitol',
      ownerName: 'Government',
      x: 510,
      y: 420,
    } as never);
    useUiStore.getState().openModal('buildingInspector');

    // Simulate modal close (what handleClose does)
    useUiStore.getState().closeModal();
    useBuildingStore.getState().clearFocus();

    expect(useUiStore.getState().modal).toBeNull();
    expect(useBuildingStore.getState().focusedBuilding).toBeNull();
  });

  it('dismissTopmost should close buildingInspector and clear focus', () => {
    useBuildingStore.getState().setFocus({
      buildingName: 'Town Hall',
      ownerName: 'Mayor',
      x: 300,
      y: 400,
    } as never);
    useUiStore.getState().openModal('buildingInspector');

    useUiStore.getState().dismissTopmost();

    expect(useUiStore.getState().modal).toBeNull();
    expect(useBuildingStore.getState().focusedBuilding).toBeNull();
  });

  it('should not interfere with other modal types', () => {
    useUiStore.getState().openModal('settings');
    expect(useUiStore.getState().modal).toBe('settings');

    useUiStore.getState().dismissTopmost();
    expect(useUiStore.getState().modal).toBeNull();
    // Building focus should not be touched for non-buildingInspector modals
  });

  it('hideBuildingPanel pattern: close modal when buildingInspector is active', () => {
    useUiStore.getState().openModal('buildingInspector');
    useBuildingStore.getState().setFocus({
      buildingName: 'National Capitol',
      ownerName: 'Government',
      x: 510,
      y: 420,
    } as never);

    // Simulate hideBuildingPanel logic
    useBuildingStore.getState().clearFocus();
    const uiState = useUiStore.getState();
    if (uiState.modal === 'buildingInspector') {
      uiState.closeModal();
    } else if (uiState.rightPanel === 'building') {
      uiState.closeRightPanel();
    }

    expect(useUiStore.getState().modal).toBeNull();
    expect(useBuildingStore.getState().focusedBuilding).toBeNull();
  });

  it('hideBuildingPanel pattern: close right panel when building panel is active', () => {
    useUiStore.getState().openRightPanel('building');
    useBuildingStore.getState().setFocus({
      buildingName: 'Small Factory',
      ownerName: 'TestCo',
      x: 200,
      y: 300,
    } as never);

    // Simulate hideBuildingPanel logic
    useBuildingStore.getState().clearFocus();
    const uiState = useUiStore.getState();
    if (uiState.modal === 'buildingInspector') {
      uiState.closeModal();
    } else if (uiState.rightPanel === 'building') {
      uiState.closeRightPanel();
    }

    expect(useUiStore.getState().rightPanel).toBeNull();
    expect(useBuildingStore.getState().focusedBuilding).toBeNull();
  });
});
