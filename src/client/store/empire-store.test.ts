import { useEmpireStore } from './empire-store';
import type { FavoritesItem } from '@/shared/types';

const link = (id: number, name: string, path: string): FavoritesItem =>
  ({ id, name, x: id, y: id, path });
const folder = (id: number, name: string, path: string, children: FavoritesItem[] = []): FavoritesItem =>
  ({ id, name, x: 0, y: 0, path, isFolder: true, children });

describe('useEmpireStore', () => {
  beforeEach(() => useEmpireStore.getState().reset());

  it('keeps the tree verbatim and derives facilities as the flattened links', () => {
    const tree = [link(1, 'Root', '1'), folder(10, 'Folder', '10', [link(11, 'Nested', '10/11')])];

    useEmpireStore.getState().setFacilities(tree);

    expect(useEmpireStore.getState().tree).toEqual(tree);
    expect(useEmpireStore.getState().facilities.map(f => f.id)).toEqual([1, 11]);
    expect(useEmpireStore.getState().isLoading).toBe(false);
  });

  it('reset clears both slices', () => {
    useEmpireStore.getState().setFacilities([link(1, 'Root', '1')]);
    useEmpireStore.getState().reset();
    expect(useEmpireStore.getState().tree).toEqual([]);
    expect(useEmpireStore.getState().facilities).toEqual([]);
  });

  it('setLoading toggles isLoading independently', () => {
    useEmpireStore.getState().setLoading(true);
    expect(useEmpireStore.getState().isLoading).toBe(true);
  });
});
