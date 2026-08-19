/// <reference path="../__tests__/matchers/rdo-matchers.d.ts" />

/**
 * building-details-handler — the Voyager object inspector.
 *
 * Two things make this file the hardest of the mission to test, and both are
 * addressed head-on below:
 *
 *  1. MODULE STATE. `activeInspectors` is a WeakMap keyed by SessionContext
 *     (:82). Every `it` therefore builds a FRESH context; nothing is shared at
 *     `describe` level, and `releaseInspector` runs in `afterEach` for the
 *     contexts a test armed by hand through `setActiveInspectorForTest` (:124).
 *
 *  2. DYNAMIC IDs (plan §4bis). The cacher hands out a temp object id at
 *     runtime; that id must travel unchanged through SetObject →
 *     GetPropertyList → SetPath → CloseObject. The fake therefore issues
 *     distinct, non-trivial ids (900001, 900002, …) that match nothing a test
 *     passes as an argument, so a handler that reuses the wrong id is visible.
 *
 * `AsyncMutex` already has __tests__/async-mutex.test.ts — not duplicated here.
 */

import { describe, it, expect } from '@jest/globals';
import {
  Semaphore,
  computeWorkerCount,
  releaseInspector,
  getActiveInspector,
  getActiveInspectorTempObjectId,
  setActiveInspectorForTest,
  AsyncMutex,
  getBuildingDetails,
  getBuildingBasicDetails,
  getBuildingTabData,
  refreshBuildingProperties,
} from './building-details-handler';
import type { ActiveInspector } from './building-details-handler';
import { makeSessionCtx, FAKE_CONTEXT_IDS } from '../__tests__/session/fake-session-context';
import type { FakeSessionCtx } from '../__tests__/session/fake-session-context';
import type { SessionContext } from './session-context';
import type { BuildingDetailsResponse, RdoPacket } from '../../shared/types';
import { RdoVerb, RdoAction } from '../../shared/types';
import { TimeoutCategory } from '../../shared/timeout-categories';
import { RdoValue } from '../../shared/rdo-types';
import {
  registerInspectorTabs,
  clearInspectorTabsCache,
  HANDLER_TO_GROUP,
  PropertyType,
} from '../../shared/building-details';
import type { PropertyGroup } from '../../shared/building-details';

// ===========================================================================
// HARNESS
// ===========================================================================

const X = 118;
const Y = 226;
/** First id `cacherCreateObject` hands out — nothing else in a test equals it. */
const FIRST_TEMP = '900001';

/** Contexts that armed the module WeakMap and must be released afterwards. */
const armedContexts: SessionContext[] = [];

type DetailsCtxOptions = Partial<SessionContext> & { sockets?: string[] };

function makeDetailsCtx(overrides: DetailsCtxOptions = {}): FakeSessionCtx {
  const fake = makeSessionCtx({ sockets: ['map'], ...overrides });
  let next = 900001;
  fake.cacher.createObject.mockImplementation(async () => String(next++));
  // No business default: a test that depends on a property says so itself.
  fake.cacher.getPropertyList.mockResolvedValue([]);
  armedContexts.push(fake.ctx);
  return fake;
}

/** Answer `cacherGetPropertyList` from a name → value table, positionally. */
function cacheValues(fake: FakeSessionCtx, table: Record<string, string>): void {
  fake.cacher.getPropertyList.mockImplementation(
    async (_id: string, names: string[]) => names.map(n => table[n] ?? '')
  );
}

/** Answer `sendRdoRequest` from a member → payload table. */
function rdoMembers(fake: FakeSessionCtx, table: Record<string, string | Error>): void {
  fake.respond((packet) => table[packet.member ?? ''] ?? '');
}

type FocusMock = jest.MockedFunction<SessionContext['focusBuilding']>;
function focusReturns(fake: FakeSessionCtx, buildingId: string, buildingName = '', ownerName = ''): void {
  (fake.ctx.focusBuilding as FocusMock).mockResolvedValue({ buildingId, buildingName, ownerName });
}

/**
 * Register a data-driven template, as BuildingDataService does at startup from
 * CLASSES.BIN [InspectorInfo] (property-templates.ts:55).
 */
function registerTabs(visualClass: string, handlers: string[], className = 'Test Building'): void {
  registerInspectorTabs(
    visualClass,
    handlers.map(h => ({ tabName: h, tabHandler: h })),
    className,
  );
}

/**
 * A property group that no shipped template contains.
 *
 * `HANDLER_TO_GROUP` is the extension point CLASSES.BIN registration goes
 * through; injecting a key here is the only way to reach three code paths of
 * `fetchPropertiesAndGroups` that the handler supports but that none of the 36
 * shipped groups exercises: an indexed property carrying a `maxProperty`
 * (:784, :868-874) and an indexed property with no `countProperty` (:876-890).
 * The key is removed again in `afterEach`; no production file is touched.
 */
const PROBE_INDEXED_GROUP: PropertyGroup = {
  id: 'probeIndexed',
  name: 'Probe',
  icon: 'P',
  order: 0,
  properties: [
    // Counted + max: drives the `def.maxProperty` fetch and the paired read-back.
    {
      rdoName: 'prbVal', displayName: 'Value', type: PropertyType.NUMBER,
      indexed: true, countProperty: 'prbCount', maxProperty: 'prbMax',
    },
    // Counted, no max, sharing the same count: the second property must not
    // push the count value a second time.
    {
      rdoName: 'prbBare', displayName: 'Bare', type: PropertyType.NUMBER,
      indexed: true, countProperty: 'prbCount',
    },
    // Uncounted + columns: collected as a fixed 0-9 sweep, then read back by
    // the `else if (prop.indexed)` branch.
    {
      rdoName: 'prbFree', displayName: 'Free', type: PropertyType.NUMBER,
      indexed: true, maxProperty: 'prbFreeMax',
      columns: [
        { rdoSuffix: 'prbFree', label: 'F', type: PropertyType.NUMBER },
        { rdoSuffix: 'prbFreeMax', label: 'M', type: PropertyType.NUMBER },
      ],
    },
    // Uncounted, no max.
    {
      rdoName: 'prbLoose', displayName: 'Loose', type: PropertyType.NUMBER,
      indexed: true,
      columns: [{ rdoSuffix: 'prbLoose', label: 'L', type: PropertyType.NUMBER }],
    },
  ],
};

/**
 * A group carrying `CurrBlock`.
 *
 * FINDING (lot 3): `enrichVotesTab` (:930) reads `CurrBlock` out of the values
 * the template collected, but `CurrBlock` appears in exactly one shipped group
 * — GENERIC_GROUP (template-groups.ts:25) — and GENERIC_GROUP is reachable only
 * through the fallback GENERIC_TEMPLATE, which has no `votes` tab. No
 * CLASSES.BIN registration can therefore produce a template with both, so on
 * the shipped data the RDOVoteOf enrichment never fires. The probe group makes
 * the enrichment reachable so its wire form can still be pinned; the
 * "never fires" case is pinned separately, on the real town-hall template.
 */
const PROBE_BLOCK_GROUP: PropertyGroup = {
  id: 'probeBlock',
  name: 'Block',
  icon: '', // every shipped group names an icon; the fallback is defensive only
  order: 0,
  properties: [
    { rdoName: 'CurrBlock', displayName: 'Block ID', type: PropertyType.TEXT },
  ],
};

afterEach(() => {
  for (const ctx of armedContexts) releaseInspector(ctx);
  armedContexts.length = 0;
  clearInspectorTabsCache();
  delete HANDLER_TO_GROUP['probeIndexed'];
  delete HANDLER_TO_GROUP['probeBlock'];
  jest.restoreAllMocks();
});

// ===========================================================================
// computeWorkerCount / Semaphore — pure units, exported for exactly this
// ===========================================================================

describe('computeWorkerCount', () => {
  it('returns 1 for 1-3 slots', () => {
    expect(computeWorkerCount(1)).toBe(1);
    expect(computeWorkerCount(2)).toBe(1);
    expect(computeWorkerCount(3)).toBe(1);
  });

  it('returns 2 for 4-10 slots', () => {
    expect(computeWorkerCount(4)).toBe(2);
    expect(computeWorkerCount(7)).toBe(2);
    expect(computeWorkerCount(10)).toBe(2);
  });

  it('returns 3 for 11+ slots', () => {
    expect(computeWorkerCount(11)).toBe(3);
    expect(computeWorkerCount(20)).toBe(3);
    expect(computeWorkerCount(50)).toBe(3);
  });
});

describe('Semaphore', () => {
  it('allows up to N concurrent acquisitions', async () => {
    const sem = new Semaphore(3);
    const log: string[] = [];

    // Acquire 3 permits immediately (should not block)
    await sem.acquire(); log.push('a1');
    await sem.acquire(); log.push('a2');
    await sem.acquire(); log.push('a3');

    expect(log).toEqual(['a1', 'a2', 'a3']);
  });

  it('blocks the 4th acquisition until a release', async () => {
    const sem = new Semaphore(2);

    await sem.acquire();
    await sem.acquire();

    // 3rd acquire should block
    let thirdResolved = false;
    const thirdPromise = sem.acquire().then(() => { thirdResolved = true; });

    // Flush microtasks
    await Promise.resolve();
    expect(thirdResolved).toBe(false);

    // Release one permit — 3rd should now resolve
    sem.release();
    await thirdPromise;
    expect(thirdResolved).toBe(true);
  });

  it('processes waiting queue in FIFO order', async () => {
    const sem = new Semaphore(1);
    const log: string[] = [];

    await sem.acquire();

    // Queue up 3 waiters
    const p1 = sem.acquire().then(() => log.push('w1'));
    const p2 = sem.acquire().then(() => log.push('w2'));
    const p3 = sem.acquire().then(() => log.push('w3'));

    // Release one at a time
    sem.release();
    await p1;
    sem.release();
    await p2;
    sem.release();
    await p3;

    expect(log).toEqual(['w1', 'w2', 'w3']);
  });

  it('correctly recycles permits after release with no waiters', async () => {
    const sem = new Semaphore(2);

    await sem.acquire();
    await sem.acquire();
    sem.release();
    sem.release();

    // Should be able to acquire 2 more
    await sem.acquire();
    await sem.acquire();

    // 5th total should block
    let blocked = true;
    const p = sem.acquire().then(() => { blocked = false; });
    await Promise.resolve();
    expect(blocked).toBe(true);

    sem.release();
    await p;
    expect(blocked).toBe(false);
  });
});

// ===========================================================================
// ACTIVE INSPECTOR — the module WeakMap
// ===========================================================================

function makeInspector(over: Partial<ActiveInspector> = {}): ActiveInspector {
  return {
    tempObjectId: FIRST_TEMP,
    x: X,
    y: Y,
    visualClass: '4722',
    mutex: new AsyncMutex(),
    gateMap: '',
    hasSupplies: false,
    hasProducts: false,
    hasCompInputs: false,
    isWarehouse: false,
    ...over,
  };
}

describe('the active inspector registry', () => {
  it('hands back the inspector only for the coordinates it was opened on', () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector());

    expect(getActiveInspector(fake.ctx, X, Y)?.tempObjectId).toBe(FIRST_TEMP);
    expect(getActiveInspector(fake.ctx, X, Y + 1)).toBeUndefined();
    expect(getActiveInspector(fake.ctx, X + 1, Y)).toBeUndefined();
  });

  it('reports no inspector for a context that never opened one', () => {
    const fake = makeDetailsCtx();

    expect(getActiveInspector(fake.ctx, X, Y)).toBeUndefined();
    expect(getActiveInspectorTempObjectId(fake.ctx)).toBeUndefined();
  });

  // The cacher KeepAlive timer keep-alives the TCachedObjectWrap temp object,
  // not the TCacheServer root (ObjectInspectorHandleViewer.pas:1172-1180).
  it('exposes the temp object id the KeepAlive timer has to refresh', () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ tempObjectId: '900042' }));

    expect(getActiveInspectorTempObjectId(fake.ctx)).toBe('900042');
  });

  it('closes the Delphi temp object when the inspector is released', () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ tempObjectId: '900042' }));

    releaseInspector(fake.ctx);

    expect(fake.cacher.closeObject).toHaveBeenCalledWith('900042');
    expect(getActiveInspectorTempObjectId(fake.ctx)).toBeUndefined();
  });

  it('is a no-op when there is nothing to release', () => {
    const fake = makeDetailsCtx();

    releaseInspector(fake.ctx);

    expect(fake.cacher.closeObject).not.toHaveBeenCalled();
  });

  it('keeps two sessions apart — the WeakMap is keyed by context', () => {
    const a = makeDetailsCtx();
    const b = makeDetailsCtx();
    setActiveInspectorForTest(a.ctx, makeInspector({ tempObjectId: '900011' }));
    setActiveInspectorForTest(b.ctx, makeInspector({ tempObjectId: '900022' }));

    releaseInspector(a.ctx);

    expect(getActiveInspectorTempObjectId(a.ctx)).toBeUndefined();
    expect(getActiveInspectorTempObjectId(b.ctx)).toBe('900022');
  });
});

