/**
 * Characterization tests for PropertyGroup pure functions.
 *
 * These cover the exported logic helpers that don't require React rendering:
 * resolveRdoCommand, computePendingKey, checkIsMayor, parseCloneMenu, getColorClass.
 *
 * Serves as a safety net before splitting the 2,447-line file into domain modules.
 */

import {
  resolveRdoCommand,
  computePendingKey,
  checkIsMayor,
  parseCloneMenu,
  getColorClass,
} from './PropertyGroup';
import type { RdoCommandMapping } from '@/shared/building-details';
import type { BuildingPropertyValue } from '@/shared/types';

// =============================================================================
// resolveRdoCommand
// =============================================================================

describe('resolveRdoCommand', () => {
  it('returns property name as command when no rdoCommands provided', () => {
    expect(resolveRdoCommand('Stopped')).toEqual({ command: 'Stopped' });
  });

  it('returns property name as command when no mapping matches', () => {
    const cmds: Record<string, RdoCommandMapping> = {};
    expect(resolveRdoCommand('Unknown', cmds)).toEqual({ command: 'Unknown' });
  });

  // Direct match
  it('resolves direct non-property mapping', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      Stopped: { command: 'RDOSetStopped' },
    };
    expect(resolveRdoCommand('Stopped', cmds)).toEqual({
      command: 'RDOSetStopped',
      params: undefined,
    });
  });

  it('resolves direct property mapping with propertyName in params', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      Stopped: { command: 'property' },
    };
    expect(resolveRdoCommand('Stopped', cmds)).toEqual({
      command: 'property',
      params: { propertyName: 'Stopped' },
    });
  });

  it('merges extra params from direct property mapping', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      Stopped: { command: 'property', params: { extra: 'val' } },
    };
    const result = resolveRdoCommand('Stopped', cmds);
    expect(result.command).toBe('property');
    expect(result.params).toEqual({ propertyName: 'Stopped', extra: 'val' });
  });

  // Indexed match (trailing digits)
  it('resolves indexed mapping: srvPrices0 → RDOSetPrice with index=0', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      srvPrices: { command: 'RDOSetPrice', indexed: true },
    };
    expect(resolveRdoCommand('srvPrices0', cmds)).toEqual({
      command: 'RDOSetPrice',
      params: { index: '0' },
    });
  });

  it('resolves indexed mapping with extra params', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      srvPrices: { command: 'RDOSetPrice', indexed: true, params: { tab: '1' } },
    };
    const result = resolveRdoCommand('srvPrices3', cmds);
    expect(result).toEqual({
      command: 'RDOSetPrice',
      params: { index: '3', tab: '1' },
    });
  });

  it('does not match indexed when indexed flag is false', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      srvPrices: { command: 'RDOSetPrice' },
    };
    // Without indexed: true, trailing-digit stripping still finds srvPrices
    // but the .indexed check fails → falls through
    expect(resolveRdoCommand('srvPrices0', cmds)).toEqual({ command: 'srvPrices0' });
  });

  // Mid-index match (digits in middle)
  it('resolves mid-index mapping: Tax0Percent → TaxPercent with index=0', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      TaxPercent: { command: 'RDOSetTaxValue', indexed: true },
    };
    expect(resolveRdoCommand('Tax0Percent', cmds)).toEqual({
      command: 'RDOSetTaxValue',
      params: { index: '0' },
    });
  });

  it('resolves mid-index property mapping', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      TaxPercent: { command: 'property', indexed: true },
    };
    const result = resolveRdoCommand('Tax2Percent', cmds);
    expect(result).toEqual({
      command: 'property',
      params: { propertyName: 'Tax2Percent', index: '2' },
    });
  });

  it('merges extra params with mid-index mapping', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      TaxPercent: { command: 'RDOSetTaxValue', indexed: true, params: { kind: 'percent' } },
    };
    expect(resolveRdoCommand('Tax5Percent', cmds)).toEqual({
      command: 'RDOSetTaxValue',
      params: { index: '5', kind: 'percent' },
    });
  });

  it('prefers direct match over indexed match', () => {
    // If 'Salaries0' is a direct key, it should match directly, not strip trailing '0'
    const cmds: Record<string, RdoCommandMapping> = {
      Salaries0: { command: 'RDOSetSalaryExact' },
      Salaries: { command: 'RDOSetSalary', indexed: true },
    };
    expect(resolveRdoCommand('Salaries0', cmds)).toEqual({
      command: 'RDOSetSalaryExact',
      params: undefined,
    });
  });

  it('handles multi-digit index in indexed match', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      srvPrices: { command: 'RDOSetPrice', indexed: true },
    };
    expect(resolveRdoCommand('srvPrices42', cmds)).toEqual({
      command: 'RDOSetPrice',
      params: { index: '42' },
    });
  });

  it('handles multi-digit mid-index', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      TaxPercent: { command: 'RDOSetTaxValue', indexed: true },
    };
    expect(resolveRdoCommand('Tax15Percent', cmds)).toEqual({
      command: 'RDOSetTaxValue',
      params: { index: '15' },
    });
  });

  it('falls through when mid-index composite key has no indexed flag', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      TaxPercent: { command: 'RDOSetTaxValue' }, // no indexed: true
    };
    expect(resolveRdoCommand('Tax0Percent', cmds)).toEqual({ command: 'Tax0Percent' });
  });

  it('falls through when indexed base does not exist in mapping', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      otherProp: { command: 'RDOSetOther', indexed: true },
    };
    expect(resolveRdoCommand('srvPrices0', cmds)).toEqual({ command: 'srvPrices0' });
  });
});

