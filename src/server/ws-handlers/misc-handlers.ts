import {
  WsMessageType,
  type WsMessage,
  type WsReqManageConstruction,
  type WsRespConstructionSuccess,
  type WsReqDefineZone,
  type WsRespDefineZone,
  type WsReqCreateCompany,
  type WsRespCreateCompany,
  type WsReqClusterInfo,
  type WsRespClusterInfo,
  type WsReqClusterFacilities,
  type WsRespClusterFacilities,
  type WsReqSearchConnections,
  type WsRespSearchConnections,
  type WsRespEmpireFacilities,
  type WsReqRdoDirect,
  type WsRespRdoResult,
  type WsReqResearchInventory,
  type WsRespResearchInventory,
  type WsReqResearchDetails,
  type WsRespResearchDetails,
  SessionPhase,
} from '../../shared/types';
import * as ErrorCodes from '../../shared/error-codes';
import { RdoVerb, RdoAction } from '../../shared/types';
import { assertValidRdoIdentifier } from '../../shared/rdo-types';
import type { WsHandlerContext, WsHandler } from './types';
import { sendResponse, sendError, withErrorHandler } from './ws-utils';

export const handleManageConstruction: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqManageConstruction;
  console.log(`[WS] Construction request: ${req.action} at (${req.x}, ${req.y})`);

  const result = await ctx.session.manageConstruction(req.x, req.y, req.action, req.count || 1);

  if (result.status === 'OK') {
    const response: WsRespConstructionSuccess = {
      type: WsMessageType.RESP_CONSTRUCTION_SUCCESS,
      wsRequestId: msg.wsRequestId,
      action: req.action,
      x: req.x,
      y: req.y,
    };
    sendResponse(ctx.ws, response);
  } else {
    sendError(ctx.ws, msg.wsRequestId, result.error || 'Construction operation failed', ErrorCodes.ERROR_RequestDenied);
  }
};

export const handleDefineZone: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    const req = msg as WsReqDefineZone;
    console.log(`[Gateway] Define zone ${req.zoneId} from (${req.x1}, ${req.y1}) to (${req.x2}, ${req.y2})`);

    const result = await ctx.session.defineZone(req.zoneId, req.x1, req.y1, req.x2, req.y2);

    const response: WsRespDefineZone = {
      type: WsMessageType.RESP_DEFINE_ZONE,
      wsRequestId: msg.wsRequestId,
      success: result.success,
      message: result.message,
    };
    sendResponse(ctx.ws, response);
  });
};

export const handleCreateCompany: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqCreateCompany;
  console.log(`[Gateway] Creating company: "${req.companyName}" in cluster "${req.cluster}"`);

  if (!req.companyName || req.companyName.trim().length === 0) {
    sendError(ctx.ws, msg.wsRequestId, 'Company name cannot be empty', ErrorCodes.ERROR_InvalidParameter);
    return;
  }

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_Unknown, async () => {
    const result = await ctx.session.createCompany(req.companyName.trim(), req.cluster);

    if (result.success) {
      const response: WsRespCreateCompany = {
        type: WsMessageType.RESP_CREATE_COMPANY,
        wsRequestId: msg.wsRequestId,
        success: true,
        companyName: result.companyName,
        companyId: result.companyId,
      };
      sendResponse(ctx.ws, response);
    } else {
      sendError(ctx.ws, msg.wsRequestId, result.message || 'Failed to create company', ErrorCodes.ERROR_Unknown);
    }
  });
};

export const handleClusterInfo: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_Unknown, async () => {
    const req = msg as WsReqClusterInfo;
    const clusterInfo = await ctx.session.fetchClusterInfo(req.clusterName);
    const response: WsRespClusterInfo = {
      type: WsMessageType.RESP_CLUSTER_INFO,
      wsRequestId: msg.wsRequestId,
      clusterInfo,
    };
    sendResponse(ctx.ws, response);
  });
};

export const handleClusterFacilities: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_Unknown, async () => {
    const req = msg as WsReqClusterFacilities;
    const facilities = await ctx.session.fetchClusterFacilities(req.cluster, req.folder);
    const response: WsRespClusterFacilities = {
      type: WsMessageType.RESP_CLUSTER_FACILITIES,
      wsRequestId: msg.wsRequestId,
      facilities,
    };
    sendResponse(ctx.ws, response);
  });
};

