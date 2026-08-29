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
jest.mock('./handlers/favorites-handler');

import { StarpeaceClient } from './client';
import * as chatHandler from './handlers/chat-handler';
import * as favoritesHandler from './handlers/favorites-handler';

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

  it('onCreateFavoriteFolder forwards to favoritesHandler.createFolder with the client and the name', () => {
    client.callbacks.onCreateFavoriteFolder('Farms');

    expect(favoritesHandler.createFolder).toHaveBeenCalledWith(client, 'Farms');
  });

  it('onMoveFavorite forwards to favoritesHandler.moveFavorite with the client, path, destPath and name', () => {
    client.callbacks.onMoveFavorite('4210', '1', 'Mill');

    expect(favoritesHandler.moveFavorite).toHaveBeenCalledWith(client, '4210', '1', 'Mill');
  });
});

describe('Mail body splitting', () => {
  let client: StarpeaceClient;

  beforeEach(() => {
    document.body.innerHTML = '<div id="game-panel"></div>';
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
    client = new StarpeaceClient();
  });

  describe('onMailSend', () => {
    it('splits multi-line body on newlines', () => {
      const sendSpy = jest.spyOn(client, 'sendMessage' as any);
      client.callbacks.onMailSend('recipient@test.com', 'Subject', 'line1\nline2\nline3');

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: ['line1', 'line2', 'line3'],
        })
      );
    });

    it('handles single-line body correctly', () => {
      const sendSpy = jest.spyOn(client, 'sendMessage' as any);
      client.callbacks.onMailSend('recipient@test.com', 'Subject', 'single line');

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: ['single line'],
        })
      );
    });

    it('preserves empty lines in multi-line body', () => {
      const sendSpy = jest.spyOn(client, 'sendMessage' as any);
      client.callbacks.onMailSend('recipient@test.com', 'Subject', 'line1\n\nline3');

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: ['line1', '', 'line3'],
        })
      );
    });

    it('handles body with trailing newline', () => {
      const sendSpy = jest.spyOn(client, 'sendMessage' as any);
      client.callbacks.onMailSend('recipient@test.com', 'Subject', 'line1\nline2\n');

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: ['line1', 'line2', ''],
        })
      );
    });
  });

  describe('onMailSaveDraft', () => {
    it('splits multi-line body on newlines', () => {
      const sendSpy = jest.spyOn(client, 'sendMessage' as any);
      client.callbacks.onMailSaveDraft(
        'recipient@test.com',
        'Subject',
        'line1\nline2\nline3',
        undefined,
        undefined
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: ['line1', 'line2', 'line3'],
        })
      );
    });

    it('handles single-line body correctly', () => {
      const sendSpy = jest.spyOn(client, 'sendMessage' as any);
      client.callbacks.onMailSaveDraft(
        'recipient@test.com',
        'Subject',
        'single line',
        undefined,
        'draft-123'
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: ['single line'],
        })
      );
    });

    it('preserves empty lines in multi-line body', () => {
      const sendSpy = jest.spyOn(client, 'sendMessage' as any);
      client.callbacks.onMailSaveDraft(
        'recipient@test.com',
        'Subject',
        'line1\n\nline3',
        undefined,
        undefined
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: ['line1', '', 'line3'],
        })
      );
    });

    it('handles body with multiple consecutive empty lines', () => {
      const sendSpy = jest.spyOn(client, 'sendMessage' as any);
      client.callbacks.onMailSaveDraft(
        'recipient@test.com',
        'Subject',
        'line1\n\n\nline4',
        undefined,
        undefined
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: ['line1', '', '', 'line4'],
        })
      );
    });

    it('includes optional headers when provided', () => {
      const sendSpy = jest.spyOn(client, 'sendMessage' as any);
      const headers = 'Custom headers';
      client.callbacks.onMailSaveDraft(
        'recipient@test.com',
        'Subject',
        'test body',
        headers,
        undefined
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: ['test body'],
          headers,
        })
      );
    });

    it('includes existing draft ID when provided', () => {
      const sendSpy = jest.spyOn(client, 'sendMessage' as any);
      client.callbacks.onMailSaveDraft(
        'recipient@test.com',
        'Subject',
        'test body',
        undefined,
        'draft-456'
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: ['test body'],
          existingDraftId: 'draft-456',
        })
      );
    });

    it('omits headers when not provided', () => {
      const sendSpy = jest.spyOn(client, 'sendMessage' as any);
      client.callbacks.onMailSaveDraft(
        'recipient@test.com',
        'Subject',
        'test body',
        undefined,
        undefined
      );

      const call = sendSpy.mock.calls[0][0] as Record<string, unknown>;
      expect('headers' in call).toBe(false);
    });

    it('omits existing draft ID when not provided', () => {
      const sendSpy = jest.spyOn(client, 'sendMessage' as any);
      client.callbacks.onMailSaveDraft(
        'recipient@test.com',
        'Subject',
        'test body',
        undefined,
        undefined
      );

      const call = sendSpy.mock.calls[0][0] as Record<string, unknown>;
      expect('existingDraftId' in call).toBe(false);
    });
  });
});