// =============================================================================
// computePendingKey
// =============================================================================

describe('computePendingKey', () => {
  it('returns command name when no rdoCommands', () => {
    expect(computePendingKey('Stopped')).toBe('Stopped');
  });

  it('returns command with stringified params when mapped', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      srvPrices: { command: 'RDOSetPrice', indexed: true },
    };
    const key = computePendingKey('srvPrices0', cmds);
    expect(key).toBe('RDOSetPrice:{"index":"0"}');
  });

  it('returns command without params when no params resolved', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      Stopped: { command: 'RDOSetStopped' },
    };
    expect(computePendingKey('Stopped', cmds)).toBe('RDOSetStopped');
  });

  it('includes propertyName in key for property commands', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      Stopped: { command: 'property' },
    };
    expect(computePendingKey('Stopped', cmds)).toBe('property:{"propertyName":"Stopped"}');
  });

  it('produces different keys for different indices', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      srvPrices: { command: 'RDOSetPrice', indexed: true },
    };
    const key0 = computePendingKey('srvPrices0', cmds);
    const key1 = computePendingKey('srvPrices1', cmds);
    expect(key0).not.toBe(key1);
    expect(key0).toContain('"0"');
    expect(key1).toContain('"1"');
  });

  it('handles mid-index patterns', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      TaxPercent: { command: 'RDOSetTaxValue', indexed: true },
    };
    expect(computePendingKey('Tax0Percent', cmds)).toBe('RDOSetTaxValue:{"index":"0"}');
  });

  it('is deterministic for repeated calls', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      srvPrices: { command: 'RDOSetPrice', indexed: true },
    };
    const a = computePendingKey('srvPrices0', cmds);
    const b = computePendingKey('srvPrices0', cmds);
    expect(a).toBe(b);
  });

  it('passthrough key equals property name when unmapped', () => {
    const cmds: Record<string, RdoCommandMapping> = {
      Other: { command: 'RDOSetOther' },
    };
    expect(computePendingKey('Unknown', cmds)).toBe('Unknown');
  });
});

// =============================================================================
// checkIsMayor
// =============================================================================

describe('checkIsMayor', () => {
  it('returns true when ActualRuler has a non-empty value', () => {
    expect(checkIsMayor([{ name: 'ActualRuler', value: 'PlayerName' }])).toBe(true);
  });

  it('returns false when ActualRuler is empty string', () => {
    expect(checkIsMayor([{ name: 'ActualRuler', value: '' }])).toBe(false);
  });

  it('returns false when ActualRuler is missing', () => {
    expect(checkIsMayor([{ name: 'SomeProp', value: '42' }])).toBe(false);
  });

  it('returns false on empty array', () => {
    expect(checkIsMayor([])).toBe(false);
  });

  it('returns true even for "0" (non-empty string)', () => {
    const props: BuildingPropertyValue[] = [
      { name: 'ActualRuler', value: '0' },
    ];
    expect(checkIsMayor(props)).toBe(true);
  });

  it('finds ActualRuler among many properties', () => {
    const props: BuildingPropertyValue[] = [
      { name: 'Name', value: 'Town Hall' },
      { name: 'Budget', value: '50000' },
      { name: 'ActualRuler', value: 'MayorJoe' },
      { name: 'Population', value: '1200' },
    ];
    expect(checkIsMayor(props)).toBe(true);
  });

  it('returns false when ActualRuler is present but value is undefined-like', () => {
    // Per the function: ruler?.value !== undefined && ruler.value !== ''
    // A property with value '' should return false
    const props: BuildingPropertyValue[] = [
      { name: 'ActualRuler', value: '' },
      { name: 'OtherProp', value: 'notempty' },
    ];
    expect(checkIsMayor(props)).toBe(false);
  });
});

// =============================================================================
// parseCloneMenu
// =============================================================================

