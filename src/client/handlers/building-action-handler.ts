/**
 * Building Action Handler — extracted from StarpeaceClient.
 *
 * Handles building action button dispatch, trade connect/disconnect,
 * manual connect mode, clone facility, movie actions, politics inline actions,
 * repair actions, and research actions.
 */

import {
  WsMessageType,
  WsMessage,
  WsReqBuildingDetails,
  WsRespBuildingDetails,
  WsReqBuildingTabData,
  WsRespBuildingTabData,
  WsReqBuildingSetProperty,
  WsRespBuildingSetProperty,
  WsReqBuildingUpgrade,
  WsRespBuildingUpgrade,
  WsReqRenameFacility,
  WsRespRenameFacility,
  WsReqDeleteFacility,
  WsRespDeleteFacility,
  WsReqCloneFacility,
  WsRespCloneFacility,
  WsReqSearchConnections,
  BuildingDetailsResponse,
} from '../../shared/types';
import { toErrorMessage } from '../../shared/error-utils';
import { ClientBridge } from '../bridge/client-bridge';
import { useBuildingStore } from '../store/building-store';
import { useGameStore } from '../store/game-store';
import { useUiStore } from '../store/ui-store';
import type { ClientHandlerContext } from './client-context';

// ── Building Details ────────────────────────────────────────────────────────

export function requestBuildingDetails(
  ctx: ClientHandlerContext,
  x: number,
  y: number,
  visualClass: string
): Promise<BuildingDetailsResponse | null> {
  const key = `${x},${y}`;
  const existing = ctx.inFlightBuildingDetails.get(key);
  if (existing) {
    ClientBridge.log('Building', `Dedup: reusing in-flight request at (${x}, ${y})`);
    return existing;
  }

  const promise = requestBuildingDetailsImpl(ctx, x, y, visualClass);
  ctx.inFlightBuildingDetails.set(key, promise);
  promise.finally(() => ctx.inFlightBuildingDetails.delete(key));
  return promise;
}

async function requestBuildingDetailsImpl(
  ctx: ClientHandlerContext,
  x: number,
  y: number,
  visualClass: string
): Promise<BuildingDetailsResponse | null> {
  ClientBridge.log('Building', `Requesting details at (${x}, ${y})`);

  try {
    const req: WsReqBuildingDetails = {
      type: WsMessageType.REQ_BUILDING_DETAILS,
      x,
      y,
      visualClass
    };

    const response = await ctx.sendRequest(req, 90000) as WsRespBuildingDetails;
    ClientBridge.log('Building', `Got details: ${response.details.templateName}`);
    return response.details;
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to get building details: ${toErrorMessage(err)}`);
    return null;
  }
}

export async function refreshBuildingDetails(ctx: ClientHandlerContext, x: number, y: number): Promise<void> {
  const vc = ctx.currentFocusedVisualClass || '0';
  // Reset lazy tab states so they re-fetch on next view
  useBuildingStore.getState().resetTabLoadingStates();
  const details = await requestBuildingDetails(ctx, x, y, vc);
  if (details) {
    ClientBridge.updateBuildingDetails(details);
  }
}

// ── Tab Data (Lazy Loading) ─────────────────────────────────────────────────

/** Special tab IDs that require lazy loading. */
const LAZY_TAB_IDS = new Set(['supplies', 'products', 'compInputs', 'whGeneral']);

export function isLazyTab(tabId: string): boolean {
  return LAZY_TAB_IDS.has(tabId);
}

export async function requestTabData(
  ctx: ClientHandlerContext,
  x: number,
  y: number,
  tabId: string,
  visualClass: string,
): Promise<void> {
  // Don't send requests when disconnected
  if (useGameStore.getState().status !== 'connected') return;

  const store = useBuildingStore.getState();

  // Already loaded or loading — skip
  const state = store.tabLoadingStates[tabId];
  if (state === 'loaded' || state === 'loading') return;

  ClientBridge.log('Building', `Requesting tab data: ${tabId} at (${x},${y})`);
  store.setTabLoading(tabId);

  try {
    const req: WsReqBuildingTabData = {
      type: WsMessageType.REQ_BUILDING_TAB_DATA,
      x,
      y,
      tabId,
      visualClass,
    };

    const response = await ctx.sendRequest(req, 30000) as WsRespBuildingTabData;
    store.mergeTabData(tabId, response);
    ClientBridge.log('Building', `Tab data received: ${tabId}`);
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to get tab data ${tabId}: ${toErrorMessage(err)}`);
    // Mark as error (not idle) to prevent useEffect retry loop.
    // Manual refresh or building re-select will reset to idle.
    useBuildingStore.setState((s) => ({
      tabLoadingStates: { ...s.tabLoadingStates, [tabId]: 'error' },
    }));
  }
}

