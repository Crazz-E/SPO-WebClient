/**
 * Race Condition Integration Tests — verifies guards against the exact
 * user behaviors that caused production crashes.
 *
 * Uses Jest fake timers to control response delivery order.
 * All tests run fully offline via MockWebSocketClient.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage, BuildingDetailsResponse, BuildingFocusInfo } from '@/shared/types';
import { createTestHarness, type TestHarness } from './test-harness';
import {
  showBuildingOverlay,
  openInspectorForFocused,
  unfocusBuilding,
} from '@/client/handlers/building-focus-handler';
import { dispatchEvent } from '@/client/handlers/event-handler';
import { ClientBridge } from '@/client/bridge/client-bridge';

/* ── Mocks ─────────────────────────────────────────────────────────────── */

jest.mock('@/client/components/common/Toast', () => ({
  showToast: jest.fn(),
}));

jest.mock('@/shared/building-details/civic-buildings', () => ({
  isCivicBuilding: () => false,
}));

jest.mock('@/client/facility-dimensions-cache', () => ({
  getFacilityDimensionsCache: () => ({
    getFacility: () => ({ xsize: 1, ysize: 1 }),
  }),
}));

jest.mock('@/shared/building-details', () => ({
  registerInspectorTabs: jest.fn(),
}));

/* ── Helpers ───────────────────────────────────────────────────────────── */

function makeFocusInfo(x: number, y: number, name: string): BuildingFocusInfo {
  return {
    buildingId: `${x * 1000 + y}`,
    buildingName: name,
    ownerName: 'TestCorp',
    x,
    y,
    xsize: 1,
    ysize: 1,
    visualClass: '100',
  } as BuildingFocusInfo;
}

function makeDetails(x: number, y: number, name: string): BuildingDetailsResponse {
  return {
    x,
    y,
    buildingId: `${x * 1000 + y}`,
    securityId: 'sec-test',
    timestamp: Date.now(),
    visualClass: '100',
    templateName: 'TestTemplate',
    ownerName: 'TestCorp',
    buildingName: name,
    tabs: [],
    groups: {},
  } as BuildingDetailsResponse;
}

/* ── 3a. Stale Response Rejection (Generation Tracking) ────────────────── */

describe('Race Conditions: Stale Response Rejection', () => {
  let h: TestHarness;

  beforeEach(() => {
    h = createTestHarness(['switch-focus', 'building-details']);
  });

  afterEach(() => {
    h?.cleanup();
  });

  it('rejects stale building refresh when user switched buildings', async () => {
    // Setup: Focus building A at (472, 392)
    await showBuildingOverlay(h.ctx, 472, 392, '100');
    const buildingA = h.ctx.currentFocusedBuilding!;
    expect(buildingA.x).toBe(472);

    // User switches to building B — this increments generation counter
    await showBuildingOverlay(h.ctx, 477, 392, '200');
    expect(h.ctx.currentFocusedBuilding!.x).toBe(477);

    // Now simulate a stale EVENT_BUILDING_REFRESH for building A
    // (the server didn't know we switched yet)
    dispatchEvent(h.ctx, {
      type: WsMessageType.EVENT_BUILDING_REFRESH,
      building: makeFocusInfo(472, 392, 'Stale Farm'),
      kindOfChange: 0,
    } as WsMessage);

    // Building B should still be focused — stale refresh must NOT overwrite
    expect(h.ctx.currentFocusedBuilding!.x).toBe(477);
    expect(h.ctx.currentFocusedBuilding!.buildingName).not.toBe('Stale Farm');
  });

  it('accepts building refresh for the currently focused building', async () => {
    // Focus building A
    await showBuildingOverlay(h.ctx, 472, 392, '100');

    // Simulate refresh for the SAME building — use the same buildingId
    // that the scenario returned
    const currentId = h.ctx.currentFocusedBuilding!.buildingId;
    const refreshedInfo = {
      ...makeFocusInfo(472, 392, 'Updated Farm'),
      buildingId: currentId,
    };
    dispatchEvent(h.ctx, {
      type: WsMessageType.EVENT_BUILDING_REFRESH,
      building: refreshedInfo,
      kindOfChange: 0,
    } as WsMessage);

    // Should accept — it's the current building (matched by buildingId)
    expect(h.ctx.currentFocusedBuilding!.buildingName).toBe('Updated Farm');
  });
});

/* ── 3b. Optimistic UI Rollback ────────────────────────────────────────── */

