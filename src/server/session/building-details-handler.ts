/**
 * Building details handler — extracted from StarpeaceSession.
 *
 * Supports lazy tab loading: `getBuildingBasicDetails` fetches lightweight
 * building info (Phase 1+2), while `getBuildingTabData` fetches heavy
 * tab-specific data (supplies, products, compInputs, warehouseWares) on demand.
 *
 * An `ActiveInspector` keeps the Delphi temp object alive between tab requests.
 * An `AsyncMutex` serializes SetPath calls on the same object to prevent
 * state corruption from concurrent tab clicks.
 */

import type { SessionContext } from './session-context';
import type {
  BuildingDetailsResponse,
  BuildingPropertyValue,
  BuildingSupplyData,
  BuildingProductData,
  BuildingConnectionData,
  CompInputData,
  WarehouseWareData,
} from '../../shared/types';
import { RdoVerb, RdoAction } from '../../shared/types';
import {
  getTemplateForVisualClass,
  collectTemplatePropertyNamesStructured,
  collectTemplatePropertyNamesForGroups,
} from '../../shared/building-details';
import type { CollectedPropertyNames } from '../../shared/building-details';
import { cleanPayload as cleanPayloadHelper, parsePropertyResponse as parsePropertyResponseHelper } from '../rdo-helpers';
import { RdoValue } from '../../shared/rdo-types';
import { toErrorMessage } from '../../shared/error-utils';

// =========================================================================
// ASYNC MUTEX — serializes SetPath calls on a shared Delphi temp object
// =========================================================================

export class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => { resolve(() => this.release()); });
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

// =========================================================================
// ACTIVE INSPECTOR — keeps Delphi temp object alive between tab requests
// =========================================================================

export interface ActiveInspector {
  tempObjectId: string;
  x: number;
  y: number;
  visualClass: string;
  mutex: AsyncMutex;
  gateMap: string;
  /** Cached template for tab-to-special mapping. */
  hasSupplies: boolean;
  hasProducts: boolean;
  hasCompInputs: boolean;
  isWarehouse: boolean;
}

/** Per-session active inspector keyed by session context. */
const activeInspectors = new WeakMap<SessionContext, ActiveInspector>();

/**
 * Release the active inspector's Delphi temp object.
 * Called on building deselect, new building select, or session disconnect.
 */
export function releaseInspector(ctx: SessionContext): void {
  const inspector = activeInspectors.get(ctx);
  if (inspector) {
    ctx.log.debug(`[BuildingDetails] Releasing inspector object ${inspector.tempObjectId} at (${inspector.x},${inspector.y})`);
    ctx.cacherCloseObject(inspector.tempObjectId);
    activeInspectors.delete(ctx);
  }
}

/**
 * Get the active inspector for a session (if any, and if coordinates match).
 */
export function getActiveInspector(ctx: SessionContext, x: number, y: number): ActiveInspector | undefined {
  const inspector = activeInspectors.get(ctx);
  if (inspector && inspector.x === x && inspector.y === y) {
    return inspector;
  }
  return undefined;
}

/**
 * Test-only: insert an ActiveInspector into the WeakMap so tests can
 * exercise releaseInspector / getActiveInspector without going through
 * the full RDO pipeline.
 * @internal Exported for unit tests only — do not use in production code.
 */
export function setActiveInspectorForTest(ctx: SessionContext, inspector: ActiveInspector): void {
  activeInspectors.set(ctx, inspector);
}

/**
 * Create an ActiveInspector on-the-fly for a building.
 * Used as fallback when the legacy `getBuildingDetails` path was used (which
 * doesn't create an inspector) but the client then requests lazy tab data.
 * Only creates the Delphi temp object + determines tab capabilities — does NOT
 * fetch properties (those were already fetched by the legacy path).
 */
async function createInspectorForBuilding(
  ctx: SessionContext,
  x: number,
  y: number,
  visualClass: string,
): Promise<ActiveInspector> {
  // Release any stale inspector
  releaseInspector(ctx);

  await ctx.connectMapService();
  if (!ctx.cacherId) {
    throw new Error('Map service not initialized');
  }

  const template = getTemplateForVisualClass(visualClass);
  const tempObjectId = await ctx.cacherCreateObject();

  try {
    await ctx.cacherSetObject(tempObjectId, x, y);

    // Fetch GateMap for warehouse wares (lightweight — single property)
    let gateMap = '';
    const isWarehouse = template.groups.some(g => g.id === 'whGeneral');
    if (isWarehouse) {
      try {
        const vals = await ctx.cacherGetPropertyList(tempObjectId, ['GateMap']);
        gateMap = vals[0] || '';
      } catch {
        // Non-critical — warehouse wares will just show all disabled
      }
    }

    const inspector: ActiveInspector = {
      tempObjectId,
      x,
      y,
      visualClass,
      mutex: new AsyncMutex(),
      gateMap,
      hasSupplies: template.groups.some(g => g.special === 'supplies'),
      hasProducts: template.groups.some(g => g.special === 'products'),
      hasCompInputs: template.groups.some(g => g.special === 'compInputs'),
      isWarehouse,
    };

    activeInspectors.set(ctx, inspector);
    ctx.log.debug(`[BuildingDetails] On-demand inspector created: obj=${tempObjectId} at (${x},${y})`);
    return inspector;
  } catch (e: unknown) {
    // Close temp object to prevent Delphi-side leak
    ctx.cacherCloseObject(tempObjectId);
    throw e;
  }
}

// =========================================================================
// PUBLIC API
// =========================================================================

/**
 * Get building details with deduplication of concurrent requests.
 * Legacy full-fetch path: loads basic + all tab data in one call.
 * Used by auto-refresh and backward-compatible code paths.
 */
export async function getBuildingDetails(
  ctx: SessionContext,
  x: number,
  y: number,
  visualClass: string
): Promise<BuildingDetailsResponse> {
  const dedupeKey = `${x},${y}`;
  const existing = ctx.getInFlightBuildingDetails(dedupeKey);
  if (existing) {
    ctx.log.debug(`[BuildingDetails] Dedup hit (${x},${y})`);
    return existing;
  }

  const promise = getBuildingDetailsImpl(ctx, x, y, visualClass);
  ctx.setInFlightBuildingDetails(dedupeKey, promise);
  try {
    return await promise;
  } finally {
    ctx.deleteInFlightBuildingDetails(dedupeKey);
  }
}

/**
 * Lazy Phase 1+2: Fetch basic building details (properties, tabs, moneyGraph).
 * Keeps the Delphi temp object alive as an ActiveInspector for subsequent
 * tab-specific requests via `getBuildingTabData`.
 */
