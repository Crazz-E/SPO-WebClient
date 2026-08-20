/**
 * Tests for research-dat-parser.ts
 *
 * Covers:
 * - DelphiString binary format reading
 * - Full .dat file parsing with header, body, footer
 * - Name|Category splitting
 * - Requires extraction from description
 * - Properties line splitting
 * - Index building (byId, byCategory, tabToCategories)
 * - Edge cases (empty strings, no footer, no requires)
 */

import { describe, it, expect } from '@jest/globals';
import { parseResearchDat, buildInventionIndex, type DatParseResult } from './research-dat-parser';

// ---------------------------------------------------------------------------
// Helpers: construct a Delphi-format binary buffer
// ---------------------------------------------------------------------------

function delphiString(s: string): Buffer {
  const strBuf = Buffer.from(s, 'latin1');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(strBuf.length, 0);
  return Buffer.concat([lenBuf, strBuf]);
}

function uint32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function byte(n: number): Buffer {
  return Buffer.from([n]);
}

/** Build a minimal .dat buffer with the given inventions and optional tab footer. */
function buildDat(
  inventions: Array<{
    id: string;
    nameCategory: string;
    description: string;
    parent: string;
    cached: boolean;
    properties: string;
  }>,
  tabNames?: string[],
): Buffer {
  const parts: Buffer[] = [uint32(inventions.length)];

  for (const inv of inventions) {
    parts.push(
      delphiString(inv.id),
      delphiString(inv.nameCategory),
      delphiString(inv.description),
      delphiString(inv.parent),
      byte(inv.cached ? 1 : 0),
      delphiString(inv.properties),
    );
  }

  if (tabNames) {
    parts.push(delphiString(tabNames.join('\r\n')));
  }

  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// parseResearchDat
// ---------------------------------------------------------------------------

describe('parseResearchDat', () => {
  it('should parse a single invention', () => {
    const buf = buildDat([{
      id: 'GreenFarming',
      nameCategory: 'Green Farming|Industry',
      description: 'Eco-friendly farming methods.',
      parent: 'Farms',
      cached: true,
      properties: 'Price: $10,000,000\r\nLevel: Apprentice',
    }], ['INDUSTRY']);

    const result = parseResearchDat(buf);

    expect(result.inventionCount).toBe(1);
    expect(result.inventions).toHaveLength(1);
    expect(result.categoryTabs).toEqual(['INDUSTRY']);

    const inv = result.inventions[0];
    expect(inv.id).toBe('GreenFarming');
    expect(inv.name).toBe('Green Farming');
    expect(inv.category).toBe('Industry');
    expect(inv.description).toBe('Eco-friendly farming methods.');
    expect(inv.parent).toBe('Farms');
    expect(inv.cached).toBe(true);
    expect(inv.properties).toEqual(['Price: $10,000,000', 'Level: Apprentice']);
    expect(inv.requires).toEqual([]);
  });

  it('should extract requires from description', () => {
    const buf = buildDat([{
      id: 'AdvFarm',
      nameCategory: 'Advanced Farming|Industry',
      description: 'Better tools.\r\nRequires: Green Farming, Basic Tools.',
      parent: 'Farms',
      cached: true,
      properties: 'Price: $50,000,000',
    }]);

    const result = parseResearchDat(buf);
    const inv = result.inventions[0];

    expect(inv.description).toBe('Better tools.');
    expect(inv.requires).toEqual(['Green Farming', 'Basic Tools']);
  });

  it('should handle invention with no pipe in nameCategory', () => {
    const buf = buildDat([{
      id: 'Mystery',
      nameCategory: 'Mystery Invention',
      description: 'No category.',
      parent: '',
      cached: false,
      properties: '',
    }]);

    const result = parseResearchDat(buf);
    const inv = result.inventions[0];

    expect(inv.name).toBe('Mystery Invention');
    expect(inv.category).toBe('');
    expect(inv.cached).toBe(false);
    expect(inv.properties).toEqual([]);
  });

  it('should parse multiple inventions', () => {
    const buf = buildDat([
      { id: 'A', nameCategory: 'Alpha|General', description: 'a', parent: 'Root', cached: true, properties: '' },
      { id: 'B', nameCategory: 'Beta|Commerce', description: 'b', parent: 'Bars', cached: true, properties: '' },
      { id: 'C', nameCategory: 'Gamma|Industry', description: 'c', parent: 'Oil', cached: true, properties: '' },
    ], ['GENERAL', 'COMMERCE', 'INDUSTRY']);

    const result = parseResearchDat(buf);

    expect(result.inventionCount).toBe(3);
    expect(result.inventions).toHaveLength(3);
    expect(result.inventions.map(i => i.id)).toEqual(['A', 'B', 'C']);
    expect(result.categoryTabs).toEqual(['GENERAL', 'COMMERCE', 'INDUSTRY']);
  });

  it('should handle .dat file with no footer', () => {
    const buf = buildDat([
      { id: 'Solo', nameCategory: 'Solo|General', description: '', parent: '', cached: true, properties: '' },
    ]);
    // No tabNames argument → no footer

    const result = parseResearchDat(buf);

    expect(result.inventionCount).toBe(1);
    expect(result.categoryTabs).toEqual([]);
  });

  it('should handle empty properties and description', () => {
    const buf = buildDat([{
      id: 'Empty',
      nameCategory: 'Empty|Civics',
      description: '',
      parent: 'General',
      cached: true,
      properties: '',
    }]);

    const result = parseResearchDat(buf);
    const inv = result.inventions[0];

    expect(inv.description).toBe('');
    expect(inv.properties).toEqual([]);
    expect(inv.requires).toEqual([]);
  });

  it('should throw on invalid buffer (too short)', () => {
    const buf = Buffer.alloc(2); // Too short for even the count uint32
    expect(() => parseResearchDat(buf)).toThrow('Unexpected EOF');
  });

  it('should throw on insane invention count', () => {
    const buf = uint32(99999);
    expect(() => parseResearchDat(buf)).toThrow('exceeds sanity limit');
  });
});

// ---------------------------------------------------------------------------
// buildInventionIndex
// ---------------------------------------------------------------------------

describe('buildInventionIndex', () => {
  function makeParsed(): DatParseResult {
    return parseResearchDat(buildDat([
      { id: 'Farm1', nameCategory: 'Basic Farming|Industry', description: 'd', parent: 'Farms', cached: true, properties: 'Price: $1' },
      { id: 'Farm2', nameCategory: 'Advanced Farming|Industry', description: 'd', parent: 'Farms', cached: true, properties: 'Price: $2' },
      { id: 'Oil1', nameCategory: 'Oil Production|Industry', description: 'd', parent: 'Oil', cached: true, properties: '' },
      { id: 'Bar1', nameCategory: 'Happy Hour|Commerce', description: 'd', parent: 'Bars', cached: true, properties: '' },
      { id: 'Dist1', nameCategory: 'Distributed Direction|General', description: 'd', parent: 'General', cached: true, properties: '' },
      { id: 'Pub1', nameCategory: 'Public Facilities|Civics', description: 'd', parent: 'General', cached: true, properties: '' },
      { id: 'Min1', nameCategory: 'Ministry Admin|Ministry Headquarters', description: 'd', parent: 'General', cached: true, properties: '' },
    ], ['GENERAL', 'COMMERCE', 'REAL ESTATE', 'INDUSTRY', 'CIVICS']));
  }

  it('should build byId lookup', () => {
    const idx = buildInventionIndex(makeParsed());

    expect(idx.byId.size).toBe(7);
    expect(idx.byId.get('Farm1')?.name).toBe('Basic Farming');
    expect(idx.byId.get('Bar1')?.name).toBe('Happy Hour');
    expect(idx.byId.get('nonexistent')).toBeUndefined();
  });

  it('should group byCategory', () => {
    const idx = buildInventionIndex(makeParsed());

    expect(idx.byCategory.get('Industry')).toHaveLength(3);
    expect(idx.byCategory.get('Commerce')).toHaveLength(1);
    expect(idx.byCategory.get('General')).toHaveLength(1);
    expect(idx.byCategory.get('Civics')).toHaveLength(1);
    expect(idx.byCategory.get('Ministry Headquarters')).toHaveLength(1);
  });

  it('should group byCategoryAndParent', () => {
    const idx = buildInventionIndex(makeParsed());

    const industryParents = idx.byCategoryAndParent.get('Industry');
    expect(industryParents).toBeDefined();
    expect(industryParents!.get('Farms')).toHaveLength(2);
    expect(industryParents!.get('Oil')).toHaveLength(1);
  });

  it('should map tabs to categories', () => {
    const idx = buildInventionIndex(makeParsed());

    // Tab 0 = GENERAL → ["General"]
    expect(idx.tabToCategories.get(0)).toEqual(['General']);
    // Tab 1 = COMMERCE → ["Commerce"]
    expect(idx.tabToCategories.get(1)).toEqual(['Commerce']);
    // Tab 2 = REAL ESTATE → no matching category
    expect(idx.tabToCategories.get(2)).toEqual([]);
    // Tab 3 = INDUSTRY → ["Industry"]
    expect(idx.tabToCategories.get(3)).toEqual(['Industry']);
    // Tab 4 = CIVICS → ["Civics"] + unmatched "Ministry Headquarters"
    expect(idx.tabToCategories.get(4)).toContain('Civics');
    expect(idx.tabToCategories.get(4)).toContain('Ministry Headquarters');
  });

  it('should preserve categoryTabs from parse result', () => {
    const idx = buildInventionIndex(makeParsed());
    expect(idx.categoryTabs).toEqual(['GENERAL', 'COMMERCE', 'REAL ESTATE', 'INDUSTRY', 'CIVICS']);
  });
});

// ---------------------------------------------------------------------------
// Integration: real .dat file (if available)
// ---------------------------------------------------------------------------

describe('parseResearchDat with real file', () => {
  let realBuffer: Buffer | null = null;

  beforeAll(() => {
    try {

      const fs = require('fs');
      const path = require('path');
      const datPath = path.resolve(__dirname, '../../cache/Inventions/research.0.dat');
      realBuffer = fs.readFileSync(datPath);
    } catch {
      // File not available in CI — skip
    }
  });

  it('should parse the real research.0.dat if available', () => {
    if (!realBuffer) return;

    const result = parseResearchDat(realBuffer);

    expect(result.inventionCount).toBe(879);
    expect(result.inventions).toHaveLength(879);
    expect(result.categoryTabs).toEqual(['GENERAL', 'COMMERCE', 'REAL ESTATE', 'INDUSTRY', 'CIVICS']);

    // Spot-check first invention
    const first = result.inventions[0];
    expect(first.id).toBe('24HoursProduction');
    expect(first.name).toBe('24 Hour Production');
    expect(first.category).toBe('Industry');
    expect(first.parent).toBe('Oil');
    expect(first.properties.length).toBeGreaterThan(0);
  });

  it('should build a valid index from real data', () => {
    if (!realBuffer) return;

    const result = parseResearchDat(realBuffer);
    const idx = buildInventionIndex(result);

    // 879 total but 8 "Ministry Administration" entries share empty-string ID
    // → 872 unique IDs in the Map (last-write-wins for empty string key)
    expect(idx.byId.size).toBe(872);
    expect(idx.byCategory.get('Industry')?.length).toBe(503);
    expect(idx.byCategory.get('Commerce')?.length).toBe(243);
    expect(idx.byCategory.get('Real Estate')?.length).toBe(67);
    expect(idx.categoryTabs).toHaveLength(5);

    // Tab mapping covers all inventions (879 including duplicates)
    let totalMapped = 0;
    for (const [, categories] of idx.tabToCategories) {
      for (const cat of categories) {
        totalMapped += idx.byCategory.get(cat)?.length ?? 0;
      }
    }
    expect(totalMapped).toBe(879);
  });
});
