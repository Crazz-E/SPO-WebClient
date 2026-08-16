import {
  recordPropertyFallback,
  getPropertyFallbackCensus,
  resetPropertyFallbackCensus,
} from './property-fallback-census';
import { parsePropertyResponse } from '../rdo-helpers';

describe('property fallback census', () => {
  beforeEach(() => resetPropertyFallbackCensus());

  describe('classification — the only thing that makes the census worth reading', () => {
    it('marks a structured payload as suspect: the value returned is another property', () => {
      // The audit's own example. `Tax.Id` matches nothing in `Tax0Id="#5"`, so
      // the caller receives another property's text as if it were a value.
      recordPropertyFallback('Tax.Id', 'Tax0Id="#5"');

      const [entry] = getPropertyFallbackCensus();
      expect(entry.observation.structuredPayload).toBe(true);
      expect(entry.observation.propName).toBe('Tax.Id');
    });

    it('marks a bare value as benign: this is the fallback doing its job', () => {
      recordPropertyFallback('Whatever', '42');

      const [entry] = getPropertyFallbackCensus();
      expect(entry.observation.structuredPayload).toBe(false);
    });

    it('keeps the two shapes apart for the same property name', () => {
      // A property can answer bare in one call site and structured in another.
      // Collapsing them would hide the suspect half behind the benign count.
      recordPropertyFallback('Mixed', 'plain value');
      recordPropertyFallback('Mixed', 'Other="#1"');

      const census = getPropertyFallbackCensus();
      expect(census).toHaveLength(2);
      expect(census.map(e => e.observation.structuredPayload).sort()).toEqual([false, true]);
    });

    it('counts repeats instead of growing the census', () => {
      recordPropertyFallback('Repeat', 'Other="#1"');
      recordPropertyFallback('Repeat', 'Other="#2"');

      const census = getPropertyFallbackCensus();
      expect(census).toHaveLength(1);
      expect(census[0].count).toBe(2);
      // First sample wins — enough to identify the shape, and stable.
      expect(census[0].observation.sample).toBe('Other="#1"');
    });

    it('sorts most frequent first', () => {
      recordPropertyFallback('Rare', 'x');
      recordPropertyFallback('Common', 'y');
      recordPropertyFallback('Common', 'y');

      expect(getPropertyFallbackCensus()[0].observation.propName).toBe('Common');
    });
  });

  describe('wiring — measurement must not change what the parser returns', () => {
    it('records nothing when the property actually matches', () => {
      expect(parsePropertyResponse('TycoonId="#22"', 'TycoonId')).toBe('22');
      expect(getPropertyFallbackCensus()).toHaveLength(0);
    });

    it('records the near-miss the audit described, and still returns the old value', () => {
      const result = parsePropertyResponse('Tax0Id="#5"', 'Tax.Id');

      // Behaviour is deliberately UNCHANGED — this pass measures, it does not fix.
      // Note the truncation the audit reported: cleanPayload() eats the closing
      // quote, so the caller gets `Tax0Id="#5` — not even a well-formed value.
      expect(result).toBe('Tax0Id="#5');

      const census = getPropertyFallbackCensus();
      expect(census).toHaveLength(1);
      expect(census[0].observation.propName).toBe('Tax.Id');
      expect(census[0].observation.structuredPayload).toBe(true);
    });

    it('records the bare-value path that callers legitimately rely on', () => {
      expect(parsePropertyResponse('somevalue', 'Anything')).toBe('somevalue');

      const census = getPropertyFallbackCensus();
      expect(census).toHaveLength(1);
      expect(census[0].observation.structuredPayload).toBe(false);
    });
  });
});
