/**
 * Newspaper Store — the town paper's editorial board.
 *
 * Holds which paper is open and what the gateway last read off it. The board is
 * a remote ASP tree, so nothing here is derived: every navigation is a request
 * and the answer replaces the state wholesale.
 */

import { create } from 'zustand';
import type { NewspaperBoard } from '@/shared/types';

export type NewspaperLoadState = 'idle' | 'loading' | 'loaded' | 'error';

/** Which building the board was opened from — every board request needs it. */
export interface NewspaperContext {
  paperName: string;
  townName: string;
  isCapitol: boolean;
  buildingX: number;
  buildingY: number;
}

interface NewspaperState {
  context: NewspaperContext | null;
  board: NewspaperBoard | null;
  loadState: NewspaperLoadState;
  /** Path being requested, so a stale answer for another column can be ignored. */
  requestedPath: string;
  isPosting: boolean;

  openFor: (context: NewspaperContext) => void;
  setLoadState: (state: NewspaperLoadState) => void;
  setRequestedPath: (path: string) => void;
  setBoard: (board: NewspaperBoard) => void;
  setPosting: (posting: boolean) => void;
  reset: () => void;
}

const EMPTY = {
  context: null,
  board: null,
  loadState: 'idle' as NewspaperLoadState,
  requestedPath: '',
  isPosting: false,
};

export const useNewspaperStore = create<NewspaperState>((set) => ({
  ...EMPTY,

  // A different paper starts from scratch; re-opening the same one keeps what
  // was already read, so closing and re-opening the modal costs no round-trip.
  openFor: (context) => set((state) =>
    state.context
      && state.context.paperName === context.paperName
      && state.context.buildingX === context.buildingX
      && state.context.buildingY === context.buildingY
      ? { context }
      : { ...EMPTY, context }
  ),

  setLoadState: (loadState) => set({ loadState }),
  setRequestedPath: (requestedPath) => set({ requestedPath, loadState: 'loading' }),
  setBoard: (board) => set({
    board,
    loadState: board.error ? 'error' : 'loaded',
    isPosting: false,
  }),
  setPosting: (isPosting) => set({ isPosting }),
  reset: () => set(EMPTY),
}));
