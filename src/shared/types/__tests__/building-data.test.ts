/**
 * Tests for building-data.ts utility functions:
 * getConstructionTexture, getCompleteVisualClass, getEmptyVisualClass
 */

import { describe, it, expect } from '@jest/globals';
import { getConstructionTexture, getCompleteVisualClass, getEmptyVisualClass } from '../building-data';

describe('getConstructionTexture', () => {
  it('returns Construction32.gif for 1x1 buildings', () => {
    expect(getConstructionTexture(1, 1)).toBe('Construction32.gif');
  });

  it('returns Construction64.gif for 2x2 buildings', () => {
    expect(getConstructionTexture(2, 2)).toBe('Construction64.gif');
  });

  it('returns Construction64.gif for 1x2 buildings (maxSize=2)', () => {
    expect(getConstructionTexture(1, 2)).toBe('Construction64.gif');
  });

  it('returns Construction128.gif for 3x3 buildings', () => {
    expect(getConstructionTexture(3, 3)).toBe('Construction128.gif');
  });

  it('returns Construction192.gif for 4x4 buildings', () => {
    expect(getConstructionTexture(4, 4)).toBe('Construction192.gif');
  });

  it('returns Construction256.gif for 5x5 buildings', () => {
    expect(getConstructionTexture(5, 5)).toBe('Construction256.gif');
  });

  it('returns Construction320.gif for 6x6+ buildings', () => {
    expect(getConstructionTexture(6, 6)).toBe('Construction320.gif');
    expect(getConstructionTexture(10, 10)).toBe('Construction320.gif');
  });

  it('uses the larger dimension for asymmetric buildings', () => {
    expect(getConstructionTexture(1, 4)).toBe('Construction192.gif');
    expect(getConstructionTexture(5, 1)).toBe('Construction256.gif');
  });
});

describe('getCompleteVisualClass', () => {
  it('returns base + visualStages', () => {
    expect(getCompleteVisualClass(100, 1)).toBe(101);
  });

  it('works with visualStages=2 (residential)', () => {
    expect(getCompleteVisualClass(200, 2)).toBe(202);
  });

  it('works with zero visualStages', () => {
    expect(getCompleteVisualClass(50, 0)).toBe(50);
  });

  it('works with large base class values', () => {
    expect(getCompleteVisualClass(99999, 3)).toBe(100002);
  });
});

describe('getEmptyVisualClass', () => {
  it('returns base + 1 when visualStages is 2', () => {
    expect(getEmptyVisualClass(200, 2)).toBe(201);
  });

  it('returns undefined when visualStages is 1', () => {
    expect(getEmptyVisualClass(100, 1)).toBeUndefined();
  });

  it('returns undefined when visualStages is 0', () => {
    expect(getEmptyVisualClass(100, 0)).toBeUndefined();
  });

  it('returns undefined when visualStages is 3', () => {
    expect(getEmptyVisualClass(100, 3)).toBeUndefined();
  });
});
