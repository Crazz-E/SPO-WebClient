/**
 * Map Store — the Map surface's data source and the camera history (Carte lot, N1 / N2).
 *
 * `source` is the renderer seen through `MinimapRendererAPI` (set once by the client when the
 * game view is built; null before, and in tests a fake). The history is Voyager's
 * `MapIsoView.pas:1009-1036` idea — a list of positions with Back / Next — kept here so it
 * accumulates while the player pans the iso map, not only while the surface is open.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { MinimapRendererAPI } from '../ui/minimap-colormap';

export interface MapPosition {
  x: number;
  y: number;
}

/** A named place the player keeps (N4) — local to this browser, per world and player. */
export interface MapBookmark {
  id: string;
  name: string;
  x: number;
  y: number;
}

export const BOOKMARKS_KEY_PREFIX = 'spo.bookmarks.';
export const BOOKMARKS_MAX = 50;

/** Voyager keeps 100 entries (`MapIsoView.pas:1009`). */
export const HISTORY_MAX = 100;
/** Moves shorter than this (tiles, Chebyshev) do not make an entry — a nudge is not a trip. */
export const HISTORY_MIN_MOVE = 8;

export interface MapStoreState {
  source: MinimapRendererAPI | null;
  setSource: (source: MinimapRendererAPI | null) => void;

  /** Positions visited, oldest first; `historyIndex` points at the current one. */
  history: MapPosition[];
  historyIndex: number;
  /** Record where the camera is now; no-op for a nudge or the same spot. Forward entries are dropped. */
  recordPosition: (x: number, y: number) => void;
  /** Step back / forward; returns the position to go to, or null at an end. */
  goBack: () => MapPosition | null;
  goNext: () => MapPosition | null;

  /** Bookmarks for the current world / player; `bookmarksKey` says which list is loaded. */
  bookmarks: MapBookmark[];
  bookmarksKey: string | null;
  /** Load the list for (world, player) from localStorage — called when the surface opens. */
  loadBookmarks: (world: string, player: string) => void;
  addBookmark: (name: string, x: number, y: number) => MapBookmark | null;
  renameBookmark: (id: string, name: string) => void;
  removeBookmark: (id: string) => void;
  reset: () => void;
}

const initialState = {
  source: null as MinimapRendererAPI | null,
  history: [] as MapPosition[],
  historyIndex: -1,
  bookmarks: [] as MapBookmark[],
  bookmarksKey: null as string | null,
};

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readBookmarks(key: string): MapBookmark[] {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((b): b is MapBookmark => typeof b === 'object' && b !== null && typeof (b as MapBookmark).name === 'string' && Number.isFinite((b as MapBookmark).x) && Number.isFinite((b as MapBookmark).y))
      .map((b, i) => ({ id: typeof b.id === 'string' && b.id ? b.id : `bm-${i}-${b.x}-${b.y}`, name: b.name, x: b.x, y: b.y }))
      .slice(0, BOOKMARKS_MAX);
  } catch {
    return [];
  }
}

function writeBookmarks(key: string, list: MapBookmark[]): void {
  try {
    storage()?.setItem(key, JSON.stringify(list));
  } catch {
    /* quota or private mode — the list still lives in memory for the session */
  }
}

let bookmarkSeq = 0;

function farEnough(a: MapPosition, b: MapPosition): boolean {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) >= HISTORY_MIN_MOVE;
}

export const useMapStore = create<MapStoreState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    setSource: (source) => set({ source }),

    recordPosition: (x, y) => {
      const { history, historyIndex } = get();
      const current = historyIndex >= 0 ? history[historyIndex] : null;
      const pos = { x, y };
      if (current && !farEnough(current, pos)) return;
      const kept = history.slice(0, historyIndex + 1);
      kept.push(pos);
      const overflow = Math.max(0, kept.length - HISTORY_MAX);
      const next = overflow ? kept.slice(overflow) : kept;
      set({ history: next, historyIndex: next.length - 1 });
    },

    goBack: () => {
      const { history, historyIndex } = get();
      if (historyIndex <= 0) return null;
      set({ historyIndex: historyIndex - 1 });
      return history[historyIndex - 1];
    },

    goNext: () => {
      const { history, historyIndex } = get();
      if (historyIndex >= history.length - 1) return null;
      set({ historyIndex: historyIndex + 1 });
      return history[historyIndex + 1];
    },

    loadBookmarks: (world, player) => {
      const key = `${BOOKMARKS_KEY_PREFIX}${world || 'world'}.${player || 'player'}`;
      if (get().bookmarksKey === key) return;
      set({ bookmarks: readBookmarks(key), bookmarksKey: key });
    },

    addBookmark: (name, x, y) => {
      const { bookmarks, bookmarksKey } = get();
      if (!bookmarksKey || bookmarks.length >= BOOKMARKS_MAX) return null;
      const trimmed = name.trim() || `(${x}, ${y})`;
      const bm: MapBookmark = { id: `bm-${++bookmarkSeq}-${x}-${y}`, name: trimmed, x, y };
      const next = [...bookmarks, bm];
      writeBookmarks(bookmarksKey, next);
      set({ bookmarks: next });
      return bm;
    },

    renameBookmark: (id, name) => {
      const { bookmarks, bookmarksKey } = get();
      const trimmed = name.trim();
      if (!bookmarksKey || !trimmed) return;
      const next = bookmarks.map((b) => (b.id === id ? { ...b, name: trimmed } : b));
      writeBookmarks(bookmarksKey, next);
      set({ bookmarks: next });
    },

    removeBookmark: (id) => {
      const { bookmarks, bookmarksKey } = get();
      if (!bookmarksKey) return;
      const next = bookmarks.filter((b) => b.id !== id);
      writeBookmarks(bookmarksKey, next);
      set({ bookmarks: next });
    },

    reset: () => set({ ...initialState }),
  })),
);
