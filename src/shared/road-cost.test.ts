import { ROAD_COST_PER_TILE, estimateRoadCost } from './road-cost';
import { ROAD_COST_PER_TILE as GATEWAY_ROAD_COST_PER_TILE } from '../server/session/road-handler';

describe('road cost estimate', () => {
  it('uses the very amount the gateway charges per tile', () => {
    expect(ROAD_COST_PER_TILE).toBe(GATEWAY_ROAD_COST_PER_TILE);
  });

  it('a straight drag costs its length; a diagonal one its staircase (Manhattan) length', () => {
    expect(estimateRoadCost(10, 5, 14, 5)).toEqual({ tileCount: 4, cost: 4 * ROAD_COST_PER_TILE });
    expect(estimateRoadCost(3, 9, 3, 2)).toEqual({ tileCount: 7, cost: 7 * ROAD_COST_PER_TILE });
    expect(estimateRoadCost(0, 0, 3, 2)).toEqual({ tileCount: 5, cost: 5 * ROAD_COST_PER_TILE });
    expect(estimateRoadCost(4, 4, 4, 4)).toEqual({ tileCount: 0, cost: 0 });
  });
});