// ===========================================================================
// getBuildingBasicDetails — Phase 1+2 and the inspector it leaves behind
// ===========================================================================

describe('getBuildingBasicDetails', () => {
  it('threads one temp object through create → setObject → getPropertyList', async () => {
    const fake = makeDetailsCtx();
    registerTabs('4722', ['unkGeneral']);
    focusReturns(fake, '40133602', 'Supermarket', 'SPO_test3');
    cacheValues(fake, { Name: 'Supermarket', Cost: '$500K', ObjectId: '40133602' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '4722');

    expect(fake.cacher.createObject).toHaveBeenCalledTimes(1);
    expect(fake.cacher.setObject).toHaveBeenCalledWith(FIRST_TEMP, X, Y);
    for (const call of fake.cacher.getPropertyList.mock.calls) {
      expect(call[0]).toBe(FIRST_TEMP);
    }
    // The object stays OPEN: it is the inspector the tab requests will reuse.
    expect(fake.cacher.closeObject).not.toHaveBeenCalled();
    expect(getActiveInspectorTempObjectId(fake.ctx)).toBe(FIRST_TEMP);
    expect(details.x).toBe(X);
    expect(details.y).toBe(Y);
    expect(details.visualClass).toBe('4722');
  });

  it('releases a previous inspector before opening a new one, same building or not', async () => {
    const fake = makeDetailsCtx();
    registerTabs('4722', ['unkGeneral']);
    focusReturns(fake, '40133602');
    setActiveInspectorForTest(fake.ctx, makeInspector({ tempObjectId: '900999' }));

    await getBuildingBasicDetails(fake.ctx, X, Y, '4722');

    // Stale object closed first — otherwise the Delphi side leaks one wrap per
    // click on the same building.
    expect(fake.cacher.closeObject).toHaveBeenCalledWith('900999');
    expect(getActiveInspectorTempObjectId(fake.ctx)).toBe(FIRST_TEMP);
  });

  it('builds one tab entry per template group, in template order', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9001', ['IndGeneral', 'Workforce', 'facManagement'], 'Factory');
    focusReturns(fake, '40133602', 'Plant', 'SPO_test3');
    cacheValues(fake, { Name: 'Plant', Workers0: '120', UpgradeLevel: '2' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9001');

    expect(details.templateName).toBe('Factory');
    expect(details.tabs.map(t => t.id)).toEqual(['indGeneral', 'workforce', 'upgrade']);
    expect(details.tabs.map(t => t.handlerName)).toEqual(['IndGeneral', 'Workforce', 'facManagement']);
    expect(details.tabs[0].order).toBe(0);
    expect(details.tabs[1].order).toBe(10);
  });

  it('prefers the focused building id, then ObjectId, then CurrBlock', async () => {
    // An unregistered visual class falls back to GENERIC_TEMPLATE, the only
    // template whose group carries ObjectId and CurrBlock at all.
    const VC = 'unregistered';

    const focused = makeDetailsCtx();
    focusReturns(focused, '40133602');
    cacheValues(focused, { ObjectId: '40133777', CurrBlock: '40133888' });
    expect((await getBuildingBasicDetails(focused.ctx, X, Y, VC)).buildingId).toBe('40133602');

    const noFocus = makeDetailsCtx();
    focusReturns(noFocus, '');
    cacheValues(noFocus, { ObjectId: '40133777', CurrBlock: '40133888' });
    expect((await getBuildingBasicDetails(noFocus.ctx, X, Y, VC)).buildingId).toBe('40133777');

    const blockOnly = makeDetailsCtx();
    focusReturns(blockOnly, '');
    cacheValues(blockOnly, { CurrBlock: '40133888' });
    expect((await getBuildingBasicDetails(blockOnly.ctx, X, Y, VC)).buildingId).toBe('40133888');

    const nothing = makeDetailsCtx();
    focusReturns(nothing, '');
    nothing.cacher.getPropertyList.mockResolvedValue([]); // server answered nothing
    expect((await getBuildingBasicDetails(nothing.ctx, X, Y, VC)).buildingId).toBe('');
  });

  it('keeps going when the focus call fails — the inspector is still usable', async () => {
    const fake = makeDetailsCtx();
    (fake.ctx.focusBuilding as FocusMock).mockRejectedValue(new Error('SwitchFocusEx timeout'));
    cacheValues(fake, { CurrBlock: '40133888', SecurityId: '77' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, 'unregistered');

    expect(details.buildingName).toBe('');
    expect(details.ownerName).toBe('');
    expect(details.securityId).toBe('77');
    expect(fake.log.warn).toHaveBeenCalled();
  });

  it('refuses to open an inspector before the map service is initialised', async () => {
    const fake = makeDetailsCtx({ cacherId: null });
    registerTabs('4722', ['unkGeneral']);
    focusReturns(fake, '40133602');

    await expect(getBuildingBasicDetails(fake.ctx, X, Y, '4722')).rejects.toThrow(
      'Map service not initialized'
    );
    expect(fake.cacher.createObject).not.toHaveBeenCalled();
  });

  it('closes the temp object and forgets the inspector when a phase fails', async () => {
    const fake = makeDetailsCtx();
    registerTabs('4722', ['unkGeneral']);
    focusReturns(fake, '40133602');
    fake.cacher.getPropertyList.mockRejectedValue(new Error('Request timeout: GetPropertyList'));

    await expect(getBuildingBasicDetails(fake.ctx, X, Y, '4722')).rejects.toThrow('Request timeout');

    expect(fake.cacher.closeObject).toHaveBeenCalledWith(FIRST_TEMP);
    expect(getActiveInspectorTempObjectId(fake.ctx)).toBeUndefined();
  });

  it('leaves the heavy tabs unfetched — that is what makes it the lazy path', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9002', ['IndGeneral', 'Supplies', 'Products', 'compInputs']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { Name: 'Plant' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9002');

    expect(details.supplies).toBeUndefined();
    expect(details.products).toBeUndefined();
    expect(details.compInputs).toBeUndefined();
    // No GetInputNames / GetOutputNames went out.
    expect(fake.sent).toEqual([]);
    // …but the inspector knows which lazy tabs exist.
    const inspector = getActiveInspector(fake.ctx, X, Y);
    expect(inspector?.hasSupplies).toBe(true);
    expect(inspector?.hasProducts).toBe(true);
    expect(inspector?.hasCompInputs).toBe(true);
  });

  describe('warehouses', () => {
    it('fetches the ware names eagerly and pairs them with the GateMap bits', async () => {
      const fake = makeDetailsCtx();
      registerTabs('7001', ['WHGeneral']);
      focusReturns(fake, '40133602');
      cacheValues(fake, {
        GateMap: '101',
        InputCount: '3',
        'Input0.0': 'Books',
        'Input1.0': 'Cars',
        'Input2.0': 'Fresh Food',
      });

      const details = await getBuildingBasicDetails(fake.ctx, X, Y, '7001');

      // Kernel.pas:5840-5854 — WriteString('Input' + i + '.', MetaFluid.Name_MLS)
      expect(details.warehouseWares).toEqual([
        { name: 'Books', enabled: true, index: 0 },
        { name: 'Cars', enabled: false, index: 1 },
        { name: 'Fresh Food', enabled: true, index: 2 },
      ]);
      expect(getActiveInspector(fake.ctx, X, Y)?.gateMap).toBe('101');
    });

    it('names a gate "Ware N" when the cache holds no MLS name, and disables it past the GateMap', async () => {
      const fake = makeDetailsCtx();
      registerTabs('7001', ['WHGeneral']);
      focusReturns(fake, '40133602');
      cacheValues(fake, { GateMap: '1', InputCount: '2', 'Input0.0': 'Books' });

      const details = await getBuildingBasicDetails(fake.ctx, X, Y, '7001');

      expect(details.warehouseWares).toEqual([
        { name: 'Books', enabled: true, index: 0 },
        { name: 'Ware 1', enabled: false, index: 1 },
      ]);
    });

    it('skips the ware fetch when InputCount is absent or absurd', async () => {
      for (const inputCount of ['0', '51']) {
        const fake = makeDetailsCtx();
        registerTabs('7001', ['WHGeneral']);
        focusReturns(fake, '40133602');
        cacheValues(fake, { GateMap: '111', InputCount: inputCount });

        const details = await getBuildingBasicDetails(fake.ctx, X, Y, '7001');

        expect(details.warehouseWares).toEqual([]);
      }
    });

    it('treats an unreadable GateMap as no gates enabled', async () => {
      const fake = makeDetailsCtx();
      registerTabs('7001', ['WHGeneral']);
      focusReturns(fake, '40133602');
      // 'error' means the cache could not read it — the name is dropped, so the
      // GateMap is absent rather than empty.
      cacheValues(fake, { GateMap: 'error', InputCount: '2', 'Input0.0': 'Books' });

      const details = await getBuildingBasicDetails(fake.ctx, X, Y, '7001');

      expect(details.warehouseWares).toEqual([
        { name: 'Books', enabled: false, index: 0 },
        { name: 'Ware 1', enabled: false, index: 1 },
      ]);
      expect(getActiveInspector(fake.ctx, X, Y)?.gateMap).toBe('');
    });

    it('reads no wares when InputCount comes back empty', async () => {
      const fake = makeDetailsCtx();
      registerTabs('7001', ['WHGeneral']);
      focusReturns(fake, '40133602');
      cacheValues(fake, { GateMap: '11' }); // InputCount answers ''

      const details = await getBuildingBasicDetails(fake.ctx, X, Y, '7001');

      expect(details.warehouseWares).toEqual([]);
    });

    it('degrades to no wares when the ware read fails', async () => {
      const fake = makeDetailsCtx();
      registerTabs('7001', ['WHGeneral']);
      focusReturns(fake, '40133602');
      let call = 0;
      fake.cacher.getPropertyList.mockImplementation(async (_id: string, names: string[]) => {
        call++;
        if (names[0] === 'InputCount') throw new Error('Request timeout: GetPropertyList');
        return names.map(n => (n === 'GateMap' ? '11' : ''));
      });

      const details = await getBuildingBasicDetails(fake.ctx, X, Y, '7001');

      expect(call).toBeGreaterThan(1);
      expect(details.warehouseWares).toEqual([]);
      expect(fake.log.warn).toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// fetchPropertiesAndGroups — driven through getBuildingBasicDetails
// ===========================================================================

describe('property collection and grouping', () => {
  it('splits phase 1 into batches of 50 properties', async () => {
    const fake = makeDetailsCtx();
    // ResGeneral (20) + Workforce (24) + facManagement (8) + townJobs (18) — over 50.
    registerTabs('9003', ['ResGeneral', 'Workforce', 'facManagement', 'townJobs']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { Name: 'Tower' });

    await getBuildingBasicDetails(fake.ctx, X, Y, '9003');

    const batches = fake.cacher.getPropertyList.mock.calls;
    expect(batches.length).toBeGreaterThan(1);
    for (const [, names] of batches) expect(names.length).toBeLessThanOrEqual(50);
  });

  it('drops a property the cache answered "error" for', async () => {
    const fake = makeDetailsCtx();
    registerTabs('4722', ['unkGeneral']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { Name: 'Shop', Creator: 'error', Cost: '$500K' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '4722');

    const names = details.groups['unkGeneral'].map(v => v.name);
    expect(names).toContain('Name');
    expect(names).toContain('Cost');
    expect(names).not.toContain('Creator');
  });

  it('tolerates a short response — the missing tail reads as empty', async () => {
    const fake = makeDetailsCtx();
    registerTabs('4722', ['unkGeneral']);
    focusReturns(fake, '40133602');
    // One value for a batch of many: everything after index 0 is absent.
    fake.cacher.getPropertyList.mockResolvedValue(['Shop']);

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '4722');

    expect(details.groups['unkGeneral'][0]).toEqual({ name: 'Name', value: 'Shop' });
  });

  it('expands a counted table into per-index columns and keeps the count itself', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9004', ['BankLoans']);
    focusReturns(fake, '40133602');
    cacheValues(fake, {
      LoanCount: '2',
      Debtor0: 'SPO_test3', Amount0: '$1,000K', Interest0: '5%', Term0: '10',
      Debtor1: 'Fred', Amount1: '$250K', Interest1: '7%', Term1: '4',
    });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9004');

    const loans = details.groups['bankLoans'];
    expect(loans[0]).toEqual({ name: 'LoanCount', value: '2' });
    expect(loans).toContainEqual({ name: 'Debtor1', value: 'Fred', index: 1 });
    expect(loans).toContainEqual({ name: 'Term0', value: '10', index: 0 });
    // Index 2 was never requested — the count decides how far the sweep goes.
    expect(loans.some(v => v.name === 'Debtor2')).toBe(false);
  });

  it('applies a per-column index suffix where the column overrides the property one', async () => {
    const fake = makeDetailsCtx();
    // townGeneral: covName has indexSuffix '.0'; the covValue column overrides it to ''.
    registerTabs('9005', ['townGeneral']);
    focusReturns(fake, '40133602');
    cacheValues(fake, {
      covCount: '1',
      'covName0.0': 'Schools',
      covValue0: '87%',
      ActualRuler: 'SPO_test3',
    });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9005');

    const town = details.groups['townGeneral'];
    expect(town).toContainEqual({ name: 'covName0.0', value: 'Schools', index: 0 });
    expect(town).toContainEqual({ name: 'covValue0', value: '87%', index: 0 });
  });

  it('logs the service table rows it reads back', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9006', ['SrvGeneral']);
    focusReturns(fake, '40133602');
    cacheValues(fake, {
      ServiceCount: '1',
      'srvNames0.0': 'Groceries',
      srvPrices0: '100',
      srvSupplies0: '50',
    });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9006');

    expect(details.groups['srvGeneral']).toContainEqual({ name: 'srvNames0.0', value: 'Groceries', index: 0 });
    // Indexed `srv*` reads are traced individually (:801-803).
    expect(fake.log.debug).toHaveBeenCalledWith(expect.stringContaining('TABLE: srvNames0.0'));
  });

  it('warns about an implausible count but still fetches it', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9004', ['BankLoans']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { LoanCount: '60' });

    await getBuildingBasicDetails(fake.ctx, X, Y, '9004');

    expect(fake.log.warn).toHaveBeenCalledWith(expect.stringContaining('Unusually high count'));
    // 60 rows x 4 columns = 240 indexed properties, batched by 50.
    const indexedBatches = fake.cacher.getPropertyList.mock.calls.filter(
      ([, names]) => names[0].startsWith('Debtor')
    );
    expect(indexedBatches.length).toBeGreaterThan(1);
  });

  it('treats an absent count as zero and issues no indexed read at all', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9004', ['BankLoans']);
    focusReturns(fake, '40133602');
    cacheValues(fake, {}); // the cache answers every name with an empty string

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9004');

    // One batch for LoanCount, and nothing after it: no count, no rows.
    expect(fake.cacher.getPropertyList).toHaveBeenCalledTimes(1);
    expect(details.groups['bankLoans']).toEqual([{ name: 'LoanCount', value: '' }]);
  });

  it('pairs a plain property with its max property', async () => {
    const fake = makeDetailsCtx();
    // ResGeneral's Repair/RepairPrice is the only such pairing in the templates.
    registerTabs('9007', ['ResGeneral']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { Repair: '40', RepairPrice: '$12K' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9007');

    const res = details.groups['resGeneral'];
    expect(res).toContainEqual({ name: 'Repair', value: '40' });
    expect(res).toContainEqual({ name: 'RepairPrice', value: '$12K' });
  });

  it('emits the three workforce rows as a flat indexed list', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9008', ['Workforce']);
    focusReturns(fake, '40133602');
    cacheValues(fake, {
      Workers0: '10', WorkersMax0: '20', WorkersK0: '80', Salaries0: '100', WorkForcePrice0: '5',
      Workers1: '4', WorkersMax1: '8',
      Workers2: '0',
    });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9008');

    const wf = details.groups['workforce'];
    expect(wf).toContainEqual({ name: 'Workers0', value: '10', index: 0 });
    expect(wf).toContainEqual({ name: 'WorkForcePrice0', value: '5', index: 0 });
    expect(wf).toContainEqual({ name: 'WorkersMax1', value: '8', index: 1 });
    expect(wf).toContainEqual({ name: 'Workers2', value: '0', index: 2 });
    // Five names per class, three classes, in class order — the Delphi cache
    // answers every requested name, empty when it holds nothing.
    expect(wf).toHaveLength(15);
    expect(wf.slice(0, 5).map(v => v.name)).toEqual([
      'Workers0', 'WorkersMax0', 'WorkersK0', 'Salaries0', 'WorkForcePrice0',
    ]);
    expect(wf).toContainEqual({ name: 'WorkersK1', value: '', index: 1 });
  });

  it('omits a group that declares no cache-backed property', async () => {
    const fake = makeDetailsCtx();
    // The compInputs tab is a pure lazy handler: ADVERTISEMENT_GROUP has an
    // empty property list, so it contributes a tab but never a group.
    registerTabs('9021', ['compInputs']);
    focusReturns(fake, '40133602');
    cacheValues(fake, {});

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9021');

    expect(details.tabs.map(t => t.id)).toEqual(['advertisement']);
    expect(details.groups).toEqual({});
  });

  // These two shapes are supported by the handler but appear in none of the 36
  // shipped groups; the probe group registers them the way CLASSES.BIN would.
  it('fetches and pairs the max property of a counted indexed property', async () => {
    const fake = makeDetailsCtx();
    HANDLER_TO_GROUP['probeIndexed'] = PROBE_INDEXED_GROUP;
    registerTabs('9009', ['probeIndexed']);
    focusReturns(fake, '40133602');
    cacheValues(fake, {
      prbCount: '2',
      prbVal0: '3', prbMax0: '9',
      prbVal1: '4', prbMax1: '8',
      prbFree0: '1', prbFreeMax0: '2',
    });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9009');

    const probe = details.groups['probeIndexed'];
    expect(probe).toContainEqual({ name: 'prbVal1', value: '4', index: 1 });
    expect(probe).toContainEqual({ name: 'prbMax1', value: '8', index: 1 });
    // The count stops the counted sweep at 2 — index 2 was never requested.
    expect(probe.some(v => v.name === 'prbVal2')).toBe(false);
    // The uncounted property is swept over a fixed 0-9 range instead.
    expect(probe).toContainEqual({ name: 'prbFree0', value: '1', index: 0 });
    expect(probe).toContainEqual({ name: 'prbFreeMax0', value: '2', index: 0 });
    expect(probe).toContainEqual({ name: 'prbFree9', value: '', index: 9 });
  });

  // The Delphi cache answers 'error' for a property it cannot read. Those names
  // are dropped from the value map rather than stored, which is the only way a
  // group can end up asking for a value that is genuinely absent.
  describe('properties the cache answered "error" for', () => {
    it('omits an erroring count, so its table shows no rows at all', async () => {
      const fake = makeDetailsCtx();
      registerTabs('9004', ['BankLoans']);
      focusReturns(fake, '40133602');
      cacheValues(fake, { LoanCount: 'error' });

      const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9004');

      expect(details.groups['bankLoans']).toBeUndefined();
    });

    it('omits an erroring cell but keeps the rest of the row', async () => {
      const fake = makeDetailsCtx();
      registerTabs('9004', ['BankLoans']);
      focusReturns(fake, '40133602');
      cacheValues(fake, { LoanCount: '1', Debtor0: 'error', Amount0: '$1,000K' });

      const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9004');

      const loans = details.groups['bankLoans'];
      expect(loans.some(v => v.name === 'Debtor0')).toBe(false);
      expect(loans).toContainEqual({ name: 'Amount0', value: '$1,000K', index: 0 });
    });

    it('reads a non-numeric count as zero rows', async () => {
      const fake = makeDetailsCtx();
      registerTabs('9004', ['BankLoans']);
      focusReturns(fake, '40133602');
      cacheValues(fake, { LoanCount: 'plenty' });

      const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9004');

      expect(details.groups['bankLoans']).toEqual([{ name: 'LoanCount', value: 'plenty' }]);
    });

    it('omits an erroring max property while keeping its base value', async () => {
      const fake = makeDetailsCtx();
      registerTabs('9007', ['ResGeneral']);
      focusReturns(fake, '40133602');
      cacheValues(fake, { Repair: '40', RepairPrice: 'error' });

      const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9007');

      const res = details.groups['resGeneral'];
      expect(res).toContainEqual({ name: 'Repair', value: '40' });
      expect(res.some(v => v.name === 'RepairPrice')).toBe(false);
    });

    it('omits erroring cells across every indexed shape at once', async () => {
      const fake = makeDetailsCtx();
      HANDLER_TO_GROUP['probeIndexed'] = PROBE_INDEXED_GROUP;
      registerTabs('9022', ['probeIndexed']);
      focusReturns(fake, '40133602');
      cacheValues(fake, {
        prbCount: '2',
        prbVal0: 'error', prbMax0: '9',
        prbVal1: '4', prbMax1: 'error',
        prbBare0: '1',
        prbFree0: '1', prbFreeMax0: 'error',
        prbFree3: 'error',
        prbLoose0: '7',
      });

      const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9022');
      const names = details.groups['probeIndexed'].map(v => v.name);

      expect(names).not.toContain('prbVal0');
      expect(names).not.toContain('prbMax1');
      expect(names).not.toContain('prbFreeMax0');
      expect(names).not.toContain('prbFree3');
      // The shared count is pushed once, by the first property that needs it.
      expect(names.filter(n => n === 'prbCount')).toHaveLength(1);
      expect(names).toContain('prbBare1');
      expect(names).toContain('prbLoose0');
    });

    it('omits an erroring count of an indexed property, and reads no rows', async () => {
      const fake = makeDetailsCtx();
      HANDLER_TO_GROUP['probeIndexed'] = PROBE_INDEXED_GROUP;
      registerTabs('9025', ['probeIndexed']);
      focusReturns(fake, '40133602');
      cacheValues(fake, { prbCount: 'error', prbLoose0: '7' });

      const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9025');
      const names = details.groups['probeIndexed'].map(v => v.name);

      expect(names).not.toContain('prbCount');
      expect(names).not.toContain('prbVal0');
      expect(names).toContain('prbLoose0');
    });

    it('reads a non-numeric count of an indexed property as zero rows', async () => {
      const fake = makeDetailsCtx();
      HANDLER_TO_GROUP['probeIndexed'] = PROBE_INDEXED_GROUP;
      registerTabs('9026', ['probeIndexed']);
      focusReturns(fake, '40133602');
      cacheValues(fake, { prbCount: 'lots' });

      const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9026');
      const names = details.groups['probeIndexed'].map(v => v.name);

      expect(names).toContain('prbCount');
      expect(names).not.toContain('prbVal0');
    });

    it('drops an erroring value out of an indexed batch response', async () => {
      const fake = makeDetailsCtx();
      registerTabs('9006', ['SrvGeneral']);
      focusReturns(fake, '40133602');
      // Phase 2 asks for the srv* columns; the first batch comes back short.
      fake.cacher.getPropertyList.mockImplementation(async (_id: string, names: string[]) => {
        if (names.includes('ServiceCount')) return names.map(n => (n === 'ServiceCount' ? '1' : ''));
        return ['error']; // one value for six names
      });

      const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9006');

      const srv = details.groups['srvGeneral'].map(v => v.name);
      expect(srv).not.toContain('srvNames0.0');
      // The names after the short tail read as empty strings, so they survive.
      expect(srv).toContain('srvPrices0');
    });
  });

  it('parses MoneyGraphInfo into the revenue series, skipping the leading count', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9010', ['Chart']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { MoneyGraphInfo: '4,1200,-350,0,987.5' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9010');

    expect(details.moneyGraph).toEqual([1200, -350, 0, 987.5]);
  });

  it('drops non-numeric samples out of the revenue series', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9010', ['Chart']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { MoneyGraphInfo: '3,100,n/a,300' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9010');

    expect(details.moneyGraph).toEqual([100, 300]);
  });

  it('returns an empty series for a graph string with no samples', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9010', ['Chart']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { MoneyGraphInfo: '0' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9010');

    expect(details.moneyGraph).toEqual([]);
  });

  it('leaves the graph undefined when the property is absent', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9010', ['Chart']);
    focusReturns(fake, '40133602');
    cacheValues(fake, {});

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9010');

    expect(details.moneyGraph).toBeUndefined();
  });
});

