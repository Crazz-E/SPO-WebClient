/**
 * building-templates-handler.ts — Cluster browsing, building categories/facilities,
 * and building placement (construction).
 *
 * Extracted from StarpeaceSession (spo_session.ts).
 * Each public function takes `ctx: SessionContext` as its first argument.
 */

import type { SessionContext } from './session-context';
import type {
  ClusterInfo,
  ClusterCategory,
  ClusterFacilityPreview,
  BuildingCategory,
  BuildingInfo,
} from '../../shared/types';
import { RdoVerb, RdoAction } from '../../shared/types';
import { RdoValue } from '../../shared/rdo-types';
import { deriveResidenceClass } from '../spo_session';
import fetch from 'node-fetch';

// ===========================================================================
// CLUSTER BROWSING
// ===========================================================================

/**
 * Fetch cluster info (description + category list) from info.asp.
 */
export async function fetchClusterInfo(ctx: SessionContext, clusterName: string): Promise<ClusterInfo> {
  if (!ctx.currentWorldInfo) {
    throw new Error('Not logged into world - cannot fetch cluster info');
  }

  const url = `http://${ctx.currentWorldInfo.ip}/Five/0/Visual/Voyager/NewLogon/info.asp?ClusterName=${encodeURIComponent(clusterName)}`;
  ctx.log.debug(`[ClusterBrowse] Fetching cluster info: ${clusterName}`);

  try {
    const response = await fetch(url, { redirect: 'follow' });
    const html = await response.text();
    return parseClusterInfo(ctx, clusterName, html);
  } catch (e) {
    ctx.log.error(`[ClusterBrowse] Failed to fetch cluster info for ${clusterName}:`, e);
    return { id: clusterName, displayName: clusterName, description: '', categories: [] };
  }
}

/**
 * Parse info.asp HTML to extract cluster description and building categories.
 *
 * HTML structure (from trace):
 *   <div class="sealExpln" ...>description text</div>
 *   <td id="finger0" ... folder="00000002.DissidentsDirectionFacilities.five" ...>
 *     <div class="hiLabel"><nobr>Headquarters</nobr></div>
 *   </td>
 */