export async function getBuildingBasicDetails(
  ctx: SessionContext,
  x: number,
  y: number,
  visualClass: string
): Promise<BuildingDetailsResponse> {
  // ALWAYS release the previous inspector — even for the same building.
  // A new temp object will be created below, so the old one must be closed
  // to prevent Delphi-side resource leaks.
  releaseInspector(ctx);

  ctx.log.debug(`[BuildingDetails] Basic details for (${x},${y}), vc=${visualClass}`);

  const template = getTemplateForVisualClass(visualClass);

  // Focus building
  let buildingName = '';
  let ownerName = '';
  let buildingId = '';
  try {
    const focusInfo = await ctx.focusBuilding(x, y);
    buildingName = focusInfo.buildingName;
    ownerName = focusInfo.ownerName;
    buildingId = focusInfo.buildingId;
  } catch (e: unknown) {
    ctx.log.warn(`[BuildingDetails] Could not focus building:`, e);
  }

  // Connect to map service
  await ctx.connectMapService();
  if (!ctx.cacherId) {
    throw new Error('Map service not initialized');
  }

  // Create temporary object for property queries
  const tempObjectId = await ctx.cacherCreateObject();

  try {
    await ctx.cacherSetObject(tempObjectId, x, y);

    // Phase 1+2: Fetch properties (same as getBuildingDetailsImpl)
    const { allValues, groups, moneyGraph } = await fetchPropertiesAndGroups(ctx, tempObjectId, template);

    // Enrich votes tab
    await enrichVotesTab(ctx, groups, allValues);

    // Determine which special tabs exist
    const hasSupplies = template.groups.some(g => g.special === 'supplies');
    const hasProducts = template.groups.some(g => g.special === 'products');
    const hasCompInputs = template.groups.some(g => g.special === 'compInputs');
    const isWarehouse = template.groups.some(g => g.id === 'whGeneral');

    // Eagerly fetch warehouse ware names — lightweight (~2 RDO calls) and needed
    // immediately by the General tab's WARE_CHECKLIST. Without this, the entire
    // General tab was blocked behind a lazy skeleton for ~8 seconds.
    let warehouseWares: WarehouseWareData[] | undefined;
    if (isWarehouse) {
      try {
        warehouseWares = await getWarehouseWareNames(ctx, tempObjectId, allValues.get('GateMap') || '');
      } catch (e: unknown) {
        ctx.log.warn('[BuildingDetails] Failed to fetch warehouse wares eagerly:', toErrorMessage(e));
      }
    }

    // Store as active inspector (keep temp object alive)
    const inspector: ActiveInspector = {
      tempObjectId,
      x,
      y,
      visualClass,
      mutex: new AsyncMutex(),
      gateMap: allValues.get('GateMap') || '',
      hasSupplies,
      hasProducts,
      hasCompInputs,
      isWarehouse,
    };
    activeInspectors.set(ctx, inspector);

    const response: BuildingDetailsResponse = {
      buildingId: buildingId || allValues.get('ObjectId') || allValues.get('CurrBlock') || '',
      x,
      y,
      visualClass,
      templateName: template.name,
      buildingName,
      ownerName,
      securityId: allValues.get('SecurityId') || '',
      tabs: template.groups.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon || '',
        order: g.order,
        special: g.special,
        handlerName: g.handlerName || '',
      })),
      groups,
      // Lazy: supplies/products/compInputs not fetched yet (heavy RDO iteration)
      supplies: undefined,
      products: undefined,
      compInputs: undefined,
      // warehouseWares fetched eagerly above (lightweight, needed by General tab)
      warehouseWares,
      moneyGraph,
      timestamp: Date.now(),
    };

    return response;
  } catch (e: unknown) {
    // On error, clean up the temp object
    ctx.cacherCloseObject(tempObjectId);
    activeInspectors.delete(ctx);
    throw e;
  }
}

/**
 * Lazy Phase 3+4: Fetch tab-specific data using the active inspector's temp object.
 * Serialized via mutex to prevent SetPath race conditions.
 *
 * If no ActiveInspector exists (e.g., the building was loaded via the legacy
 * `getBuildingDetails` path), one is created on-the-fly so tab data still works.
 */
export async function getBuildingTabData(
  ctx: SessionContext,
  x: number,
  y: number,
  tabId: string,
  visualClass?: string,
): Promise<{
  supplies?: BuildingSupplyData[];
  products?: BuildingProductData[];
  compInputs?: CompInputData[];
  warehouseWares?: WarehouseWareData[];
}> {
  let inspector = getActiveInspector(ctx, x, y);

  // Fallback: create an inspector on-the-fly when none exists
  // (happens when building was loaded via the legacy full-fetch path).
  if (!inspector) {
    ctx.log.debug(`[BuildingDetails] Creating on-demand inspector for (${x},${y}), tab=${tabId}`);
    inspector = await createInspectorForBuilding(ctx, x, y, visualClass || '0');
  }

  const { tempObjectId, mutex, gateMap } = inspector;
  const release = await mutex.acquire();

  try {
    ctx.log.debug(`[BuildingDetails] Tab data for (${x},${y}), tab=${tabId}`);

    if (tabId === 'supplies' && inspector.hasSupplies) {
      let supplyPaths = await getSupplyPaths(ctx, tempObjectId);
      // Warehouses: skip disabled gates (GateMap bit = '0') to avoid unnecessary RDO calls
      if (inspector.isWarehouse && gateMap) {
        supplyPaths = supplyPaths.filter((_, i) => i < gateMap.length && gateMap[i] === '1');
      }
      const workerCount = computeWorkerCount(supplyPaths.length);
      const semaphore = new Semaphore(MAX_GLOBAL_CONCURRENT_RDO);
      let supplies: BuildingSupplyData[];

      if (workerCount <= 1) {
        // Single worker: use the inspector's own temp object (no pool overhead)
        supplies = [];
        for (const { path, name } of supplyPaths) {
          try {
            const detail = await fetchSupplyDetails(ctx, tempObjectId, path, name);
            if (detail) supplies.push(detail);
          } catch (e: unknown) {
            ctx.log.warn(`[BuildingDetails] Error fetching supply ${path}:`, toErrorMessage(e));
          }
        }
      } else {
        // Multiple workers: create fresh temp objects for parallel fetching
        ctx.log.debug(`[BuildingDetails] Using ${workerCount} workers for ${supplyPaths.length} supply paths`);
        const workers = await createWorkerPool(ctx, x, y, workerCount);
        try {
          supplies = await fetchPathsWithPool(ctx, workers, supplyPaths, semaphore, fetchSupplyDetailsPooled);
        } finally {
          closeWorkerPool(ctx, workers);
        }
      }

      // For warehouses, also return warehouseWares so the client can filter
      // supplies by GateMap (only show enabled wares).
      if (inspector.isWarehouse) {
        const warehouseWares = await getWarehouseWareNames(ctx, tempObjectId, gateMap);
        return { supplies, warehouseWares };
      }
      return { supplies };
    }

    if (tabId === 'products' && inspector.hasProducts) {
      let productPaths = await getProductPaths(ctx, tempObjectId);
      // Warehouses: skip disabled gates (GateMap bit = '0') to avoid unnecessary RDO calls
      if (inspector.isWarehouse && gateMap) {
        productPaths = productPaths.filter((_, i) => i < gateMap.length && gateMap[i] === '1');
      }
      const workerCount = computeWorkerCount(productPaths.length);
      const semaphore = new Semaphore(MAX_GLOBAL_CONCURRENT_RDO);
      let products: BuildingProductData[];

      if (workerCount <= 1) {
        // Single worker: use the inspector's own temp object (no pool overhead)
        products = [];
        for (const { path, name } of productPaths) {
          try {
            const detail = await fetchProductDetails(ctx, tempObjectId, path, name);
            if (detail) products.push(detail);
          } catch (e: unknown) {
            ctx.log.warn(`[BuildingDetails] Error fetching product ${path}:`, toErrorMessage(e));
          }
        }
      } else {
        // Multiple workers: create fresh temp objects for parallel fetching
        ctx.log.debug(`[BuildingDetails] Using ${workerCount} workers for ${productPaths.length} product paths`);
        const workers = await createWorkerPool(ctx, x, y, workerCount);
        try {
          products = await fetchPathsWithPool(ctx, workers, productPaths, semaphore, fetchProductDetailsPooled);
        } finally {
          closeWorkerPool(ctx, workers);
        }
      }

      // For warehouses, also return warehouseWares so the client can filter
      // products by GateMap (only show enabled wares).
      if (inspector.isWarehouse) {
        const warehouseWares = await getWarehouseWareNames(ctx, tempObjectId, gateMap);
        return { products, warehouseWares };
      }
      return { products };
    }

    if (tabId === 'compInputs' && inspector.hasCompInputs) {
      const compInputs = await fetchCompInputData(ctx, tempObjectId);
      return { compInputs };
    }

    // whGeneral warehouseWares is now fetched eagerly in getBuildingBasicDetails.
    // No lazy handler needed — fall through to empty return.

    // Tab doesn't need lazy data (already in basic response)
    return {};
  } finally {
    release();
  }
}

