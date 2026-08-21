import { describe, it, expect } from '@jest/globals';
import { HIDDEN_PROPERTY_NAMES, isHiddenProperty } from './hidden-properties';
import { HANDLER_TO_GROUP } from './template-groups';

describe('hidden properties', () => {
  it('hides every name the redesign took off the sheet', () => {
    for (const name of ['TradeRole', 'Role', 'TradeLevel', 'MoneyGraph',
      'UpgradeActions', 'SecurityId', 'Trouble', 'Creator', 'OwnerName']) {
      expect(isHiddenProperty(name)).toBe(true);
    }
  });

  it('leaves everything else alone', () => {
    for (const name of ['ROI', 'Cost', 'Name', 'Stopped', 'Workers0', 'GateMap']) {
      expect(isHiddenProperty(name)).toBe(false);
    }
  });

  /**
   * The hide list is a RENDER filter, not a fetch filter — two of its entries
   * still do work off-screen (`SecurityId` decides `canGovern`, `MoneyGraph`
   * gates the revenue chart), so the templates must keep declaring them.
   */
  it('does not remove the hidden names from the templates that declare them', () => {
    const declared = new Set<string>();
    for (const group of Object.values(HANDLER_TO_GROUP)) {
      for (const prop of group.properties) declared.add(prop.rdoName);
    }
    expect(declared.has('SecurityId')).toBe(true);
    expect(declared.has('MoneyGraph')).toBe(true);
  });

  it('is a set, so membership does not depend on order', () => {
    expect(HIDDEN_PROPERTY_NAMES.has('SecurityId')).toBe(true);
    expect(HIDDEN_PROPERTY_NAMES.size).toBeGreaterThan(0);
  });
});
