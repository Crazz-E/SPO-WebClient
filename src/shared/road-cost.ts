/**
 * Road cost — the Voyager pricing rule for a road drag (T8, H7, issue #99).
 *
 * Voyager computed the cost while the mouse moved and sent it as an argument of
 * `CreateCircuitSeg` (`Voyager/Components/MapIsoView/Map.pas:6961-6976`,
 * `Voyager/URLHandlers/MapIsoHandler.pas:1085-1104`); the server charges the figure it
 * receives without recomputing it (`Kernel/World.pas:4252-4309`). The amount on the wire is
 * therefore a wire behaviour, not a display one — this module is the one place that decides
 * it, and both the gateway (`src/server/session/road-handler.ts`) and the drag preview use it.
 *
 * The rule, tile by tile along the staircase path — `CheckRoad`,
 * `Voyager/Components/MapIsoView/Map.pas:6607-6632`, constants at `:57-59`:
 *
 * - a tile that already carries a road is FREE (`if not tmp then inc(cost, …)`);
 * - otherwise it costs `cBridgeCost` when it is water with no concrete on it, else `cRoadCost`;
 * - a void square adds `cProhibitiveCost` on top, whether or not the tile was free.
 *
 * Every tile of the path is priced, the drag's start tile included: `CheckRoad` walks
 * `PtIdx := 1` to `PtCount`, and `FindCircuitPoints` puts the start point in the array
 * (`Voyager/Components/MapIsoView/Circuits.pas:245-259`). A drag of N steps therefore prices
 * N + 1 tiles — and since the path must touch the existing network, that extra tile is
 * normally an existing road, hence free.
 */

/** `cRoadCost` — `Voyager/Components/MapIsoView/Map.pas:58`. */
export const ROAD_COST_PER_TILE = 2_000_000;

/** `cBridgeCost` — water with no concrete under it. `Map.pas:57`. */
export const BRIDGE_COST_PER_TILE = 4_000_000;

/** `cProhibitiveCost` — the surcharge on a void square. `Map.pas:59`. */
export const VOID_TILE_SURCHARGE = 4_000_000;

/** A point on the staircase path, in world tile coordinates. */
export interface RoadPathTile {
  x: number;
  y: number;
}

/**
 * What the world says about one tile of the path. The client is the only half that holds
 * these — terrain, the road layer and concrete all live in the renderer — so it attests them
 * and the gateway prices from them.
 */
export interface RoadTileFacts {
  /** `fMap.GetRoad(i, j) <> roadNone` — the tile already carries a road, so it is free. */
  hasRoad: boolean;
  /** `LandClassOf(landId) = lncZoneD` and no concrete — the tile is crossed by a bridge. */
  isBridge: boolean;
  /**
   * `fMap.IsVoidSquare(i, j, …)` — a plot reserved for one facility class
   * (`Map.pas:2605-2623`). The WebClient models no such layer, so this is always false
   * here; the term is kept so the formula stays the Pascal's. [UNKNOWN]
   */
  isVoid: boolean;
}

export interface RoadCostEstimate {
  tileCount: number;
  cost: number;
}

/**
 * The tiles a drag from (x1, y1) to (x2, y2) paves, in path order, start tile included.
 *
 * Ported from Voyager's `FindCircuitPoints`
 * (`Voyager/Components/MapIsoView/Circuits.pas:245-312`): when `|dx| <= |dy|` each pass adds
 * the X-stepped point then the XY-stepped point, then the remaining Y distance is walked
 * straight; the `|dx| > |dy|` branch does the same with the axes swapped (Y first, then the
 * remaining X distance straight). `generateRoadSegments` derives its segments from this same
 * path instead of re-deriving the walk.
 */
