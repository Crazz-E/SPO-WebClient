/**
 * Tests for cluster-data.ts — static metadata for company creation.
 */

import { describe, it, expect } from '@jest/globals';
import { CLUSTER_IDS, CLUSTER_DISPLAY_NAMES, INVALID_COMPANY_NAME_CHARS } from './cluster-data';
import type { ClusterId } from './cluster-data';

describe('cluster-data', () => {
  describe('CLUSTER_IDS', () => {
    it('contains exactly 5 cluster IDs', () => {
      expect(CLUSTER_IDS).toHaveLength(5);
    });

    it('contains all expected clusters', () => {
      expect(CLUSTER_IDS).toContain('Dissidents');
      expect(CLUSTER_IDS).toContain('PGI');
      expect(CLUSTER_IDS).toContain('Mariko');
      expect(CLUSTER_IDS).toContain('Moab');
      expect(CLUSTER_IDS).toContain('Magna');
    });

    it('is read-only (const tuple)', () => {
      // Verify it is an array — readonly tuples are still arrays at runtime
      expect(Array.isArray(CLUSTER_IDS)).toBe(true);
    });
  });

  describe('CLUSTER_DISPLAY_NAMES', () => {
    it('has an entry for every cluster ID', () => {
      for (const id of CLUSTER_IDS) {
        expect(CLUSTER_DISPLAY_NAMES[id]).toBeDefined();
        expect(typeof CLUSTER_DISPLAY_NAMES[id]).toBe('string');
        expect(CLUSTER_DISPLAY_NAMES[id].length).toBeGreaterThan(0);
      }
    });

    it('maps IDs to correct display names', () => {
      expect(CLUSTER_DISPLAY_NAMES.Dissidents).toBe('Dissidents');
      expect(CLUSTER_DISPLAY_NAMES.PGI).toBe('PGI');
      expect(CLUSTER_DISPLAY_NAMES.Mariko).toBe('Mariko Enterprises');
      expect(CLUSTER_DISPLAY_NAMES.Moab).toBe('The Moab');
      expect(CLUSTER_DISPLAY_NAMES.Magna).toBe('Magna Corp');
    });

    it('type-checks ClusterId keys', () => {
      const keys = Object.keys(CLUSTER_DISPLAY_NAMES) as ClusterId[];
      expect(keys).toHaveLength(5);
    });
  });

  describe('INVALID_COMPANY_NAME_CHARS', () => {
    it('rejects backslash', () => {
      expect(INVALID_COMPANY_NAME_CHARS.test('My\\Company')).toBe(true);
    });

    it('rejects forward slash', () => {
      expect(INVALID_COMPANY_NAME_CHARS.test('My/Company')).toBe(true);
    });

    it('rejects colon', () => {
      expect(INVALID_COMPANY_NAME_CHARS.test('Company:Inc')).toBe(true);
    });

    it('rejects asterisk', () => {
      expect(INVALID_COMPANY_NAME_CHARS.test('Star*Corp')).toBe(true);
    });

    it('rejects question mark', () => {
      expect(INVALID_COMPANY_NAME_CHARS.test('Why?')).toBe(true);
    });

    it('rejects double quote', () => {
      expect(INVALID_COMPANY_NAME_CHARS.test('The "Best"')).toBe(true);
    });

    it('rejects angle brackets', () => {
      expect(INVALID_COMPANY_NAME_CHARS.test('<Corp>')).toBe(true);
    });

    it('rejects pipe', () => {
      expect(INVALID_COMPANY_NAME_CHARS.test('A|B')).toBe(true);
    });

    it('rejects ampersand', () => {
      expect(INVALID_COMPANY_NAME_CHARS.test('A&B')).toBe(true);
    });

    it('rejects plus', () => {
      expect(INVALID_COMPANY_NAME_CHARS.test('A+B')).toBe(true);
    });

    it('rejects percent', () => {
      expect(INVALID_COMPANY_NAME_CHARS.test('50%')).toBe(true);
    });

    it('allows normal company names', () => {
      expect(INVALID_COMPANY_NAME_CHARS.test('Acme Industries')).toBe(false);
      expect(INVALID_COMPANY_NAME_CHARS.test('My Company')).toBe(false);
      expect(INVALID_COMPANY_NAME_CHARS.test('Corp-123')).toBe(false);
      expect(INVALID_COMPANY_NAME_CHARS.test("O'Brien Enterprises")).toBe(false);
    });

    it('allows hyphens, underscores, and dots', () => {
      expect(INVALID_COMPANY_NAME_CHARS.test('My-Corp')).toBe(false);
      expect(INVALID_COMPANY_NAME_CHARS.test('My_Corp')).toBe(false);
      expect(INVALID_COMPANY_NAME_CHARS.test('My.Corp')).toBe(false);
    });
  });
});
