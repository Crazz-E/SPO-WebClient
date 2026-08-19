/**
 * requestGateConnections — the click-time read behind both accordions.
 *
 * `requestTabData` brings back gate headers with empty connection lists; this
 * is what fills one gate in. The rules it has to hold are the ones the tab path
 * already learned the hard way: ask once, never spin on a failure, and refuse a
 * reply that arrived after the user moved on.
 */

import { requestGateConnections } from './building-action-handler';
import { useBuildingStore, gateKey } from '../store/building-store';
import { useGameStore } from '../store/game-store';
import { WsMessageType } from '../../shared/types';
import type { ClientHandlerContext } from './client-context';
import type { BuildingDetailsResponse, BuildingSupplyData, BuildingProductData } from '../../shared/types';

jest.mock('../bridge/client-bridge', () => ({
  ClientBridge: { log: jest.fn() },
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
  timestamp: 1,
});

const supplyGate = (path: string, connections: BuildingSupplyData['connections'] = []): BuildingSupplyData => ({
  path, name: 'Books', metaFluid: 'Books', fluidValue: '',
  connectionCount: connections.length, connections,
});

const productGate = (path: string): BuildingProductData => ({
  path, name: 'Cars', metaFluid: 'Cars', lastFluid: '', quality: '', pricePc: '',
  avgPrice: '', marketPrice: '', connectionCount: 0, connections: [],
});

const row = {
  facilityName: 'Farm A', companyName: 'Yellow Inc.', createdBy: 'SPO_test3',
  price: '100', overprice: '10', lastValue: '900', cost: '$12', quality: '95%',
  connected: true, x: 40, y: 50,
};

function makeCtx(reply: unknown): { ctx: ClientHandlerContext; sendRequest: jest.Mock } {
  const sendRequest = jest.fn().mockImplementation(async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return { ctx: { sendRequest } as unknown as ClientHandlerContext, sendRequest };
}

/** A panel showing two supply gates and one product gate, headers only. */
function seedHeaders(): void {
  const store = useBuildingStore.getState();
  store.setDetails(makeDetails(10, 20));
  store.mergeTabData('supplies', { supplies: [supplyGate('SegA'), supplyGate('SegB')] }, 10, 20);
  store.mergeTabData('products', { products: [productGate('GateA')] }, 10, 20);
}

beforeEach(() => {
  jest.clearAllMocks();
  useBuildingStore.getState().clearDetails();
  useGameStore.setState({ status: 'connected' });
});

describe('requestGateConnections', () => {
  it('sends REQ_BUILDING_GATE_CONNECTIONS with the gate identity the server needs', async () => {
    seedHeaders();
    const { ctx, sendRequest } = makeCtx({
      x: 10, y: 20, tabId: 'supplies', path: 'SegA', supply: supplyGate('SegA', [row]),
    });

    await requestGateConnections(ctx, 10, 20, 'supplies', 'SegA', 'Books', '1234');

    expect(sendRequest).toHaveBeenCalledWith({
      type: WsMessageType.REQ_BUILDING_GATE_CONNECTIONS,
      x: 10,
      y: 20,
      tabId: 'supplies',
      path: 'SegA',
      // The name rides along: the reply replaces the whole gate record, and only
      // GetInputNames/GetOutputNames knows the gate's name — this path calls
      // neither.
      name: 'Books',
      visualClass: '1234',
    });
  });

  it('merges the rows into the gate that asked for them', async () => {
    seedHeaders();
    const { ctx } = makeCtx({ supply: supplyGate('SegA', [row]) });

    await requestGateConnections(ctx, 10, 20, 'supplies', 'SegA', 'Books', '1234');

    const supplies = useBuildingStore.getState().details!.supplies!;
    expect(supplies[0].connections).toEqual([row]);
    expect(supplies[1].connections).toEqual([]);
    expect(useBuildingStore.getState().gateLoadingStates[gateKey('supplies', 'SegA')]).toBe('loaded');
  });

  it('reads the product half of the reply for a product gate', async () => {
    seedHeaders();
    const { ctx } = makeCtx({ product: { ...productGate('GateA'), connectionCount: 4 } });

    await requestGateConnections(ctx, 10, 20, 'products', 'GateA', 'Cars', '1234');

    expect(useBuildingStore.getState().details!.products![0].connectionCount).toBe(4);
  });

  it('asks once: a gate already loaded is not read again', async () => {
    seedHeaders();
    const { ctx, sendRequest } = makeCtx({ supply: supplyGate('SegA', [row]) });

    await requestGateConnections(ctx, 10, 20, 'supplies', 'SegA', 'Books', '1234');
    await requestGateConnections(ctx, 10, 20, 'supplies', 'SegA', 'Books', '1234');

    expect(sendRequest).toHaveBeenCalledTimes(1);
  });

  it('does not stack a second read on top of one in flight', async () => {
    seedHeaders();
    const { ctx, sendRequest } = makeCtx({ supply: supplyGate('SegA', [row]) });

    const first = requestGateConnections(ctx, 10, 20, 'supplies', 'SegA', 'Books', '1234');
    await requestGateConnections(ctx, 10, 20, 'supplies', 'SegA', 'Books', '1234');
    await first;

    expect(sendRequest).toHaveBeenCalledTimes(1);
  });

  it('reads a second gate independently of the first', async () => {
    seedHeaders();
    const { ctx, sendRequest } = makeCtx({ supply: supplyGate('SegB', [row]) });

    await requestGateConnections(ctx, 10, 20, 'supplies', 'SegA', 'Books', '1234');
    await requestGateConnections(ctx, 10, 20, 'supplies', 'SegB', 'Cars', '1234');

    expect(sendRequest).toHaveBeenCalledTimes(2);
  });

  it('stays silent while disconnected, and leaves the gate askable', async () => {
    seedHeaders();
    useGameStore.setState({ status: 'disconnected' });
    const { ctx, sendRequest } = makeCtx({ supply: supplyGate('SegA', [row]) });

    await requestGateConnections(ctx, 10, 20, 'supplies', 'SegA', 'Books', '1234');

    expect(sendRequest).not.toHaveBeenCalled();
    expect(useBuildingStore.getState().gateLoadingStates).toEqual({});
  });

  it('marks the gate errored when the request fails, so it does not spin', async () => {
    seedHeaders();
    const { ctx } = makeCtx(new Error('Request timeout'));

    await requestGateConnections(ctx, 10, 20, 'supplies', 'SegA', 'Books', '1234');

    expect(useBuildingStore.getState().gateLoadingStates[gateKey('supplies', 'SegA')]).toBe('error');
    expect(useBuildingStore.getState().details!.supplies![0].connections).toEqual([]);
  });

  it('marks the gate errored when the server refuses the SetPath and sends nothing back', async () => {
    // getBuildingGateConnections answers `{}` when SetPath is refused: the gate
    // is gone, or the shared temp object was somewhere else. Treating that as a
    // successful empty read would claim the gate has no connections.
    seedHeaders();
    const { ctx } = makeCtx({ x: 10, y: 20, tabId: 'supplies', path: 'SegA' });

    await requestGateConnections(ctx, 10, 20, 'supplies', 'SegA', 'Books', '1234');

    expect(useBuildingStore.getState().gateLoadingStates[gateKey('supplies', 'SegA')]).toBe('error');
  });

  it('refuses a reply that arrived after the user moved to another building', async () => {
    seedHeaders();
    const { ctx } = makeCtx({ supply: supplyGate('SegA', [row]) });

    const inFlight = requestGateConnections(ctx, 10, 20, 'supplies', 'SegA', 'Books', '1234');
    // The panel moves on while the read is out.
    useBuildingStore.getState().setDetails(makeDetails(99, 99));
    await inFlight;

    expect(useBuildingStore.getState().details!.supplies).toBeUndefined();
  });
});
