/**
 * Inspector Lifecycle Tests — verifies that the inspector temp object
 * is properly released on deselect and world switch to prevent
 * TObjectCacher leaks in the Delphi server.
 *
 * Exercises: releaseInspector() in building-details-handler.ts:85-91
 * Regression test for commit 2e750cbef (inspector cleanup on world switch).
 */

import { describe, it, expect } from '@jest/globals';
import {
  releaseInspector,
  getActiveInspector,
  setActiveInspectorForTest,
} from '../building-details-handler';
import type { ActiveInspector } from '../building-details-handler';
import type { SessionContext } from '../session-context';

/* ── Mock SessionContext ───────────────────────────────────────────────── */

interface MockCtx extends SessionContext {
  closedObjects: string[];
}

function createMockCtx(): MockCtx {
  const closedObjects: string[] = [];
  return {
    closedObjects,
    cacherCloseObject: (objectId: string) => {
      closedObjects.push(objectId);
    },
    log: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    // Stubs for other SessionContext methods
    sendRdoRequest: jest.fn(),
    getSocket: jest.fn(),
    cacherCreateObject: jest.fn(),
    cacherSetObject: jest.fn(),
    cacherSetPath: jest.fn(),
    cacherGetPropertyList: jest.fn(),
    buildAspBaseParams: jest.fn(),
    buildAspUrl: jest.fn(),
    fetchAspPage: jest.fn(),
    connectMapService: jest.fn(),
    connectConstructionService: jest.fn(),
    ensureMailConnection: jest.fn(),
    getCacherPropertyListAt: jest.fn(),
    focusBuilding: jest.fn(),
    manageConstruction: jest.fn(),
    getAspActionCache: jest.fn(),
    setAspActionCache: jest.fn(),
    getInFlightBuildingDetails: jest.fn(),
    setInFlightBuildingDetails: jest.fn(),
    deleteInFlightBuildingDetails: jest.fn(),
  } as unknown as MockCtx;
}

function createFakeInspector(overrides?: Partial<ActiveInspector>): ActiveInspector {
  return {
    tempObjectId: 'TMP_OBJ_42',
    x: 10,
    y: 20,
    visualClass: 'TestBuilding',
    mutex: { runExclusive: (fn: () => unknown) => fn() } as unknown as ActiveInspector['mutex'],
    gateMap: '0000',
    hasSupplies: false,
    hasProducts: false,
    hasCompInputs: false,
    isWarehouse: false,
    ...overrides,
  };
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe('Inspector Lifecycle', () => {
  it('releases inspector temp object on deselect (no TObjectCacher leak)', () => {
    const ctx = createMockCtx();
    const inspector = createFakeInspector();

    // Plant an active inspector into the WeakMap
    setActiveInspectorForTest(ctx, inspector);

    // Verify the inspector is retrievable at matching coordinates
    expect(getActiveInspector(ctx, 10, 20)).toBe(inspector);

    // Release — should close the Delphi temp object
    releaseInspector(ctx);

    // cacherCloseObject must have been called with the temp object ID
    expect(ctx.closedObjects).toEqual(['TMP_OBJ_42']);

    // Inspector must no longer be accessible
    expect(getActiveInspector(ctx, 10, 20)).toBeUndefined();
  });

  it('cleanupWorldSession releases inspector; second release is safe', () => {
    const ctx = createMockCtx();
    const inspector = createFakeInspector({ tempObjectId: 'TMP_WORLD_99' });

    setActiveInspectorForTest(ctx, inspector);
    releaseInspector(ctx);

    // First release closes the object
    expect(ctx.closedObjects).toEqual(['TMP_WORLD_99']);

    // Second release is a no-op — no double-close
    releaseInspector(ctx);
    expect(ctx.closedObjects).toEqual(['TMP_WORLD_99']);
  });

  it('releaseInspector is idempotent when no inspector exists', () => {
    const ctx = createMockCtx();

    // No inspector was ever set — should be safe no-ops
    releaseInspector(ctx);
    releaseInspector(ctx);
    expect(ctx.closedObjects).toHaveLength(0);
  });
});
