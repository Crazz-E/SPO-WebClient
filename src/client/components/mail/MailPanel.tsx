/**
 * MailPanel — Full mail client in the right panel.
 *
 * Three views: list (inbox/sent/drafts), read, compose.
 * Folder tabs at top, message list scrollable, compose form.
 */

import { useCallback, useEffect, memo } from 'react';
import { Send, Trash2, Reply, PenSquare, Save } from 'lucide-react';
import { useMailStore } from '../../store/mail-store';
import { useUiStore } from '../../store/ui-store';
import { useClient } from '../../context';
import { TabBar, Skeleton } from '../common';
import type { MailFolder, MailMessageHeader } from '@/shared/types';
import { isHtmlContent } from '@/shared/mail-html-utils';
import { HtmlMailBody } from './HtmlMailBody';
import styles from './MailPanel.module.css';

const FOLDERS: { id: MailFolder; label: string; badge?: boolean }[] = [
  { id: 'Inbox', label: 'Inbox', badge: true },
  { id: 'Sent', label: 'Sent' },
  { id: 'Draft', label: 'Drafts' },
];

interface MailMessageRowProps {
  msg: MailMessageHeader;
  isSentFolder: boolean;
  onClick: (msg: MailMessageHeader) => void;
}

const MailMessageRow = memo(function MailMessageRow({ msg, isSentFolder, onClick }: MailMessageRowProps) {
  const person = isSentFolder
    ? (msg.to || msg.toAddr || '')
    : (msg.from || msg.fromAddr || '');
  return (
    <button
      className={`${styles.messageRow} ${!msg.read ? styles.unread : ''}`}
      onClick={() => onClick(msg)}
    >
      <div className={styles.msgAvatar}>
        {(person || '?')[0].toUpperCase()}
      </div>
      <div className={styles.msgContent}>
        <div className={styles.msgHeader}>
          <span className={styles.msgSender}>{isSentFolder ? `To: ${person}` : person}</span>
          <span className={styles.msgDate}>{msg.dateFmt || msg.date}</span>
        </div>
        <span className={styles.msgSubject}>{msg.subject}</span>
      </div>
    </button>
  );
});

