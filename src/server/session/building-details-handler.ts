/**
 * Building details handler — extracted from StarpeaceSession.
 *
 * Every public function takes `ctx: SessionContext` as its first argument.
 * Private helpers (`parseMoneyGraph`, `getSupplyPaths`, `fetchSupplyDetails`,
 * `fetchCompInputData`, `getProductPaths`, `fetchProductDetails`,
 * `fetchSubObjectProperties`) are module-private functions (not exported).
 */

import type { SessionContext } from './session-context';
import type {
  BuildingDetailsResponse,
  BuildingPropertyValue,
  BuildingSupplyData,
  BuildingProductData,
  BuildingConnectionData,
  CompInputData,
} from '../../shared/types';
import { RdoVerb, RdoAction } from '../../shared/types';
import {
  getTemplateForVisualClass,
  collectTemplatePropertyNamesStructured,
} from '../../shared/building-details';
import { cleanPayload as cleanPayloadHelper, parsePropertyResponse as parsePropertyResponseHelper } from '../rdo-helpers';
import { RdoValue } from '../../shared/rdo-types';
import { toErrorMessage } from '../../shared/error-utils';

// =========================================================================
// PUBLIC API
// =========================================================================

/**
 * Get building details with deduplication of concurrent requests.
 * The client fires speculative prefetch, event refresh, and retry requests
 * that can create 10+ concurrent calls — each spawning temp objects and
 * product queries on the Delphi server. Return the same promise instead.
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

// =========================================================================
// PRIVATE HELPERS
// =========================================================================

/**
 * Full building details implementation — fetches properties, supplies,
 * products, and company inputs via the cacher object pool.
 */
