/**
 * StarpeaceClient — the one-line callback wiring in the constructor.
 *
 * `client.ts`'s constructor builds a huge `Partial<ClientCallbacks>` object literal,
 * one arrow function per `onXxx` handler; no test in this codebase has ever
 * instantiated the class, because doing so also opens a real WebSocket and starts
 * polling `/api/startup-status`. This file exists ONLY to prove `onGetChannelInfo`
 * reaches `chatHandler.requestChannelInfo` with the right arguments -- the same
 * shape every other `onXxx` wiring line already has, just never previously exercised.
 *
 * `WebSocket`/`EventSource` are stubbed so the constructor's `init()` does not throw
 * in jsdom (neither exists there); nothing about the stubs is asserted on.
 */

jest.mock('./handlers/chat-handler');

import { StarpeaceClient } from './client';
import * as chatHandler from './handlers/chat-handler';

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  send(): void { /* no-op */ }
  close(): void { /* no-op */ }
}

class FakeEventSource {
  onerror: (() => void) | null = null;
  addEventListener(): void { /* no-op */ }
  close(): void { /* no-op */ }
}

describe('StarpeaceClient callback wiring', () => {
  let client: StarpeaceClient;

  beforeEach(() => {
    document.body.innerHTML = '<div id="game-panel"></div>';
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
    client = new StarpeaceClient();
  });

  it('onGetChannelInfo forwards to chatHandler.requestChannelInfo with the client and the channel name', () => {
    client.callbacks.onGetChannelInfo('Trade');

    expect(chatHandler.requestChannelInfo).toHaveBeenCalledWith(client, 'Trade');
  });
});
