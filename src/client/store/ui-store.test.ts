/**
 * Tests for ui-store — build menu state.
 */

import { useUiStore } from './ui-store';
import { useBuildingStore } from './building-store';

describe('ui-store build menu state', () => {
  beforeEach(() => {
    // Reset build menu state
    useUiStore.getState().clearBuildMenuData();
  });

  it('should have correct initial build menu state', () => {
    const state = useUiStore.getState();
    expect(state.buildMenuCategories).toEqual([]);
    expect(state.buildMenuFacilities).toEqual([]);
  });

  it('setBuildMenuCategories should set categories', () => {
    const categories = [
      { kind: 1, kindName: 'Residential', cluster: 'General', tycoonLevel: 0 },
      { kind: 2, kindName: 'Commercial', cluster: 'General', tycoonLevel: 1 },
    ];
    useUiStore.getState().setBuildMenuCategories(categories as never[]);
    expect(useUiStore.getState().buildMenuCategories).toEqual(categories);
  });

  it('setBuildMenuFacilities should set facilities', () => {
    const facilities = [
      { facilityClass: 'house1', name: 'Small House', cost: 1000, area: 4, available: true, visualClassId: 100, description: 'A small house' },
    ];
    useUiStore.getState().setBuildMenuFacilities(facilities as never[]);
    expect(useUiStore.getState().buildMenuFacilities).toEqual(facilities);
  });

  it('clearBuildMenuData should reset both arrays', () => {
    useUiStore.getState().setBuildMenuCategories([{ kind: 1 }] as never[]);
    useUiStore.getState().setBuildMenuFacilities([{ name: 'test' }] as never[]);

    useUiStore.getState().clearBuildMenuData();

    const state = useUiStore.getState();
    expect(state.buildMenuCategories).toEqual([]);
    expect(state.buildMenuFacilities).toEqual([]);
  });
});

describe('ui-store existing state', () => {
  it('should preserve existing modal behavior', () => {
    useUiStore.getState().openModal('buildMenu');
    expect(useUiStore.getState().modal).toBe('buildMenu');

    useUiStore.getState().closeModal();
    expect(useUiStore.getState().modal).toBeNull();
  });

  it('should preserve existing panel behavior', () => {
    useUiStore.getState().openRightPanel('building');
    expect(useUiStore.getState().rightPanel).toBe('building');

    useUiStore.getState().closeRightPanel();
    expect(useUiStore.getState().rightPanel).toBeNull();
  });

  it('should toggle left panel with facilities type', () => {
    useUiStore.getState().toggleLeftPanel('facilities');
    expect(useUiStore.getState().leftPanel).toBe('facilities');

    useUiStore.getState().toggleLeftPanel('facilities');
    expect(useUiStore.getState().leftPanel).toBeNull();
  });

  it('should switch left panel between empire and facilities', () => {
    useUiStore.getState().openLeftPanel('empire');
    expect(useUiStore.getState().leftPanel).toBe('empire');

    useUiStore.getState().openLeftPanel('facilities');
    expect(useUiStore.getState().leftPanel).toBe('facilities');
  });

  it('should open buildingInspector modal', () => {
    useUiStore.getState().openModal('buildingInspector');
    expect(useUiStore.getState().modal).toBe('buildingInspector');

    useUiStore.getState().closeModal();
    expect(useUiStore.getState().modal).toBeNull();
  });

  it('dismissTopmost with buildingInspector modal should clear building focus', () => {
    // Set some building focus state
    useBuildingStore.getState().setFocus({
      buildingName: 'National Capitol',
      ownerName: 'Test',
      x: 100,
      y: 200,
    } as never);
    useUiStore.getState().openModal('buildingInspector');

    useUiStore.getState().dismissTopmost();

    expect(useUiStore.getState().modal).toBeNull();
    expect(useBuildingStore.getState().focusedBuilding).toBeNull();
  });

  it('should preserve dismissTopmost priority order', () => {
    useUiStore.getState().openRightPanel('building');
    useUiStore.getState().openModal('settings');
    useUiStore.getState().openCommandPalette();

    // Topmost: command palette
    useUiStore.getState().dismissTopmost();
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
    expect(useUiStore.getState().modal).toBe('settings');

    // Next: modal
    useUiStore.getState().dismissTopmost();
    expect(useUiStore.getState().modal).toBeNull();
    expect(useUiStore.getState().rightPanel).toBe('building');

    // Next: right panel
    useUiStore.getState().dismissTopmost();
    expect(useUiStore.getState().rightPanel).toBeNull();
  });
});
