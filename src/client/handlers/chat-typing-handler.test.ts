/**
 * chat-handler.setTypingStatus — the composition notice goes out on the two
 * transitions and nowhere else.
 *
 * The gateway turns this message into `MsgCompositionChanged`, a void RDO push
 * on the shared world socket. One frame per keystroke would be one frame per
 * keystroke on that socket, for every player at once, so the flag that keeps the
 * notice to transitions is the point of the function, not an optimisation.
 */

jest.mock('../bridge/client-bridge', () => ({ ClientBridge: { log: jest.fn() } }));

import { WsMessageType } from '@/shared/types';
import { setTypingStatus } from './chat-handler';
import type { ClientHandlerContext } from './client-context';

function makeCtx() {
  const sendMessage = jest.fn();
  const ctx = { isTypingInChat: false, sendMessage } as unknown as ClientHandlerContext;
  return { ctx, sendMessage };
}

describe('setTypingStatus', () => {
  it('announces the start of composition once, however often it is asked', () => {
    const { ctx, sendMessage } = makeCtx();

    setTypingStatus(ctx, true);
    setTypingStatus(ctx, true);
    setTypingStatus(ctx, true);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: WsMessageType.REQ_CHAT_TYPING_STATUS,
      isTyping: true,
    });
    expect(ctx.isTypingInChat).toBe(true);
  });

  it('says nothing when it was never typing to begin with', () => {
    const { ctx, sendMessage } = makeCtx();

    setTypingStatus(ctx, false);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(ctx.isTypingInChat).toBe(false);
  });

  it('retracts the notice, and only the first retraction goes out', () => {
    const { ctx, sendMessage } = makeCtx();

    setTypingStatus(ctx, true);
    setTypingStatus(ctx, false);
    setTypingStatus(ctx, false);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: WsMessageType.REQ_CHAT_TYPING_STATUS,
      isTyping: false,
    });
    expect(ctx.isTypingInChat).toBe(false);
  });

  it('can be raised again after a retraction', () => {
    const { ctx, sendMessage } = makeCtx();

    setTypingStatus(ctx, true);
    setTypingStatus(ctx, false);
    setTypingStatus(ctx, true);

    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: WsMessageType.REQ_CHAT_TYPING_STATUS,
      isTyping: true,
    });
  });
});
