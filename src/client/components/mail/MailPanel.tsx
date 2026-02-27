/**
 * MailPanel — Full mail client in the right panel.
 *
 * Three views: list (inbox/sent/drafts), read, compose.
 * Folder tabs at top, message list scrollable, compose form.
 */

import { useState, useCallback } from 'react';
import { Send, Trash2, Reply, PenSquare } from 'lucide-react';
import { useMailStore } from '../../store/mail-store';
import { useClient } from '../../context';
import { TabBar, Skeleton } from '../common';
import type { MailFolder, MailMessageHeader } from '@/shared/types';
import styles from './MailPanel.module.css';

const FOLDERS: { id: MailFolder; label: string; badge?: boolean }[] = [
  { id: 'Inbox', label: 'Inbox', badge: true },
  { id: 'Sent', label: 'Sent' },
  { id: 'Drafts', label: 'Drafts' },
];

export function MailPanel() {
  const currentFolder = useMailStore((s) => s.currentFolder);
  const currentView = useMailStore((s) => s.currentView);
  const messages = useMailStore((s) => s.messages);
  const currentMessage = useMailStore((s) => s.currentMessage);
  const unreadCount = useMailStore((s) => s.unreadCount);
  const isLoading = useMailStore((s) => s.isLoading);
  const setFolder = useMailStore((s) => s.setFolder);
  const setView = useMailStore((s) => s.setView);
  const startCompose = useMailStore((s) => s.startCompose);
  const startReply = useMailStore((s) => s.startReply);
  const clearCompose = useMailStore((s) => s.clearCompose);

  const composeTo = useMailStore((s) => s.composeTo);
  const composeSubject = useMailStore((s) => s.composeSubject);
  const composeBody = useMailStore((s) => s.composeBody);

  const [localTo, setLocalTo] = useState(composeTo);
  const [localSubject, setLocalSubject] = useState(composeSubject);
  const [localBody, setLocalBody] = useState(composeBody);

  const client = useClient();

  const handleReadMessage = useCallback(
    (msg: MailMessageHeader) => {
      client.onMailReadMessage(msg.messageId);
    },
    [client],
  );

  const handleSend = useCallback(() => {
    client.onMailSend(localTo, localSubject, localBody);
    clearCompose();
  }, [localTo, localSubject, localBody, clearCompose, client]);

  const handleDelete = useCallback(() => {
    if (currentMessage) {
      client.onMailDelete(currentMessage.messageId);
      setView('list');
    }
  }, [currentMessage, client, setView]);

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
        <button className={styles.composeBtn} onClick={() => {
          setLocalTo('');
          setLocalSubject('');
          setLocalBody('');
          startCompose();
        }}>
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
            <button
              key={msg.messageId}
              className={`${styles.messageRow} ${!msg.read ? styles.unread : ''}`}
              onClick={() => handleReadMessage(msg)}
            >
              <div className={styles.msgAvatar}>
                {(msg.from || msg.fromAddr || '?')[0].toUpperCase()}
              </div>
              <div className={styles.msgContent}>
                <div className={styles.msgHeader}>
                  <span className={styles.msgSender}>{msg.from || msg.fromAddr}</span>
                  <span className={styles.msgDate}>{msg.date}</span>
                </div>
                <span className={styles.msgSubject}>{msg.subject}</span>
              </div>
            </button>
          ))}
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
              <button className={styles.actionBtn} onClick={() => startReply(currentMessage)}>
                <Reply size={14} />
              </button>
              <button className={styles.actionBtn} onClick={handleDelete}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <h3 className={styles.readSubject}>{currentMessage.subject}</h3>
          <div className={styles.readMeta}>
            <span>From: {currentMessage.from || currentMessage.fromAddr}</span>
            <span>{currentMessage.date}</span>
          </div>
          <div className={styles.readBody}>{currentMessage.body.join('\n')}</div>
        </div>
      )}

      {/* Compose view */}
      {currentView === 'compose' && (
        <div className={styles.composeView}>
          <input
            className={styles.composeInput}
            placeholder="To"
            value={localTo}
            onChange={(e) => setLocalTo(e.target.value)}
          />
          <input
            className={styles.composeInput}
            placeholder="Subject"
            value={localSubject}
            onChange={(e) => setLocalSubject(e.target.value)}
          />
          <textarea
            className={styles.composeBody}
            placeholder="Message..."
            value={localBody}
            onChange={(e) => setLocalBody(e.target.value)}
            rows={8}
          />
          <div className={styles.composeActions}>
            <button className={styles.sendBtn} onClick={handleSend}>
              <Send size={14} />
              <span>Send</span>
            </button>
            <button className={styles.cancelBtn} onClick={clearCompose}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
