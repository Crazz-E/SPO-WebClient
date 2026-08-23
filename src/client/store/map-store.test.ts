import { useMapStore, HISTORY_MAX, HISTORY_MIN_MOVE } from './map-store';

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
