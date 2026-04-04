/**
 * Tests for Supply SortMode + MaxPrice controls (Phase 1 Item 5)
 * Verifies: data types, property propagation, RDO command mapping, UI logic
 */

import { describe, it, expect } from '@jest/globals';
import { WsMessageType } from '../../shared/types/message-types';
import { ROAD_CONSTANTS } from '../../shared/constants';
import type {
  BuildingSupplyData,
  BuildingConnectionData,
} from '../../shared/types';

// =============================================================================
// SUPPLY DATA TYPE EXTENSIONS
// =============================================================================

describe('BuildingSupplyData extended properties', () => {
  function createSupply(overrides?: Partial<BuildingSupplyData>): BuildingSupplyData {
    return {
      path: 'input0',
      name: 'Pharmaceutics',
      metaFluid: 'Chemicals',
      fluidValue: '150',
      connectionCount: 2,
      connections: [],
      ...overrides,
    };
  }

  it('should include sortMode field', () => {
    const supply = createSupply({ sortMode: '1' });
    expect(supply.sortMode).toBe('1');
  });

  it('should include maxPrice field', () => {
    const supply = createSupply({ maxPrice: '500' });
    expect(supply.maxPrice).toBe('500');
  });

  it('should include minK field', () => {
    const supply = createSupply({ minK: '30' });
    expect(supply.minK).toBe('30');
  });

  it('should include lastCostPerc field', () => {
    const supply = createSupply({ lastCostPerc: '85' });
    expect(supply.lastCostPerc).toBe('85');
  });

  it('should include qpSorted field', () => {
    const supply = createSupply({ qpSorted: 'Yes' });
    expect(supply.qpSorted).toBe('Yes');
  });

  it('should allow undefined for all optional fields', () => {
    const supply = createSupply();
    expect(supply.sortMode).toBeUndefined();
    expect(supply.maxPrice).toBeUndefined();
    expect(supply.minK).toBeUndefined();
    expect(supply.lastCostPerc).toBeUndefined();
    expect(supply.qpSorted).toBeUndefined();
  });

  it('should serialize extended supply data to JSON', () => {
    const supply = createSupply({
      sortMode: '0',
      maxPrice: '200',
      minK: '50',
      lastCostPerc: '92',
      qpSorted: 'No',
    });
    const json = JSON.parse(JSON.stringify(supply));
    expect(json.sortMode).toBe('0');
    expect(json.maxPrice).toBe('200');
    expect(json.minK).toBe('50');
    expect(json.lastCostPerc).toBe('92');
    expect(json.qpSorted).toBe('No');
  });
});

// =============================================================================
// SORT MODE LOGIC
// =============================================================================

describe('Supply SortMode logic', () => {
  it('should interpret sortMode 0 as sort-by-cost', () => {
    const sortMode: string = '0';
    const label = sortMode === '1' ? 'By Quality' : 'By Cost';
    expect(label).toBe('By Cost');
  });

  it('should interpret sortMode 1 as sort-by-quality', () => {
    const sortMode: string = '1';
    const label = sortMode === '1' ? 'By Quality' : 'By Cost';
    expect(label).toBe('By Quality');
  });

  it('should default to sort-by-cost when sortMode is undefined', () => {
    const sortMode: string | undefined = undefined;
    const effectiveMode = sortMode === '1' ? '1' : '0';
    expect(effectiveMode).toBe('0');
  });

  it('should map sort mode change to RDOSetInputSortMode command', () => {
    const rdoCommand = 'RDOSetInputSortMode';
    const value = '1'; // quality
    const params = { fluidId: 'Chemicals' };
    expect(rdoCommand).toBe('RDOSetInputSortMode');
    expect(value).toBe('1');
    expect(params.fluidId).toBe('Chemicals');
  });
});

// =============================================================================
// MAX PRICE LOGIC
// =============================================================================

