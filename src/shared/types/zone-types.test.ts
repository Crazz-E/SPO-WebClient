/**
 * Tests for ZoneType enum and ZONE_TYPES constant.
 * Values must match Delphi Protocol.pas TZoneType constants (0-9).
 */

import { ZoneType, ZONE_TYPES } from './domain-types';

describe('ZoneType enum', () => {
  it('should match Delphi Protocol.pas TZoneType constants', () => {
    expect(ZoneType.NONE).toBe(0);
    expect(ZoneType.RESERVED).toBe(1);
    expect(ZoneType.RESIDENTIAL).toBe(2);
    expect(ZoneType.HI_RESIDENTIAL).toBe(3);
    expect(ZoneType.MID_RESIDENTIAL).toBe(4);
    expect(ZoneType.LO_RESIDENTIAL).toBe(5);
    expect(ZoneType.INDUSTRIAL).toBe(6);
    expect(ZoneType.COMMERCIAL).toBe(7);
    expect(ZoneType.CIVICS).toBe(8);
    expect(ZoneType.OFFICES).toBe(9);
  });

  it('should have 10 members', () => {
    // Numeric enums have both forward and reverse mappings
    const numericValues = Object.values(ZoneType).filter(v => typeof v === 'number');
    expect(numericValues).toHaveLength(10);
  });
});

describe('ZONE_TYPES array', () => {
  it('should have 10 entries', () => {
    expect(ZONE_TYPES).toHaveLength(10);
  });

  it('each entry should have required fields', () => {
    for (const zone of ZONE_TYPES) {
      expect(typeof zone.id).toBe('number');
      expect(typeof zone.label).toBe('string');
      expect(zone.label.length).toBeGreaterThan(0);
      expect(typeof zone.color).toBe('string');
      expect(zone.color).toMatch(/^#[0-9a-fA-F]{3,6}$/);
      expect(typeof zone.overlayColor).toBe('string');
      expect(zone.overlayColor).toMatch(/^rgba\(/);
    }
  });

  it('first entry should be NONE (Erase)', () => {
    expect(ZONE_TYPES[0].id).toBe(ZoneType.NONE);
    expect(ZONE_TYPES[0].label).toBe('Erase');
  });

  it('should have unique IDs', () => {
    const ids = ZONE_TYPES.map(z => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('IDs should match ZoneType enum values', () => {
    const enumValues = Object.values(ZoneType).filter(v => typeof v === 'number') as number[];
    const zoneIds = ZONE_TYPES.map(z => z.id);
    expect(zoneIds.sort()).toEqual(enumValues.sort());
  });
});
