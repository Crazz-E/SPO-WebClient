/**
 * useCameraHistory — feeds the map store's Back / Next history from the camera (N2).
 *
 * Polls the renderer's camera position once a second while the game screen is mounted; the
 * store ignores nudges (`HISTORY_MIN_MOVE`), so panning around one spot makes one entry and a
 * real trip makes another. No server traffic is involved.
 */

import { useEffect } from 'react';
import { useMapStore } from '../store/map-store';

export const CAMERA_POLL_MS = 1000;

export function useCameraHistory(): void {
  useEffect(() => {
    const tick = () => {
      const { source, recordPosition } = useMapStore.getState();
      if (!source) return;
      const pos = source.getCameraPosition();
      recordPosition(Math.round(pos.x), Math.round(pos.y));
    };
    tick();
    const t = setInterval(tick, CAMERA_POLL_MS);
    return () => clearInterval(t);
  }, []);
}
