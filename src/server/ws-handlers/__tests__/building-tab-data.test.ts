/**
 * REQ_BUILDING_TAB_DATA at the WebSocket frontier.
 *
 * One message now carries two asks: a gate tab (supplies/products/compInputs),
 * which names only its id, and a property section, which names the template
 * groups to read — several of them when a civic tab consolidates them. The
 * frontier's job is narrow: pass the group list through unchanged, echo the tab
 * back so a late reply can be routed, and turn a failure into an error frame.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { WebSocket } from 'ws';
import { WsMessageType, type WsMessage } from '../../../shared/types';
import { handleBuildingTabData } from '../building-handlers';
import type { WsHandlerContext } from '../types';

interface Recorded {
  ctx: WsHandlerContext;
  sent: Array<Record<string, unknown>>;
  getBuildingTabData: jest.Mock;
}

function createCtx(result: unknown = {}): Recorded {
  const sent: Array<Record<string, unknown>> = [];
  const ws = {
    send(payload: string): void {
      sent.push(JSON.parse(payload) as Record<string, unknown>);
    },
  } as unknown as WebSocket;

  const getBuildingTabData = jest.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });

  const ctx = { ws, session: { getBuildingTabData } } as unknown as WsHandlerContext;
  return { ctx, sent, getBuildingTabData };
}

const request = (over: Partial<Record<string, unknown>> = {}): WsMessage => ({
  type: WsMessageType.REQ_BUILDING_TAB_DATA,
  wsRequestId: 'req-1',
  x: 924,
  y: 820,
  tabId: 'workforce',
  visualClass: '9013',
  groupIds: ['workforce'],
  ...over,
}) as unknown as WsMessage;

describe('handleBuildingTabData', () => {
  it('passes the group list through to the session, unchanged', async () => {
    const { ctx, getBuildingTabData } = createCtx({ groups: {} });

    await handleBuildingTabData(ctx, request({
      tabId: 'administration',
      groupIds: ['capitolTowns', 'ministeries', 'townTaxes'],
    }));

    expect(getBuildingTabData).toHaveBeenCalledWith(
      924, 820, 'administration', '9013', ['capitolTowns', 'ministeries', 'townTaxes'],
    );
  });

  it('passes undefined for a gate tab, which names no groups', async () => {
    const { ctx, getBuildingTabData } = createCtx({ supplies: [] });

    await handleBuildingTabData(ctx, request({ tabId: 'supplies', groupIds: undefined }));

    expect(getBuildingTabData).toHaveBeenCalledWith(924, 820, 'supplies', '9013', undefined);
  });

  it('echoes the tab and the coordinates back with the groups', async () => {
    const groups = { workforce: [{ name: 'Workers0', value: '25' }] };
    const { ctx, sent } = createCtx({ groups });

    await handleBuildingTabData(ctx, request());

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: WsMessageType.RESP_BUILDING_TAB_DATA,
      wsRequestId: 'req-1',
      x: 924,
      y: 820,
      tabId: 'workforce',
      groups,
    });
  });

  it('turns a failed read into an error frame rather than a hung request', async () => {
    const { ctx, sent } = createCtx(new Error('Request timeout: GetPropertyList'));

    await handleBuildingTabData(ctx, request());

    expect(sent).toHaveLength(1);
    expect(sent[0].type).not.toBe(WsMessageType.RESP_BUILDING_TAB_DATA);
    expect(sent[0].wsRequestId).toBe('req-1');
  });
});
