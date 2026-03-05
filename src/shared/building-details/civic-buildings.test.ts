import { isCivicBuilding } from './civic-buildings';

describe('isCivicBuilding', () => {
  it('returns true for Capitol visual class', () => {
    expect(isCivicBuilding('PGICapitolA')).toBe(true);
  });

  it('returns true for TownHall visual classes', () => {
    expect(isCivicBuilding('PGITownHallA')).toBe(true);
    expect(isCivicBuilding('PGITownHallB')).toBe(true);
    expect(isCivicBuilding('PGITownHallC')).toBe(true);
    expect(isCivicBuilding('PGITownHallD')).toBe(true);
  });

  it('returns false for non-civic buildings', () => {
    expect(isCivicBuilding('PGIWarehouseA')).toBe(false);
    expect(isCivicBuilding('PGIFactoryA')).toBe(false);
    expect(isCivicBuilding('PGIResidentialA')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isCivicBuilding('')).toBe(false);
  });

  it('returns false for default visual class "0"', () => {
    expect(isCivicBuilding('0')).toBe(false);
  });
});