// ===========================================================================
// enrichVotesTab — the one RDO call the property phase makes
// ===========================================================================

describe('votes enrichment', () => {
  /**
   * townGeneral auto-injects the Votes tab (property-templates.ts:102-110); the
   * probe group supplies the `CurrBlock` the enrichment needs and that no
   * shipped group pairs with a votes tab — see PROBE_BLOCK_GROUP above.
   */
  function makeVotesCtx(over: DetailsCtxOptions = {}): FakeSessionCtx {
    const fake = makeDetailsCtx({ activeUsername: 'SPO_test3', ...over });
    HANDLER_TO_GROUP['probeBlock'] = PROBE_BLOCK_GROUP;
    registerTabs('9011', ['townGeneral', 'probeBlock']);
    focusReturns(fake, '40133602');
    return fake;
  }

  // The reason the enrichment exists — and the reason it never runs in
  // production. Pinned on the real registration, with no probe group.
  it('never fires on a real town hall: no shipped template carries CurrBlock', async () => {
    const fake = makeDetailsCtx({ activeUsername: 'SPO_test3' });
    registerTabs('9020', ['townGeneral']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { ActualRuler: 'Fred', RulerName: 'Fred', CurrBlock: '40133888' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9020');

    // The votes tab is built…
    expect(details.groups['votes']).toBeDefined();
    // …but CurrBlock is never among the names asked for, so the guard at :932
    // returns early and RDOVoteOf is never sent.
    const asked = fake.cacher.getPropertyList.mock.calls.flatMap(([, names]) => names);
    expect(asked).not.toContain('CurrBlock');
    expect(fake.sent).toEqual([]);
    expect(details.groups['votes'].some(v => v.name === 'VoteOf')).toBe(false);
  });

  it('asks RDOVoteOf on CurrBlock and appends the answer to the votes tab', async () => {
    const fake = makeVotesCtx();
    cacheValues(fake, { CurrBlock: '40133888', RulerName: 'Fred', RulerVotes: '120' });
    rdoMembers(fake, { RDOVoteOf: 'res="%Fred"' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9011');

    expect(fake.sent).toHaveLength(1);
    const [{ packet, socketName, category }] = fake.sent;
    expect(socketName).toBe('construction');
    expect(packet.verb).toBe(RdoVerb.SEL);
    // The vote is cast on the town-hall BLOCK, not on the inspector temp object.
    expect(packet.targetId).toBe('40133888');
    expect(packet.action).toBe(RdoAction.CALL);
    expect(packet.member).toBe('RDOVoteOf');
    expect(packet.separator).toBe('"^"');
    expect(packet.args).toEqual([RdoValue.string('SPO_test3').format()]);
    expect(category).toBe(TimeoutCategory.NORMAL);
    expect(details.groups['votes']).toContainEqual({ name: 'VoteOf', value: 'Fred' });
  });

  it('connects the construction service first when its socket is down', async () => {
    const fake = makeVotesCtx();
    // No 'construction' socket declared → getSocket returns undefined.
    cacheValues(fake, { CurrBlock: '40133888', RulerName: 'Fred' });
    rdoMembers(fake, { RDOVoteOf: 'res="%Fred"' });

    await getBuildingBasicDetails(fake.ctx, X, Y, '9011');

    expect(fake.ctx.connectConstructionService).toHaveBeenCalled();
  });

  it('does not reconnect when the construction socket is already up', async () => {
    const fake = makeVotesCtx({ sockets: ['map', 'construction'] });
    cacheValues(fake, { CurrBlock: '40133888', RulerName: 'Fred' });
    rdoMembers(fake, { RDOVoteOf: 'res="%Fred"' });

    await getBuildingBasicDetails(fake.ctx, X, Y, '9011');

    expect(fake.ctx.connectConstructionService).not.toHaveBeenCalled();
  });

  it('falls back to the cached username when no active one is set', async () => {
    const fake = makeVotesCtx({ activeUsername: null, cachedUsername: 'CachedGuy' });
    cacheValues(fake, { CurrBlock: '40133888', RulerName: 'Fred' });
    rdoMembers(fake, { RDOVoteOf: 'res="%Fred"' });

    await getBuildingBasicDetails(fake.ctx, X, Y, '9011');

    expect(fake.sent[0].packet.args).toEqual([RdoValue.string('CachedGuy').format()]);
  });

  it('skips the enrichment when the block id is unknown', async () => {
    const fake = makeVotesCtx();
    cacheValues(fake, { RulerName: 'Fred' }); // no CurrBlock

    await getBuildingBasicDetails(fake.ctx, X, Y, '9011');

    expect(fake.sent).toEqual([]);
  });

  it('skips the enrichment when no username is known', async () => {
    const fake = makeVotesCtx({ activeUsername: null, cachedUsername: null });
    cacheValues(fake, { CurrBlock: '40133888', RulerName: 'Fred' });

    await getBuildingBasicDetails(fake.ctx, X, Y, '9011');

    expect(fake.sent).toEqual([]);
  });

  it('skips the enrichment entirely when the template has no votes tab', async () => {
    const fake = makeDetailsCtx({ activeUsername: 'SPO_test3' });
    focusReturns(fake, '40133602');
    cacheValues(fake, { CurrBlock: '40133888', Name: 'Shop' });

    // GENERIC_TEMPLATE does collect CurrBlock, but it has no votes group.
    await getBuildingBasicDetails(fake.ctx, X, Y, 'unregistered');

    expect(fake.sent).toEqual([]);
  });

  it('leaves the tab alone when the server returns no vote', async () => {
    const fake = makeVotesCtx();
    cacheValues(fake, { CurrBlock: '40133888', RulerName: 'Fred' });
    rdoMembers(fake, { RDOVoteOf: 'res="%"' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9011');

    expect(details.groups['votes'].some(v => v.name === 'VoteOf')).toBe(false);
  });

  it('leaves the tab alone when the reply carries no payload at all', async () => {
    const fake = makeVotesCtx();
    cacheValues(fake, { CurrBlock: '40133888', RulerName: 'Fred' });
    const noPayload: RdoPacket = { raw: '', type: 'RESPONSE', rid: 3 };
    fake.respond(() => noPayload);

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9011');

    expect(details.groups['votes'].some(v => v.name === 'VoteOf')).toBe(false);
  });

  it('swallows a failed RDOVoteOf — the rest of the sheet still renders', async () => {
    const fake = makeVotesCtx();
    cacheValues(fake, { CurrBlock: '40133888', RulerName: 'Fred' });
    fake.respond(() => new Error('Request timeout: RDOVoteOf'));

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9011');

    expect(details.groups['votes']).toBeDefined();
    expect(fake.log.debug).toHaveBeenCalledWith(expect.stringContaining('VoteOf enrichment failed'));
  });
});

// ===========================================================================
// getBuildingDetails — the legacy full fetch and its in-flight dedup
// ===========================================================================

describe('getBuildingDetails', () => {
  /** A context whose in-flight map behaves like the session's real one. */
  function withInFlightMap(fake: FakeSessionCtx): Map<string, Promise<BuildingDetailsResponse>> {
    const map = new Map<string, Promise<BuildingDetailsResponse>>();
    Object.assign(fake.ctx, {
      getInFlightBuildingDetails: jest.fn((k: string) => map.get(k)),
      setInFlightBuildingDetails: jest.fn((k: string, p: Promise<BuildingDetailsResponse>) => { map.set(k, p); }),
      deleteInFlightBuildingDetails: jest.fn((k: string) => { map.delete(k); }),
    });
    return map;
  }

  it('runs one RDO sequence for two concurrent requests on the same tile', async () => {
    const fake = makeDetailsCtx();
    withInFlightMap(fake);
    registerTabs('4722', ['unkGeneral']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { Name: 'Shop' });

    const [first, second] = await Promise.all([
      getBuildingDetails(fake.ctx, X, Y, '4722'),
      getBuildingDetails(fake.ctx, X, Y, '4722'),
    ]);

    // What matters is the call count, not the value: a second sequence would
    // create a second Delphi temp object for the same building.
    expect(fake.cacher.createObject).toHaveBeenCalledTimes(1);
    expect(first).toBe(second); // literally the same promise result
    expect(fake.log.debug).toHaveBeenCalledWith(expect.stringContaining('Dedup hit'));
  });

  it('keys the dedup by coordinates, so a second tile still goes out', async () => {
    const fake = makeDetailsCtx();
    withInFlightMap(fake);
    registerTabs('4722', ['unkGeneral']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { Name: 'Shop' });

    await Promise.all([
      getBuildingDetails(fake.ctx, X, Y, '4722'),
      getBuildingDetails(fake.ctx, X + 1, Y, '4722'),
    ]);

    expect(fake.cacher.createObject).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight entry once settled, so a later request refetches', async () => {
    const fake = makeDetailsCtx();
    const map = withInFlightMap(fake);
    registerTabs('4722', ['unkGeneral']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { Name: 'Shop' });

    await getBuildingDetails(fake.ctx, X, Y, '4722');
    expect(map.size).toBe(0);

    await getBuildingDetails(fake.ctx, X, Y, '4722');
    expect(fake.cacher.createObject).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight entry when the fetch fails', async () => {
    const fake = makeDetailsCtx({ cacherId: null });
    const map = withInFlightMap(fake);
    registerTabs('4722', ['unkGeneral']);
    focusReturns(fake, '40133602');

    await expect(getBuildingDetails(fake.ctx, X, Y, '4722')).rejects.toThrow(
      'Map service not initialized'
    );
    expect(map.size).toBe(0);
  });

  it('closes the temp object when the full fetch is done', async () => {
    const fake = makeDetailsCtx();
    withInFlightMap(fake);
    registerTabs('4722', ['unkGeneral']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { Name: 'Shop' });

    await getBuildingDetails(fake.ctx, X, Y, '4722');

    // Unlike the lazy path this one owns the object and hands it back.
    expect(fake.cacher.closeObject).toHaveBeenCalledWith(FIRST_TEMP);
    expect(getActiveInspectorTempObjectId(fake.ctx)).toBeUndefined();
  });

  it('keeps going when the focus call fails', async () => {
    const fake = makeDetailsCtx();
    withInFlightMap(fake);
    (fake.ctx.focusBuilding as FocusMock).mockRejectedValue(new Error('busy'));
    cacheValues(fake, { CurrBlock: '40133888' });

    const details = await getBuildingDetails(fake.ctx, X, Y, 'unregistered');

    expect(details.buildingId).toBe('40133888');
    expect(fake.log.warn).toHaveBeenCalled();
  });

  it('fetches supplies, products, company inputs and wares in one shot', async () => {
    const fake = makeDetailsCtx();
    withInFlightMap(fake);
    registerTabs('9012', ['WHGeneral', 'Supplies', 'Products', 'compInputs']);
    focusReturns(fake, '40133602');
    cacheValues(fake, {
      GateMap: '11', InputCount: '2', 'Input0.0': 'Books', 'Input1.0': 'Cars',
      cInputCount: '1',
      'cInput0.0': 'Advertising', cInputSup0: '12.5', cInputDem0: '20', cInputRatio0: '62',
      cInputMax0: '100', cEditable0: 'yes', 'cUnits0.0': 'units',
      MetaFluid: 'Books', FluidValue: '120', cnxCount: '0',
      LastFluid: '80', FluidQuality: '90%', PricePc: '100', AvgPrice: '$4', MarketPrice: '$5',
    });
    fake.respond((packet) => {
      switch (packet.member) {
        case 'GetInputNames': return 'res="%Segment0::\nBooks"';
        case 'GetOutputNames': return 'res="%Gate0::\nCars"';
        case 'SetPath': return 'res="#-1"';
        default: return '';
      }
    });

    const details = await getBuildingDetails(fake.ctx, X, Y, '9012');

    expect(details.supplies).toHaveLength(1);
    expect(details.supplies?.[0]).toMatchObject({ path: 'Segment0', name: 'Books', metaFluid: 'Books' });
    expect(details.products).toHaveLength(1);
    expect(details.products?.[0]).toMatchObject({ path: 'Gate0', name: 'Cars', lastFluid: '80' });
    expect(details.compInputs).toEqual([{
      name: 'Advertising', supplied: 12.5, demanded: 20, ratio: 62,
      maxDemand: 100, editable: true, units: 'units',
    }]);
    expect(details.warehouseWares).toHaveLength(2);
  });

  it('reports an empty building id when nothing identifies the building', async () => {
    const fake = makeDetailsCtx();
    withInFlightMap(fake);
    HANDLER_TO_GROUP['probeBlock'] = PROBE_BLOCK_GROUP;
    // unkGeneral collects neither ObjectId nor CurrBlock; the probe group also
    // has no icon, which is the other fallback on this path.
    registerTabs('9023', ['unkGeneral', 'probeBlock']);
    focusReturns(fake, '');
    cacheValues(fake, { Name: 'Shop', CurrBlock: 'error' });

    const details = await getBuildingDetails(fake.ctx, X, Y, '9023');

    expect(details.buildingId).toBe('');
    expect(details.tabs.find(t => t.id === 'probeBlock')?.icon).toBe('');
  });

  it('reads a warehouse with an unreadable GateMap on the legacy path', async () => {
    const fake = makeDetailsCtx();
    withInFlightMap(fake);
    registerTabs('7001', ['WHGeneral']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { GateMap: 'error', InputCount: '1', 'Input0.0': 'Books' });

    const details = await getBuildingDetails(fake.ctx, X, Y, '7001');

    expect(details.warehouseWares).toEqual([{ name: 'Books', enabled: false, index: 0 }]);
  });

  it('drops the gates whose SetPath was refused on the legacy path too', async () => {
    const fake = makeDetailsCtx();
    withInFlightMap(fake);
    registerTabs('9024', ['Supplies', 'Products']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { MetaFluid: 'X', cnxCount: '0' });
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return 'res="%A::\nBooks"';
      if (packet.member === 'GetOutputNames') return 'res="%B::\nCars"';
      if (packet.member === 'SetPath') return 'res="#0"'; // WordBool FALSE
      return '';
    });

    const details = await getBuildingDetails(fake.ctx, X, Y, '9024');

    expect(details.supplies).toEqual([]);
    expect(details.products).toEqual([]);
  });

  it('leaves the lazy fields undefined when the template declares no such tab', async () => {
    const fake = makeDetailsCtx();
    withInFlightMap(fake);
    registerTabs('4722', ['unkGeneral']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { Name: 'Shop' });

    const details = await getBuildingDetails(fake.ctx, X, Y, '4722');

    expect(details.supplies).toBeUndefined();
    expect(details.products).toBeUndefined();
    expect(details.compInputs).toBeUndefined();
    expect(details.warehouseWares).toBeUndefined();
  });

  it('keeps the supplies it could read when one gate fails', async () => {
    const fake = makeDetailsCtx();
    withInFlightMap(fake);
    registerTabs('9013', ['Supplies']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { MetaFluid: 'Books', cnxCount: '0' });
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return 'res="%A::\nBooks\r\nB::\nCars"';
      if (packet.member === 'SetPath') {
        return packet.args?.[0] === RdoValue.string('B').format()
          ? new Error('Request timeout: SetPath')
          : 'res="#-1"';
      }
      return '';
    });

    const details = await getBuildingDetails(fake.ctx, X, Y, '9013');

    expect(details.supplies?.map(s => s.path)).toEqual(['A']);
    expect(fake.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error fetching supply B'), expect.anything()
    );
  });

  it('keeps the products it could read when one gate fails', async () => {
    const fake = makeDetailsCtx();
    withInFlightMap(fake);
    registerTabs('9014', ['Products']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { MetaFluid: 'Cars', cnxCount: '0' });
    fake.respond((packet) => {
      if (packet.member === 'GetOutputNames') return 'res="%A::\nCars\r\nB::\nToys"';
      if (packet.member === 'SetPath') {
        return packet.args?.[0] === RdoValue.string('B').format()
          ? new Error('Request timeout: SetPath')
          : 'res="#-1"';
      }
      return '';
    });

    const details = await getBuildingDetails(fake.ctx, X, Y, '9014');

    expect(details.products?.map(p => p.path)).toEqual(['A']);
    expect(fake.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error fetching product B'), expect.anything()
    );
  });
});

// ===========================================================================
// GATE ENUMERATION — GetInputNames / GetOutputNames wire form and parsing
// ===========================================================================

describe('gate enumeration', () => {
  async function supplyPathsFor(payload: string): Promise<string[]> {
    const fake = makeDetailsCtx();
    registerTabs('9013', ['Supplies']);
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    cacheValues(fake, { MetaFluid: 'X', cnxCount: '0' });
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return payload;
      if (packet.member === 'SetPath') return 'res="#-1"';
      return '';
    });
    const data = await getBuildingTabData(fake.ctx, X, Y, 'supplies');
    return (data.supplies ?? []).map(s => s.path);
  }

  it('calls GetInputNames on the temp object with (integer, widestring)', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    fake.respond(() => 'res="%0"');

    await getBuildingTabData(fake.ctx, X, Y, 'supplies');

    const [{ packet, socketName, category }] = fake.sent;
    expect(socketName).toBe('map');
    expect(packet.targetId).toBe(FIRST_TEMP); // the inspector's object, not x/y
    expect(packet.member).toBe('GetInputNames');
    expect(packet.args).toEqual([RdoValue.int(0).format(), RdoValue.string('0').format()]);
    expect(category).toBe(TimeoutCategory.NORMAL);
  });

  it('splits "path::\\nname" entries separated by CRLF', async () => {
    expect(await supplyPathsFor('res="%Seg0::\nBooks\r\nSeg1::\nCars"')).toEqual(['Seg0', 'Seg1']);
  });

  it('treats 0, -1 and an empty payload as "no gates"', async () => {
    expect(await supplyPathsFor('res="%0"')).toEqual([]);
    expect(await supplyPathsFor('res="%-1"')).toEqual([]);
    expect(await supplyPathsFor('')).toEqual([]);
  });

  it('drops an entry with no :: separator', async () => {
    expect(await supplyPathsFor('res="%garbage\r\nSeg1::\nCars"')).toEqual(['Seg1']);
  });

  it('cuts a gate name at the first NUL byte', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9013', ['Supplies']);
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    cacheValues(fake, { MetaFluid: 'X', cnxCount: '0' });
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return 'res="%Seg0::\nBooks  junk"';
      if (packet.member === 'SetPath') return 'res="#-1"';
      return '';
    });

    const data = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

    expect(data.supplies?.[0].name).toBe('Books');
  });

  it('uses GetOutputNames for the products tab', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true }));
    fake.respond(() => 'res="%0"');

    await getBuildingTabData(fake.ctx, X, Y, 'products');

    expect(fake.sent[0].packet.member).toBe('GetOutputNames');
  });

  it('returns no products when GetOutputNames answers nothing', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true }));
    fake.respond((packet) => (packet.member === 'GetOutputNames' ? 'res="%-1"' : ''));

    expect((await getBuildingTabData(fake.ctx, X, Y, 'products')).products).toEqual([]);
  });

  it('drops a product entry with no :: separator', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true }));
    cacheValues(fake, { MetaFluid: 'X', cnxCount: '0' });
    fake.respond((packet) => {
      if (packet.member === 'GetOutputNames') return 'res="%broken\r\nGate1::\nCars tail"';
      if (packet.member === 'SetPath') return 'res="#-1"';
      return '';
    });

    const data = await getBuildingTabData(fake.ctx, X, Y, 'products');

    expect(data.products?.map(p => [p.path, p.name])).toEqual([['Gate1', 'Cars']]);
  });
});

