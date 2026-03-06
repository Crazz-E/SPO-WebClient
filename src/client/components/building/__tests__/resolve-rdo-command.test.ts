/**
 * Tests for resolveRdoCommand property name resolution
 *
 * Replicates the resolveRdoCommand logic from PropertyGroup.tsx
 * to verify all three resolution strategies:
 * 1. Direct match (non-indexed)
 * 2. Trailing-digit indexed match (e.g., srvPrices0)
 * 3. Mid-index columnSuffix match (e.g., Tax0Percent)
 */

import { describe, it, expect } from '@jest/globals';

interface RdoCommandMapping {
  command: string;
  indexed?: boolean;
  params?: Record<string, string>;
}

/**
 * Replicates resolveRdoCommand from PropertyGroup.tsx for testability.
 */
function resolveRdoCommand(
  propertyName: string,
  rdoCommands?: Record<string, RdoCommandMapping>,
): { command: string; params?: Record<string, string> } {
  if (!rdoCommands) {
    return { command: propertyName };
  }

  // Direct match
  if (rdoCommands[propertyName]) {
    const mapping = rdoCommands[propertyName];
    if (mapping.command === 'property') {
      return { command: 'property', params: { propertyName, ...mapping.params } };
    }
    return { command: mapping.command, params: mapping.params };
  }

  // Indexed match: trailing digits
  const match = propertyName.match(/^(.+?)(\d+)$/);
  if (match) {
    const [, baseName, indexStr] = match;
    const mapping = rdoCommands[baseName];
    if (mapping?.indexed) {
      const params: Record<string, string> = { index: indexStr, ...mapping.params };
      if (mapping.command === 'property') {
        return { command: 'property', params: { propertyName, ...params } };
      }
      return { command: mapping.command, params };
    }
  }

  // Mid-index match for columnSuffix patterns
  const midMatch = propertyName.match(/^(.*?)(\d+)(.+)$/);
  if (midMatch) {
    const [, prefix, indexStr, suffix] = midMatch;
    const compositeKey = prefix + suffix;
    const mapping = rdoCommands[compositeKey];
    if (mapping?.indexed) {
      const params: Record<string, string> = { index: indexStr, ...mapping.params };
      if (mapping.command === 'property') {
        return { command: 'property', params: { propertyName, ...params } };
      }
      return { command: mapping.command, params };
    }
  }

  return { command: propertyName };
}

