/**
 * Tests for parseFavoritesResponse — parses RDOFavoritesGetSubItems wire format.
 *
 * Wire format: items separated by \x02, fields by \x01.
 * Fields per item: id, kind, name, info, subFolderCount
 * Link info: "displayName,x,y,select"
 *
 * Each item also carries its Location — the path a delete or a rename
 * addresses (`TFavorites.LocateItem`, `Kernel/Favorites.pas:312-334`). At the
 * root, which is the only level the client reads today, that path is the id.
 */

import { parseFavoritesResponse, parseFavoritesEntries } from '../spo_session';

// Helper to build a favorites item string in wire format
function favItem(id: number, kind: number, name: string, info: string, subFolderCount: number): string {
  return [id, kind, name, info, subFolderCount, ''].join('\x01');
}

function favLink(id: number, name: string, x: number, y: number, select: number = 1): string {
  return favItem(id, 1, name, `${name},${x},${y},${select}`, 0);
}

function favFolder(id: number, name: string, subCount: number): string {
  return favItem(id, 0, name, '', subCount);
}

describe('parseFavoritesResponse', () => {
  it('returns empty array for empty string', () => {
    expect(parseFavoritesResponse('')).toEqual([]);
  });

  it('parses a single link item', () => {
    const raw = favLink(1, 'Company Headquarters', 670, 116);
    const result = parseFavoritesResponse(raw);

    expect(result).toEqual([
      { id: 1, name: 'Company Headquarters', x: 670, y: 116, path: '1' },
    ]);
  });

  it('parses multiple link items separated by \\x02', () => {
    const raw = [
      favLink(1, 'Company Headquarters', 670, 116),
      favLink(2, "Caesar's Atrium", 615, 96),
      favLink(3, 'Delmar Apts.', 687, 162),
    ].join('\x02');

    const result = parseFavoritesResponse(raw);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: 1, name: 'Company Headquarters', x: 670, y: 116, path: '1' });
    expect(result[1]).toEqual({ id: 2, name: "Caesar's Atrium", x: 615, y: 96, path: '2' });
    expect(result[2]).toEqual({ id: 3, name: 'Delmar Apts.', x: 687, y: 162, path: '3' });
  });

  it('skips folder items (kind=0)', () => {
    const raw = [
      favFolder(100, 'My Folder', 2),
      favLink(1, 'Factory', 100, 200),
    ].join('\x02');

    const result = parseFavoritesResponse(raw);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 1, name: 'Factory', x: 100, y: 200, path: '1' });
  });

  it('handles name with commas in info cookie', () => {
    // If a building name contains a comma, it appears in the info cookie.
    // The parser should parse x,y from the end.
    const info = 'Building, Inc.,450,300,1';
    const raw = favItem(5, 1, 'Building, Inc.', info, 0);

    const result = parseFavoritesResponse(raw);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 5, name: 'Building, Inc.', x: 450, y: 300, path: '5' });
  });

  it('handles trailing \\x02 separator', () => {
    const raw = favLink(1, 'Farm 1', 641, 66) + '\x02';

    const result = parseFavoritesResponse(raw);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 1, name: 'Farm 1', x: 641, y: 66, path: '1' });
  });

  it('parses real trace data (from RDO capture)', () => {
    // Reconstructed from user-provided trace:
    // %1.1.Company Headquarters.Company Headquarters,670,116,1.0..2.1.Caesar's Atrium...
    // Where . = \x01 and .. = \x01\x02
    const raw = [
      favLink(1, 'Company Headquarters', 670, 116),
      favLink(2, "Caesar's Atrium", 615, 96),
      favLink(19, 'Farm 1', 641, 66),
      favLink(20, 'Dump', 653, 65),
      favLink(46, 'Bar 5', 461, 390),
    ].join('\x02');

    const result = parseFavoritesResponse(raw);

    expect(result).toHaveLength(5);
    expect(result[0].name).toBe('Company Headquarters');
    expect(result[0].x).toBe(670);
    expect(result[0].y).toBe(116);
    expect(result[4].name).toBe('Bar 5');
    expect(result[4].x).toBe(461);
    expect(result[4].y).toBe(390);
  });

  it('skips malformed entries gracefully', () => {
    const raw = [
      'bad',                                    // too few fields
      favLink(1, 'Good Entry', 100, 200),
      '\x01\x01\x01',                           // empty fields
    ].join('\x02');

    const result = parseFavoritesResponse(raw);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Good Entry');
  });

  it('nests the Location under the parent it was asked for', () => {
    // Not reachable from the UI yet — the client only ever lists the root —
    // but the parser is what would have to be right the day folders are, and
    // an id alone would address the wrong item one level down.
    const raw = favLink(7, 'Mart 3', 678, 159);

    expect(parseFavoritesResponse(raw, '100')[0].path).toBe('100/7');
    expect(parseFavoritesResponse(raw, '100/12')[0].path).toBe('100/12/7');
  });

  it('handles select=0 items', () => {
    const raw = favLink(7, 'Mart 3', 678, 159, 0);

    const result = parseFavoritesResponse(raw);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 7, name: 'Mart 3', x: 678, y: 159, path: '7' });
  });
});

describe('parseFavoritesEntries', () => {
  it('returns empty links and folders for empty string', () => {
    expect(parseFavoritesEntries('')).toEqual({ links: [], folders: [] });
  });

  it('separates folders from links, each carrying its own Location', () => {
    const raw = [
      favFolder(100, 'My Folder', 2),
      favLink(1, 'Factory', 100, 200),
    ].join('\x02');

    const { links, folders } = parseFavoritesEntries(raw);

    expect(links).toEqual([{ id: 1, name: 'Factory', x: 100, y: 200, path: '1' }]);
    expect(folders).toEqual([{ id: 100, name: 'My Folder', path: '100', subFolderCount: 2 }]);
  });

  it('nests a folder path under the parent it was asked for', () => {
    const raw = favFolder(5, 'Nested', 0);
    expect(parseFavoritesEntries(raw, '100').folders[0].path).toBe('100/5');
  });

  it('treats a non-numeric folder subFolderCount as zero rather than NaN', () => {
    const raw = [7, 0, 'Odd', '', 'x', ''].join('\x01');
    const { folders } = parseFavoritesEntries(raw);
    expect(folders).toEqual([{ id: 7, name: 'Odd', path: '7', subFolderCount: 0 }]);
  });

  it('skips a folder entry with a non-numeric id', () => {
    const raw = ['bad', 0, 'Odd', '', 0, ''].join('\x01');
    const { folders } = parseFavoritesEntries(raw);
    expect(folders).toEqual([]);
  });
});
