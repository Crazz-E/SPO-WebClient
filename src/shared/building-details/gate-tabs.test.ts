/**
 * `isGateTab` — the one list that says which tabs are read gate by gate.
 *
 * It exists because the same three ids are consulted on both sides of the socket: the
 * gateway must not publish a gate group in the property bag, and the client must not read
 * a group key as "this gate is loaded". Two copies of the list is how the Supplies tab
 * ended up empty on every building.
 */

import { GATE_TAB_IDS, isGateTab } from './property-definitions';
import { SUPPLIES_GROUP, PRODUCTS_GROUP, ADS_GROUP, ADVERTISEMENT_GROUP, WORKFORCE_GROUP } from './template-groups';

describe('isGateTab', () => {
  it('names the three gate-backed tabs and nothing else', () => {
    expect([...GATE_TAB_IDS].sort()).toEqual(['compInputs', 'products', 'supplies']);
    expect(isGateTab('supplies')).toBe(true);
    expect(isGateTab('products')).toBe(true);
    expect(isGateTab('compInputs')).toBe(true);
    expect(isGateTab('workforce')).toBe(false);
    expect(isGateTab('whGeneral')).toBe(false);
    expect(isGateTab(undefined)).toBe(false);
  });

  it('catches a gate group by its `special` marker even when its id differs', () => {
    // `ads` (Services) is a gate group whose id is not a gate id: its content is read
    // under the `supplies` key, so it must be recognised by `special`.
    expect(ADS_GROUP.id).toBe('ads');
    expect(isGateTab(ADS_GROUP.id)).toBe(false);
    expect(isGateTab(ADS_GROUP.special)).toBe(true);
    expect(isGateTab(ADVERTISEMENT_GROUP.special)).toBe(true);
  });

  it('every shipped gate group is recognised, and the property groups are not', () => {
    for (const g of [SUPPLIES_GROUP, PRODUCTS_GROUP, ADS_GROUP, ADVERTISEMENT_GROUP]) {
      expect(isGateTab(g.special) || isGateTab(g.id)).toBe(true);
    }
    expect(isGateTab(WORKFORCE_GROUP.special) || isGateTab(WORKFORCE_GROUP.id)).toBe(false);
  });

  it('the supplies group still declares ObjectId — the collision this guards', () => {
    // If this ever stops being true the guard is still correct, but the bug it was
    // written for is gone; the test says which fact the fix rests on.
    expect(SUPPLIES_GROUP.properties.some(p => p.rdoName === 'ObjectId')).toBe(true);
  });
});
