/**
 * Tests for GM Chat message types and protocol
 */

import { describe, it, expect } from '@jest/globals';
import { WsMessageType } from '../../shared/types/message-types';
import type { WsReqGmChatSend, WsEventChatMsg } from '../../shared/types/message-types';

describe('GM Chat Protocol', () => {
  it('should have REQ_GM_CHAT_SEND message type', () => {
    expect(WsMessageType.REQ_GM_CHAT_SEND).toBe('REQ_GM_CHAT_SEND');
  });

  it('should build correct GM send request', () => {
    const req: WsReqGmChatSend = {
      type: WsMessageType.REQ_GM_CHAT_SEND,
      message: 'Server maintenance in 10 minutes',
    };
    expect(req.type).toBe('REQ_GM_CHAT_SEND');
    expect(req.message).toBe('Server maintenance in 10 minutes');
  });

  it('should build GM event with isGM flag', () => {
    const event: WsEventChatMsg = {
      type: WsMessageType.EVENT_CHAT_MSG,
      channel: 'GM',
      from: 'admin',
      message: 'Welcome to the server!',
      isGM: true,
    };
    expect(event.isGM).toBe(true);
    expect(event.channel).toBe('GM');
    expect(event.from).toBe('admin');
  });

  it('should support regular chat without isGM flag', () => {
    const event: WsEventChatMsg = {
      type: WsMessageType.EVENT_CHAT_MSG,
      channel: 'General',
      from: 'player1',
      message: 'Hello everyone',
    };
    expect(event.isGM).toBeUndefined();
    expect(event.channel).toBe('General');
  });

  it('should serialize GM event to JSON with all fields', () => {
    const event: WsEventChatMsg = {
      type: WsMessageType.EVENT_CHAT_MSG,
      channel: 'GM',
      from: 'admin',
      message: 'Test broadcast',
      isGM: true,
    };
    const json = JSON.parse(JSON.stringify(event));
    expect(json.type).toBe('EVENT_CHAT_MSG');
    expect(json.isGM).toBe(true);
    expect(json.channel).toBe('GM');
    expect(json.from).toBe('admin');
    expect(json.message).toBe('Test broadcast');
  });

  it('should parse GM usernames from comma-separated string', () => {
    // Simulates the SPO_GM_USERS env var parsing logic
    const envVar = 'admin, Crazz, moderator1';
    const gmSet = new Set(envVar.split(',').map(s => s.trim()));
    expect(gmSet.has('admin')).toBe(true);
    expect(gmSet.has('Crazz')).toBe(true);
    expect(gmSet.has('moderator1')).toBe(true);
    expect(gmSet.has('player1')).toBe(false);
  });
});