/**
 * Lightweight refresh: re-read building-level properties on the SAME
 * Delphi temp object. Does NOT create a new temp object, does NOT call
 * cacherSetObject or cacherCreateObject. Matches the Delphi client's
 * TObjectInspectorContainer.Refresh behavior.
 *
 * Falls back to getBuildingBasicDetails() if no ActiveInspector exists
 * (e.g., first load or after session reconnect).
 */
export async function refreshBuildingProperties(
  ctx: SessionContext,
  x: number,
  y: number,
  visualClass: string,
  activeTabId?: string,
): Promise<BuildingDetailsResponse> {
  const inspector = getActiveInspector(ctx, x, y);

  if (!inspector) {
    ctx.log.debug(`[BuildingDetails] No active inspector for (${x},${y}), falling back to full fetch`);
    return getBuildingBasicDetails(ctx, x, y, visualClass);
  }

  ctx.log.debug(`[BuildingDetails] Refreshing properties on existing inspector obj=${inspector.tempObjectId} at (${x},${y})${activeTabId ? ` [tab=${activeTabId}]` : ''}`);

  const template = getTemplateForVisualClass(visualClass);
  const { tempObjectId, mutex } = inspector;

  // Acquire the inspector's mutex to prevent concurrent SetPath calls from
  // getBuildingTabData() corrupting the temp object's path context.
  const release = await mutex.acquire();

  try {
    // Reset the temp object back to building root. A previous tab data request
    // (supplies/products) may have called SetPath, leaving the object pointed
    // at a supply gate sub-path. Without this reset, GetPropertyList reads
    // from the wrong context and returns empty/wrong building properties.
    await ctx.cacherSetObject(tempObjectId, x, y);

    // R1: Tab-scoped refresh — only fetch properties for the active tab + overview.
    // Lazy tabs (supplies, products, compInputs) are excluded: they use SetPath-based
    // fetching which is handled separately by getBuildingTabData().
    const LAZY_SPECIALS = new Set(['supplies', 'products', 'compInputs']);
    const isLazyTab = activeTabId && template.groups.some(
      g => g.id === activeTabId && g.special && LAZY_SPECIALS.has(g.special)
    );
    const useTabScoped = activeTabId && !isLazyTab && template.groups.length > 2;
    const collected = useTabScoped
      ? collectTemplatePropertyNamesForGroups(template, [activeTabId])
      : undefined;

    const { allValues, groups, moneyGraph } = await fetchPropertiesAndGroups(ctx, tempObjectId, template, collected);

    // Enrich votes tab
    await enrichVotesTab(ctx, groups, allValues);

    // Update GateMap in the inspector (may have changed via RDOSelectWare)
    inspector.gateMap = allValues.get('GateMap') || inspector.gateMap;

    // Re-read building name/owner — skip SwitchFocusEx when already focused
    // (avoids timeout when server is busy with trade route recalculation)
    let buildingName = '';
    let ownerName = '';
    let buildingId = '';
    const alreadyFocused =
      ctx.currentFocusedCoords?.x === x && ctx.currentFocusedCoords?.y === y;
    if (alreadyFocused && ctx.currentFocusedBuildingId) {
      buildingId = ctx.currentFocusedBuildingId;
      buildingName = ctx.currentFocusedBuildingName ?? '';
      ownerName = ctx.currentFocusedOwnerName ?? '';
    } else {
      try {
        const focusInfo = await ctx.focusBuilding(x, y);
        buildingName = focusInfo.buildingName;
        ownerName = focusInfo.ownerName;
        buildingId = focusInfo.buildingId;
      } catch {
        // Use values from allValues as fallback
      }
    }

    const response: BuildingDetailsResponse = {
      buildingId: buildingId || allValues.get('ObjectId') || allValues.get('CurrBlock') || '',
      x,
      y,
      visualClass,
      templateName: template.name,
      buildingName,
      ownerName,
      securityId: allValues.get('SecurityId') || '',
      tabs: template.groups.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon || '',
        order: g.order,
        special: g.special,
        handlerName: g.handlerName || '',
      })),
      groups,
      // Lazy fields: NOT fetched — client carry-forward preserves them
      supplies: undefined,
      products: undefined,
      compInputs: undefined,
      warehouseWares: undefined,
      moneyGraph,
      timestamp: Date.now(),
      // R1: Signal which groups were refreshed so the client can merge
      refreshedGroups: useTabScoped ? Object.keys(groups) : undefined,
    };

    return response;
  } catch (e: unknown) {
    ctx.log.warn(`[BuildingDetails] Refresh failed on existing object, falling back to full create:`, toErrorMessage(e));
    releaseInspector(ctx);
    return getBuildingBasicDetails(ctx, x, y, visualClass);
  } finally {
    release();
  }
}

