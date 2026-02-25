/**
 * Tests for HQ Inventions Group (Phase 3.1)
 * Verifies template structure, handler mapping, and group lookup.
 */

import { describe, it, expect } from '@jest/globals';
import {
  HQ_INVENTIONS_GROUP,
  HANDLER_TO_GROUP,
  GROUP_BY_ID,
  getGroupById,
} from './template-groups';
import { PropertyType } from './property-definitions';

describe('HQ_INVENTIONS_GROUP', () => {
  it('should have correct id and name', () => {
    expect(HQ_INVENTIONS_GROUP.id).toBe('hqInventions');
    expect(HQ_INVENTIONS_GROUP.name).toBe('Research');
    expect(HQ_INVENTIONS_GROUP.icon).toBe('R');
    expect(HQ_INVENTIONS_GROUP.order).toBe(15);
  });

  it('should have 3 TABLE sections plus scalar and action buttons', () => {
    const tables = HQ_INVENTIONS_GROUP.properties.filter(p => p.type === PropertyType.TABLE);
    expect(tables).toHaveLength(3);

    const tableNames = tables.map(t => t.displayName);
    expect(tableNames).toContain('In Development');
    expect(tableNames).toContain('Completed');
    expect(tableNames).toContain('Available');
  });

  it('should have In Development table with devCount0 count property', () => {
    const devTable = HQ_INVENTIONS_GROUP.properties.find(p => p.rdoName === 'devName');
    expect(devTable).toBeDefined();
    expect(devTable!.indexed).toBe(true);
    expect(devTable!.countProperty).toBe('devCount0');
    expect(devTable!.columns).toHaveLength(3);
    expect(devTable!.columns![0].rdoSuffix).toBe('devName');
    expect(devTable!.columns![1].rdoSuffix).toBe('devCost');
    expect(devTable!.columns![2].rdoSuffix).toBe('devProgress');
  });

  it('should have Completed table with hasCount0 count property', () => {
    const hasTable = HQ_INVENTIONS_GROUP.properties.find(p => p.rdoName === 'hasName');
    expect(hasTable).toBeDefined();
    expect(hasTable!.indexed).toBe(true);
    expect(hasTable!.countProperty).toBe('hasCount0');
    expect(hasTable!.columns).toHaveLength(2);
  });

  it('should have Available table with avlCount0 count property', () => {
    const avlTable = HQ_INVENTIONS_GROUP.properties.find(p => p.rdoName === 'avlName');
    expect(avlTable).toBeDefined();
    expect(avlTable!.indexed).toBe(true);
    expect(avlTable!.countProperty).toBe('avlCount0');
    expect(avlTable!.columns).toHaveLength(3);
  });

  it('should have 2 ACTION_BUTTON properties', () => {
    const buttons = HQ_INVENTIONS_GROUP.properties.filter(p => p.type === PropertyType.ACTION_BUTTON);
    expect(buttons).toHaveLength(2);

    const actionIds = buttons.map(b => b.actionId);
    expect(actionIds).toContain('queueResearch');
    expect(actionIds).toContain('cancelResearch');
  });

  it('should have rdoCommands for RDOQueueResearch and RDOCancelResearch', () => {
    expect(HQ_INVENTIONS_GROUP.rdoCommands).toBeDefined();
    expect(HQ_INVENTIONS_GROUP.rdoCommands!['RDOQueueResearch']).toBeDefined();
    expect(HQ_INVENTIONS_GROUP.rdoCommands!['RDOCancelResearch']).toBeDefined();
  });

  it('should have RsKind scalar property', () => {
    const rsKind = HQ_INVENTIONS_GROUP.properties.find(p => p.rdoName === 'RsKind');
    expect(rsKind).toBeDefined();
    expect(rsKind!.type).toBe(PropertyType.NUMBER);
    expect(rsKind!.hideEmpty).toBe(true);
  });
});

describe('Handler and Group mappings', () => {
  it('should map hdqInventions handler to HQ_INVENTIONS_GROUP', () => {
    expect(HANDLER_TO_GROUP['hdqInventions']).toBe(HQ_INVENTIONS_GROUP);
  });

  it('should be in GROUP_BY_ID as hqInventions', () => {
    expect(GROUP_BY_ID['hqInventions']).toBe(HQ_INVENTIONS_GROUP);
  });

  it('should be resolved by getGroupById', () => {
    expect(getGroupById('hqInventions')).toBe(HQ_INVENTIONS_GROUP);
  });
});
