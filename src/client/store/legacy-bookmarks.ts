/**
 * Legacy local bookmarks — the browser-only list the Map surface kept before the
 * places moved to the server's Favorites tree (N4, OB-33).
 *
 * Nothing writes here any more. The module exists so a player who kept places in
 * this browser does not lose them when the list becomes the server's: the
 * migration reads the key once, pushes what the tree does not already hold, and
 * only then clears it. Voyager kept the same idea as server cookies
 * (`MapIsoView.pas:683-716`); the tree it really used is the one the WebClient
 * now writes to.
 */

/** One entry of the old localStorage list. `id` was local and is not carried over. */
export interface LegacyBookmark {
  name: string;
  x: number;
  y: number;
}

export const BOOKMARKS_KEY_PREFIX = 'spo.bookmarks.';

/** The key the old list was written under — one per world and player. */
export function bookmarksKey(world: string, player: string): string {
  return `${BOOKMARKS_KEY_PREFIX}${world || 'world'}.${player || 'player'}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Read the old list. Anything unreadable is an empty list: a corrupt key must
 * never stop the player from using the server list, and it must never be
 * mistaken for "the player had nothing".
 */
export function readLegacyBookmarks(world: string, player: string): LegacyBookmark[] {
  try {
    const raw = storage()?.getItem(bookmarksKey(world, player));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((b): b is LegacyBookmark =>
        typeof b === 'object' && b !== null
        && typeof (b as LegacyBookmark).name === 'string'
        && Number.isFinite((b as LegacyBookmark).x)
        && Number.isFinite((b as LegacyBookmark).y))
      .map((b) => ({ name: b.name, x: b.x, y: b.y }));
  } catch {
    return [];
  }
}

/** Drop the old key — called only once every entry is on the server. */
export function clearLegacyBookmarks(world: string, player: string): void {
  try {
    storage()?.removeItem(bookmarksKey(world, player));
  } catch {
    /* private mode or a storage that throws — the list is on the server either way */
  }
}