// =========================================================================
// PRIVATE HELPERS
// =========================================================================

/**
 * Full building details implementation — fetches properties, supplies,
 * products, and company inputs via the cacher object pool.
 * Legacy path: loads everything in one shot, closes temp object when done.
 */
async function getBuildingDetailsImpl(
  ctx: SessionContext,
  x: number,
  y: number,
  visualClass: string
): Promise<BuildingDetailsResponse> {
  ctx.log.debug(`[BuildingDetails] Fetching details for building at (${x}, ${y}), visualClass: ${visualClass}`);

  const template = getTemplateForVisualClass(visualClass);

  let buildingName = '';
  let ownerName = '';
  let buildingId = '';
  try {
    const focusInfo = await ctx.focusBuilding(x, y);
    buildingName = focusInfo.buildingName;
    ownerName = focusInfo.ownerName;
    buildingId = focusInfo.buildingId;
  } catch (e: unknown) {
    ctx.log.warn(`[BuildingDetails] Could not focus building:`, e);
  }

  await ctx.connectMapService();
  if (!ctx.cacherId) {
    throw new Error('Map service not initialized');
  }

  const tempObjectId = await ctx.cacherCreateObject();

  try {
    await ctx.cacherSetObject(tempObjectId, x, y);

    // Phase 1+2: Fetch properties and build groups
    const { allValues, groups, moneyGraph } = await fetchPropertiesAndGroups(ctx, tempObjectId, template);

    // Enrich votes tab
    await enrichVotesTab(ctx, groups, allValues);

    // Phase 3: Collect supply/product paths while object still points at building.
    const suppliesGroup = template.groups.find(g => g.special === 'supplies');
    const productsGroup = template.groups.find(g => g.special === 'products');
    const compInputsGroup = template.groups.find(g => g.special === 'compInputs');
    const isWarehouse = template.groups.some(g => g.id === 'whGeneral');

    const supplyPaths = suppliesGroup ? await getSupplyPaths(ctx, tempObjectId) : [];
    const productPaths = productsGroup ? await getProductPaths(ctx, tempObjectId) : [];
    const compInputs = compInputsGroup ? await fetchCompInputData(ctx, tempObjectId) : undefined;
    const warehouseWares = isWarehouse
      ? await getWarehouseWareNames(ctx, tempObjectId, allValues.get('GateMap') || '')
      : undefined;

    // Phase 4: Iterate supply/product paths using SetPath on the SAME object.
    let supplies: BuildingSupplyData[] | undefined;
    if (supplyPaths.length > 0) {
      supplies = [];
      for (const { path, name } of supplyPaths) {
        try {
          const detail = await fetchSupplyDetails(ctx, tempObjectId, path, name);
          if (detail) supplies.push(detail);
        } catch (e: unknown) {
          ctx.log.warn(`[BuildingDetails] Error fetching supply ${path}:`, e);
        }
      }
    }

    let products: BuildingProductData[] | undefined;
    if (productPaths.length > 0) {
      products = [];
      for (const { path, name } of productPaths) {
        try {
          const detail = await fetchProductDetails(ctx, tempObjectId, path, name);
          if (detail) products.push(detail);
        } catch (e: unknown) {
          ctx.log.warn(`[BuildingDetails] Error fetching product ${path}:`, e);
        }
      }
    }

    return {
      buildingId: buildingId || allValues.get('ObjectId') || allValues.get('CurrBlock') || '',
      x,
      y,
      visualClass,
      templateName: template.name,
      buildingName,
      ownerName,
      securityId: allValues.get('SecurityId') || '',
      tabs: template.groups.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon || '',
        order: g.order,
        special: g.special,
        handlerName: g.handlerName || '',
      })),
      groups,
      supplies,
      products,
      compInputs,
      warehouseWares,
      moneyGraph,
      timestamp: Date.now(),
    };

  } finally {
    await ctx.cacherCloseObject(tempObjectId);
  }
}

// =========================================================================
// SHARED HELPERS — used by both legacy getBuildingDetailsImpl and lazy paths
// =========================================================================

/**
 * Phase 1+2: Fetch all template properties (regular + indexed) and build
 * grouped response. Returns the raw allValues map, groups dict, and moneyGraph.
 */
