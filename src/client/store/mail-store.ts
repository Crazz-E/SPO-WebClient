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
  /**
   * The draft this compose form was opened from, or null for a fresh letter.
   *
   * Saving sends it as `existingDraftId` so the server deletes the old copy
   * instead of leaving two (`saveDraft`, `mail-handler.ts:186`).
   */
  composeDraftId: string | null;
  /** A send is in flight — the compose form is kept until the server answers (T6). */
  isSending: boolean;
  /** A draft save is in flight — the form is locked so one click cannot make two drafts. */
  isSavingDraft: boolean;
  /** A message is being fetched after a click on its row. */
  isMessageLoading: boolean;
  /** The id a delete was requested for — removed from the list when the server confirms. */
  pendingDeleteId: string | null;
  /**
   * Bumped whenever the open folder must be read again.
   *
   * The bridge is the inbound half of the client and holds no socket, so it
   * cannot re-issue REQ_MAIL_GET_FOLDER itself. The panel's fetch effect
   * watches this counter alongside the folder, which is the same path that
   * loaded the folder in the first place (OB-11).
   */
  folderRefreshToken: number;

  // Actions
  setFolder: (folder: MailFolder) => void;
  setView: (view: MailView) => void;
  setMessages: (messages: MailMessageHeader[]) => void;
  setCurrentMessage: (message: MailMessageFull | null) => void;
  setUnreadCount: (count: number) => void;
  setLoading: (loading: boolean) => void;
  startCompose: (to?: string, subject?: string, body?: string, headers?: string) => void;
  startReply: (message: MailMessageFull) => void;
  /** Re-open a saved draft in the compose form, remembering the copy to replace. */
  startEditDraft: (message: MailMessageFull) => void;
  clearCompose: () => void;
  /** Edit one compose field — the form is store-driven so Reply's prefill reaches it. */
  setComposeField: (field: 'to' | 'subject' | 'body', value: string) => void;
  setSending: (sending: boolean) => void;
  setSavingDraft: (saving: boolean) => void;
  setMessageLoading: (loading: boolean) => void;
  setPendingDeleteId: (id: string | null) => void;
  /** Drop a message from the current list (after a confirmed delete) — no refetch needed. */
  removeMessage: (messageId: string) => void;
  /** Ask the open folder to be read again — the panel's fetch effect answers. */
  refreshFolder: () => void;
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
  composeDraftId: null,
  isSending: false,
  isSavingDraft: false,
  isMessageLoading: false,
  pendingDeleteId: null,
  folderRefreshToken: 0,

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
      composeDraftId: null,
    }),

  startReply: (message) =>
    set({
      currentView: 'compose',
      composeTo: message.fromAddr,
      composeSubject: message.subject.startsWith('Re: ') ? message.subject : `Re: ${message.subject}`,
      composeBody: '',
      composeHeaders: '',
      composeDraftId: null,
    }),

  startEditDraft: (message) =>
    set({
      currentView: 'compose',
      composeTo: message.toAddr || message.to,
      composeSubject: message.subject,
      composeBody: message.body.join('\n'),
      composeHeaders: '',
      composeDraftId: message.messageId,
    }),

  clearCompose: () =>
    set({
      composeTo: '',
      composeSubject: '',
      composeBody: '',
      composeHeaders: '',
      composeDraftId: null,
      currentView: 'list',
      isSending: false,
      isSavingDraft: false,
    }),

  setComposeField: (field, value) =>
    set(field === 'to' ? { composeTo: value } : field === 'subject' ? { composeSubject: value } : { composeBody: value }),
  setSending: (sending) => set({ isSending: sending }),
  setSavingDraft: (saving) => set({ isSavingDraft: saving }),
  setMessageLoading: (loading) => set({ isMessageLoading: loading }),
  setPendingDeleteId: (id) => set({ pendingDeleteId: id }),
  removeMessage: (messageId) =>
    set((s) => ({
      pendingDeleteId: s.pendingDeleteId === messageId ? null : s.pendingDeleteId,
      messages: s.messages.filter((m) => m.messageId !== messageId),
      currentMessage: s.currentMessage?.messageId === messageId ? null : s.currentMessage,
      currentView: s.currentMessage?.messageId === messageId ? 'list' : s.currentView,
    })),
  refreshFolder: () => set((s) => ({ folderRefreshToken: s.folderRefreshToken + 1, isLoading: true })),

}));