// ===========================================================================
// getBuildingTabData — lazy phases 3+4
// ===========================================================================

describe('getBuildingTabData', () => {
  it('resets the temp object to the building root before every tab read', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    fake.respond(() => 'res="%0"');

    await getBuildingTabData(fake.ctx, X, Y, 'supplies');

    // A previous tab may have left the object on a gate sub-path; without this
    // reset GetInputNames reads from the wrong context (:376-378).
    expect(fake.cacher.setObject).toHaveBeenCalledWith(FIRST_TEMP, X, Y);
  });

  it('returns nothing for a tab that needs no lazy data', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector());

    expect(await getBuildingTabData(fake.ctx, X, Y, 'indGeneral')).toEqual({});
    expect(fake.sent).toEqual([]);
  });

  it('returns nothing when the tab exists but the template says it has no data', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: false }));

    expect(await getBuildingTabData(fake.ctx, X, Y, 'supplies')).toEqual({});
  });

  it('reads a supply gate and its connections through one temp object', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    cacheValues(fake, {
      MetaFluid: 'Fresh Food', FluidValue: '1200', LastCostPerc: '85', minK: '30',
      MaxPrice: '150', QPSorted: '1', SortMode: '0', cnxCount: '1', ObjectId: '40133999',
    });
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return 'res="%Seg0::\nFresh Food"';
      if (packet.member === 'SetPath') return 'res="#-1"';
      if (packet.member === 'GetSubObjectProps') {
        return 'res="%Farm A\tSPO_test3\tYellow Inc.\t100\t10\t900\t$12\t95%\t1\t40\t50\t"';
      }
      return '';
    });

    const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

    expect(supplies).toHaveLength(1);
    expect(supplies?.[0]).toEqual({
      path: 'Seg0',
      name: 'Fresh Food',
      metaFluid: 'Fresh Food',
      fluidValue: '1200',
      lastCostPerc: '85',
      minK: '30',
      maxPrice: '150',
      qpSorted: '1',
      sortMode: '0',
      connectionCount: 1,
      connections: [{
        facilityName: 'Farm A', createdBy: 'SPO_test3', companyName: 'Yellow Inc.',
        price: '100', overprice: '10', lastValue: '900', cost: '$12', quality: '95%',
        connected: true, x: 40, y: 50,
      }],
    });
    // SetPath goes to the SAME object the inspector owns — §4bis.
    const setPath = fake.sent.find(s => s.packet.member === 'SetPath');
    expect(setPath?.packet.targetId).toBe(FIRST_TEMP);
    expect(setPath?.packet.args).toEqual([RdoValue.string('Seg0').format()]);
    expect(setPath?.category).toBe(TimeoutCategory.SLOW);
  });

  it('skips a gate whose SetPath was refused', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return 'res="%Seg0::\nBooks"';
      if (packet.member === 'SetPath') return 'res="#0"'; // Delphi WordBool FALSE
      return '';
    });

    expect((await getBuildingTabData(fake.ctx, X, Y, 'supplies')).supplies).toEqual([]);
  });

  it('keeps the supply gates it could read when one fails, single-worker path', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    cacheValues(fake, { MetaFluid: 'X', cnxCount: '0' });
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return 'res="%A::\nBooks\r\nB::\nCars"';
      if (packet.member === 'SetPath') {
        return packet.args?.[0] === RdoValue.string('B').format()
          ? new Error('Request timeout: SetPath')
          : 'res="#-1"';
      }
      return '';
    });

    const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

    expect(supplies?.map(s => s.path)).toEqual(['A']);
    expect(fake.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error fetching supply B'), expect.anything()
    );
  });

  it('keeps the product gates it could read when one fails, single-worker path', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true }));
    cacheValues(fake, { MetaFluid: 'X', cnxCount: '0' });
    fake.respond((packet) => {
      if (packet.member === 'GetOutputNames') return 'res="%A::\nCars\r\nB::\nToys"';
      if (packet.member === 'SetPath') {
        return packet.args?.[0] === RdoValue.string('B').format()
          ? new Error('Request timeout: SetPath')
          : 'res="#-1"';
      }
      return '';
    });

    const { products } = await getBuildingTabData(fake.ctx, X, Y, 'products');

    expect(products?.map(p => p.path)).toEqual(['A']);
    expect(fake.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error fetching product B'), expect.anything()
    );
  });

  it('caps the connection sweep at 20 however many the gate claims', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    cacheValues(fake, { MetaFluid: 'Books', cnxCount: '75' });
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return 'res="%Seg0::\nBooks"';
      if (packet.member === 'SetPath') return 'res="#-1"';
      return 'res="%a\tb\tc\td\te\tf\tg\th\t1\t0\t0\t"';
    });

    const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

    expect(supplies?.[0].connectionCount).toBe(75); // reported as the server said
    expect(supplies?.[0].connections).toHaveLength(20); // but only 20 were read
    expect(fake.sent.filter(s => s.packet.member === 'GetSubObjectProps')).toHaveLength(20);
  });

  it('drops a connection row the server answered short', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    cacheValues(fake, { MetaFluid: 'Books', cnxCount: '1' });
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return 'res="%Seg0::\nBooks"';
      if (packet.member === 'SetPath') return 'res="#-1"';
      return 'res="%only\ttwo\t"'; // fewer than the 11 columns a supply needs
    });

    const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

    expect(supplies?.[0].connections).toEqual([]);
  });

  it('falls back to whitespace splitting when the reply carries no tabs', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true }));
    cacheValues(fake, { MetaFluid: 'Cars', cnxCount: '1' });
    fake.respond((packet) => {
      if (packet.member === 'GetOutputNames') return 'res="%Gate0::\nCars"';
      if (packet.member === 'SetPath') return 'res="#-1"';
      return 'res="%FarmA YellowInc 900 1 $12 40 50"';
    });

    const { products } = await getBuildingTabData(fake.ctx, X, Y, 'products');

    expect(products?.[0].connections).toEqual([{
      facilityName: 'FarmA', companyName: 'YellowInc', createdBy: '', price: '', overprice: '',
      lastValue: '900', cost: '$12', quality: '', connected: true, x: 40, y: 50,
    }]);
  });

  it('returns no connections when the sub-object read fails', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    cacheValues(fake, { MetaFluid: 'Books', cnxCount: '1' });
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return 'res="%Seg0::\nBooks"';
      if (packet.member === 'SetPath') return 'res="#-1"';
      return new Error('Request timeout: GetSubObjectProps');
    });

    const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

    expect(supplies?.[0].connections).toEqual([]);
    expect(fake.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error fetching sub-object 0'), expect.anything()
    );
  });

  // A packet with no payload at all is what a truncated or dropped frame
  // produces; every read on this path has to survive it.
  describe('payload-less replies', () => {
    const NO_PAYLOAD: RdoPacket = { raw: '', type: 'RESPONSE', rid: 1 };

    it('treats a payload-less GetInputNames as no gates', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
      fake.respond(() => NO_PAYLOAD);

      expect((await getBuildingTabData(fake.ctx, X, Y, 'supplies')).supplies).toEqual([]);
    });

    it('treats a payload-less GetOutputNames as no gates', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true }));
      fake.respond(() => NO_PAYLOAD);

      expect((await getBuildingTabData(fake.ctx, X, Y, 'products')).products).toEqual([]);
    });

    it('treats a payload-less SetPath as a refusal, on both gate kinds', async () => {
      for (const tab of ['supplies', 'products'] as const) {
        const fake = makeDetailsCtx();
        setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true, hasProducts: true }));
        fake.respond((packet) => {
          if (packet.member === 'GetInputNames' || packet.member === 'GetOutputNames') {
            return 'res="%Seg0::\nBooks"';
          }
          return NO_PAYLOAD; // SetPath
        });

        const data = await getBuildingTabData(fake.ctx, X, Y, tab);

        expect(data.supplies ?? data.products).toEqual([]);
      }
    });

    it('reads no connections from a payload-less GetSubObjectProps', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
      cacheValues(fake, { MetaFluid: 'Books', cnxCount: '1' });
      fake.respond((packet) => {
        if (packet.member === 'GetInputNames') return 'res="%Seg0::\nBooks"';
        if (packet.member === 'SetPath') return 'res="#-1"';
        return NO_PAYLOAD;
      });

      const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

      expect(supplies?.[0].connections).toEqual([]);
    });

    it('says so when cnxCount and the rows disagree, instead of dropping the row silently', async () => {
      // The live symptom: a warehouse showing "1 supplier" above an empty list.
      // The count comes off the gate, the rows come from GetSubObjectProps, and
      // an empty payload used to remove the row with nothing said. The
      // discrepancy still reaches the client -- that is deliberate, the UI
      // reports it -- but it must be traceable in the log too.
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
      cacheValues(fake, { MetaFluid: 'Books', cnxCount: '1' });
      fake.respond((packet) => {
        if (packet.member === 'GetInputNames') return 'res="%Seg0::\nBooks"';
        if (packet.member === 'SetPath') return 'res="#-1"';
        return NO_PAYLOAD;
      });

      const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

      expect(supplies?.[0].connectionCount).toBe(1);
      expect(supplies?.[0].connections).toHaveLength(0);
      expect(fake.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('cnxCount says 1 but 1 connection(s) returned an empty'),
      );
    });

    it('says so on the clients list too', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true }));
      cacheValues(fake, { MetaFluid: 'Cars', cnxCount: '2' });
      fake.respond((packet) => {
        if (packet.member === 'GetOutputNames') return 'res="%Gate0::\nCars"';
        if (packet.member === 'SetPath') return 'res="#-1"';
        return NO_PAYLOAD;
      });

      const { products } = await getBuildingTabData(fake.ctx, X, Y, 'products');

      expect(products?.[0].connectionCount).toBe(2);
      expect(products?.[0].connections).toHaveLength(0);
      expect(fake.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('cnxCount says 2 but 2 client connection(s) returned an empty'),
      );
    });

    it('stays quiet when every row came back', async () => {
      // The warning has to be absent on the happy path, or it is noise nobody
      // reads when it does fire.
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
      cacheValues(fake, { MetaFluid: 'Books', cnxCount: '1' });
      fake.respond((packet) => {
        if (packet.member === 'GetInputNames') return 'res="%Seg0::\nBooks"';
        if (packet.member === 'SetPath') return 'res="#-1"';
        if (packet.member === 'GetSubObjectProps') {
          return 'res="%Farm\tBob\tBobCorp\t10\t0\t5\t$1\t90%\t1\t12\t34\t"';
        }
        return '';
      });

      const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

      expect(supplies?.[0].connections).toHaveLength(1);
      expect(fake.log.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('returned an empty GetSubObjectProps payload'),
      );
    });

    it('reads a gate with no cnxCount as having no connections', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
      cacheValues(fake, {}); // MetaFluid and cnxCount both answer empty
      fake.respond((packet) => {
        if (packet.member === 'GetInputNames') return 'res="%Seg0::\nBooks"';
        if (packet.member === 'SetPath') return 'res="#-1"';
        return '';
      });

      const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

      expect(supplies?.[0].connectionCount).toBe(0);
      expect(supplies?.[0].metaFluid).toBe('');
      expect(supplies?.[0].maxPrice).toBeUndefined(); // empty reads as absent
    });

    it('reads a product gate with no cnxCount as having no connections', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true }));
      cacheValues(fake, {});
      fake.respond((packet) => {
        if (packet.member === 'GetOutputNames') return 'res="%Gate0::\nCars"';
        if (packet.member === 'SetPath') return 'res="#-1"';
        return '';
      });

      const { products } = await getBuildingTabData(fake.ctx, X, Y, 'products');

      expect(products?.[0].connectionCount).toBe(0);
      expect(products?.[0].metaFluid).toBe('');
    });
  });

  describe('connection rows with empty columns', () => {
    it('substitutes the documented defaults for every blank supply column', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
      cacheValues(fake, { MetaFluid: 'Books', cnxCount: '1' });
      fake.respond((packet) => {
        if (packet.member === 'GetInputNames') return 'res="%Seg0::\nBooks"';
        if (packet.member === 'SetPath') return 'res="#-1"';
        // 12 columns: only the first and last carry text, so columns 1-10 blank.
        return `res="%head${'\t'.repeat(11)}tail"`;
      });

      const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

      expect(supplies?.[0].connections).toEqual([{
        facilityName: 'head', createdBy: '', companyName: '', price: '0', overprice: '0',
        lastValue: '', cost: '$0', quality: '0%', connected: false, x: 0, y: 0,
      }]);
    });

    it('substitutes the documented defaults for every blank product column', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true }));
      cacheValues(fake, { MetaFluid: 'Cars', cnxCount: '1' });
      fake.respond((packet) => {
        if (packet.member === 'GetOutputNames') return 'res="%Gate0::\nCars"';
        if (packet.member === 'SetPath') return 'res="#-1"';
        return `res="%head${'\t'.repeat(7)}tail"`;
      });

      const { products } = await getBuildingTabData(fake.ctx, X, Y, 'products');

      expect(products?.[0].connections).toEqual([{
        facilityName: 'head', companyName: '', createdBy: '', price: '', overprice: '',
        lastValue: '', cost: '', quality: '', connected: false, x: 0, y: 0,
      }]);
    });

    it('drops a product connection row the server answered short', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true }));
      cacheValues(fake, { MetaFluid: 'Cars', cnxCount: '1' });
      fake.respond((packet) => {
        if (packet.member === 'GetOutputNames') return 'res="%Gate0::\nCars"';
        if (packet.member === 'SetPath') return 'res="#-1"';
        return 'res="%only\ttwo\t"'; // fewer than the 7 columns a product needs
      });

      const { products } = await getBuildingTabData(fake.ctx, X, Y, 'products');

      expect(products?.[0].connections).toEqual([]);
    });
  });

  it('reads a product gate with its own column set', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true }));
    cacheValues(fake, {
      MetaFluid: 'Cars', LastFluid: '80', FluidQuality: '90%', PricePc: '110',
      AvgPrice: '$4', MarketPrice: '$5', cnxCount: '0',
    });
    fake.respond((packet) => {
      if (packet.member === 'GetOutputNames') return 'res="%Gate0::\nCars"';
      if (packet.member === 'SetPath') return 'res="#-1"';
      return '';
    });

    const { products } = await getBuildingTabData(fake.ctx, X, Y, 'products');

    expect(products?.[0]).toEqual({
      path: 'Gate0', name: 'Cars', metaFluid: 'Cars', lastFluid: '80', quality: '90%',
      pricePc: '110', avgPrice: '$4', marketPrice: '$5', connectionCount: 0, connections: [],
    });
  });

  it('skips a product gate whose SetPath was refused', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true }));
    fake.respond((packet) => {
      if (packet.member === 'GetOutputNames') return 'res="%Gate0::\nCars"';
      if (packet.member === 'SetPath') return 'res="#0"';
      return '';
    });

    expect((await getBuildingTabData(fake.ctx, X, Y, 'products')).products).toEqual([]);
  });

  describe('warehouse gates', () => {
    const THIRTY_PATHS = Array.from({ length: 30 }, (_, i) => `Seg${i}::\nWare${i}`).join('\r\n');

    it('reads only the gates the GateMap enables', async () => {
      const fake = makeDetailsCtx();
      // Real Import Storage GateMap: bits 0, 11 and 24 set.
      const gateMap = '100000000001000000000000100000';
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true, isWarehouse: true, gateMap }));
      cacheValues(fake, { MetaFluid: 'X', cnxCount: '0', InputCount: '3', 'Input0.0': 'Books' });
      fake.respond((packet) => {
        if (packet.member === 'GetInputNames') return `res="%${THIRTY_PATHS}"`;
        if (packet.member === 'SetPath') return 'res="#-1"';
        return '';
      });

      const { supplies, warehouseWares } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

      expect(supplies?.map(s => s.path)).toEqual(['Seg0', 'Seg11', 'Seg24']);
      // A warehouse also gets the ware list back so the client can label them.
      expect(warehouseWares).toHaveLength(3);
    });

    it('reads no gate at all when every bit of the GateMap is clear', async () => {
      const fake = makeDetailsCtx();
      const gateMap = '0'.repeat(30);
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true, isWarehouse: true, gateMap }));
      cacheValues(fake, { InputCount: '0' });
      fake.respond((packet) => {
        if (packet.member === 'GetInputNames') return `res="%${THIRTY_PATHS}"`;
        if (packet.member === 'SetPath') return 'res="#-1"';
        return '';
      });

      const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

      expect(supplies).toEqual([]);
      expect(fake.sent.some(s => s.packet.member === 'SetPath')).toBe(false);
    });

    it('ignores the gates a short GateMap does not cover', async () => {
      const fake = makeDetailsCtx();
      // Only the first three gates are described; the other 27 stay closed.
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true, isWarehouse: true, gateMap: '101' }));
      cacheValues(fake, { MetaFluid: 'X', cnxCount: '0', InputCount: '0' });
      fake.respond((packet) => {
        if (packet.member === 'GetInputNames') return `res="%${THIRTY_PATHS}"`;
        if (packet.member === 'SetPath') return 'res="#-1"';
        return '';
      });

      const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

      expect(supplies?.map(s => s.path)).toEqual(['Seg0', 'Seg2']);
    });

    it('reads every gate when the warehouse has no GateMap at all', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true, isWarehouse: true, gateMap: '' }));
      cacheValues(fake, { MetaFluid: 'X', cnxCount: '0', InputCount: '0' });
      fake.respond((packet) => {
        if (packet.member === 'GetOutputNames') return 'res="%Gate0::\nA\r\nGate1::\nB"';
        if (packet.member === 'SetPath') return 'res="#-1"';
        return '';
      });

      const { products, warehouseWares } = await getBuildingTabData(fake.ctx, X, Y, 'products');

      expect(products?.map(p => p.path)).toEqual(['Gate0', 'Gate1']);
      expect(warehouseWares).toEqual([]);
    });

    it('filters the product gates of a warehouse by the same GateMap', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true, isWarehouse: true, gateMap: '011' }));
      cacheValues(fake, { MetaFluid: 'X', cnxCount: '0', InputCount: '0' });
      fake.respond((packet) => {
        if (packet.member === 'GetOutputNames') return 'res="%G0::\nA\r\nG1::\nB\r\nG2::\nC"';
        if (packet.member === 'SetPath') return 'res="#-1"';
        return '';
      });

      const { products } = await getBuildingTabData(fake.ctx, X, Y, 'products');

      expect(products?.map(p => p.path)).toEqual(['G1', 'G2']);
    });
  });

  describe('company inputs', () => {
    it('reads seven indexed properties per input', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasCompInputs: true }));
      cacheValues(fake, {
        cInputCount: '2',
        'cInput0.0': 'Advertising', cInputSup0: '12.5', cInputDem0: '20', cInputRatio0: '62',
        cInputMax0: '100', cEditable0: 'YES', 'cUnits0.0': 'units',
        'cInput1.0': 'Security', cInputSup1: '0', cInputDem1: '5', cInputRatio1: '0',
        cInputMax1: '80', cEditable1: 'no', 'cUnits1.0': 'guards',
      });

      const { compInputs } = await getBuildingTabData(fake.ctx, X, Y, 'compInputs');

      expect(compInputs).toEqual([
        { name: 'Advertising', supplied: 12.5, demanded: 20, ratio: 62, maxDemand: 100, editable: true, units: 'units' },
        { name: 'Security', supplied: 0, demanded: 5, ratio: 0, maxDemand: 80, editable: false, units: 'guards' },
      ]);
    });

    it('returns nothing when the company declares no inputs', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasCompInputs: true }));
      cacheValues(fake, { cInputCount: '0' });

      expect((await getBuildingTabData(fake.ctx, X, Y, 'compInputs')).compInputs).toEqual([]);
    });

    it('batches the indexed reads at 49 properties', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasCompInputs: true }));
      // 8 inputs x 7 properties = 56 names → two batches.
      cacheValues(fake, { cInputCount: '8' });

      await getBuildingTabData(fake.ctx, X, Y, 'compInputs');

      const batches = fake.cacher.getPropertyList.mock.calls.filter(
        ([, names]) => names[0] !== 'cInputCount'
      );
      expect(batches.map(([, names]) => names.length)).toEqual([49, 7]);
    });

    it('falls back to sane defaults for values the cache never wrote', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasCompInputs: true }));
      cacheValues(fake, { cInputCount: '1' });

      const { compInputs } = await getBuildingTabData(fake.ctx, X, Y, 'compInputs');

      expect(compInputs).toEqual([
        { name: '', supplied: 0, demanded: 0, ratio: 0, maxDemand: 100, editable: false, units: '' },
      ]);
    });

    it('returns nothing when the count comes back empty', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasCompInputs: true }));
      cacheValues(fake, {}); // cInputCount answers ''

      expect((await getBuildingTabData(fake.ctx, X, Y, 'compInputs')).compInputs).toEqual([]);
    });

    it('fills in defaults for a batch the server answered short', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasCompInputs: true }));
      fake.cacher.getPropertyList.mockImplementation(async (_id: string, names: string[]) =>
        (names[0] === 'cInputCount' ? ['1'] : []) // no values at all for the batch
      );

      const { compInputs } = await getBuildingTabData(fake.ctx, X, Y, 'compInputs');

      expect(compInputs).toEqual([
        { name: '', supplied: 0, demanded: 0, ratio: 0, maxDemand: 100, editable: false, units: '' },
      ]);
    });

    it('returns nothing when the count read fails', async () => {
      const fake = makeDetailsCtx();
      setActiveInspectorForTest(fake.ctx, makeInspector({ hasCompInputs: true }));
      fake.cacher.getPropertyList.mockRejectedValue(new Error('Request timeout: GetPropertyList'));

      expect((await getBuildingTabData(fake.ctx, X, Y, 'compInputs')).compInputs).toEqual([]);
      expect(fake.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching comp input data'), expect.anything()
      );
    });
  });

  describe('on-demand inspector', () => {
    it('opens one when the building was loaded through the legacy path', async () => {
      const fake = makeDetailsCtx();
      registerTabs('7001', ['WHGeneral', 'Supplies']);
      cacheValues(fake, { GateMap: '10', MetaFluid: 'X', cnxCount: '0' });
      fake.respond((packet) => (packet.member === 'GetInputNames' ? 'res="%0"' : ''));

      await getBuildingTabData(fake.ctx, X, Y, 'supplies', '7001');

      expect(fake.cacher.createObject).toHaveBeenCalledTimes(1);
      expect(fake.cacher.setObject).toHaveBeenCalledWith(FIRST_TEMP, X, Y);
      const inspector = getActiveInspector(fake.ctx, X, Y);
      expect(inspector?.tempObjectId).toBe(FIRST_TEMP);
      expect(inspector?.isWarehouse).toBe(true);
      expect(inspector?.gateMap).toBe('10');
    });

    it('opens one with no GateMap when the warehouse answers nothing', async () => {
      const fake = makeDetailsCtx();
      registerTabs('7001', ['WHGeneral', 'Supplies']);
      fake.cacher.getPropertyList.mockResolvedValue([]); // GateMap read answers nothing
      fake.respond(() => 'res="%0"');

      await getBuildingTabData(fake.ctx, X, Y, 'supplies', '7001');

      expect(getActiveInspector(fake.ctx, X, Y)?.gateMap).toBe('');
    });

    it('closes a stale inspector before opening the on-demand one', async () => {
      const fake = makeDetailsCtx();
      registerTabs('9013', ['Supplies']);
      setActiveInspectorForTest(fake.ctx, makeInspector({ tempObjectId: '900999', x: X + 5 }));
      fake.respond(() => 'res="%0"');

      await getBuildingTabData(fake.ctx, X, Y, 'supplies', '9013');

      expect(fake.cacher.closeObject).toHaveBeenCalledWith('900999');
    });

    it('falls back to the generic template when no visual class is given', async () => {
      const fake = makeDetailsCtx();

      const data = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

      // GENERIC_TEMPLATE has neither supplies nor products.
      expect(data).toEqual({});
      expect(getActiveInspector(fake.ctx, X, Y)?.hasSupplies).toBe(false);
    });

    it('tolerates a warehouse whose GateMap read fails', async () => {
      const fake = makeDetailsCtx();
      registerTabs('7001', ['WHGeneral']);
      fake.cacher.getPropertyList.mockRejectedValue(new Error('Request timeout: GetPropertyList'));

      await getBuildingTabData(fake.ctx, X, Y, 'whGeneral', '7001');

      expect(getActiveInspector(fake.ctx, X, Y)?.gateMap).toBe('');
    });

    it('refuses to open one before the map service is initialised', async () => {
      const fake = makeDetailsCtx({ cacherId: null });
      registerTabs('9013', ['Supplies']);

      await expect(getBuildingTabData(fake.ctx, X, Y, 'supplies', '9013')).rejects.toThrow(
        'Map service not initialized'
      );
    });

    it('closes the fresh object when SetObject fails, then rethrows', async () => {
      const fake = makeDetailsCtx();
      registerTabs('9013', ['Supplies']);
      fake.cacher.setObject.mockRejectedValue(new Error('Request timeout: SetObject'));

      await expect(getBuildingTabData(fake.ctx, X, Y, 'supplies', '9013')).rejects.toThrow(
        'Request timeout: SetObject'
      );
      expect(fake.cacher.closeObject).toHaveBeenCalledWith(FIRST_TEMP);
      expect(getActiveInspector(fake.ctx, X, Y)).toBeUndefined();
    });
  });

  it('serialises two tab reads on the same inspector', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true, hasProducts: true }));
    const order: string[] = [];
    fake.respond((packet) => {
      order.push(packet.member ?? '');
      return 'res="%0"';
    });

    await Promise.all([
      getBuildingTabData(fake.ctx, X, Y, 'supplies'),
      getBuildingTabData(fake.ctx, X, Y, 'products'),
    ]);

    // The mutex must not let the products SetObject land between the supplies
    // SetObject and its GetInputNames — that is the SetPath race it exists for.
    expect(order).toEqual(['GetInputNames', 'GetOutputNames']);
  });
});

