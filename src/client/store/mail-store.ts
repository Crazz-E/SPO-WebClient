/**
 * Mail Store — Folder navigation, message list, compose state.
 */

import { create } from 'zustand';
import type {
  MailFolder,
  MailMessageHeader,
  MailMessageFull,
} from '@/shared/types';

type MailView = 'list' | 'read' | 'compose';

interface MailState {
  // State
  currentFolder: MailFolder;
  currentView: MailView;
  messages: MailMessageHeader[];
  currentMessage: MailMessageFull | null;
  unreadCount: number;
  isLoading: boolean;

  // Compose
  composeTo: string;
  composeSubject: string;
  composeBody: string;
  composeHeaders: string;
  /** A send is in flight — the compose form is kept until the server answers (T6). */
  isSending: boolean;
  /** A message is being fetched after a click on its row. */
  isMessageLoading: boolean;
  /** The id a delete was requested for — removed from the list when the server confirms. */
  pendingDeleteId: string | null;

  // Actions
  setFolder: (folder: MailFolder) => void;
  setView: (view: MailView) => void;
  setMessages: (messages: MailMessageHeader[]) => void;
  setCurrentMessage: (message: MailMessageFull | null) => void;
  setUnreadCount: (count: number) => void;
  setLoading: (loading: boolean) => void;
  startCompose: (to?: string, subject?: string, body?: string, headers?: string) => void;
  startReply: (message: MailMessageFull) => void;
  clearCompose: () => void;
  /** Edit one compose field — the form is store-driven so Reply's prefill reaches it. */
  setComposeField: (field: 'to' | 'subject' | 'body', value: string) => void;
  setSending: (sending: boolean) => void;
  setMessageLoading: (loading: boolean) => void;
  setPendingDeleteId: (id: string | null) => void;
  /** Drop a message from the current list (after a confirmed delete) — no refetch needed. */
  removeMessage: (messageId: string) => void;
}

export const useMailStore = create<MailState>((set) => ({
  currentFolder: 'Inbox',
  currentView: 'list',
  messages: [],
  currentMessage: null,
  unreadCount: 0,
  isLoading: false,

  composeTo: '',
  composeSubject: '',
  composeBody: '',
  composeHeaders: '',
  isSending: false,
  isMessageLoading: false,
  pendingDeleteId: null,

  setFolder: (folder) => set({ currentFolder: folder, currentView: 'list', currentMessage: null, messages: [], isLoading: true }),
  setView: (view) => set({ currentView: view }),
  setMessages: (messages) => set({ messages, isLoading: false }),
  setCurrentMessage: (message) => set({ currentMessage: message, currentView: message ? 'read' : 'list', isLoading: false, isMessageLoading: false }),
  setUnreadCount: (count) => set({ unreadCount: count }),
  setLoading: (loading) => set({ isLoading: loading }),

  startCompose: (to = '', subject = '', body = '', headers = '') =>
    set({
      currentView: 'compose',
      composeTo: to,
      composeSubject: subject,
      composeBody: body,
      composeHeaders: headers,
    }),

  startReply: (message) =>
    set({
      currentView: 'compose',
      composeTo: message.fromAddr,
      composeSubject: message.subject.startsWith('Re: ') ? message.subject : `Re: ${message.subject}`,
      composeBody: '',
      composeHeaders: '',
    }),

  clearCompose: () =>
    set({
      composeTo: '',
      composeSubject: '',
      composeBody: '',
      composeHeaders: '',
      currentView: 'list',
      isSending: false,
    }),

  setComposeField: (field, value) =>
    set(field === 'to' ? { composeTo: value } : field === 'subject' ? { composeSubject: value } : { composeBody: value }),
  setSending: (sending) => set({ isSending: sending }),
  setMessageLoading: (loading) => set({ isMessageLoading: loading }),
  setPendingDeleteId: (id) => set({ pendingDeleteId: id }),
  removeMessage: (messageId) =>
    set((s) => ({
      pendingDeleteId: s.pendingDeleteId === messageId ? null : s.pendingDeleteId,
      messages: s.messages.filter((m) => m.messageId !== messageId),
      currentMessage: s.currentMessage?.messageId === messageId ? null : s.currentMessage,
      currentView: s.currentMessage?.messageId === messageId ? 'list' : s.currentView,
    })),

}));
