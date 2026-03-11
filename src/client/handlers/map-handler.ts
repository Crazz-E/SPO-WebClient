/**
 * Map Handler — extracted from StarpeaceClient.
 *
 * Handles map area loading, surface fetching, zone overlays,
 * city zones toggle, and map refresh.
 */

import {
  WsMessageType,
  WsReqMapLoad,
  WsReqGetSurface,
  WsRespSurfaceData,
  SurfaceType,
} from '../../shared/types';
import { toErrorMessage } from '../../shared/error-utils';
import { ClientBridge } from '../bridge/client-bridge';
import type { ClientHandlerContext } from './client-context';

export function loadMapArea(ctx: ClientHandlerContext, x?: number, y?: number, w: number = 64, h: number = 64): void {
  const coords = x !== undefined && y !== undefined ? ` at (${x}, ${y})` : ' at player position';
  ClientBridge.log('Map', `Loading area${coords} ${w}x${h}...`);

  const req: WsReqMapLoad = {
    type: WsMessageType.REQ_MAP_LOAD,
    x: x !== undefined ? x : 0,
    y: y !== undefined ? y : 0,
    width: w,
    height: h
  };

  ctx.rawSend(req);

  // When any overlay is active, also fetch surface data for this area
  const activeSurface = ctx.isCityZonesEnabled ? SurfaceType.ZONES : ctx.activeOverlayType;
  if (activeSurface !== null && x !== undefined && y !== undefined) {
    fetchSurfaceForArea(ctx, activeSurface, x, y, x + w, y + h);
  }
}

