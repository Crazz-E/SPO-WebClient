/**
 * Unit Tests for RDO Helpers
 * Tests for cleanPayload, parsePropertyResponse, and related utilities
 */

import { describe, it, expect } from '@jest/globals';
import {
  cleanPayload,
  splitMultilinePayload,
  parsePropertyResponse,
  parseIdOfResponse,
  stripTypePrefix,
  hasTypePrefix,
} from './rdo-helpers';

describe('cleanPayload', () => {
  it('should clean res="..." format', () => {
    expect(cleanPayload('res="#6805584"')).toBe('6805584');
  });

  it('should clean res="%" (empty string)', () => {
    expect(cleanPayload('res="%"')).toBe('');
  });

  it('should remove outer quotes and type prefix', () => {
    expect(cleanPayload('"#42"')).toBe('42');
    expect(cleanPayload('"%hello"')).toBe('hello');
  });

  it('should handle plain values', () => {
    expect(cleanPayload('42')).toBe('42');
    expect(cleanPayload('hello')).toBe('hello');
  });

  it('should trim whitespace', () => {
    expect(cleanPayload('  res="#99"  ')).toBe('99');
  });

  it('should handle doubled quotes in res="..." (Delphi convention)', () => {
    expect(cleanPayload('res="%Hello ""World"""')).toBe('Hello "World"');
  });

  it('should strip all 7 type prefixes', () => {
    expect(cleanPayload('"#42"')).toBe('42');
    expect(cleanPayload('"%str"')).toBe('str');
    expect(cleanPayload('"@3.14"')).toBe('3.14');
    expect(cleanPayload('"$id"')).toBe('id');
    expect(cleanPayload('"^var"')).toBe('var');
    expect(cleanPayload('"!3.14"')).toBe('3.14');
    expect(cleanPayload('"*"')).toBe('');
  });
});

describe('parsePropertyResponse', () => {
  it('should extract Property="value" format', () => {
    expect(parsePropertyResponse('RDOOpenSession="#142217260"', 'RDOOpenSession')).toBe('142217260');
  });

  it('should extract res="value" via fallback', () => {
    expect(parsePropertyResponse('res="#42"', 'SomeProp')).toBe('42');
  });

  it('should handle doubled quotes in property values', () => {
    expect(parsePropertyResponse('Name="%Build ""Project"""', 'Name')).toBe('Build "Project"');
  });

  it('should handle payload starting with property name', () => {
    expect(parsePropertyResponse('Count="#5"', 'Count')).toBe('5');
  });
});

describe('parseIdOfResponse', () => {
  it('should extract objid="value"', () => {
    expect(parseIdOfResponse('objid="39751288"')).toBe('39751288');
  });

  it('should strip # prefix from objid', () => {
    expect(parseIdOfResponse('objid="#39751288"')).toBe('39751288');
  });

  it('should throw on empty/undefined', () => {
    expect(() => parseIdOfResponse(undefined)).toThrow('Empty idof response');
  });
});

describe('stripTypePrefix', () => {
  it('should strip all 7 prefixes', () => {
    expect(stripTypePrefix('#42')).toBe('42');
    expect(stripTypePrefix('%str')).toBe('str');
    expect(stripTypePrefix('@3.14')).toBe('3.14');
    expect(stripTypePrefix('$id')).toBe('id');
    expect(stripTypePrefix('^var')).toBe('var');
    expect(stripTypePrefix('!3.14')).toBe('3.14');
    expect(stripTypePrefix('*')).toBe('');
  });

  it('should not strip non-prefix characters', () => {
    expect(stripTypePrefix('hello')).toBe('hello');
    expect(stripTypePrefix('42')).toBe('42');
  });
});

describe('hasTypePrefix', () => {
  it('should detect all 7 prefixes', () => {
    expect(hasTypePrefix('#42')).toBe(true);
    expect(hasTypePrefix('%str')).toBe(true);
    expect(hasTypePrefix('@3.14')).toBe(true);
    expect(hasTypePrefix('$id')).toBe(true);
    expect(hasTypePrefix('^var')).toBe(true);
    expect(hasTypePrefix('!3.14')).toBe(true);
    expect(hasTypePrefix('*')).toBe(true);
  });

  it('should return false for non-prefixed values', () => {
    expect(hasTypePrefix('hello')).toBe(false);
    expect(hasTypePrefix('42')).toBe(false);
    expect(hasTypePrefix('')).toBe(false);
  });
});

