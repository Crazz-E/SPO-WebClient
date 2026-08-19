/**
 * Tests for building-action-handler — the refresh that follows a connection change.
 *
 * `requestBuildingRefreshProperties` cannot show a connection that was just made
 * or dropped: it returns every lazy tab as `undefined`
 * (building-details-handler.ts:575-579) and the store carries the previous
 * values forward (building-store.ts:213-216). These tests pin the invalidation
 * that makes the lists re-read, and the ordering it depends on.
 */

import { refreshAfterConnectionChange, handleBuildingAction } from './building-action-handler';
import { useBuildingStore } from '../store/building-store';
import { ClientBridge } from '../bridge/client-bridge';
import type { ClientHandlerContext } from './client-context';
import type { BuildingDetailsResponse } from '../../shared/types';

/* ── Mocks ──────────────────────────────────────────────────────────── */

jest.mock('../bridge/client-bridge', () => ({
  ClientBridge: {
    log: jest.fn(),
    // The real bridge funnels into setDetails, and setDetails is exactly what
    // re-marks a lazy tab 'loaded' from carried-forward data
    // (building-store.ts:197-200). Reproducing that is the point of the
    // ordering test below — a mock that only records the call would pass even
    // if the handler invalidated too early.
    updateBuildingDetails: jest.fn((details: BuildingDetailsResponse) => {
      useBuildingStore.getState().setDetails(details);
    }),
    // The optimistic-feedback trio the SET path drives on its way through.
    setPendingUpdate: jest.fn(),
    confirmPendingUpdate: jest.fn(),
    failPendingUpdate: jest.fn(),
  },
}));

jest.mock('../components/common/Toast', () => ({
  showToast: jest.fn(() => 'toast-id'),
  dismissToast: jest.fn(),
}));

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
  timestamp: Date.now(),
});

const mockSupplies = [{ metaFluid: 'steel', name: 'Steel', connectionCount: 1, connections: [] }];
const mockProducts = [{
  metaFluid: 'oil', name: 'Oil', quality: '80', pricePc: '100',
  avgPrice: '50', marketPrice: '60', lastFluid: '', connectionCount: 1, connections: [],
}];

function makeCtx(refreshed: BuildingDetailsResponse | null = makeDetails(10, 20)): ClientHandlerContext {
  return {
    currentFocusedVisualClass: '1234',
    sendRequest: jest.fn().mockImplementation(async () => {
      if (refreshed === null) throw new Error('refresh failed');
      return { details: refreshed };
    }),
    showNotification: jest.fn(),
  } as unknown as ClientHandlerContext;
}

/** Put the store in the state a loaded supplies+products panel leaves behind. */
function seedLoadedPanel(): void {
  useBuildingStore.getState().setDetails(makeDetails(10, 20));
  useBuildingStore.getState().mergeTabData(
    'supplies', { supplies: mockSupplies as never }, 10, 20,
  );
  useBuildingStore.getState().mergeTabData(
    'products', { products: mockProducts as never }, 10, 20,
  );
}

describe('refreshAfterConnectionChange', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useBuildingStore.getState().clearDetails();
  });

  it('clears the load state of both connection lists', async () => {
    seedLoadedPanel();
    expect(useBuildingStore.getState().tabLoadingStates['supplies']).toBe('loaded');
    expect(useBuildingStore.getState().tabLoadingStates['products']).toBe('loaded');

    await refreshAfterConnectionChange(makeCtx(), 10, 20);

    expect(useBuildingStore.getState().tabLoadingStates['supplies']).toBeUndefined();
    expect(useBuildingStore.getState().tabLoadingStates['products']).toBeUndefined();
  });

  it('invalidates AFTER updateBuildingDetails, or setDetails puts the tabs straight back to loaded', async () => {
    // The whole defect in one assertion. setDetails re-marks a lazy tab 'loaded'
    // whenever the carried-forward data is non-empty, so invalidating before the
    // refresh lands is silently undone and the stale list never re-reads.
    seedLoadedPanel();

    await refreshAfterConnectionChange(makeCtx(), 10, 20);

    expect(ClientBridge.updateBuildingDetails).toHaveBeenCalledTimes(1);
    expect(useBuildingStore.getState().tabLoadingStates['supplies']).toBeUndefined();
  });

  it('leaves the current rows on screen so the panel does not flash empty', async () => {
    seedLoadedPanel();

    await refreshAfterConnectionChange(makeCtx(), 10, 20);

    expect(useBuildingStore.getState().details!.supplies).toBe(mockSupplies);
    expect(useBuildingStore.getState().details!.products).toBe(mockProducts);
  });

  it('does not touch lazy tabs that carry no connection list', async () => {
    seedLoadedPanel();
    useBuildingStore.getState().mergeTabData(
      'compInputs', { compInputs: [{ name: 'x' }] as never }, 10, 20,
    );

    await refreshAfterConnectionChange(makeCtx(), 10, 20);

    expect(useBuildingStore.getState().tabLoadingStates['compInputs']).toBe('loaded');
  });

  it('still invalidates when the refresh request fails', async () => {
    // A failed refresh is the case where a re-read matters most: the lists are
    // known to be stale and nothing else will clear them.
    seedLoadedPanel();

    await refreshAfterConnectionChange(makeCtx(null), 10, 20);

    expect(ClientBridge.updateBuildingDetails).not.toHaveBeenCalled();
    expect(useBuildingStore.getState().tabLoadingStates['supplies']).toBeUndefined();
  });

  it('falls back to visual class 0 when none is focused', async () => {
    seedLoadedPanel();
    const ctx = makeCtx();
    (ctx as { currentFocusedVisualClass: string | null }).currentFocusedVisualClass = null;

    await refreshAfterConnectionChange(ctx, 10, 20);

    expect(ctx.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ x: 10, y: 20, visualClass: '0' }),
    );
  });
});