export function roadPathTiles(x1: number, y1: number, x2: number, y2: number): RoadPathTile[] {
  for (const v of [x1, y1, x2, y2]) {
    if (!Number.isInteger(v)) throw new Error(`roadPathTiles: non-integer coordinate ${v}`);
  }
  const tiles: RoadPathTile[] = [{ x: x1, y: y1 }];
  const stepX = x2 > x1 ? 1 : -1;
  const stepY = y2 > y1 ? 1 : -1;
  let x = x1;
  let y = y1;
  if (Math.abs(x2 - x1) <= Math.abs(y2 - y1)) {
    while (x !== x2 && y !== y2) {
      tiles.push({ x: x + stepX, y });
      tiles.push({ x: x + stepX, y: y + stepY });
      x += stepX;
      y += stepY;
    }
    while (y !== y2) {
      y += stepY;
      tiles.push({ x, y });
    }
  } else {
    while (x !== x2 && y !== y2) {
      tiles.push({ x, y: y + stepY });
      tiles.push({ x: x + stepX, y: y + stepY });
      x += stepX;
      y += stepY;
    }
    while (x !== x2) {
      x += stepX;
      tiles.push({ x, y });
    }
  }
  return tiles;
}

/** What one tile of the path costs, per `CheckRoad`. */
export function priceRoadTile(facts: RoadTileFacts): number {
  const base = facts.hasRoad ? 0 : facts.isBridge ? BRIDGE_COST_PER_TILE : ROAD_COST_PER_TILE;
  return base + (facts.isVoid ? VOID_TILE_SURCHARGE : 0);
}

/** The whole path's cost — the figure Voyager put on the wire. */
export function priceRoadPath(facts: readonly RoadTileFacts[]): number {
  let cost = 0;
  for (const tile of facts) cost += priceRoadTile(tile);
  return cost;
}

/**
 * The facts to assume when the world is not known — no terrain loaded, or a client that
 * attests nothing. Every tile is plain land: the flat rule the gateway used before #99.
 */
export function unknownRoadTileFacts(tileCount: number): RoadTileFacts[] {
  return Array.from({ length: Math.max(0, tileCount) }, () => ({
    hasRoad: false,
    isBridge: false,
    isVoid: false,
  }));
}

/**
 * Read `facts` as facts about a path of exactly `tileCount` tiles, or refuse them.
 *
 * The gateway gets these off the WebSocket, and they decide what a player is charged, so
 * nothing here is taken on trust: the wrong shape, the wrong length, or a field that is not
 * literally `true` all fall back to the expensive reading. A caller cannot make a tile free
 * by being vague about it.
 */
export function normaliseRoadTileFacts(
  facts: unknown,
  tileCount: number
): RoadTileFacts[] {
  if (!Array.isArray(facts) || facts.length !== tileCount) return unknownRoadTileFacts(tileCount);
  return facts.map(entry => {
    const f = entry as Partial<RoadTileFacts> | null;
    return {
      hasRoad: f?.hasRoad === true,
      isBridge: f?.isBridge === true,
      isVoid: f?.isVoid === true,
    };
  });
}

/**
 * Tiles and cost for a drag. `facts` must carry one entry per path tile, in path order;
 * anything else is ignored and the path is priced as plain land.
 */
export function estimateRoadCost(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  facts?: readonly RoadTileFacts[]
): RoadCostEstimate {
  if (x1 === x2 && y1 === y2) return { tileCount: 0, cost: 0 };

  const tileCount = roadPathTiles(x1, y1, x2, y2).length;
  return { tileCount, cost: priceRoadPath(normaliseRoadTileFacts(facts, tileCount)) };
}

/**
 * What each `CreateCircuitSeg` carries: `cost div SegmentCount`
 * (`Voyager/URLHandlers/MapIsoHandler.pas:1100`). Integer division, remainder dropped — the
 * player is undercharged by up to `segmentCount - 1` units, and that is what the reference
 * client did.
 */
export function roadSegmentCost(totalCost: number, segmentCount: number): number {
  if (segmentCount <= 0) return 0;
  return Math.floor(totalCost / segmentCount);
}