export const handleSearchConnections: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqSearchConnections;
  console.log(`[Gateway] Searching ${req.direction} connections for fluid: ${req.fluidId}`);
  const results = await ctx.session.searchConnections(
    req.buildingX, req.buildingY,
    req.fluidId, req.direction, req.filters
  );
  const response: WsRespSearchConnections = {
    type: WsMessageType.RESP_SEARCH_CONNECTIONS,
    wsRequestId: msg.wsRequestId,
    results,
    fluidId: req.fluidId,
    direction: req.direction,
  };
  sendResponse(ctx.ws, response);
};

export const handleEmpireFacilities: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  console.log('[Gateway] Fetching owned facilities (favorites)');
  const facilities = await ctx.session.fetchOwnedFacilities();
  const response: WsRespEmpireFacilities = {
    type: WsMessageType.RESP_EMPIRE_FACILITIES,
    wsRequestId: msg.wsRequestId,
    facilities,
  };
  sendResponse(ctx.ws, response);
};

// ── REQ_RDO_DIRECT rate limiting (audit V3) ─────────────────────────────────
// This handler lets the browser emit arbitrary RDO frames. Without a throttle,
// a buggy or malicious client can flood the shared legacy Delphi server at
// WebSocket speed. Token bucket: burst of 10, refill 5 tokens/second.

const RDO_DIRECT_BURST = 10;
const RDO_DIRECT_TOKENS_PER_SEC = 5;

/**
 * Members this endpoint may `call`.
 *
 * An allowlist, not a blocklist, and the distinction is the whole point. This
 * path forces the `"^"` separator — `WsReqRdoDirect` carries no separator field,
 * so `RdoProtocol.format` falls back to METHOD_SEPARATOR once `sendRdoRequest`
 * assigns a rid. `"^"` on a Delphi `procedure` freezes the shared Interface
 * Server, and a single frame is enough (live-proven 2026-08-15).
 *
 * `assertNotVariantOnVoidMember` cannot defend this path: it only fires for
 * names already known to be void, so any *unlisted* procedure sails through.
 * Published procedures reachable by a forged WebSocket message included
 * `SetViewedArea`, `SetTycoonCookie`, `CloneFacility`, `VoiceThis` and
 * `DisconnectUser` (Interface Server/InterfaceServer.pas:144,163,164,180,262).
 *
 * Only `call` is constrained: `get` emits no separator and `set` uses `=`.
 *
 * Every entry must be a Delphi `function`, with its declaration cited. When the
 * probe harness (lot L9-pré) needs another member, add it here with its Pascal
 * signature — never widen the check instead.
 */
const RDO_DIRECT_CALLABLE_MEMBERS: ReadonlyMap<string, string> = new Map([
  ['ObjectAt', 'function ObjectAt( x, y : integer ) : OleVariant — InterfaceServer.pas:146'],
  ['GetTycoonCookie', 'function GetTycoonCookie( TycoonId : integer; CookieName : widestring ) : OleVariant — InterfaceServer.pas:162'],
]);
const rdoDirectBuckets = new WeakMap<object, { tokens: number; lastRefill: number }>();

