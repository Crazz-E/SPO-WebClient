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
  editingDraftId: string | null;

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
  setEditingDraft: (draftId: string | null) => void;
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
  editingDraftId: null,

  setFolder: (folder) => set({ currentFolder: folder, currentView: 'list', currentMessage: null }),
  setView: (view) => set({ currentView: view }),
  setMessages: (messages) => set({ messages, isLoading: false }),
  setCurrentMessage: (message) => set({ currentMessage: message, currentView: message ? 'read' : 'list', isLoading: false }),
  setUnreadCount: (count) => set({ unreadCount: count }),
  setLoading: (loading) => set({ isLoading: loading }),

  startCompose: (to = '', subject = '', body = '', headers = '') =>
    set({
      currentView: 'compose',
      composeTo: to,
      composeSubject: subject,
      composeBody: body,
      composeHeaders: headers,
      editingDraftId: null,
    }),

  startReply: (message) =>
    set({
      currentView: 'compose',
      composeTo: message.fromAddr,
      composeSubject: message.subject.startsWith('Re: ') ? message.subject : `Re: ${message.subject}`,
      composeBody: '',
      composeHeaders: '',
      editingDraftId: null,
    }),

  clearCompose: () =>
    set({
      composeTo: '',
      composeSubject: '',
      composeBody: '',
      composeHeaders: '',
      editingDraftId: null,
      currentView: 'list',
    }),

  setEditingDraft: (draftId) => set({ editingDraftId: draftId }),
}));
