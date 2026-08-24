/**
 * The unread-mail badge comes back down.
 *
 * RESP_MAIL_CONNECTED sets the count once at login and EVENT_NEW_MAIL raises it;
 * nothing ever lowered it, because the client never emitted the one message that
 * asks — REQ_MAIL_GET_UNREAD_COUNT was handled by the gateway and sent by nobody.
 * Reading a message and deleting one are the two moments the count can fall, so
 * they are the two that ask again.
 */

jest.mock('../bridge/client-bridge', () => ({
  ClientBridge: {
    log: jest.fn(),
    handleMailResponse: jest.fn(),
    setMailUnreadCount: jest.fn(),
  },
}));

import { WsMessageType, type WsMessage } from '@/shared/types';
import { dispatchEvent } from './event-handler';
import { ClientBridge } from '../bridge/client-bridge';
import type { ClientHandlerContext } from './client-context';

function makeCtx() {
  const sendMessage = jest.fn();
  const ctx = {
    sendMessage,
    soundManager: { play: jest.fn() },
  } as unknown as ClientHandlerContext;
  return { ctx, sendMessage };
}

const ASK = { type: WsMessageType.REQ_MAIL_GET_UNREAD_COUNT };

describe('the unread count after a mail action', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks again once a message has been read', () => {
    const { ctx, sendMessage } = makeCtx();
    const msg = { type: WsMessageType.RESP_MAIL_MESSAGE } as WsMessage;

    dispatchEvent(ctx, msg);

    expect(ClientBridge.handleMailResponse).toHaveBeenCalledWith(msg);
    expect(sendMessage).toHaveBeenCalledWith(ASK);
  });

  it('asks again once a message has been deleted', () => {
    const { ctx, sendMessage } = makeCtx();
    const msg = { type: WsMessageType.RESP_MAIL_DELETED } as WsMessage;

    dispatchEvent(ctx, msg);

    expect(ClientBridge.handleMailResponse).toHaveBeenCalledWith(msg);
    expect(sendMessage).toHaveBeenCalledWith(ASK);
  });

  it('does not ask on responses that cannot move the count', () => {
    const { ctx, sendMessage } = makeCtx();

    for (const type of [
      WsMessageType.RESP_MAIL_FOLDER,
      WsMessageType.RESP_MAIL_SENT,
      WsMessageType.RESP_MAIL_DRAFT_SAVED,
    ]) {
      dispatchEvent(ctx, { type } as WsMessage);
    }

    expect(ClientBridge.handleMailResponse).toHaveBeenCalledTimes(3);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('never asks in reply to the answer itself — that would not terminate', () => {
    const { ctx, sendMessage } = makeCtx();

    dispatchEvent(ctx, { type: WsMessageType.RESP_MAIL_UNREAD_COUNT, count: 3 } as WsMessage);

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
