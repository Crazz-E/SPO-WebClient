import { useMapStore, HISTORY_MAX, HISTORY_MIN_MOVE, BOOKMARKS_MAX, BOOKMARKS_KEY_PREFIX } from './map-store';

describe('map store — camera history (Back / Next)', () => {
  beforeEach(() => useMapStore.getState().reset());

  it('records trips, ignores nudges, and walks back and forward', () => {
    const s = useMapStore.getState();
    s.recordPosition(100, 100);
    s.recordPosition(100 + HISTORY_MIN_MOVE - 1, 100); // a nudge
    s.recordPosition(300, 300);
    s.recordPosition(500, 100);
    expect(useMapStore.getState().history).toEqual([{ x: 100, y: 100 }, { x: 300, y: 300 }, { x: 500, y: 100 }]);
    expect(useMapStore.getState().goBack()).toEqual({ x: 300, y: 300 });
    expect(useMapStore.getState().goBack()).toEqual({ x: 100, y: 100 });
    expect(useMapStore.getState().goBack()).toBeNull();
    expect(useMapStore.getState().goNext()).toEqual({ x: 300, y: 300 });
    expect(useMapStore.getState().goNext()).toEqual({ x: 500, y: 100 });
    expect(useMapStore.getState().goNext()).toBeNull();
  });

  it('a new trip after going back drops the forward entries', () => {
    const s = useMapStore.getState();
    s.recordPosition(0, 0);
    s.recordPosition(50, 50);
    s.recordPosition(90, 90);
    useMapStore.getState().goBack();
    useMapStore.getState().recordPosition(200, 200);
    expect(useMapStore.getState().history).toEqual([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 200, y: 200 }]);
    expect(useMapStore.getState().goNext()).toBeNull();
  });

  it('keeps the last HISTORY_MAX entries', () => {
    for (let i = 0; i <= HISTORY_MAX + 10; i++) useMapStore.getState().recordPosition(i * 10, 0);
    const h = useMapStore.getState().history;
    expect(h).toHaveLength(HISTORY_MAX);
    expect(h[h.length - 1]).toEqual({ x: (HISTORY_MAX + 10) * 10, y: 0 });
    expect(useMapStore.getState().historyIndex).toBe(HISTORY_MAX - 1);
  });

  it('holds the renderer source', () => {
    const fake = { getCameraPosition: () => ({ x: 1, y: 2 }) } as never;
    useMapStore.getState().setSource(fake);
    expect(useMapStore.getState().source).toBe(fake);
    useMapStore.getState().reset();
    expect(useMapStore.getState().source).toBeNull();
  });
});

describe('map store — bookmarks (local, per world and player)', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
    useMapStore.getState().reset();
  });
  afterEach(() => { delete (globalThis as unknown as { localStorage?: unknown }).localStorage; });

  it('adds, renames, removes, and persists under the world/player key', () => {
    const s = useMapStore.getState();
    expect(s.addBookmark('x', 1, 1)).toBeNull(); // nothing loaded yet
    s.loadBookmarks('planitia', 'SPO_test3');
    const bm = useMapStore.getState().addBookmark('  Cotton farms ', 120, 340);
    expect(bm?.name).toBe('Cotton farms');
    expect(useMapStore.getState().addBookmark('', 5, 6)?.name).toBe('(5, 6)');
    useMapStore.getState().renameBookmark(bm!.id, 'Farms');
    useMapStore.getState().renameBookmark(bm!.id, '   '); // ignored
    expect(useMapStore.getState().bookmarks[0].name).toBe('Farms');
    const saved = JSON.parse(store.get(`${BOOKMARKS_KEY_PREFIX}planitia.SPO_test3`) ?? '[]');
    expect(saved).toHaveLength(2);
    useMapStore.getState().removeBookmark(bm!.id);
    expect(useMapStore.getState().bookmarks).toHaveLength(1);
    // another player on the same world has their own list; coming back reloads
    useMapStore.getState().loadBookmarks('planitia', 'Crazz');
    expect(useMapStore.getState().bookmarks).toEqual([]);
    useMapStore.getState().loadBookmarks('planitia', 'SPO_test3');
    expect(useMapStore.getState().bookmarks).toHaveLength(1);
    useMapStore.getState().loadBookmarks('planitia', 'SPO_test3'); // same key: no reload
  });

  it('reads defensively: garbage, non-arrays and malformed rows are dropped; ids are minted', () => {
    store.set(`${BOOKMARKS_KEY_PREFIX}w.p`, 'not json');
    useMapStore.getState().loadBookmarks('w', 'p');
    expect(useMapStore.getState().bookmarks).toEqual([]);
    useMapStore.getState().reset();
    store.set(`${BOOKMARKS_KEY_PREFIX}w.p`, JSON.stringify({ a: 1 }));
    useMapStore.getState().loadBookmarks('w', 'p');
    expect(useMapStore.getState().bookmarks).toEqual([]);
    useMapStore.getState().reset();
    store.set(`${BOOKMARKS_KEY_PREFIX}w.p`, JSON.stringify([{ name: 'ok', x: 1, y: 2 }, { name: 3, x: 1, y: 2 }, null, { name: 'nan', x: 'a', y: 2 }]));
    useMapStore.getState().loadBookmarks('w', 'p');
    expect(useMapStore.getState().bookmarks).toEqual([{ id: 'bm-0-1-2', name: 'ok', x: 1, y: 2 }]);
  });

  it('caps the list and survives a storage that throws', () => {
    useMapStore.getState().loadBookmarks('w', 'p');
    for (let i = 0; i < BOOKMARKS_MAX + 3; i++) useMapStore.getState().addBookmark(`b${i}`, i, i);
    expect(useMapStore.getState().bookmarks).toHaveLength(BOOKMARKS_MAX);
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => { throw new Error('nope'); },
      setItem: () => { throw new Error('nope'); },
    };
    useMapStore.getState().removeBookmark(useMapStore.getState().bookmarks[0].id);
    expect(useMapStore.getState().bookmarks).toHaveLength(BOOKMARKS_MAX - 1);
    useMapStore.getState().reset();
    useMapStore.getState().loadBookmarks('w2', 'p2');
    expect(useMapStore.getState().bookmarks).toEqual([]);
    useMapStore.getState().renameBookmark('nothing', 'x');
    useMapStore.getState().removeBookmark('nothing');
  });

  it('works in memory when there is no localStorage at all', () => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    useMapStore.getState().loadBookmarks('w', 'p');
    expect(useMapStore.getState().addBookmark('mem', 1, 1)?.name).toBe('mem');
  });
});
