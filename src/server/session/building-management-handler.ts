/**
 * Building management handler — extracted from StarpeaceSession.
 *
 * Every public function takes `ctx: SessionContext` as its first argument.
 * Private helpers (`parseBooleanCacheValue`) are module-private functions
 * (not exported).
 */

import type { SessionContext } from './session-context';
import type { PoliticalRoleInfo } from '../../shared/types';
import { TimeoutCategory } from '../../shared/timeout-categories';
import { RdoVerb, RdoAction } from '../../shared/types';
import { RdoValue, RdoCommand } from '../../shared/rdo-types';
import { parsePropertyResponse as parsePropertyResponseHelper } from '../rdo-helpers';
import { toErrorMessage } from '../../shared/error-utils';
import { serialiseConstruction } from './construction-lock';

// =========================================================================
// PRIVATE HELPERS
// =========================================================================

/**
 * Parse a boolean value from the Delphi cache.
 * Accepts '1', '-1', or 'true' (case-insensitive) as truthy.
 */
function parseBooleanCacheValue(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === '-1' || v === 'true';
}

// =========================================================================
// PUBLIC API
// =========================================================================

/**
 * Query a tycoon's political role from the Delphi object cache.
 * Uses SetPath('Tycoons\<name>.five\') to load the tycoon cache, then reads
 * IsMayor/IsPresident/IsMinister boolean flags written by StoreRoleInfoToCache.
 */
export async function queryTycoonPoliticalRole(ctx: SessionContext, tycoonName: string): Promise<PoliticalRoleInfo> {
  await ctx.connectMapService();
  const tempObjId = await ctx.cacherCreateObject();
  try {
    const path = `Tycoons\\${tycoonName}.five\\`;
    await ctx.cacherSetPath(tempObjId, path);
    const values = await ctx.cacherGetPropertyList(tempObjId, [
      'IsMayor', 'Town', 'IsCapitalMayor', 'IsPresident', 'IsMinister', 'Ministry'
    ]);
    return {
      tycoonName,
      isMayor: parseBooleanCacheValue(values[0]),
      town: values[1] || '',
      isCapitalMayor: parseBooleanCacheValue(values[2]),
      isPresident: parseBooleanCacheValue(values[3]),
      isMinister: parseBooleanCacheValue(values[4]),
      ministry: values[5] || '',
      queriedAt: Date.now(),
    };
  } finally {
    await ctx.cacherCloseObject(tempObjId);
  }
}

/**
 * Manage construction operations with RDOAcceptCloning semaphore.
 * Sequence: Check(255) -> Lock(-1) -> Action -> Verify
 *
 * @param ctx - Session context
 * @param x - Building X coordinate
 * @param y - Building Y coordinate
 * @param action - Construction action: START (upgrade), STOP (cancel), DOWN (downgrade)
 * @param count - Number of upgrades (for START only, default: 1)
 */
export async function manageConstruction(
  ctx: SessionContext,
  x: number,
  y: number,
  action: 'START' | 'STOP' | 'DOWN',
  count: number = 1
): Promise<{ status: string, error?: string }> {
  return serialiseConstruction(ctx, () => manageConstructionImpl(ctx, x, y, action, count));
}