// ── Set Property ────────────────────────────────────────────────────────────

export async function setBuildingProperty(
  ctx: ClientHandlerContext,
  x: number,
  y: number,
  propertyName: string,
  value: string,
  additionalParams?: Record<string, string>
): Promise<boolean> {
  ClientBridge.log('Building', `Setting ${propertyName}=${value} at (${x}, ${y})`);

  const pendingKey = additionalParams
    ? `${propertyName}:${JSON.stringify(additionalParams)}`
    : propertyName;

  ClientBridge.setPendingUpdate(pendingKey, value);

  try {
    const req: WsReqBuildingSetProperty = {
      type: WsMessageType.REQ_BUILDING_SET_PROPERTY,
      x,
      y,
      propertyName,
      value,
      additionalParams
    };

    const response = await ctx.sendRequest(req) as WsRespBuildingSetProperty;

    if (response.success) {
      ClientBridge.confirmPendingUpdate(pendingKey);
      ClientBridge.log('Building', `Property ${propertyName} updated to ${response.newValue}`);
      return true;
    } else {
      ClientBridge.failPendingUpdate(pendingKey, value, 'Server rejected the change');
      ClientBridge.log('Error', `Failed to set ${propertyName}`);
      return false;
    }
  } catch (err: unknown) {
    ClientBridge.failPendingUpdate(pendingKey, value, toErrorMessage(err));
    ClientBridge.log('Error', `Failed to set property: ${toErrorMessage(err)}`);
    return false;
  }
}

// ── Upgrade / Rename / Delete ───────────────────────────────────────────────

export async function upgradeBuildingAction(
  ctx: ClientHandlerContext,
  x: number,
  y: number,
  action: 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE',
  count?: number
): Promise<boolean> {
  const actionName = action === 'DOWNGRADE' ? 'Downgrading' :
                     action === 'START_UPGRADE' ? `Starting ${count} upgrade(s)` :
                     'Stopping upgrade';
  ClientBridge.log('Building', `${actionName} at (${x}, ${y})`);

  try {
    const req: WsReqBuildingUpgrade = {
      type: WsMessageType.REQ_BUILDING_UPGRADE,
      x, y, action, count
    };

    const response = await ctx.sendRequest(req) as WsRespBuildingUpgrade;

    if (response.success) {
      ClientBridge.log('Building', response.message || 'Upgrade action completed');
      return true;
    } else {
      ClientBridge.log('Error', response.message || 'Failed to perform upgrade action');
      return false;
    }
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to perform upgrade action: ${toErrorMessage(err)}`);
    return false;
  }
}

export async function renameFacility(ctx: ClientHandlerContext, x: number, y: number, newName: string): Promise<boolean> {
  ClientBridge.log('Building', `Renaming building at (${x}, ${y}) to "${newName}"`);

  try {
    const req: WsReqRenameFacility = {
      type: WsMessageType.REQ_RENAME_FACILITY,
      x, y, newName
    };

    const response = await ctx.sendRequest(req) as WsRespRenameFacility;

    if (response.success) {
      ClientBridge.log('Building', `Building renamed to "${response.newName}"`);
      return true;
    } else {
      ClientBridge.log('Error', response.message || 'Failed to rename building');
      return false;
    }
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to rename building: ${toErrorMessage(err)}`);
    return false;
  }
}