describe('Race Conditions: Optimistic UI Rollback', () => {
  let h: TestHarness;

  beforeEach(() => {
    h = createTestHarness(['switch-focus']);
  });

  afterEach(() => {
    h?.cleanup();
  });

  it('tracks pending update and reverts on server rejection', () => {
    const store = h.stores.building;

    // Simulate user setting a price (optimistic)
    store.getState().setPending('price.output.0', '$150');

    // Verify pending state
    expect(store.getState().pendingUpdates.has('price.output.0')).toBe(true);
    expect(store.getState().pendingUpdates.get('price.output.0')!.value).toBe('$150');

    // Server rejects — trigger failPending with original value
    store.getState().failPending('price.output.0', '$100', 'Server rejected: price too high');

    // Pending should be cleared, failed should have original value
    expect(store.getState().pendingUpdates.has('price.output.0')).toBe(false);
    expect(store.getState().failedUpdates.has('price.output.0')).toBe(true);
    expect(store.getState().failedUpdates.get('price.output.0')!.originalValue).toBe('$100');
    expect(store.getState().failedUpdates.get('price.output.0')!.error).toBe('Server rejected: price too high');
  });

  it('clears pending on server confirmation', () => {
    const store = h.stores.building;

    // Simulate user setting a price (optimistic)
    store.getState().setPending('price.output.0', '$150');
    expect(store.getState().pendingUpdates.has('price.output.0')).toBe(true);

    // Server confirms
    store.getState().confirmPending('price.output.0');

    // Pending cleared, confirmed set
    expect(store.getState().pendingUpdates.has('price.output.0')).toBe(false);
    expect(store.getState().confirmedUpdates.has('price.output.0')).toBe(true);
  });
});

/* ── 3c. Double-Click / Idempotency Guard ──────────────────────────────── */

describe('Race Conditions: Double-Click Guard', () => {
  let h: TestHarness;

  beforeEach(() => {
    h = createTestHarness(['switch-focus']);
  });

  afterEach(() => {
    h?.cleanup();
  });

  it('ignores second click while first focus is in-flight', async () => {
    // Simulate first click starting (sets isFocusingBuilding = true internally)
    // We control this by calling showBuildingOverlay twice concurrently
    const firstClick = showBuildingOverlay(h.ctx, 472, 392, '100');

    // Second click while first is still in-flight
    // isFocusingBuilding should be true, so this returns immediately
    const secondClick = showBuildingOverlay(h.ctx, 472, 392, '100');

    await Promise.all([firstClick, secondClick]);

    // sendRequest should have been called only once (first click)
    // The second was blocked by the isFocusingBuilding guard
    expect(h.ctx.sendRequest).toHaveBeenCalledTimes(1);
  });
});

/* ── 3d. Push Contamination ────────────────────────────────────────────── */

describe('Race Conditions: Push Contamination', () => {
  let h: TestHarness;

  beforeEach(() => {
    h = createTestHarness(['switch-focus', 'building-details']);
  });

  afterEach(() => {
    h?.cleanup();
  });

  it('ignores push update for building A after switching to building B', async () => {
    // Focus building A and set details directly via store
    await showBuildingOverlay(h.ctx, 472, 392, '100');
    const detailsA = makeDetails(472, 392, 'Farm A');
    h.stores.building.getState().setDetails(detailsA);
    expect(h.stores.building.getState().details?.buildingName).toBe('Farm A');

    // Switch to building B
    await showBuildingOverlay(h.ctx, 477, 392, '200');
    const detailsB = makeDetails(477, 392, 'Market B');
    h.stores.building.getState().setDetails(detailsB);
    expect(h.stores.building.getState().details?.buildingName).toBe('Market B');

    // Late push arrives for building A (stale EVENT_BUILDING_REFRESH)
    // The building ID doesn't match current focus, so it should be ignored
    dispatchEvent(h.ctx, {
      type: WsMessageType.EVENT_BUILDING_REFRESH,
      building: makeFocusInfo(472, 392, 'Stale Farm A'),
      kindOfChange: 0,
    } as WsMessage);

    // Store must still show building B — no contamination
    expect(h.stores.building.getState().details?.buildingName).toBe('Market B');
    expect(h.ctx.currentFocusedBuilding!.x).toBe(477);
  });

  it('clears optimistic updates when switching buildings', async () => {
    // Focus building A and set a pending update
    await showBuildingOverlay(h.ctx, 472, 392, '100');
    const detailsA = makeDetails(472, 392, 'Farm A');
    (h.ctx.requestBuildingDetails as jest.Mock).mockResolvedValue(detailsA);
    await openInspectorForFocused(h.ctx, 472, 392, '100');

    h.stores.building.getState().setPending('price.0', '$200');
    expect(h.stores.building.getState().pendingUpdates.size).toBe(1);

    // Switch to building B — setDetails for a DIFFERENT building should clear pending
    const detailsB = makeDetails(477, 392, 'Market B');
    h.stores.building.getState().setDetails(detailsB);

    // Pending updates from building A should be cleared (cross-building leak prevention)
    expect(h.stores.building.getState().pendingUpdates.size).toBe(0);
  });
});