// ===========================================================================
// WORKER POOL — parallel gate reads
// ===========================================================================

describe('the worker pool', () => {
  /** N gate entries, so `computeWorkerCount` picks the intended worker count. */
  function gates(n: number): string {
    return Array.from({ length: n }, (_, i) => `Seg${i}::\nWare${i}`).join('\r\n');
  }

  it('stays on the inspector object while a single worker suffices', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    cacheValues(fake, { MetaFluid: 'X', cnxCount: '0' });
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return `res="%${gates(3)}"`;
      if (packet.member === 'SetPath') return 'res="#-1"';
      return '';
    });

    const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

    expect(supplies).toHaveLength(3);
    expect(fake.cacher.createObject).not.toHaveBeenCalled(); // no pool at all
    expect(fake.sent.filter(s => s.packet.member === 'SetPath')
      .every(s => s.packet.targetId === FIRST_TEMP)).toBe(true);
  });

  it('opens one temp object per worker and closes them all afterwards', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    cacheValues(fake, { MetaFluid: 'X', cnxCount: '0' });
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return `res="%${gates(12)}"`;
      if (packet.member === 'SetPath') return 'res="#-1"';
      return '';
    });

    const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

    expect(supplies).toHaveLength(12);
    expect(fake.cacher.createObject).toHaveBeenCalledTimes(3); // computeWorkerCount(12)
    expect(fake.cacher.closeObject.mock.calls.map(c => c[0])).toEqual(['900001', '900002', '900003']);
    // Every worker points at the same building…
    for (const call of fake.cacher.setObject.mock.calls) expect(call.slice(1)).toEqual([X, Y]);
    // …and no SetPath is ever issued on the inspector's own object.
    const pathTargets = new Set(
      fake.sent.filter(s => s.packet.member === 'SetPath').map(s => s.packet.targetId)
    );
    expect([...pathTargets].sort()).toEqual(['900001', '900002', '900003']);
  });

  it('degrades to the workers it managed to create', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasProducts: true }));
    cacheValues(fake, { MetaFluid: 'X', cnxCount: '0' });
    let created = 0;
    fake.cacher.createObject.mockImplementation(async () => {
      created++;
      if (created > 1) throw new Error('error 12'); // Delphi object pool exhausted
      return '900001';
    });
    fake.respond((packet) => {
      if (packet.member === 'GetOutputNames') return `res="%${gates(6)}"`;
      if (packet.member === 'SetPath') return 'res="#-1"';
      return '';
    });

    const { products } = await getBuildingTabData(fake.ctx, X, Y, 'products');

    expect(products).toHaveLength(6); // still complete, just slower
    expect(fake.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Worker 1 creation failed'), expect.anything()
    );
  });

  it('gives up when not a single worker object can be created', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    fake.cacher.createObject.mockRejectedValue(new Error('error 12'));
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return `res="%${gates(12)}"`;
      return '';
    });

    await expect(getBuildingTabData(fake.ctx, X, Y, 'supplies')).rejects.toThrow(
      'Failed to create any worker temp objects'
    );
  });

  it('keeps the gates it could read when one worker task throws', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    cacheValues(fake, { MetaFluid: 'X', cnxCount: '0' });
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return `res="%${gates(12)}"`;
      if (packet.member === 'SetPath') {
        return packet.args?.[0] === RdoValue.string('Seg7').format()
          ? new Error('Request timeout: SetPath')
          : 'res="#-1"';
      }
      return '';
    });

    const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

    expect(supplies).toHaveLength(11);
    expect(supplies?.some(s => s.path === 'Seg7')).toBe(false);
    expect(fake.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error fetching path Seg7'), expect.anything()
    );
  });

  it('drops the gates whose SetPath the server refused, keeping the rest', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));
    cacheValues(fake, { MetaFluid: 'X', cnxCount: '0' });
    fake.respond((packet) => {
      if (packet.member === 'GetInputNames') return `res="%${gates(12)}"`;
      if (packet.member === 'SetPath') {
        return packet.args?.[0] === RdoValue.string('Seg3').format() ? 'res="#0"' : 'res="#-1"';
      }
      return '';
    });

    const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

    // fetchPathsWithPool filters the nulls out — 11 of 12 survive.
    expect(supplies).toHaveLength(11);
  });

  /**
   * BUG connu (nouveau, lot 3) — building-details-handler.ts:1492-1496.
   *
   * The comment claims the per-slot connection reads "are gated by the same
   * semaphore to respect Delphi MAX_BUFFER_SIZE". They are not: the semaphore
   * is acquired ONCE around the whole slot fetch (:1505), while
   * `batchedParallel` then issues up to MAX_CONCURRENT_CONNECTIONS = 3
   * concurrent GetSubObjectProps inside it. With 3 workers that is up to 9
   * simultaneous requests on the map socket, against a declared cap of
   * MAX_GLOBAL_CONCURRENT_RDO = 4 and a Delphi MAX_BUFFER_SIZE of 5.
   */
  it('exceeds its own concurrency cap: slot permits do not gate connection reads', async () => {
    let inFlight = 0;
    let peak = 0;
    const enter = async (): Promise<void> => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise<void>(resolve => setImmediate(resolve));
      inFlight--;
    };

    const fake = makeDetailsCtx({
      sendRdoRequest: jest.fn(async (_s: string, packet: Partial<RdoPacket>): Promise<RdoPacket> => {
        await enter();
        let payload = '';
        if (packet.member === 'GetInputNames') {
          payload = `res="%${Array.from({ length: 12 }, (_, i) => `Seg${i}::\nW${i}`).join('\r\n')}"`;
        } else if (packet.member === 'SetPath') {
          payload = 'res="#-1"';
        } else {
          payload = 'res="%a\tb\tc\td\te\tf\tg\th\t1\t0\t0\t"';
        }
        return { raw: '', type: 'RESPONSE', rid: 1, payload };
      }),
    });
    // Set after the factory: `makeDetailsCtx` installs its own default here.
    fake.cacher.getPropertyList.mockImplementation(async (_id: string, names: string[]) => {
      await enter();
      return names.map(n => (n === 'cnxCount' ? '3' : 'x'));
    });
    setActiveInspectorForTest(fake.ctx, makeInspector({ hasSupplies: true }));

    const { supplies } = await getBuildingTabData(fake.ctx, X, Y, 'supplies');

    expect(supplies).toHaveLength(12);
    // 3 workers x (1 slot + up to 3 connection reads). The documented ceiling is 4.
    expect(peak).toBeGreaterThan(4);
  });
});

