/**
 * Unit Tests for ReplayEngine
 * Tests request matching, wsRequestId rewriting, key field matching,
 * consumption tracking, session state transitions, and reset.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import { ReplayEngine } from './replay-engine';
import { CaptureStore } from './capture-store';
import { MockSessionPhase } from './types/mock-types';
import type { WsCaptureScenario, WsCaptureExchange } from './types/mock-types';
import { createAuthScenario } from './scenarios/auth-scenario';
import { createCompanyListScenario } from './scenarios/company-list-scenario';

function makeExchange(
  id: string,
  requestType: WsMessageType,
  responseType: WsMessageType,
  extraRequest: Record<string, unknown> = {},
  extraResponse: Record<string, unknown> = {}
): WsCaptureExchange {
  return {
    id,
    timestamp: '2026-02-18T00:00:00.000Z',
    request: {
      type: requestType,
      wsRequestId: `cap-${id}`,
      ...extraRequest,
    } as WsMessage,
    responses: [
      {
        type: responseType,
        wsRequestId: `cap-${id}`,
        ...extraResponse,
      } as WsMessage,
    ],
  };
}

function makeScenario(
  name: string,
  exchanges: WsCaptureExchange[]
): WsCaptureScenario {
  return {
    name,
    description: `Test scenario: ${name}`,
    capturedAt: '2026-02-18',
    serverInfo: { world: 'Test', zone: 'Test', date: '2026-02-18' },
    exchanges,
  };
}

describe('ReplayEngine', () => {
  let store: CaptureStore;
  let engine: ReplayEngine;

  beforeEach(() => {
    store = new CaptureStore();
    engine = new ReplayEngine(store);
  });

  describe('match - basic', () => {
    it('matches by message type', () => {
      const exchange = makeExchange(
        'ex-001',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      store.addWsScenario(makeScenario('auth', [exchange]));

      const request: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'req-001',
      };
      const result = engine.match(request);

      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('ex-001');
      expect(result!.responses).toHaveLength(1);
      expect(result!.responses[0].type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
    });

    it('returns null when no matching exchange', () => {
      store.addWsScenario(makeScenario('empty', []));

      const request: WsMessage = {
        type: WsMessageType.REQ_LOGOUT,
        wsRequestId: 'req-001',
      };
      const result = engine.match(request);

      expect(result).toBeNull();
    });

    it('returns responses from matched exchange', () => {
      const exchange: WsCaptureExchange = {
        id: 'ex-multi',
        timestamp: '2026-02-18T00:00:00.000Z',
        request: {
          type: WsMessageType.REQ_CONNECT_DIRECTORY,
          wsRequestId: 'cap-multi',
        } as WsMessage,
        responses: [
          { type: WsMessageType.RESP_CONNECT_SUCCESS, wsRequestId: 'cap-multi', worlds: [] } as WsMessage,
          { type: WsMessageType.EVENT_TYCOON_UPDATE, wsRequestId: 'cap-multi' } as WsMessage,
        ],
      };
      store.addWsScenario(makeScenario('multi-resp', [exchange]));

      const request: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'req-100',
      };
      const result = engine.match(request);

      expect(result).not.toBeNull();
      expect(result!.responses).toHaveLength(2);
    });
  });

  describe('match - wsRequestId rewriting', () => {
    it('rewrites wsRequestId in responses to match request', () => {
      const exchange = makeExchange(
        'ex-001',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      store.addWsScenario(makeScenario('auth', [exchange]));

      const request: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'my-custom-id',
      };
      const result = engine.match(request);

      expect(result).not.toBeNull();
      expect(result!.responses[0].wsRequestId).toBe('my-custom-id');
    });

    it('does not mutate original captured data', () => {
      const exchange = makeExchange(
        'ex-001',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      store.addWsScenario(makeScenario('auth', [exchange]));

      const request: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'new-id-123',
      };
      engine.match(request);

      // Verify original response still has its original wsRequestId
      expect(exchange.responses[0].wsRequestId).toBe('cap-ex-001');
    });

    it('handles missing wsRequestId in request', () => {
      const exchange = makeExchange(
        'ex-001',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      store.addWsScenario(makeScenario('auth', [exchange]));

      const request: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        // no wsRequestId
      };
      const result = engine.match(request);

      expect(result).not.toBeNull();
      // When request has no wsRequestId, the response keeps its original cloned value
      expect(result!.responses[0].wsRequestId).toBe('cap-ex-001');
    });
  });

  describe('match - key field matching', () => {
    it('matches LOGIN_WORLD by worldName', () => {
      const shamba = makeExchange(
        'ex-shamba',
        WsMessageType.REQ_LOGIN_WORLD,
        WsMessageType.RESP_LOGIN_SUCCESS,
        { worldName: 'Shamba', username: 'SPO_test3', password: 'test' },
        { tycoonId: '22' }
      );
      const other = makeExchange(
        'ex-other',
        WsMessageType.REQ_LOGIN_WORLD,
        WsMessageType.RESP_LOGIN_SUCCESS,
        { worldName: 'OtherWorld', username: 'SPO_test3', password: 'test' },
        { tycoonId: '33' }
      );
      store.addWsScenario(makeScenario('worlds', [shamba, other]));

      const request = {
        type: WsMessageType.REQ_LOGIN_WORLD,
        wsRequestId: 'req-001',
        worldName: 'Shamba',
        username: 'SPO_test3',
        password: 'test',
      } as WsMessage;

      const result = engine.match(request);

      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('ex-shamba');
    });

    it('matches SELECT_COMPANY by companyId', () => {
      const company28 = makeExchange(
        'ex-c28',
        WsMessageType.REQ_SELECT_COMPANY,
        WsMessageType.RESP_RDO_RESULT,
        { companyId: '28' },
        { result: 'ok' }
      );
      const company99 = makeExchange(
        'ex-c99',
        WsMessageType.REQ_SELECT_COMPANY,
        WsMessageType.RESP_RDO_RESULT,
        { companyId: '99' },
        { result: 'ok' }
      );
      store.addWsScenario(makeScenario('companies', [company28, company99]));

      const request = {
        type: WsMessageType.REQ_SELECT_COMPANY,
        wsRequestId: 'req-002',
        companyId: '28',
      } as WsMessage;

      const result = engine.match(request);

      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('ex-c28');
    });

    it('matches BUILDING_FOCUS by x,y coordinates', () => {
      const building1 = makeExchange(
        'ex-b1',
        WsMessageType.REQ_BUILDING_FOCUS,
        WsMessageType.RESP_BUILDING_FOCUS,
        { x: 100, y: 200 }
      );
      const building2 = makeExchange(
        'ex-b2',
        WsMessageType.REQ_BUILDING_FOCUS,
        WsMessageType.RESP_BUILDING_FOCUS,
        { x: 300, y: 400 }
      );
      store.addWsScenario(makeScenario('buildings', [building1, building2]));

      const request = {
        type: WsMessageType.REQ_BUILDING_FOCUS,
        wsRequestId: 'req-003',
        x: 300,
        y: 400,
      } as WsMessage;

      const result = engine.match(request);

      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('ex-b2');
    });
  });

  describe('match - consumption tracking', () => {
    it('tracks consumed exchange IDs', () => {
      const exchange = makeExchange(
        'ex-001',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      store.addWsScenario(makeScenario('auth', [exchange]));

      const request: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'req-001',
      };
      engine.match(request);

      const consumed = engine.getConsumedExchangeIds();
      expect(consumed.has('ex-001')).toBe(true);
    });

    it('returns next unconsumed exchange', () => {
      const ex1 = makeExchange(
        'ex-001',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      const ex2 = makeExchange(
        'ex-002',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      store.addWsScenario(makeScenario('multi', [ex1, ex2]));

      // First call consumes ex-001
      const request1: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'req-001',
      };
      const result1 = engine.match(request1);
      expect(result1!.exchange.id).toBe('ex-001');

      // Second call should return ex-002 (unconsumed)
      const request2: WsMessage = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'req-002',
      };
      const result2 = engine.match(request2);
      expect(result2!.exchange.id).toBe('ex-002');
    });

    it('wraps around when all consumed', () => {
      const ex1 = makeExchange(
        'ex-001',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      store.addWsScenario(makeScenario('single', [ex1]));

      // First call
      engine.match({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'req-001',
      });

      // Second call should wrap around to the first (and only) exchange
      const result = engine.match({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'req-002',
      });
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('ex-001');
    });
  });

  describe('session state tracking', () => {
    it('starts at DISCONNECTED', () => {
      expect(engine.getState().phase).toBe(MockSessionPhase.DISCONNECTED);
    });

    it('transitions to DIRECTORY_CONNECTED on connect success', () => {
      const { ws } = createAuthScenario();
      store.addWsScenario(ws);

      const request = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'req-001',
        username: 'SPO_test3',
        password: 'test3',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage;

      engine.match(request);

      expect(engine.getState().phase).toBe(MockSessionPhase.DIRECTORY_CONNECTED);
    });

    it('transitions to WORLD_CONNECTED on login success', () => {
      // First connect to directory
      const { ws: authWs } = createAuthScenario();
      store.addWsScenario(authWs);
      engine.match({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'req-001',
        username: 'SPO_test3',
        password: 'test3',
      } as WsMessage);

      // Then login to world
      const { ws: clWs } = createCompanyListScenario();
      store.addWsScenario(clWs);
      engine.match({
        type: WsMessageType.REQ_LOGIN_WORLD,
        wsRequestId: 'req-002',
        username: 'SPO_test3',
        password: 'test3',
        worldName: 'Shamba',
      } as WsMessage);

      expect(engine.getState().phase).toBe(MockSessionPhase.WORLD_CONNECTED);
      expect(engine.getState().currentWorld).toBe('Shamba');
    });

    it('transitions to COMPANY_SELECTED on company select', () => {
      const exchange = makeExchange(
        'ex-sel',
        WsMessageType.REQ_SELECT_COMPANY,
        WsMessageType.RESP_RDO_RESULT,
        { companyId: '28' },
        { result: 'ok' }
      );
      store.addWsScenario(makeScenario('company', [exchange]));

      engine.match({
        type: WsMessageType.REQ_SELECT_COMPANY,
        wsRequestId: 'req-003',
        companyId: '28',
      } as WsMessage);

      expect(engine.getState().phase).toBe(MockSessionPhase.COMPANY_SELECTED);
      expect(engine.getState().currentCompany).toBe('28');
    });
  });

  describe('reset', () => {
    it('resets consumed exchanges', () => {
      const exchange = makeExchange(
        'ex-001',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      store.addWsScenario(makeScenario('auth', [exchange]));

      engine.match({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'req-001',
      });
      expect(engine.getConsumedExchangeIds().size).toBe(1);

      engine.reset();

      expect(engine.getConsumedExchangeIds().size).toBe(0);
    });

    it('resets session state', () => {
      const { ws } = createAuthScenario();
      store.addWsScenario(ws);

      engine.match({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'req-001',
        username: 'SPO_test3',
        password: 'test3',
      } as WsMessage);
      expect(engine.getState().phase).toBe(MockSessionPhase.DIRECTORY_CONNECTED);

      engine.reset();

      expect(engine.getState().phase).toBe(MockSessionPhase.DISCONNECTED);
      expect(engine.getState().currentWorld).toBeNull();
      expect(engine.getState().currentCompany).toBeNull();
      expect(engine.getState().username).toBeNull();
    });

    it('clears consumption counters', () => {
      const ex1 = makeExchange(
        'ex-001',
        WsMessageType.REQ_CONNECT_DIRECTORY,
        WsMessageType.RESP_CONNECT_SUCCESS
      );
      store.addWsScenario(makeScenario('auth', [ex1]));

      // Consume twice (wrap-around)
      engine.match({ type: WsMessageType.REQ_CONNECT_DIRECTORY, wsRequestId: 'r1' });
      engine.match({ type: WsMessageType.REQ_CONNECT_DIRECTORY, wsRequestId: 'r2' });

      engine.reset();

      // After reset, the exchange should still be matchable and tracked fresh
      const result = engine.match({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'r3',
      });
      expect(result).not.toBeNull();
      expect(engine.getConsumedExchangeIds().size).toBe(1);
    });
  });
});
