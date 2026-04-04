/**
 * Building Focus Handler — extracted from StarpeaceClient.
 *
 * Handles map clicks, building overlay (first click), inspector open (second click),
 * programmatic focus, and unfocus.
 */

import {
  WsMessageType,
  WsReqBuildingFocus,
  WsReqBuildingUnfocus,
  WsRespBuildingFocus,
} from '../../shared/types';
import { toErrorMessage } from '../../shared/error-utils';
import { ClientBridge } from '../bridge/client-bridge';
import { useBuildingStore } from '../store/building-store';
import { useUiStore } from '../store/ui-store';
import { getFacilityDimensionsCache } from '../facility-dimensions-cache';
import { isCivicBuilding } from '../../shared/building-details/civic-buildings';
import type { ClientHandlerContext } from './client-context';

export function handleMapClick(ctx: ClientHandlerContext, x: number, y: number, visualClass?: string): void {
  if (ctx.currentBuildingToPlace) {
    // Delegate to placement handler (placeBuilding is on ctx)
    // This is handled by the caller in client.ts
    return;
  }

  // Portal (visual class 6031/6032) is not inspectable
  if (visualClass === '6031' || visualClass === '6032') return;

  // Civic buildings skip overlay — open modal directly
  if (visualClass && isCivicBuilding(visualClass)) {
    ctx.focusBuilding(x, y, visualClass);
    return;
  }

  // When inspector is already open, single-click switches buildings in-place
  const inspectorOpen = useUiStore.getState().rightPanel === 'building';
  if (inspectorOpen) {
    const focused = useBuildingStore.getState().focusedBuilding;
    if (focused && focused.x === x && focused.y === y) return; // already inspecting this one
    switchInspectedBuilding(ctx, x, y, visualClass);
    return;
  }

  // Two-click flow: first click → overlay, second click → open inspector
  const overlayBuilding = useBuildingStore.getState().focusedBuilding;
  const isOverlay = useBuildingStore.getState().isOverlayMode;
  if (isOverlay && overlayBuilding && overlayBuilding.x === x && overlayBuilding.y === y) {
    openInspectorForFocused(ctx, x, y, visualClass);
  } else {
    showBuildingOverlay(ctx, x, y, visualClass);
  }
}

/** Switch to a different building while the inspector panel stays open. */
async function switchInspectedBuilding(ctx: ClientHandlerContext, x: number, y: number, visualClass?: string): Promise<void> {
  await showBuildingOverlay(ctx, x, y, visualClass);
  await openInspectorForFocused(ctx, x, y, visualClass);
}

export async function showBuildingOverlay(ctx: ClientHandlerContext, x: number, y: number, visualClass?: string): Promise<void> {
  if (ctx.isFocusingBuilding) return;
  ctx.isFocusingBuilding = true;
  ClientBridge.log('Building', `Requesting overlay at (${x}, ${y})`);

  try {
    // Unfocus previous building on the server
    if (ctx.currentFocusedBuilding) {
      // Invalidate any in-flight refresh for the old building so its stale
      // response doesn't overwrite the store after the new building loads.
      ctx.nextGeneration('buildingRefresh');
      const unfocusReq: WsReqBuildingUnfocus = { type: WsMessageType.REQ_BUILDING_UNFOCUS };
      ctx.rawSend(unfocusReq);
      ctx.currentFocusedBuilding = null;
      ctx.currentFocusedVisualClass = null;
    }

    const req: WsReqBuildingFocus = { type: WsMessageType.REQ_BUILDING_FOCUS, x, y };
    const response = await ctx.sendRequest(req) as WsRespBuildingFocus;

    ctx.currentFocusedBuilding = response.building;
    ctx.currentFocusedVisualClass = visualClass || null;

    // Enrich with footprint dimensions from local cache
    const vc = visualClass || '0';
    const dims = getFacilityDimensionsCache().getFacility(vc);
    response.building.xsize = dims?.xsize ?? 1;
    response.building.ysize = dims?.ysize ?? 1;
    response.building.visualClass = vc;

    ClientBridge.showBuildingOverlay(response.building);

    // Tell renderer which building is selected (gold footprint highlight)
    const selRenderer = ctx.getRenderer();
    if (selRenderer) {
      selRenderer.setSelectedBuilding(x, y);
    }

    // Speculative prefetch: start loading details in background so second click is instant
    const cacheKey = `${x},${y}`;
    ctx.speculativeBuildingDetails.clear();
    ctx.speculativeBuildingResolved.clear();
    const detailsPromise = ctx.requestBuildingDetails(x, y, vc);
    ctx.speculativeBuildingDetails.set(cacheKey, detailsPromise);
    detailsPromise.then((result) => {
      if (ctx.speculativeBuildingDetails.has(cacheKey)) {
        ctx.speculativeBuildingResolved.set(cacheKey, result);
      }
    });

    ClientBridge.log('Building', `Overlay: ${response.building.buildingName}`);
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to show overlay: ${toErrorMessage(err)}`);
  } finally {
    ctx.isFocusingBuilding = false;
  }
}

export async function openInspectorForFocused(ctx: ClientHandlerContext, x: number, y: number, visualClass?: string): Promise<void> {
  if (ctx.isFocusingBuilding) return;
  ctx.isFocusingBuilding = true;
  ClientBridge.log('Building', `Opening inspector at (${x}, ${y})`);

  const vc = visualClass || ctx.currentFocusedVisualClass || '0';
  const cacheKey = `${x},${y}`;

  // Check if speculative prefetch already completed (skip skeleton flash)
  const resolvedDetails = ctx.speculativeBuildingResolved.get(cacheKey);
  ctx.speculativeBuildingResolved.delete(cacheKey);
  const cachedPromise = ctx.speculativeBuildingDetails.get(cacheKey);
  ctx.speculativeBuildingDetails.delete(cacheKey);

  if (!resolvedDetails) {
    useBuildingStore.getState().setLoading(true);
  }

  // Open panel/modal
  if (isCivicBuilding(vc)) {
    useUiStore.getState().openModal('buildingInspector');
  } else {
    useUiStore.getState().openRightPanel('building');
  }

  try {
    const gen = ctx.nextGeneration('buildingDetails');

    const details = resolvedDetails
      ?? (cachedPromise ? await cachedPromise : await ctx.requestBuildingDetails(x, y, vc));

    if (!ctx.isCurrentGeneration('buildingDetails', gen)) return;

    const focusInfo = ctx.currentFocusedBuilding;

    if (details) {
      ClientBridge.showBuildingPanel(details, ctx.currentCompanyName, focusInfo ?? undefined);
      ClientBridge.log('Building', `Inspector opened: ${focusInfo?.buildingName}`);
    } else {
      const bld = useBuildingStore.getState();
      bld.setCurrentCompanyName(ctx.currentCompanyName);
      if (focusInfo) bld.setFocus(focusInfo);
      bld.setOverlayMode(false);
      ClientBridge.log('Building', `Inspector skeleton (details pending) for ${focusInfo?.buildingName}`);
      setTimeout(() => ctx.refreshBuildingDetails(x, y), 2000);
    }
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to open inspector: ${toErrorMessage(err)}`);
  } finally {
    ctx.isFocusingBuilding = false;
  }
}