// ===========================================================================
// refreshBuildingProperties — re-read on the SAME temp object
// ===========================================================================

describe('refreshBuildingProperties', () => {
  it('re-reads on the existing object without creating another one', async () => {
    const fake = makeDetailsCtx();
    registerTabs('4722', ['unkGeneral']);
    setActiveInspectorForTest(fake.ctx, makeInspector({ tempObjectId: '900500' }));
    cacheValues(fake, { Name: 'Shop', Cost: '$500K', ObjectId: '40133602' });
    focusReturns(fake, '40133602', 'Shop', 'SPO_test3');

    const details = await refreshBuildingProperties(fake.ctx, X, Y, '4722');

    expect(fake.cacher.createObject).not.toHaveBeenCalled();
    expect(fake.cacher.setObject).toHaveBeenCalledWith('900500', X, Y);
    expect(fake.cacher.getPropertyList.mock.calls.every(c => c[0] === '900500')).toBe(true);
    expect(details.buildingId).toBe('40133602');
    // The lazy tabs are deliberately not refetched — the client carries them.
    expect(details.supplies).toBeUndefined();
    expect(details.warehouseWares).toBeUndefined();
    expect(details.refreshedGroups).toBeUndefined();
  });

  it('falls back to a full open when no inspector is live', async () => {
    const fake = makeDetailsCtx();
    registerTabs('4722', ['unkGeneral']);
    focusReturns(fake, '40133602');
    cacheValues(fake, { Name: 'Shop' });

    const details = await refreshBuildingProperties(fake.ctx, X, Y, '4722');

    expect(fake.cacher.createObject).toHaveBeenCalledTimes(1);
    expect(details.buildingId).toBe('40133602');
    expect(getActiveInspectorTempObjectId(fake.ctx)).toBe(FIRST_TEMP);
  });

  it('reuses the cached focus instead of re-issuing SwitchFocusEx', async () => {
    const fake = makeDetailsCtx({
      currentFocusedCoords: { x: X, y: Y },
      currentFocusedBuildingId: '40133602',
      currentFocusedBuildingName: 'Shop',
      currentFocusedOwnerName: 'SPO_test3',
    });
    registerTabs('4722', ['unkGeneral']);
    setActiveInspectorForTest(fake.ctx, makeInspector());
    cacheValues(fake, { Name: 'Shop' });

    const details = await refreshBuildingProperties(fake.ctx, X, Y, '4722');

    expect(fake.ctx.focusBuilding).not.toHaveBeenCalled();
    expect(details.buildingName).toBe('Shop');
    expect(details.ownerName).toBe('SPO_test3');
  });

  it('reads empty strings for a focus cached without a name', async () => {
    const fake = makeDetailsCtx({
      currentFocusedCoords: { x: X, y: Y },
      currentFocusedBuildingId: '40133602',
      currentFocusedBuildingName: null,
      currentFocusedOwnerName: null,
    });
    registerTabs('4722', ['unkGeneral']);
    setActiveInspectorForTest(fake.ctx, makeInspector());
    cacheValues(fake, { Name: 'Shop' });

    const details = await refreshBuildingProperties(fake.ctx, X, Y, '4722');

    expect(details.buildingName).toBe('');
    expect(details.ownerName).toBe('');
  });

  it('re-focuses when the session is focused on another building', async () => {
    const fake = makeDetailsCtx({
      currentFocusedCoords: { x: X + 9, y: Y },
      currentFocusedBuildingId: '40133111',
    });
    registerTabs('4722', ['unkGeneral']);
    setActiveInspectorForTest(fake.ctx, makeInspector());
    cacheValues(fake, { Name: 'Shop' });
    focusReturns(fake, '40133602', 'Shop', 'SPO_test3');

    const details = await refreshBuildingProperties(fake.ctx, X, Y, '4722');

    expect(fake.ctx.focusBuilding).toHaveBeenCalledWith(X, Y);
    expect(details.buildingId).toBe('40133602');
  });

  it('keeps the refresh when the re-focus fails', async () => {
    const fake = makeDetailsCtx();
    setActiveInspectorForTest(fake.ctx, makeInspector());
    cacheValues(fake, { Name: 'Shop', CurrBlock: '40133888' });
    (fake.ctx.focusBuilding as FocusMock).mockRejectedValue(new Error('server busy'));

    const details = await refreshBuildingProperties(fake.ctx, X, Y, 'unregistered');

    expect(details.buildingId).toBe('40133888'); // fallback to the cache value
    expect(details.buildingName).toBe('');
  });

  it('reports an empty building id when the refresh identifies nothing', async () => {
    const fake = makeDetailsCtx();
    HANDLER_TO_GROUP['probeBlock'] = PROBE_BLOCK_GROUP;
    registerTabs('9027', ['unkGeneral', 'probeBlock']);
    setActiveInspectorForTest(fake.ctx, makeInspector());
    cacheValues(fake, { Name: 'Shop', CurrBlock: 'error' });
    focusReturns(fake, '');

    const details = await refreshBuildingProperties(fake.ctx, X, Y, '9027');

    expect(details.buildingId).toBe('');
    expect(details.tabs.find(t => t.id === 'probeBlock')?.icon).toBe('');
  });

  it('narrows the read to the active tab plus the overview', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9015', ['IndGeneral', 'Workforce', 'facManagement']);
    setActiveInspectorForTest(fake.ctx, makeInspector());
    cacheValues(fake, { Name: 'Plant', UpgradeLevel: '2' });
    focusReturns(fake, '40133602');

    const details = await refreshBuildingProperties(fake.ctx, X, Y, '9015', 'upgrade');

    const asked = fake.cacher.getPropertyList.mock.calls.flatMap(([, names]) => names);
    expect(asked).toContain('UpgradeLevel'); // the active tab
    expect(asked).toContain('Name');         // plus the overview header
    expect(asked).not.toContain('Workers0'); // the workforce tab is left alone
    expect(details.refreshedGroups).toEqual(Object.keys(details.groups));
  });

  it('reads everything when the active tab is a lazy one', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9016', ['IndGeneral', 'Supplies', 'facManagement']);
    setActiveInspectorForTest(fake.ctx, makeInspector());
    cacheValues(fake, { Name: 'Plant', UpgradeLevel: '2' });
    focusReturns(fake, '40133602');

    const details = await refreshBuildingProperties(fake.ctx, X, Y, '9016', 'supplies');

    // supplies/products/compInputs are fetched by getBuildingTabData, never here.
    const asked = fake.cacher.getPropertyList.mock.calls.flatMap(([, names]) => names);
    expect(asked).toContain('UpgradeLevel');
    expect(details.refreshedGroups).toBeUndefined();
  });

  it('reads everything for a template with two tabs or fewer', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9017', ['IndGeneral', 'facManagement']);
    setActiveInspectorForTest(fake.ctx, makeInspector());
    cacheValues(fake, { Name: 'Plant', UpgradeLevel: '2' });
    focusReturns(fake, '40133602');

    const details = await refreshBuildingProperties(fake.ctx, X, Y, '9017', 'upgrade');

    expect(details.refreshedGroups).toBeUndefined();
  });

  it('picks up a GateMap changed by RDOSelectWare since the last read', async () => {
    const fake = makeDetailsCtx();
    registerTabs('7001', ['WHGeneral']);
    setActiveInspectorForTest(fake.ctx, makeInspector({ isWarehouse: true, gateMap: '100' }));
    cacheValues(fake, { GateMap: '111', Name: 'Storage' });
    focusReturns(fake, '40133602');

    await refreshBuildingProperties(fake.ctx, X, Y, '7001');

    expect(getActiveInspector(fake.ctx, X, Y)?.gateMap).toBe('111');
  });

  it('keeps the previous GateMap when the refresh returns none', async () => {
    const fake = makeDetailsCtx();
    registerTabs('7001', ['WHGeneral']);
    setActiveInspectorForTest(fake.ctx, makeInspector({ isWarehouse: true, gateMap: '100' }));
    cacheValues(fake, { Name: 'Storage' });
    focusReturns(fake, '40133602');

    await refreshBuildingProperties(fake.ctx, X, Y, '7001');

    expect(getActiveInspector(fake.ctx, X, Y)?.gateMap).toBe('100');
  });

  it('drops the dead object and reopens one when the refresh fails on it', async () => {
    const fake = makeDetailsCtx();
    registerTabs('4722', ['unkGeneral']);
    setActiveInspectorForTest(fake.ctx, makeInspector({ tempObjectId: '900500' }));
    focusReturns(fake, '40133602', 'Shop', 'SPO_test3');
    let firstAttempt = true;
    fake.cacher.setObject.mockImplementation(async (id: string) => {
      if (firstAttempt && id === '900500') {
        firstAttempt = false;
        throw new Error('error 8'); // the Delphi object went away
      }
    });
    cacheValues(fake, { Name: 'Shop' });

    const details = await refreshBuildingProperties(fake.ctx, X, Y, '4722');

    expect(fake.cacher.closeObject).toHaveBeenCalledWith('900500');
    expect(fake.cacher.createObject).toHaveBeenCalledTimes(1);
    expect(details.buildingName).toBe('Shop');
    expect(fake.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Refresh failed on existing object'), expect.anything()
    );
  });

  it('releases the mutex so a tab read can follow a failed refresh', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9013', ['Supplies']);
    const inspector = makeInspector({ tempObjectId: '900500', hasSupplies: true });
    setActiveInspectorForTest(fake.ctx, inspector);
    focusReturns(fake, '40133602');
    fake.cacher.setObject.mockRejectedValueOnce(new Error('error 8'));
    cacheValues(fake, { MetaFluid: 'X', cnxCount: '0' });
    fake.respond(() => 'res="%0"');

    await refreshBuildingProperties(fake.ctx, X, Y, '9013');

    // The mutex of the *original* inspector must be free again.
    const release = await inspector.mutex.acquire();
    expect(typeof release).toBe('function');
    release();
  });
});

