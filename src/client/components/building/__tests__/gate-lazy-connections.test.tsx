/**
 * The Supplies and Products accordions share ONE expand-and-load mechanism.
 *
 * `useGateConnections` is that mechanism, and these tests drive it through both
 * panels — the same assertions, the same order — because the point of the hook
 * is that neither panel has its own version. A gate is collapsed until clicked;
 * clicking it reads that gate's connections and nothing else; a second click
 * costs nothing.
 *
 * Reference client: `RefreshFinger` loads `CurrentFinger` alone and only when
 * `not Info.Loaded` (Voyager/ProdSheetForm.pas:449-480).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders, resetStores, createSpiedCallbacks } from '../../../__tests__/setup/render-helpers';
import { SuppliesPanel } from '../SuppliesGroup';
import { ProductsPanel } from '../ProductsGroup';
import { useBuildingStore, gateKey } from '../../../store/building-store';
import { useGameStore } from '../../../store/game-store';
import type {
  BuildingSupplyData, BuildingProductData, BuildingConnectionData, BuildingDetailsResponse,
} from '@/shared/types';

const X = 118;
const Y = 226;

const makeDetails = (): BuildingDetailsResponse => ({
  buildingId: 'bld-1', x: X, y: Y, visualClass: '9013', templateName: 'Warehouse',
  buildingName: 'Export Storage 4', ownerName: 'TestCorp', securityId: 's',
  tabs: [], groups: {}, timestamp: 1,
});

const conn = (facilityName: string): BuildingConnectionData => ({
  facilityName, companyName: 'Yellow Inc.', createdBy: 'SPO_test3', price: '100',
  overprice: '10', lastValue: '900', cost: '$12', quality: '95%', connected: true,
  x: 40, y: 50,
});

const supply = (path: string, name: string, count: number): BuildingSupplyData => ({
  path, name, metaFluid: name, fluidValue: '1200', connectionCount: count, connections: [],
});

const product = (path: string, name: string, count: number): BuildingProductData => ({
  path, name, metaFluid: name, lastFluid: '80', quality: '90', pricePc: '110',
  avgPrice: '105', marketPrice: '5000', connectionCount: count, connections: [],
});

const SUPPLIES = [supply('SegA', 'Books', 2), supply('SegB', 'Cars', 1)];
const PRODUCTS = [product('GateA', 'Toys', 2), product('GateB', 'Fuel', 1)];

/** The store as a freshly opened tab leaves it: headers, no rows. */
function seedPanel(): void {
  useBuildingStore.getState().setDetails(makeDetails());
  useBuildingStore.getState().mergeTabData('supplies', { supplies: SUPPLIES }, X, Y);
  useBuildingStore.getState().mergeTabData('products', { products: PRODUCTS }, X, Y);
}

beforeEach(() => {
  resetStores();
  useGameStore.setState({ status: 'connected' });
  seedPanel();
});

const NO_SUPPLIES: BuildingSupplyData[] = [];
const NO_PRODUCTS: BuildingProductData[] = [];

/**
 * Hosts that take their rows from the store, as BuildingInspector does. A gate
 * merge has to reach the screen, and it only does through a subscription.
 */
function SuppliesHost() {
  const supplies = useBuildingStore((s) => s.details?.supplies ?? NO_SUPPLIES);
  return <SuppliesPanel supplies={supplies} canEdit={false} buildingX={X} buildingY={Y} />;
}

function ProductsHost() {
  const products = useBuildingStore((s) => s.details?.products ?? NO_PRODUCTS);
  return (
    <ProductsPanel
      products={products}
      canEdit={false}
      buildingX={X}
      buildingY={Y}
      onPropertyChange={() => { /* not under test */ }}
    />
  );
}

/**
 * The two panels, described identically. Each case names the gate it clicks and
 * how the panel labels a connection, and nothing else differs.
 */
const PANELS = [
  {
    tabId: 'supplies' as const,
    label: 'Supplies',
    gate: 'SegA',
    gateName: 'Books',
    otherGate: 'SegB',
    header: 'Books',
    pending: /Loading suppliers/,
    failure: /Could not read the suppliers/,
    loadedGate: (): BuildingSupplyData => ({ ...SUPPLIES[0], connections: [conn('Farm A')] }),
    render: (onRequest: (...a: unknown[]) => unknown) => renderWithProviders(
      <SuppliesHost />,
      { clientCallbacks: createSpiedCallbacks({ onRequestGateConnections: onRequest }) },
    ),
  },
  {
    tabId: 'products' as const,
    label: 'Products',
    gate: 'GateA',
    gateName: 'Toys',
    otherGate: 'GateB',
    header: 'Toys',
    pending: /Loading buyers/,
    failure: /Could not read the buyers/,
    loadedGate: (): BuildingProductData => ({ ...PRODUCTS[0], connections: [conn('Farm A')] }),
    render: (onRequest: (...a: unknown[]) => unknown) => renderWithProviders(
      <ProductsHost />,
      { clientCallbacks: createSpiedCallbacks({ onRequestGateConnections: onRequest }) },
    ),
  },
];

