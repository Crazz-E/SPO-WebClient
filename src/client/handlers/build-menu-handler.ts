/**
 * Build Menu Handler — extracted from StarpeaceClient.
 *
 * Handles build menu, facility loading, building placement flow,
 * Capitol placement, and facility dimensions.
 */

import {
  WsMessageType,
  WsReqGetBuildingCategories,
  WsRespBuildingCategories,
  WsReqGetBuildingFacilities,
  WsRespBuildingFacilities,
  WsReqPlaceBuilding,
  WsReqBuildCapitol,
  WsReqGetAllFacilityDimensions,
  WsRespAllFacilityDimensions,
  BuildingCategory,
  BuildingInfo,
  FacilityDimensions,
  SurfaceType,
} from '../../shared/types';
import { toErrorMessage } from '../../shared/error-utils';
import { ClientBridge } from '../bridge/client-bridge';
import { useUiStore } from '../store/ui-store';
import { useGameStore } from '../store/game-store';
import { getFacilityDimensionsCache } from '../facility-dimensions-cache';
import { registerCivicVisualClass } from '../../shared/building-details/civic-buildings';
import type { ClientHandlerContext } from './client-context';
import { setupEscapeHandler } from './handler-utils';

export async function openBuildMenu(ctx: ClientHandlerContext): Promise<void> {
  if (!ctx.currentCompanyName) {
    ClientBridge.log('Error', 'No company selected');
    return;
  }

  ClientBridge.log('Build', 'Opening build menu...');

  try {
    const req: WsReqGetBuildingCategories = {
      type: WsMessageType.REQ_GET_BUILDING_CATEGORIES,
      companyName: ctx.currentCompanyName
    };

    const response = await ctx.sendRequest(req) as WsRespBuildingCategories;
    ctx.buildingCategories = response.categories;

    ClientBridge.setBuildMenuCategories(response.categories, response.capitolIconUrl);

    ClientBridge.log('Build', `Loaded ${response.categories.length} building categories`);
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to load building categories: ${toErrorMessage(err)}`);
  }
}

async function loadBuildingFacilities(ctx: ClientHandlerContext, category: BuildingCategory): Promise<void> {
  ClientBridge.log('Build', `Loading facilities for ${category.kindName}...`);

  try {
    const req: WsReqGetBuildingFacilities = {
      type: WsMessageType.REQ_GET_BUILDING_FACILITIES,
      companyName: ctx.currentCompanyName,
      cluster: category.cluster,
      kind: category.kind,
      kindName: category.kindName,
      folder: category.folder,
      tycoonLevel: category.tycoonLevel
    };

    const response = await ctx.sendRequest(req) as WsRespBuildingFacilities;

    const dimCache = getFacilityDimensionsCache();
    const enriched = response.facilities.map(f => {
      const dims = dimCache.getFacility(f.visualClassId);
      return dims ? { ...f, xsize: dims.xsize, ysize: dims.ysize } : f;
    });

    ctx.lastLoadedFacilities = enriched;
    ClientBridge.setBuildMenuFacilities(enriched);

    ClientBridge.log('Build', `Loaded ${enriched.length} facilities`);
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to load facilities: ${toErrorMessage(err)}`);
  }
}

export async function loadBuildingFacilitiesByKind(ctx: ClientHandlerContext, kind: string, cluster: string): Promise<void> {
  const category = ctx.buildingCategories.find(c => c.kind === kind && c.cluster === cluster);
  if (!category) {
    ClientBridge.log('Error', `Category not found: kind=${kind}, cluster=${cluster}`);
    return;
  }
  await loadBuildingFacilities(ctx, category);
}

export function placeBuildingFromMenu(ctx: ClientHandlerContext, facilityClass: string, visualClassId: string): void {
  const facility = ctx.lastLoadedFacilities.find(
    f => f.facilityClass === facilityClass && f.visualClassId === visualClassId
  );
  if (!facility) {
    ClientBridge.log('Error', `Facility not found: ${facilityClass}`);
    return;
  }
  startBuildingPlacement(ctx, facility);
}

export function openCapitolInspector(ctx: ClientHandlerContext): void {
  const coords = useGameStore.getState().capitolCoords;
  if (!coords) {
    ctx.showNotification('No Capitol found in this world', 'error');
    return;
  }
  ctx.focusBuilding(coords.x, coords.y);
}

