/**
 * facility-status — cross the favorites list with the loaded map buildings (H6).
 *
 * No extra reads: the favorites carry (id, name, x, y) and every building the
 * renderer has loaded carries the server's `alert` bit ("losing money" — the
 * red of Voyager's minimap, Map.pas cLoosingColor). A favorite in a zone the
 * player never visited has NO known state — that third bucket is shown, never
 * silently counted as healthy.
 */

import type { FavoritesLinkItem, MapBuilding } from '@/shared/types';

export interface ClassifiedFacilities {
  /** Confirmed losing money (alert bit set on a loaded building). */
  losing: FavoritesLinkItem[];
  /** In a zone not loaded yet — state honestly unknown. */
  unknown: FavoritesLinkItem[];
  /** Loaded and not alerting. */
  operating: FavoritesLinkItem[];
}

export function classifyFacilities(
  favorites: readonly FavoritesLinkItem[],
  loadedBuildings: readonly MapBuilding[],
): ClassifiedFacilities {
  const byPos = new Map<string, MapBuilding>();
  for (const b of loadedBuildings) byPos.set(`${b.x},${b.y}`, b);

  const out: ClassifiedFacilities = { losing: [], unknown: [], operating: [] };
  for (const f of favorites) {
    const b = byPos.get(`${f.x},${f.y}`);
    if (!b) out.unknown.push(f);
    else if (b.alert) out.losing.push(f);
    else out.operating.push(f);
  }
  const byName = (a: FavoritesLinkItem, b: FavoritesLinkItem) => a.name.localeCompare(b.name);
  out.losing.sort(byName);
  out.unknown.sort(byName);
  out.operating.sort(byName);
  return out;
}
