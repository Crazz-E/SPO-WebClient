/**
 * facility-status — cross the favorites list with the loaded map buildings (H6).
 *
 * No extra reads: the favorites carry (id, name, x, y) and every building the
 * renderer has loaded carries the server's `alert` bit ("losing money" — the
 * red of Voyager's minimap, Map.pas cLoosingColor). A favorite in a zone the
 * player never visited has NO known state — that third bucket is shown, never
 * silently counted as healthy.
 *
 * Folders (kind 0) carry no coordinates of their own, so they classify by
 * their worst descendant link — `losing` if any descendant link is losing,
 * else `unknown` if any descendant link is unknown, else `operating` (an
 * empty folder is `operating`: nothing in it is in trouble). A folder never
 * appears in `stateByPath` as anything other than that derived state — the
 * inheritance runs from links up to folders, never the other way.
 */

import type { FavoritesItem, MapBuilding } from '@/shared/types';

export type FacilityState = 'losing' | 'unknown' | 'operating';

export interface ClassifiedFacilities {
  /** Confirmed losing money (alert bit set on a loaded building). */
  losing: FavoritesItem[];
  /** In a zone not loaded yet — state honestly unknown. */
  unknown: FavoritesItem[];
  /** Loaded and not alerting. */
  operating: FavoritesItem[];
  /** Every item at any depth, keyed by its Location — for a nested row's own dot. */
  stateByPath: Map<string, FacilityState>;
}

const WORST_FIRST: FacilityState[] = ['losing', 'unknown', 'operating'];

function worstOf(a: FacilityState, b: FacilityState): FacilityState {
  for (const s of WORST_FIRST) {
    if (a === s || b === s) return s;
  }
  return 'operating';
}

/**
 * Classify one item and its descendants, recording every one of them into
 * `stateByPath`. Returns the item's own state — a link's by its coordinates,
 * a folder's by folding its children with {@link worstOf}.
 */
function classifyItem(
  item: FavoritesItem,
  byPos: Map<string, MapBuilding>,
  stateByPath: Map<string, FacilityState>,
): FacilityState {
  let state: FacilityState;
  if (item.kind === 0) {
    state = 'operating';
    for (const child of item.children ?? []) {
      state = worstOf(state, classifyItem(child, byPos, stateByPath));
    }
  } else {
    const b = byPos.get(`${item.x},${item.y}`);
    state = !b ? 'unknown' : b.alert ? 'losing' : 'operating';
  }
  stateByPath.set(item.path, state);
  return state;
}

export function classifyFacilities(
  favorites: readonly FavoritesItem[],
  loadedBuildings: readonly MapBuilding[],
): ClassifiedFacilities {
  const byPos = new Map<string, MapBuilding>();
  for (const b of loadedBuildings) byPos.set(`${b.x},${b.y}`, b);

  const stateByPath = new Map<string, FacilityState>();
  const out: ClassifiedFacilities = { losing: [], unknown: [], operating: [], stateByPath };

  for (const f of favorites) {
    const state = classifyItem(f, byPos, stateByPath);
    out[state].push(f);
  }

  const byName = (a: FavoritesItem, b: FavoritesItem) => a.name.localeCompare(b.name);
  out.losing.sort(byName);
  out.unknown.sort(byName);
  out.operating.sort(byName);
  return out;
}
