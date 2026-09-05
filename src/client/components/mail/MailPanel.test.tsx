/**
 * MailPanel — list-row delete (#512).
 *
 * A row's own delete control must run the same confirm-then-delete flow as the
 * read view, and must never call onMailReadMessage.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent, act } from '@testing-library/react';
import {
  renderWithProviders,
  resetStores,
  createSpiedCallbacks,
} from '../../__tests__/setup/render-helpers';
import { useMailStore } from '../../store/mail-store';
import { useUiStore } from '../../store/ui-store';
import { MailPanel } from './MailPanel';
import type { MailMessageFull } from '@/shared/types';

const LIST_MESSAGES = [
  { messageId: 'msg-1', from: 'Alice', fromAddr: 'alice', to: 'Me', toAddr: 'me', subject: 'First', date: '', dateFmt: 'Jan 1', read: true, stamp: 1, noReply: false },
  { messageId: 'msg-2', from: 'Bob', fromAddr: 'bob', to: 'Me', toAddr: 'me', subject: 'Second', date: '', dateFmt: 'Jan 2', read: true, stamp: 2, noReply: false },
] as never;

describe('MailPanel — list-row delete', () => {
  beforeEach(() => {
    resetStores();
    useMailStore.setState({
      currentFolder: 'Inbox',
      currentView: 'list',
      messages: [],
      currentMessage: null,
      isLoading: false,
      isMessageLoading: false,
      pendingDeleteId: null,
      folderRefreshToken: 0,
    });
  });

  it('row delete asks first, then calls onMailDelete with that row id and never onMailRead', () => {
    const deleteSpy = jest.fn();
    const readSpy = jest.fn();
    renderWithProviders(<MailPanel />, {
      clientCallbacks: createSpiedCallbacks({ onMailDelete: deleteSpy, onMailReadMessage: readSpy }),
    });
    act(() => useMailStore.getState().setMessages(LIST_MESSAGES));

    fireEvent.click(screen.getByRole('button', { name: /Delete “Second”/ }));

    expect(readSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(useUiStore.getState().modal).toBe('confirm');
    expect(useUiStore.getState().confirmPayload?.options?.kind).toBe('destructive');

    act(() => useUiStore.getState().confirmPayload?.onConfirm());

    expect(deleteSpy).toHaveBeenCalledWith('msg-2');
    expect(useMailStore.getState().pendingDeleteId).toBe('msg-2');
    expect(readSpy).not.toHaveBeenCalled();

    act(() => useMailStore.getState().removeMessage('msg-2'));

    expect(useMailStore.getState().messages).toHaveLength(1);
    expect(useMailStore.getState().currentView).toBe('list');
  });

  it('clicking the row body still opens the message and does not delete', () => {
    const deleteSpy = jest.fn();
    const readSpy = jest.fn();
    renderWithProviders(<MailPanel />, {
      clientCallbacks: createSpiedCallbacks({ onMailDelete: deleteSpy, onMailReadMessage: readSpy }),
    });
    act(() => useMailStore.getState().setMessages(LIST_MESSAGES));

    fireEvent.click(screen.getByText('First'));

    expect(readSpy).toHaveBeenCalledWith('msg-1');
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(useUiStore.getState().modal).not.toBe('confirm');
  });

  it('read-view Delete still works (regression guard)', () => {
    const deleteSpy = jest.fn();
    const full: MailMessageFull = {
      messageId: 'msg-1', from: 'Alice', fromAddr: 'alice', to: 'Me', toAddr: 'me', subject: 'First',
      date: '', dateFmt: 'Jan 1', body: ['hi'], read: true, stamp: 1, noReply: false, attachments: [],
    };
    renderWithProviders(<MailPanel />, { clientCallbacks: createSpiedCallbacks({ onMailDelete: deleteSpy }) });
    act(() => useMailStore.getState().setCurrentMessage(full));

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(useUiStore.getState().modal).toBe('confirm');
    act(() => useUiStore.getState().confirmPayload?.onConfirm());

    expect(deleteSpy).toHaveBeenCalledWith('msg-1');
  });
});
