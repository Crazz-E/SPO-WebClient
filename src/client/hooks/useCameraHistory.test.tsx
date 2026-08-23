import { renderHook, act } from '@testing-library/react';
import { useCameraHistory, CAMERA_POLL_MS } from './useCameraHistory';
import { useMapStore } from '../store/map-store';

describe('useCameraHistory', () => {
  beforeEach(() => { jest.useFakeTimers(); useMapStore.getState().reset(); });
  afterEach(() => jest.useRealTimers());

  it('records the camera position on mount and then once a second, ignoring nudges', () => {
    const src = { camera: { x: 100.4, y: 50.6 }, getCameraPosition() { return this.camera; } };
    useMapStore.getState().setSource(src as never);
    const { unmount } = renderHook(() => useCameraHistory());
    expect(useMapStore.getState().history).toEqual([{ x: 100, y: 51 }]);
    src.camera = { x: 103, y: 51 };
    act(() => { jest.advanceTimersByTime(CAMERA_POLL_MS); });
    expect(useMapStore.getState().history).toHaveLength(1);
    src.camera = { x: 300, y: 51 };
    act(() => { jest.advanceTimersByTime(CAMERA_POLL_MS); });
    expect(useMapStore.getState().history).toHaveLength(2);
    unmount();
    src.camera = { x: 900, y: 900 };
    act(() => { jest.advanceTimersByTime(CAMERA_POLL_MS * 3); });
    expect(useMapStore.getState().history).toHaveLength(2);
  });

  it('does nothing without a source', () => {
    renderHook(() => useCameraHistory());
    act(() => { jest.advanceTimersByTime(CAMERA_POLL_MS); });
    expect(useMapStore.getState().history).toEqual([]);
  });
});
