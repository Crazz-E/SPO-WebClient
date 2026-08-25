/**
 * Integration test: Mail compose flow.
 *
 * Tests the full user journey:
 * 1. MailPanel renders with folder tabs and compose button
 * 2. Clicking compose switches to compose view with empty fields
 * 3. User types recipient, subject, body
 * 4. Send button calls client.onMailSend with correct values
 * 5. Store resets compose state after send
 * 6. Reply flow pre-fills recipient and subject
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent, act } from '@testing-library/react';
import {
  renderWithProviders,
  resetStores,
  createSpiedCallbacks,
} from '../../__tests__/setup/render-helpers';
import { useMailStore } from '../../store/mail-store';
import { MailPanel } from '../mail/MailPanel';
import type { MailMessageFull } from '@/shared/types';

describe('Mail compose — integration flow', () => {
  beforeEach(() => {
    resetStores();
    // Reset mail store to default (Inbox, list view, not loading)
    useMailStore.setState({
      currentFolder: 'Inbox',
      currentView: 'list',
      messages: [],
      currentMessage: null,
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
    });
  });

  it('renders folder tabs and compose button in list view', () => {
    renderWithProviders(<MailPanel />);

    expect(screen.getByText('Inbox')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
    expect(screen.getByText('Drafts')).toBeTruthy();
    expect(screen.getByText('Compose')).toBeTruthy();
  });

  it('switches to compose view when compose button clicked', () => {
    renderWithProviders(<MailPanel />);

    fireEvent.click(screen.getByText('Compose'));

    // Store should be in compose view
    expect(useMailStore.getState().currentView).toBe('compose');

    // Compose fields should be visible
    expect(screen.getByPlaceholderText('To')).toBeTruthy();
    expect(screen.getByPlaceholderText('Subject')).toBeTruthy();
    expect(screen.getByPlaceholderText('Message...')).toBeTruthy();
  });

  it('fills compose fields and sends mail', () => {
    const sendSpy = jest.fn();
    const mockCallbacks = createSpiedCallbacks({ onMailSend: sendSpy });

    renderWithProviders(<MailPanel />, { clientCallbacks: mockCallbacks });

    // Open compose
    fireEvent.click(screen.getByText('Compose'));

    // Fill fields
    fireEvent.change(screen.getByPlaceholderText('To'), {
      target: { value: 'player42' },
    });
    fireEvent.change(screen.getByPlaceholderText('Subject'), {
      target: { value: 'Trade Offer' },
    });
    fireEvent.change(screen.getByPlaceholderText('Message...'), {
      target: { value: 'I have wheat for sale.' },
    });

    // Click send
    fireEvent.click(screen.getByText('Send'));

    // Verify client callback was invoked with the right args
    expect(sendSpy).toHaveBeenCalledWith('player42', 'Trade Offer', 'I have wheat for sale.');

    // Criterion changed (T6, audit P2): the draft is KEPT until the server answers —
    // a failed send must not lose the letter. The form is locked meanwhile.
    expect(useMailStore.getState().currentView).toBe('compose');
    expect(useMailStore.getState().isSending).toBe(true);
    expect((screen.getByText('Sending…').closest('button') as HTMLButtonElement).disabled).toBe(true);

    // RESP_MAIL_SENT success → the bridge clears the compose
    act(() => useMailStore.getState().clearCompose());
    expect(useMailStore.getState().currentView).toBe('list');
    expect(useMailStore.getState().composeTo).toBe('');
  });

  it('Send is disabled without a recipient', () => {
    const sendSpy = jest.fn();
    renderWithProviders(<MailPanel />, { clientCallbacks: createSpiedCallbacks({ onMailSend: sendSpy }) });
    fireEvent.click(screen.getByText('Compose'));
    fireEvent.change(screen.getByPlaceholderText('Subject'), { target: { value: 'no recipient' } });
    const send = screen.getByText('Send').closest('button') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(send);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('cancel button returns to list view without sending', () => {
    const sendSpy = jest.fn();
    const mockCallbacks = createSpiedCallbacks({ onMailSend: sendSpy });

    renderWithProviders(<MailPanel />, { clientCallbacks: mockCallbacks });

    // Open compose, fill something
    fireEvent.click(screen.getByText('Compose'));
    fireEvent.change(screen.getByPlaceholderText('Subject'), {
      target: { value: 'Draft subject' },
    });

    // Cancel
    fireEvent.click(screen.getByText('Cancel'));

    // Should NOT have sent
    expect(sendSpy).not.toHaveBeenCalled();

    // Should return to list view
    expect(useMailStore.getState().currentView).toBe('list');
  });

  it('reply pre-fills recipient and subject', () => {
    const replyMessage: MailMessageFull = {
      messageId: 'msg-99',
      from: 'Alice',
      fromAddr: 'alice',
      to: 'Me',
      toAddr: 'me',
      subject: 'Hello there',
      date: '2025-01-15',
      dateFmt: 'Jan 15',
      body: ['Hi, how are you?'],
      read: true,
      stamp: 42,
      noReply: false,
      attachments: [],
    };

    // Simulate having read a message, then clicking reply
    useMailStore.getState().startReply(replyMessage);

    renderWithProviders(<MailPanel />);

    // Compose view should be active with pre-filled fields
    const toField = screen.getByPlaceholderText('To') as HTMLInputElement;
    const subjectField = screen.getByPlaceholderText('Subject') as HTMLInputElement;

    expect(toField.value).toBe('alice');
    expect(subjectField.value).toBe('Re: Hello there');
  });

  it('Reply clicked from the read view sends to the sender (the historical bug sent to nobody)', () => {
    const replyMessage: MailMessageFull = {
      messageId: 'msg-99', from: 'Alice', fromAddr: 'alice', to: 'Me', toAddr: 'me', subject: 'Hello there',
      date: '2025-01-15', dateFmt: 'Jan 15', body: ['Hi'], read: true, stamp: 42, noReply: false, attachments: [],
    };
    const sendSpy = jest.fn();
    renderWithProviders(<MailPanel />, { clientCallbacks: createSpiedCallbacks({ onMailSend: sendSpy }) });
    // the panel was mounted on the list; the message arrives, then Reply is clicked in the read view
    act(() => useMailStore.getState().setCurrentMessage(replyMessage));
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect((screen.getByPlaceholderText('To') as HTMLInputElement).value).toBe('alice');
    fireEvent.change(screen.getByPlaceholderText('Message...'), { target: { value: 'Fine, thanks.' } });
    fireEvent.click(screen.getByText('Send'));
    expect(sendSpy).toHaveBeenCalledWith('alice', 'Re: Hello there', 'Fine, thanks.');
  });

  it('Delete asks first, then the confirmed delete is sent and the row leaves the list on the server answer', () => {
    const { useUiStore } = jest.requireActual('../../store/ui-store') as typeof import('../../store/ui-store');
    const deleteSpy = jest.fn();
    const msg: MailMessageFull = {
      messageId: 'msg-7', from: 'Bob', fromAddr: 'bob', to: 'Me', toAddr: 'me', subject: 'Old news',
      date: '2025-01-15', dateFmt: 'Jan 15', body: ['…'], read: true, stamp: 1, noReply: false, attachments: [],
    };
    useMailStore.setState({ messages: [{ messageId: 'msg-7', from: 'Bob', fromAddr: 'bob', to: 'Me', toAddr: 'me', subject: 'Old news', date: '', dateFmt: 'Jan 15', read: true, stamp: 1, noReply: false }] as never });
    renderWithProviders(<MailPanel />, { clientCallbacks: createSpiedCallbacks({ onMailDelete: deleteSpy }) });
    act(() => useMailStore.getState().setCurrentMessage(msg));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deleteSpy).not.toHaveBeenCalled();
    const s = useUiStore.getState();
    expect(s.modal).toBe('confirm');
    expect(s.confirmPayload?.options?.kind).toBe('destructive');
    act(() => { s.confirmPayload?.onConfirm(); s.closeModal(); });
    expect(deleteSpy).toHaveBeenCalledWith('msg-7');
    expect(useMailStore.getState().pendingDeleteId).toBe('msg-7');
    // the bridge, on RESP_MAIL_DELETED success, removes the pending id
    act(() => useMailStore.getState().removeMessage('msg-7'));
    expect(useMailStore.getState().messages).toHaveLength(0);
    expect(useMailStore.getState().currentView).toBe('list');
    expect(useMailStore.getState().pendingDeleteId).toBeNull();
  });

  // #120 — REQ_MAIL_SAVE_DRAFT had a gateway handler, a bridge response and a Drafts tab,
  // and no control anywhere that emitted it.
  describe('Save draft', () => {
    it('saves what is typed, with no recipient required and no draft id for a new letter', () => {
      const saveSpy = jest.fn();
      renderWithProviders(<MailPanel />, { clientCallbacks: createSpiedCallbacks({ onMailSaveDraft: saveSpy }) });

      fireEvent.click(screen.getByText('Compose'));
      fireEvent.change(screen.getByPlaceholderText('Subject'), { target: { value: 'Half a thought' } });
      fireEvent.change(screen.getByPlaceholderText('Message...'), { target: { value: 'to be continued' } });

      // Send still refuses — a letter needs an address, a draft does not.
      expect((screen.getByText('Send').closest('button') as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByText('Save draft'));

      expect(saveSpy).toHaveBeenCalledWith('', 'Half a thought', 'to be continued', undefined, undefined);
      // The form is locked and stays on screen until the server answers, as a send does.
      expect(useMailStore.getState().isSavingDraft).toBe(true);
      expect(useMailStore.getState().currentView).toBe('compose');
      expect((screen.getByText('Saving…').closest('button') as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByPlaceholderText('Subject') as HTMLInputElement).disabled).toBe(true);
    });

    it('an empty form has nothing to save', () => {
      const saveSpy = jest.fn();
      renderWithProviders(<MailPanel />, { clientCallbacks: createSpiedCallbacks({ onMailSaveDraft: saveSpy }) });
      fireEvent.click(screen.getByText('Compose'));
      const save = screen.getByText('Save draft').closest('button') as HTMLButtonElement;
      expect(save.disabled).toBe(true);
      fireEvent.click(save);
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('editing a saved draft sends its id back, so the server replaces the copy', () => {
      const draft: MailMessageFull = {
        messageId: 'draft-4', from: 'Me', fromAddr: 'me', to: 'Bob', toAddr: 'bob',
        subject: 'Half written', date: '2025-01-15', dateFmt: 'Jan 15',
        body: ['first line', 'second line'], read: true, stamp: 3, noReply: false, attachments: [],
      };
      const saveSpy = jest.fn();
      useMailStore.setState({ currentFolder: 'Draft' });
      renderWithProviders(<MailPanel />, { clientCallbacks: createSpiedCallbacks({ onMailSaveDraft: saveSpy }) });

      act(() => useMailStore.getState().setCurrentMessage(draft));
      // A draft has no sender to answer — the read view offers Edit in place of Reply.
      expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));

      expect((screen.getByPlaceholderText('To') as HTMLInputElement).value).toBe('bob');
      expect((screen.getByPlaceholderText('Message...') as HTMLTextAreaElement).value).toBe('first line\nsecond line');

      fireEvent.change(screen.getByPlaceholderText('Message...'), { target: { value: 'finished now' } });
      fireEvent.click(screen.getByText('Save draft'));

      expect(saveSpy).toHaveBeenCalledWith('bob', 'Half written', 'finished now', undefined, 'draft-4');
    });

    it('a message outside Drafts still offers Reply', () => {
      const msg: MailMessageFull = {
        messageId: 'msg-1', from: 'Alice', fromAddr: 'alice', to: 'Me', toAddr: 'me',
        subject: 'Hello', date: '2025-01-15', dateFmt: 'Jan 15',
        body: ['hi'], read: true, stamp: 3, noReply: false, attachments: [],
      };
      renderWithProviders(<MailPanel />);
      act(() => useMailStore.getState().setCurrentMessage(msg));
      expect(screen.getByRole('button', { name: 'Reply' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Edit draft' })).toBeNull();
    });

    it('a send in flight locks the draft button too — one letter, one gesture', () => {
      const saveSpy = jest.fn();
      renderWithProviders(<MailPanel />, { clientCallbacks: createSpiedCallbacks({ onMailSaveDraft: saveSpy }) });
      fireEvent.click(screen.getByText('Compose'));
      fireEvent.change(screen.getByPlaceholderText('To'), { target: { value: 'player42' } });
      fireEvent.click(screen.getByText('Send'));

      const save = screen.getByText('Save draft').closest('button') as HTMLButtonElement;
      expect(save.disabled).toBe(true);
      fireEvent.click(save);
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('the compose headers of a reply ride along with the draft', () => {
      const saveSpy = jest.fn();
      renderWithProviders(<MailPanel />, { clientCallbacks: createSpiedCallbacks({ onMailSaveDraft: saveSpy }) });
      act(() => useMailStore.getState().startCompose('bob', 'Re: Trade', 'yes', 'X-Thread: 42'));
      fireEvent.click(screen.getByText('Save draft'));
      expect(saveSpy).toHaveBeenCalledWith('bob', 'Re: Trade', 'yes', 'X-Thread: 42', undefined);
    });
  });

  it('switching folders triggers client.onMailGetFolder', () => {
    const getFolderSpy = jest.fn();
    const mockCallbacks = createSpiedCallbacks({ onMailGetFolder: getFolderSpy });

    renderWithProviders(<MailPanel />, { clientCallbacks: mockCallbacks });

    // Initial mount calls onMailGetFolder('Inbox')
    expect(getFolderSpy).toHaveBeenCalledWith('Inbox');

    // Click Sent tab
    fireEvent.click(screen.getByText('Sent'));

    expect(useMailStore.getState().currentFolder).toBe('Sent');
    expect(getFolderSpy).toHaveBeenCalledWith('Sent');
  });

  // OB-11: a confirmed send used to leave the listing as it was before the send.
  it('a refresh asked for by the store re-reads the open folder', () => {
    const getFolderSpy = jest.fn();
    renderWithProviders(<MailPanel />, { clientCallbacks: createSpiedCallbacks({ onMailGetFolder: getFolderSpy }) });

    expect(getFolderSpy).toHaveBeenCalledTimes(1);

    // What the bridge does on RESP_MAIL_SENT success.
    act(() => { useMailStore.getState().clearCompose(); useMailStore.getState().refreshFolder(); });

    expect(getFolderSpy).toHaveBeenCalledTimes(2);
    expect(getFolderSpy).toHaveBeenLastCalledWith('Inbox');
  });
});