async function manageConstructionImpl(
  ctx: SessionContext,
  x: number,
  y: number,
  action: 'START' | 'STOP' | 'DOWN',
  count: number
): Promise<{ status: string, error?: string }> {
  ctx.log.debug(`[Construction] Request: ${action} at (${x}, ${y}) count=${count}`);
  try {
    // Step 0: Connect to construction service if needed
    await ctx.connectConstructionService();

    // Step 1: Get building info from Map Service
    ctx.log.debug(`[Construction] Fetching building info at (${x}, ${y})...`);
    await ctx.connectMapService();
    const props = await ctx.getCacherPropertyListAt(x, y, ['CurrBlock', 'ObjectId']);

    if (props.length < 2) {
      return {
        status: 'ERROR',
        error: `No building found at (${x}, ${y})`
      };
    }

    const currBlock = props[0]; // CurrBlock (zone ID)
    const targetId = props[1]; // ObjectId (RDO ID for the building)
    ctx.log.debug(`[Construction] Building found: Block=${currBlock}, ObjectId=${targetId}`);

    // Step 2: Check RDOAcceptCloning (must be available: 1=existing building, 255=empty zone)
    const initialCloning = await ctx.sendRdoRequest('construction', {
      verb: RdoVerb.SEL,
      targetId: currBlock,
      action: RdoAction.GET,
      member: 'RDOAcceptCloning'
    }, undefined, TimeoutCategory.SLOW);
    const cloningValue = parsePropertyResponseHelper(initialCloning.payload || '', 'RDOAcceptCloning');
    const cloningInt = parseInt(cloningValue, 10);
    ctx.log.debug(`[Construction] RDOAcceptCloning initial value: ${cloningInt}`);

    // Valid values: 1 (existing building), 255 (empty zone)
    // Invalid: -1 (locked/busy)
    if (cloningInt !== 1 && cloningInt !== 255) {
      return {
        status: 'ERROR',
        error: `Block not available (RDOAcceptCloning=${cloningInt}). Zone may be locked or busy.`
      };
    }

    // Step 3: Lock the block (set RDOAcceptCloning = -1)
    ctx.log.debug(`[Construction] Locking block ${currBlock}...`);
    await ctx.sendRdoRequest('construction', {
      verb: RdoVerb.SEL,
      targetId: currBlock,
      action: RdoAction.SET,
      member: 'RDOAcceptCloning',
      args: ['-1']
    }, undefined, TimeoutCategory.SLOW);

    // Step 4: Execute construction action (no request ID - push command)
    const socket = ctx.getSocket('construction');
    if (!socket) {
      return { status: 'ERROR', error: 'Construction socket unavailable' };
    }

    let actionCmd = '';
    switch (action) {
      case 'START':
        actionCmd = RdoCommand.sel(targetId)
          .call('RDOStartUpgrades')
          .push()
          .args(RdoValue.int(count))
          .build();
        ctx.log.debug(`[Construction] Starting ${count} upgrade(s)...`);
        break;
      case 'STOP':
        actionCmd = RdoCommand.sel(targetId)
          .call('RDOStopUpgrade')
          .push()
          .build();
        ctx.log.debug(`[Construction] Stopping upgrade...`);
        break;
      case 'DOWN':
        actionCmd = RdoCommand.sel(targetId)
          .call('RDODowngrade')
          .push()
          .build();
        ctx.log.debug(`[Construction] Downgrading building...`);
        break;
      default:
        return { status: 'ERROR', error: `Unknown action: ${action}` };
    }

    socket.write(actionCmd);
    ctx.log.debug(`[Construction] Command sent: ${actionCmd.substring(0, 50)}...`);

    // Step 5: Wait for server to process
    await new Promise(resolve => setTimeout(resolve, 200));

    // Step 6: Verify unlock (RDOAcceptCloning should return to 255)
    const finalCloning = await ctx.sendRdoRequest('construction', {
      verb: RdoVerb.SEL,
      targetId: currBlock,
      action: RdoAction.GET,
      member: 'RDOAcceptCloning'
    }, undefined, TimeoutCategory.SLOW);
    const finalValue = parsePropertyResponseHelper(finalCloning.payload || '', 'RDOAcceptCloning');
    ctx.log.debug(`[Construction] RDOAcceptCloning final value: ${finalValue}`);

    return {
      status: 'OK'
    };
  } catch (e: unknown) {
    ctx.log.error(`[Construction] Error:`, e);
    return {
      status: 'ERROR',
      error: toErrorMessage(e)
    };
  }
}

/**
 * Wrapper for building upgrade actions (WebSocket API).
 * Maps WebSocket action names to internal action names.
 */
export async function upgradeBuildingAction(
  ctx: SessionContext,
  x: number,
  y: number,
  action: 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE',
  count?: number
): Promise<{ success: boolean, message?: string }> {
  // Map WebSocket action names to internal action names
  let internalAction: 'START' | 'STOP' | 'DOWN';
  switch (action) {
    case 'START_UPGRADE':
      internalAction = 'START';
      break;
    case 'STOP_UPGRADE':
      internalAction = 'STOP';
      break;
    case 'DOWNGRADE':
      internalAction = 'DOWN';
      break;
    default:
      return { success: false, message: `Unknown action: ${action}` };
  }

  const result = await manageConstruction(ctx, x, y, internalAction, count || 1);

  if (result.status === 'OK') {
    const actionMsg = action === 'DOWNGRADE' ? 'Building downgraded' :
                      action === 'START_UPGRADE' ? `Upgrade started (${count} level${count !== 1 ? 's' : ''})` :
                      'Upgrade stopped';
    return { success: true, message: actionMsg };
  } else {
    return { success: false, message: result.error || 'Operation failed' };
  }
}

