/**
 * Tests for StatusOverlay utility functions and visibility logic.
 *
 * React rendering is not tested (node env, no jsdom) — only pure logic
 * and store-driven visibility patterns.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { useBuildingStore } from '../../store/building-store';
import type { BuildingFocusInfo } from '@/shared/types';

// Mock CSS module — node env has no CSS loader
jest.mock('./StatusOverlay.module.css', () => ({
  revenuePositive: 'revenuePositive',
  revenueNegative: 'revenueNegative',
  revenueNeutral: 'revenueNeutral',
}));

// Import after mock
import { revenueClass, revenueDirection } from './StatusOverlay';

const mockBuilding: BuildingFocusInfo = {
  buildingId: '12345',
  buildingName: 'Drug Store',
  ownerName: 'TestCorp',
  salesInfo: 'Pharmaceutics sales at 80%',
  revenue: '($120/h)',
  detailsText: 'Hiring: 12 workers\nSupply: good',
  hintsText: 'Consider raising prices',
  x: 100,
  y: 200,
  xsize: 2,
  ysize: 2,
  visualClass: '1234',
};

describe('StatusOverlay — revenueClass()', () => {
  it('returns negative class for revenue with minus sign', () => {
    expect(revenueClass('(-$36/h)')).toBe('revenueNegative');
    expect(revenueClass('-$500/h')).toBe('revenueNegative');
  });

  it('returns positive class for non-zero dollar amounts', () => {
    expect(revenueClass('($120/h)')).toBe('revenuePositive');
    expect(revenueClass('$5,000/h')).toBe('revenuePositive');
  });

  it('returns neutral class for zero or empty revenue', () => {
    expect(revenueClass('')).toBe('revenueNeutral');
    expect(revenueClass('$0')).toBe('revenueNeutral');
    expect(revenueClass('($0/h)')).toBe('revenueNeutral');
  });

  it('returns neutral class for text without dollar sign', () => {
    expect(revenueClass('N/A')).toBe('revenueNeutral');
    expect(revenueClass('none')).toBe('revenueNeutral');
  });
});

describe('StatusOverlay — revenueDirection()', () => {
  it('returns down for negative revenue', () => {
    expect(revenueDirection('(-$36/h)')).toBe('down');
    expect(revenueDirection('-$500/h')).toBe('down');
  });

  it('returns up for positive revenue', () => {
    expect(revenueDirection('($120/h)')).toBe('up');
    expect(revenueDirection('$5,000/h')).toBe('up');
  });

  it('returns neutral for zero, empty, or text-only revenue', () => {
    expect(revenueDirection('')).toBe('neutral');
    expect(revenueDirection('$0')).toBe('neutral');
    expect(revenueDirection('N/A')).toBe('neutral');
  });
});

describe('StatusOverlay — visibility logic via store', () => {
  beforeEach(() => {
    useBuildingStore.setState({
      focusedBuilding: null,
      isOverlayMode: false,
      details: null,
      currentTab: 'overview',
      isLoading: false,
      currentCompanyName: '',
      isOwner: false,
      connectionPicker: null,
      research: null,
    });
  });

  it('overlay not visible when no focused building', () => {
    const state = useBuildingStore.getState();
    expect(state.focusedBuilding).toBeNull();
    expect(state.isOverlayMode).toBe(false);
    // Component would return null: !building || !isOverlay
  });

  it('overlay not visible when building focused but overlay mode off', () => {
    useBuildingStore.getState().setFocus(mockBuilding);
    const state = useBuildingStore.getState();
    expect(state.focusedBuilding).not.toBeNull();
    expect(state.isOverlayMode).toBe(false);
    // Component would return null: !isOverlay
  });

  it('overlay visible when building focused and overlay mode on', () => {
    useBuildingStore.getState().setFocus(mockBuilding);
    useBuildingStore.getState().setOverlayMode(true);
    const state = useBuildingStore.getState();
    expect(state.focusedBuilding).not.toBeNull();
    expect(state.isOverlayMode).toBe(true);
    // Component would render
  });

  it('overlay hidden after clearFocus', () => {
    useBuildingStore.getState().setFocus(mockBuilding);
    useBuildingStore.getState().setOverlayMode(true);
    useBuildingStore.getState().clearFocus();
    const state = useBuildingStore.getState();
    expect(state.focusedBuilding).toBeNull();
    expect(state.isOverlayMode).toBe(false);
  });

  it('overlay hidden after clearOverlay (building preserved)', () => {
    useBuildingStore.getState().setFocus(mockBuilding);
    useBuildingStore.getState().setOverlayMode(true);
    useBuildingStore.getState().clearOverlay();
    const state = useBuildingStore.getState();
    expect(state.focusedBuilding).toBe(mockBuilding);
    expect(state.isOverlayMode).toBe(false);
  });

  it('building refresh updates overlay data', () => {
    useBuildingStore.getState().setFocus(mockBuilding);
    useBuildingStore.getState().setOverlayMode(true);

    const refreshed: BuildingFocusInfo = {
      ...mockBuilding,
      salesInfo: 'Pharmaceutics sales at 95%',
      revenue: '($500/h)',
    };
    useBuildingStore.getState().setFocus(refreshed);

    const state = useBuildingStore.getState();
    expect(state.focusedBuilding?.salesInfo).toBe('Pharmaceutics sales at 95%');
    expect(state.isOverlayMode).toBe(true);
  });

  it('focused building has footprint dimensions', () => {
    useBuildingStore.getState().setFocus(mockBuilding);
    const state = useBuildingStore.getState();
    expect(state.focusedBuilding?.xsize).toBe(2);
    expect(state.focusedBuilding?.ysize).toBe(2);
    expect(state.focusedBuilding?.visualClass).toBe('1234');
  });

  it('detailsText splits into lines correctly', () => {
    const lines = mockBuilding.detailsText.split('\n').filter(Boolean);
    expect(lines).toEqual(['Hiring: 12 workers', 'Supply: good']);
  });

  it('empty detailsText produces no lines', () => {
    const lines = ''.split('\n').filter(Boolean);
    expect(lines).toEqual([]);
  });
});
