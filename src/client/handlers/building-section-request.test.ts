/**
 * `requestTabData` — the section-at-a-time read behind the inspector menu.
 *
 * The panel opens on the header group; every other section is read here when
 * its menu entry is opened. Two shapes travel on the same message: a gate tab
 * asks by id alone, a property section asks by group id, and a civic tab asks
 * for the several groups it consolidates in one round-trip.
 */

import { requestTabData } from './building-action-handler';
import { useBuildingStore } from '../store/building-store';
import { useGameStore } from '../store/game-store';
import { WsMessageType } from '../../shared/types';
import type { ClientHandlerContext } from './client-context';
import type { BuildingDetailsResponse } from '../../shared/types';

jest.mock('../bridge/client-bridge', () => ({
  ClientBridge: { log: jest.fn() },
}));

const makeDetails = (x: number, y: number): BuildingDetailsResponse => ({
  buildingId: `bld-${x}-${y}`,
  x, y,
  visualClass: '1234',
  templateName: 'Factory',
  buildingName: 'Small Factory',
  ownerName: 'TestCorp',
  securityId: 'sec-1',
  canGovern: true,
  tabs: [],
  groups: { indGeneral: [{ name: 'ROI', value: '12%' }] },
  timestamp: 1,
});

function makeCtx(reply: unknown): { ctx: ClientHandlerContext; sendRequest: jest.Mock } {
  const sendRequest = jest.fn().mockImplementation(async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return { ctx: { sendRequest } as unknown as ClientHandlerContext, sendRequest };
}

beforeEach(() => {
  jest.clearAllMocks();
  useBuildingStore.getState().clearDetails();
  useBuildingStore.getState().setDetails(makeDetails(10, 20));
  useGameStore.setState({ status: 'connected' });
});

describe('requestTabData — property sections', () => {
  it('names the group it wants', async () => {
    const { ctx, sendRequest } = makeCtx({ x: 10, y: 20, tabId: 'workforce', groups: {} });

    await requestTabData(ctx, 10, 20, 'workforce', '1234', ['workforce']);

    expect(sendRequest).toHaveBeenCalledWith({
      type: WsMessageType.REQ_BUILDING_TAB_DATA,
      x: 10, y: 20,
      tabId: 'workforce',
      visualClass: '1234',
      groupIds: ['workforce'],
    });
  });

  it('asks for every group a civic tab consolidates, in one request', async () => {
    const { ctx, sendRequest } = makeCtx({ x: 10, y: 20, tabId: 'administration', groups: {} });

    await requestTabData(ctx, 10, 20, 'administration', '152', ['capitolTowns', 'ministeries', 'townTaxes']);

    expect(sendRequest.mock.calls[0][0].groupIds)
      .toEqual(['capitolTowns', 'ministeries', 'townTaxes']);
  });

  it('merges the returned groups into the panel', async () => {
    const { ctx } = makeCtx({
      x: 10, y: 20, tabId: 'workforce',
      groups: { workforce: [{ name: 'Workers0', value: '25' }] },
    });

    await requestTabData(ctx, 10, 20, 'workforce', '1234', ['workforce']);

    const groups = useBuildingStore.getState().details!.groups;
    expect(groups['workforce']).toEqual([{ name: 'Workers0', value: '25' }]);
    // The header group the opening read brought back survives the merge.
    expect(groups['indGeneral']).toEqual([{ name: 'ROI', value: '12%' }]);
    expect(useBuildingStore.getState().tabLoadingStates['workforce']).toBe('loaded');
  });
});

describe('requestTabData — gate tabs', () => {
  it('omits groupIds entirely: a gate tab carries no template properties', async () => {
    const { ctx, sendRequest } = makeCtx({ x: 10, y: 20, tabId: 'supplies', supplies: [] });

    await requestTabData(ctx, 10, 20, 'supplies', '1234');

    expect(sendRequest).toHaveBeenCalledWith({
      type: WsMessageType.REQ_BUILDING_TAB_DATA,
      x: 10, y: 20,
      tabId: 'supplies',
      visualClass: '1234',
    });
    expect(sendRequest.mock.calls[0][0]).not.toHaveProperty('groupIds');
  });

  it('omits an empty group list rather than sending one', async () => {
    const { ctx, sendRequest } = makeCtx({ x: 10, y: 20, tabId: 'supplies', supplies: [] });

    await requestTabData(ctx, 10, 20, 'supplies', '1234', []);

    expect(sendRequest.mock.calls[0][0]).not.toHaveProperty('groupIds');
  });
});

describe('requestTabData — guards', () => {
  it('sends nothing while disconnected', async () => {
    useGameStore.setState({ status: 'disconnected' });
    const { ctx, sendRequest } = makeCtx({});

    await requestTabData(ctx, 10, 20, 'workforce', '1234', ['workforce']);

    expect(sendRequest).not.toHaveBeenCalled();
  });

  it('asks once — a section already loaded is not read again', async () => {
    const { ctx, sendRequest } = makeCtx({ x: 10, y: 20, tabId: 'workforce', groups: {} });

    await requestTabData(ctx, 10, 20, 'workforce', '1234', ['workforce']);
    await requestTabData(ctx, 10, 20, 'workforce', '1234', ['workforce']);

    expect(sendRequest).toHaveBeenCalledTimes(1);
  });

  /** Marked errored, not idle: an idle state would spin the render effect. */
  it('marks a failed section errored so the effect stops retrying', async () => {
    const { ctx } = makeCtx(new Error('Request timeout: GetPropertyList'));

    await requestTabData(ctx, 10, 20, 'workforce', '1234', ['workforce']);

    expect(useBuildingStore.getState().tabLoadingStates['workforce']).toBe('error');
  });
});