export async function startCapitolPlacement(ctx: ClientHandlerContext): Promise<void> {
  ClientBridge.log('Build', 'Capitol placement mode — click on map to place.');

  const CAPITOL_VISUAL_CLASS_ID = '152';
  let xsize = 1;
  let ysize = 1;
  try {
    const dimensions = await getFacilityDimensions(CAPITOL_VISUAL_CLASS_ID);
    if (dimensions) {
      xsize = dimensions.xsize;
      ysize = dimensions.ysize;
    }
  } catch (err: unknown) {
    console.error('Failed to fetch Capitol dimensions:', err);
  }

  ctx.currentBuildingToPlace = {
    name: 'Capitol',
    facilityClass: 'Capitol',
    visualClassId: CAPITOL_VISUAL_CLASS_ID,
    cost: 0,
    area: xsize * ysize,
    description: 'Capitol building',
    zoneRequirement: '',
    iconPath: useUiStore.getState().capitolIconUrl,
    available: true,
  };
  ctx.currentBuildingXSize = xsize;
  ctx.currentBuildingYSize = ysize;

  ctx.showNotification('Capitol placement mode — Click map to place, ESC to cancel', 'info');

  const renderer = ctx.getRenderer();
  if (renderer) {
    renderer.setPlacementMode(
      true,
      'Capitol',
      0,
      xsize * ysize,
      '',
      xsize,
      ysize,
      CAPITOL_VISUAL_CLASS_ID
    );
    renderer.setPlacementConfirmCallback((x, y) => {
      placeCapitol(ctx, x, y);
    });
    renderer.setCancelPlacementCallback(() => {
      cancelBuildingPlacement(ctx);
    });
  }

  setupPlacementKeyboardHandler(ctx);
}

async function placeCapitol(ctx: ClientHandlerContext, x: number, y: number): Promise<void> {
  ClientBridge.log('Build', `Placing Capitol at (${x}, ${y})...`);

  try {
    const req: WsReqBuildCapitol = {
      type: WsMessageType.REQ_BUILD_CAPITOL,
      x, y
    };

    await ctx.sendRequest(req);

    ClientBridge.log('Build', 'Capitol built successfully!');
    ctx.showNotification('Capitol built successfully!', 'success');

    const buildingMargin = Math.max(ctx.currentBuildingXSize, ctx.currentBuildingYSize);
    ctx.loadAlignedMapArea(x, y, buildingMargin);

    cancelBuildingPlacement(ctx);
  } catch (err: unknown) {
    const errorMsg = toErrorMessage(err);
    ClientBridge.log('Error', `Failed to place Capitol: ${errorMsg}`);
    ctx.showNotification(`Failed to place Capitol: ${errorMsg}`, 'error');
  }
}

export async function preloadFacilityDimensions(ctx: ClientHandlerContext): Promise<void> {
  ClientBridge.log('Cache', 'Preloading facility dimensions...');

  try {
    const req: WsReqGetAllFacilityDimensions = {
      type: WsMessageType.REQ_GET_ALL_FACILITY_DIMENSIONS
    };

    const response = await ctx.sendRequest(req) as WsRespAllFacilityDimensions;

    const cache = getFacilityDimensionsCache();
    cache.initialize(response.dimensions);

    if (response.civicVisualClassIds) {
      for (const id of response.civicVisualClassIds) {
        registerCivicVisualClass(id);
      }
    }

    ClientBridge.log('Cache', `Loaded ${cache.getSize()} facility dimensions`);
  } catch (err: unknown) {
    console.error('[Client] Failed to preload facility dimensions:', err);
    ClientBridge.log('Error', 'Failed to load facility dimensions. Building placement may not work correctly.');
  }
}

async function getFacilityDimensions(visualClass: string): Promise<FacilityDimensions | null> {
  const cache = getFacilityDimensionsCache();

  if (!cache.isInitialized()) {
    console.warn('[Client] Facility cache not initialized yet');
    return null;
  }

  return cache.getFacility(visualClass) || null;
}

async function startBuildingPlacement(ctx: ClientHandlerContext, building: BuildingInfo): Promise<void> {
  ctx.currentBuildingToPlace = building;
  ClientBridge.log('Build', `Placing ${building.name}. Click on map to build.`);

  let xsize = 1;
  let ysize = 1;
  try {
    const dimensions = await getFacilityDimensions(building.visualClassId);
    if (dimensions) {
      xsize = dimensions.xsize;
      ysize = dimensions.ysize;
    }
  } catch (err: unknown) {
    console.error('Failed to fetch facility dimensions:', err);
  }
  ctx.currentBuildingXSize = xsize;
  ctx.currentBuildingYSize = ysize;

  const isMobile = window.innerWidth < 768;
  const notifText = isMobile
    ? `${building.name} — Pan map to position, tap to place`
    : `${building.name} placement mode — Click map to place, ESC to cancel`;
  ctx.showNotification(notifText, 'info');

  useUiStore.getState().setIsPlacingBuilding(true);
  useUiStore.getState().setPlacementValid(true);

  const renderer = ctx.getRenderer();
  if (renderer) {
    renderer.setPlacementValidityCallback((valid) => {
      useUiStore.getState().setPlacementValid(valid);
    });
    renderer.setPlacementMode(
      true,
      building.name,
      building.cost,
      building.area,
      building.zoneRequirement,
      xsize,
      ysize,
      building.visualClassId,
      building.iconPath
    );
  }

  const callbackRenderer = ctx.getRenderer();
  if (callbackRenderer) {
    callbackRenderer.setPlacementConfirmCallback((x, y) => {
      placeBuilding(ctx, x, y);
    });
    callbackRenderer.setCancelPlacementCallback(() => {
      cancelBuildingPlacement(ctx);
    });
  }

  setupPlacementKeyboardHandler(ctx);
  enableCityZonesForPlacement(ctx);
}