async function getBuildingDetailsImpl(
  ctx: SessionContext,
  x: number,
  y: number,
  visualClass: string
): Promise<BuildingDetailsResponse> {
  ctx.log.debug(`[BuildingDetails] Fetching details for building at (${x}, ${y}), visualClass: ${visualClass}`);

  // Get template for this building type
  const template = getTemplateForVisualClass(visualClass);
  ctx.log.debug(`[BuildingDetails] Using template: ${template.name}`);

  // First, get basic building info via focusBuilding (this always works)
  let buildingName = '';
  let ownerName = '';
  let buildingId = '';
  try {
    const focusInfo = await ctx.focusBuilding(x, y);
    buildingName = focusInfo.buildingName;
    ownerName = focusInfo.ownerName;
    buildingId = focusInfo.buildingId;
    ctx.log.debug(`[BuildingDetails] Focus info: name="${buildingName}", owner="${ownerName}"`);
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
    // Set object to the building coordinates
    await ctx.cacherSetObject(tempObjectId, x, y);

    // Collect property names with structured output for two-phase fetching
    const collected = collectTemplatePropertyNamesStructured(template);
    const allValues = new Map<string, string>();
    const BATCH_SIZE = 50;

    // Phase 1: Fetch regular properties and count properties
    const phase1Props = [...collected.regularProperties, ...collected.countProperties];

    for (let i = 0; i < phase1Props.length; i += BATCH_SIZE) {
      const batch = phase1Props.slice(i, i + BATCH_SIZE);
      const values = await ctx.cacherGetPropertyList(tempObjectId, batch);

      for (let j = 0; j < batch.length; j++) {
        const value = j < values.length ? values[j] : '';
        // Allow empty strings — server returns '' for unset properties (e.g. blank Name field)
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

		  // Build indexed property names based on actual count
		  const indexedDefs = collected.indexedByCount.get(countProp) || [];
		  for (const def of indexedDefs) {
			const suffix = def.indexSuffix || '';

			if (def.columns) {
			  // TABLE type: columns loop generates all needed property names
			  // (skip base rdoName to avoid duplicates when a column rdoSuffix matches it)
			  for (const col of def.columns) {
				const colSuffix = col.indexSuffix !== undefined ? col.indexSuffix : suffix;
				for (let idx = 0; idx < count; idx++) {
				  indexedProps.push(`${col.rdoSuffix}${idx}${col.columnSuffix || ''}${colSuffix}`);
				}
			  }
			} else {
			  // Non-TABLE indexed property
			  for (let idx = 0; idx < count; idx++) {
				indexedProps.push(`${def.rdoName}${idx}${suffix}`);
				if (def.maxProperty) {
				  indexedProps.push(`${def.maxProperty}${idx}${suffix}`);
				}
			  }
			}
		  }
		}

    // Fetch indexed properties
    if (indexedProps.length > 0) {
      ctx.log.debug(`[BuildingDetails] Fetching ${indexedProps.length} indexed properties: ${indexedProps.slice(0, 20).join(', ')}${indexedProps.length > 20 ? '...' : ''}`);
      for (let i = 0; i < indexedProps.length; i += BATCH_SIZE) {
        const batch = indexedProps.slice(i, i + BATCH_SIZE);
        const values = await ctx.cacherGetPropertyList(tempObjectId, batch);

        for (let j = 0; j < batch.length; j++) {
          const value = j < values.length ? values[j] : '';
          // Allow empty strings — server returns '' for unset properties (e.g. blank Name field)
          if (value !== 'error') {
            allValues.set(batch[j], value);
            // Log TABLE column values for debugging (srvNames/srvPrices/etc.)
            if (batch[j].startsWith('srv')) {
              ctx.log.debug(`[BuildingDetails] TABLE: ${batch[j]} = "${value}"`);
            }
          }
        }
      }
    }

    // Build response grouped by tabs
    // Build response grouped by tabs
		const groups: { [groupId: string]: BuildingPropertyValue[] } = {};

		for (const group of template.groups) {
		  const groupValues: BuildingPropertyValue[] = [];
		  const includedCountProps = new Set<string>();

		  for (const prop of group.properties) {
			const suffix = prop.indexSuffix || '';

			// Handle WORKFORCE_TABLE type specially
			if (prop.type === 'WORKFORCE_TABLE') {
			  // Add all workforce properties for 3 worker classes (0, 1, 2)
			  for (let i = 0; i < 3; i++) {
				const workerProps = [
				  `Workers${i}`,
				  `WorkersMax${i}`,
				  `WorkersK${i}`,
				  `Salaries${i}`,
				  `WorkForcePrice${i}`,
				];

				for (const propName of workerProps) {
				  const value = allValues.get(propName);
				  if (value !== undefined) {
					groupValues.push({
					  name: propName,
					  value: value,
					  index: i,
					});
				  }
				}
			  }
			  continue;
			}

			if ((prop.type === 'TABLE' || prop.type === 'SERVICE_CARDS') && prop.columns && prop.countProperty) {
			  // TABLE/SERVICE_CARDS type: include count + individual column values grouped by row index
			  const count = countValues.get(prop.countProperty) || 0;
			  // Include the count property so the client renderer knows how many rows to render
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
					groupValues.push({
					  name: colName,
					  value: colValue,
					  index: idx,
					});
				  }
				}
			  }
			} else if (prop.indexed && prop.countProperty) {
			  // Handle indexed properties using the count value
			  const count = countValues.get(prop.countProperty) || 0;

			  // Include the count property so the client knows how many items exist
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
				  groupValues.push({
					name: propName,
					value: value,
					index: idx,
				  });
				}

				// Also get max property if defined
				if (prop.maxProperty) {
				  const maxPropName = `${prop.maxProperty}${idx}${suffix}`;
				  const maxValue = allValues.get(maxPropName);
				  if (maxValue !== undefined) {
					groupValues.push({
					  name: maxPropName,
					  value: maxValue,
					  index: idx,
					});
				  }
				}
			  }
			} else if (prop.indexed) {
			  // Indexed without count property - use fixed range (0-9)
			  for (let idx = 0; idx < 10; idx++) {
				const propName = `${prop.rdoName}${idx}${suffix}`;
				const value = allValues.get(propName);

				if (value !== undefined) {
				  groupValues.push({
					name: propName,
					value: value,
					index: idx,
				  });

				  if (prop.maxProperty) {
					const maxPropName = `${prop.maxProperty}${idx}${suffix}`;
					const maxValue = allValues.get(maxPropName);
					if (maxValue !== undefined) {
					  groupValues.push({
						name: maxPropName,
						value: maxValue,
						index: idx,
					  });
					}
				  }
				}
			  }
			} else {
          // Regular property
          const value = allValues.get(prop.rdoName);
          if (value !== undefined) {
            groupValues.push({
              name: prop.rdoName,
              value: value,
            });

            // Also get max property if defined
            if (prop.maxProperty) {
              const maxValue = allValues.get(prop.maxProperty);
              if (maxValue !== undefined) {
                groupValues.push({
                  name: prop.maxProperty,
                  value: maxValue,
                });
              }
            }
          }
        }
      }

      if (groupValues.length > 0) {
        groups[group.id] = groupValues;
      }
    }

    // Enrich votes tab with VoteOf (requires separate RDO call on CurrBlock)
    if (groups['votes']) {
      const currBlock = allValues.get('CurrBlock');
      const username = ctx.activeUsername || ctx.cachedUsername || '';
      if (currBlock && username) {
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
    }

    // Parse money graph if available
    let moneyGraph: number[] | undefined;
    const moneyGraphInfo = allValues.get('MoneyGraphInfo');
    if (moneyGraphInfo) {
      moneyGraph = parseMoneyGraph(moneyGraphInfo);
    }

    // Phase 3: Collect supply/product paths while object still points at building.
    // All building-level queries (GetInputNames, GetOutputNames, compInputs) must
    // complete BEFORE any SetPath calls, since SetPath changes the object's context.
    const suppliesGroup = template.groups.find(g => g.special === 'supplies');
    const productsGroup = template.groups.find(g => g.special === 'products');
    const compInputsGroup = template.groups.find(g => g.special === 'compInputs');

    const supplyPaths = suppliesGroup ? await getSupplyPaths(ctx, tempObjectId) : [];
    const productPaths = productsGroup ? await getProductPaths(ctx, tempObjectId) : [];
    const compInputs = compInputsGroup ? await fetchCompInputData(ctx, tempObjectId) : undefined;

    // Phase 4: Iterate supply/product paths using SetPath on the SAME object.
    // Delphi TCachedObjectWrap.SetPath() fully resets internal state (fProperties,
    // fStream) — no need for CreateObject/SetObject/CloseObject per path.
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
      supplies,
      products,
      compInputs,
      moneyGraph,
      timestamp: Date.now(),
    };

    return response;

  } finally {
    await ctx.cacherCloseObject(tempObjectId);
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
  const connections: BuildingConnectionData[] = [];

  // Fetch connection details
  for (let i = 0; i < connectionCount && i < 20; i++) {
    const cnxProps = await fetchSubObjectProperties(ctx, tempObjectId, i, [
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
    ]);

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
  const connections: BuildingConnectionData[] = [];

  // Fetch connection details (clients/buyers of this output)
  for (let i = 0; i < connectionCount && i < 20; i++) {
    const cnxProps = await fetchSubObjectProperties(ctx, tempObjectId, i, [
      `cnxFacilityName${i}`,
      `cnxCompanyName${i}`,
      `LastValueCnxInfo${i}`,
      `ConnectedCnxInfo${i}`,
      `tCostCnxInfo${i}`,
      `cnxXPos${i}`,
      `cnxYPos${i}`,
    ]);

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