async function fetchPropertiesAndGroups(
  ctx: SessionContext,
  tempObjectId: string,
  template: ReturnType<typeof getTemplateForVisualClass>,
  preCollected?: CollectedPropertyNames,
): Promise<{
  allValues: Map<string, string>;
  groups: { [groupId: string]: BuildingPropertyValue[] };
  moneyGraph: number[] | undefined;
}> {
  const collected = preCollected ?? collectTemplatePropertyNamesStructured(template);
  const allValues = new Map<string, string>();
  const BATCH_SIZE = 50;

  // Phase 1: Fetch regular properties and count properties
  const phase1Props = [...collected.regularProperties, ...collected.countProperties];

  for (let i = 0; i < phase1Props.length; i += BATCH_SIZE) {
    const batch = phase1Props.slice(i, i + BATCH_SIZE);
    const values = await ctx.cacherGetPropertyList(tempObjectId, batch);

    for (let j = 0; j < batch.length; j++) {
      const value = j < values.length ? values[j] : '';
      if (value !== 'error') {
        allValues.set(batch[j], value);
      }
    }
  }

  ctx.log.debug(`[BuildingDetails] Phase 1 done (${allValues.size} values, ${collected.countProperties.length} count props, groups=${template.groups.length})`);

  // Phase 2: Fetch indexed properties based on count values
  const indexedProps: string[] = [];
  const countValues = new Map<string, number>();

  for (const countProp of collected.countProperties) {
    const countStr = allValues.get(countProp);
    const count = countStr ? parseInt(countStr, 10) : 0;
    countValues.set(countProp, count);
    ctx.log.debug(`[BuildingDetails] Count: ${countProp} = "${countStr}" (parsed: ${count})`);
    if (count > 50) {
      ctx.log.warn(`[BuildingDetails] Unusually high count: ${countProp} = ${count}`);
    }

    const indexedDefs = collected.indexedByCount.get(countProp) || [];
    for (const def of indexedDefs) {
      const suffix = def.indexSuffix || '';

      if (def.columns) {
        for (const col of def.columns) {
          const colSuffix = col.indexSuffix !== undefined ? col.indexSuffix : suffix;
          for (let idx = 0; idx < count; idx++) {
            indexedProps.push(`${col.rdoSuffix}${idx}${col.columnSuffix || ''}${colSuffix}`);
          }
        }
      } else {
        for (let idx = 0; idx < count; idx++) {
          indexedProps.push(`${def.rdoName}${idx}${suffix}`);
          if (def.maxProperty) {
            indexedProps.push(`${def.maxProperty}${idx}${suffix}`);
          }
        }
      }
    }
  }

  if (indexedProps.length > 0) {
    ctx.log.debug(`[BuildingDetails] Fetching ${indexedProps.length} indexed properties: ${indexedProps.slice(0, 20).join(', ')}${indexedProps.length > 20 ? '...' : ''}`);
    for (let i = 0; i < indexedProps.length; i += BATCH_SIZE) {
      const batch = indexedProps.slice(i, i + BATCH_SIZE);
      const values = await ctx.cacherGetPropertyList(tempObjectId, batch);

      for (let j = 0; j < batch.length; j++) {
        const value = j < values.length ? values[j] : '';
        if (value !== 'error') {
          allValues.set(batch[j], value);
          if (batch[j].startsWith('srv')) {
            ctx.log.debug(`[BuildingDetails] TABLE: ${batch[j]} = "${value}"`);
          }
        }
      }
    }
  }

  // Build response grouped by tabs
  const groups: { [groupId: string]: BuildingPropertyValue[] } = {};

  for (const group of template.groups) {
    const groupValues: BuildingPropertyValue[] = [];
    const includedCountProps = new Set<string>();

    for (const prop of group.properties) {
      const suffix = prop.indexSuffix || '';

      if (prop.type === 'WORKFORCE_TABLE') {
        for (let i = 0; i < 3; i++) {
          const workerProps = [
            `Workers${i}`, `WorkersMax${i}`, `WorkersK${i}`,
            `Salaries${i}`, `WorkForcePrice${i}`,
          ];
          for (const propName of workerProps) {
            const value = allValues.get(propName);
            if (value !== undefined) {
              groupValues.push({ name: propName, value, index: i });
            }
          }
        }
        continue;
      }

      if ((prop.type === 'TABLE' || prop.type === 'SERVICE_CARDS') && prop.columns && prop.countProperty) {
        const count = countValues.get(prop.countProperty) || 0;
        const countVal = allValues.get(prop.countProperty);
        if (countVal !== undefined) {
          groupValues.push({ name: prop.countProperty, value: countVal });
        }
        for (let idx = 0; idx < count; idx++) {
          for (const col of prop.columns) {
            const colSuffix = col.indexSuffix !== undefined ? col.indexSuffix : suffix;
            const colName = `${col.rdoSuffix}${idx}${col.columnSuffix || ''}${colSuffix}`;
            const colValue = allValues.get(colName);
            if (colValue !== undefined) {
              groupValues.push({ name: colName, value: colValue, index: idx });
            }
          }
        }
      } else if (prop.indexed && prop.countProperty) {
        const count = countValues.get(prop.countProperty) || 0;

        if (!includedCountProps.has(prop.countProperty)) {
          includedCountProps.add(prop.countProperty);
          const countVal = allValues.get(prop.countProperty);
          if (countVal !== undefined) {
            groupValues.push({ name: prop.countProperty, value: countVal });
          }
        }

        for (let idx = 0; idx < count; idx++) {
          const propName = `${prop.rdoName}${idx}${suffix}`;
          const value = allValues.get(propName);
          if (value !== undefined) {
            groupValues.push({ name: propName, value, index: idx });
          }
          if (prop.maxProperty) {
            const maxPropName = `${prop.maxProperty}${idx}${suffix}`;
            const maxValue = allValues.get(maxPropName);
            if (maxValue !== undefined) {
              groupValues.push({ name: maxPropName, value: maxValue, index: idx });
            }
          }
        }
      } else if (prop.indexed) {
        for (let idx = 0; idx < 10; idx++) {
          const propName = `${prop.rdoName}${idx}${suffix}`;
          const value = allValues.get(propName);
          if (value !== undefined) {
            groupValues.push({ name: propName, value, index: idx });
            if (prop.maxProperty) {
              const maxPropName = `${prop.maxProperty}${idx}${suffix}`;
              const maxValue = allValues.get(maxPropName);
              if (maxValue !== undefined) {
                groupValues.push({ name: maxPropName, value: maxValue, index: idx });
              }
            }
          }
        }
      } else {
        const value = allValues.get(prop.rdoName);
        if (value !== undefined) {
          groupValues.push({ name: prop.rdoName, value });
          if (prop.maxProperty) {
            const maxValue = allValues.get(prop.maxProperty);
            if (maxValue !== undefined) {
              groupValues.push({ name: prop.maxProperty, value: maxValue });
            }
          }
        }
      }
    }

    if (groupValues.length > 0) {
      groups[group.id] = groupValues;
    }
  }

  // Parse money graph
  let moneyGraph: number[] | undefined;
  const moneyGraphInfo = allValues.get('MoneyGraphInfo');
  if (moneyGraphInfo) {
    moneyGraph = parseMoneyGraph(moneyGraphInfo);
  }

  return { allValues, groups, moneyGraph };
}

/**
 * Enrich votes tab with VoteOf (requires separate RDO call on CurrBlock).
 */
async function enrichVotesTab(
  ctx: SessionContext,
  groups: { [groupId: string]: BuildingPropertyValue[] },
  allValues: Map<string, string>,
): Promise<void> {
  if (!groups['votes']) return;

  const currBlock = allValues.get('CurrBlock');
  const username = ctx.activeUsername || ctx.cachedUsername || '';
  if (!currBlock || !username) return;

  try {
    if (!ctx.getSocket('construction')) {
      await ctx.connectConstructionService();
    }
    const voteOfPacket = await ctx.sendRdoRequest('construction', {
      verb: RdoVerb.SEL,
      targetId: currBlock,
      action: RdoAction.CALL,
      member: 'RDOVoteOf',
      separator: '"^"',
      args: [RdoValue.string(username).format()],
    });
    const votedFor = parsePropertyResponseHelper(voteOfPacket.payload || '', 'res');
    if (votedFor) {
      groups['votes'].push({ name: 'VoteOf', value: votedFor });
    }
  } catch (e: unknown) {
    ctx.log.debug(`[BuildingDetails] VoteOf enrichment failed: ${toErrorMessage(e)}`);
  }
}

/**
 * Parse MoneyGraphInfo into array of numbers.
 * Format: "count,val1,val2,val3,..."
 */
