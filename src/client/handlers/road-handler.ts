/**
 * Road Handler — extracted from StarpeaceClient.
 *
 * Handles road building mode, road demolition mode, and road segment operations.
 */

import {
  WsMessageType,
  WsReqBuildRoad,
  WsRespBuildRoad,
  WsReqDemolishRoad,
  WsRespDemolishRoad,
  WsReqDemolishRoadArea,
  WsRespDemolishRoadArea,
} from '../../shared/types';
import { toErrorMessage } from '../../shared/error-utils';
import { ClientBridge } from '../bridge/client-bridge';
import type { ClientHandlerContext } from './client-context';
import { setupEscapeHandler } from './handler-utils';

export function toggleRoadBuildingMode(ctx: ClientHandlerContext): void {
  ctx.isRoadBuildingMode = !ctx.isRoadBuildingMode;

  const renderer = ctx.getRenderer();
  if (renderer) {
    renderer.setRoadDrawingMode(ctx.isRoadBuildingMode);

    if (ctx.isRoadBuildingMode) {
      if (ctx.currentBuildingToPlace) {
        ctx.cancelBuildingPlacement();
      }

      renderer.setRoadSegmentCompleteCallback((x1, y1, x2, y2) => {
        buildRoadSegment(ctx, x1, y1, x2, y2);
      });

      renderer.setCancelRoadDrawingCallback(() => {
        cancelRoadBuildingMode(ctx);
      });

      setupRoadBuildingKeyboardHandler(ctx);

      ClientBridge.log('Road', 'Road building mode enabled. Click and drag to draw roads. Right-click or press ESC to cancel.');
    } else {
      ClientBridge.log('Road', 'Road building mode disabled');
    }
  }

  // Store is updated automatically via ctx.isRoadBuildingMode setter
}

export function cancelRoadBuildingMode(ctx: ClientHandlerContext): void {
  ctx.isRoadBuildingMode = false;

  const renderer = ctx.getRenderer();
  if (renderer) {
    renderer.setRoadDrawingMode(false);
  }

  // Store is updated automatically via ctx.isRoadBuildingMode setter
  ClientBridge.log('Road', 'Road building mode cancelled');
}

