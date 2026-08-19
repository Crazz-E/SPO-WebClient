/**
 * Building store — the per-gate half of the lazy Supplies/Products tabs.
 *
 * `mergeTabData` fills the accordion with gate HEADERS; the rows of one gate
 * arrive later, when the user opens it. Three pieces of state carry that:
 * `expandedGates` (what is open), `gateLoadingStates` (what has been read), and
 * the in-place merge that replaces one gate without disturbing its neighbours.
 *
 * The memo mirrors the reference client's `Info.Loaded`
 * (Voyager/ProdSheetForm.pas:464): a gate re-opened costs nothing.
 */

import { useBuildingStore, gateKey } from './building-store';
import type { BuildingDetailsResponse, BuildingSupplyData, BuildingProductData } from '../../shared/types';

const makeDetails = (x: number, y: number): BuildingDetailsResponse => ({
  buildingId: `bld-${x}-${y}`,
  x,
  y,
  visualClass: '1234',
  templateName: 'Warehouse',
  buildingName: 'Warehouse',
  ownerName: 'TestCorp',
  securityId: 'sec-1',
  tabs: [],
  groups: {},
  timestamp: 1,
});

const gate = (path: string, name: string, count = 0): BuildingSupplyData => ({
  path, name, metaFluid: name, fluidValue: '', connectionCount: count, connections: [],
});

const productGate = (path: string, name: string): BuildingProductData => ({
  path, name, metaFluid: name, lastFluid: '', quality: '', pricePc: '',
  avgPrice: '', marketPrice: '', connectionCount: 0, connections: [],
});

/** Two supply gates and two product gates, headers only — a freshly opened tab. */
function seedHeaders(): void {
  const store = useBuildingStore.getState();
  store.setDetails(makeDetails(10, 20));
  store.mergeTabData('supplies', { supplies: [gate('SegA', 'Books', 2), gate('SegB', 'Cars', 1)] }, 10, 20);
  store.mergeTabData('products', { products: [productGate('GateA', 'Toys')] }, 10, 20);
}

const rows = [{
  facilityName: 'Farm A', companyName: 'Yellow Inc.', createdBy: 'SPO_test3',
  price: '100', overprice: '10', lastValue: '900', cost: '$12', quality: '95%',
  connected: true, x: 40, y: 50,
}];

beforeEach(() => {
  useBuildingStore.getState().clearDetails();
});

describe('gateKey', () => {
  it('separates the two accordions, so the same path in each is two gates', () => {
    expect(gateKey('supplies', 'Seg0')).not.toBe(gateKey('products', 'Seg0'));
  });
});

describe('expandedGates', () => {
  it('starts empty — every gate renders collapsed', () => {
    expect(useBuildingStore.getState().expandedGates.size).toBe(0);
  });

  it('toggles one gate open and closed', () => {
    const store = useBuildingStore.getState();
    store.toggleGateExpanded('supplies', 'SegA');
    expect(useBuildingStore.getState().expandedGates.has(gateKey('supplies', 'SegA'))).toBe(true);

    useBuildingStore.getState().toggleGateExpanded('supplies', 'SegA');
    expect(useBuildingStore.getState().expandedGates.has(gateKey('supplies', 'SegA'))).toBe(false);
  });

  it('keeps several gates open at once', () => {
    useBuildingStore.getState().toggleGateExpanded('supplies', 'SegA');
    useBuildingStore.getState().toggleGateExpanded('products', 'GateA');

    expect(useBuildingStore.getState().expandedGates.size).toBe(2);
  });

  it('hands back a NEW Set each time, so subscribers actually re-render', () => {
    const before = useBuildingStore.getState().expandedGates;
    useBuildingStore.getState().toggleGateExpanded('supplies', 'SegA');

    expect(useBuildingStore.getState().expandedGates).not.toBe(before);
  });

  it('survives a tab reload — an auto-refresh must not collapse what the user opened', () => {
    seedHeaders();
    useBuildingStore.getState().toggleGateExpanded('supplies', 'SegA');

    useBuildingStore.getState().resetTabLoadingStates();

    expect(useBuildingStore.getState().expandedGates.has(gateKey('supplies', 'SegA'))).toBe(true);
  });

  it('is dropped when the panel closes', () => {
    useBuildingStore.getState().toggleGateExpanded('supplies', 'SegA');
    useBuildingStore.getState().clearFocus();

    expect(useBuildingStore.getState().expandedGates.size).toBe(0);
  });
});

describe('gateLoadingStates', () => {
  it('marks one gate loading without touching its neighbours', () => {
    useBuildingStore.getState().setGateLoading('supplies', 'SegA');

    expect(useBuildingStore.getState().gateLoadingStates).toEqual({
      [gateKey('supplies', 'SegA')]: 'loading',
    });
  });

  it('marks a failed read so the loader stops retrying on every render', () => {
    useBuildingStore.getState().setGateError('supplies', 'SegA');

    expect(useBuildingStore.getState().gateLoadingStates[gateKey('supplies', 'SegA')]).toBe('error');
  });

  it('clears the error when the gate is re-opened — that is the retry', () => {
    useBuildingStore.getState().setGateError('supplies', 'SegA');
    // close, then open again
    useBuildingStore.getState().toggleGateExpanded('supplies', 'SegA');

    expect(useBuildingStore.getState().gateLoadingStates[gateKey('supplies', 'SegA')]).toBeUndefined();
  });

  it('keeps a loaded gate loaded when it is merely collapsed', () => {
    seedHeaders();
    useBuildingStore.getState().mergeGateData('supplies', 'SegA', { ...gate('SegA', 'Books', 1), connections: rows }, 10, 20);
    useBuildingStore.getState().toggleGateExpanded('supplies', 'SegA'); // open
    useBuildingStore.getState().toggleGateExpanded('supplies', 'SegA'); // closed again

    expect(useBuildingStore.getState().gateLoadingStates[gateKey('supplies', 'SegA')]).toBe('loaded');
  });
});

