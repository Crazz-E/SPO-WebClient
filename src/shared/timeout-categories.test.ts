import { describe, it, expect } from '@jest/globals';
import { TimeoutCategory, TIMEOUT_CONFIG, IS_PROXY_TIMEOUT_MS } from './timeout-categories';

const ALL_CATEGORIES = [
  TimeoutCategory.FAST,
  TimeoutCategory.NORMAL,
  TimeoutCategory.SLOW,
  TimeoutCategory.VERY_SLOW,
];

describe('TimeoutCategories', () => {
  it('defines four categories', () => {
    expect(Object.keys(TimeoutCategory)).toHaveLength(4);
    expect(TimeoutCategory.FAST).toBe('FAST');
    expect(TimeoutCategory.NORMAL).toBe('NORMAL');
    expect(TimeoutCategory.SLOW).toBe('SLOW');
    expect(TimeoutCategory.VERY_SLOW).toBe('VERY_SLOW');
  });

  it('has config for every category', () => {
    for (const cat of ALL_CATEGORIES) {
      const cfg = TIMEOUT_CONFIG[cat];
      expect(cfg).toBeDefined();
      expect(cfg.rdoMs).toBeGreaterThan(0);
      expect(cfg.wsMs).toBeGreaterThan(0);
    }
  });

  it('rdoMs < wsMs for every category (L3 always fires before L1)', () => {
    for (const cat of ALL_CATEGORIES) {
      const cfg = TIMEOUT_CONFIG[cat];
      expect(cfg.rdoMs).toBeLessThan(cfg.wsMs);
    }
  });

  it('FAST rdoMs matches the legacy proxy DefTimeOut (60s)', () => {
    expect(TIMEOUT_CONFIG[TimeoutCategory.FAST].rdoMs).toBe(60_000);
  });

  it('all in-play categories share the legacy ISProxyTimeOut (180s)', () => {
    // ServerCnxHandler.pas:329 — the legacy client waits 180s on every world
    // call during play; timing out earlier surfaced false failures.
    expect(IS_PROXY_TIMEOUT_MS).toBe(180_000);
    for (const cat of [TimeoutCategory.NORMAL, TimeoutCategory.SLOW, TimeoutCategory.VERY_SLOW]) {
      expect(TIMEOUT_CONFIG[cat].rdoMs).toBe(IS_PROXY_TIMEOUT_MS);
    }
  });

  it('categories are ordered by non-decreasing timeout duration', () => {
    expect(TIMEOUT_CONFIG[TimeoutCategory.FAST].rdoMs)
      .toBeLessThanOrEqual(TIMEOUT_CONFIG[TimeoutCategory.NORMAL].rdoMs);
    expect(TIMEOUT_CONFIG[TimeoutCategory.NORMAL].rdoMs)
      .toBeLessThanOrEqual(TIMEOUT_CONFIG[TimeoutCategory.SLOW].rdoMs);
    expect(TIMEOUT_CONFIG[TimeoutCategory.SLOW].rdoMs)
      .toBeLessThanOrEqual(TIMEOUT_CONFIG[TimeoutCategory.VERY_SLOW].rdoMs);
  });
});
