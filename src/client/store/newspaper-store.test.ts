/**
 * newspaper-store — which paper is open and what the gateway last read off it.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { useNewspaperStore, type NewspaperContext } from './newspaper-store';
import type { NewspaperBoard } from '@/shared/types';

const CONTEXT: NewspaperContext = {
  paperName: 'Helartia Herald',
  townName: 'Helartia',
  isCapitol: false,
  buildingX: 118,
  buildingY: 226,
};

const BOARD: NewspaperBoard = {
  paperName: 'Helartia Herald',
  root: 'boards\\Planitia\\Helartia Herald\\',
  path: 'boards\\Planitia\\Helartia Herald\\',
  columns: [{ author: 'A', subject: 'S', summary: 'x', path: 'm1.five' }],
  article: null,
  error: '',
};

beforeEach(() => {
  useNewspaperStore.getState().reset();
});

describe('newspaper-store', () => {
  it('starts empty', () => {
    const s = useNewspaperStore.getState();
    expect(s.context).toBeNull();
    expect(s.board).toBeNull();
    expect(s.loadState).toBe('idle');
    expect(s.isPosting).toBe(false);
  });

  it('opening a paper leaves it in the read path', () => {
    useNewspaperStore.getState().openFor(CONTEXT);
    expect(useNewspaperStore.getState().context).toEqual(CONTEXT);
    expect(useNewspaperStore.getState().loadState).toBe('idle');
  });

  // Closing and re-opening the same board must not cost a round-trip.
  it('re-opening the same paper keeps what was already read', () => {
    useNewspaperStore.getState().openFor(CONTEXT);
    useNewspaperStore.getState().setBoard(BOARD);
    useNewspaperStore.getState().openFor(CONTEXT);
    expect(useNewspaperStore.getState().board).toEqual(BOARD);
    expect(useNewspaperStore.getState().loadState).toBe('loaded');
  });

  it('opening a different paper starts from scratch', () => {
    useNewspaperStore.getState().openFor(CONTEXT);
    useNewspaperStore.getState().setBoard(BOARD);
    useNewspaperStore.getState().openFor({ ...CONTEXT, paperName: 'Other Times' });
    expect(useNewspaperStore.getState().board).toBeNull();
    expect(useNewspaperStore.getState().loadState).toBe('idle');
  });

  it('the same paper at another building starts from scratch', () => {
    useNewspaperStore.getState().openFor(CONTEXT);
    useNewspaperStore.getState().setBoard(BOARD);
    useNewspaperStore.getState().openFor({ ...CONTEXT, buildingX: 999 });
    expect(useNewspaperStore.getState().board).toBeNull();
  });

  it('requesting a path marks the read as in flight', () => {
    useNewspaperStore.getState().setRequestedPath('m1.five');
    expect(useNewspaperStore.getState().requestedPath).toBe('m1.five');
    expect(useNewspaperStore.getState().loadState).toBe('loading');
  });

  it('a board carrying an error lands in the error state', () => {
    useNewspaperStore.getState().setBoard({ ...BOARD, error: 'HTTP 404' });
    expect(useNewspaperStore.getState().loadState).toBe('error');
  });

  it('a board clears the posting flag — the answer ends the round-trip', () => {
    useNewspaperStore.getState().setPosting(true);
    useNewspaperStore.getState().setBoard(BOARD);
    expect(useNewspaperStore.getState().isPosting).toBe(false);
  });

  it('reset clears everything', () => {
    useNewspaperStore.getState().openFor(CONTEXT);
    useNewspaperStore.getState().setBoard(BOARD);
    useNewspaperStore.getState().reset();
    expect(useNewspaperStore.getState().context).toBeNull();
    expect(useNewspaperStore.getState().board).toBeNull();
  });
});
