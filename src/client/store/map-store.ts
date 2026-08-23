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
  reset: () => void;
}

const initialState = {
  source: null as MinimapRendererAPI | null,
  history: [] as MapPosition[],
  historyIndex: -1,
};

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

    reset: () => set({ ...initialState }),
  })),
);
