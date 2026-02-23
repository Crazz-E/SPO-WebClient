/**
 * Building Details Property Templates
 *
 * Data-driven template system: CLASSES.BIN [InspectorInfo] sections define
 * which tabs each building class displays. Templates are registered at startup
 * by BuildingDataService via registerInspectorTabs().
 */

import { BuildingTemplate, PropertyGroup } from './property-definitions';
import {
  GENERIC_GROUP,
  WORKFORCE_GROUP,
  UPGRADE_GROUP,
  HANDLER_TO_GROUP,
} from './template-groups';

// =============================================================================
// GENERIC FALLBACK TEMPLATE
// =============================================================================

/**
 * Fallback template for building classes not yet registered via CLASSES.BIN.
 * In practice this should rarely be hit since all 863 classes are registered.
 */
const GENERIC_TEMPLATE: BuildingTemplate = {
  visualClassIds: ['*'],
  name: 'Building',
  groups: [
    GENERIC_GROUP,
    WORKFORCE_GROUP,
    UPGRADE_GROUP,
  ],
};

// =============================================================================
// DATA-DRIVEN TEMPLATE CACHE
// =============================================================================

/**
 * Template cache from CLASSES.BIN [InspectorInfo] sections.
 * Populated by registerInspectorTabs() during BuildingDataService initialization.
 */
const dataDrivenTemplateCache: Map<string, BuildingTemplate> = new Map();

/**
 * Register inspectorTabs from CLASSES.BIN for a visualClass.
 * Converts [InspectorInfo] tab handler names into PropertyGroup arrays
 * using the HANDLER_TO_GROUP mapping.
 *
 * Called during BuildingDataService initialization for every building class.
 */
export function registerInspectorTabs(
  visualClassId: string,
  inspectorTabs: { tabName: string; tabHandler: string }[]
): void {
  if (!inspectorTabs.length) return;

  const groups: PropertyGroup[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < inspectorTabs.length; i++) {
    const tab = inspectorTabs[i];
    const baseGroup = HANDLER_TO_GROUP[tab.tabHandler];
    if (!baseGroup) continue;

    // Create a unique group ID per tab position.
    // Well-known handlers (Supplies, Workforce, etc.) keep their original ID
    // unless it's already taken. Duplicate IDs (e.g., multiple handlers → GENERIC_GROUP)
    // get a handler-suffixed ID so every tab is preserved.
    let groupId = baseGroup.id;
    if (usedIds.has(groupId)) {
      groupId = `${baseGroup.id}_${tab.tabHandler}`;
    }
    usedIds.add(groupId);

    groups.push({
      ...baseGroup,
      id: groupId,
      name: tab.tabName || baseGroup.name,
      order: i * 10,
      handlerName: tab.tabHandler,
    });
  }

  if (groups.length > 0) {
    dataDrivenTemplateCache.set(visualClassId, {
      visualClassIds: [visualClassId],
      name: 'Building',
      groups,
    });
  }
}

/**
 * Clear the data-driven template cache (for testing)
 */
export function clearInspectorTabsCache(): void {
  dataDrivenTemplateCache.clear();
}

/**
 * Get template for a visualClassId.
 * Returns data-driven template from CLASSES.BIN, or GENERIC_TEMPLATE fallback.
 */
export function getTemplateForVisualClass(visualClassId: string): BuildingTemplate {
  return dataDrivenTemplateCache.get(visualClassId) || GENERIC_TEMPLATE;
}

// =============================================================================
// PROPERTY NAME COLLECTION
// =============================================================================

/**
 * Result of collecting property names, separating count properties from regular/indexed ones
 */
export interface CollectedPropertyNames {
  /** Regular (non-indexed) property names to fetch */
  regularProperties: string[];
  /** Count property names that need to be fetched first */
  countProperties: string[];
  /** Map of countProperty -> list of indexed property definitions that depend on it */
  indexedByCount: Map<string, IndexedPropertyInfo[]>;
}

/**
 * Info about an indexed property for dynamic fetching
 */
export interface IndexedPropertyInfo {
  rdoName: string;
  maxProperty?: string;
  columns?: { rdoSuffix: string; columnSuffix?: string }[];
  indexSuffix?: string;
}

/**
 * Collect property names with structured output for two-phase fetching
 */
export function collectTemplatePropertyNamesStructured(template: BuildingTemplate): CollectedPropertyNames {
  const regularProperties: Set<string> = new Set();
  const countProperties: Set<string> = new Set();
  const indexedByCount: Map<string, IndexedPropertyInfo[]> = new Map();

  for (const group of template.groups) {
    collectGroupPropertyNamesStructured(group, regularProperties, countProperties, indexedByCount);
  }

  return {
    regularProperties: Array.from(regularProperties),
    countProperties: Array.from(countProperties),
    indexedByCount,
  };
}

/**
 * Helper to collect property names from a group with structured output
 */
function collectGroupPropertyNamesStructured(
  group: PropertyGroup,
  regularProperties: Set<string>,
  countProperties: Set<string>,
  indexedByCount: Map<string, IndexedPropertyInfo[]>
): void {
  for (const prop of group.properties) {
    const suffix = prop.indexSuffix || '';

    // Handle WORKFORCE_TABLE type specially
    if (prop.type === 'WORKFORCE_TABLE') {
      // Add all workforce properties for 3 worker classes (0, 1, 2)
      // WorkCenterBlock.StoreToCache: Workers, WorkersMax, WorkersK, Salaries,
      // WorkForcePrice, WorkersCap, MinSalaries, SalaryValues per class
      for (let i = 0; i < 3; i++) {
        regularProperties.add(`Workers${i}`);
        regularProperties.add(`WorkersMax${i}`);
        regularProperties.add(`WorkersK${i}`);
        regularProperties.add(`Salaries${i}`);
        regularProperties.add(`WorkForcePrice${i}`);
        regularProperties.add(`WorkersCap${i}`);
        regularProperties.add(`MinSalaries${i}`);
        regularProperties.add(`SalaryValues${i}`);
      }
      continue;
    }

    if (prop.indexed && prop.countProperty) {
      // Indexed property with count - add to structured map
      countProperties.add(prop.countProperty);
      if (!indexedByCount.has(prop.countProperty)) {
        indexedByCount.set(prop.countProperty, []);
      }

      indexedByCount.get(prop.countProperty)!.push({
        rdoName: prop.rdoName,
        maxProperty: prop.maxProperty,
        columns: prop.columns,
        indexSuffix: suffix,
      });
    } else if (prop.indexed && prop.indexMax !== undefined) {
      // Indexed property with fixed max - add all indices as regular
      for (let i = 0; i <= prop.indexMax; i++) {
        regularProperties.add(`${prop.rdoName}${i}${suffix}`);
        if (prop.maxProperty) {
          regularProperties.add(`${prop.maxProperty}${i}${suffix}`);
        }
      }
    } else {
      // Regular property
      regularProperties.add(prop.rdoName);
      if (prop.maxProperty) {
        regularProperties.add(prop.maxProperty);
      }
    }

    // For table columns without count property, add indices 0-9
    if (prop.columns && !prop.countProperty) {
      for (let i = 0; i < 10; i++) {
        for (const col of prop.columns) {
          regularProperties.add(`${col.rdoSuffix}${i}${col.columnSuffix || ''}${suffix}`);
        }
      }
    }
  }

  // Recurse into subgroups
  if (group.subGroups) {
    for (const subGroup of group.subGroups) {
      collectGroupPropertyNamesStructured(subGroup, regularProperties, countProperties, indexedByCount);
    }
  }
}
