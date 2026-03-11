import { parseFavoritesResponse, deriveResidenceClass, parseResearchItems } from './session-utils';

// Protocol separators matching Delphi FavProtocol.pas
const PROP = '\x01';  // field separator
const ITEM = '\x02';  // item separator

/** Helper: build a single favorites wire entry */
function favEntry(id: number, kind: number, name: string, info: string, subFolders = 0): string {
  return `${id}${PROP}${kind}${PROP}${name}${PROP}${info}${PROP}${subFolders}${PROP}`;
}

// =============================================================================
// parseFavoritesResponse
// =============================================================================
describe('parseFavoritesResponse', () => {
  describe('happy path', () => {
    it('parses a single link item', () => {
      const raw = favEntry(42, 1, 'My Factory', 'My Factory,100,200,1');
      const result = parseFavoritesResponse(raw);
      expect(result).toEqual([{ id: 42, name: 'My Factory', x: 100, y: 200 }]);
    });

    it('parses multiple link items separated by \\x02', () => {
      const raw = [
        favEntry(1, 1, 'Fac A', 'Fac A,10,20,0'),
        favEntry(2, 1, 'Fac B', 'Fac B,30,40,1'),
      ].join(ITEM);
      const result = parseFavoritesResponse(raw);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 1, name: 'Fac A', x: 10, y: 20 });
      expect(result[1]).toEqual({ id: 2, name: 'Fac B', x: 30, y: 40 });
    });

    it('handles display name with commas in info field', () => {
      // info = "Big, Bad, Factory,500,600,0" — last 3 commas delimit x,y,select
      const raw = favEntry(7, 1, 'Complex Name', 'Big, Bad, Factory,500,600,0');
      const result = parseFavoritesResponse(raw);
      expect(result).toEqual([{ id: 7, name: 'Complex Name', x: 500, y: 600 }]);
    });
  });

  describe('edge cases — empty / missing input', () => {
    it('returns empty array for empty string', () => {
      expect(parseFavoritesResponse('')).toEqual([]);
    });

    it('returns empty array for undefined-ish falsy value', () => {
      // The function checks `if (!raw)` so null-like values should work
      expect(parseFavoritesResponse(undefined as unknown as string)).toEqual([]);
    });

    it('returns empty array when all entries are empty after split', () => {
      expect(parseFavoritesResponse(ITEM + ITEM)).toEqual([]);
    });
  });

  describe('filtering', () => {
    it('skips folder items (kind != 1)', () => {
      const raw = [
        favEntry(1, 0, 'Folder', ''),       // kind=0 folder
        favEntry(2, 1, 'Link', 'Link,5,6,0'), // kind=1 link
        favEntry(3, 2, 'Other', ''),          // kind=2 unknown
      ].join(ITEM);
      const result = parseFavoritesResponse(raw);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
    });

    it('skips entries with fewer than 4 fields', () => {
      const shortEntry = `99${PROP}1${PROP}Name`;  // only 3 fields
      const raw = shortEntry + ITEM + favEntry(10, 1, 'Valid', 'V,1,2,0');
      const result = parseFavoritesResponse(raw);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(10);
    });

    it('skips entries where info has fewer than 3 commas', () => {
      // info = "nocoords" — no commas at all
      const raw = favEntry(1, 1, 'Bad', 'nocoords');
      expect(parseFavoritesResponse(raw)).toEqual([]);
    });

    it('skips entries where info has only 1 comma', () => {
      const raw = favEntry(1, 1, 'Bad', 'name,value');
      expect(parseFavoritesResponse(raw)).toEqual([]);
    });

    it('skips entries where info has only 2 commas', () => {
      const raw = favEntry(1, 1, 'Bad', 'name,10,20');
      expect(parseFavoritesResponse(raw)).toEqual([]);
    });
  });

  describe('NaN handling', () => {
    it('skips entry when id is NaN', () => {
      const raw = `abc${PROP}1${PROP}Name${PROP}N,1,2,0${PROP}0${PROP}`;
      expect(parseFavoritesResponse(raw)).toEqual([]);
    });

    it('skips entry when x is NaN', () => {
      const raw = favEntry(1, 1, 'Name', 'N,abc,2,0');
      expect(parseFavoritesResponse(raw)).toEqual([]);
    });

    it('skips entry when y is NaN', () => {
      const raw = favEntry(1, 1, 'Name', 'N,1,abc,0');
      expect(parseFavoritesResponse(raw)).toEqual([]);
    });
  });

  describe('negative and zero coordinates', () => {
    it('accepts zero coordinates', () => {
      const raw = favEntry(1, 1, 'Origin', 'Origin,0,0,0');
      const result = parseFavoritesResponse(raw);
      expect(result).toEqual([{ id: 1, name: 'Origin', x: 0, y: 0 }]);
    });

    it('accepts negative coordinates', () => {
      const raw = favEntry(5, 1, 'Neg', 'Neg,-10,-20,0');
      const result = parseFavoritesResponse(raw);
      expect(result).toEqual([{ id: 5, name: 'Neg', x: -10, y: -20 }]);
    });
  });

  it('handles trailing item separator', () => {
    const raw = favEntry(1, 1, 'A', 'A,1,2,0') + ITEM;
    const result = parseFavoritesResponse(raw);
    expect(result).toHaveLength(1);
  });
});

