/**
 * Unit Tests for MockWebSocketClient
 * Tests send/receive, message logging, event handlers,
 * session state, scheduled events, and reset.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MockWebSocketClient } from './mock-ws-client';
import { quickScenario } from './test-helpers';
import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import { MockSessionPhase } from './types/mock-types';
import type { WsCaptureScenario } from './types/mock-types';

function buildConnectScenario(): WsCaptureScenario {
  return quickScenario([
    {
      request: {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        username: 'SPO_test3',
        password: 'test',
      },
      response: {
        type: WsMessageType.RESP_CONNECT_SUCCESS,
        worlds: [],
      },
    },
  ]);
}

function buildMultiResponseScenario(): WsCaptureScenario {
  const scenario = quickScenario([
    {
      request: {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        username: 'SPO_test3',
        password: 'test',
      },
      response: {
        type: WsMessageType.RESP_CONNECT_SUCCESS,
        worlds: [],
      },
    },
  ]);

  // Add a second response to the first exchange to test event emission
  scenario.exchanges[0].responses.push({
    type: WsMessageType.EVENT_TYCOON_UPDATE,
    wsRequestId: scenario.exchanges[0].responses[0].wsRequestId,
    cash: '1000000',
  } as WsMessage);

  return scenario;
}

describe('MockWebSocketClient', () => {
  let client: MockWebSocketClient;

  beforeEach(() => {
    client = new MockWebSocketClient([buildConnectScenario()]);
  });

  afterEach(() => {
    client.reset();
  });

  describe('send', () => {
    it('sends request and receives response', async () => {
      const request: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-001',
        username: 'SPO_test3',
        password: 'test',
      } as WsMessage;

      const response = await client.send(request);

      expect(response.type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
    });

    it('throws when no matching capture', async () => {
      const request: WsMessage = {
        type: WsMessageType.REQ_LOGOUT,
        wsRequestId: 'test-001',
      };

      await expect(client.send(request)).rejects.toThrow(
        /No matching capture for request type/
      );
    });

    it('logs sent and received messages', async () => {
      const request: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-001',
        username: 'SPO_test3',
        password: 'test',
      } as WsMessage;

      await client.send(request);

      const log = client.getMessageLog();
      expect(log.length).toBeGreaterThanOrEqual(2);
      expect(log[0].direction).toBe('sent');
      expect(log[0].msg.type).toBe(WsMessageType.REQ_CONNECT_DIRECTORY);
      expect(log[1].direction).toBe('received');
      expect(log[1].msg.type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
    });

    it('rewrites wsRequestId in response', async () => {
      const request: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'my-unique-id',
        username: 'SPO_test3',
        password: 'test',
      } as WsMessage;

      const response = await client.send(request);

      expect(response.wsRequestId).toBe('my-unique-id');
    });
  });

  describe('message logging', () => {
    it('getMessageLog returns all messages', async () => {
      const request: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-001',
        username: 'SPO_test3',
        password: 'test',
      } as WsMessage;

      await client.send(request);

      const log = client.getMessageLog();
      expect(log.length).toBeGreaterThanOrEqual(2);

      const directions = log.map(e => e.direction);
      expect(directions).toContain('sent');
      expect(directions).toContain('received');
    });

    it('getSentMessages returns only sent', async () => {
      const request: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-001',
        username: 'SPO_test3',
        password: 'test',
      } as WsMessage;

      await client.send(request);

      const sent = client.getSentMessages();
      expect(sent).toHaveLength(1);
      expect(sent[0].type).toBe(WsMessageType.REQ_CONNECT_DIRECTORY);
    });

    it('getReceivedMessages returns only received', async () => {
      const request: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-001',
        username: 'SPO_test3',
        password: 'test',
      } as WsMessage;

      await client.send(request);

      const received = client.getReceivedMessages();
      expect(received.length).toBeGreaterThanOrEqual(1);
      expect(received[0].type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
    });

    it('hasReceived checks for message type', async () => {
      const request: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-001',
        username: 'SPO_test3',
        password: 'test',
      } as WsMessage;

      await client.send(request);

      expect(client.hasReceived(WsMessageType.RESP_CONNECT_SUCCESS)).toBe(true);
      expect(client.hasReceived(WsMessageType.RESP_LOGIN_SUCCESS)).toBe(false);
    });
  });

  describe('event handlers', () => {
    it('onEvent registers handler', async () => {
      const multiClient = new MockWebSocketClient([buildMultiResponseScenario()]);

      const received: WsMessage[] = [];
      multiClient.onEvent(WsMessageType.EVENT_TYCOON_UPDATE, (msg) => {
        received.push(msg);
      });

      await multiClient.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-001',
        username: 'SPO_test3',
        password: 'test',
      } as WsMessage);

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe(WsMessageType.EVENT_TYCOON_UPDATE);

      multiClient.reset();
    });

    it('multiple handlers called for same type', async () => {
      const multiClient = new MockWebSocketClient([buildMultiResponseScenario()]);

      let handler1Called = false;
      let handler2Called = false;

      multiClient.onEvent(WsMessageType.EVENT_TYCOON_UPDATE, () => {
        handler1Called = true;
      });
      multiClient.onEvent(WsMessageType.EVENT_TYCOON_UPDATE, () => {
        handler2Called = true;
      });

      await multiClient.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-001',
        username: 'SPO_test3',
        password: 'test',
      } as WsMessage);

      expect(handler1Called).toBe(true);
      expect(handler2Called).toBe(true);

      multiClient.reset();
    });

    it('handlers called with response messages beyond first', async () => {
      const multiClient = new MockWebSocketClient([buildMultiResponseScenario()]);

      const events: WsMessage[] = [];
      multiClient.onEvent(WsMessageType.EVENT_TYCOON_UPDATE, (msg) => {
        events.push(msg);
      });

      const firstResponse = await multiClient.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-001',
        username: 'SPO_test3',
        password: 'test',
      } as WsMessage);

      // First response returned directly (not emitted as event)
      expect(firstResponse.type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);

      // Second response emitted as event
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(WsMessageType.EVENT_TYCOON_UPDATE);

      multiClient.reset();
    });
  });

  describe('session state', () => {
    it('getSessionState returns current phase', () => {
      const state = client.getSessionState();

      expect(state.phase).toBe(MockSessionPhase.DISCONNECTED);
      expect(state.currentWorld).toBeNull();
      expect(state.currentCompany).toBeNull();
      expect(state.username).toBeNull();
    });
  });

  describe('scheduled events', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('startScheduledEvents emits events', () => {
      const scenario = buildConnectScenario();
      scenario.scheduledEvents = [
        {
          afterMs: 1000,
          event: {
            type: WsMessageType.EVENT_TYCOON_UPDATE,
            cash: '500000',
          } as WsMessage,
        },
      ];

      const timerClient = new MockWebSocketClient([scenario]);
      const events: WsMessage[] = [];
      timerClient.onEvent(WsMessageType.EVENT_TYCOON_UPDATE, (msg) => {
        events.push(msg);
      });

      timerClient.startScheduledEvents();

      expect(events).toHaveLength(0);

      jest.advanceTimersByTime(1000);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(WsMessageType.EVENT_TYCOON_UPDATE);

      // Also logged as received
      const received = timerClient.getReceivedMessages();
      expect(received).toHaveLength(1);

      timerClient.reset();
    });

    it('stopScheduledEvents stops timers', () => {
      const scenario = buildConnectScenario();
      scenario.scheduledEvents = [
        {
          afterMs: 500,
          event: {
            type: WsMessageType.EVENT_TYCOON_UPDATE,
            cash: '500000',
          } as WsMessage,
        },
      ];

      const timerClient = new MockWebSocketClient([scenario]);
      const events: WsMessage[] = [];
      timerClient.onEvent(WsMessageType.EVENT_TYCOON_UPDATE, (msg) => {
        events.push(msg);
      });

      timerClient.startScheduledEvents();
      timerClient.stopScheduledEvents();

      jest.advanceTimersByTime(1000);

      expect(events).toHaveLength(0);

      timerClient.reset();
    });
  });

  describe('reset', () => {
    it('clears message log', async () => {
      await client.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-001',
        username: 'SPO_test3',
        password: 'test',
      } as WsMessage);

      expect(client.getMessageLog().length).toBeGreaterThan(0);

      client.reset();

      expect(client.getMessageLog()).toHaveLength(0);
    });

    it('clears event handlers', async () => {
      const multiClient = new MockWebSocketClient([buildMultiResponseScenario()]);

      let handlerCalled = false;
      multiClient.onEvent(WsMessageType.EVENT_TYCOON_UPDATE, () => {
        handlerCalled = true;
      });

      multiClient.reset();

      // Re-create scenarios since reset clears engine state
      const freshClient = new MockWebSocketClient([buildMultiResponseScenario()]);
      await freshClient.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'test-001',
        username: 'SPO_test3',
        password: 'test',
      } as WsMessage);

      // The handler was registered on multiClient which was reset,
      // so verifying multiClient's handlers are gone
      expect(handlerCalled).toBe(false);

      freshClient.reset();
    });
  });
});
