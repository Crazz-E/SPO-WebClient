/**
 * The event-handler dispatch of `RESP_NEWSPAPER_TREE` (#518) — a thin routing
 * line, same shape as the other three newspaper responses it sits beside.
 */

jest.mock('../bridge/client-bridge', () => ({
  ClientBridge: {
    handleNewspaperResponse: jest.fn(),
  },
}));

import { WsMessageType, type WsMessage } from '@/shared/types';
import { dispatchEvent } from './event-handler';
import { ClientBridge } from '../bridge/client-bridge';
import type { ClientHandlerContext } from './client-context';

function makeCtx(): ClientHandlerContext {
  return {} as unknown as ClientHandlerContext;
}

describe('dispatchEvent — RESP_NEWSPAPER_TREE', () => {
  it('routes the response to ClientBridge.handleNewspaperResponse', () => {
    const msg = { type: WsMessageType.RESP_NEWSPAPER_TREE, tree: {} } as unknown as WsMessage;

    dispatchEvent(makeCtx(), msg);

    expect(ClientBridge.handleNewspaperResponse).toHaveBeenCalledWith(msg);
  });
});