function setupPlacementKeyboardHandler(ctx: ClientHandlerContext): void {
  setupEscapeHandler(
    () => !!(ctx.currentBuildingToPlace || ctx.isRoadBuildingMode || ctx.isRoadDemolishMode || ctx.isZonePaintingMode),
    () => {
      if (ctx.currentBuildingToPlace) cancelBuildingPlacement(ctx);
      else if (ctx.isRoadBuildingMode) ctx.cancelRoadBuildingMode();
      else if (ctx.isRoadDemolishMode) ctx.cancelRoadDemolishMode();
      else if (ctx.isZonePaintingMode) ctx.cancelZonePaintingMode();
    },
  );
}

export async function placeBuilding(ctx: ClientHandlerContext, x: number, y: number): Promise<void> {
  if (!ctx.currentBuildingToPlace) return;

  const building = ctx.currentBuildingToPlace;
  ClientBridge.log('Build', `Placing ${building.name} at (${x}, ${y})...`);

  try {
    const req: WsReqPlaceBuilding = {
      type: WsMessageType.REQ_PLACE_BUILDING,
      facilityClass: building.facilityClass,
      x, y
    };

    await ctx.sendRequest(req);

    ClientBridge.log('Build', `Successfully placed ${building.name}!`);
    ctx.showNotification(`${building.name} built successfully!`, 'success');

    const buildingMargin = Math.max(ctx.currentBuildingXSize, ctx.currentBuildingYSize);
    ctx.loadAlignedMapArea(x, y, buildingMargin);

    // Keep placement mode active so the user can place the same building again.
    // Callbacks, keyboard handler, and zone overlay are already set up — just
    // reset the renderer preview so the ghost reappears on the next mouse move.
    const renderer = ctx.getRenderer();
    if (renderer) {
      renderer.setPlacementMode(
        true,
        building.name,
        building.cost,
        building.area,
        building.zoneRequirement,
        ctx.currentBuildingXSize,
        ctx.currentBuildingYSize,
        building.visualClassId,
        building.iconPath
      );
    }
  } catch (err: unknown) {
    const errorMsg = toErrorMessage(err);
    ClientBridge.log('Error', `Failed to place ${building.name}: ${errorMsg}`);
    ctx.showNotification(`Failed to place building: ${errorMsg}`, 'error');
  }
}

function enableCityZonesForPlacement(ctx: ClientHandlerContext): void {
  if (ctx.isCityZonesEnabled) {
    ctx.overlayBeforePlacement = { type: 'zones' };
  } else if (ctx.activeOverlayType !== null) {
    ctx.overlayBeforePlacement = { type: 'overlay', overlay: ctx.activeOverlayType };
    ctx.toggleZoneOverlay(false, ctx.activeOverlayType);
    ctx.activeOverlayType = null;
    // Store is updated automatically via ctx.activeOverlayType setter
  } else {
    ctx.overlayBeforePlacement = { type: 'none' };
  }

  if (!ctx.isCityZonesEnabled) {
    ctx.isCityZonesEnabled = true;
    // Store is updated automatically via ctx.isCityZonesEnabled setter
    ctx.toggleZoneOverlay(true, SurfaceType.ZONES);
  }
}

function restoreOverlayAfterPlacement(ctx: ClientHandlerContext): void {
  const prev = ctx.overlayBeforePlacement;
  ctx.overlayBeforePlacement = { type: 'none' };

  if (prev.type === 'zones') return;

  ctx.isCityZonesEnabled = false;
  // Store is updated automatically via ctx.isCityZonesEnabled setter
  ctx.toggleZoneOverlay(false, SurfaceType.ZONES);

  if (prev.type === 'overlay' && prev.overlay) {
    ctx.activeOverlayType = prev.overlay;
    // Store is updated automatically via ctx.activeOverlayType setter
    ctx.toggleZoneOverlay(true, prev.overlay);
  }
}

export function cancelBuildingPlacement(ctx: ClientHandlerContext): void {
  ctx.currentBuildingToPlace = null;

  useUiStore.getState().setIsPlacingBuilding(false);
  useUiStore.getState().setPlacementValid(false);

  const notification = document.getElementById('placement-notification');
  if (notification) notification.remove();

  const renderer = ctx.getRenderer();
  if (renderer) {
    renderer.setPlacementMode(false);
  }

  restoreOverlayAfterPlacement(ctx);
}