export async function fetchSurfaceForArea(ctx: ClientHandlerContext, surfaceType: SurfaceType, x1: number, y1: number, x2: number, y2: number): Promise<void> {
  try {
    const req: WsReqGetSurface = {
      type: WsMessageType.REQ_GET_SURFACE,
      surfaceType,
      x1, y1, x2, y2,
    };
    const response = await ctx.sendRequest(req) as WsRespSurfaceData;
    const renderer = ctx.getRenderer();
    const stillActive = ctx.isCityZonesEnabled
      ? surfaceType === SurfaceType.ZONES
      : surfaceType === ctx.activeOverlayType;
    if (renderer && stillActive) {
      const isHeatmap = surfaceType !== SurfaceType.ZONES && surfaceType !== SurfaceType.TOWNS;
      renderer.setZoneOverlay(true, response.data, x1, y1, isHeatmap, surfaceType === SurfaceType.TOWNS);
    }
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to fetch ${surfaceType} surface: ${toErrorMessage(err)}`);
  }
}

export function loadAlignedMapArea(ctx: ClientHandlerContext, x: number, y: number, margin: number = 0): void {
  const zoneSize = 64;
  const alignedX = Math.floor(x / zoneSize) * zoneSize;
  const alignedY = Math.floor(y / zoneSize) * zoneSize;

  loadMapArea(ctx, alignedX, alignedY, zoneSize, zoneSize);

  if (margin <= 0) return;

  const xInZone = x - alignedX;
  const yInZone = y - alignedY;

  const needRight = xInZone + margin >= zoneSize;
  const needBelow = yInZone + margin >= zoneSize;

  if (needRight) {
    loadMapArea(ctx, alignedX + zoneSize, alignedY, zoneSize, zoneSize);
  }
  if (needBelow) {
    loadMapArea(ctx, alignedX, alignedY + zoneSize, zoneSize, zoneSize);
  }
  if (needRight && needBelow) {
    loadMapArea(ctx, alignedX + zoneSize, alignedY + zoneSize, zoneSize, zoneSize);
  }
}

export function loadAlignedMapAreaForRect(ctx: ClientHandlerContext, x1: number, y1: number, x2: number, y2: number): void {
  const zoneSize = 64;
  const minAX = Math.floor(Math.min(x1, x2) / zoneSize) * zoneSize;
  const minAY = Math.floor(Math.min(y1, y2) / zoneSize) * zoneSize;
  const maxAX = Math.floor(Math.max(x1, x2) / zoneSize) * zoneSize;
  const maxAY = Math.floor(Math.max(y1, y2) / zoneSize) * zoneSize;

  for (let ax = minAX; ax <= maxAX; ax += zoneSize) {
    for (let ay = minAY; ay <= maxAY; ay += zoneSize) {
      loadMapArea(ctx, ax, ay, zoneSize, zoneSize);
    }
  }
}

export function toggleCityZones(ctx: ClientHandlerContext): void {
  ctx.isCityZonesEnabled = !ctx.isCityZonesEnabled;
  // Store is updated automatically via ctx.isCityZonesEnabled setter
  ClientBridge.log('Zones', `City Zones overlay ${ctx.isCityZonesEnabled ? 'enabled' : 'disabled'}`);

  if (ctx.isCityZonesEnabled && ctx.activeOverlayType !== null) {
    ctx.activeOverlayType = null;
    // Store is updated automatically via ctx.activeOverlayType setter
    toggleZoneOverlay(ctx, false, SurfaceType.ZONES);
  }

  if (ctx.isCityZonesEnabled) {
    toggleZoneOverlay(ctx, true, SurfaceType.ZONES);
  } else {
    toggleZoneOverlay(ctx, false, SurfaceType.ZONES);
  }
}

export function setOverlay(ctx: ClientHandlerContext, surfaceType: SurfaceType | null): void {
  // Toggle off if same overlay selected
  if (surfaceType !== null && surfaceType === ctx.activeOverlayType) {
    surfaceType = null;
  }

  if (ctx.activeOverlayType !== null) {
    toggleZoneOverlay(ctx, false, ctx.activeOverlayType);
  }

  ctx.activeOverlayType = surfaceType;
  // Store is updated automatically via ctx.activeOverlayType setter

  if (surfaceType === null) {
    ClientBridge.log('Overlay', 'Overlay disabled');
    return;
  }

  if (ctx.isCityZonesEnabled) {
    ctx.isCityZonesEnabled = false;
    // Store is updated automatically via ctx.isCityZonesEnabled setter
    ClientBridge.log('Zones', 'City Zones disabled (overlay activated)');
  }

  ClientBridge.log('Overlay', `Enabling ${surfaceType} overlay`);
  toggleZoneOverlay(ctx, true, surfaceType);
}

export function toggleZoneOverlay(ctx: ClientHandlerContext, enabled: boolean, surfaceType: SurfaceType): void {
  ClientBridge.log('Overlay', enabled ? `Enabling ${surfaceType} overlay` : 'Disabling overlay');

  const renderer = ctx.getRenderer();
  if (!renderer) return;

  if (!enabled) {
    renderer.setZoneOverlay(false);
    return;
  }

  const isHeatmap = surfaceType !== SurfaceType.ZONES && surfaceType !== SurfaceType.TOWNS;
  renderer.setZoneOverlay(true, undefined, undefined, undefined, isHeatmap, surfaceType === SurfaceType.TOWNS);
  const loadedKeys = renderer.getLoadedZoneKeys();
  for (const key of loadedKeys) {
    const [x, y] = key.split(',').map(Number);
    fetchSurfaceForArea(ctx, surfaceType, x, y, x + 64, y + 64);
  }

  ClientBridge.log('Overlay', `Fetching ${surfaceType} overlay for ${loadedKeys.length} loaded zones`);
}

export function refreshMapData(ctx: ClientHandlerContext): void {
  ClientBridge.log('Map', 'Refreshing map data...');

  const renderer = ctx.getRenderer();
  if (!renderer || !renderer.getCameraPosition) {
    ClientBridge.log('Error', 'Cannot refresh: renderer not available');
    return;
  }

  const cameraPos = renderer.getCameraPosition();
  const x = Math.floor(cameraPos.x);
  const y = Math.floor(cameraPos.y);

  renderer.invalidateArea(x - 64, y - 64, x + 64, y + 64);
  renderer.triggerZoneCheck();

  ctx.showNotification('Map refreshed', 'info');
}