// =============================================================================
// deriveResidenceClass
// =============================================================================
describe('deriveResidenceClass', () => {
  describe('Signal 1: zone image filename (highest priority)', () => {
    it('returns "high" for hires in filename', () => {
      expect(deriveResidenceClass('zone-hires.gif', '', '')).toBe('high');
    });

    it('returns "middle" for midres in filename', () => {
      expect(deriveResidenceClass('zone-midres.gif', '', '')).toBe('middle');
    });

    it('returns "low" for lores in filename', () => {
      expect(deriveResidenceClass('zone-lores.gif', '', '')).toBe('low');
    });

    it('is case-insensitive', () => {
      expect(deriveResidenceClass('Zone-HiRes.GIF', '', '')).toBe('high');
      expect(deriveResidenceClass('ZONE-MIDRES.PNG', '', '')).toBe('middle');
      expect(deriveResidenceClass('ZONE-LORES.PNG', '', '')).toBe('low');
    });

    it('matches substring (e.g., path containing hires)', () => {
      expect(deriveResidenceClass('/images/zones/zone-hires-v2.gif', '', '')).toBe('high');
    });
  });

  describe('Signal 2: zone title text (second priority)', () => {
    it('returns "high" for "high res" in title', () => {
      expect(deriveResidenceClass('other.gif', 'High Res Zone', '')).toBe('high');
    });

    it('returns "high" for "hi res" in title', () => {
      expect(deriveResidenceClass('other.gif', 'Hi Res Zone', '')).toBe('high');
    });

    it('returns "high" for "hi-res" in title', () => {
      expect(deriveResidenceClass('other.gif', 'Hi-Res Zone', '')).toBe('high');
    });

    it('returns "middle" for "mid res" in title', () => {
      expect(deriveResidenceClass('other.gif', 'Mid Res Zone', '')).toBe('middle');
    });

    it('returns "middle" for "middle res" in title', () => {
      expect(deriveResidenceClass('other.gif', 'Middle Res Zone', '')).toBe('middle');
    });

    it('returns "low" for "low res" in title', () => {
      expect(deriveResidenceClass('other.gif', 'Low Res Zone', '')).toBe('low');
    });

    it('returns "low" for "lo res" in title', () => {
      expect(deriveResidenceClass('other.gif', 'Lo Res Zone', '')).toBe('low');
    });

    it('returns "low" for "lo-res" in title', () => {
      expect(deriveResidenceClass('other.gif', 'Lo-Res Zone', '')).toBe('low');
    });

    it('is case-insensitive', () => {
      expect(deriveResidenceClass('other.gif', 'HIGH RES ZONE', '')).toBe('high');
    });
  });

  describe('Signal 3: color-based zone descriptions in title', () => {
    it('returns "high" for "bright green"', () => {
      expect(deriveResidenceClass('other.gif', 'Bright Green Residential', '')).toBe('high');
    });

    it('returns "high" for "light green"', () => {
      expect(deriveResidenceClass('other.gif', 'Light Green Residential', '')).toBe('high');
    });

    it('returns "low" for "dark green"', () => {
      expect(deriveResidenceClass('other.gif', 'Dark Green Residential', '')).toBe('low');
    });

    it('returns "middle" for plain "green" (word boundary)', () => {
      expect(deriveResidenceClass('other.gif', 'Green Zone', '')).toBe('middle');
    });

    it('does NOT match "green" as substring of another word', () => {
      // "greenish" should not match \bgreen\b
      expect(deriveResidenceClass('other.gif', 'Greenish Zone', '')).toBeUndefined();
    });
  });

  describe('Signal 4: facility class name (lowest priority)', () => {
    it('returns "high" for hires in facilityClass', () => {
      expect(deriveResidenceClass('other.gif', 'No Signal', 'ResHiRes_A')).toBe('high');
    });

    it('returns "middle" for midres in facilityClass', () => {
      expect(deriveResidenceClass('other.gif', 'No Signal', 'ResMidRes_B')).toBe('middle');
    });

    it('returns "low" for lores in facilityClass', () => {
      expect(deriveResidenceClass('other.gif', 'No Signal', 'ResLoRes_C')).toBe('low');
    });

    it('is case-insensitive', () => {
      expect(deriveResidenceClass('other.gif', 'No Signal', 'RESHIRES')).toBe('high');
    });
  });

  describe('priority ordering', () => {
    it('Signal 1 overrides Signal 2', () => {
      // filename says high, title says low — filename wins
      expect(deriveResidenceClass('zone-hires.gif', 'Low Res Zone', 'LoRes')).toBe('high');
    });

    it('Signal 2 overrides Signal 3', () => {
      // title says "hi res" (signal 2) but also has "dark green" later — signal 2 wins
      expect(deriveResidenceClass('other.gif', 'Hi Res Dark Green', '')).toBe('high');
    });

    it('Signal 3 overrides Signal 4', () => {
      // title has "bright green" (signal 3), facilityClass has lores (signal 4)
      expect(deriveResidenceClass('other.gif', 'Bright Green', 'LoRes_X')).toBe('high');
    });
  });

  describe('no match', () => {
    it('returns undefined when no signals match', () => {
      expect(deriveResidenceClass('other.gif', 'Commercial Zone', 'OfficeTower')).toBeUndefined();
    });

    it('returns undefined for empty strings', () => {
      expect(deriveResidenceClass('', '', '')).toBeUndefined();
    });
  });
});

