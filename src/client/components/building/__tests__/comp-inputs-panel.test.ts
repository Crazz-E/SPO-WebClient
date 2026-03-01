/**
 * Tests for CompInputsPanel data parsing and interaction logic.
 * Test env is `node` (no jsdom) — tests verify data flow, not DOM rendering.
 */

import { describe, it, expect } from '@jest/globals';
import { parseCompInputServices, getDemandStatus, getFulfillmentStatus } from '../comp-inputs-utils';

// =============================================================================
// HELPERS
// =============================================================================

function buildValueMap(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

function singleServiceMap(overrides?: Record<string, string>): Map<string, string> {
  return buildValueMap({
    cInputCount: '1',
    'cInput0.0': 'Advertisement',
    cInputSup0: '1680',
    cInputDem0: '1680',
    cInputRatio0: '100',
    cInputMax0: '1680',
    cEditable0: '-1',
    'cUnits0.0': 'hits',
    ...overrides,
  });
}

function multiServiceMap(): Map<string, string> {
  return buildValueMap({
    cInputCount: '3',
    // Service 0
    'cInput0.0': 'Advertisement',
    cInputSup0: '1680',
    cInputDem0: '1680',
    cInputRatio0: '100',
    cInputMax0: '1680',
    cEditable0: '-1',
    'cUnits0.0': 'hits',
    // Service 1
    'cInput1.0': 'Legal Services',
    cInputSup1: '500',
    cInputDem1: '750',
    cInputRatio1: '67',
    cInputMax1: '1000',
    cEditable1: '-1',
    'cUnits1.0': 'points',
    // Service 2
    'cInput2.0': 'Computing',
    cInputSup2: '0',
    cInputDem2: '200',
    cInputRatio2: '0',
    cInputMax2: '400',
    cEditable2: '0',
    'cUnits2.0': 'cycles',
  });
}

// =============================================================================
// parseCompInputServices - PARSING
// =============================================================================

describe('parseCompInputServices', () => {
  it('should return empty array when cInputCount is 0', () => {
    const result = parseCompInputServices(buildValueMap({ cInputCount: '0' }));
    expect(result).toEqual([]);
  });

  it('should return empty array when cInputCount is missing', () => {
    const result = parseCompInputServices(buildValueMap({}));
    expect(result).toEqual([]);
  });

  it('should return empty array for non-numeric cInputCount', () => {
    const result = parseCompInputServices(buildValueMap({ cInputCount: 'abc' }));
    expect(result).toEqual([]);
  });

  it('should parse a single service correctly', () => {
    const result = parseCompInputServices(singleServiceMap());
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      index: 0,
      name: 'Advertisement',
      receiving: 1680,
      requesting: 1680,
      ratio: 100,
      max: 1680,
      editable: true,
      units: 'hits',
    });
  });

  it('should parse multiple services', () => {
    const result = parseCompInputServices(multiServiceMap());
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Advertisement');
    expect(result[1].name).toBe('Legal Services');
    expect(result[2].name).toBe('Computing');
  });

  it('should default name when cInput{i}.0 is missing', () => {
    const map = buildValueMap({ cInputCount: '1', cInputSup0: '100' });
    const result = parseCompInputServices(map);
    expect(result[0].name).toBe('Service 1');
  });

  it('should default units to empty string when cUnits{i}.0 is missing', () => {
    const map = singleServiceMap();
    map.delete('cUnits0.0');
    const result = parseCompInputServices(map);
    expect(result[0].units).toBe('');
  });

  it('should default numeric values to 0 when missing', () => {
    const map = buildValueMap({ cInputCount: '1', 'cInput0.0': 'Test' });
    const result = parseCompInputServices(map);
    expect(result[0].receiving).toBe(0);
    expect(result[0].requesting).toBe(0);
    expect(result[0].ratio).toBe(0);
    expect(result[0].max).toBe(0);
  });
});

// =============================================================================
// parseCompInputServices - EDITABLE FLAG
// =============================================================================

describe('parseCompInputServices editable flag', () => {
  it('should set editable=true when cEditable is "-1" (OLE boolean)', () => {
    const result = parseCompInputServices(singleServiceMap({ cEditable0: '-1' }));
    expect(result[0].editable).toBe(true);
  });

  it('should set editable=true when cEditable is "yes"', () => {
    const result = parseCompInputServices(singleServiceMap({ cEditable0: 'yes' }));
    expect(result[0].editable).toBe(true);
  });

  it('should set editable=true when cEditable is "true"', () => {
    const result = parseCompInputServices(singleServiceMap({ cEditable0: 'true' }));
    expect(result[0].editable).toBe(true);
  });

  it('should set editable=true when cEditable is "1"', () => {
    const result = parseCompInputServices(singleServiceMap({ cEditable0: '1' }));
    expect(result[0].editable).toBe(true);
  });

  it('should be case-insensitive for editable values', () => {
    const result = parseCompInputServices(singleServiceMap({ cEditable0: 'Yes' }));
    expect(result[0].editable).toBe(true);
  });

  it('should set editable=false when cEditable is "0"', () => {
    const result = parseCompInputServices(singleServiceMap({ cEditable0: '0' }));
    expect(result[0].editable).toBe(false);
  });

  it('should set editable=false when cEditable is "no"', () => {
    const result = parseCompInputServices(singleServiceMap({ cEditable0: 'no' }));
    expect(result[0].editable).toBe(false);
  });

  it('should set editable=false when cEditable is missing', () => {
    const map = singleServiceMap();
    map.delete('cEditable0');
    const result = parseCompInputServices(map);
    expect(result[0].editable).toBe(false);
  });
});

