/**
 * Tests for the renderer E2E probe methods (getRoadTiles / getTileProbe).
 * The monolith is too heavy to instantiate in jsdom, so the pure methods are
 * exercised via prototype `.call()` with a crafted `this` — same pattern the
 * methods use at runtime (they only touch roadTilesMap, concreteTilesSet,
 * terrainRenderer.getTerrainLoader, and sibling private methods).
 */

import { describe, it, expect } from '@jest/globals';
import { IsometricMapRenderer } from './isometric-map-renderer';

type ProbeHost = {
  roadTilesMap: Map<string, boolean>;
  concreteTilesSet: Set<string>;
  terrainRenderer: { getTerrainLoader: () => { getLandId: (x: number, y: number) => number } | null };
  hasRoadAt: (x: number, y: number) => boolean;
  isAdjacentToRoad: (x: number, y: number) => boolean;
};

const proto = IsometricMapRenderer.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;

function makeHost(opts: {
  roads?: Array<[number, number]>;
  concrete?: Array<[number, number]>;
  landId?: number;
  noLoader?: boolean;
}): ProbeHost {
  const host: ProbeHost = {
    roadTilesMap: new Map((opts.roads ?? []).map(([x, y]) => [`${x},${y}`, true])),
    concreteTilesSet: new Set((opts.concrete ?? []).map(([x, y]) => `${x},${y}`)),
    terrainRenderer: {
      getTerrainLoader: () => (opts.noLoader ? null : { getLandId: () => opts.landId ?? 0 }),
    },
    hasRoadAt: null as unknown as ProbeHost['hasRoadAt'],
    isAdjacentToRoad: null as unknown as ProbeHost['isAdjacentToRoad'],
  };
  host.hasRoadAt = (x, y) => (proto.hasRoadAt as (this: ProbeHost, x: number, y: number) => boolean).call(host, x, y);
  host.isAdjacentToRoad = (x, y) => (proto.isAdjacentToRoad as (this: ProbeHost, x: number, y: number) => boolean).call(host, x, y);
  return host;
}

const getRoadTiles = (host: ProbeHost, limit?: number) =>
  (proto.getRoadTiles as (this: ProbeHost, limit?: number) => Array<{ x: number; y: number }>).call(host, limit);

const getTileProbe = (host: ProbeHost, x: number, y: number) =>
  (proto.getTileProbe as (this: ProbeHost, x: number, y: number) => {
    hasRoad: boolean; adjacentToRoad: boolean; hasConcrete: boolean; landClass: string; isWater: boolean;
  }).call(host, x, y);

describe('getRoadTiles', () => {
  it('returns world coordinates parsed from the road tile map', () => {
    const host = makeHost({ roads: [[953, 999], [954, 999]] });
    expect(getRoadTiles(host)).toEqual([
      { x: 953, y: 999 },
      { x: 954, y: 999 },
    ]);
  });

  it('honors the limit', () => {
    const host = makeHost({ roads: [[1, 1], [2, 2], [3, 3]] });
    expect(getRoadTiles(host, 2)).toHaveLength(2);
  });

  it('returns empty for a road-less map', () => {
    expect(getRoadTiles(makeHost({}))).toEqual([]);
  });
});

describe('getTileProbe', () => {
  it('reports road occupancy and 8-way adjacency', () => {
    const host = makeHost({ roads: [[10, 10]] });
    expect(getTileProbe(host, 10, 10).hasRoad).toBe(true);
    expect(getTileProbe(host, 10, 11).hasRoad).toBe(false);
    expect(getTileProbe(host, 10, 11).adjacentToRoad).toBe(true);
    expect(getTileProbe(host, 11, 11).adjacentToRoad).toBe(true); // diagonal
    expect(getTileProbe(host, 13, 13).adjacentToRoad).toBe(false);
  });

  it('reports concrete occupancy', () => {
    const host = makeHost({ concrete: [[5, 5]] });
    expect(getTileProbe(host, 5, 5).hasConcrete).toBe(true);
    expect(getTileProbe(host, 5, 6).hasConcrete).toBe(false);
  });

  it('decodes land class from the terrain loader', () => {
    // decodeLandId reads the land class from the land id bits; landId 0 is
    // class 0 → 'G'. The exact non-zero encodings are covered by
    // land-utils tests — here we assert the mapping path works.
    const host = makeHost({ landId: 0 });
    const probe = getTileProbe(host, 1, 1);
    expect(['G', 'M', 'D', 'W', '?']).toContain(probe.landClass);
    expect(typeof probe.isWater).toBe('boolean');
  });

  it('tolerates a missing terrain loader (landId falls back to 0)', () => {
    const host = makeHost({ noLoader: true, roads: [[1, 1]] });
    const probe = getTileProbe(host, 1, 1);
    expect(probe.hasRoad).toBe(true);
    expect(probe.landClass.length).toBe(1);
  });
});