export async function deleteFacility(ctx: ClientHandlerContext, x: number, y: number): Promise<boolean> {
  ClientBridge.log('Building', `Deleting building at (${x}, ${y})`);

  try {
    const req: WsReqDeleteFacility = {
      type: WsMessageType.REQ_DELETE_FACILITY,
      x, y
    };

    const response = await ctx.sendRequest(req) as WsRespDeleteFacility;

    if (response.success) {
      ClientBridge.log('Building', 'Building deleted successfully');
      ctx.loadAlignedMapArea(x, y);
      return true;
    } else {
      ClientBridge.log('Error', response.message || 'Failed to delete building');
      return false;
    }
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to delete building: ${toErrorMessage(err)}`);
    return false;
  }
}

// ── Action Button Dispatch ──────────────────────────────────────────────────

export function handleBuildingAction(ctx: ClientHandlerContext, actionId: string, buildingDetails: BuildingDetailsResponse, rowData?: Record<string, string>): void {
  if (actionId === 'launchMovie') {
    launchMovie(ctx, buildingDetails);
  } else if (actionId === 'cancelMovie') {
    cancelMovie(ctx, buildingDetails);
  } else if (actionId === 'releaseMovie') {
    releaseMovie(ctx, buildingDetails);
  } else if (actionId === 'vote') {
    voteForCandidate(ctx, buildingDetails);
  } else if (actionId === 'voteCandidate' && rowData) {
    voteForCandidateInline(ctx, buildingDetails, rowData);
  } else if (actionId === 'banMinister') {
    banMinister(ctx, buildingDetails);
  } else if (actionId === 'deposeMinister' && rowData) {
    deposeMinisterInline(ctx, buildingDetails, rowData);
  } else if (actionId === 'sitMinister') {
    sitMinister(ctx, buildingDetails);
  } else if (actionId === 'electMinister' && rowData) {
    electMinisterInline(ctx, buildingDetails, rowData);
  } else if (actionId === 'electMayor' && rowData) {
    electMayorInline(ctx, buildingDetails, rowData);
  } else if (actionId.startsWith('tradeConnect:')) {
    const kind = actionId.split(':')[1];
    tradeConnect(ctx, buildingDetails, kind);
  } else if (actionId.startsWith('tradeDisconnect:')) {
    const kind = actionId.split(':')[1];
    tradeDisconnect(ctx, buildingDetails, kind);
  } else if (actionId === 'connectMap') {
    startConnectMode(ctx, buildingDetails);
  } else if (actionId === 'demolish') {
    useUiStore.getState().requestConfirm(
      'Demolish Building',
      'Are you sure you want to demolish this building? This action cannot be undone.',
      () => deleteFacility(ctx, buildingDetails.x, buildingDetails.y).then(success => {
        if (success) ClientBridge.hideBuildingPanel();
      }),
    );
  } else if (actionId === 'startRepair') {
    startRepair(ctx, buildingDetails);
  } else if (actionId === 'stopRepair') {
    stopRepair(ctx, buildingDetails);
  } else if (actionId === 'queueResearch') {
    queueResearch(ctx, buildingDetails);
  } else if (actionId === 'cancelResearch') {
    cancelResearch(ctx, buildingDetails);
  } else {
    console.warn(`[Client] Unhandled building action: ${actionId}`);
    ctx.showNotification(`Action "${actionId}" is not yet implemented`, 'error');
  }
}

// ── Trade Connect / Disconnect ──────────────────────────────────────────────

async function tradeConnect(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse, kind: string): Promise<void> {
  try {
    await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RDOConnectToTycoon', '0', { kind });
    const kindLabel = kind === '1' ? 'stores' : kind === '2' ? 'factories' : 'warehouses';
    ctx.showNotification(`Connected all your ${kindLabel} to this building`, 'success');
    refreshBuildingDetails(ctx, buildingDetails.x, buildingDetails.y);
  } catch (err: unknown) {
    ctx.showNotification(`Connection failed: ${toErrorMessage(err)}`, 'error');
  }
}

async function tradeDisconnect(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse, kind: string): Promise<void> {
  try {
    await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RDODisconnectFromTycoon', '0', { kind });
    const kindLabel = kind === '1' ? 'stores' : kind === '2' ? 'factories' : 'warehouses';
    ctx.showNotification(`Disconnected all your ${kindLabel} from this building`, 'success');
    refreshBuildingDetails(ctx, buildingDetails.x, buildingDetails.y);
  } catch (err: unknown) {
    ctx.showNotification(`Disconnection failed: ${toErrorMessage(err)}`, 'error');
  }
}

// ── Manual Connect Mode ─────────────────────────────────────────────────────

function startConnectMode(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse): void {
  ctx.isConnectMode = true;
  ctx.connectSourceBuilding = buildingDetails;

  const renderer = ctx.getRenderer();
  if (renderer) {
    renderer.setConnectMode(true);
    renderer.setConnectModeCallback((targetX: number, targetY: number) => {
      executeConnectFacilities(ctx, targetX, targetY);
    });
  }

  ctx.connectKeyboardHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && ctx.isConnectMode) {
      cancelConnectMode(ctx);
    }
  };
  document.addEventListener('keydown', ctx.connectKeyboardHandler);

  ctx.showNotification('Click on a building to connect. Press ESC to cancel.', 'info');
}

function cancelConnectMode(ctx: ClientHandlerContext): void {
  ctx.isConnectMode = false;
  ctx.connectSourceBuilding = null;

  const renderer = ctx.getRenderer();
  if (renderer) {
    renderer.setConnectMode(false);
    renderer.setConnectModeCallback(null);
  }

  if (ctx.connectKeyboardHandler) {
    document.removeEventListener('keydown', ctx.connectKeyboardHandler);
    ctx.connectKeyboardHandler = null;
  }
}

async function executeConnectFacilities(ctx: ClientHandlerContext, targetX: number, targetY: number): Promise<void> {
  if (!ctx.connectSourceBuilding) return;
  const source = ctx.connectSourceBuilding;

  try {
    const req = {
      type: WsMessageType.REQ_CONNECT_FACILITIES,
      sourceX: source.x,
      sourceY: source.y,
      targetX,
      targetY,
    };
    const resp = await ctx.sendRequest(req) as WsMessage & { success: boolean; resultMessage: string };

    if (resp.resultMessage) {
      const displayMsg = resp.resultMessage.replace(/\n/g, ' | ');
      ctx.showNotification(displayMsg, resp.success ? 'success' : 'error');
    } else {
      ctx.showNotification(
        resp.success ? 'Buildings connected successfully' : 'Connection failed',
        resp.success ? 'success' : 'error',
      );
    }

    refreshBuildingDetails(ctx, source.x, source.y);
  } catch (err: unknown) {
    ctx.showNotification(`Connection failed: ${toErrorMessage(err)}`, 'error');
  } finally {
    cancelConnectMode(ctx);
  }
}

// ── Clone Facility ──────────────────────────────────────────────────────────

export async function cloneFacility(ctx: ClientHandlerContext, x: number, y: number, options: number): Promise<void> {
  ClientBridge.log('Clone', `Cloning settings at (${x}, ${y}) with options=0x${options.toString(16)}`);

  try {
    const req: WsReqCloneFacility = {
      type: WsMessageType.REQ_CLONE_FACILITY,
      x, y, options,
    };

    const response = await ctx.sendRequest(req) as WsRespCloneFacility;

    if (response.success) {
      ctx.showNotification('Clone settings applied successfully', 'success');
    } else {
      ctx.showNotification('Failed to apply clone settings', 'error');
    }
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to clone facility: ${toErrorMessage(err)}`);
    ctx.showNotification('Failed to apply clone settings', 'error');
  }
}

