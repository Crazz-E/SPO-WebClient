/**
 * road-handler.ts — Road building, demolition, and cost estimation.
 *
 * Extracted from StarpeaceSession (spo_session.ts).
 * Each public function takes `ctx: SessionContext` as its first argument.
 */

import type { SessionContext } from './session-context';
import { TimeoutCategory } from '../../shared/timeout-categories';
import { RdoValue } from '../../shared/rdo-types';
import { rdoCall } from '../../shared/rdo-frame';
import { toErrorMessage } from '../../shared/error-utils';
import { parseResultCode } from '../rdo-helpers';
import {
  ROAD_COST_PER_TILE,
  estimateRoadCost,
  roadPathTiles,
  roadSegmentCost,
  type RoadTileFacts,
} from '../../shared/road-cost';

/**
 * Re-exported so the gateway keeps one name for it; the rule itself lives in
 * `@/shared/road-cost`, which prices bridges and already-paved tiles too (issue #99).
 */
export { ROAD_COST_PER_TILE };

/**
 * Generate individual road segments for a path from (x1,y1) to (x2,y2)
 *
 * For horizontal/vertical paths: returns a single segment
 * For diagonal paths: returns multiple 1-tile segments in staircase pattern
 *
 * Algorithm for diagonal (staircase pattern):
 * - Alternate between horizontal and vertical 1-tile segments
 * - Prioritize the axis with more distance remaining
 *
 * @param x1 Start X
 * @param y1 Start Y
 * @param x2 End X
 * @param y2 End Y
 * @returns Array of segments, each with start/end coordinates
 */
function generateRoadSegments(
  x1: number, y1: number, x2: number, y2: number
): Array<{ sx: number; sy: number; ex: number; ey: number }> {
  const segments: Array<{ sx: number; sy: number; ex: number; ey: number }> = [];

  const dx = x2 - x1;
  const dy = y2 - y1;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Pure horizontal segment
  if (dy === 0 && dx !== 0) {
    segments.push({ sx: x1, sy: y1, ex: x2, ey: y2 });
    return segments;
  }

  // Pure vertical segment
  if (dx === 0 && dy !== 0) {
    segments.push({ sx: x1, sy: y1, ex: x2, ey: y2 });
    return segments;
  }

  // Diagonal: create staircase pattern with 1-tile segments
  // Direction increments
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;

  let currentX = x1;
  let currentY = y1;
  let remainingX = absDx;
  let remainingY = absDy;

  // Alternate between X and Y moves, prioritizing the axis with more remaining distance
  while (remainingX > 0 || remainingY > 0) {
    // Decide whether to move X or Y
    // Prioritize the axis with more remaining steps
    const moveX = remainingX > 0 && (remainingX >= remainingY || remainingY === 0);

    if (moveX) {
      // Horizontal 1-tile segment
      const nextX = currentX + stepX;
      segments.push({ sx: currentX, sy: currentY, ex: nextX, ey: currentY });
      currentX = nextX;
      remainingX--;
    } else if (remainingY > 0) {
      // Vertical 1-tile segment
      const nextY = currentY + stepY;
      segments.push({ sx: currentX, sy: currentY, ex: currentX, ey: nextY });
      currentY = nextY;
      remainingY--;
    }
  }

  return segments;
}

/**
 * Build a road path between two points
 *
 * For horizontal/vertical: sends single segment
 * For diagonal: sends multiple 1-tile segments in staircase pattern (like official client)
 *
 * RDO command: C sel <Context ID> call CreateCircuitSeg "^" "#<circuitId>","#<ownerId>","#<x1>","#<y1>","#<x2>","#<y2>","#<cost>";
 *
 * CRITICAL: Uses worldContextId (from Logon response), NOT interfaceServerId
 *
 * @param ctx Session context
 * @param x1 Start X coordinate
 * @param y1 Start Y coordinate
 * @param x2 End X coordinate
 * @param y2 End Y coordinate
 * @param facts What the world says about each path tile, in path order (issue #99). The
 *   client is the only half that holds terrain, roads and concrete, so it attests them;
 *   anything that is not one entry per path tile is ignored and the path is priced as plain
 *   land, which is what the gateway did before.
 * @returns Result with success status, total cost, and tile count
 */