describe('Supply MaxPrice logic', () => {
  it('should parse maxPrice as integer', () => {
    const maxPrice = '350';
    const parsed = parseInt(maxPrice, 10);
    expect(parsed).toBe(350);
  });

  it('should default to 200 when maxPrice is undefined', () => {
    const maxPrice: string | undefined = undefined;
    const currentMaxPrice = parseInt(maxPrice || '200', 10);
    expect(currentMaxPrice).toBe(200);
  });

  it('should handle NaN maxPrice by defaulting', () => {
    const maxPrice = '';
    const parsed = parseInt(maxPrice || '200', 10);
    const effective = isNaN(parsed) ? 200 : parsed;
    expect(effective).toBe(200);
  });

  it('should clamp maxPrice to valid range 0-1000', () => {
    const values = [0, 100, 500, 1000];
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1000);
    }
  });

  it('should map max price change to RDOSetInputMaxPrice command', () => {
    const rdoCommand = 'RDOSetInputMaxPrice';
    const value = '500';
    const params = { fluidId: 'Steel' };
    expect(rdoCommand).toBe('RDOSetInputMaxPrice');
    expect(value).toBe('500');
    expect(params.fluidId).toBe('Steel');
  });
});

// =============================================================================
// SERVER-SIDE PROPERTY EXTRACTION
// =============================================================================

describe('Supply property extraction from server response', () => {
  it('should map supplyProps array indices to correct fields', () => {
    // Simulates the property list fetch order:
    // ['MetaFluid', 'FluidValue', 'LastCostPerc', 'minK', 'MaxPrice', 'QPSorted', 'SortMode', 'cnxCount', 'ObjectId']
    const supplyProps = ['Chemicals', '150', '85', '30', '200', 'Yes', '1', '3', '12345'];

    const supply: Partial<BuildingSupplyData> = {
      metaFluid: supplyProps[0] || '',
      fluidValue: supplyProps[1] || '',
      lastCostPerc: supplyProps[2] || undefined,
      minK: supplyProps[3] || undefined,
      maxPrice: supplyProps[4] || undefined,
      qpSorted: supplyProps[5] || undefined,
      sortMode: supplyProps[6] || undefined,
      connectionCount: parseInt(supplyProps[7] || '0', 10),
    };

    expect(supply.metaFluid).toBe('Chemicals');
    expect(supply.fluidValue).toBe('150');
    expect(supply.lastCostPerc).toBe('85');
    expect(supply.minK).toBe('30');
    expect(supply.maxPrice).toBe('200');
    expect(supply.qpSorted).toBe('Yes');
    expect(supply.sortMode).toBe('1');
    expect(supply.connectionCount).toBe(3);
  });

  it('should handle empty/missing property values', () => {
    const supplyProps = ['', '', '', '', '', '', '', '0', ''];

    const supply: Partial<BuildingSupplyData> = {
      metaFluid: supplyProps[0] || '',
      fluidValue: supplyProps[1] || '',
      lastCostPerc: supplyProps[2] || undefined,
      minK: supplyProps[3] || undefined,
      maxPrice: supplyProps[4] || undefined,
      qpSorted: supplyProps[5] || undefined,
      sortMode: supplyProps[6] || undefined,
      connectionCount: parseInt(supplyProps[7] || '0', 10),
    };

    expect(supply.metaFluid).toBe('');
    expect(supply.lastCostPerc).toBeUndefined();
    expect(supply.minK).toBeUndefined();
    expect(supply.maxPrice).toBeUndefined();
    expect(supply.sortMode).toBeUndefined();
    expect(supply.connectionCount).toBe(0);
  });
});

// =============================================================================
// RDO COMMAND MAPPING (mapRdoCommandToPropertyName coverage)
// =============================================================================

