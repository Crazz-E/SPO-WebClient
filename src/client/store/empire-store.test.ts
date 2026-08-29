import { useEmpireStore } from './empire-store';

const link = (id: number) => ({ id, name: `Link ${id}`, x: 1, y: 2, path: String(id) });
const folder = (id: number) => ({ id, name: `Folder ${id}`, path: String(id) });

describe('empire-store', () => {
  beforeEach(() => {
    useEmpireStore.getState().reset();
  });

  it('sets both facilities and folders together', () => {
    useEmpireStore.getState().setFacilities([link(1)], [folder(2)]);
    const state = useEmpireStore.getState();
    expect(state.facilities).toEqual([link(1)]);
    expect(state.folders).toEqual([folder(2)]);
    expect(state.isLoading).toBe(false);
  });

  it('defaults folders to empty when a caller only supplies facilities', () => {
    useEmpireStore.getState().setFacilities([link(1)]);
    expect(useEmpireStore.getState().folders).toEqual([]);
  });

  it('reset clears facilities and folders back to empty', () => {
    useEmpireStore.getState().setFacilities([link(1)], [folder(2)]);
    useEmpireStore.getState().reset();
    const state = useEmpireStore.getState();
    expect(state.facilities).toEqual([]);
    expect(state.folders).toEqual([]);
    expect(state.isLoading).toBe(false);
  });
});
