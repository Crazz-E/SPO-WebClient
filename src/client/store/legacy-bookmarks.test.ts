/**
 * Tests for the legacy local bookmark reader.
 *
 * The only job left to this module is to hand the migration a list it can trust
 * and then forget the key. A corrupt or hostile value must read as "nothing to
 * migrate", never as a crash and never as a reason to lose the server list.
 */

import { bookmarksKey, readLegacyBookmarks, clearLegacyBookmarks, BOOKMARKS_KEY_PREFIX } from './legacy-bookmarks';

const store = new Map<string, string>();

function installStorage(impl?: Partial<Storage>) {
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    ...impl,
  };
}

beforeEach(() => {
  store.clear();
  installStorage();
});
afterEach(() => { delete (globalThis as unknown as { localStorage?: unknown }).localStorage; });

describe('bookmarksKey', () => {
  it('is one key per world and player, with a placeholder before login', () => {
    expect(bookmarksKey('planitia', 'SPO_test3')).toBe(`${BOOKMARKS_KEY_PREFIX}planitia.SPO_test3`);
    expect(bookmarksKey('', '')).toBe(`${BOOKMARKS_KEY_PREFIX}world.player`);
  });
});

describe('readLegacyBookmarks', () => {
  it('reads the list the old Map surface wrote, dropping the local id', () => {
    store.set(`${BOOKMARKS_KEY_PREFIX}planitia.SPO_test3`, JSON.stringify([
      { id: 'bm-1-120-340', name: 'Cotton farms', x: 120, y: 340 },
      { id: 'bm-2-5-6', name: 'Home', x: 5, y: 6 },
    ]));
    expect(readLegacyBookmarks('planitia', 'SPO_test3')).toEqual([
      { name: 'Cotton farms', x: 120, y: 340 },
      { name: 'Home', x: 5, y: 6 },
    ]);
  });

  it('answers an empty list for a missing key, garbage, a non-array, and malformed rows', () => {
    expect(readLegacyBookmarks('w', 'p')).toEqual([]);
    store.set(`${BOOKMARKS_KEY_PREFIX}w.p`, 'not json');
    expect(readLegacyBookmarks('w', 'p')).toEqual([]);
    store.set(`${BOOKMARKS_KEY_PREFIX}w.p`, JSON.stringify({ a: 1 }));
    expect(readLegacyBookmarks('w', 'p')).toEqual([]);
    store.set(`${BOOKMARKS_KEY_PREFIX}w.p`, JSON.stringify([
      { name: 'ok', x: 1, y: 2 }, { name: 3, x: 1, y: 2 }, null, { name: 'nan', x: 'a', y: 2 },
    ]));
    expect(readLegacyBookmarks('w', 'p')).toEqual([{ name: 'ok', x: 1, y: 2 }]);
  });

  it('survives a storage that throws, and a browser with no storage at all', () => {
    installStorage({ getItem: () => { throw new Error('nope'); } });
    expect(readLegacyBookmarks('w', 'p')).toEqual([]);
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    expect(readLegacyBookmarks('w', 'p')).toEqual([]);
  });
});

describe('clearLegacyBookmarks', () => {
  it('drops the key, and swallows a storage that refuses', () => {
    store.set(`${BOOKMARKS_KEY_PREFIX}w.p`, JSON.stringify([{ name: 'ok', x: 1, y: 2 }]));
    clearLegacyBookmarks('w', 'p');
    expect(store.has(`${BOOKMARKS_KEY_PREFIX}w.p`)).toBe(false);
    installStorage({ removeItem: () => { throw new Error('nope'); } });
    expect(() => clearLegacyBookmarks('w', 'p')).not.toThrow();
  });
});
