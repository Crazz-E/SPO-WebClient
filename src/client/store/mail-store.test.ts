/**
 * Tests for mail-store: folder navigation and loading state.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { useMailStore } from './mail-store';
import type { MailMessageHeader, MailMessageFull } from '@/shared/types';

const mockMessages: MailMessageHeader[] = [
  { messageId: 'msg-1', fromAddr: 'alice@test.com', toAddr: 'me@test.com', from: 'Alice', to: 'Me', subject: 'Hello', date: '1.0', dateFmt: 'Jan 1', read: false, stamp: 42, noReply: false },
  { messageId: 'msg-2', fromAddr: 'bob@test.com', toAddr: 'me@test.com', from: 'Bob', to: 'Me', subject: 'World', date: '2.0', dateFmt: 'Jan 2', read: true, stamp: 7, noReply: false },
];

const mockFullMessage: MailMessageFull = {
  messageId: 'msg-1', fromAddr: 'alice@test.com', toAddr: 'me@test.com',
  from: 'Alice', to: 'Me', subject: 'Hello', date: '1.0', dateFmt: 'Jan 1',
  read: true, stamp: 42, noReply: false,
  body: ['Test body'], attachments: [],
};

function resetStore() {
  useMailStore.setState({
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
    isSavingDraft: false,
  });
}

describe('Mail Store — Folder switching', () => {
  beforeEach(resetStore);

  it('setFolder clears messages and sets isLoading to true', () => {
    // Pre-populate with messages from Inbox
    useMailStore.getState().setMessages(mockMessages);
    expect(useMailStore.getState().messages).toHaveLength(2);
    expect(useMailStore.getState().isLoading).toBe(false);

    // Switch folder
    useMailStore.getState().setFolder('Sent');

    const state = useMailStore.getState();
    expect(state.currentFolder).toBe('Sent');
    expect(state.messages).toHaveLength(0);
    expect(state.isLoading).toBe(true);
    expect(state.currentMessage).toBeNull();
    expect(state.currentView).toBe('list');
  });

  it('setMessages clears isLoading', () => {
    useMailStore.getState().setFolder('Draft');
    expect(useMailStore.getState().isLoading).toBe(true);

    useMailStore.getState().setMessages(mockMessages);
    expect(useMailStore.getState().isLoading).toBe(false);
    expect(useMailStore.getState().messages).toHaveLength(2);
  });

  it('setFolder resets currentMessage', () => {
    useMailStore.getState().setCurrentMessage(mockFullMessage);
    expect(useMailStore.getState().currentMessage).not.toBeNull();

    useMailStore.getState().setFolder('Sent');
    expect(useMailStore.getState().currentMessage).toBeNull();
  });
});

describe('Mail Store — Compose', () => {
  beforeEach(resetStore);

  it('startCompose sets compose fields and view', () => {
    useMailStore.getState().startCompose('test@test.com', 'Subject', 'Body');
    const state = useMailStore.getState();
    expect(state.currentView).toBe('compose');
    expect(state.composeTo).toBe('test@test.com');
    expect(state.composeSubject).toBe('Subject');
    expect(state.composeBody).toBe('Body');
  });

  it('clearCompose resets compose fields and returns to list', () => {
    useMailStore.getState().startCompose('test@test.com', 'Subject', 'Body');
    useMailStore.getState().clearCompose();
    const state = useMailStore.getState();
    expect(state.currentView).toBe('list');
    expect(state.composeTo).toBe('');
    expect(state.composeSubject).toBe('');
    expect(state.composeBody).toBe('');
  });

  it('startReply pre-fills to and subject from message', () => {
    useMailStore.getState().startReply(mockFullMessage);
    const state = useMailStore.getState();
    expect(state.currentView).toBe('compose');
    expect(state.composeTo).toBe('alice@test.com');
    expect(state.composeSubject).toBe('Re: Hello');
  });

  it('refreshFolder bumps the token and shows the listing as loading', () => {
    const before = useMailStore.getState().folderRefreshToken;
    useMailStore.setState({ isLoading: false });
    useMailStore.getState().refreshFolder();
    const state = useMailStore.getState();
    expect(state.folderRefreshToken).toBe(before + 1);
    expect(state.isLoading).toBe(true);
  });

  it('startReply does not double-prefix Re:', () => {
    useMailStore.getState().startReply({
      ...mockFullMessage,
      subject: 'Re: Already replied',
    });
    expect(useMailStore.getState().composeSubject).toBe('Re: Already replied');
  });
});

// #120 — the compose form has to say WHICH draft it came from, or saving an edited
// draft leaves the old copy beside the new one.
describe('Mail Store — Drafts', () => {
  beforeEach(resetStore);

  it('startEditDraft re-opens the draft with its recipient, subject, body and id', () => {
    useMailStore.getState().startEditDraft({
      ...mockFullMessage,
      messageId: 'draft-4',
      toAddr: 'bob@test.com',
      subject: 'Half written',
      body: ['line one', 'line two'],
    });
    const state = useMailStore.getState();
    expect(state.currentView).toBe('compose');
    expect(state.composeTo).toBe('bob@test.com');
    expect(state.composeSubject).toBe('Half written');
    expect(state.composeBody).toBe('line one\nline two');
    expect(state.composeDraftId).toBe('draft-4');
  });

  it('startEditDraft falls back to the display name when there is no address', () => {
    useMailStore.getState().startEditDraft({ ...mockFullMessage, toAddr: '', to: 'Me' });
    expect(useMailStore.getState().composeTo).toBe('Me');
  });

  it('a fresh compose and a reply carry no draft id — saving them must create a new draft', () => {
    useMailStore.getState().startEditDraft({ ...mockFullMessage, messageId: 'draft-4' });
    useMailStore.getState().startCompose();
    expect(useMailStore.getState().composeDraftId).toBeNull();

    useMailStore.getState().startEditDraft({ ...mockFullMessage, messageId: 'draft-4' });
    useMailStore.getState().startReply(mockFullMessage);
    expect(useMailStore.getState().composeDraftId).toBeNull();
  });

  it('clearCompose forgets the draft id and releases the save lock', () => {
    useMailStore.getState().startEditDraft({ ...mockFullMessage, messageId: 'draft-4' });
    useMailStore.getState().setSavingDraft(true);
    useMailStore.getState().clearCompose();
    const state = useMailStore.getState();
    expect(state.composeDraftId).toBeNull();
    expect(state.isSavingDraft).toBe(false);
    expect(state.currentView).toBe('list');
  });

  it('setSavingDraft toggles the in-flight flag', () => {
    useMailStore.getState().setSavingDraft(true);
    expect(useMailStore.getState().isSavingDraft).toBe(true);
    useMailStore.getState().setSavingDraft(false);
    expect(useMailStore.getState().isSavingDraft).toBe(false);
  });
});