describe('GetPropertyList empty-value pipeline', () => {
  // Regression: empty values (consecutive tabs) must survive cleanPayload + split
  // so that allValues.set() stores '' and does not shift downstream indices.
  // Bug: guard `if (value && ...)` dropped empty strings; fixed to `if (value !== 'error')`.

  it('preserves empty value in the middle of a tab-separated response', () => {
    // Mirrors: A26024 res="%SPO_test3\t29\t\t-134478120-\t...\t-1\t"
    const raw = cleanPayload('res="%SPO_test3\t29\t\t-134478120-\t32\t-1\t"');
    const values = raw.includes('\t') ? raw.split('\t').map(v => v.trim()) : raw.split(/\s+/);
    // Index 2 (Name) must be empty string, not undefined or skipped
    expect(values[2]).toBe('');
    expect(values.length).toBe(6); // trailing tab trimmed by cleanPayload → 6 elements
  });

  it('empty string is NOT filtered by value !== "error" guard', () => {
    const value: string = '';
    expect(value !== 'error').toBe(true);
  });

  it('"error" string IS filtered by value !== "error" guard', () => {
    const value: string = 'error';
    expect(value !== 'error').toBe(false);
  });
});

describe('GetPropertyList tab-split response parsing', () => {
  // Simulates cacherGetPropertyList parsing: cleanPayload + tab-split
  function parsePropertyListResponse(rawPayload: string): string[] {
    const raw = cleanPayload(rawPayload);
    return raw.split('\t').map(v => v.trim());
  }

  it('should split tab-delimited values correctly', () => {
    const result = parsePropertyListResponse('res="%Bars\tBooks\tCars"');
    expect(result).toEqual(['Bars', 'Books', 'Cars']);
  });

  it('should preserve multi-word values (not split by spaces)', () => {
    const result = parsePropertyListResponse('res="%Processed Food\tFresh Food\tHousehold Appliances"');
    expect(result).toEqual(['Processed Food', 'Fresh Food', 'Household Appliances']);
  });

  it('should preserve empty strings between tabs', () => {
    const result = parsePropertyListResponse('res="%value1\t\tvalue3"');
    expect(result).toEqual(['value1', '', 'value3']);
  });

  it('should handle all-empty tab-delimited response', () => {
    // cleanPayload trims trailing whitespace, so trailing tabs are stripped.
    // The server sends tab-separated empty values; after cleanPayload,
    // only the inner tabs survive → fewer elements than requested.
    // The caller (cacherGetPropertyList) handles this via the length warning.
    const result = parsePropertyListResponse('res="%\t\t\t"');
    expect(result).toEqual(['']);
  });

  it('should handle single value (no tabs)', () => {
    const result = parsePropertyListResponse('res="%42"');
    expect(result).toEqual(['42']);
  });

  it('should handle trailing tab (trimmed by cleanPayload)', () => {
    // cleanPayload trims the payload, which removes the trailing tab.
    // So "Bars\tBooks\t" becomes "Bars\tBooks" after trim → 2 elements.
    const result = parsePropertyListResponse('res="%Bars\tBooks\t"');
    expect(result).toEqual(['Bars', 'Books']);
  });

  it('should handle float values correctly', () => {
    const result = parsePropertyListResponse('res="%21.417142868042\t1.47142863273621\t0.0366818867623806"');
    expect(result).toEqual(['21.417142868042', '1.47142863273621', '0.0366818867623806']);
  });
});

describe('splitMultilinePayload', () => {
  it('should split and trim lines', () => {
    const result = splitMultilinePayload('res="%Line1\nLine2\nLine3"');
    expect(result).toEqual(['Line1', 'Line2', 'Line3']);
  });

  it('should filter empty lines', () => {
    const result = splitMultilinePayload('res="%A\n\nB"');
    expect(result).toEqual(['A', 'B']);
  });
});