describe.each(PANELS)('$label — one gate at a time', (panel) => {
  it('reads nothing while every gate is collapsed', () => {
    const onRequest = jest.fn();
    panel.render(onRequest);

    expect(onRequest).not.toHaveBeenCalled();
  });

  it('reads exactly the gate that was clicked', () => {
    const onRequest = jest.fn();
    panel.render(onRequest);

    fireEvent.click(screen.getByText(panel.header));

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onRequest).toHaveBeenCalledWith(X, Y, panel.tabId, panel.gate, panel.gateName, '9013');
  });

  it('says the rows are on their way rather than claiming there are none', () => {
    // An empty `connections` before the read means "not read yet". Rendering
    // that as "No suppliers connected" would contradict the count next to it.
    panel.render(jest.fn());

    fireEvent.click(screen.getByText(panel.header));

    expect(screen.getByText(panel.pending)).toBeTruthy();
  });

  it('does not read the gate again when it is re-opened', () => {
    const onRequest = jest.fn();
    panel.render(onRequest);

    fireEvent.click(screen.getByText(panel.header)); // open — reads
    act(() => {
      useBuildingStore.getState().mergeGateData(panel.tabId, panel.gate, panel.loadedGate(), X, Y);
    });
    fireEvent.click(screen.getByText(panel.header)); // close
    fireEvent.click(screen.getByText(panel.header)); // open again

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Farm A')).toBeTruthy();
  });

  it('re-reads the gate after an invalidation, which is what a connection change triggers', () => {
    const onRequest = jest.fn();
    panel.render(onRequest);

    fireEvent.click(screen.getByText(panel.header));
    act(() => {
      useBuildingStore.getState().mergeGateData(panel.tabId, panel.gate, panel.loadedGate(), X, Y);
    });
    expect(onRequest).toHaveBeenCalledTimes(1);

    act(() => {
      useBuildingStore.getState().invalidateTabs([panel.tabId]);
    });

    expect(onRequest).toHaveBeenCalledTimes(2);
  });

  it('offers a way back from a failed read', () => {
    const onRequest = jest.fn();
    panel.render(onRequest);

    fireEvent.click(screen.getByText(panel.header));
    act(() => {
      useBuildingStore.getState().setGateError(panel.tabId, panel.gate);
    });
    expect(screen.getByText(panel.failure)).toBeTruthy();
    // Terminal until the user acts: no retry storm on re-render.
    expect(onRequest).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(panel.header)); // close
    fireEvent.click(screen.getByText(panel.header)); // open again — retries

    expect(onRequest).toHaveBeenCalledTimes(2);
  });

  it('leaves the other gates alone', () => {
    const onRequest = jest.fn();
    panel.render(onRequest);

    fireEvent.click(screen.getByText(panel.header));

    expect(useBuildingStore.getState().expandedGates.has(gateKey(panel.tabId, panel.otherGate))).toBe(false);
    expect(onRequest.mock.calls.every((c) => c[3] === panel.gate)).toBe(true);
  });

  it('stays open across a re-render with a new gate array', () => {
    // `resetTabLoadingStates` replaces the list on every auto-refresh; if the
    // open state lived in the card it would die with the card, collapsing the
    // gate the user is reading and throwing away the rows just fetched for it.
    const onRequest = jest.fn();
    const { rerender } = panel.render(onRequest) as ReturnType<typeof renderWithProviders>;

    fireEvent.click(screen.getByText(panel.header));
    expect(useBuildingStore.getState().expandedGates.has(gateKey(panel.tabId, panel.gate))).toBe(true);

    rerender(<div />);

    expect(useBuildingStore.getState().expandedGates.has(gateKey(panel.tabId, panel.gate))).toBe(true);
  });

  it('asks for nothing while the socket is down', () => {
    useGameStore.setState({ status: 'disconnected' });
    const onRequest = jest.fn();
    panel.render(onRequest);

    fireEvent.click(screen.getByText(panel.header));

    expect(onRequest).not.toHaveBeenCalled();
  });
});
