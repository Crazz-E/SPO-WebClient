/**
 * PropertyGroup utility functions — pure logic helpers for building property rendering.
 *
 * Extracted from PropertyGroup.tsx to reduce file size and improve testability.
 */

import type { BuildingPropertyValue } from '@/shared/types';
import type { RdoCommandMapping } from '@/shared/building-details';

// =============================================================================
// RDO COMMAND RESOLUTION
// =============================================================================

/**
 * Resolve a raw property name to the correct RDO command and params.
 * Uses the group's rdoCommands mapping to translate property names like
 * 'srvPrices0' → { command: 'RDOSetPrice', params: { index: '0' } }
 * 'Stopped' → { command: 'property', params: { propertyName: 'Stopped' } }
 */
export function resolveRdoCommand(
  propertyName: string,
  rdoCommands?: Record<string, RdoCommandMapping>,
): { command: string; params?: Record<string, string> } {
  if (!rdoCommands) {
    return { command: propertyName };
  }

  // Direct match (non-indexed): e.g., 'Stopped' → { command: 'property' }
  if (rdoCommands[propertyName]) {
    const mapping = rdoCommands[propertyName];
    if (mapping.command === 'property') {
      return { command: 'property', params: { propertyName, ...mapping.params } };
    }
    return { command: mapping.command, params: mapping.params };
  }

  // Indexed match: strip trailing digits to find base name.
  // e.g., 'srvPrices0' → base='srvPrices', index='0'
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

  // Mid-index match for columnSuffix patterns: digits embedded in middle.
  // e.g., 'Tax0Percent' → prefix='Tax', index='0', suffix='Percent' → key='TaxPercent'
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

  // No mapping found — pass through as-is
  return { command: propertyName };
}

/**
 * Compute the pending-update key for a property, matching the key format
 * used in client.ts setBuildingProperty: "command" or "command:{"index":"0"}"
 */
export function computePendingKey(
  rdoName: string,
  rdoCommands?: Record<string, RdoCommandMapping>,
): string {
  const { command, params } = resolveRdoCommand(rdoName, rdoCommands);
  return params ? `${command}:${JSON.stringify(params)}` : command;
}

/** Check if current player is mayor of this town (from ActualRuler property) */
export function checkIsMayor(properties: BuildingPropertyValue[]): boolean {
  const ruler = properties.find((p) => p.name === 'ActualRuler');
  return ruler?.value !== undefined && ruler.value !== '';
}

/**
 * Parse pipe-delimited CloneMenu0 value into option pairs.
 * Delphi format: "Label|decimalValue|Label|decimalValue|..."
 * Archaeology: ManagementSheet.pas:137-149, CompStringsParser.pas:93-116
 */
export function parseCloneMenu(value: string): Array<{ label: string; value: number }> {
  if (!value) return [];
  const parts = value.split('|').filter(s => s.length > 0);
  const options: Array<{ label: string; value: number }> = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const label = parts[i].trim();
    const numVal = parseInt(parts[i + 1], 10);
    if (label && !isNaN(numVal)) {
      options.push({ label, value: numVal });
    }
  }
  return options;
}

export function getColorClass(num: number, colorCode?: string): string {
  if (!colorCode) return '';
  if (colorCode === 'positive') return 'positive';
  if (colorCode === 'negative') return 'negative';
  if (colorCode === 'auto') {
    if (num > 0) return 'positive';
    if (num < 0) return 'negative';
  }
  return '';
}