export async function buildRoad(
  ctx: SessionContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  facts?: readonly RoadTileFacts[]
): Promise<{ success: boolean; cost: number; tileCount: number; message?: string; errorCode?: number; partial?: boolean }> {
  try {
    ctx.log.debug(`[RoadBuilding] Building road from (${x1}, ${y1}) to (${x2}, ${y2})`);

    // Validate points are different
    if (x1 === x2 && y1 === y2) {
      ctx.log.warn(`[RoadBuilding] Invalid: start and end points are the same`);
      return {
        success: false,
        cost: 0,
        tileCount: 0,
        message: 'Start and end points must be different.',
        errorCode: 2 // CIRCUIT_ERROR_InvalidSegment
      };
    }

    // Verify world socket is connected
    if (!ctx.getSocket('world')) {
      ctx.log.error('[RoadBuilding] Interface server not connected');
      return {
        success: false,
        cost: 0,
        tileCount: 0,
        message: 'Interface server not connected',
        errorCode: 1
      };
    }

    // Verify worldContextId is available
    if (!ctx.worldContextId) {
      ctx.log.error('[RoadBuilding] World context not initialized');
      return {
        success: false,
        cost: 0,
        tileCount: 0,
        message: 'World context not initialized',
        errorCode: 1
      };
    }

    // Generate segments (single for H/V, multiple for diagonal)
    const segments = generateRoadSegments(x1, y1, x2, y2);
    ctx.log.debug(`[RoadBuilding] Generated ${segments.length} segment(s)`);

    // Price the whole path once, then split it the way Voyager did: every CreateCircuitSeg
    // carries `cost div SegmentCount` (MapIsoHandler.pas:1100), remainder dropped.
    const pathCost = estimateRoadCost(x1, y1, x2, y2, facts);
    if (facts && facts.length !== roadPathTiles(x1, y1, x2, y2).length) {
      ctx.log.warn(`[RoadBuilding] Ignoring ${facts.length} attested tile fact(s) — the path has ${pathCost.tileCount}; pricing as plain land`);
    }
    const perSegmentCost = roadSegmentCost(pathCost.cost, segments.length);
    ctx.log.debug(`[RoadBuilding] Path costs ${pathCost.cost} over ${pathCost.tileCount} tile(s) → ${perSegmentCost} per segment`);

    // Get owner and circuit IDs
    if (!ctx.fTycoonProxyId) {
      return {
        success: false, cost: 0, tileCount: 0,
        message: 'Tycoon not initialized — reconnect', errorCode: 1
      };
    }
    const ownerId = ctx.fTycoonProxyId;
    const circuitId = 1; // Road circuit type

    let totalCost = 0;
    let totalTiles = 0;
    let failedSegment: { message: string; errorCode: number } | null = null;

    // Send each segment sequentially
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      // Every segment carries the same share of the path's cost, whatever its length;
      // segTiles only says how much ground this one paves, for the partial-build report.
      const segDx = Math.abs(seg.ex - seg.sx);
      const segDy = Math.abs(seg.ey - seg.sy);
      const segTiles = Math.max(segDx, segDy);
      const segCost = perSegmentCost;

      ctx.log.debug(`[RoadBuilding] Segment ${i + 1}/${segments.length}: (${seg.sx},${seg.sy}) to (${seg.ex},${seg.ey}), tiles=${segTiles}, cost=${segCost}`);

      const result = await ctx.sendRdoRequest('world', rdoCall(
        'CreateCircuitSeg', ctx.worldContextId!,
        RdoValue.int(circuitId),
        RdoValue.int(ownerId),
        RdoValue.int(seg.sx),
        RdoValue.int(seg.sy),
        RdoValue.int(seg.ex),
        RdoValue.int(seg.ey),
        RdoValue.int(segCost),
      ).packet, undefined, TimeoutCategory.SLOW);

      // Parse response
      const resultCode = parseResultCode(result.payload);

      if (resultCode === 0) {
        totalCost += segCost;
        totalTiles += segTiles;
      } else {
        // Map error codes to user-friendly messages
        const errorMessages: Record<number, string> = {
          1: 'Road construction failed — please try a different location',
          2: 'Invalid road segment — check your coordinates',
          3: 'Permission denied — you may not have sufficient funds or rights to build here',
          4: 'Insufficient funds to build this road segment',
          5: 'Your company was not recognized — please reconnect',
          21: 'Unsupported road type',
          22: 'Cannot build a road at this location — area may be occupied or restricted',
          23: 'Cannot modify an existing road segment here',
        };

        failedSegment = {
          message: errorMessages[resultCode] || `Failed with code ${resultCode}`,
          errorCode: resultCode
        };
        ctx.log.warn(`[RoadBuilding] Segment ${i + 1} failed: ${failedSegment.message}`);
        // Voyager stops at the first refusal: `while (SegIdx < SegmentCount) and (ErrorCode = NOERROR)`
        // (MapIsoHandler.pas:1099-1103). Each segment is charged independently
        // (World.pas:4288), so sending further segments after a refusal would spend money
        // on a road the reference client would never have built.
        break;
      }
    }

    // Return overall result
    if (totalTiles > 0) {
      const message = failedSegment
        ? `Road partially built (${totalTiles} tiles). Some segments failed: ${failedSegment.message}`
        : `Road built successfully: ${totalTiles} tiles`;

      ctx.log.debug(`[RoadBuilding] ${message}`);
      return {
        success: true,
        partial: failedSegment !== null,
        cost: totalCost,
        tileCount: totalTiles,
        message
      };
    } else {
      return {
        success: false,
        cost: 0,
        tileCount: 0,
        message: failedSegment?.message || 'Failed to build road',
        errorCode: failedSegment?.errorCode || 1
      };
    }
  } catch (e: unknown) {
    ctx.log.error(`[RoadBuilding] Failed to build road:`, e);
    return {
      success: false,
      cost: 0,
      tileCount: 0,
      message: toErrorMessage(e),
      errorCode: 1
    };
  }
}