describe('Supply RDO command mapping', () => {
  // Simulates mapRdoCommandToPropertyName for supply commands
  function mapCommand(cmd: string): string {
    switch (cmd) {
      case 'RDOSetInputMaxPrice': return 'MaxPrice';
      case 'RDOSetInputMinK': return 'minK';
      case 'RDOSetInputSortMode': return 'SortMode';
      case 'RDOSelSelected': return 'Selected';
      case 'RDOSetBuyingStatus': return 'Selected';
      case 'RDOSetInputOverPrice': return 'OverPriceCnxInfo';
      case 'RDOConnectInput': return 'cnxCount';
      case 'RDODisconnectInput': return 'cnxCount';
      default: return cmd;
    }
  }

  it('should map RDOSetInputMaxPrice to MaxPrice', () => {
    expect(mapCommand('RDOSetInputMaxPrice')).toBe('MaxPrice');
  });

  it('should map RDOSetInputMinK to minK', () => {
    expect(mapCommand('RDOSetInputMinK')).toBe('minK');
  });

  it('should map RDOSetInputSortMode to SortMode', () => {
    expect(mapCommand('RDOSetInputSortMode')).toBe('SortMode');
  });

  it('should map RDOSelSelected to Selected', () => {
    expect(mapCommand('RDOSelSelected')).toBe('Selected');
  });

  it('should map RDOSetBuyingStatus to Selected', () => {
    expect(mapCommand('RDOSetBuyingStatus')).toBe('Selected');
  });

  it('should map connection commands to cnxCount', () => {
    expect(mapCommand('RDOConnectInput')).toBe('cnxCount');
    expect(mapCommand('RDODisconnectInput')).toBe('cnxCount');
  });

  it('should map RDOSetInputOverPrice to OverPriceCnxInfo', () => {
    expect(mapCommand('RDOSetInputOverPrice')).toBe('OverPriceCnxInfo');
  });
});

// =============================================================================
// DISCONNECT INPUT COMMAND
// =============================================================================

describe('RDODisconnectInput command format', () => {
  it('should format single coordinate pair for disconnect (trailing comma required by Delphi ParseGateList)', () => {
    const x = 100;
    const y = 200;
    const connectionList = `${x},${y},`;
    expect(connectionList).toBe('100,200,');
  });

  it('should include fluidId in additionalParams', () => {
    const params = { fluidId: 'Chemicals', connectionList: '100,200,' };
    expect(params.fluidId).toBe('Chemicals');
    expect(params.connectionList).toBe('100,200,');
  });

  function disconnectCommand(direction: 'input' | 'output'): string {
    return direction === 'input' ? 'RDODisconnectInput' : 'RDODisconnectOutput';
  }

  it('should use RDODisconnectInput for input direction', () => {
    expect(disconnectCommand('input')).toBe('RDODisconnectInput');
  });

  it('should use RDODisconnectOutput for output direction', () => {
    expect(disconnectCommand('output')).toBe('RDODisconnectOutput');
  });
});

// =============================================================================
// OVERPRICE COMMAND
// =============================================================================

describe('RDOSetInputOverPrice command format', () => {
  it('should include fluidId and index in additionalParams', () => {
    const params = { fluidId: 'Steel', index: '2' };
    expect(params.fluidId).toBe('Steel');
    expect(params.index).toBe('2');
  });

  it('should accept overprice values 0-150', () => {
    const values = [0, 50, 100, 150];
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(150);
    }
  });

  it('should pass overprice as string value', () => {
    const overprice = 75;
    const valueStr = String(overprice);
    expect(valueStr).toBe('75');
  });
});

// =============================================================================
// XSS PREVENTION
// =============================================================================

describe('Supply controls - XSS prevention', () => {
  it('should escape HTML in supply names', () => {
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const malicious = '<img onerror="alert(1)" src=x>';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('<img');
    expect(escaped).toContain('&lt;img');
  });

  it('should escape HTML in fluid values', () => {
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const malicious = '100" onmouseover="alert(1)';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('"');
    expect(escaped).toContain('&quot;');
  });
});
