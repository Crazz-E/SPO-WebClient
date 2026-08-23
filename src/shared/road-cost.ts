/**
 * Road cost — the client-side estimate of what a road segment will be charged (T8, H7).
 *
 * Voyager computed the cost while the mouse moved and sent it as an argument of
 * `CreateCircuitSeg` (`Voyager/Components/MapIsoView/Map.pas:6961-6976`,
 * `Voyager/URLHandlers/MapIsoHandler.pas:1085-1104`); the server charges what it receives
 * (`Kernel/World.pas:4252-4309`). Here the gateway owns that rule — a flat amount per tile
 * (`src/server/session/road-handler.ts`, `ROAD_COST_PER_TILE`), every 1-tile step of a
 * staircase being its own segment — so the preview must follow the gateway, not the Pascal:
 * a diagonal drag costs its Manhattan length, not its Chebyshev one.
 *
 * (Voyager also priced water tiles at 4 M and let existing road tiles go free; the gateway
 * does neither — a server-side question, recorded in doc/ux/missing-features.md H7.)
 */

/** Mirrors `ROAD_COST_PER_TILE` in `src/server/session/road-handler.ts` (asserted by test). */
export const ROAD_COST_PER_TILE = 2_000_000;

export interface RoadCostEstimate {
  tileCount: number;
  cost: number;
}

/** Tiles and cost the gateway will charge for a drag from (x1, y1) to (x2, y2). */
export function estimateRoadCost(x1: number, y1: number, x2: number, y2: number): RoadCostEstimate {
  const tileCount = Math.abs(x2 - x1) + Math.abs(y2 - y1);
  return { tileCount, cost: tileCount * ROAD_COST_PER_TILE };
}
