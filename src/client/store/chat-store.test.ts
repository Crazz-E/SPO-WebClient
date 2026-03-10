/**
 * Tests for chat-store: user list incremental updates.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { useChatStore } from './chat-store';
import type { ChatTab } from './chat-store';

function resetStore() {
  useChatStore.setState({
    currentChannel: '',
    channels: [],
    messages: {},
    users: {},
    typingUsers: new Set(),
    isExpanded: true,
    activeTab: 'chat' as ChatTab,
  });
}

describe('Chat Store — User list', () => {
  beforeEach(resetStore);

  it('setUsers populates the users record keyed by id', () => {
    useChatStore.getState().setUsers([
      { name: 'Alice', id: 'u1', status: 0 },
      { name: 'Bob', id: 'u2', status: 0 },
    ]);
    const { users } = useChatStore.getState();
    expect(Object.keys(users)).toHaveLength(2);
    expect(users['u1'].name).toBe('Alice');
    expect(users['u2'].name).toBe('Bob');
  });

  it('addUser adds a new user to the record', () => {
    useChatStore.getState().setUsers([
      { name: 'Alice', id: 'u1', status: 0 },
    ]);
    useChatStore.getState().addUser({ name: 'Bob', id: 'u2', status: 0 });
    const { users } = useChatStore.getState();
    expect(Object.keys(users)).toHaveLength(2);
    expect(users['u2'].name).toBe('Bob');
  });

  it('addUser overwrites an existing user with the same id', () => {
    useChatStore.getState().setUsers([
      { name: 'Alice', id: 'u1', status: 0 },
    ]);
    useChatStore.getState().addUser({ name: 'Alice-Updated', id: 'u1', status: 1 });
    const { users } = useChatStore.getState();
    expect(Object.keys(users)).toHaveLength(1);
    expect(users['u1'].name).toBe('Alice-Updated');
    expect(users['u1'].status).toBe(1);
  });

  it('removeUser removes a user by id', () => {
    useChatStore.getState().setUsers([
      { name: 'Alice', id: 'u1', status: 0 },
      { name: 'Bob', id: 'u2', status: 0 },
    ]);
    useChatStore.getState().removeUser('u1');
    const { users } = useChatStore.getState();
    expect(Object.keys(users)).toHaveLength(1);
    expect(users['u1']).toBeUndefined();
    expect(users['u2'].name).toBe('Bob');
  });

  it('removeUser is a no-op for unknown id', () => {
    useChatStore.getState().setUsers([
      { name: 'Alice', id: 'u1', status: 0 },
    ]);
    useChatStore.getState().removeUser('unknown-id');
    const { users } = useChatStore.getState();
    expect(Object.keys(users)).toHaveLength(1);
    expect(users['u1'].name).toBe('Alice');
  });
});

describe('Chat Store — Channels', () => {
  beforeEach(resetStore);

  it('setChannels sets the channel list and defaults currentChannel', () => {
    useChatStore.getState().setChannels(['Lobby', 'Trade']);
    const state = useChatStore.getState();
    expect(state.channels).toEqual(['Lobby', 'Trade']);
    expect(state.currentChannel).toBe('Lobby');
  });
});

describe('Chat Store — Messages', () => {
  beforeEach(resetStore);

  it('addMessage appends to the correct channel', () => {
    useChatStore.getState().addMessage('Lobby', {
      id: 'm1', from: 'Alice', text: 'Hello', timestamp: 1000, isSystem: false, isGM: false,
    });
    const { messages } = useChatStore.getState();
    expect(messages['Lobby']).toHaveLength(1);
    expect(messages['Lobby'][0].text).toBe('Hello');
  });
});

describe('Chat Store — Typing', () => {
  beforeEach(resetStore);

  it('setUserTyping adds and removes typing users', () => {
    useChatStore.getState().setUserTyping('Alice', true);
    expect(useChatStore.getState().typingUsers.has('Alice')).toBe(true);
    useChatStore.getState().setUserTyping('Alice', false);
    expect(useChatStore.getState().typingUsers.has('Alice')).toBe(false);
  });
});
