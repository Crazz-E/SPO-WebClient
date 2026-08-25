import {
  BRIDGE_COST_PER_TILE,
  ROAD_COST_PER_TILE,
  VOID_TILE_SURCHARGE,
  estimateRoadCost,
  priceRoadPath,
  priceRoadTile,
  roadPathTiles,
  normaliseRoadTileFacts,
  roadSegmentCost,
  unknownRoadTileFacts,
  type RoadTileFacts,
} from './road-cost';
import { ROAD_COST_PER_TILE as GATEWAY_ROAD_COST_PER_TILE } from '../server/session/road-handler';

const land = (over: Partial<RoadTileFacts> = {}): RoadTileFacts => ({
  hasRoad: false,
  isBridge: false,
  isVoid: false,
  ...over,
});

describe('road cost constants', () => {
  it('are the very amounts the gateway charges', () => {
    expect(ROAD_COST_PER_TILE).toBe(GATEWAY_ROAD_COST_PER_TILE);
  });

  it('match Voyager (Map.pas:57-59)', () => {
    expect(ROAD_COST_PER_TILE).toBe(2_000_000);
    expect(BRIDGE_COST_PER_TILE).toBe(4_000_000);
    expect(VOID_TILE_SURCHARGE).toBe(4_000_000);
  });
});

describe('roadPathTiles', () => {
  it('includes the start tile — FindCircuitPoints seeds the array with it', () => {
    expect(roadPathTiles(4, 4, 4, 4)).toEqual([{ x: 4, y: 4 }]);
    expect(roadPathTiles(10, 5, 13, 5)).toEqual([
      { x: 10, y: 5 }, { x: 11, y: 5 }, { x: 12, y: 5 }, { x: 13, y: 5 },
    ]);
  });

  it('walks a staircase, stepping the axis with more left to go', () => {
    expect(roadPathTiles(0, 0, 2, 2)).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 },
    ]);
  });

  it('walks backwards just as well', () => {
    expect(roadPathTiles(2, 2, 0, 1)).toEqual([
      { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 1 },
    ]);
  });

  it('prices one more tile than the drag has steps', () => {
    expect(roadPathTiles(0, 0, 3, 5)).toHaveLength(3 + 5 + 1);
  });
});

describe('priceRoadTile — CheckRoad, Map.pas:6607-6632', () => {
  it('charges the road rate on plain land', () => {
    expect(priceRoadTile(land())).toBe(ROAD_COST_PER_TILE);
  });

  it('charges the bridge rate on water with no concrete', () => {
    expect(priceRoadTile(land({ isBridge: true }))).toBe(BRIDGE_COST_PER_TILE);
  });

  it('charges nothing for a tile that already carries a road — bridge or not', () => {
    expect(priceRoadTile(land({ hasRoad: true }))).toBe(0);
    expect(priceRoadTile(land({ hasRoad: true, isBridge: true }))).toBe(0);
  });

  it('adds the void surcharge on top, even on a tile that was free', () => {
    expect(priceRoadTile(land({ isVoid: true }))).toBe(ROAD_COST_PER_TILE + VOID_TILE_SURCHARGE);
    expect(priceRoadTile(land({ hasRoad: true, isVoid: true }))).toBe(VOID_TILE_SURCHARGE);
    expect(priceRoadTile(land({ isBridge: true, isVoid: true }))).toBe(BRIDGE_COST_PER_TILE + VOID_TILE_SURCHARGE);
  });
});

describe('priceRoadPath', () => {
  it('is the sum of its tiles', () => {
    expect(priceRoadPath([land(), land({ isBridge: true }), land({ hasRoad: true })]))
      .toBe(ROAD_COST_PER_TILE + BRIDGE_COST_PER_TILE);
  });

  it('is zero for an empty path', () => {
    expect(priceRoadPath([])).toBe(0);
  });
});

describe('unknownRoadTileFacts', () => {
  it('makes every tile plain land', () => {
    expect(unknownRoadTileFacts(2)).toEqual([land(), land()]);
  });

  it('never returns a negative-length array', () => {
    expect(unknownRoadTileFacts(-3)).toEqual([]);
  });
});

describe('normaliseRoadTileFacts — the gateway reads these off the wire', () => {
  it('keeps facts that describe the path, field by field', () => {
    expect(normaliseRoadTileFacts([{ hasRoad: true, isBridge: false, isVoid: false }], 1))
      .toEqual([{ hasRoad: true, isBridge: false, isVoid: false }]);
  });

  it('refuses anything that is not an array of the right length', () => {
    expect(normaliseRoadTileFacts(undefined, 2)).toEqual([land(), land()]);
    expect(normaliseRoadTileFacts('free please', 2)).toEqual([land(), land()]);
    expect(normaliseRoadTileFacts([land()], 2)).toEqual([land(), land()]);
  });

  it('counts only a literal true — a vague claim never makes a tile free', () => {
    expect(normaliseRoadTileFacts([{ hasRoad: 'yes', isBridge: 1, isVoid: {} }], 1))
      .toEqual([land()]);
    expect(normaliseRoadTileFacts([null], 1)).toEqual([land()]);
  });
});

describe('estimateRoadCost', () => {
  it('prices the whole staircase as plain land when the world is unknown', () => {
    expect(estimateRoadCost(10, 5, 14, 5)).toEqual({ tileCount: 5, cost: 5 * ROAD_COST_PER_TILE });
    expect(estimateRoadCost(3, 9, 3, 2)).toEqual({ tileCount: 8, cost: 8 * ROAD_COST_PER_TILE });
    expect(estimateRoadCost(0, 0, 3, 2)).toEqual({ tileCount: 6, cost: 6 * ROAD_COST_PER_TILE });
  });

  it('costs nothing when start and end are the same tile', () => {
    expect(estimateRoadCost(4, 4, 4, 4)).toEqual({ tileCount: 0, cost: 0 });
  });

  it('lets an already-paved tile through for free and charges water double', () => {
    // (0,0) → (2,0): three tiles — start already paved, then land, then bridge.
    const facts = [land({ hasRoad: true }), land(), land({ isBridge: true })];
    expect(estimateRoadCost(0, 0, 2, 0, facts)).toEqual({
      tileCount: 3,
      cost: ROAD_COST_PER_TILE + BRIDGE_COST_PER_TILE,
    });
  });

  it('ignores facts that do not describe this very path', () => {
    const tooFew = [land({ hasRoad: true })];
    expect(estimateRoadCost(0, 0, 2, 0, tooFew)).toEqual({ tileCount: 3, cost: 3 * ROAD_COST_PER_TILE });

    const tooMany = [land({ hasRoad: true }), land({ hasRoad: true }), land({ hasRoad: true }), land({ hasRoad: true })];
    expect(estimateRoadCost(0, 0, 2, 0, tooMany)).toEqual({ tileCount: 3, cost: 3 * ROAD_COST_PER_TILE });
  });
});

describe('roadSegmentCost — cost div SegmentCount, MapIsoHandler.pas:1100', () => {
  it('splits the total evenly', () => {
    expect(roadSegmentCost(10_000_000, 4)).toBe(2_500_000);
  });

  it('drops the remainder, as Pascal `div` does', () => {
    expect(roadSegmentCost(10_000_000, 3)).toBe(3_333_333);
  });

  it('is zero when there is no segment to carry it', () => {
    expect(roadSegmentCost(10_000_000, 0)).toBe(0);
    expect(roadSegmentCost(10_000_000, -1)).toBe(0);
  });
});
