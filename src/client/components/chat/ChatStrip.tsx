/**
 * ChatStrip — Bottom-edge persistent chat.
 *
 * Collapsed: 40px — last message + input + channel tabs.
 * Expanded: 200px — full message history, user list sidebar, typing indicators.
 * z-150, always visible.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronUp, ChevronDown, Send } from 'lucide-react';
import { useChatStore } from '../../store/chat-store';
import styles from './ChatStrip.module.css';

export function ChatStrip() {
  const currentChannel = useChatStore((s) => s.currentChannel);
  const channels = useChatStore((s) => s.channels);
  const messages = useChatStore((s) => s.messages);
  const typingUsers = useChatStore((s) => s.typingUsers);
  const isExpanded = useChatStore((s) => s.isExpanded);
  const toggleExpanded = useChatStore((s) => s.toggleExpanded);
  const setCurrentChannel = useChatStore((s) => s.setCurrentChannel);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const channelMessages = messages[currentChannel] ?? [];
  const lastMessage = channelMessages[channelMessages.length - 1];

  // Auto-scroll on new messages when expanded
  useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channelMessages.length, isExpanded]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    const bridge = (window.__spoReactCallbacks ?? {}) as Record<
      string,
      (...args: unknown[]) => void
    >;
    bridge.onSendChatMessage?.(text);
  }, [input]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Typing users text
  const typingText = typingUsers.size > 0
    ? Array.from(typingUsers).slice(0, 3).join(', ') + (typingUsers.size > 3 ? '...' : '') + ' typing...'
    : null;

  return (
    <div className={`${styles.strip} ${isExpanded ? styles.expanded : ''}`}>
      {/* Header row — channel tabs + expand toggle */}
      <div className={styles.header}>
        <div className={styles.channelTabs}>
          {channels.map((ch) => (
            <button
              key={ch}
              className={`${styles.channelTab} ${ch === currentChannel ? styles.activeTab : ''}`}
              onClick={() => setCurrentChannel(ch)}
            >
              {ch}
            </button>
          ))}
        </div>
        <button
          className={styles.expandBtn}
          onClick={toggleExpanded}
          aria-label={isExpanded ? 'Collapse chat' : 'Expand chat'}
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {/* Expanded message area */}
      {isExpanded && (
        <div className={styles.messageArea}>
          {channelMessages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.message} ${msg.isSystem ? styles.system : ''} ${msg.isGM ? styles.gm : ''}`}
            >
              {!msg.isSystem && (
                <span className={styles.sender}>{msg.from}: </span>
              )}
              <span className={styles.text}>{msg.text}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Collapsed: show last message preview */}
      {!isExpanded && lastMessage && (
        <div className={styles.preview}>
          <span className={styles.previewSender}>{lastMessage.from}</span>
          <span className={styles.previewText}>{lastMessage.text}</span>
        </div>
      )}

      {/* Input row */}
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
