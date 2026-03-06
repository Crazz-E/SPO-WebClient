import { getTemplateForVisualClass } from './property-templates';

/** Visual class prefixes that represent civic government buildings (Capitol, TownHall). */
const CIVIC_VISUAL_CLASS_PREFIXES = ['PGICapitol', 'PGITownHall'] as const;

/** Handler names that indicate civic government buildings. */
export const CIVIC_HANDLER_NAMES = new Set(['capitolGeneral', 'townGeneral']);

/**
 * Registered civic visual class IDs (numeric).
 * Populated by registerInspectorTabs() when a building with civic handlers is registered.
 * Persists across the session so isCivicBuilding works immediately without waiting
 * for the template cache to be populated (avoids the first-click timing issue).
 */
const civicVisualClassIds = new Set<string>();

/**
 * Register a visual class ID as a civic building (Capitol, TownHall, etc.).
 * Called automatically by registerInspectorTabs when civic handlers are detected.
 * Can also be called manually to add custom civic buildings.
 */
export function registerCivicVisualClass(visualClassId: string): void {
  civicVisualClassIds.add(visualClassId);
}

/** Clear the civic visual class ID set (for testing). */
export function clearCivicVisualClassIds(): void {
  civicVisualClassIds.clear();
}

/** Get all registered civic visual class IDs (for sending to client). */
export function getCivicVisualClassIds(): string[] {
  return [...civicVisualClassIds];
}

/**
 * Returns true if the visual class represents a Capitol or TownHall building.
 *
 * Check order (fast to slow):
 * 1. Registered civic visual class IDs (populated by registerInspectorTabs)
 * 2. PGI prefix string names (e.g. 'PGICapitolA', 'PGITownHallB')
 * 3. Data-driven template cache fallback (for first-ever encounter)
 */
export function isCivicBuilding(visualClass: string): boolean {
  if (civicVisualClassIds.has(visualClass)) {
    return true;
  }
  if (CIVIC_VISUAL_CLASS_PREFIXES.some(prefix => visualClass.startsWith(prefix))) {
    return true;
  }
  // For numeric visual class IDs, check if the data-driven template has civic handlers
  const template = getTemplateForVisualClass(visualClass);
  return template.groups.some(g => CIVIC_HANDLER_NAMES.has(g.handlerName ?? ''));
}
