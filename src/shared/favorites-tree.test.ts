import { flattenFavoriteLinks, flattenFolders } from './favorites-tree';
import type { FavoritesItem } from './types';

const link = (id: number, name: string, path: string): FavoritesItem =>
  ({ id, name, x: id, y: id, path });
const folder = (id: number, name: string, path: string, children: FavoritesItem[] = []): FavoritesItem =>
  ({ id, name, x: 0, y: 0, path, isFolder: true, children });

describe('flattenFavoriteLinks', () => {
  it('returns a flat list unchanged', () => {
    const list = [link(1, 'A', '1'), link(2, 'B', '2')];
    expect(flattenFavoriteLinks(list)).toEqual(list);
  });

  it('descends folders and omits them, depth-first', () => {
    const tree = [
      link(1, 'Root link', '1'),
      folder(10, 'Folder', '10', [
        link(11, 'Nested', '10/11'),
        folder(12, 'Sub', '10/12', [link(13, 'Deep', '10/12/13')]),
      ]),
    ];
    expect(flattenFavoriteLinks(tree).map(f => f.id)).toEqual([1, 11, 13]);
  });

  it('returns [] for an empty tree', () => {
    expect(flattenFavoriteLinks([])).toEqual([]);
  });

  it('is idempotent on a flat list', () => {
    const list = [link(1, 'A', '1')];
    expect(flattenFavoriteLinks(flattenFavoriteLinks(list))).toEqual(list);
  });
});

describe('flattenFolders', () => {
  it('returns [] when there are no folders', () => {
    expect(flattenFolders([link(1, 'A', '1')])).toEqual([]);
  });

  it('lists every folder, parent before children, with nesting depth', () => {
    const tree = [
      folder(10, 'Folder', '10', [
        link(11, 'Nested', '10/11'),
        folder(12, 'Sub', '10/12'),
      ]),
      folder(20, 'Other', '20'),
    ];
    expect(flattenFolders(tree)).toEqual([
      { folder: tree[0], depth: 0 },
      { folder: (tree[0].children as FavoritesItem[])[1], depth: 1 },
      { folder: tree[1], depth: 0 },
    ]);
  });
});
