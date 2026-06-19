/**
 * Tests for parseTownHallDemographics — Town Hall population/demographics parser.
 *
 * Ground truth: the captured RefreshObject ExtraInfo of the "Town Hall" of
 * Helartia (as split into salesInfo / detailsText / hintsText by
 * parseBuildingFocusResponse).
 */

import { describe, it, expect } from '@jest/globals';
import { parseTownHallDemographics } from './town-hall-demographics';

// Sections exactly as parseBuildingFocusResponse stores them (note the stray
// trailing ':' on salesInfo, an artifact of splitting "...inhabitants:-:" on "-:").
const CAPTURED = {
  salesInfo: '18,372 inhabitants:',
  detailsText:
    '253 High class (0% unemp), 905 Middle class (41% unemp), 17,214 Low class (86% unemp).',
  hintsText:
    'No High class movements. 3 citizens of Middle class moved out last day.2% due to salaries and work conditions, 19% due to residential conditions, 15% due to low coverage of public services, 8% due to unemployment, 54% due to lack of products and services.No Low class movements.',
};

describe('parseTownHallDemographics — captured Town Hall', () => {
  const result = parseTownHallDemographics(CAPTURED);

  it('parses total inhabitants (ignoring the stray trailing colon)', () => {
    expect(result).not.toBeNull();
    expect(result!.totalInhabitants).toBe(18372);
    expect(result!.totalInhabitantsLabel).toBe('18,372');
  });

  it('parses the three class breakdown rows with unemployment', () => {
    expect(result!.classes).toEqual([
      { className: 'High', population: 253, populationLabel: '253', unemploymentPct: 0 },
      { className: 'Middle', population: 905, populationLabel: '905', unemploymentPct: 41 },
      { className: 'Low', population: 17214, populationLabel: '17,214', unemploymentPct: 86 },
    ]);
  });

  it('parses three per-class movement reports', () => {
    expect(result!.movements).toHaveLength(3);
    expect(result!.movements[0]).toEqual({
      className: 'High',
      direction: 'none',
      count: 0,
      reasons: [],
    });
    expect(result!.movements[2]).toEqual({
      className: 'Low',
      direction: 'none',
      count: 0,
      reasons: [],
    });
  });

  it('parses the Middle-class emigration with its full reason breakdown', () => {
    const middle = result!.movements[1];
    expect(middle.className).toBe('Middle');
    expect(middle.direction).toBe('out');
    expect(middle.count).toBe(3);
    expect(middle.reasons).toEqual([
      { pct: 2, reason: 'salaries and work conditions' },
      { pct: 19, reason: 'residential conditions' },
      { pct: 15, reason: 'low coverage of public services' },
      { pct: 8, reason: 'unemployment' },
      { pct: 54, reason: 'lack of products and services' },
    ]);
  });
});

describe('parseTownHallDemographics — edge cases', () => {
  it('returns null when there is no class breakdown (non-Town-Hall building)', () => {
    expect(
      parseTownHallDemographics({
        salesInfo: 'Pharmaceutics sales at 1%',
        detailsText: 'Drug Store. Upgrade Level: 1 Items Sold: 1/h Efficiency: 87%',
        hintsText: 'Hint: Try to attract more customers.',
      }),
    ).toBeNull();
  });

  it('handles immigration ("moved in") and a "to find job" reason without "due to"', () => {
    const result = parseTownHallDemographics({
      salesInfo: '1,000 inhabitants',
      detailsText: '10 High class (5% unemp)',
      hintsText:
        '5 citizens of High class moved in last day.60% due to residential conditions, 40% to find job.No Middle class movements.No Low class movements.',
    });
    expect(result).not.toBeNull();
    const high = result!.movements[0];
    expect(high.direction).toBe('in');
    expect(high.count).toBe(5);
    expect(high.reasons).toEqual([
      { pct: 60, reason: 'residential conditions' },
      { pct: 40, reason: 'to find job' },
    ]);
  });

  it('falls back to detailsText for the inhabitants count when salesInfo lacks it', () => {
    const result = parseTownHallDemographics({
      salesInfo: '',
      detailsText: '2,500 inhabitants. 100 Low class (10% unemp)',
      hintsText: '',
    });
    expect(result!.totalInhabitants).toBe(2500);
    expect(result!.totalInhabitantsLabel).toBe('2,500');
    expect(result!.movements).toEqual([]);
  });

  it('reports total 0 / "0" when no inhabitants figure is present', () => {
    const result = parseTownHallDemographics({
      detailsText: '42 Middle class (3% unemp)',
    });
    expect(result!.totalInhabitants).toBe(0);
    expect(result!.totalInhabitantsLabel).toBe('0');
  });

  it('ignores unrecognized movement text', () => {
    const result = parseTownHallDemographics({
      detailsText: '5 High class (0% unemp)',
      hintsText: 'Population is stable.',
    });
    expect(result!.movements).toEqual([]);
  });

  it('does not throw on completely empty input (returns null)', () => {
    expect(parseTownHallDemographics({})).toBeNull();
  });
});