function parseClusterInfo(ctx: SessionContext, clusterName: string, html: string): ClusterInfo {
  // Extract display name from cluster attribute on main table
  const clusterAttrMatch = /cluster\s*=\s*["']?([^"'\s>]+)/i.exec(html);
  const displayName = clusterAttrMatch?.[1] || clusterName;

  // Extract description from sealExpln div
  const descMatch = /<div[^>]*class\s*=\s*["']?sealExpln["']?[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  let description = '';
  if (descMatch) {
    description = descMatch[1]
      .replace(/<p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  // Extract categories from finger elements with folder attribute
  const categories: ClusterCategory[] = [];
  const fingerRegex = /<td[^>]*\sfolder\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = fingerRegex.exec(html)) !== null) {
    const folder = match[1];
    const content = match[2];
    const nameMatch = /<nobr>([\s\S]*?)<\/nobr>/i.exec(content);
    const name = nameMatch ? nameMatch[1].trim() : '';
    if (name && folder) {
      categories.push({ name, folder });
    }
  }

  ctx.log.debug(`[ClusterBrowse] Parsed cluster "${clusterName}": ${categories.length} categories`);
  return { id: clusterName, displayName, description, categories };
}

// ===========================================================================
// CLUSTER FACILITY PREVIEWS
// ===========================================================================

/**
 * Fetch facility previews for a cluster/folder from NewLogon/facilityList.asp.
 * This ASP page does not require a company — suitable for pre-creation browsing.
 */
export async function fetchClusterFacilities(ctx: SessionContext, cluster: string, folder: string): Promise<ClusterFacilityPreview[]> {
  if (!ctx.currentWorldInfo) {
    throw new Error('Not logged into world - cannot fetch cluster facilities');
  }

  const params = new URLSearchParams({ Cluster: cluster, Folder: folder });
  const url = `http://${ctx.currentWorldInfo.ip}/Five/0/Visual/Voyager/NewLogon/facilityList.asp?${params.toString().replace(/\+/g, '%20')}`;
  ctx.log.debug(`[ClusterBrowse] Fetching facilities: ${cluster}/${folder}`);

  try {
    const response = await fetch(url, { redirect: 'follow' });
    const html = await response.text();
    return parseClusterFacilities(ctx, html);
  } catch (e) {
    ctx.log.error(`[ClusterBrowse] Failed to fetch facilities for ${cluster}/${folder}:`, e);
    return [];
  }
}

/**
 * Parse facilityList.asp HTML to extract facility previews.
 *
 * HTML structure (from trace):
 *   <span ...>
 *     <div class=comment ...>Company Headquarters</div>
 *     <table><tr height=80>
 *       <td><img src=/five/icons/MapDisHQ1.gif /></td>
 *       <td>
 *         <img src="images/zone-commerce.gif" title="Building must be located in...">
 *         <div class=comment ...>$8,000K<br><nobr>3600 m.</nobr></div>
 *       </td>
 *     </tr></table>
 *     <div class="description" ...>optional description</div>
 *   </span>
 */
function parseClusterFacilities(ctx: SessionContext, html: string): ClusterFacilityPreview[] {
  const facilities: ClusterFacilityPreview[] = [];

  // Split on <span> blocks — each facility is wrapped in a <span>
  const spanRegex = /<span[^>]*>([\s\S]*?)<\/span>/gi;
  let match;
  while ((match = spanRegex.exec(html)) !== null) {
    const block = match[1];

    // Extract facility name from first comment div
    const nameMatch = /<div[^>]*class\s*=\s*["']?comment["']?[^>]*font-size:\s*11px[^>]*>([\s\S]*?)<\/div>/i.exec(block);
    const name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    if (!name) continue;

    // Extract icon URL (first <img src=...> pointing to /five/icons/ or similar)
    const iconMatch = /<img\s+src\s*=\s*["']?([^"'\s>]*icons[^"'\s>]*)["']?/i.exec(block);
    const iconUrl = iconMatch ? ctx.convertToProxyUrl(iconMatch[1]) : '';

    // Extract zone type from zone image title
    const zoneMatch = /<img[^>]*zone[^>]*title\s*=\s*["']([^"']+)["']/i.exec(block);
    const zoneType = zoneMatch?.[1] || '';

    // Extract cost and build time from the second comment div (smaller font)
    const metaMatch = /<div[^>]*class\s*=\s*["']?comment["']?[^>]*font-size:\s*9px[^>]*>([\s\S]*?)<\/div>/i.exec(block);
    let cost = '';
    let buildTime = '';
    if (metaMatch) {
      const metaText = metaMatch[1];
      const costMatch = /(\$[\d,]+\.?\d*\s*[KM]?)/i.exec(metaText);
      cost = costMatch?.[1] || '';
      const timeMatch = /<nobr>([\d,]+\s*m\.)<\/nobr>/i.exec(metaText);
      buildTime = timeMatch?.[1] || '';
    }

    // Extract description
    const descMatch = /<div[^>]*class\s*=\s*["']?description["']?[^>]*>([\s\S]*?)<\/div>/i.exec(block);
    let description = '';
    if (descMatch) {
      description = descMatch[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
    }

    facilities.push({ name, iconUrl, cost, buildTime, zoneType, description });
  }

  ctx.log.debug(`[ClusterBrowse] Parsed ${facilities.length} facility previews`);
  return facilities;
}

// ===========================================================================
// BUILD CONSTRUCTION — CATEGORIES
// ===========================================================================

/**
 * Fetch building categories via HTTP (KindList.asp)
 */
export async function fetchBuildingCategories(ctx: SessionContext, companyName: string): Promise<BuildingCategory[]> {
  if (!ctx.currentWorldInfo || !ctx.cachedUsername) {
    throw new Error('Not logged into world - cannot fetch building categories');
  }

  const params = new URLSearchParams({
    Company: companyName,
    WorldName: ctx.currentWorldInfo.name,
    Cluster: '',
    Tycoon: ctx.activeUsername || ctx.cachedUsername
  });

  const url = `http://${ctx.currentWorldInfo.ip}/five/0/visual/voyager/Build/KindList.asp?${params.toString().replace(/\+/g, '%20')}`;
  ctx.log.debug(`[BuildConstruction] Fetching categories from ${url}`);

  try {
    const response = await fetch(url, { redirect: 'follow' });
    const html = await response.text();

    return parseBuildingCategories(ctx, html);
  } catch (e) {
    ctx.log.error('[BuildConstruction] Failed to fetch categories:', e);
    return [];
  }
}

/**
 * Parse HTML response from KindList.asp to extract building categories
 */
function parseBuildingCategories(ctx: SessionContext, html: string): BuildingCategory[] {
  const categories: BuildingCategory[] = [];

  // Match <td> elements with ref attribute containing FacilityList.asp
  // Handle both quoted and unquoted ref attributes
  // If quoted, capture everything until closing quote; if unquoted, capture until space/bracket
  const tdRegex = /<td[^>]*\sref=(["']?)([^"']*FacilityList\.asp[^"']*)\1[^>]*>([\s\S]*?)<\/td>/gi;
  let match;

  while ((match = tdRegex.exec(html)) !== null) {
    const ref = match[2];  // Second capture group contains the ref URL
    const content = match[3];  // Third capture group contains the content

    ctx.log.debug(`[BuildConstruction] Found category ref: ${ref.substring(0, 100)}`);

    // Parse query parameters from ref
    const urlParams = new URLSearchParams(ref.split('?')[1] || '');

    // Extract category name from content
    // Try multiple patterns:
    // 1. <div class=link> or <div class="link">
    // 2. title attribute on img tag
    let kindName = '';

    // Pattern 1: <div> with class=link (quoted or unquoted)
    const divMatch = /<div[^>]*class\s*=\s*["']?link["']?[^>]*>\s*([^<]+)\s*<\/div>/i.exec(content);
    if (divMatch) {
      kindName = divMatch[1].trim();
    }

    // Pattern 2: title attribute (fallback)
    if (!kindName) {
      const titleMatch = /title\s*=\s*["']([^"']+)["']/i.exec(content);
      if (titleMatch) {
        kindName = titleMatch[1].trim();
      }
    }

    // Extract icon path (handle both quoted and unquoted src)
    const iconMatch = /src\s*=\s*["']?([^"'\s>]+)["']?/i.exec(content);
    const iconPath = iconMatch?.[1] || '';

    if (kindName && urlParams.get('Kind')) {
      const category = {
        kindName: kindName,
        kind: urlParams.get('Kind') || '',
        cluster: urlParams.get('Cluster') || '',
        folder: urlParams.get('Folder') || '',
        tycoonLevel: parseInt(urlParams.get('TycoonLevel') || '0', 10),
        iconPath: ctx.convertToProxyUrl(iconPath)
      };

      ctx.log.debug(`[BuildConstruction] Parsed category: ${category.kindName} (${category.kind})`);
      categories.push(category);
    } else {
      ctx.log.warn(`[BuildConstruction] Skipped category - kindName: "${kindName}", Kind: "${urlParams.get('Kind')}"`);
    }
  }

  ctx.log.debug(`[BuildConstruction] Parsed ${categories.length} categories total`);
  return categories;
}

// ===========================================================================
// BUILD CONSTRUCTION — FACILITIES
// ===========================================================================

/**
 * Fetch facilities (buildings) for a specific category via HTTP (FacilityList.asp)
 */
export async function fetchBuildingFacilities(
  ctx: SessionContext,
  companyName: string,
  cluster: string,
  kind: string,
  kindName: string,
  folder: string,
  tycoonLevel: number
): Promise<BuildingInfo[]> {
  if (!ctx.currentWorldInfo) {
    throw new Error('Not logged into world - cannot fetch facilities');
  }

  const params = new URLSearchParams({
    Company: companyName,
    WorldName: ctx.currentWorldInfo.name,
    Cluster: cluster,
    Kind: kind,
    KindName: kindName,
    Folder: folder,
    TycoonLevel: tycoonLevel.toString()
  });

  const url = `http://${ctx.currentWorldInfo.ip}/five/0/visual/voyager/Build/FacilityList.asp?${params.toString().replace(/\+/g, '%20')}`;
  ctx.log.debug(`[BuildConstruction] Fetching facilities from ${url}`);

  try {
    const response = await fetch(url, { redirect: 'follow' });
    const html = await response.text();

    return parseBuildingFacilities(ctx, html);
  } catch (e) {
    ctx.log.error('[BuildConstruction] Failed to fetch facilities:', e);
    return [];
  }
}

/**
 * Parse HTML response from FacilityList.asp to extract building information
 */
function parseBuildingFacilities(ctx: SessionContext, html: string): BuildingInfo[] {
  const facilities: BuildingInfo[] = [];

  // Pre-scan: extract ALL FacilityClass->VisualClassId pairs from "info" attribute URLs.
  // The real server HTML has nested <table>/<tr> inside each Cell_N, and VisualClassId
  // lives in the "Build now" button's info attribute deep in the second inner <tr>.
  // The cellRegex below only captures up to the first inner </tr> (non-greedy),
  // so we must extract VisualClassId from the full HTML before cell-level processing.
  const visualClassMap = new Map<string, string>();
  // Strategy 1: FacilityClass before VisualClassId (standard order)
  const infoRegex = /FacilityClass=([A-Za-z0-9_]+)[^"']*VisualClassId=(\d+)/gi;
  let infoMatch;
  while ((infoMatch = infoRegex.exec(html)) !== null) {
    visualClassMap.set(infoMatch[1], infoMatch[2]);
  }
  // Strategy 2: VisualClassId before FacilityClass (reversed order)
  const reverseInfoRegex = /VisualClassId=(\d+)[^"']*FacilityClass=([A-Za-z0-9_]+)/gi;
  while ((infoMatch = reverseInfoRegex.exec(html)) !== null) {
    if (!visualClassMap.has(infoMatch[2])) {
      visualClassMap.set(infoMatch[2], infoMatch[1]);
    }
  }
  if (visualClassMap.size > 0) {
    ctx.log.debug(`[BuildConstruction] Pre-scanned ${visualClassMap.size} FacilityClass->VisualClassId pairs from info attributes`);
  }

  // Match each building's detail cell (Cell_N) - handle both quoted and unquoted id
  const cellRegex = /<tr[^>]*\sid\s*=\s*["']?Cell_(\d+)["']?[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;

  while ((match = cellRegex.exec(html)) !== null) {
    const cellIndex = match[1];
    const cellContent = match[2];

    // Find corresponding LinkText div for building name and availability
    // Handle both quoted and unquoted attributes, in any order
    const linkTextRegex = new RegExp(
      `<div[^>]*id\\s*=\\s*["']?LinkText_${cellIndex}["']?[^>]*available\\s*=\\s*["']?(\\d+)["']?[^>]*>([^<]+)<`,
      'i'
    );
    const linkMatch = linkTextRegex.exec(html);

    if (!linkMatch) {
      ctx.log.warn(`[BuildConstruction] No LinkText found for Cell_${cellIndex}`);
      continue;
    }

    const available = linkMatch[1] === '1';
    const name = linkMatch[2].trim();

    // Extract building icon - handle both quoted and unquoted src
    const iconMatch = /src\s*=\s*["']?([^"'\s>]+)["']?/i.exec(cellContent);
    const iconPath = iconMatch?.[1] || '';

    // Extract FacilityClass from info attribute (authoritative RDO class name).
    // Icon filenames use visual asset names that may differ from the kernel class
    // (e.g., icon "MapPGIHQ1.gif" -> "PGIHQ1", but real class is "PGIGeneralHeadquarterSTA").
    // The info attribute on the "Build now" button has the correct FacilityClass.
    let facilityClass = '';
    let visualClassId = '';

    // PRIMARY: Extract FacilityClass from info attribute near this Cell_N
    const cellAnchor = html.indexOf(`Cell_${cellIndex}`);
    if (cellAnchor >= 0) {
      const nextCellPos = html.indexOf('Cell_', cellAnchor + 5);
      const searchEnd = nextCellPos >= 0 ? nextCellPos : cellAnchor + 3000;
      const searchWindow = html.substring(cellAnchor, searchEnd);
      const fcMatch = /FacilityClass=([A-Za-z0-9_]+)/i.exec(searchWindow);
      if (fcMatch) {
        facilityClass = fcMatch[1];
        ctx.log.debug(`[BuildConstruction] Extracted facilityClass "${facilityClass}" from info attribute`);
      }
    }

    // FALLBACK: Extract from icon filename (for HTML without info attributes)
    if (!facilityClass && iconPath) {
      const iconFilenameMatch = /Map([A-Z][a-zA-Z0-9]+?)(?:\d+x\d+(?:x\d+)?)?\.gif/i.exec(iconPath);
      if (iconFilenameMatch) {
        facilityClass = iconFilenameMatch[1];
        ctx.log.warn(`[BuildConstruction] FacilityClass from icon fallback: "${facilityClass}" (may differ from kernel class)`);
      }
    }

    // Look up VisualClassId from pre-scanned info attributes (handles nested-table HTML),
    // then fall back to searching cellContent directly (handles simplified/mock HTML),
    // then fall back to searching the full HTML near the Cell_N anchor.
    if (facilityClass && visualClassMap.has(facilityClass)) {
      visualClassId = visualClassMap.get(facilityClass)!;
    } else {
      const visualIdMatch = /VisualClassId[=:](\d+)/i.exec(cellContent);
      if (visualIdMatch) {
        visualClassId = visualIdMatch[1];
      } else if (facilityClass) {
        // Last resort: search the full HTML for VisualClassId near this Cell_N
        // IMPORTANT: Scope to cell boundary to avoid bleeding into neighboring cells
        const cellAnchor2 = html.indexOf(`Cell_${cellIndex}`);
        if (cellAnchor2 >= 0) {
          const nextCell = html.indexOf('Cell_', cellAnchor2 + 5);
          const end = nextCell >= 0 ? nextCell : cellAnchor2 + 2000;
          const searchWindow = html.substring(cellAnchor2, end);
          const windowMatch = /VisualClassId[=:](\d+)/i.exec(searchWindow);
          if (windowMatch) {
            visualClassId = windowMatch[1];
          }
        }
      }
    }

    if (!visualClassId) {
      ctx.log.warn(`[BuildConstruction] No VisualClassId found for "${facilityClass}" — building dimensions will be unavailable`);
    }

    // Extract cost (e.g., "$140K") - handle both quoted and unquoted class
    const costMatch = /<div[^>]*class\s*=\s*["']?comment["']?[^>]*>\s*\$?([\d,]+\.?\d*)\s*([KM]?)/i.exec(cellContent);
    let cost = 0;
    if (costMatch) {
      const value = parseFloat(costMatch[1].replace(/,/g, ''));
      const multiplier = costMatch[2] === 'K' ? 1000 : costMatch[2] === 'M' ? 1000000 : 1;
      cost = value * multiplier;
    }

    // Extract area (e.g., "400 m.")
    const areaMatch = /([\d,]+)\s*m\./i.exec(cellContent);
    const area = areaMatch ? parseInt(areaMatch[1].replace(/,/g, ''), 10) : 0;

    // Extract description - handle both quoted and unquoted class
    const descMatch = /<div[^>]*class\s*=\s*["']?description["']?[^>]*>([^<]+)</i.exec(cellContent);
    const description = descMatch?.[1]?.trim() || '';

    // Extract zone image src and title for residential classification
    // Try src-before-title first (standard order), then title-before-src (reversed)
    const zoneSrcFirst = /<img[^>]*src\s*=\s*["']?([^"'\s>]*zone[^"'\s>]*)["']?[^>]*title\s*=\s*["']([^"']+)["']/i.exec(cellContent);
    const zoneTitleFirst = !zoneSrcFirst
      ? /<img[^>]*title\s*=\s*["']([^"']+)["'][^>]*src\s*=\s*["']?([^"'\s>]*zone[^"'\s>]*)["']?/i.exec(cellContent)
      : null;
    const zoneSrc = zoneSrcFirst?.[1] || zoneTitleFirst?.[2] || '';
    const zoneTitle = zoneSrcFirst?.[2] || zoneTitleFirst?.[1] || '';
    const zoneRequirement = zoneTitle;

    // Derive residence class from zone image filename, title text, and facility class
    const residenceClass = deriveResidenceClass(zoneSrc, zoneTitle, facilityClass);
    if (zoneSrc || zoneTitle) {
      ctx.log.debug(`[BuildConstruction] Zone signals for "${name}": src="${zoneSrc}" title="${zoneTitle}" → ${residenceClass ?? 'none'}`);
    }

    if (facilityClass && name) {
      const facility: BuildingInfo = {
        name,
        facilityClass,
        visualClassId,
        cost,
        area,
        description,
        zoneRequirement,
        iconPath: ctx.convertToProxyUrl(iconPath),
        available,
        ...(residenceClass && { residenceClass }),
      };

      ctx.log.debug(`[BuildConstruction] Parsed facility: ${facility.name} (${facility.facilityClass}) - $${facility.cost}, ${facility.area}m², available: ${facility.available}`);
      facilities.push(facility);
    } else {
      ctx.log.warn(`[BuildConstruction] Skipped facility - name: "${name}", facilityClass: "${facilityClass}"`);
    }
  }

  ctx.log.debug(`[BuildConstruction] Parsed ${facilities.length} facilities total`);
  return facilities;
}

// ===========================================================================
// BUILD CONSTRUCTION — PLACEMENT
// ===========================================================================

/**
 * Place a new building via RDO NewFacility command
 */
export async function placeBuilding(
  ctx: SessionContext,
  facilityClass: string,
  x: number,
  y: number
): Promise<{ success: boolean; buildingId: string | null }> {
  if (!ctx.worldContextId) {
    throw new Error('Not logged into world - cannot place building');
  }
  if (!ctx.currentCompany) {
    throw new Error('No company selected - cannot place building');
  }

  const companyId = parseInt(ctx.currentCompany.id, 10);
  if (isNaN(companyId)) {
    throw new Error(`Invalid company ID: ${ctx.currentCompany.id}`);
  }

  ctx.log.debug(`[BuildConstruction] Placing ${facilityClass} at (${x}, ${y}) for company ${companyId}`);

  try {
    const packet = await ctx.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: ctx.worldContextId,
      action: RdoAction.CALL,
      member: 'NewFacility',
      separator: '"^"',
      args: [RdoValue.string(facilityClass).format(), RdoValue.int(companyId).format(), RdoValue.int(x).format(), RdoValue.int(y).format()]
    });

    // Parse response for result code
    const resultMatch = /res="#(\d+)"/.exec(packet.payload || '');
    const resultCode = resultMatch ? parseInt(resultMatch[1], 10) : -1;

    if (resultCode === 0) {
      // Extract new building ID if available
      const buildingIdMatch = /sel (\d+)/.exec(packet.payload || '');
      const buildingId = buildingIdMatch?.[1] || null;

      ctx.log.debug(`[BuildConstruction] Building placed successfully. ID: ${buildingId}`);
      return { success: true, buildingId };
    } else {
      ctx.log.warn(`[BuildConstruction] Building placement failed. Result code: ${resultCode}`);
      return { success: false, buildingId: null };
    }
  } catch (e) {
    ctx.log.error('[BuildConstruction] Failed to place building:', e);
    return { success: false, buildingId: null };
  }
}

/**
 * Place the Capitol building via RDO NewFacility command.
 * Capitol uses facilityClass "Capitol" and companyId 1 (hardcoded).
 * RDO: sel <worldContextId> call NewFacility "^" "%Capitol","#1","#x","#y"
 */
export async function placeCapitol(
  ctx: SessionContext,
  x: number,
  y: number
): Promise<{ success: boolean; buildingId: string | null }> {
  if (!ctx.worldContextId) {
    throw new Error('Not logged into world - cannot place Capitol');
  }

  ctx.log.debug(`[Capitol] Placing Capitol at (${x}, ${y})`);

  try {
    const packet = await ctx.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: ctx.worldContextId,
      action: RdoAction.CALL,
      member: 'NewFacility',
      separator: '"^"',
      args: [
        RdoValue.string('Capitol').format(),
        RdoValue.int(1).format(),
        RdoValue.int(x).format(),
        RdoValue.int(y).format(),
      ]
    });

    const resultMatch = /res="#(\d+)"/.exec(packet.payload || '');
    const resultCode = resultMatch ? parseInt(resultMatch[1], 10) : -1;

    if (resultCode === 0) {
      const buildingIdMatch = /sel (\d+)/.exec(packet.payload || '');
      const buildingId = buildingIdMatch?.[1] || null;
      ctx.log.debug(`[Capitol] Capitol placed successfully. ID: ${buildingId}`);
      return { success: true, buildingId };
    } else {
      ctx.log.warn(`[Capitol] Capitol placement failed. Result code: ${resultCode}`);
      return { success: false, buildingId: null };
    }
  } catch (e) {
    ctx.log.error('[Capitol] Failed to place Capitol:', e);
    return { success: false, buildingId: null };
  }
}