function parseMoneyGraph(graphInfo: string): number[] {
  const parts = graphInfo.split(',');
  if (parts.length < 2) return [];

  const values: number[] = [];
  // Skip first value (count), parse rest as numbers
  for (let i = 1; i < parts.length; i++) {
    const num = parseFloat(parts[i]);
    if (!isNaN(num)) {
      values.push(num);
    }
  }

  return values;
}

/**
 * Collect supply/input paths from GetInputNames (requires object pointed at building).
 * Returns parsed entries without creating new objects.
 */
async function getSupplyPaths(
  ctx: SessionContext,
  tempObjectId: string
): Promise<Array<{ path: string; name: string }>> {
  const inputNamesPacket = await ctx.sendRdoRequest('map', {
    verb: RdoVerb.SEL,
    targetId: tempObjectId,
    action: RdoAction.CALL,
    member: 'GetInputNames',
    args: ['0', '0'], // index=0, language=0 (English)
  });

  const inputNamesRaw = cleanPayloadHelper(inputNamesPacket.payload || '');
  if (!inputNamesRaw || inputNamesRaw === '0' || inputNamesRaw === '-1') {
    return [];
  }

  // Parse input names (format: "path::\nname\r\n" separated entries)
  // split('\r') then trim() strips leading '\n' from entries 2+ (CRLF separators)
  const entries = inputNamesRaw.split('\r').map(e => e.trim()).filter(Boolean);
  const result: Array<{ path: string; name: string }> = [];

  for (const entry of entries) {
    const colonIdx = entry.indexOf(':');
    if (colonIdx === -1) continue;

    const path = entry.substring(0, colonIdx);
    // Skip 2 chars after colon, then read name until null
    let name = entry.substring(colonIdx + 3);
    const nullIdx = name.indexOf('\0');
    if (nullIdx !== -1) {
      name = name.substring(0, nullIdx);
    }
    result.push({ path, name });
  }
  return result;
}

/**
 * Fetch warehouse ware names via InputCount + Input{i}.0 indexed properties.
 * These cached properties contain the MLS fluid name for each warehouse gate.
 * Combined with GateMap binary string to produce WarehouseWareData[].
 *
 * Archaeology: Kernel.pas:5840-5854 — WriteString('Input' + i + '.', MetaFluid.Name_MLS)
 * Cache stores: InputCount (integer), Input0.0, Input1.0, ... (English ware names)
 * WHGeneralSheet.pas — clbNames checklist populated from these properties.
 */
async function getWarehouseWareNames(
  ctx: SessionContext,
  tempObjectId: string,
  gateMap: string
): Promise<WarehouseWareData[]> {
  try {
    // First fetch InputCount to know how many wares exist
    const countValues = await ctx.cacherGetPropertyList(tempObjectId, ['InputCount']);
    const inputCount = parseInt(countValues[0] || '0', 10);

    if (inputCount <= 0 || inputCount > 50) {
      ctx.log.debug(`[BuildingDetails] Warehouse InputCount=${inputCount}, skipping ware names`);
      return [];
    }

    // Fetch Input{i}.0 for each ware (MLS suffix .0 = English)
    const nameProps: string[] = [];
    for (let i = 0; i < inputCount; i++) {
      nameProps.push(`Input${i}.0`);
    }

    const nameValues = await ctx.cacherGetPropertyList(tempObjectId, nameProps);
    const result: WarehouseWareData[] = [];

    for (let i = 0; i < inputCount; i++) {
      const name = nameValues[i] || '';
      result.push({
        name: name || `Ware ${i}`,
        enabled: i < gateMap.length ? gateMap[i] === '1' : false,
        index: i,
      });
    }

    ctx.log.debug(`[BuildingDetails] Warehouse wares: ${result.length} gates, GateMap="${gateMap}"`);
    return result;
  } catch (e: unknown) {
    ctx.log.warn(`[BuildingDetails] Error fetching warehouse ware names:`, toErrorMessage(e));
    return [];
  }
}

/**
 * Run async tasks with bounded concurrency.
 * Delphi server has a global critical section + MAX_BUFFER_SIZE=5,
 * so we limit to 3 concurrent RDO requests to avoid buffer overflow.
 */
const MAX_CONCURRENT_CONNECTIONS = 3;

