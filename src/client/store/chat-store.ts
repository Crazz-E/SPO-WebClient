/**
 * Chat Store — Channels, messages, users, and typing state.
 */

import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  timestamp: number;
  isSystem: boolean;
  isGM: boolean;
}

export interface ChatUser {
  name: string;
  id: string;
  /** 0 = normal, 1 = typing */
  status: number;
}

const MAX_MESSAGES_PER_CHANNEL = 100;

interface ChatState {
  // State
  currentChannel: string;
  channels: string[];
  messages: Record<string, ChatMessage[]>;
  users: Record<string, ChatUser>;
  typingUsers: Set<string>;
  isExpanded: boolean;

  // Actions
  setCurrentChannel: (channel: string) => void;
  setChannels: (channels: string[]) => void;
  addMessage: (channel: string, message: ChatMessage) => void;
  setUsers: (users: ChatUser[]) => void;
  setUserTyping: (username: string, isTyping: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentChannel: '',
  channels: [],
  messages: {},
  users: {},
  typingUsers: new Set(),
  isExpanded: false,

  setCurrentChannel: (channel) => set({ currentChannel: channel }),

  setChannels: (channels) => set({ channels }),

  addMessage: (channel, message) =>
    set((state) => {
      const existing = state.messages[channel] ?? [];
      const updated = [...existing, message].slice(-MAX_MESSAGES_PER_CHANNEL);
      return { messages: { ...state.messages, [channel]: updated } };
    }),

  setUsers: (users) => {
    const map: Record<string, ChatUser> = {};
    for (const u of users) {
      map[u.id] = u;
    }
    set({ users: map });
  },

  setUserTyping: (username, isTyping) =>
    set((state) => {
      const next = new Set(state.typingUsers);
      if (isTyping) {
        next.add(username);
      } else {
        next.delete(username);
      }
      return { typingUsers: next };
    }),

  setExpanded: (expanded) => set({ isExpanded: expanded }),

  toggleExpanded: () => set((state) => ({ isExpanded: !state.isExpanded })),
}));
