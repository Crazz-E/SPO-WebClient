/**
 * Tests for Tycoon Political Role Cache query logic.
 *
 * Tests the boolean parsing of Delphi cache values and the
 * response structure from queryTycoonPoliticalRole.
 */

import { describe, it, expect } from '@jest/globals';
import type { PoliticalRoleInfo } from '../../../shared/types';

// ============================================================================
// parseBooleanCacheValue — mirrors spo_session.ts private method
// ============================================================================

function parseBooleanCacheValue(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === '-1' || v === 'true';
}

// ============================================================================
// buildPoliticalRoleInfo — mirrors spo_session.ts queryTycoonPoliticalRole parsing
// ============================================================================

function buildPoliticalRoleInfo(tycoonName: string, values: string[]): PoliticalRoleInfo {
  return {
    tycoonName,
    isMayor: parseBooleanCacheValue(values[0]),
    town: values[1] || '',
    isCapitalMayor: parseBooleanCacheValue(values[2]),
    isPresident: parseBooleanCacheValue(values[3]),
    isMinister: parseBooleanCacheValue(values[4]),
    ministry: values[5] || '',
    queriedAt: Date.now(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('parseBooleanCacheValue', () => {
  it('should return true for "1"', () => {
    expect(parseBooleanCacheValue('1')).toBe(true);
  });

  it('should return true for "-1" (Delphi True)', () => {
    expect(parseBooleanCacheValue('-1')).toBe(true);
  });

  it('should return true for "true"', () => {
    expect(parseBooleanCacheValue('true')).toBe(true);
  });

  it('should return true for "True" (case-insensitive)', () => {
    expect(parseBooleanCacheValue('True')).toBe(true);
  });

  it('should return true for " 1 " (with whitespace)', () => {
    expect(parseBooleanCacheValue(' 1 ')).toBe(true);
  });

  it('should return false for "0"', () => {
    expect(parseBooleanCacheValue('0')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(parseBooleanCacheValue('')).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(parseBooleanCacheValue(undefined)).toBe(false);
  });

  it('should return false for "false"', () => {
    expect(parseBooleanCacheValue('false')).toBe(false);
  });

  it('should return false for arbitrary text', () => {
    expect(parseBooleanCacheValue('yes')).toBe(false);
    expect(parseBooleanCacheValue('no')).toBe(false);
    expect(parseBooleanCacheValue('2')).toBe(false);
  });
});

describe('buildPoliticalRoleInfo', () => {
  it('should parse president role from cache values', () => {
    // IsMayor, Town, IsCapitalMayor, IsPresident, IsMinister, Ministry
    const values = ['', '', '', '1', '', ''];
    const role = buildPoliticalRoleInfo('SPO_test3', values);

    expect(role.tycoonName).toBe('SPO_test3');
    expect(role.isPresident).toBe(true);
    expect(role.isMayor).toBe(false);
    expect(role.isMinister).toBe(false);
    expect(role.town).toBe('');
    expect(role.ministry).toBe('');
  });

  it('should parse mayor role with town name', () => {
    const values = ['1', 'Shamba', '1', '', '', ''];
    const role = buildPoliticalRoleInfo('MayorTycoon', values);

    expect(role.isMayor).toBe(true);
    expect(role.town).toBe('Shamba');
    expect(role.isCapitalMayor).toBe(true);
    expect(role.isPresident).toBe(false);
  });

  it('should parse minister role with ministry name', () => {
    const values = ['', '', '', '', '1', 'Defense'];
    const role = buildPoliticalRoleInfo('MinisterTycoon', values);

    expect(role.isMinister).toBe(true);
    expect(role.ministry).toBe('Defense');
    expect(role.isMayor).toBe(false);
    expect(role.isPresident).toBe(false);
  });

  it('should parse player with multiple roles (recursive StoreRoleInfo)', () => {
    // Delphi StoreRoleInfo is recursive — a player who is both mayor and president
    // will have all flags set in one cache response
    const values = ['1', 'Olympus', '', '1', '', ''];
    const role = buildPoliticalRoleInfo('PowerPlayer', values);

    expect(role.isMayor).toBe(true);
    expect(role.isPresident).toBe(true);
    expect(role.town).toBe('Olympus');
  });

  it('should parse regular player with no political role', () => {
    const values = ['', '', '', '', '', ''];
    const role = buildPoliticalRoleInfo('RegularPlayer', values);

    expect(role.isMayor).toBe(false);
    expect(role.isPresident).toBe(false);
    expect(role.isMinister).toBe(false);
    expect(role.town).toBe('');
    expect(role.ministry).toBe('');
  });

  it('should handle Delphi -1 as true', () => {
    const values = ['-1', 'Shamba', '-1', '', '', ''];
    const role = buildPoliticalRoleInfo('DelphiTycoon', values);

    expect(role.isMayor).toBe(true);
    expect(role.isCapitalMayor).toBe(true);
  });

  it('should include queriedAt timestamp', () => {
    const before = Date.now();
    const role = buildPoliticalRoleInfo('Test', ['', '', '', '', '', '']);
    const after = Date.now();

    expect(role.queriedAt).toBeGreaterThanOrEqual(before);
    expect(role.queriedAt).toBeLessThanOrEqual(after);
  });

  it('should handle short value arrays gracefully', () => {
    const values = ['1', 'Shamba'];
    const role = buildPoliticalRoleInfo('ShortArray', values);

    expect(role.isMayor).toBe(true);
    expect(role.town).toBe('Shamba');
    expect(role.isCapitalMayor).toBe(false);
    expect(role.isPresident).toBe(false);
    expect(role.isMinister).toBe(false);
    expect(role.ministry).toBe('');
  });
});

describe('SetPath cache path format', () => {
  it('should construct correct tycoon cache path', () => {
    const tycoonName = 'SPO_test3';
    const path = `Tycoons\\${tycoonName}.five\\`;
    expect(path).toBe('Tycoons\\SPO_test3.five\\');
  });

  it('should preserve backslashes in path', () => {
    const path = `Tycoons\\MyPlayer.five\\`;
    expect(path).toContain('\\');
    expect(path.startsWith('Tycoons\\')).toBe(true);
    expect(path.endsWith('.five\\')).toBe(true);
  });
});

describe('ROLE_PROPERTIES request format', () => {
  it('should list all 6 required cache properties', () => {
    const ROLE_PROPERTIES = [
      'IsMayor', 'Town', 'IsCapitalMayor',
      'IsPresident', 'IsMinister', 'Ministry'
    ];
    expect(ROLE_PROPERTIES).toHaveLength(6);
    expect(ROLE_PROPERTIES).toContain('IsMayor');
    expect(ROLE_PROPERTIES).toContain('IsPresident');
    expect(ROLE_PROPERTIES).toContain('IsMinister');
    expect(ROLE_PROPERTIES).toContain('Town');
    expect(ROLE_PROPERTIES).toContain('Ministry');
    expect(ROLE_PROPERTIES).toContain('IsCapitalMayor');
  });

  it('should build tab-delimited query string', () => {
    const ROLE_PROPERTIES = [
      'IsMayor', 'Town', 'IsCapitalMayor',
      'IsPresident', 'IsMinister', 'Ministry'
    ];
    const query = ROLE_PROPERTIES.join('\t') + '\t';
    expect(query).toBe('IsMayor\tTown\tIsCapitalMayor\tIsPresident\tIsMinister\tMinistry\t');
  });
});