/** @internal Exported for testing. Returns false when the session is over its budget. */
export function takeRdoDirectToken(session: object, now: number = Date.now()): boolean {
  let bucket = rdoDirectBuckets.get(session);
  if (!bucket) {
    bucket = { tokens: RDO_DIRECT_BURST, lastRefill: now };
    rdoDirectBuckets.set(session, bucket);
  }
  const elapsedSec = Math.max(0, now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(RDO_DIRECT_BURST, bucket.tokens + elapsedSec * RDO_DIRECT_TOKENS_PER_SEC);
  bucket.lastRefill = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export const handleRdoDirect: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    if (ctx.session.getPhase() !== SessionPhase.WORLD_CONNECTED) {
      throw new Error('RDO direct requires an active world connection');
    }

    if (!takeRdoDirectToken(ctx.session)) {
      throw new Error(`RDO direct rate limit exceeded (${RDO_DIRECT_TOKENS_PER_SEC}/s, burst ${RDO_DIRECT_BURST})`);
    }

    const req = msg as WsReqRdoDirect;

    // The grammar's two axes are distinct: RdoVerb selects the object (idof /
    // sel), RdoAction selects what to do with it (get / set / call). The old
    // list conflated them — it rejected the legitimate `idof` and accepted
    // three values that are not verbs at all.
    if (!Object.values(RdoVerb).includes(req.verb as RdoVerb)) {
      throw new Error(`Invalid RDO verb: ${req.verb} (expected ${Object.values(RdoVerb).join(' or ')})`);
    }

    if (!req.targetId || !req.action || !req.member) {
      throw new Error('Missing required RDO fields: targetId, action, and member are required');
    }

    // This handler writes the whole frame body from browser input, so every
    // field that lands unquoted in the frame is validated here as well as at
    // the RdoProtocol.format() chokepoint (P-H3 / P-M2). All four matter:
    // member, targetId and action are spliced in unquoted, so an unvalidated
    // one becomes a second sub-command that the server's ExecQuery loop runs
    // (RDOQueryServer.pas:133-160).
    assertValidRdoIdentifier(req.member, 'member');
    if (!/^\d+$/.test(req.targetId)) {
      throw new Error(`Invalid RDO target ID: ${req.targetId} (expected a decimal object id)`);
    }
    if (!Object.values(RdoAction).includes(req.action as RdoAction)) {
      throw new Error(`Invalid RDO action: ${req.action} (expected ${Object.values(RdoAction).join(', ')})`);
    }

    // `call` through this path always emits "^" (see RDO_DIRECT_CALLABLE_MEMBERS),
    // which freezes the server on a Delphi `procedure`. Allowlist, not blocklist.
    if (req.action === RdoAction.CALL && !RDO_DIRECT_CALLABLE_MEMBERS.has(req.member)) {
      throw new Error(
        `Member "${req.member}" may not be called through REQ_RDO_DIRECT. This path emits the ` +
        `"^" separator, which freezes the shared Delphi server on a procedure. Allowed: ` +
        `${[...RDO_DIRECT_CALLABLE_MEMBERS.keys()].join(', ')}.`
      );
    }

    const result = await ctx.session.executeRdo('world', {
      verb: req.verb,
      targetId: req.targetId,
      action: req.action,
      member: req.member,
      args: req.args,
    });
    const response: WsRespRdoResult = {
      type: WsMessageType.RESP_RDO_RESULT,
      wsRequestId: msg.wsRequestId,
      result,
    };
    sendResponse(ctx.ws, response);
  });
};

export const handleResearchInventory: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    const req = msg as WsReqResearchInventory;
    console.log(`[Gateway] Research inventory request at (${req.buildingX}, ${req.buildingY}), cat=${req.categoryIndex}`);

    const data = await ctx.session.getResearchInventory(req.buildingX, req.buildingY, req.categoryIndex);

    // Enrich items with names/descriptions from parsed research.0.dat
    // The server cache only has names for volatile inventions — the .dat
    // file provides display names for all 879 inventions.
    if (ctx.inventionIndex) {
      const enrichSection = (items: typeof data.available) => {
        for (const item of items) {
          const datInv = ctx.inventionIndex!.byId.get(item.inventionId);
          if (datInv) {
            if (!item.name || item.name === item.inventionId) item.name = datInv.name;
            if (!item.parent) item.parent = datInv.parent;
          }
        }
      };
      enrichSection(data.available);
      enrichSection(data.developing);
      enrichSection(data.completed);
    }

    const response: WsRespResearchInventory = {
      type: WsMessageType.RESP_RESEARCH_INVENTORY,
      wsRequestId: msg.wsRequestId,
      data,
    };
    sendResponse(ctx.ws, response);
  });
};

export const handleResearchDetails: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    const req = msg as WsReqResearchDetails;
    console.log(`[Gateway] Research details request for "${req.inventionId}" at (${req.buildingX}, ${req.buildingY})`);

    const details = await ctx.session.getResearchDetails(req.buildingX, req.buildingY, req.inventionId);

    const response: WsRespResearchDetails = {
      type: WsMessageType.RESP_RESEARCH_DETAILS,
      wsRequestId: msg.wsRequestId,
      details,
    };
    sendResponse(ctx.ws, response);
  });
};
