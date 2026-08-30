/**
 * facility-status — cross the favorites list with the loaded map buildings (H6).
 *
 * No extra reads: the favorites carry (id, name, x, y) and every building the
 * renderer has loaded carries the server's `alert` bit ("losing money" — the
 * red of Voyager's minimap, Map.pas cLoosingColor). A favorite in a zone the
 * player never visited has NO known state — that third bucket is shown, never
 * silently counted as healthy.
 */

import type { FavoritesItem, MapBuilding } from '@/shared/types';

export interface ClassifiedFacilities {
  /** Confirmed losing money (alert bit set on a loaded building). */
  losing: FavoritesItem[];
  /** In a zone not loaded yet — state honestly unknown. */
  unknown: FavoritesItem[];
  /** Loaded and not alerting. */
  operating: FavoritesItem[];
}

/**
 * Recursively collect every link in the tree, folders included. A folder
 * carries no coordinates of its own (`x: 0, y: 0`) and never enters a bucket
 * — only the links inside it do, classified exactly like a root link.
 */
export function flattenFavoriteLinks(items: readonly FavoritesItem[]): FavoritesItem[] {
  const out: FavoritesItem[] = [];
  for (const item of items) {
    if (item.isFolder) {
      out.push(...flattenFavoriteLinks(item.children ?? []));
    } else {
      out.push(item);
    }
  }
  return out;
}

/** A folder in the tree, flattened for display, with its nesting depth. */
export interface FolderRow {
  folder: FavoritesItem;
  depth: number;
}

/** Recursively collect every folder in the tree, depth-first, root first. */
export function flattenFolders(items: readonly FavoritesItem[], depth = 0): FolderRow[] {
  const out: FolderRow[] = [];
  for (const item of items) {
    if (item.isFolder) {
      out.push({ folder: item, depth });
      out.push(...flattenFolders(item.children ?? [], depth + 1));
    }
  }
  return out;
}

export function classifyFacilities(
  favorites: readonly FavoritesItem[],
  loadedBuildings: readonly MapBuilding[],
): ClassifiedFacilities {
  const byPos = new Map<string, MapBuilding>();
  for (const b of loadedBuildings) byPos.set(`${b.x},${b.y}`, b);

  const out: ClassifiedFacilities = { losing: [], unknown: [], operating: [] };
  for (const f of flattenFavoriteLinks(favorites)) {
    const b = byPos.get(`${f.x},${f.y}`);
    if (!b) out.unknown.push(f);
    else if (b.alert) out.losing.push(f);
    else out.operating.push(f);
  }
  const byName = (a: FavoritesItem, b: FavoritesItem) => a.name.localeCompare(b.name);
  out.losing.sort(byName);
  out.unknown.sort(byName);
  out.operating.sort(byName);
  return out;
}
