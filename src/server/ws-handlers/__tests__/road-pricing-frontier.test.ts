/**
 * REQ_BUILD_ROAD / REQ_GET_ROAD_COST — the tile facts a drag is priced from, at the
 * WebSocket frontier (issue #99).
 *
 * Terrain, the road layer and concrete live in the renderer, so the client attests them and
 * the gateway prices from them. The frontier's only job is to hand that array through
 * unchanged — a fact dropped here is a road silently priced as bare land.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { WebSocket } from 'ws';
import { WsMessageType, type WsMessage } from '../../../shared/types';
import { handleBuildRoad, handleGetRoadCost } from '../road-handlers';
import type { WsHandlerContext } from '../types';
import type { RoadTileFacts } from '../../../shared/road-cost';

const FACTS: RoadTileFacts[] = [
  { hasRoad: true, isBridge: false, isVoid: false },
  { hasRoad: false, isBridge: true, isVoid: false },
];

function createCtx(): {
  ctx: WsHandlerContext;
  sent: Array<Record<string, unknown>>;
  buildRoad: jest.Mock;
  getRoadCostEstimate: jest.Mock;
} {
  const sent: Array<Record<string, unknown>> = [];
  const ws = {
    send(payload: string): void {
      sent.push(JSON.parse(payload) as Record<string, unknown>);
    },
  } as unknown as WebSocket;

  const buildRoad = jest.fn(async () => ({
    success: true, cost: 6_000_000, tileCount: 1, partial: false,
  }));
  const getRoadCostEstimate = jest.fn(() => ({
    cost: 6_000_000, tileCount: 2, costPerTile: 2_000_000, valid: true,
  }));

  const ctx = { ws, session: { buildRoad, getRoadCostEstimate } } as unknown as WsHandlerContext;
  return { ctx, sent, buildRoad, getRoadCostEstimate };
}

const buildRequest = (over: Partial<Record<string, unknown>> = {}): WsMessage => ({
  type: WsMessageType.REQ_BUILD_ROAD,
  wsRequestId: 'req-1',
  x1: 953, y1: 999, x2: 954, y2: 999,
  tileFacts: FACTS,
  ...over,
} as unknown as WsMessage);

describe('handleBuildRoad', () => {
  it('hands the attested tile facts to the session, after the coordinates', async () => {
    const { ctx, buildRoad } = createCtx();
    await handleBuildRoad(ctx, buildRequest());
    expect(buildRoad).toHaveBeenCalledWith(953, 999, 954, 999, FACTS);
  });

  it('passes undefined when the client attests nothing', async () => {
    const { ctx, buildRoad } = createCtx();
    await handleBuildRoad(ctx, buildRequest({ tileFacts: undefined }));
    expect(buildRoad).toHaveBeenCalledWith(953, 999, 954, 999, undefined);
  });

  it('echoes the cost the session charged back to the client', async () => {
    const { ctx, sent } = createCtx();
    await handleBuildRoad(ctx, buildRequest());
    expect(sent[0]).toMatchObject({
      type: WsMessageType.RESP_BUILD_ROAD,
      wsRequestId: 'req-1',
      success: true,
      cost: 6_000_000,
    });
  });
});

describe('handleGetRoadCost', () => {
  it('hands the attested tile facts to the estimate and echoes its answer', async () => {
    const { ctx, sent, getRoadCostEstimate } = createCtx();
    await handleGetRoadCost(ctx, buildRequest({ type: WsMessageType.REQ_GET_ROAD_COST }));
    expect(getRoadCostEstimate).toHaveBeenCalledWith(953, 999, 954, 999, FACTS);
    expect(sent[0]).toMatchObject({
      type: WsMessageType.RESP_GET_ROAD_COST,
      cost: 6_000_000,
      tileCount: 2,
      costPerTile: 2_000_000,
    });
  });
});