/**
 * Get road building cost estimate without actually building.
 *
 * The tiles counted are the ones the drag actually paves — the staircase path, start tile
 * included, exactly what `buildRoad` prices. The Chebyshev distance this used to return
 * undercounted every diagonal drag.
 *
 * @param x1 Start X coordinate
 * @param y1 Start Y coordinate
 * @param x2 End X coordinate
 * @param y2 End Y coordinate
 * @param facts What the world says about each path tile, in path order (issue #99)
 * @returns Cost estimate with tile count
 */
export function getRoadCostEstimate(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  facts?: readonly RoadTileFacts[]
): { cost: number; tileCount: number; costPerTile: number; valid: boolean; error?: string } {
  // Validate start and end points are different
  if (x1 === x2 && y1 === y2) {
    return {
      cost: 0,
      tileCount: 0,
      costPerTile: ROAD_COST_PER_TILE,
      valid: false,
      error: 'Start and end points must be different'
    };
  }

  const { tileCount, cost } = estimateRoadCost(x1, y1, x2, y2, facts);

  return {
    cost,
    tileCount,
    costPerTile: ROAD_COST_PER_TILE,
    valid: true
  };
}

/**
 * Demolish a road segment at (x, y)
 *
 * Delphi reference (World.pas:4311-4354):
 *   function RDOBreakCircuitAt(CircuitId, TycoonId, x, y: integer): OleVariant;
 *   CircuitId: 1=Roads, 2=Rail
 *   Returns: 0=success (also returned if no segment at location), 1=unknown, 15=accessDenied, 21=unknownCircuit
 *
 * Uses worldContextId (same as road building)
 *
 * @param ctx Session context
 * @param x X coordinate
 * @param y Y coordinate
 */