describe('Quick Trade buttons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useBuildingStore.getState().clearDetails();
  });

  /**
   * `handleBuildingAction` is fire-and-forget, and the trade actions await a
   * SET plus a refresh. Draining the microtask queue is enough — nothing here
   * uses a timer.
   */
  const drain = () => new Promise<void>((resolve) => setImmediate(resolve));

  function makeTradeCtx(setSucceeds: boolean) {
    const details = makeDetails(10, 20);
    const ctx = {
      currentFocusedVisualClass: '1234',
      inFlightSetProperty: new Map(),
      showNotification: jest.fn(),
      sendRequest: jest.fn().mockImplementation(async (req: { type: string }) => {
        if (req.type === 'REQ_BUILDING_SET_PROPERTY') {
          return { success: setSucceeds, newValue: '', confirmed: undefined };
        }
        return { details };
      }),
    } as unknown as ClientHandlerContext;
    return { ctx, details };
  }

  it.each([
    ['tradeConnect:1', 'warehouses'],
    ['tradeConnect:2', 'factories'],
    ['tradeConnect:4', 'stores'],
  ])('%s reports only that the request went out', async (actionId, label) => {
    // Not "Connected all your X": the server connects the facilities that match
    // and connecting none is a normal outcome (Kernel/Kernel.pas:4536-4556).
    // Nothing on the wire reports the count, so the toast must not imply one.
    const { ctx, details } = makeTradeCtx(true);
    seedLoadedPanel();

    handleBuildingAction(ctx, actionId, details);
    await drain();

    expect(ctx.showNotification).toHaveBeenCalledWith(
      `Sent connect request for your ${label}`, 'success',
    );
  });

  it('tradeDisconnect reports only that the request went out', async () => {
    const { ctx, details } = makeTradeCtx(true);
    seedLoadedPanel();

    handleBuildingAction(ctx, 'tradeDisconnect:1', details);
    await drain();

    expect(ctx.showNotification).toHaveBeenCalledWith(
      'Sent disconnect request for your warehouses', 'success',
    );
  });

  it('re-reads the connection lists after a successful connect', async () => {
    // Without this the refresh carries the old lists forward and the button
    // looks dead even when the server did the work.
    const { ctx, details } = makeTradeCtx(true);
    seedLoadedPanel();

    handleBuildingAction(ctx, 'tradeConnect:1', details);
    await drain();

    expect(useBuildingStore.getState().tabLoadingStates['supplies']).toBeUndefined();
    expect(useBuildingStore.getState().tabLoadingStates['products']).toBeUndefined();
  });

  it('does not refresh, and says so, when the SET failed', async () => {
    const { ctx, details } = makeTradeCtx(false);
    seedLoadedPanel();

    handleBuildingAction(ctx, 'tradeConnect:1', details);
    await drain();

    expect(ctx.showNotification).toHaveBeenCalledWith('Failed to connect warehouses', 'error');
    expect(useBuildingStore.getState().tabLoadingStates['supplies']).toBe('loaded');
  });

  it('does not refresh, and says so, when the disconnect SET failed', async () => {
    const { ctx, details } = makeTradeCtx(false);
    seedLoadedPanel();

    handleBuildingAction(ctx, 'tradeDisconnect:4', details);
    await drain();

    expect(ctx.showNotification).toHaveBeenCalledWith('Failed to disconnect stores', 'error');
    expect(useBuildingStore.getState().tabLoadingStates['products']).toBe('loaded');
  });
});
