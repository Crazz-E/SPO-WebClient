/**
 * Tests for withFallback utility.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { withFallback } from './rdo-fallback';

const mockLog = { warn: jest.fn() };

describe('withFallback', () => {
  it('returns the operation result on success', async () => {
    const result = await withFallback(() => Promise.resolve('hello'), 'default', 'test', mockLog);
    expect(result).toBe('hello');
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it('returns fallback value on error', async () => {
    const result = await withFallback(
      () => Promise.reject(new Error('boom')),
      'fallback-value',
      'testOp',
      mockLog,
    );
    expect(result).toBe('fallback-value');
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('[Fallback] testOp failed'),
      expect.stringContaining('boom'),
    );
  });

  it('returns numeric fallback on error', async () => {
    const result = await withFallback(
      () => Promise.reject(new Error('timeout')),
      0,
      'getCount',
      mockLog,
    );
    expect(result).toBe(0);
  });

  it('returns array fallback on error', async () => {
    const result = await withFallback(
      () => Promise.reject(new Error('fail')),
      [] as string[],
      'getList',
      mockLog,
    );
    expect(result).toEqual([]);
  });

  it('handles non-Error throws', async () => {
    const result = await withFallback(
      () => Promise.reject('string-error'),
      'safe',
      'testNonError',
      mockLog,
    );
    expect(result).toBe('safe');
  });
});