// ── Movie Actions ───────────────────────────────────────────────────────────

async function launchMovie(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse): Promise<void> {
  const filmName = prompt('Movie name:');
  if (!filmName) return;
  const budgetStr = prompt('Budget ($):', '1000000');
  if (!budgetStr) return;
  const monthsStr = prompt('Production months:', '12');
  if (!monthsStr) return;

  const filmsGroup = buildingDetails.groups['films'] || [];
  const autoRel = filmsGroup.find(p => p.name === 'AutoRel')?.value || '0';
  const autoProd = filmsGroup.find(p => p.name === 'AutoProd')?.value || '0';

  try {
    await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RDOLaunchMovie', '0', {
      filmName, budget: budgetStr, months: monthsStr, autoRel, autoProd,
    });
    ctx.showNotification(`Launching movie: ${filmName}`, 'success');
    refreshBuildingDetails(ctx, buildingDetails.x, buildingDetails.y);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to launch movie: ${toErrorMessage(err)}`, 'error');
  }
}

async function cancelMovie(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse): Promise<void> {
  if (!confirm('Cancel current movie production?')) return;
  try {
    await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RDOCancelMovie', '0');
    ctx.showNotification('Movie production cancelled', 'success');
    refreshBuildingDetails(ctx, buildingDetails.x, buildingDetails.y);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to cancel movie: ${toErrorMessage(err)}`, 'error');
  }
}

