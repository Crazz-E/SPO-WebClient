/**
 * H6 — crossing favorites with loaded buildings. The third bucket is the
 * point: a favorite in a never-loaded zone is UNKNOWN, not healthy.
 */

import { describe, it, expect } from '@jest/globals';
import { classifyFacilities } from './facility-status';
import type { FavoritesLinkItem, MapBuilding } from '@/shared/types';

let nextId = 1;
const fav = (id: string, name: string, x: number, y: number): FavoritesLinkItem => {
  const assignedId = nextId++;
  return { id: assignedId, name, x, y, path: String(assignedId), kind: 1 };
};
const bld = (x: number, y: number, alert: boolean): MapBuilding =>
  ({ visualClass: '100', tycoonId: 1, options: alert ? 1 : 0, x, y, level: 0, alert, attack: 0 } as unknown as MapBuilding);

describe('classifyFacilities', () => {
  it('splits losing / unknown / operating by the alert bit and load state', () => {
    const groups = classifyFacilities(
      [fav('1', 'Mill', 10, 10), fav('2', 'Farm', 20, 20), fav('3', 'Dome', 30, 30)],
      [bld(10, 10, true), bld(20, 20, false)],
    );
    expect(groups.losing.map((f) => f.name)).toEqual(['Mill']);
    expect(groups.operating.map((f) => f.name)).toEqual(['Farm']);
    expect(groups.unknown.map((f) => f.name)).toEqual(['Dome']);
  });

  it('never counts an unloaded favorite as operating', () => {
    const groups = classifyFacilities([fav('1', 'Ghost', 5, 5)], []);
    expect(groups.operating).toHaveLength(0);
    expect(groups.unknown).toHaveLength(1);
  });

  it('sorts each bucket by name', () => {
    const groups = classifyFacilities(
      [fav('1', 'Zeta', 1, 1), fav('2', 'Alpha', 2, 2), fav('3', 'Mid', 3, 3)],
      [bld(1, 1, true), bld(2, 2, true), bld(3, 3, true)],
    );
    expect(groups.losing.map((f) => f.name)).toEqual(['Alpha', 'Mid', 'Zeta']);
  });

  it('matches strictly by coordinates — a building elsewhere proves nothing', () => {
    const groups = classifyFacilities([fav('1', 'Mill', 10, 10)], [bld(10, 11, false)]);
    expect(groups.unknown).toHaveLength(1);
  });
});