describe('parseCloneMenu', () => {
  it('returns empty array for empty string', () => {
    expect(parseCloneMenu('')).toEqual([]);
  });

  it('parses pipe-delimited label|value pairs', () => {
    const result = parseCloneMenu('Prices|1|Workers|2|');
    expect(result).toEqual([
      { label: 'Prices', value: 1 },
      { label: 'Workers', value: 2 },
    ]);
  });

  it('handles single pair', () => {
    expect(parseCloneMenu('Salaries|4')).toEqual([
      { label: 'Salaries', value: 4 },
    ]);
  });

  it('skips pairs with non-numeric values', () => {
    expect(parseCloneMenu('Good|1|Bad|abc')).toEqual([
      { label: 'Good', value: 1 },
    ]);
  });

  it('trims whitespace from labels', () => {
    const result = parseCloneMenu(' Prices |1');
    expect(result).toEqual([{ label: 'Prices', value: 1 }]);
  });

  it('handles odd number of parts (ignores trailing label)', () => {
    expect(parseCloneMenu('Prices|1|Orphan')).toEqual([
      { label: 'Prices', value: 1 },
    ]);
  });

  it('handles Delphi bitmask values (power-of-2 decimals)', () => {
    const result = parseCloneMenu('Prices|4|Wages|8|Suppliers|16|Connections|32');
    expect(result).toHaveLength(4);
    expect(result.map(o => o.value)).toEqual([4, 8, 16, 32]);
  });

  it('handles negative values', () => {
    expect(parseCloneMenu('Option|-1')).toEqual([
      { label: 'Option', value: -1 },
    ]);
  });

  it('skips empty labels after trim', () => {
    expect(parseCloneMenu('  |4')).toEqual([]);
  });

  it('handles multiple empty segments from consecutive pipes', () => {
    // '||' → filter removes empty strings
    expect(parseCloneMenu('Prices||4')).toEqual([
      { label: 'Prices', value: 4 },
    ]);
  });

  it('parses zero as a valid value', () => {
    expect(parseCloneMenu('Reset|0')).toEqual([
      { label: 'Reset', value: 0 },
    ]);
  });

  it('handles float-like strings by parseInt truncation', () => {
    // parseInt('3.14', 10) → 3
    expect(parseCloneMenu('Float|3.14')).toEqual([
      { label: 'Float', value: 3 },
    ]);
  });
});

// =============================================================================
// getColorClass
// =============================================================================

describe('getColorClass', () => {
  // We can't test exact CSS module class names, but we can test the logic
  // by checking whether a class is returned (non-empty) or not.

  it('returns empty string when no colorCode', () => {
    expect(getColorClass(42)).toBe('');
    expect(getColorClass(42, undefined)).toBe('');
  });

  it('returns a class for colorCode "positive"', () => {
    const result = getColorClass(-5, 'positive');
    expect(result).not.toBe(''); // always returns positive class regardless of value
  });

  it('returns a class for colorCode "negative"', () => {
    const result = getColorClass(100, 'negative');
    expect(result).not.toBe('');
  });

  it('returns positive class for auto when num > 0', () => {
    const result = getColorClass(10, 'auto');
    expect(result).not.toBe('');
  });

  it('returns negative class for auto when num < 0', () => {
    const result = getColorClass(-10, 'auto');
    expect(result).not.toBe('');
  });

  it('returns empty string for auto when num === 0', () => {
    expect(getColorClass(0, 'auto')).toBe('');
  });

  it('returns empty string for unknown colorCode', () => {
    expect(getColorClass(42, 'unknown')).toBe('');
  });

  it('returns class for NaN with positive colorCode (forced override)', () => {
    // NaN > 0 is false, NaN < 0 is false — but 'positive' is unconditional
    const result = getColorClass(NaN, 'positive');
    expect(result).not.toBe('');
  });

  it('returns empty string for NaN with auto colorCode', () => {
    // NaN > 0 → false, NaN < 0 → false → returns ''
    expect(getColorClass(NaN, 'auto')).toBe('');
  });

  it('auto: positive and negative return different classes', () => {
    const pos = getColorClass(10, 'auto');
    const neg = getColorClass(-10, 'auto');
    expect(pos).not.toBe('');
    expect(neg).not.toBe('');
    expect(pos).not.toBe(neg);
  });
});

// =============================================================================
// Integration: resolveRdoCommand + computePendingKey consistency
// =============================================================================

describe('resolveRdoCommand + computePendingKey consistency', () => {
  const rdoCommands: Record<string, RdoCommandMapping> = {
    srvPrices: { command: 'RDOSetPrice', indexed: true },
    Stopped: { command: 'property' },
    TaxPercent: { command: 'RDOSetTaxValue', indexed: true, params: { kind: 'percent' } },
    TradeRole: { command: 'RDOSetTradeRole' },
  };

  it('resolved command is the prefix of the pending key', () => {
    const resolved = resolveRdoCommand('srvPrices0', rdoCommands);
    const key = computePendingKey('srvPrices0', rdoCommands);
    expect(key.startsWith(resolved.command)).toBe(true);
  });

  it('pending key for property command includes propertyName', () => {
    const key = computePendingKey('Stopped', rdoCommands);
    expect(key).toContain('Stopped');
    expect(key).toContain('property');
  });

  it('pending key for command without params has no colon', () => {
    const key = computePendingKey('TradeRole', rdoCommands);
    expect(key).toBe('RDOSetTradeRole');
    expect(key).not.toContain(':');
  });

  it('mid-index pending key includes all merged params', () => {
    const key = computePendingKey('Tax0Percent', rdoCommands);
    expect(key).toContain('RDOSetTaxValue');
    expect(key).toContain('"index":"0"');
    expect(key).toContain('"kind":"percent"');
  });

  it('unmapped properties produce simple passthrough keys', () => {
    const key = computePendingKey('RandomProp', rdoCommands);
    expect(key).toBe('RandomProp');
  });
});