async function releaseMovie(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse): Promise<void> {
  try {
    await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RDOReleaseMovie', '0');
    ctx.showNotification('Movie released!', 'success');
    refreshBuildingDetails(ctx, buildingDetails.x, buildingDetails.y);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to release movie: ${toErrorMessage(err)}`, 'error');
  }
}

// ── Politics Inline Actions ─────────────────────────────────────────────────

async function voteForCandidate(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse): Promise<void> {
  const votesData = buildingDetails.groups['votes'];
  if (!votesData) {
    ctx.showNotification('No voting data available', 'error');
    return;
  }

  const candidateNames: string[] = [];
  for (const prop of votesData) {
    if (prop.name.startsWith('Candidate') && !prop.name.includes('Count')) {
      const match = prop.name.match(/^Candidate(\d+)$/);
      if (match && prop.value) {
        candidateNames.push(prop.value);
      }
    }
  }

  if (candidateNames.length === 0) {
    ctx.showNotification('No candidates available', 'error');
    return;
  }

  const candidateChoice = prompt(
    `Vote for a candidate:\n${candidateNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}\n\nEnter candidate number:`
  );
  if (!candidateChoice) return;

  const idx = parseInt(candidateChoice, 10) - 1;
  if (idx < 0 || idx >= candidateNames.length) {
    ctx.showNotification('Invalid candidate number', 'error');
    return;
  }

  const candidateName = candidateNames[idx];
  ctx.rawSend({
    type: WsMessageType.REQ_POLITICS_VOTE,
    buildingX: buildingDetails.x,
    buildingY: buildingDetails.y,
    candidateName,
  });
  ctx.showNotification(`Voted for ${candidateName}`, 'success');
}

async function banMinister(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse): Promise<void> {
  const ministryIdStr = prompt('Ministry ID to depose minister from:');
  if (!ministryIdStr) return;
  try {
    await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RDOBanMinister', '0', {
      ministryId: ministryIdStr,
    });
    ctx.showNotification('Minister deposed', 'success');
    refreshBuildingDetails(ctx, buildingDetails.x, buildingDetails.y);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to depose minister: ${toErrorMessage(err)}`, 'error');
  }
}