describe('mergeGateData', () => {
  it('replaces the one gate it was given and leaves the others alone', () => {
    seedHeaders();
    const before = useBuildingStore.getState().details!.supplies!;

    useBuildingStore.getState().mergeGateData(
      'supplies', 'SegA', { ...gate('SegA', 'Books', 1), connections: rows }, 10, 20,
    );

    const after = useBuildingStore.getState().details!.supplies!;
    expect(after[0].connections).toEqual(rows);
    expect(after[1]).toBe(before[1]); // untouched, same reference
    expect(after).not.toBe(before);   // but a new array, so the panel re-renders
  });

  it('marks the gate loaded', () => {
    seedHeaders();
    useBuildingStore.getState().mergeGateData('supplies', 'SegA', gate('SegA', 'Books'), 10, 20);

    expect(useBuildingStore.getState().gateLoadingStates[gateKey('supplies', 'SegA')]).toBe('loaded');
  });

  it('merges into the products list when told products', () => {
    seedHeaders();
    useBuildingStore.getState().mergeGateData(
      'products', 'GateA', { ...productGate('GateA', 'Toys'), connectionCount: 3 }, 10, 20,
    );

    expect(useBuildingStore.getState().details!.products![0].connectionCount).toBe(3);
    expect(useBuildingStore.getState().details!.supplies![0].connections).toEqual([]);
  });

  it('rejects a read that landed after the user moved to another building', () => {
    // The Delphi temp object is shared and SetPath repositions it, so a late
    // reply can describe a gate of the building that is no longer on screen.
    seedHeaders();
    useBuildingStore.getState().mergeGateData(
      'supplies', 'SegA', { ...gate('SegA', 'Books'), connections: rows }, 99, 99,
    );

    expect(useBuildingStore.getState().details!.supplies![0].connections).toEqual([]);
    expect(useBuildingStore.getState().gateLoadingStates).toEqual({});
  });

  it('is a no-op when the panel is gone', () => {
    useBuildingStore.getState().mergeGateData('supplies', 'SegA', gate('SegA', 'Books'), 10, 20);

    expect(useBuildingStore.getState().details).toBeNull();
  });

  it('drops a reply for a gate the tab no longer lists, but stops asking for it', () => {
    seedHeaders();
    useBuildingStore.getState().mergeGateData('supplies', 'SegZ', gate('SegZ', 'Ghost'), 10, 20);

    expect(useBuildingStore.getState().details!.supplies!.map(g => g.path)).toEqual(['SegA', 'SegB']);
    expect(useBuildingStore.getState().gateLoadingStates[gateKey('supplies', 'SegZ')]).toBe('loaded');
  });

  it('drops a reply when the tab holds no list at all yet', () => {
    useBuildingStore.getState().setDetails(makeDetails(10, 20));
    useBuildingStore.getState().mergeGateData('supplies', 'SegA', gate('SegA', 'Books'), 10, 20);

    expect(useBuildingStore.getState().details!.supplies).toBeUndefined();
  });
});

describe('invalidation', () => {
  it('invalidateTabs drops the gate memo of the tabs it names', () => {
    seedHeaders();
    useBuildingStore.getState().mergeGateData('supplies', 'SegA', gate('SegA', 'Books'), 10, 20);
    useBuildingStore.getState().mergeGateData('products', 'GateA', productGate('GateA', 'Toys'), 10, 20);

    useBuildingStore.getState().invalidateTabs(['supplies']);

    // Without this the open gate would keep showing the list it held before the
    // connection change, since the loader skips a gate already marked 'loaded'.
    expect(useBuildingStore.getState().gateLoadingStates[gateKey('supplies', 'SegA')]).toBeUndefined();
    expect(useBuildingStore.getState().gateLoadingStates[gateKey('products', 'GateA')]).toBe('loaded');
  });

  it('invalidateTabs keeps the rows on screen while the re-read is in flight', () => {
    seedHeaders();
    useBuildingStore.getState().mergeGateData(
      'supplies', 'SegA', { ...gate('SegA', 'Books', 1), connections: rows }, 10, 20,
    );

    useBuildingStore.getState().invalidateTabs(['supplies']);

    expect(useBuildingStore.getState().details!.supplies![0].connections).toEqual(rows);
  });

  it('resetTabLoadingStates drops every gate memo', () => {
    seedHeaders();
    useBuildingStore.getState().mergeGateData('supplies', 'SegA', gate('SegA', 'Books'), 10, 20);
    useBuildingStore.getState().mergeGateData('products', 'GateA', productGate('GateA', 'Toys'), 10, 20);

    useBuildingStore.getState().resetTabLoadingStates();

    expect(useBuildingStore.getState().gateLoadingStates).toEqual({});
  });

  it('clearFocus and clearDetails both drop the gate memo', () => {
    useBuildingStore.getState().setGateLoading('supplies', 'SegA');
    useBuildingStore.getState().clearFocus();
    expect(useBuildingStore.getState().gateLoadingStates).toEqual({});

    useBuildingStore.getState().setGateLoading('supplies', 'SegA');
    useBuildingStore.getState().clearDetails();
    expect(useBuildingStore.getState().gateLoadingStates).toEqual({});
  });
});