export function MailPanel() {
  const currentFolder = useMailStore((s) => s.currentFolder);
  const currentView = useMailStore((s) => s.currentView);
  const messages = useMailStore((s) => s.messages);
  const currentMessage = useMailStore((s) => s.currentMessage);
  const unreadCount = useMailStore((s) => s.unreadCount);
  const isLoading = useMailStore((s) => s.isLoading);
  const folderRefreshToken = useMailStore((s) => s.folderRefreshToken);
  const setFolder = useMailStore((s) => s.setFolder);
  const setView = useMailStore((s) => s.setView);
  const startCompose = useMailStore((s) => s.startCompose);
  const startReply = useMailStore((s) => s.startReply);
  const startEditDraft = useMailStore((s) => s.startEditDraft);
  const clearCompose = useMailStore((s) => s.clearCompose);

  const composeTo = useMailStore((s) => s.composeTo);
  const composeSubject = useMailStore((s) => s.composeSubject);
  const composeBody = useMailStore((s) => s.composeBody);
  const setComposeField = useMailStore((s) => s.setComposeField);
  const composeHeaders = useMailStore((s) => s.composeHeaders);
  const composeDraftId = useMailStore((s) => s.composeDraftId);
  const isSending = useMailStore((s) => s.isSending);
  const setSending = useMailStore((s) => s.setSending);
  const isSavingDraft = useMailStore((s) => s.isSavingDraft);
  const setSavingDraft = useMailStore((s) => s.setSavingDraft);
  const isMessageLoading = useMailStore((s) => s.isMessageLoading);
  const setMessageLoading = useMailStore((s) => s.setMessageLoading);
  const requestConfirm = useUiStore((s) => s.requestConfirm);

  const client = useClient();
  const setLoading = useMailStore((s) => s.setLoading);

  // Fetch folder contents on mount, when the folder changes, and whenever an
  // action asked for a re-read (a confirmed send bumps the token — OB-11).
  useEffect(() => {
    setLoading(true);
    client.onMailGetFolder(currentFolder);
  }, [currentFolder, folderRefreshToken, client, setLoading]);

  const handleReadMessage = useCallback(
    (msg: MailMessageHeader) => {
      setMessageLoading(true);
      client.onMailReadMessage(msg.messageId);
    },
    [client, setMessageLoading],
  );

  // The draft is kept until the server answers: RESP_MAIL_SENT clears it on success and a
  // failure leaves it in place with a toast (audit P2). Sending twice is blocked meanwhile.
  const isBusy = isSending || isSavingDraft;
  const canSend = composeTo.trim().length > 0 && !isBusy;
  const handleSend = useCallback(() => {
    if (!canSend) return;
    setSending(true);
    client.onMailSend(composeTo.trim(), composeSubject, composeBody);
  }, [canSend, setSending, client, composeTo, composeSubject, composeBody]);

  // A draft is what you keep BEFORE you have a recipient, so — unlike Send — it asks
  // for no address: anything typed is enough. Editing an existing draft carries its id,
  // which makes the server replace that copy instead of leaving two (#120).
  const canSaveDraft =
    !isBusy && (composeTo.trim() + composeSubject.trim() + composeBody.trim()).length > 0;
  const handleSaveDraft = useCallback(() => {
    if (!canSaveDraft) return;
    setSavingDraft(true);
    client.onMailSaveDraft(
      composeTo.trim(),
      composeSubject,
      composeBody,
      composeHeaders || undefined,
      composeDraftId ?? undefined,
    );
  }, [canSaveDraft, setSavingDraft, client, composeTo, composeSubject, composeBody, composeHeaders, composeDraftId]);

  // Deleting asks first (B5); the row is removed locally when the server confirms.
  const handleDelete = useCallback(() => {
    if (!currentMessage) return;
    const id = currentMessage.messageId;
    requestConfirm(
      'Delete this message?',
      `“${currentMessage.subject || '(no subject)'}” will be removed from ${currentFolder}.`,
      () => {
        useMailStore.getState().setPendingDeleteId(id);
        client.onMailDelete(id);
      },
      { kind: 'destructive', confirmLabel: 'Delete', typeToConfirm: null },
    );
  }, [currentMessage, currentFolder, client, requestConfirm]);

  const folderTabs = FOLDERS.map((f) => ({
    id: f.id,
    label: f.label,
    badge: f.badge && f.id === 'Inbox' ? unreadCount : undefined,
  }));

  return (
    <div className={styles.panel}>
      {/* Folder tabs */}
      <TabBar
        tabs={folderTabs}
        activeTab={currentFolder}
        onTabChange={(id) => setFolder(id as MailFolder)}
      />

      {/* Compose button */}
      {currentView === 'list' && (
        <button className={styles.composeBtn} onClick={() => startCompose()}>
          <PenSquare size={14} />
          <span>Compose</span>
        </button>
      )}

      {/* Loading */}
      {isLoading && (
        <div className={styles.loading}>
          <Skeleton width="100%" height="48px" />
          <Skeleton width="100%" height="48px" />
          <Skeleton width="100%" height="48px" />
        </div>
      )}

      {/* Message list */}
      {!isLoading && currentView === 'list' && (
        <div className={styles.messageList}>
          {messages.length === 0 && (
            <div className={styles.empty}>No messages</div>
          )}
          {messages.map((msg) => (
            <MailMessageRow
              key={msg.messageId}
              msg={msg}
              isSentFolder={currentFolder === 'Sent' || currentFolder === 'Draft'}
              onClick={handleReadMessage}
            />
          ))}
        </div>
      )}

      {/* Message loading — the row was clicked, the body is on its way */}
      {!isLoading && isMessageLoading && currentView === 'list' && (
        <div className={styles.loading} role="status" aria-live="polite">
          <Skeleton width="100%" height="48px" />
          <span className={styles.srOnly}>Loading message</span>
        </div>
      )}

      {/* Reading view */}
      {!isLoading && currentView === 'read' && currentMessage && (
        <div className={styles.readView}>
          <div className={styles.readHeader}>
            <button className={styles.backBtn} onClick={() => setView('list')}>
              ← Back
            </button>
            <div className={styles.readActions}>
              {/* A draft is unsent, so there is nobody to reply to — it is re-opened for editing. */}
              {currentFolder === 'Draft' ? (
                <button className={styles.actionBtn} onClick={() => startEditDraft(currentMessage)} aria-label="Edit draft" title="Edit draft">
                  <PenSquare size={14} aria-hidden="true" />
                </button>
              ) : (
                <button className={styles.actionBtn} onClick={() => startReply(currentMessage)} aria-label="Reply" title="Reply">
                  <Reply size={14} aria-hidden="true" />
                </button>
              )}
              <button className={styles.actionBtn} onClick={handleDelete} aria-label="Delete" title="Delete">
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
          <h3 className={styles.readSubject}>{currentMessage.subject}</h3>
          <div className={styles.readMeta}>
            <div className={styles.readMetaRow}>
              <span>From: {currentMessage.from || currentMessage.fromAddr}</span>
              <span>{currentMessage.dateFmt || currentMessage.date}</span>
            </div>
            <span>To: {currentMessage.to || currentMessage.toAddr}</span>
          </div>
          {isHtmlContent(currentMessage.body) ? (
            <HtmlMailBody body={currentMessage.body} />
          ) : (
            <div className={styles.readBody}>{currentMessage.body.join('\n')}</div>
          )}
        </div>
      )}

      {/* Compose view */}
      {currentView === 'compose' && (
        <div className={styles.composeView}>
          <input
            className={styles.composeInput}
            placeholder="To"
            aria-label="To"
            value={composeTo}
            onChange={(e) => setComposeField('to', e.target.value)}
            disabled={isBusy}
          />
          <input
            className={styles.composeInput}
            placeholder="Subject"
            aria-label="Subject"
            value={composeSubject}
            onChange={(e) => setComposeField('subject', e.target.value)}
            disabled={isBusy}
          />
          <textarea
            className={styles.composeBody}
            placeholder="Message..."
            aria-label="Message"
            value={composeBody}
            onChange={(e) => setComposeField('body', e.target.value)}
            rows={8}
            disabled={isBusy}
          />
          <div className={styles.composeActions}>
            <button className={styles.sendBtn} onClick={handleSend} disabled={!canSend} aria-busy={isSending || undefined} title={composeTo.trim() ? undefined : 'Add a recipient'}>
              <Send size={14} aria-hidden="true" />
              <span>{isSending ? 'Sending…' : 'Send'}</span>
            </button>
            <button className={styles.draftBtn} onClick={handleSaveDraft} disabled={!canSaveDraft} aria-busy={isSavingDraft || undefined} title={canSaveDraft || isBusy ? undefined : 'Write something first'}>
              <Save size={14} aria-hidden="true" />
              <span>{isSavingDraft ? 'Saving…' : 'Save draft'}</span>
            </button>
            <button className={styles.cancelBtn} onClick={clearCompose} disabled={isBusy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
