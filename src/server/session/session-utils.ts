/**
 * Session Utilities — pure functions extracted from spo_session.ts.
 *
 * These are stateless helpers used by session handlers. Extracting them here
 * breaks the upward dependency where handlers imported from their parent class.
 */

import type { FavoritesItem, ResearchInventionItem } from '../../shared/types';

// Favorites protocol constants (from Delphi FavProtocol.pas)
const FAV_PROP_SEP = '\x01';  // chrPropSeparator = char(1)
const FAV_ITEM_SEP = '\x02';  // chrItemSeparator = char(2)
const FAV_KIND_LINK = 1;      // fvkLink — a bookmark with coordinates

/**
 * Parse the RDOFavoritesGetSubItems response string.
 *
 * Wire format per item: id \x01 kind \x01 name \x01 info \x01 subFolderCount \x01
 * Items separated by \x02.
 * For links (kind=1): info = "displayName,x,y,select"
 */
export function parseFavoritesResponse(raw: string): FavoritesItem[] {
  if (!raw) return [];

  const items: FavoritesItem[] = [];
  const entries = raw.split(FAV_ITEM_SEP);

  for (const entry of entries) {
    if (!entry) continue;
    const fields = entry.split(FAV_PROP_SEP);
    // fields: [id, kind, name, info, subFolderCount, '']
    if (fields.length < 4) continue;

    const kind = parseInt(fields[1], 10);
    if (kind !== FAV_KIND_LINK) continue; // skip folders

    const id = parseInt(fields[0], 10);
    const name = fields[2];
    const info = fields[3]; // "displayName,x,y,select"

    // Parse info cookie: last 3 comma-separated values are x, y, select
    const lastComma = info.lastIndexOf(',');
    if (lastComma < 0) continue;
    const beforeLast = info.lastIndexOf(',', lastComma - 1);
    if (beforeLast < 0) continue;
    const beforeXY = info.lastIndexOf(',', beforeLast - 1);
    if (beforeXY < 0) continue;

    const x = parseInt(info.substring(beforeXY + 1, beforeLast), 10);
    const y = parseInt(info.substring(beforeLast + 1, lastComma), 10);

    if (isNaN(id) || isNaN(x) || isNaN(y)) continue;

    items.push({ id, name, x, y });
  }

  return items;
}

/**
 * Derive residential building class from zone image signals.
 * Uses multiple signals in priority order: filename > title text > facility class name.
 */
export function deriveResidenceClass(
  zoneSrc: string,
  zoneTitle: string,
  facilityClass: string
): 'high' | 'middle' | 'low' | undefined {
  // Signal 1: Zone image filename (most reliable — follows Delphi constants)
  // Patterns: zone-hires.gif, zone-midres.gif, zone-lores.gif
  const srcLower = zoneSrc.toLowerCase();
  if (srcLower.includes('hires')) return 'high';
  if (srcLower.includes('midres')) return 'middle';
  if (srcLower.includes('lores')) return 'low';

  // Signal 2: Zone title text (case-insensitive)
  const titleLower = zoneTitle.toLowerCase();
  if (titleLower.includes('high res') || titleLower.includes('hi res') || titleLower.includes('hi-res')) return 'high';
  if (titleLower.includes('mid res') || titleLower.includes('middle res')) return 'middle';
  if (titleLower.includes('low res') || titleLower.includes('lo res') || titleLower.includes('lo-res')) return 'low';

  // Signal 3: Color-based zone descriptions in title
  // Hi=bright/light green, Mid=plain green, Lo=dark green
  if (titleLower.includes('bright green') || titleLower.includes('light green')) return 'high';
  if (titleLower.includes('dark green')) return 'low';
  if (/\bgreen\b/.test(titleLower)) return 'middle';

  // Signal 4 (weakest): FacilityClass name hint
  const fcLower = facilityClass.toLowerCase();
  if (fcLower.includes('hires')) return 'high';
  if (fcLower.includes('midres')) return 'middle';
  if (fcLower.includes('lores')) return 'low';

  return undefined;
}

/**
 * Parse research invention items from a property value map.
 */
export function parseResearchItems(
  prefix: string,
  cat: number,
  count: number,
  values: Map<string, string>,
  includeEnabled: boolean
): ResearchInventionItem[] {
  const items: ResearchInventionItem[] = [];
  for (let i = 0; i < count; i++) {
    const id = values.get(`${prefix}${cat}RsId${i}`) || '';
    if (!id) continue;

    const isVolatile = values.get(`${prefix}${cat}RsDyn${i}`) === 'yes';
    const name = values.get(`${prefix}${cat}RsName${i}`) || id;
    const parent = values.get(`${prefix}${cat}RsParent${i}`) || undefined;
    const cost = prefix === 'has' ? values.get(`has${cat}RsCost${i}`) || undefined : undefined;

    let enabled: boolean | undefined;
    if (includeEnabled) {
      const enabledVal = values.get(`avl${cat}RsEnabled${i}`);
      // Delphi TObjectCache.WriteBoolean writes '1'/'0'; also accept 'true'/'-1' for safety
      enabled = enabledVal === '1' || enabledVal === 'true' || enabledVal === '-1';
    }

    items.push({ inventionId: id, name, enabled, cost, parent, volatile: isVolatile || undefined });
  }
  return items;
}