/**
 * Rename a facility (building).
 * Uses RDO protocol: C sel <CurrBlock> set Name="%<newName>";
 */
export async function renameFacility(
  ctx: SessionContext,
  x: number,
  y: number,
  newName: string
): Promise<{ success: boolean, message?: string }> {
  return serialiseConstruction(ctx, () => renameFacilityImpl(ctx, x, y, newName));
}

async function renameFacilityImpl(
  ctx: SessionContext,
  x: number,
  y: number,
  newName: string
): Promise<{ success: boolean, message?: string }> {
  try {
    // Use currently focused building ID if coordinates match
    let buildingId = ctx.currentFocusedBuildingId;

    // If not focused or different coordinates, focus first
    if (!buildingId ||
        !ctx.currentFocusedCoords ||
        ctx.currentFocusedCoords.x !== x ||
        ctx.currentFocusedCoords.y !== y) {
      ctx.log.debug(`[Session] Building not focused, focusing at (${x}, ${y})`);
      const focusInfo = await ctx.focusBuilding(x, y);
      if (!focusInfo.buildingId) {
        return { success: false, message: 'Could not find building at specified coordinates' };
      }
      buildingId = focusInfo.buildingId;
    } else {
      ctx.log.debug(`[Session] Using already focused building ID: ${buildingId}`);
    }

    ctx.log.debug(`[Session] Renaming building ${buildingId} to "${newName}"`);

    // Ensure construction service is connected (handles building operations on port 7001)
    if (!ctx.getSocket('construction')) {
      ctx.log.debug('[Session] Construction service not connected, connecting now...');
      await ctx.connectConstructionService();
    }

    // Send RDO SET command to Construction server (port 7001)
    // Format: C sel <CurrBlock> set Name="%<newName>";
    await ctx.sendRdoRequest('construction', {
      verb: RdoVerb.SEL,
      targetId: buildingId,
      action: RdoAction.SET,
      member: 'Name',
      args: [RdoValue.string(newName).format()]
    }, undefined, TimeoutCategory.SLOW);

    ctx.log.debug(`[Session] Building renamed successfully`);
    return { success: true, message: 'Building renamed successfully' };
  } catch (e: unknown) {
    ctx.log.error(`[Session] Failed to rename building:`, e);
    return { success: false, message: toErrorMessage(e) };
  }
}

/**
 * Delete a facility (building).
 * RDO command: C sel <World ID> call RDODelFacility "^" "#<x>","#<y>";
 * Note: sel uses worldId (from idof World), NOT building's CurrBlock ID
 */
export async function deleteFacility(
  ctx: SessionContext,
  x: number,
  y: number
): Promise<{ success: boolean, message?: string }> {
  return serialiseConstruction(ctx, () => deleteFacilityImpl(ctx, x, y));
}

async function deleteFacilityImpl(
  ctx: SessionContext,
  x: number,
  y: number
): Promise<{ success: boolean, message?: string }> {
  try {
    ctx.log.debug(`[Session] Deleting building at (${x}, ${y})`);

    // Ensure construction service is connected (handles building operations on port 7001)
    if (!ctx.getSocket('construction')) {
      ctx.log.debug('[Session] Construction service not connected, connecting now...');
      await ctx.connectConstructionService();
    }

    // Verify worldId is available (obtained from "idof World" during connection)
    if (!ctx.worldId) {
      return { success: false, message: 'Construction service not properly initialized - worldId is null' };
    }

    // Send RDO CALL command to Construction server (port 7001)
    // Format: C sel <World ID> call RDODelFacility "^" "#<x>","#<y>";
    // Note: sel must use worldId (from idof World), NOT buildingId (CurrBlock)
    const result = await ctx.sendRdoRequest('construction', {
      verb: RdoVerb.SEL,
      targetId: ctx.worldId,  // Use World ID, not building CurrBlock ID
      action: RdoAction.CALL,
      member: 'RDODelFacility',
      separator: '"^"',  // Variant return type
      args: [RdoValue.int(x).format(), RdoValue.int(y).format()]
    }, undefined, TimeoutCategory.SLOW);

    ctx.log.debug(`[Session] Building deleted successfully, result: ${result}`);

    // Clear focused building since it no longer exists
    ctx.clearBuildingFocus();

    return { success: true, message: 'Building deleted successfully' };
  } catch (e: unknown) {
    ctx.log.error(`[Session] Failed to delete building:`, e);
    return { success: false, message: toErrorMessage(e) };
  }
}