// ===========================================================================
// KNOWN GAPS — properties the sheet asks for that the cache never holds
// ===========================================================================

/**
 * Known gaps A-1 / A-3 / A-4.
 *
 * These names are fetched through GetPropertyList like any other, but the
 * Delphi StoreToCache routines never write them, so the answer is always empty.
 * The tests below pin the REQUEST — the names really do go out — and the empty
 * result, so the day a fix lands (an RDO getter, or the properties added to the
 * cache) they fail.
 */
describe('properties requested from a cache that never holds them', () => {
  it('asks the cache for HoursOnAir and Comercials on a TV station', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9018', ['TVGeneral'], 'TV Station');
    focusReturns(fake, '40133602');
    // TBroadcaster.StoreToCache (StdBlocks/Broadcast.pas:431-453) writes neither.
    cacheValues(fake, { Name: 'Channel 5', Cost: '$2,000K' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9018');

    const asked = fake.cacher.getPropertyList.mock.calls.flatMap(([, names]) => names);
    expect(asked).toContain('HoursOnAir');
    expect(asked).toContain('Comercials'); // one 'm' — the published name is 'Commercials'
    // BUG connu — A-1. The names go out on the wire and the
    // cache answers an empty string for each, every time: the two sliders of the
    // TV sheet are permanently blank.
    const tv = details.groups['tvGeneral'];
    expect(tv).toContainEqual({ name: 'HoursOnAir', value: '' });
    expect(tv).toContainEqual({ name: 'Comercials', value: '' });
    expect(tv).toContainEqual({ name: 'Name', value: 'Channel 5' });
  });

  it('asks the cache for EstLoan, Interest, Term and BudgetPerc on a bank', async () => {
    const fake = makeDetailsCtx();
    registerTabs('9019', ['BankGeneral'], 'Bank');
    focusReturns(fake, '40133602');
    // TBank published properties (StdBlocks/Banks.pas:39-41) are absent from
    // StoreToCache (Banks.pas:188-206); EstLoan has no cache entry at all and
    // comes from RDOEstimateLoan, which is not implemented.
    cacheValues(fake, { Name: 'First Bank', Creator: 'SPO_test3' });

    const details = await getBuildingBasicDetails(fake.ctx, X, Y, '9019');

    const asked = fake.cacher.getPropertyList.mock.calls.flatMap(([, names]) => names);
    expect(asked).toEqual(expect.arrayContaining(['EstLoan', 'Interest', 'Term', 'BudgetPerc']));
    // BUG connu — A-3 / A-4. The four values come back empty
    // for every bank, so the loan sheet renders four blank sliders.
    const bank = details.groups['bankGeneral'];
    for (const name of ['EstLoan', 'Interest', 'Term', 'BudgetPerc']) {
      expect(bank).toContainEqual({ name, value: '' });
    }
    expect(bank).toContainEqual({ name: 'Name', value: 'First Bank' });
  });
});
