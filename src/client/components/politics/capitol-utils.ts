/**
 * Capitol panel utilities — shared helpers for tab components.
 */

import type { BuildingPropertyValue } from '@/shared/types';

/** Build a name→value map from a property array for fast lookups. */
export function buildValueMap(properties: BuildingPropertyValue[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const prop of properties) {
    map.set(prop.name, prop.value);
  }
  return map;
}

/** Get a numeric value from the map, defaulting to 0. */
export function getNum(map: Map<string, string>, key: string): number {
  return parseInt(map.get(key) ?? '0', 10) || 0;
}

/** Format a large number with commas. */
export function formatCompact(n: number): string {
  return n.toLocaleString();
}

/** Format a number as a percentage string. */
export function formatPercent(n: number): string {
  return `${n}%`;
}

/** Check if the ownerRole string indicates the user is president. */
export function isPresidentRole(ownerRole: string): boolean {
  const role = ownerRole.toLowerCase();
  return role.includes('president') || role.includes('président');
}

/** Check if the ownerRole string indicates the user is mayor. */
export function isMayorRole(ownerRole: string): boolean {
  const role = ownerRole.toLowerCase();
  return role.includes('mayor') || role.includes('maire');
}

/** Check if the ownerRole indicates the user owns the civic facility (mayor or president). */
export function isFacilityOwnerRole(ownerRole: string): boolean {
  return isPresidentRole(ownerRole) || isMayorRole(ownerRole);
}
