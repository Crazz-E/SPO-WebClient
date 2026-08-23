/**
 * Civic subtitle — "President: X" for the Capitol, "Mayor: Y" for a Town Hall.
 * Extracted from the former BuildingInspectorModal so the universal sheet can show the
 * same header for civic buildings (socle-3c).
 */

import type { BuildingDetailsResponse } from '@/shared/types';
import type { PoliticsData } from '@/shared/types';
import { isCapitolBuilding } from '../politics/CivicTabConfig';

/** Search all property groups for a named value. */
export function findPropertyValue(details: BuildingDetailsResponse, propName: string): string | undefined {
  for (const group of Object.values(details.groups)) {
    for (const prop of group) {
      if (prop.name === propName && prop.value) return prop.value;
    }
  }
  return undefined;
}

export function getCivicSubtitle(details: BuildingDetailsResponse, politicsData: PoliticsData | null): string {
  const isCapitol = isCapitolBuilding(details.tabs);
  const rulerFromGroups = findPropertyValue(details, 'ActualRuler') ?? findPropertyValue(details, 'RulerName');
  if (isCapitol) {
    const name = rulerFromGroups ?? details.ownerName;
    return `President: ${name}`;
  }
  const name = politicsData?.mayorName ?? rulerFromGroups ?? details.ownerName;
  return `Mayor: ${name}`;
}