export async function focusBuilding(ctx: ClientHandlerContext, x: number, y: number, visualClass?: string): Promise<void> {
  if (ctx.isFocusingBuilding) return;
  ctx.isFocusingBuilding = true;
  ClientBridge.log('Building', `Requesting focus at (${x}, ${y})`);

  try {
    if (ctx.currentFocusedBuilding) {
      ctx.nextGeneration('buildingRefresh');
      const unfocusReq: WsReqBuildingUnfocus = { type: WsMessageType.REQ_BUILDING_UNFOCUS };
      ctx.rawSend(unfocusReq);
      ctx.currentFocusedBuilding = null;
      ctx.currentFocusedVisualClass = null;
    }

    const renderer = ctx.getRenderer();
    renderer?.centerOn(x, y);

    if (!visualClass && renderer) {
      visualClass = renderer.getVisualClassAt(x, y) ?? undefined;
    }

    useBuildingStore.getState().setLoading(true);
    if (isCivicBuilding(visualClass || '0')) {
      useUiStore.getState().openModal('buildingInspector');
    } else {
      useUiStore.getState().openRightPanel('building');
    }

    const gen = ctx.nextGeneration('buildingDetails');
    const req: WsReqBuildingFocus = { type: WsMessageType.REQ_BUILDING_FOCUS, x, y };

    const [response, details] = await Promise.all([
      ctx.sendRequest(req) as Promise<WsRespBuildingFocus>,
      ctx.requestBuildingDetails(x, y, visualClass || '0'),
    ]);

    if (!ctx.isCurrentGeneration('buildingDetails', gen)) return;

    ctx.currentFocusedBuilding = response.building;
    ctx.currentFocusedVisualClass = visualClass || null;

    if (details) {
      ClientBridge.showBuildingPanel(details, ctx.currentCompanyName, response.building);
      ClientBridge.log('Building', `Focused: ${response.building.buildingName}`);
    } else {
      const bld = useBuildingStore.getState();
      bld.setCurrentCompanyName(ctx.currentCompanyName);
      bld.setFocus(response.building);
      bld.setOverlayMode(false);
      ClientBridge.log('Building', `Focused skeleton (details pending): ${response.building.buildingName}`);
      setTimeout(() => ctx.refreshBuildingDetails(x, y), 2000);
    }
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to focus building: ${toErrorMessage(err)}`);
  } finally {
    ctx.isFocusingBuilding = false;
  }
}

export async function unfocusBuilding(ctx: ClientHandlerContext): Promise<void> {
  if (!ctx.currentFocusedBuilding) return;

  ClientBridge.log('Building', 'Unfocusing building');
  ctx.speculativeBuildingDetails.clear();
  ctx.speculativeBuildingResolved.clear();

  try {
    ctx.nextGeneration('buildingRefresh');
    const req: WsReqBuildingUnfocus = {
      type: WsMessageType.REQ_BUILDING_UNFOCUS
    };
    ctx.rawSend(req);

    ClientBridge.hideBuildingPanel();
    ctx.currentFocusedBuilding = null;
    ctx.currentFocusedVisualClass = null;

    const unfocusRenderer = ctx.getRenderer();
    if (unfocusRenderer) {
      unfocusRenderer.clearSelectedBuilding();
    }
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to unfocus building: ${toErrorMessage(err)}`);
  }
}
