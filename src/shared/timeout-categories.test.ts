import { describe, it, expect } from '@jest/globals';
import { TimeoutCategory, TIMEOUT_CONFIG } from './timeout-categories';

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

  it('SLOW rdoMs matches legacy Delphi 60s default', () => {
    expect(TIMEOUT_CONFIG[TimeoutCategory.SLOW].rdoMs).toBe(60_000);
  });

  it('VERY_SLOW rdoMs is 120s (approaching Delphi ISProxyTimeOut 180s)', () => {
    expect(TIMEOUT_CONFIG[TimeoutCategory.VERY_SLOW].rdoMs).toBe(120_000);
  });

  it('categories are ordered by timeout duration', () => {
    expect(TIMEOUT_CONFIG[TimeoutCategory.FAST].rdoMs)
      .toBeLessThan(TIMEOUT_CONFIG[TimeoutCategory.NORMAL].rdoMs);
    expect(TIMEOUT_CONFIG[TimeoutCategory.NORMAL].rdoMs)
      .toBeLessThan(TIMEOUT_CONFIG[TimeoutCategory.SLOW].rdoMs);
    expect(TIMEOUT_CONFIG[TimeoutCategory.SLOW].rdoMs)
      .toBeLessThan(TIMEOUT_CONFIG[TimeoutCategory.VERY_SLOW].rdoMs);
  });
});