async function sitMinister(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse): Promise<void> {
  const ministryIdStr = prompt('Ministry ID to appoint minister for:');
  if (!ministryIdStr) return;
  const ministerName = prompt('Minister name to appoint:');
  if (!ministerName) return;
  try {
    await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RDOSitMinister', '0', {
      ministryId: ministryIdStr,
      ministerName,
    });
    ctx.showNotification(`${ministerName} appointed as minister`, 'success');
    refreshBuildingDetails(ctx, buildingDetails.x, buildingDetails.y);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to appoint minister: ${toErrorMessage(err)}`, 'error');
  }
}

function electMayorInline(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse, rowData: Record<string, string>): void {
  const townName = rowData['Town'];
  if (!townName) {
    ctx.showNotification('No town selected', 'error');
    return;
  }
  useUiStore.getState().requestPrompt(
    `Elect Mayor of ${townName}`,
    `Enter username to elect as mayor of ${townName}:`,
    async (playerName: string) => {
      try {
        const success = await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RDOSitMayor', playerName, {
          townName,
          index: rowData['_index'] ?? '0',
        });
        if (success) {
          ctx.showNotification(`${playerName} elected as mayor of ${townName}`, 'success');
          setTimeout(() => refreshBuildingDetails(ctx, buildingDetails.x, buildingDetails.y), 1000);
        } else {
          ctx.showNotification(`Failed to elect mayor of ${townName}`, 'error');
        }
      } catch (err: unknown) {
        ctx.showNotification(`Failed to elect mayor: ${toErrorMessage(err)}`, 'error');
      }
    },
  );
}

function electMinisterInline(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse, rowData: Record<string, string>): void {
  const ministryId = rowData['MinistryId'];
  if (!ministryId) {
    ctx.showNotification('No ministry selected', 'error');
    return;
  }
  const ministryName = rowData['Ministry'] || `Ministry ${ministryId}`;
  useUiStore.getState().requestPrompt(
    `Appoint ${ministryName}`,
    `Enter username to appoint as ${ministryName}:`,
    async (playerName: string) => {
      try {
        const success = await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RDOSitMinister', '0', {
          ministryId,
          ministerName: playerName,
        });
        if (success) {
          ctx.showNotification(`${playerName} appointed as ${ministryName}`, 'success');
          setTimeout(() => refreshBuildingDetails(ctx, buildingDetails.x, buildingDetails.y), 1000);
        } else {
          ctx.showNotification(`Failed to appoint ${playerName}`, 'error');
        }
      } catch (err: unknown) {
        ctx.showNotification(`Failed to appoint minister: ${toErrorMessage(err)}`, 'error');
      }
    },
  );
}

async function deposeMinisterInline(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse, rowData: Record<string, string>): Promise<void> {
  const ministryId = rowData['MinistryId'];
  if (!ministryId) {
    ctx.showNotification('No ministry selected', 'error');
    return;
  }
  try {
    const success = await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RDOBanMinister', '0', {
      ministryId,
    });
    if (success) {
      ctx.showNotification('Minister deposed', 'success');
      setTimeout(() => refreshBuildingDetails(ctx, buildingDetails.x, buildingDetails.y), 1000);
    } else {
      ctx.showNotification('Failed to depose minister', 'error');
    }
  } catch (err: unknown) {
    ctx.showNotification(`Failed to depose minister: ${toErrorMessage(err)}`, 'error');
  }
}

async function voteForCandidateInline(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse, rowData: Record<string, string>): Promise<void> {
  const candidateName = rowData['Candidate'];
  if (!candidateName) {
    ctx.showNotification('No candidate selected', 'error');
    return;
  }
  ctx.rawSend({
    type: WsMessageType.REQ_POLITICS_VOTE,
    buildingX: buildingDetails.x,
    buildingY: buildingDetails.y,
    candidateName,
  });
  ctx.showNotification(`Voted for ${candidateName}`, 'success');
  // Delay refresh to allow void push ("*") to be processed by the server
  setTimeout(() => refreshBuildingDetails(ctx, buildingDetails.x, buildingDetails.y), 500);
}

// ── Repair Actions ──────────────────────────────────────────────────────────

async function startRepair(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse): Promise<void> {
  try {
    await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RdoRepair', '0');
    ctx.showNotification('Repair started', 'success');
    refreshBuildingDetails(ctx, buildingDetails.x, buildingDetails.y);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to start repair: ${toErrorMessage(err)}`, 'error');
  }
}

async function stopRepair(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse): Promise<void> {
  try {
    await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RdoStopRepair', '0');
    ctx.showNotification('Repair stopped', 'success');
    refreshBuildingDetails(ctx, buildingDetails.x, buildingDetails.y);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to stop repair: ${toErrorMessage(err)}`, 'error');
  }
}

// ── Research Actions ────────────────────────────────────────────────────────

export function loadResearchInventory(ctx: ClientHandlerContext, buildingX: number, buildingY: number, categoryIndex: number): void {
  useBuildingStore.getState().setResearchLoading('inventory', true);
  ctx.sendMessage({
    type: WsMessageType.REQ_RESEARCH_INVENTORY,
    buildingX,
    buildingY,
    categoryIndex,
  });
}

export function getResearchDetails(ctx: ClientHandlerContext, buildingX: number, buildingY: number, inventionId: string): void {
  useBuildingStore.getState().setResearchSelectedInvention(inventionId);
  useBuildingStore.getState().setResearchLoading('details', true);
  ctx.sendMessage({
    type: WsMessageType.REQ_RESEARCH_DETAILS,
    buildingX,
    buildingY,
    inventionId,
  });
}

async function queueResearch(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse): Promise<void> {
  const inventionId = useBuildingStore.getState().research?.selectedInventionId;
  if (!inventionId) {
    ctx.showNotification('Select an invention to research first', 'info');
    return;
  }
  try {
    await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RDOQueueResearch', '0',
      { inventionId, priority: '10' },
    );
    ctx.showNotification('Research queued', 'success');
    const activeCat = useBuildingStore.getState().research?.activeCategoryIndex ?? 0;
    loadResearchInventory(ctx, buildingDetails.x, buildingDetails.y, activeCat);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to queue research: ${toErrorMessage(err)}`, 'error');
  }
}