async function buildRoadSegment(ctx: ClientHandlerContext, x1: number, y1: number, x2: number, y2: number): Promise<void> {
  if (ctx.isBuildingRoad) return;

  const renderer = ctx.getRenderer();
  if (renderer) {
    const validation = renderer.validateRoadPath(x1, y1, x2, y2);
    if (!validation.valid) {
      ClientBridge.log('Road', `Cannot build road: ${validation.error}`);
      ctx.showNotification(validation.error || 'Invalid road placement', 'error');
      return;
    }
  }

  ctx.isBuildingRoad = true;
  ClientBridge.log('Road', `Building road from (${x1}, ${y1}) to (${x2}, ${y2})...`);

  try {
    const req: WsReqBuildRoad = {
      type: WsMessageType.REQ_BUILD_ROAD,
      x1, y1, x2, y2
    };

    const response = await ctx.sendRequest(req) as WsRespBuildRoad;

    if (response.success && !response.partial) {
      ClientBridge.log('Road', `Road built: ${response.tileCount} tiles, cost $${response.cost}`);
      ctx.showNotification(`Road built: ${response.tileCount} tiles`, 'success');
      ctx.loadAlignedMapAreaForRect(x1, y1, x2, y2);
    } else if (response.success && response.partial) {
      ClientBridge.log('Road', `Road partially built: ${response.tileCount} tiles, cost $${response.cost}`);
      ctx.showNotification(response.message || `Road partially built (${response.tileCount} tiles)`, 'warning');
      ctx.loadAlignedMapAreaForRect(x1, y1, x2, y2);
    } else {
      ClientBridge.log('Error', response.message || 'Failed to build road');
      ctx.showNotification(response.message || 'Failed to build road', 'error');
      ctx.loadAlignedMapAreaForRect(x1, y1, x2, y2);
    }
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to build road: ${toErrorMessage(err)}`);
  } finally {
    ctx.isBuildingRoad = false;
  }
}

function setupRoadBuildingKeyboardHandler(ctx: ClientHandlerContext): void {
  setupEscapeHandler(
    () => ctx.isRoadBuildingMode,
    () => cancelRoadBuildingMode(ctx),
  );
}

// ── Road Demolition ─────────────────────────────────────────────────────────

export function toggleRoadDemolishMode(ctx: ClientHandlerContext): void {
  ctx.isRoadDemolishMode = !ctx.isRoadDemolishMode;

  if (ctx.isRoadDemolishMode && ctx.isRoadBuildingMode) {
    cancelRoadBuildingMode(ctx);
  }

  const renderer = ctx.getRenderer();
  if (renderer) {
    if (ctx.isRoadDemolishMode) {
      if (ctx.currentBuildingToPlace) {
        ctx.cancelBuildingPlacement();
      }

      renderer.setRoadDemolishClickCallback((x: number, y: number) => {
        demolishRoadAt(ctx, x, y);
      });
      renderer.setRoadDemolishAreaCompleteCallback((x1: number, y1: number, x2: number, y2: number) => {
        demolishRoadArea(ctx, x1, y1, x2, y2);
      });
      renderer.setCancelRoadDemolishCallback(() => {
        cancelRoadDemolishMode(ctx);
      });

      ClientBridge.log('Road', 'Road demolish mode enabled. Click or drag to select road tiles. Right-click or press ESC to cancel.');
    } else {
      renderer.setRoadDemolishClickCallback(null);
      renderer.setRoadDemolishAreaCompleteCallback(null);
      ClientBridge.log('Road', 'Road demolish mode disabled');
    }
  }

  // Store is updated automatically via ctx.isRoadDemolishMode setter
}

export function cancelRoadDemolishMode(ctx: ClientHandlerContext): void {
  ctx.isRoadDemolishMode = false;

  const renderer = ctx.getRenderer();
  if (renderer) {
    renderer.setRoadDemolishClickCallback(null);
    renderer.setRoadDemolishAreaCompleteCallback(null);
    renderer.setCancelRoadDemolishCallback(null);
  }

  // Store is updated automatically via ctx.isRoadDemolishMode setter
}

async function demolishRoadAt(ctx: ClientHandlerContext, x: number, y: number): Promise<void> {
  ClientBridge.log('Road', `Demolishing road at (${x}, ${y})...`);

  try {
    const req: WsReqDemolishRoad = {
      type: WsMessageType.REQ_DEMOLISH_ROAD,
      x, y
    };

    const response = await ctx.sendRequest(req) as WsRespDemolishRoad;

    if (response.success) {
      ClientBridge.log('Road', `Road demolished at (${x}, ${y})`);
      ctx.showNotification('Road demolished', 'success');
      ctx.loadAlignedMapArea(x, y);
    } else {
      ClientBridge.log('Error', response.message || 'Failed to demolish road');
      ctx.showNotification(response.message || 'Failed to demolish road', 'error');
    }
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to demolish road: ${toErrorMessage(err)}`);
    ctx.showNotification(`Failed to demolish road: ${toErrorMessage(err)}`, 'error');
  }
}

async function demolishRoadArea(ctx: ClientHandlerContext, x1: number, y1: number, x2: number, y2: number): Promise<void> {
  const nx1 = Math.min(x1, x2);
  const ny1 = Math.min(y1, y2);
  const nx2 = Math.max(x1, x2);
  const ny2 = Math.max(y1, y2);

  ClientBridge.log('Road', `Demolishing road area (${nx1},${ny1})→(${nx2},${ny2})...`);

  try {
    const req: WsReqDemolishRoadArea = {
      type: WsMessageType.REQ_DEMOLISH_ROAD_AREA,
      x1: nx1, y1: ny1, x2: nx2, y2: ny2
    };

    const response = await ctx.sendRequest(req) as WsRespDemolishRoadArea;

    if (response.success) {
      ClientBridge.log('Road', `Road area demolished`);
      ctx.showNotification('Roads demolished', 'success');
      ctx.loadAlignedMapAreaForRect(nx1, ny1, nx2, ny2);
    } else {
      ClientBridge.log('Error', response.message || 'Failed to demolish roads');
      ctx.showNotification(response.message || 'Failed to demolish roads', 'error');
    }
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to demolish road area: ${toErrorMessage(err)}`);
    ctx.showNotification(`Failed to demolish roads: ${toErrorMessage(err)}`, 'error');
  }
}