async function batchedParallel<T>(
  count: number,
  fn: (index: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = new Array(count);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < count) {
      const i = nextIndex++;
      results[i] = await fn(i);
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_CONNECTIONS, count);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

// =========================================================================
// COUNTING SEMAPHORE — limits total concurrent RDO requests across workers
// =========================================================================

/** @internal Exported for testing only. */
export class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

// =========================================================================
// WORKER POOL — parallel supply/product fetching with fresh temp objects
// =========================================================================

/** Max concurrent RDO requests globally across all workers on the map socket. */
const MAX_GLOBAL_CONCURRENT_RDO = 4;

interface WorkerObject {
  tempObjectId: string;
}

/**
 * Determine optimal worker count based on slot count.
 * More workers = more parallelism, but each uses a Delphi temp object.
 */
/** @internal Exported for testing only. */
export function computeWorkerCount(slotCount: number): number {
  if (slotCount <= 3) return 1;
  if (slotCount <= 10) return 2;
  return 3; // max — respect Delphi buffer limits
}

/**
 * Create fresh temp objects pointing at the same building.
 * Each worker gets its own independent Delphi TCachedObjectWrap.
 * Degrades gracefully if CreateObject fails for additional workers.
 */
async function createWorkerPool(
  ctx: SessionContext,
  x: number,
  y: number,
  desiredCount: number,
): Promise<WorkerObject[]> {
  const workers: WorkerObject[] = [];

  for (let i = 0; i < desiredCount; i++) {
    try {
      const tempObjectId = await ctx.cacherCreateObject();
      await ctx.cacherSetObject(tempObjectId, x, y);
      workers.push({ tempObjectId });
    } catch (e: unknown) {
      ctx.log.warn(`[BuildingDetails] Worker ${i} creation failed, continuing with ${workers.length} workers:`, toErrorMessage(e));
      break; // Degrade gracefully — use however many were created
    }
  }

  if (workers.length === 0) {
    throw new Error('Failed to create any worker temp objects');
  }
  return workers;
}

/** Close all worker temp objects (fire-and-forget). */
function closeWorkerPool(ctx: SessionContext, workers: WorkerObject[]): void {
  for (const w of workers) {
    ctx.cacherCloseObject(w.tempObjectId);
  }
}

/**
 * Distribute supply/product paths across worker pool with shared semaphore.
 * Each worker runs SetPath + GetPropertyList on its own temp object.
 * The semaphore caps total concurrent RDO requests to avoid Delphi buffer overflow.
 */
async function fetchPathsWithPool<T>(
  ctx: SessionContext,
  workers: WorkerObject[],
  paths: Array<{ path: string; name: string }>,
  semaphore: Semaphore,
  fetchFn: (ctx: SessionContext, tempObjectId: string, path: string, name: string, semaphore: Semaphore) => Promise<T | null>,
): Promise<T[]> {
  const results: (T | null)[] = new Array(paths.length).fill(null);
  let nextIndex = 0;

  async function workerLoop(workerObj: WorkerObject): Promise<void> {
    while (nextIndex < paths.length) {
      const i = nextIndex++;
      const { path, name } = paths[i];
      try {
        results[i] = await fetchFn(ctx, workerObj.tempObjectId, path, name, semaphore);
      } catch (e: unknown) {
        ctx.log.warn(`[BuildingDetails] Error fetching path ${path}:`, toErrorMessage(e));
      }
    }
  }

  await Promise.all(workers.map((w) => workerLoop(w)));
  return results.filter((r): r is T => r !== null);
}

/**
 * Fetch details for a single supply path.
 * Reuses the caller's tempObjectId via SetPath (no CreateObject/CloseObject).
 * SetPath fully resets TCachedObjectWrap internal state on the Delphi server.
 */
async function fetchSupplyDetails(
  ctx: SessionContext,
  tempObjectId: string,
  path: string,
  name: string
): Promise<BuildingSupplyData | null> {
  // Navigate to supply path (reuses existing object — SetPath resets TCachedObjectWrap state)
  const setPathPacket = await ctx.sendRdoRequest('map', {
    verb: RdoVerb.SEL,
    targetId: tempObjectId,
    action: RdoAction.CALL,
    member: 'SetPath',
    args: [path],
  });
  const setPathResult = cleanPayloadHelper(setPathPacket.payload || '');

  ctx.log.debug(`[BuildingDetails] SetPath('${path}') result: "${setPathResult}"`);
  if (setPathResult !== '-1') return null;

  // Successfully navigated (-1 = Delphi WordBool TRUE), now get properties
  const supplyProps = await ctx.cacherGetPropertyList(tempObjectId, [
    'MetaFluid', 'FluidValue', 'LastCostPerc', 'minK', 'MaxPrice',
    'QPSorted', 'SortMode', 'cnxCount', 'ObjectId'
  ]);

  const connectionCount = parseInt(supplyProps[7] || '0', 10);
  const clampedCount = Math.min(connectionCount, 20);

  // Fetch connection details (conservative parallelism: max 3 concurrent)
  const cnxResults = await batchedParallel(clampedCount, (i) =>
    fetchSubObjectProperties(ctx, tempObjectId, i, [
      `cnxFacilityName${i}`,
      `cnxCreatedBy${i}`,
      `cnxCompanyName${i}`,
      `cnxNfPrice${i}`,
      `OverPriceCnxInfo${i}`,
      `LastValueCnxInfo${i}`,
      `tCostCnxInfo${i}`,
      `cnxQuality${i}`,
      `ConnectedCnxInfo${i}`,
      `cnxXPos${i}`,
      `cnxYPos${i}`,
    ])
  );

  const connections: BuildingConnectionData[] = [];
  for (const cnxProps of cnxResults) {
    if (cnxProps.length >= 11) {
      connections.push({
        facilityName: cnxProps[0] || '',
        createdBy: cnxProps[1] || '',
        companyName: cnxProps[2] || '',
        price: cnxProps[3] || '0',
        overprice: cnxProps[4] || '0',
        lastValue: cnxProps[5] || '',
        cost: cnxProps[6] || '$0',
        quality: cnxProps[7] || '0%',
        connected: cnxProps[8] === '1',
        x: parseInt(cnxProps[9] || '0', 10),
        y: parseInt(cnxProps[10] || '0', 10),
      });
    }
  }

  return {
    path,
    name,
    metaFluid: supplyProps[0] || '',
    fluidValue: supplyProps[1] || '',
    lastCostPerc: supplyProps[2] || undefined,
    minK: supplyProps[3] || undefined,
    maxPrice: supplyProps[4] || undefined,
    qpSorted: supplyProps[5] || undefined,
    sortMode: supplyProps[6] || undefined,
    connectionCount,
    connections,
  };
}

/**
 * Fetch company input data (compInputs tab).
 * Protocol: GetPropertyList cInputCount -> batch GetPropertyList cInput{i}.* for all inputs.
 * Handler: compInputs (CompanyServicesSheetForm.pas)
 *
 * Wire format:
 *   C sel <id> call GetPropertyList "^" "%...\tcInputCount\t";
 *   C sel <id> call GetPropertyList "^" "%cInput0.0\tcInputSup0\tcInputDem0\tcInputRatio0\tcInputMax0\tcEditable0\tcUnits0.0\t...";
 */
async function fetchCompInputData(ctx: SessionContext, tempObjectId: string): Promise<CompInputData[]> {
  const result: CompInputData[] = [];

  try {
    // Step 1: get count
    const countProps = await ctx.cacherGetPropertyList(tempObjectId, ['cInputCount']);
    const count = parseInt(countProps[0] || '0', 10);
    if (count <= 0) return result;

    // Step 2: batch all 7 indexed properties per input (max 50 props per batch = ~7 inputs)
    const BATCH_SIZE = 49; // keep under 50-prop limit
    const propNames: string[] = [];
    for (let i = 0; i < count; i++) {
      propNames.push(
        `cInput${i}.0`,
        `cInputSup${i}`,
        `cInputDem${i}`,
        `cInputRatio${i}`,
        `cInputMax${i}`,
        `cEditable${i}`,
        `cUnits${i}.0`,
      );
    }

    // Fetch in batches of BATCH_SIZE properties
    const allValues: string[] = [];
    for (let offset = 0; offset < propNames.length; offset += BATCH_SIZE) {
      const batch = propNames.slice(offset, offset + BATCH_SIZE);
      const vals = await ctx.cacherGetPropertyList(tempObjectId, batch);
      allValues.push(...vals);
    }

    // Step 3: parse into CompInputData objects (7 props per input)
    for (let i = 0; i < count; i++) {
      const base = i * 7;
      result.push({
        name:      allValues[base]     ?? '',
        supplied:  parseFloat(allValues[base + 1] || '0'),
        demanded:  parseFloat(allValues[base + 2] || '0'),
        ratio:     parseInt(allValues[base + 3]   || '0', 10),
        maxDemand: parseInt(allValues[base + 4]   || '100', 10),
        editable:  (allValues[base + 5] ?? '').toLowerCase() === 'yes',
        units:     allValues[base + 6] ?? '',
      });
    }
  } catch (e: unknown) {
    ctx.log.warn('[BuildingDetails] Error fetching comp input data:', e);
  }

  return result;
}

/**
 * Collect product/output paths from GetOutputNames (requires object pointed at building).
 * Returns parsed entries without creating new objects.
 */
async function getProductPaths(
  ctx: SessionContext,
  tempObjectId: string
): Promise<Array<{ path: string; name: string }>> {
  const outputNamesPacket = await ctx.sendRdoRequest('map', {
    verb: RdoVerb.SEL,
    targetId: tempObjectId,
    action: RdoAction.CALL,
    member: 'GetOutputNames',
    args: ['0', '0'], // index=0, language=0 (English)
  });

  const outputNamesRaw = cleanPayloadHelper(outputNamesPacket.payload || '');
  if (!outputNamesRaw || outputNamesRaw === '0' || outputNamesRaw === '-1') {
    return [];
  }

  // Parse output names (format: "path::\nname\r\n" separated entries — same as inputs)
  // split('\r') then trim() strips leading '\n' from entries 2+ (CRLF separators)
  const entries = outputNamesRaw.split('\r').map(e => e.trim()).filter(Boolean);
  const result: Array<{ path: string; name: string }> = [];

  for (const entry of entries) {
    const colonIdx = entry.indexOf(':');
    if (colonIdx === -1) continue;

    const path = entry.substring(0, colonIdx);
    // Skip 2 chars after colon (:: separator), then read name until null
    let name = entry.substring(colonIdx + 3);
    const nullIdx = name.indexOf('\0');
    if (nullIdx !== -1) {
      name = name.substring(0, nullIdx);
    }
    result.push({ path, name });
  }
  return result;
}

/**
 * Fetch details for a single product/output path.
 * Reuses the caller's tempObjectId via SetPath (no CreateObject/CloseObject).
 * SetPath fully resets TCachedObjectWrap internal state on the Delphi server.
 */
async function fetchProductDetails(
  ctx: SessionContext,
  tempObjectId: string,
  path: string,
  name: string
): Promise<BuildingProductData | null> {
  // Navigate to output path (reuses existing object — SetPath resets TCachedObjectWrap state)
  const setPathPacket = await ctx.sendRdoRequest('map', {
    verb: RdoVerb.SEL,
    targetId: tempObjectId,
    action: RdoAction.CALL,
    member: 'SetPath',
    args: [path],
  });

  const setPathResult = cleanPayloadHelper(setPathPacket.payload || '');
  ctx.log.debug(`[BuildingDetails] Product SetPath('${path}') result: "${setPathResult}"`);
  if (setPathResult !== '-1') return null;

  // Successfully navigated (-1 = Delphi WordBool TRUE) — fetch output gate properties
  const outputProps = await ctx.cacherGetPropertyList(tempObjectId, [
    'MetaFluid', 'LastFluid', 'FluidQuality', 'PricePc',
    'AvgPrice', 'MarketPrice', 'cnxCount'
  ]);

  const connectionCount = parseInt(outputProps[6] || '0', 10);
  const clampedCount = Math.min(connectionCount, 20);

  // Fetch connection details (conservative parallelism: max 3 concurrent)
  const cnxResults = await batchedParallel(clampedCount, (i) =>
    fetchSubObjectProperties(ctx, tempObjectId, i, [
      `cnxFacilityName${i}`,
      `cnxCompanyName${i}`,
      `LastValueCnxInfo${i}`,
      `ConnectedCnxInfo${i}`,
      `tCostCnxInfo${i}`,
      `cnxXPos${i}`,
      `cnxYPos${i}`,
    ])
  );

  const connections: BuildingConnectionData[] = [];
  for (const cnxProps of cnxResults) {
    if (cnxProps.length >= 7) {
      connections.push({
        facilityName: cnxProps[0] || '',
        companyName: cnxProps[1] || '',
        createdBy: '',
        price: '',
        overprice: '',
        lastValue: cnxProps[2] || '',
        cost: cnxProps[4] || '',
        quality: '',
        connected: cnxProps[3] === '1',
        x: parseInt(cnxProps[5] || '0', 10),
        y: parseInt(cnxProps[6] || '0', 10),
      });
    }
  }

  return {
    path,
    name,
    metaFluid: outputProps[0] || '',
    lastFluid: outputProps[1] || '',
    quality: outputProps[2] || '',
    pricePc: outputProps[3] || '',
    avgPrice: outputProps[4] || '',
    marketPrice: outputProps[5] || '',
    connectionCount,
    connections,
  };
}

// =========================================================================
// POOLED WRAPPERS — gate RDO calls through shared semaphore
// =========================================================================

/**
 * Semaphore-gated supply fetch for worker pool.
 * Acquires the semaphore before SetPath + GetPropertyList, releases after.
 * Connection details within the slot still use batchedParallel(3) but are
 * gated by the same semaphore to respect Delphi MAX_BUFFER_SIZE.
 */
async function fetchSupplyDetailsPooled(
  ctx: SessionContext,
  tempObjectId: string,
  path: string,
  name: string,
  semaphore: Semaphore,
): Promise<BuildingSupplyData | null> {
  await semaphore.acquire();
  try {
    return await fetchSupplyDetails(ctx, tempObjectId, path, name);
  } finally {
    semaphore.release();
  }
}

/** Semaphore-gated product fetch for worker pool. */
async function fetchProductDetailsPooled(
  ctx: SessionContext,
  tempObjectId: string,
  path: string,
  name: string,
  semaphore: Semaphore,
): Promise<BuildingProductData | null> {
  await semaphore.acquire();
  try {
    return await fetchProductDetails(ctx, tempObjectId, path, name);
  } finally {
    semaphore.release();
  }
}

/**
 * Fetch sub-object properties (for indexed connections).
 */
async function fetchSubObjectProperties(
  ctx: SessionContext,
  tempObjectId: string,
  subIndex: number,
  propertyNames: string[]
): Promise<string[]> {
  try {
    const query = propertyNames.join('\t') + '\t';
    const packet = await ctx.sendRdoRequest('map', {
      verb: RdoVerb.SEL,
      targetId: tempObjectId,
      action: RdoAction.CALL,
      member: 'GetSubObjectProps',
      args: [subIndex.toString(), query],
    });

    const raw = cleanPayloadHelper(packet.payload || '');
    if (raw.includes('\t')) {
      return raw.split('\t').map(v => v.trim());
    }
    return raw.split(/\s+/).map(v => v.trim()).filter(v => v.length > 0);
  } catch (e: unknown) {
    ctx.log.warn(`[BuildingDetails] Error fetching sub-object ${subIndex}:`, e);
    return [];
  }
}