async function cancelResearch(ctx: ClientHandlerContext, buildingDetails: BuildingDetailsResponse): Promise<void> {
  const inventionId = useBuildingStore.getState().research?.selectedInventionId;
  if (!inventionId) {
    ctx.showNotification('Select an invention to cancel first', 'info');
    return;
  }
  try {
    await setBuildingProperty(ctx, buildingDetails.x, buildingDetails.y, 'RDOCancelResearch', '0',
      { inventionId },
    );
    ctx.showNotification('Research cancelled', 'success');
    const activeCat = useBuildingStore.getState().research?.activeCategoryIndex ?? 0;
    loadResearchInventory(ctx, buildingDetails.x, buildingDetails.y, activeCat);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to cancel research: ${toErrorMessage(err)}`, 'error');
  }
}

export async function queueResearchDirect(ctx: ClientHandlerContext, buildingX: number, buildingY: number, inventionId: string): Promise<void> {
  try {
    await setBuildingProperty(ctx, buildingX, buildingY, 'RDOQueueResearch', '0', { inventionId, priority: '10' });
    ctx.showNotification('Research queued', 'success');
    const activeCat = useBuildingStore.getState().research?.activeCategoryIndex ?? 0;
    loadResearchInventory(ctx, buildingX, buildingY, activeCat);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to queue research: ${toErrorMessage(err)}`, 'error');
  }
}

export async function cancelResearchDirect(ctx: ClientHandlerContext, buildingX: number, buildingY: number, inventionId: string): Promise<void> {
  try {
    await setBuildingProperty(ctx, buildingX, buildingY, 'RDOCancelResearch', '0', { inventionId });
    ctx.showNotification('Research cancelled', 'success');
    const activeCat = useBuildingStore.getState().research?.activeCategoryIndex ?? 0;
    loadResearchInventory(ctx, buildingX, buildingY, activeCat);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to cancel research: ${toErrorMessage(err)}`, 'error');
  }
}

export async function fetchResearchCategoryTabs(): Promise<void> {
  try {
    const resp = await fetch('/api/research-inventions');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as { categoryTabs?: string[] };
    useBuildingStore.getState().setResearchCategoryTabs(data.categoryTabs ?? []);
  } catch (err: unknown) {
    console.warn('[Client] Failed to fetch category tabs:', toErrorMessage(err));
    useBuildingStore.getState().setResearchCategoryTabs(
      ['GENERAL', 'COMMERCE', 'REAL ESTATE', 'INDUSTRY', 'CIVICS'],
    );
  }
}

// ── Connection Picker ───────────────────────────────────────────────────────

export function searchConnections(
  ctx: ClientHandlerContext,
  buildingX: number,
  buildingY: number,
  fluidId: string,
  direction: 'input' | 'output',
  filters?: { company?: string; town?: string; maxResults?: number; roles?: number }
): void {
  const req: WsReqSearchConnections = {
    type: WsMessageType.REQ_SEARCH_CONNECTIONS,
    buildingX,
    buildingY,
    fluidId,
    direction,
    filters,
  };
  ctx.rawSend(req);
}

export async function connectFacilities(
  ctx: ClientHandlerContext,
  buildingX: number,
  buildingY: number,
  fluidId: string,
  direction: 'input' | 'output',
  selectedCoords: Array<{ x: number; y: number }>
): Promise<void> {
  if (selectedCoords.length === 0) return;

  const connectionList = selectedCoords.map(c => `${c.x},${c.y}`).join(',');
  const rdoCommand = direction === 'input' ? 'RDOConnectInput' : 'RDOConnectOutput';

  try {
    await setBuildingProperty(ctx, buildingX, buildingY, rdoCommand, '0', {
      fluidId,
      connectionList,
    });

    ctx.showNotification(
      `Connected ${selectedCoords.length} ${direction === 'input' ? 'supplier' : 'client'}${selectedCoords.length !== 1 ? 's' : ''}`,
      'success'
    );

    const visualClass = ctx.currentFocusedVisualClass || '0';
    const refreshedDetails = await requestBuildingDetails(ctx, buildingX, buildingY, visualClass);
    if (refreshedDetails) {
      ClientBridge.updateBuildingDetails(refreshedDetails);
    }
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to connect: ${toErrorMessage(err)}`);
    ctx.showNotification('Failed to connect facilities', 'error');
  }
}