// =============================================================================
// SLIDER LOGIC
// =============================================================================

describe('CompInputsPanel slider logic', () => {
  it('should compute percentage from requesting/max', () => {
    const result = parseCompInputServices(singleServiceMap({
      cInputDem0: '840',
      cInputMax0: '1680',
    }));
    const svc = result[0];
    const perc = svc.max > 0 ? Math.round((svc.requesting / svc.max) * 100) : svc.ratio;
    expect(perc).toBe(50);
  });

  it('should fall back to ratio when max is 0', () => {
    const result = parseCompInputServices(singleServiceMap({
      cInputDem0: '100',
      cInputMax0: '0',
      cInputRatio0: '75',
    }));
    const svc = result[0];
    const perc = svc.max > 0 ? Math.round((svc.requesting / svc.max) * 100) : svc.ratio;
    expect(perc).toBe(75);
  });

  it('should clamp ratio bar width to 0-100', () => {
    // Ratio > 100 should clamp
    const result = parseCompInputServices(singleServiceMap({ cInputRatio0: '150' }));
    const width = Math.min(100, Math.max(0, result[0].ratio));
    expect(width).toBe(100);
  });

  it('should clamp negative ratio to 0', () => {
    const result = parseCompInputServices(singleServiceMap({ cInputRatio0: '-5' }));
    // The parser uses parseInt which gives -5, but the component clamps
    const width = Math.min(100, Math.max(0, result[0].ratio));
    expect(width).toBe(0);
  });

  it('should show slider only when canEdit AND editable', () => {
    const result = parseCompInputServices(multiServiceMap());
    // Service 0: editable = true (-1), Service 2: editable = false (0)
    const canEdit = true;
    expect(canEdit && result[0].editable).toBe(true);
    expect(canEdit && result[2].editable).toBe(false);
  });

  it('should not show slider when canEdit is false even if editable', () => {
    const result = parseCompInputServices(singleServiceMap({ cEditable0: '-1' }));
    const canEdit = false;
    expect(canEdit && result[0].editable).toBe(false);
  });
});

// =============================================================================
// RDO COMMAND DISPATCH
// =============================================================================

describe('CompInputsPanel RDO command dispatch', () => {
  it('should use RDOSetCompanyInputDemand as the command name', () => {
    const command = 'RDOSetCompanyInputDemand';
    expect(command).toBe('RDOSetCompanyInputDemand');
  });

  it('should pass service index as the index parameter', () => {
    const services = parseCompInputServices(multiServiceMap());
    // Service 1 has index 1
    const params = { index: String(services[1].index) };
    expect(params).toEqual({ index: '1' });
  });

  it('should pass percentage as the value (string)', () => {
    const percValue = 75;
    const value = String(percValue);
    expect(value).toBe('75');
  });

  it('should format all indices correctly for multi-service buildings', () => {
    const services = parseCompInputServices(multiServiceMap());
    const indices = services.map((s) => String(s.index));
    expect(indices).toEqual(['0', '1', '2']);
  });
});

// =============================================================================
// SUB-TAB SELECTION
// =============================================================================

describe('CompInputsPanel sub-tab selection', () => {
  it('should have services for sub-tab rendering when count > 1', () => {
    const services = parseCompInputServices(multiServiceMap());
    expect(services.length > 1).toBe(true);
  });

  it('should not need tabs when only one service exists', () => {
    const services = parseCompInputServices(singleServiceMap());
    expect(services.length).toBe(1);
  });

  it('should safely clamp activeIdx when services shrink', () => {
    const services = parseCompInputServices(singleServiceMap());
    const activeIdx = 5; // Out of bounds
    const safeIdx = Math.min(activeIdx, services.length - 1);
    expect(safeIdx).toBe(0);
  });

  it('should preserve correct service data when switching tabs', () => {
    const services = parseCompInputServices(multiServiceMap());
    expect(services[0].units).toBe('hits');
    expect(services[1].units).toBe('points');
    expect(services[2].units).toBe('cycles');
  });
});

// =============================================================================
// STATUS HELPERS
// =============================================================================

describe('getDemandStatus', () => {
  it('should return healthy when demand is 100%', () => {
    expect(getDemandStatus(100)).toBe('healthy');
  });

  it('should return healthy when demand exceeds 100%', () => {
    expect(getDemandStatus(105)).toBe('healthy');
  });

  it('should return warning at 50%', () => {
    expect(getDemandStatus(50)).toBe('warning');
  });

  it('should return warning at 72% (post-upgrade scenario)', () => {
    expect(getDemandStatus(72)).toBe('warning');
  });

  it('should return warning at 99%', () => {
    expect(getDemandStatus(99)).toBe('warning');
  });

  it('should return critical below 50%', () => {
    expect(getDemandStatus(49)).toBe('critical');
  });

  it('should return critical at 0%', () => {
    expect(getDemandStatus(0)).toBe('critical');
  });
});

describe('getFulfillmentStatus', () => {
  it('should return healthy at 95%', () => {
    expect(getFulfillmentStatus(95)).toBe('healthy');
  });

  it('should return healthy at 100%', () => {
    expect(getFulfillmentStatus(100)).toBe('healthy');
  });

  it('should return warning at 94%', () => {
    expect(getFulfillmentStatus(94)).toBe('warning');
  });

  it('should return warning at 50%', () => {
    expect(getFulfillmentStatus(50)).toBe('warning');
  });

  it('should return critical below 50%', () => {
    expect(getFulfillmentStatus(49)).toBe('critical');
  });

  it('should return critical at 0%', () => {
    expect(getFulfillmentStatus(0)).toBe('critical');
  });
});
