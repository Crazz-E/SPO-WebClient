/**
 * Tests for ChatUI — Phase 1.3 message persistence
 *
 * Environment: node (no jsdom) — DOM elements mocked as plain objects.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------
const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: jest.fn((key: string) => storageMap.get(key) ?? null),
  setItem: jest.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: jest.fn((key: string) => storageMap.delete(key)),
  clear: jest.fn(() => storageMap.clear()),
};

// ---------------------------------------------------------------------------
// DOM mock
// ---------------------------------------------------------------------------
interface MockElement {
  id: string;
  className: string;
  style: Record<string, string>;
  textContent: string;
  innerHTML: string;
  type: string;
  value: string;
  placeholder: string;
  title: string;
  children: MockElement[];
  parentElement: MockElement | null;
  appendChild: jest.Mock;
  scrollTop: number;
  scrollHeight: number;
  onkeydown: ((e: unknown) => void) | null;
  onclick: ((e: unknown) => void) | null;
  onchange: (() => void) | null;
  oninput: (() => void) | null;
  onmousedown: ((e: unknown) => void) | null;
  onmouseenter: (() => void) | null;
  onmouseleave: (() => void) | null;
}

function createMockElement(): MockElement {
  return {
    id: '',
    className: '',
    style: {},
    textContent: '',
    innerHTML: '',
    type: '',
    value: '',
    placeholder: '',
    title: '',
    children: [],
    parentElement: null,
    appendChild: jest.fn(function (this: MockElement, child: MockElement) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    }),
    scrollTop: 0,
    scrollHeight: 100,
    onkeydown: null,
    onclick: null,
    onchange: null,
    oninput: null,
    onmousedown: null,
    onmouseenter: null,
    onmouseleave: null,
  };
}

beforeEach(() => {
  storageMap.clear();
  jest.clearAllMocks();

  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
  Object.defineProperty(globalThis, 'window', {
    value: { innerHeight: 800, innerWidth: 1200, setTimeout: setTimeout },
    writable: true,
  });

  (globalThis as Record<string, unknown>).document = {
    createElement: jest.fn(() => createMockElement()),
    body: {
      appendChild: jest.fn(),
    },
  };
});

const { ChatUI } = require('./chat-ui') as typeof import('./chat-ui');

describe('ChatUI — message persistence', () => {
  it('should save messages to localStorage when rendering', () => {
    const chat = new ChatUI();
    chat.renderMessage('Alice', 'Hello world');

    // Default channel is '' → key is spo_chat_Lobby
    expect(localStorageMock.setItem).toHaveBeenCalled();
    const key = localStorageMock.setItem.mock.calls[0][0] as string;
    expect(key).toBe('spo_chat_Lobby');

    const stored = JSON.parse(localStorageMock.setItem.mock.calls[0][1] as string);
    expect(stored).toHaveLength(1);
    expect(stored[0].from).toBe('Alice');
    expect(stored[0].message).toBe('Hello world');
    expect(stored[0].isSystem).toBe(false);
  });

  it('should save system messages', () => {
    const chat = new ChatUI();
    chat.renderMessage('', 'Player joined', true);

    const stored = JSON.parse(localStorageMock.setItem.mock.calls[0][1] as string);
    expect(stored[0].isSystem).toBe(true);
  });

  it('should cap stored messages at 100', () => {
    const chat = new ChatUI();

    // Pre-fill with 100 messages
    const existing = Array.from({ length: 100 }, (_, i) => ({
      from: 'User',
      message: `msg${i}`,
      isSystem: false,
      timestamp: Date.now(),
    }));
    storageMap.set('spo_chat_Lobby', JSON.stringify(existing));

    // Add one more
    chat.renderMessage('Alice', 'new message');

    const lastCall = localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1];
    const stored = JSON.parse(lastCall[1] as string);
    expect(stored.length).toBeLessThanOrEqual(100);
    expect(stored[stored.length - 1].message).toBe('new message');
  });

  it('should not save when skipSave is true (loading stored messages)', () => {
    const chat = new ChatUI();
    localStorageMock.setItem.mockClear();

    chat.renderMessage('Bob', 'old message', false, true);

    // setItem should not have been called for this message
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('should use channel name in storage key', () => {
    const chat = new ChatUI();
    chat.setCurrentChannel('General');

    localStorageMock.setItem.mockClear();
    chat.renderMessage('Alice', 'channel msg');

    const key = localStorageMock.setItem.mock.calls[0][0] as string;
    expect(key).toBe('spo_chat_General');
  });

  it('should load stored messages when switching channels', () => {
    // Pre-fill stored messages for General channel
    const messages = [
      { from: 'Bob', message: 'stored msg', isSystem: false, timestamp: Date.now() },
    ];
    storageMap.set('spo_chat_General', JSON.stringify(messages));

    const chat = new ChatUI();
    const renderSpy = jest.spyOn(chat, 'renderMessage');

    chat.setCurrentChannel('General');

    // Should have called renderMessage with skipSave=true
    expect(renderSpy).toHaveBeenCalledWith('Bob', 'stored msg', false, true);
  });
});
