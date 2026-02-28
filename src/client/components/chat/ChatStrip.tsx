/**
 * ChatStrip — Bottom-center persistent chat hub.
 *
 * Reduced (44px): online badge + last message preview + input + expand toggle.
 * Expanded (300px): header with channel dropdown, chat messages on left, online users on right, input.
 * z-150, centered at bottom of viewport.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronUp, ChevronDown, ChevronUp as ChevronUpIcon, Send, Users } from 'lucide-react';
import { useChatStore } from '../../store/chat-store';
import { useClient } from '../../context';
import styles from './ChatStrip.module.css';

export function ChatStrip() {
  const currentChannel = useChatStore((s) => s.currentChannel);
  const channels = useChatStore((s) => s.channels);
  const messages = useChatStore((s) => s.messages);
  const users = useChatStore((s) => s.users);
  const typingUsers = useChatStore((s) => s.typingUsers);
  const isExpanded = useChatStore((s) => s.isExpanded);
  const toggleExpanded = useChatStore((s) => s.toggleExpanded);
  const setCurrentChannel = useChatStore((s) => s.setCurrentChannel);

  const client = useClient();
  const [input, setInput] = useState('');
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const channelMessages = messages[currentChannel] ?? [];
  const lastMessage = channelMessages[channelMessages.length - 1];
  const visibleMessages = channelMessages.slice(-50);
  const onlineCount = Object.keys(users).length;
  const userList = Object.values(users);

  // Auto-scroll on new messages when expanded
  useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channelMessages.length, isExpanded]);

  // Close channel dropdown on outside click
  useEffect(() => {
    if (!channelDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setChannelDropdownOpen(false);
      }
    };
    // Use setTimeout to avoid the same click event closing it immediately
    const timer = setTimeout(() => document.addEventListener('click', close), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', close);
    };
  }, [channelDropdownOpen]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    client.onSendChatMessage(text);
  }, [input, client]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Typing indicator text
  const typingText = typingUsers.size > 0
    ? Array.from(typingUsers).slice(0, 3).join(', ') + (typingUsers.size > 3 ? '...' : '') + ' typing...'
    : null;

  return (
    <div className={`${styles.strip} ${isExpanded ? styles.expanded : ''}`}>
      {/* ================= EXPANDED: Header ================= */}
      {isExpanded && (
        <div className={styles.header}>
          {/* Channel dropdown */}
          <div className={styles.channelSelect} ref={dropdownRef}>
            <button
              className={styles.channelBtn}
              onClick={(e) => {
                e.stopPropagation();
                setChannelDropdownOpen(!channelDropdownOpen);
              }}
            >
              <ChevronUpIcon size={12} />
              {currentChannel || 'Channel'}
            </button>
            {channelDropdownOpen && (
              <div className={styles.channelDropdown}>
                {channels.map((ch) => (
                  <button
                    key={ch}
                    className={`${styles.channelOption} ${ch === currentChannel ? styles.channelOptionActive : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentChannel(ch);
                      setChannelDropdownOpen(false);
                      // Tell server to join this channel ("Lobby" maps to "" for the server)
                      client.onJoinChannel(ch === 'Lobby' ? '' : ch);
                    }}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Title */}
          <span className={styles.headerTitle}>Chat</span>

          {/* Collapse */}
          <button
            className={styles.collapseBtn}
            onClick={toggleExpanded}
            aria-label="Collapse chat"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      )}

      {/* ================= EXPANDED: Content (messages left + users right) ================= */}
      {isExpanded && (
        <div className={styles.contentArea}>
          {/* Chat messages (left) */}
          <div className={styles.messageArea}>
            {visibleMessages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.message} ${msg.isSystem ? styles.system : ''} ${msg.isGM ? styles.gm : ''}`}
              >
                {!msg.isSystem && (
                  <span className={styles.sender}>{msg.from}</span>
                )}
                <span className={styles.text}>{msg.text}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Online users (right sidebar) */}
          <div className={styles.userSidebar}>
            <div className={styles.userSidebarHeader}>
              <Users size={11} />
              <span>Online ({onlineCount})</span>
            </div>
            <div className={styles.userList}>
              {userList.length > 0 ? (
                userList.map((user) => (
                  <div key={user.id} className={styles.userRow}>
                    <span className={`${styles.statusDot} ${user.status === 1 ? styles.statusDotTyping : ''}`} />
                    <span className={styles.userName}>{user.name}</span>
                  </div>
                ))
              ) : (
                <div className={styles.emptyUsers}>No users</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= REDUCED: Preview row ================= */}
      {!isExpanded && (
        <div className={styles.reducedRow} onClick={toggleExpanded}>
          {/* Online badge */}
          <div
            className={styles.onlineBadge}
            title="View online users"
          >
            <span className={styles.onlineDot} />
            <span>{onlineCount}</span>
          </div>

          {/* Channel indicator */}
          {currentChannel && (
            <span className={styles.channelTag}>{currentChannel}</span>
          )}

          {/* Last message preview */}
          {lastMessage ? (
            <div className={styles.preview}>
              <span className={styles.previewSender}>{lastMessage.from}:</span>
              <span className={styles.previewText}>{lastMessage.text}</span>
            </div>
          ) : (
            <div className={styles.preview}>
              <span className={styles.previewText}>No messages yet</span>
            </div>
          )}

          {/* Expand button */}
          <button
            className={styles.expandBtn}
            aria-label="Expand chat"
          >
            <ChevronUp size={14} />
          </button>
        </div>
      )}

      {/* ================= INPUT ROW (always visible) ================= */}
      <div className={styles.inputRow}>
        {typingText && <span className={styles.typing}>{typingText}</span>}

        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim()}
          aria-label="Send message"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
