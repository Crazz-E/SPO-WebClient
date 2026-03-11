/**
 * Tests for message-types.ts utility functions:
 * isWsRequest type guard
 */

import { describe, it, expect } from '@jest/globals';
import { isWsRequest, WsMessageType } from '../message-types';
import type { WsMessage } from '../message-types';

describe('isWsRequest', () => {
  it('returns true for REQ_ message types', () => {
    expect(isWsRequest({ type: WsMessageType.REQ_LOGIN_WORLD } as WsMessage)).toBe(true);
    expect(isWsRequest({ type: WsMessageType.REQ_CONNECT_DIRECTORY } as WsMessage)).toBe(true);
    expect(isWsRequest({ type: WsMessageType.REQ_MAP_LOAD } as WsMessage)).toBe(true);
  });

  it('returns false for RESP_ message types', () => {
    expect(isWsRequest({ type: WsMessageType.RESP_ERROR } as WsMessage)).toBe(false);
    expect(isWsRequest({ type: WsMessageType.RESP_LOGIN_SUCCESS } as WsMessage)).toBe(false);
  });

  it('returns false for EVENT_ message types', () => {
    expect(isWsRequest({ type: WsMessageType.EVENT_CHAT_MSG } as WsMessage)).toBe(false);
    expect(isWsRequest({ type: WsMessageType.EVENT_TYCOON_UPDATE } as WsMessage)).toBe(false);
  });

  it('returns false for arbitrary non-REQ_ types', () => {
    expect(isWsRequest({ type: 'SOMETHING_ELSE' } as unknown as WsMessage)).toBe(false);
  });

  it('returns true for any string starting with REQ_', () => {
    expect(isWsRequest({ type: 'REQ_CUSTOM' } as unknown as WsMessage)).toBe(true);
  });
});
