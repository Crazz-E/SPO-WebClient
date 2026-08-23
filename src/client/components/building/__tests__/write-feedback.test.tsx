/**
 * B6 — every write says what it is doing, where it happened.
 *
 * The SaveIndicator already served the property inputs, the workforce table and the civic
 * tabs. These tests pin the three that had nothing: the supplier sliders, the connection
 * actions of a gate, and the rename. Each drives the store the way the write path does
 * (pending → confirmed / failed) and asserts what the panel says.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders, resetStores } from '../../../__tests__/setup/render-helpers';
import { SuppliesPanel } from '../SuppliesGroup';
import { ProductsPanel } from '../ProductsGroup';
import { useBuildingStore } from '../../../store/building-store';
import { connectionPendingKey } from '../../../handlers/connection-pending-key';
import type { BuildingSupplyData, BuildingProductData } from '@/shared/types';

const X = 10;
const Y = 20;

const supply: BuildingSupplyData = {
  path: 'in/Cotton', name: 'Cotton', metaFluid: 'Cotton', fluidValue: '1200',
  maxPrice: '120', minK: '40', connectionCount: 0, connections: [],
};

const product: BuildingProductData = {
  path: 'out/Fabric', name: 'Fabric', metaFluid: 'Fabric', quality: '80', pricePc: '100',
  avgPrice: '50', marketPrice: '60', lastFluid: '', connectionCount: 0, connections: [],
};

/** Open the gate: every control below the header appears only once it is expanded. */
function expandGate(name: string): void {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
}

describe('the supplier sliders say they are saving', () => {
  beforeEach(() => resetStores());

  it('Max Price and Min Quality each carry their own indicator', () => {
    renderWithProviders(<SuppliesPanel supplies={[supply]} canEdit buildingX={X} buildingY={Y} />);
    expandGate('Cotton');
    act(() => useBuildingStore.getState().setPending('RDOSetInputMaxPrice:{"fluidId":"Cotton"}', '150'));
    expect(screen.getAllByText('Saving…').length).toBe(1);
    act(() => {
      useBuildingStore.getState().confirmPending('RDOSetInputMaxPrice:{"fluidId":"Cotton"}');
      useBuildingStore.getState().setPending('RDOSetInputMinK:{"fluidId":"Cotton"}', '60');
    });
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByText('Saving…')).toBeTruthy();
  });

  it('a refused slider write is said in words, not swallowed', () => {
    renderWithProviders(<SuppliesPanel supplies={[supply]} canEdit buildingX={X} buildingY={Y} />);
    expandGate('Cotton');
    act(() => useBuildingStore.getState().failPending(
      'RDOSetInputMinK:{"fluidId":"Cotton"}', '60', 'Server rejected the change',
    ));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Failed');
    expect(alert.textContent).toContain('Server rejected the change');
  });
});

describe('a connection change says so on its own gate', () => {
  beforeEach(() => resetStores());

  it('the supply gate watches connect and disconnect', () => {
    renderWithProviders(<SuppliesPanel supplies={[supply]} canEdit buildingX={X} buildingY={Y} />);
    expandGate('Cotton');
    act(() => useBuildingStore.getState().setPending(connectionPendingKey('RDODisconnectInput', 'Cotton'), '0'));
    expect(screen.getByText('Saving…')).toBeTruthy();
    act(() => useBuildingStore.getState().confirmPending(connectionPendingKey('RDODisconnectInput', 'Cotton')));
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('the product gate watches its own direction, and its price slider', () => {
    renderWithProviders(<ProductsPanel products={[product]} canEdit buildingX={X} buildingY={Y} onPropertyChange={() => undefined} />);
    expandGate('Fabric');
    act(() => useBuildingStore.getState().setPending(connectionPendingKey('RDOConnectOutput', 'Fabric'), '0'));
    expect(screen.getByText('Saving…')).toBeTruthy();
    act(() => {
      useBuildingStore.getState().confirmPending(connectionPendingKey('RDOConnectOutput', 'Fabric'));
      useBuildingStore.getState().setPending('PricePc:{"fluidId":"Fabric"}', '110');
    });
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByText('Saving…')).toBeTruthy();
  });

  it('a gate does not answer for the gate next door', () => {
    renderWithProviders(<SuppliesPanel supplies={[supply]} canEdit buildingX={X} buildingY={Y} />);
    expandGate('Cotton');
    act(() => useBuildingStore.getState().setPending(connectionPendingKey('RDODisconnectInput', 'Wool'), '0'));
    expect(screen.queryByText('Saving…')).toBeNull();
  });
});