describe('resolveRdoCommand', () => {
  describe('direct match', () => {
    it('should resolve direct non-indexed property', () => {
      const rdoCommands: Record<string, RdoCommandMapping> = {
        'hiActualMinSalary': { command: 'RDOSetMinSalaryValue', params: { levelIndex: '0' } },
      };
      const result = resolveRdoCommand('hiActualMinSalary', rdoCommands);
      expect(result.command).toBe('RDOSetMinSalaryValue');
      expect(result.params).toEqual({ levelIndex: '0' });
    });

    it('should resolve direct property command', () => {
      const rdoCommands: Record<string, RdoCommandMapping> = {
        'Stopped': { command: 'property' },
      };
      const result = resolveRdoCommand('Stopped', rdoCommands);
      expect(result.command).toBe('property');
      expect(result.params).toEqual({ propertyName: 'Stopped' });
    });
  });

  describe('trailing-digit indexed match', () => {
    it('should resolve srvPrices0 → RDOSetPrice with index 0', () => {
      const rdoCommands: Record<string, RdoCommandMapping> = {
        'srvPrices': { command: 'RDOSetPrice', indexed: true },
      };
      const result = resolveRdoCommand('srvPrices0', rdoCommands);
      expect(result.command).toBe('RDOSetPrice');
      expect(result.params).toEqual({ index: '0' });
    });

    it('should resolve srvPrices5 → RDOSetPrice with index 5', () => {
      const rdoCommands: Record<string, RdoCommandMapping> = {
        'srvPrices': { command: 'RDOSetPrice', indexed: true },
      };
      const result = resolveRdoCommand('srvPrices5', rdoCommands);
      expect(result.command).toBe('RDOSetPrice');
      expect(result.params).toEqual({ index: '5' });
    });
  });

  describe('mid-index columnSuffix match (Tax table)', () => {
    const rdoCommands: Record<string, RdoCommandMapping> = {
      'TaxPercent': { command: 'RDOSetTaxValue', indexed: true },
    };

    it('should resolve Tax0Percent → RDOSetTaxValue with index 0', () => {
      const result = resolveRdoCommand('Tax0Percent', rdoCommands);
      expect(result.command).toBe('RDOSetTaxValue');
      expect(result.params).toEqual({ index: '0' });
    });

    it('should resolve Tax5Percent → RDOSetTaxValue with index 5', () => {
      const result = resolveRdoCommand('Tax5Percent', rdoCommands);
      expect(result.command).toBe('RDOSetTaxValue');
      expect(result.params).toEqual({ index: '5' });
    });

    it('should resolve Tax12Percent → RDOSetTaxValue with index 12', () => {
      const result = resolveRdoCommand('Tax12Percent', rdoCommands);
      expect(result.command).toBe('RDOSetTaxValue');
      expect(result.params).toEqual({ index: '12' });
    });
  });

  describe('pass-through', () => {
    it('should pass through unmatched property names', () => {
      const result = resolveRdoCommand('UnknownProp', {});
      expect(result.command).toBe('UnknownProp');
      expect(result.params).toBeUndefined();
    });

    it('should pass through when no rdoCommands provided', () => {
      const result = resolveRdoCommand('AnyName');
      expect(result.command).toBe('AnyName');
    });
  });

  describe('mid-index with additional params', () => {
    it('should merge indexed params with mapping params', () => {
      const rdoCommands: Record<string, RdoCommandMapping> = {
        'TaxPercent': { command: 'RDOSetTaxValue', indexed: true, params: { extra: 'value' } },
      };
      const result = resolveRdoCommand('Tax3Percent', rdoCommands);
      expect(result.command).toBe('RDOSetTaxValue');
      expect(result.params).toEqual({ index: '3', extra: 'value' });
    });
  });

  describe('ministry budget indexed match', () => {
    const rdoCommands: Record<string, RdoCommandMapping> = {
      'MinisterBudget': { command: 'RDOSetMinistryBudget', indexed: true },
    };

    it('should resolve MinisterBudget0 → RDOSetMinistryBudget with index 0', () => {
      const result = resolveRdoCommand('MinisterBudget0', rdoCommands);
      expect(result.command).toBe('RDOSetMinistryBudget');
      expect(result.params).toEqual({ index: '0' });
    });

    it('should resolve MinisterBudget3 → RDOSetMinistryBudget with index 3', () => {
      const result = resolveRdoCommand('MinisterBudget3', rdoCommands);
      expect(result.command).toBe('RDOSetMinistryBudget');
      expect(result.params).toEqual({ index: '3' });
    });

    it('should NOT resolve MinisterBudget when indexed is missing', () => {
      const noIndexed: Record<string, RdoCommandMapping> = {
        'MinisterBudget': { command: 'RDOSetMinistryBudget' },
      };
      const result = resolveRdoCommand('MinisterBudget0', noIndexed);
      // Falls through to pass-through since indexed is not set
      expect(result.command).toBe('MinisterBudget0');
    });
  });

  describe('priority: trailing-digit before mid-index', () => {
    it('should prefer trailing-digit match when both could match', () => {
      // Property 'abc123' could match trailing-digit 'abc' + '123'
      // but not mid-index (no suffix after digits)
      const rdoCommands: Record<string, RdoCommandMapping> = {
        'abc': { command: 'TrailingCmd', indexed: true },
      };
      const result = resolveRdoCommand('abc123', rdoCommands);
      expect(result.command).toBe('TrailingCmd');
      expect(result.params).toEqual({ index: '123' });
    });
  });
});
