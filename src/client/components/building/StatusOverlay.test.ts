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
  salesInfo: 'salesInfo',
  salesList: 'salesList',
  salesRow: 'salesRow',
  salesHeader: 'salesHeader',
  salesCategory: 'salesCategory',
  salesPercent: 'salesPercent',
  salesMore: 'salesMore',
  error: 'error',
  warning: 'warning',
  success: 'success',
}));

// Import after mock
import { revenueClass, revenueDirection, parseSalesLines, salesVariant } from './StatusOverlay';

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
    // Component would render with: buildingName, ownerName, revenue, inspect button
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
    expect(state.focusedBuilding?.revenue).toBe('($500/h)');
    expect(state.isOverlayMode).toBe(true);
  });

  it('focused building has footprint dimensions', () => {
    useBuildingStore.getState().setFocus(mockBuilding);
    const state = useBuildingStore.getState();
    expect(state.focusedBuilding?.xsize).toBe(2);
    expect(state.focusedBuilding?.ysize).toBe(2);
    expect(state.focusedBuilding?.visualClass).toBe('1234');
  });

  it('overlay shows building name and owner from focused building', () => {
    useBuildingStore.getState().setFocus(mockBuilding);
    useBuildingStore.getState().setOverlayMode(true);
    const state = useBuildingStore.getState();
    expect(state.focusedBuilding?.buildingName).toBe('Drug Store');
    expect(state.focusedBuilding?.ownerName).toBe('TestCorp');
  });

  it('overlay shows revenue from focused building', () => {
    useBuildingStore.getState().setFocus(mockBuilding);
    useBuildingStore.getState().setOverlayMode(true);
    const state = useBuildingStore.getState();
    expect(state.focusedBuilding?.revenue).toBe('($120/h)');
  });

  it('overlay includes salesInfo from focused building', () => {
    useBuildingStore.getState().setFocus(mockBuilding);
    useBuildingStore.getState().setOverlayMode(true);
    const state = useBuildingStore.getState();
    expect(state.focusedBuilding?.salesInfo).toBe('Pharmaceutics sales at 80%');
  });

  it('overlay handles empty salesInfo gracefully', () => {
    const noSales: BuildingFocusInfo = {
      ...mockBuilding,
      salesInfo: '',
    };
    useBuildingStore.getState().setFocus(noSales);
    useBuildingStore.getState().setOverlayMode(true);
    const state = useBuildingStore.getState();
    expect(state.focusedBuilding?.salesInfo).toBe('');
    // Component skips rendering salesInfo div when falsy
  });

  it('overlay stores multi-line salesInfo from focused building', () => {
    const multiSales: BuildingFocusInfo = {
      ...mockBuilding,
      salesInfo: 'Fresh Food sales at 0%\nProcessed Food sales at 100%\nClothing and Footwear sales at 70%\nHousehold Appliances sales at 29%',
    };
    useBuildingStore.getState().setFocus(multiSales);
    useBuildingStore.getState().setOverlayMode(true);
    const state = useBuildingStore.getState();
    expect(state.focusedBuilding?.salesInfo).toContain('\n');
    expect(state.focusedBuilding?.salesInfo?.split('\n')).toHaveLength(4);
  });
});

describe('StatusOverlay — parseSalesLines()', () => {
  it('parses single sales line', () => {
    expect(parseSalesLines('Pharmaceutics sales at 80%'))
      .toEqual([{ category: 'Pharmaceutics', percent: 80 }]);
  });

  it('parses multiple sales lines', () => {
    const input = 'Fresh Food sales at 0%\nProcessed Food sales at 100%\nClothing and Footwear sales at 70%\nHousehold Appliances sales at 29%';
    const result = parseSalesLines(input);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ category: 'Fresh Food', percent: 0 });
    expect(result[1]).toEqual({ category: 'Processed Food', percent: 100 });
    expect(result[2]).toEqual({ category: 'Clothing and Footwear', percent: 70 });
    expect(result[3]).toEqual({ category: 'Household Appliances', percent: 29 });
  });

  it('returns empty array for construction percentage format', () => {
    expect(parseSalesLines('45% completed.')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseSalesLines('')).toEqual([]);
  });

  it('returns empty array for non-sales format like hiring', () => {
    expect(parseSalesLines('Hiring workforce at 39%')).toEqual([]);
  });

  it('handles mixed valid and invalid lines', () => {
    const input = 'Fresh Food sales at 50%\nSome random text\nClothing sales at 30%';
    const result = parseSalesLines(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ category: 'Fresh Food', percent: 50 });
    expect(result[1]).toEqual({ category: 'Clothing', percent: 30 });
  });

  it('trims whitespace from lines', () => {
    const input = '  Fresh Food sales at 50%  \n  Clothing sales at 30%  ';
    const result = parseSalesLines(input);
    expect(result).toHaveLength(2);
  });

  it('parses inline "Category: N%" format (storage/warehouse)', () => {
    const input = 'Books: 0% Fresh Food: 4% Organic Materials: 4%.';
    const result = parseSalesLines(input);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ category: 'Books', percent: 0 });
    expect(result[1]).toEqual({ category: 'Fresh Food', percent: 4 });
    expect(result[2]).toEqual({ category: 'Organic Materials', percent: 4 });
  });

  it('parses single inline "Category: N%" entry', () => {
    expect(parseSalesLines('Books: 100%'))
      .toEqual([{ category: 'Books', percent: 100 }]);
  });

  it('prefers "sales at" format over inline when both could match', () => {
    const input = 'Fresh Food sales at 50%';
    const result = parseSalesLines(input);
    expect(result).toEqual([{ category: 'Fresh Food', percent: 50 }]);
  });
});

describe('StatusOverlay — salesVariant()', () => {
  it('returns error for 0-25%', () => {
    expect(salesVariant(0)).toBe('error');
    expect(salesVariant(25)).toBe('error');
  });

  it('returns warning for 26-60%', () => {
    expect(salesVariant(26)).toBe('warning');
    expect(salesVariant(60)).toBe('warning');
  });

  it('returns success for 61-100%', () => {
    expect(salesVariant(61)).toBe('success');
    expect(salesVariant(100)).toBe('success');
  });
});