// =============================================================================
// parseResearchItems
// =============================================================================
describe('parseResearchItems', () => {
  /** Helper: build a values map from partial key-value pairs */
  function makeValues(entries: Record<string, string>): Map<string, string> {
    return new Map(Object.entries(entries));
  }

  describe('happy path', () => {
    it('parses items with "avl" prefix', () => {
      const values = makeValues({
        'avl0RsId0': 'GreenTech.L1',
        'avl0RsName0': 'Green Tech Level 1',
        'avl0RsDyn0': 'no',
        'avl0RsParent0': 'GreenTech',
      });
      const result = parseResearchItems('avl', 0, 1, values, false);
      expect(result).toEqual([{
        inventionId: 'GreenTech.L1',
        name: 'Green Tech Level 1',
        enabled: undefined,
        cost: undefined,
        parent: 'GreenTech',
        volatile: undefined,
      }]);
    });

    it('parses multiple items', () => {
      const values = makeValues({
        'avl1RsId0': 'A',
        'avl1RsName0': 'Alpha',
        'avl1RsDyn0': 'no',
        'avl1RsId1': 'B',
        'avl1RsName1': 'Beta',
        'avl1RsDyn1': 'yes',
      });
      const result = parseResearchItems('avl', 1, 2, values, false);
      expect(result).toHaveLength(2);
      expect(result[0].inventionId).toBe('A');
      expect(result[1].inventionId).toBe('B');
      expect(result[1].volatile).toBe(true);
    });

    it('parses "has" prefix with cost field', () => {
      const values = makeValues({
        'has2RsId0': 'Inv.X',
        'has2RsName0': 'Invention X',
        'has2RsDyn0': 'no',
        'has2RsCost0': '$1,500,000',
      });
      const result = parseResearchItems('has', 2, 1, values, false);
      expect(result).toHaveLength(1);
      expect(result[0].cost).toBe('$1,500,000');
    });

    it('does not include cost for non-"has" prefix', () => {
      const values = makeValues({
        'avl0RsId0': 'Inv.Y',
        'avl0RsName0': 'Inv Y',
        'avl0RsDyn0': 'no',
        // Even if a has-style cost key exists, it should not be read
        'has0RsCost0': '$999',
      });
      const result = parseResearchItems('avl', 0, 1, values, false);
      expect(result[0].cost).toBeUndefined();
    });
  });

  describe('includeEnabled flag', () => {
    it('includes enabled=true when enabledVal is "1"', () => {
      const values = makeValues({
        'avl0RsId0': 'X',
        'avl0RsDyn0': 'no',
        'avl0RsEnabled0': '1',
      });
      const result = parseResearchItems('avl', 0, 1, values, true);
      expect(result[0].enabled).toBe(true);
    });

    it('includes enabled=true when enabledVal is "true"', () => {
      const values = makeValues({
        'avl0RsId0': 'X',
        'avl0RsDyn0': 'no',
        'avl0RsEnabled0': 'true',
      });
      const result = parseResearchItems('avl', 0, 1, values, true);
      expect(result[0].enabled).toBe(true);
    });

    it('includes enabled=true when enabledVal is "-1"', () => {
      const values = makeValues({
        'avl0RsId0': 'X',
        'avl0RsDyn0': 'no',
        'avl0RsEnabled0': '-1',
      });
      const result = parseResearchItems('avl', 0, 1, values, true);
      expect(result[0].enabled).toBe(true);
    });

    it('includes enabled=false when enabledVal is "0"', () => {
      const values = makeValues({
        'avl0RsId0': 'X',
        'avl0RsDyn0': 'no',
        'avl0RsEnabled0': '0',
      });
      const result = parseResearchItems('avl', 0, 1, values, true);
      expect(result[0].enabled).toBe(false);
    });

    it('includes enabled=false when enabledVal is missing', () => {
      const values = makeValues({
        'avl0RsId0': 'X',
        'avl0RsDyn0': 'no',
      });
      const result = parseResearchItems('avl', 0, 1, values, true);
      expect(result[0].enabled).toBe(false);
    });

    it('does not include enabled when includeEnabled is false', () => {
      const values = makeValues({
        'avl0RsId0': 'X',
        'avl0RsDyn0': 'no',
        'avl0RsEnabled0': '1',
      });
      const result = parseResearchItems('avl', 0, 1, values, false);
      expect(result[0].enabled).toBeUndefined();
    });
  });

  describe('fallback and default behaviors', () => {
    it('falls back to id for name when RsName is missing', () => {
      const values = makeValues({
        'avl0RsId0': 'FallbackId',
        'avl0RsDyn0': 'no',
      });
      const result = parseResearchItems('avl', 0, 1, values, false);
      expect(result[0].name).toBe('FallbackId');
    });

    it('sets parent to undefined when RsParent is missing', () => {
      const values = makeValues({
        'avl0RsId0': 'X',
        'avl0RsDyn0': 'no',
      });
      const result = parseResearchItems('avl', 0, 1, values, false);
      expect(result[0].parent).toBeUndefined();
    });

    it('sets volatile to true when RsDyn is "yes"', () => {
      const values = makeValues({
        'avl0RsId0': 'X',
        'avl0RsDyn0': 'yes',
      });
      const result = parseResearchItems('avl', 0, 1, values, false);
      expect(result[0].volatile).toBe(true);
    });

    it('sets volatile to undefined (falsy) when RsDyn is not "yes"', () => {
      const values = makeValues({
        'avl0RsId0': 'X',
        'avl0RsDyn0': 'no',
      });
      const result = parseResearchItems('avl', 0, 1, values, false);
      expect(result[0].volatile).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('returns empty array when count is 0', () => {
      const result = parseResearchItems('avl', 0, 0, new Map(), false);
      expect(result).toEqual([]);
    });

    it('skips items where RsId is missing (empty string)', () => {
      const values = makeValues({
        // index 0: no id
        'avl0RsName0': 'Ghost',
        // index 1: has id
        'avl0RsId1': 'Real',
        'avl0RsDyn1': 'no',
      });
      const result = parseResearchItems('avl', 0, 2, values, false);
      expect(result).toHaveLength(1);
      expect(result[0].inventionId).toBe('Real');
    });

    it('handles empty values map with non-zero count', () => {
      const result = parseResearchItems('avl', 0, 5, new Map(), false);
      expect(result).toEqual([]);
    });

    it('works with different category indices', () => {
      const values = makeValues({
        'dev3RsId0': 'InProgress',
        'dev3RsName0': 'Developing Item',
        'dev3RsDyn0': 'no',
      });
      const result = parseResearchItems('dev', 3, 1, values, false);
      expect(result).toEqual([{
        inventionId: 'InProgress',
        name: 'Developing Item',
        enabled: undefined,
        cost: undefined,
        parent: undefined,
        volatile: undefined,
      }]);
    });

    it('cost is undefined for "has" prefix when RsCost key is missing', () => {
      const values = makeValues({
        'has0RsId0': 'NoCost',
        'has0RsDyn0': 'no',
      });
      const result = parseResearchItems('has', 0, 1, values, false);
      expect(result[0].cost).toBeUndefined();
    });
  });
});