export async function demolishRoad(
  ctx: SessionContext,
  x: number,
  y: number
): Promise<{ success: boolean; message?: string; errorCode?: number }> {
  if (!ctx.worldContextId) {
    return { success: false, message: 'Not connected to world', errorCode: 1 };
  }

  if (!ctx.fTycoonProxyId) {
    return { success: false, message: 'Tycoon not initialized — reconnect', errorCode: 1 };
  }
  const circuitId = 1; // Road circuit type
  const ownerId = ctx.fTycoonProxyId;

  try {
    const result = await ctx.sendRdoRequest('world', rdoCall(
      'BreakCircuitAt', ctx.worldContextId,
      RdoValue.int(circuitId),
      RdoValue.int(ownerId),
      RdoValue.int(x),
      RdoValue.int(y),
    ).packet, undefined, TimeoutCategory.SLOW);

    const resultCode = parseResultCode(result.payload);

    if (resultCode === 0) {
      ctx.log.debug(`[RoadDemolish] Road demolished at (${x}, ${y})`);
      return { success: true };
    }

    // Delphi return codes (World.pas / Protocol.pas):
    //   0 = NOERROR (success OR no segment found — ambiguous)
    //   1 = ERROR_Unknown
    //  15 = ERROR_AccessDenied
    //  21 = ERROR_UnknownCircuit
    const errorMessages: Record<number, string> = {
      1: 'Road demolition failed — please try a different location',
      15: 'Permission denied — you do not have rights to demolish roads here',
      21: 'Invalid circuit type',
    };

    const message = errorMessages[resultCode] || `Failed with code ${resultCode}`;
    ctx.log.warn(`[RoadDemolish] Failed at (${x}, ${y}): ${message}`);
    return { success: false, message, errorCode: resultCode };
  } catch (e: unknown) {
    ctx.log.error(`[RoadDemolish] Failed to demolish road:`, e);
    return { success: false, message: toErrorMessage(e), errorCode: 1 };
  }
}

/**
 * Wipe (demolish) all road segments in a rectangular area.
 * RDO: sel <worldContextId> call WipeCircuit "^" "#<circuitId>","#<ownerId>","#<x1>","#<y1>","#<x2>","#<y2>"
 * Delphi: World.pas RDOWipeCircuit(CircuitId, TycoonId, x1, y1, x2, y2)
 *
 * @param ctx Session context
 * @param x1 First corner X
 * @param y1 First corner Y
 * @param x2 Second corner X
 * @param y2 Second corner Y
 */
export async function wipeCircuit(
  ctx: SessionContext,
  x1: number, y1: number, x2: number, y2: number
): Promise<{ success: boolean; message?: string; errorCode?: number }> {
  if (!ctx.worldContextId) {
    return { success: false, message: 'Not connected to world', errorCode: 1 };
  }
  if (!ctx.fTycoonProxyId) {
    return { success: false, message: 'Tycoon not initialized — reconnect', errorCode: 1 };
  }

  const circuitId = 1; // Road circuit type
  const ownerId = ctx.fTycoonProxyId;
  // Normalize to min/max
  const nx1 = Math.min(x1, x2);
  const ny1 = Math.min(y1, y2);
  const nx2 = Math.max(x1, x2);
  const ny2 = Math.max(y1, y2);

  try {
    const result = await ctx.sendRdoRequest('world', rdoCall(
      'WipeCircuit', ctx.worldContextId,
      RdoValue.int(circuitId),
      RdoValue.int(ownerId),
      RdoValue.int(nx1),
      RdoValue.int(ny1),
      RdoValue.int(nx2),
      RdoValue.int(ny2),
    ).packet, undefined, TimeoutCategory.SLOW);

    const resultCode = parseResultCode(result.payload);

    if (resultCode === 0) {
      ctx.log.debug(`[RoadDemolish] Area wiped (${nx1},${ny1})→(${nx2},${ny2})`);
      return { success: true };
    }

    const errorMessages: Record<number, string> = {
      1: 'Road demolition failed — please try a different area',
      15: 'Permission denied — you do not have rights to demolish roads here',
      21: 'Invalid circuit type',
    };

    const message = errorMessages[resultCode] || `Failed with code ${resultCode}`;
    ctx.log.warn(`[RoadDemolish] Area wipe failed: ${message}`);
    return { success: false, message, errorCode: resultCode };
  } catch (e: unknown) {
    ctx.log.error(`[RoadDemolish] Failed to wipe circuit:`, e);
    return { success: false, message: toErrorMessage(e), errorCode: 1 };
  }
}
