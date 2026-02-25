/**
 * ChatUI - Interface de chat moderne avec tabs
 * Refonte avec design glassmorphism et UX améliorée
 */

import { ChatUser } from '../../shared/types';

interface StoredMessage {
  from: string;
  message: string;
  isSystem: boolean;
  timestamp: number;
}

const CHAT_STORAGE_PREFIX = 'spo_chat_';
const MAX_STORED_MESSAGES = 100;

export class ChatUI {
  // DOM elements
  private container: HTMLElement | null = null;
  private messagesContainer: HTMLElement | null = null;
  private inputElement: HTMLInputElement | null = null;
  private userListContainer: HTMLElement | null = null;
  private channelTabsContainer: HTMLElement | null = null;
  private typingIndicator: HTMLElement | null = null;

  // State
  private currentChannel: string = '';
  private availableChannels: string[] = [];
  private chatUsers: Map<string, ChatUser> = new Map();
  private typingUsers: Set<string> = new Set();
  private isCurrentlyTyping: boolean = false;
  private typingTimeout: number | null = null;
  private isCollapsed: boolean = false;
  private showUserList: boolean = false;
  private showChannelList: boolean = false;
  private channelListContainer: HTMLElement | null = null;

  // Drag state
  private isDragging: boolean = false;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;
  private posX: number = 16;
  private posY: number = 16;

  // Callbacks
  private onSendMessage: ((message: string) => void) | null = null;
  private onJoinChannel: ((channel: string) => void) | null = null;
  private onGetUsers: (() => void) | null = null;
  private onGetChannels: (() => void) | null = null;
  private onTypingStatus: ((isTyping: boolean) => void) | null = null;

  constructor() {
    this.init();
  }

  /**
   * Définit le callback pour l'envoi de messages
   */
  public setOnSendMessage(callback: (message: string) => void) {
    this.onSendMessage = callback;
  }

  /**
   * Définit le callback pour changer de canal
   */
  public setOnJoinChannel(callback: (channel: string) => void) {
    this.onJoinChannel = callback;
  }

  /**
   * Définit le callback pour obtenir la liste des utilisateurs
   */
  public setOnGetUsers(callback: () => void) {
    this.onGetUsers = callback;
  }

  /**
   * Définit le callback pour obtenir la liste des canaux
   */
  public setOnGetChannels(callback: () => void) {
    this.onGetChannels = callback;
  }

  /**
   * Définit le callback pour le statut de typing
   */
  public setOnTypingStatus(callback: (isTyping: boolean) => void) {
    this.onTypingStatus = callback;
  }

  /**
   * Display a message in the chat
   */
  public renderMessage(from: string, message: string, isSystem: boolean = false, skipSave: boolean = false) {
    if (!this.messagesContainer) return;

    // Persist to localStorage (skip when replaying stored messages)
    if (!skipSave) {
      this.saveMessage(from, message, isSystem);
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.style.cssText = `
      padding: var(--space-2) var(--space-3);
      margin-bottom: var(--space-1);
      border-radius: var(--radius-md);
      word-wrap: break-word;
      animation: fadeIn 0.2s ease-out;
      ${isSystem ? 'background: rgba(245, 158, 11, 0.1); border-left: 2px solid var(--warning);' : ''}
    `;

    if (isSystem) {
      msgDiv.innerHTML = `
        <span style="color: var(--warning); font-style: italic; font-size: var(--text-sm);">
          *** ${this.escapeHtml(message)}
        </span>
      `;
    } else {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const avatarColor = this.getColorForUser(from);

      msgDiv.innerHTML = `
        <div style="display: flex; align-items: start; gap: var(--space-2);">
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: ${avatarColor};
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 600;
            font-size: var(--text-sm);
            flex-shrink: 0;
          ">${this.getInitials(from)}</div>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: baseline; gap: var(--space-2); margin-bottom: var(--space-1);">
              <span style="font-weight: 600; color: var(--text-primary); font-size: var(--text-sm);">${this.escapeHtml(from)}</span>
              <span style="font-size: var(--text-xs); color: var(--text-muted);">${timestamp}</span>
            </div>
            <div style="color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.5;">
              ${this.escapeHtml(message)}
            </div>
          </div>
        </div>
      `;
    }

    this.messagesContainer.appendChild(msgDiv);
    this.scrollToBottom();
  }

  /**
   * Update the user list
   */
  public updateUserList(users: ChatUser[]) {
    this.chatUsers.clear();
    users.forEach(user => {
      this.chatUsers.set(user.id, user);
    });
    this.renderUserList();
  }

  /**
   * Update the channel list
   */
  public updateChannelList(channels: string[]) {
    // Always include Lobby as first channel (empty string = lobby in protocol)
    this.availableChannels = ['Lobby', ...channels.filter(c => c !== '' && c !== 'Lobby')];
    this.renderChannelTabs();
  }

  /**
   * Update the current channel
   */
  public setCurrentChannel(channelName: string) {
    this.currentChannel = channelName;
    this.renderChannelTabs();
    // Load stored messages for the new channel
    this.loadStoredMessages();
  }

  /**
   * Vide les messages
   */
  public clearMessages() {
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = '';
    }
  }

  /**
   * Cache la liste des canaux
   */
  public hideChannelList() {
    // No longer needed with the tab system
  }

  /**
   * Update a user's typing status
   */
  public updateUserTypingStatus(username: string, isTyping: boolean) {
    if (isTyping) {
      this.typingUsers.add(username);
    } else {
      this.typingUsers.delete(username);
    }

    for (const user of this.chatUsers.values()) {
      if (user.name === username) {
        user.status = isTyping ? 1 : 0;
        break;
      }
    }

    this.updateTypingIndicator();
    this.renderUserList();
  }

  /**
   * Initialize the chat panel
   */
  private init() {
    // Calculate initial position (bottom-left corner)
    this.posX = 16;
    this.posY = window.innerHeight - 420 - 16;

    this.container = document.createElement('div');
    this.container.id = 'chat-panel';
    this.container.style.cssText = `
      position: fixed;
      left: ${this.posX}px;
      top: ${this.posY}px;
      width: 380px;
      height: 420px;
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
      display: flex;
      flex-direction: column;
      font-family: var(--font-primary);
      box-shadow: var(--shadow-xl);
      z-index: var(--z-overlay);
      transition: none;
      cursor: default;
    `;

    // Header avec tabs
    const header = this.createHeader();
    this.container.appendChild(header);

    // Channel tabs
    this.channelTabsContainer = document.createElement('div');
    this.channelTabsContainer.className = 'channel-tabs';
    this.channelTabsContainer.style.cssText = `
      display: flex;
      gap: var(--space-1);
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--glass-border);
      background: rgba(0, 0, 0, 0.2);
      overflow-x: auto;
      scrollbar-width: none;
    `;
    this.container.appendChild(this.channelTabsContainer);
    this.renderChannelTabs();

    // Messages container
    this.messagesContainer = document.createElement('div');
    this.messagesContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    `;
    this.container.appendChild(this.messagesContainer);

    // Typing indicator
    this.typingIndicator = document.createElement('div');
    this.typingIndicator.style.cssText = `
      padding: var(--space-2) var(--space-3);
      font-size: var(--text-xs);
      color: var(--text-muted);
      font-style: italic;
      min-height: 24px;
      display: none;
    `;
    this.container.appendChild(this.typingIndicator);

    // Input container
    const inputContainer = this.createInputContainer();
    this.container.appendChild(inputContainer);

    // User list (side panel)
    this.createUserListPanel();

    // Channel list (side panel)
    this.createChannelListPanel();

    document.body.appendChild(this.container);

    // Load initial data
    if (this.onGetUsers) this.onGetUsers();
    if (this.onGetChannels) this.onGetChannels();
  }

  /**
   * Crée le header du chat
   */
  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = `
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--glass-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(0, 0, 0, 0.3);
      cursor: move;
      user-select: none;
    `;

    // Add drag functionality to header
    header.onmousedown = (e) => this.startDrag(e);

    const title = document.createElement('div');
    title.innerHTML = `
      <div style="font-weight: 600; font-size: var(--text-base); color: var(--text-primary);">💬 Chat</div>
      <div style="font-size: var(--text-xs); color: var(--text-muted);">${this.chatUsers.size} online</div>
    `;

    const controls = document.createElement('div');
    controls.style.cssText = 'display: flex; gap: var(--space-2);';

    const channelsBtn = document.createElement('button');
    channelsBtn.className = 'btn-icon';
    channelsBtn.innerHTML = '#';
    channelsBtn.title = 'Toggle Channels';
    channelsBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleChannelList();
    };

    const usersBtn = document.createElement('button');
    usersBtn.className = 'btn-icon';
    usersBtn.innerHTML = '👥';
    usersBtn.title = 'Toggle Users';
    usersBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleUserList();
    };

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'btn-icon';
    collapseBtn.innerHTML = '−';
    collapseBtn.title = 'Minimize';
    collapseBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleCollapse();
    };

    controls.appendChild(channelsBtn);
    controls.appendChild(usersBtn);
    controls.appendChild(collapseBtn);

    header.appendChild(title);
    header.appendChild(controls);

    return header;
  }

  /**
   * Crée le conteneur d'input
   */
  private createInputContainer(): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = `
      padding: var(--space-3);
      border-top: 1px solid var(--glass-border);
      display: flex;
      gap: var(--space-2);
      background: rgba(0, 0, 0, 0.2);
    `;

    this.inputElement = document.createElement('input');
    this.inputElement.type = 'text';
    this.inputElement.placeholder = 'Type a message...';
    this.inputElement.className = 'input';
    this.inputElement.style.cssText = `
      flex: 1;
      background: var(--bg-secondary);
      border: 2px solid var(--bg-tertiary);
      color: var(--text-primary);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      font-size: var(--text-sm);
      transition: all var(--transition-base);
    `;

    this.inputElement.onkeydown = (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    };
    this.inputElement.oninput = () => this.handleTyping();

    const sendBtn = document.createElement('button');
    sendBtn.className = 'btn btn-primary';
    sendBtn.innerHTML = '📤';
    sendBtn.style.cssText = `
      padding: var(--space-2) var(--space-4);
      font-size: 18px;
    `;
    sendBtn.onclick = () => this.sendMessage();

    container.appendChild(this.inputElement);
    container.appendChild(sendBtn);

    return container;
  }

  /**
   * Crée le panel des utilisateurs
   */
  private createUserListPanel() {
    this.userListContainer = document.createElement('div');
    this.userListContainer.style.cssText = `
      position: absolute;
      right: -200px;
      top: 0;
      width: 200px;
      height: 100%;
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
      padding: var(--space-4);
      overflow-y: auto;
      display: none;
      transition: right var(--transition-base);
      box-shadow: var(--shadow-xl);
      z-index: 1;
    `;

    this.container!.appendChild(this.userListContainer);
  }

  /**
   * Crée le panel des canaux
   */
  private createChannelListPanel() {
    this.channelListContainer = document.createElement('div');
    this.channelListContainer.style.cssText = `
      position: absolute;
      left: -200px;
      top: 0;
      width: 200px;
      height: 100%;
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg) 0 0 var(--radius-lg);
      padding: var(--space-4);
      overflow-y: auto;
      display: none;
      transition: left var(--transition-base);
      box-shadow: var(--shadow-xl);
      z-index: 1;
    `;

    this.container!.appendChild(this.channelListContainer);
  }

  /**
   * Rend les tabs de canaux
   */
  private renderChannelTabs() {
    if (!this.channelTabsContainer) return;

    this.channelTabsContainer.innerHTML = '';

    this.availableChannels.forEach(channel => {
      const tab = document.createElement('button');
      const isActive = channel === this.currentChannel;

      tab.className = 'channel-tab';
      tab.textContent = `#${channel}`;
      tab.style.cssText = `
        padding: var(--space-2) var(--space-3);
        background: ${isActive ? 'var(--primary-blue)' : 'transparent'};
        color: ${isActive ? 'white' : 'var(--text-secondary)'};
        border: 1px solid ${isActive ? 'var(--primary-blue)' : 'transparent'};
        border-radius: var(--radius-md);
        font-size: var(--text-sm);
        font-weight: ${isActive ? '600' : '500'};
        cursor: pointer;
        transition: all var(--transition-base);
        white-space: nowrap;
      `;

      tab.onmouseenter = () => {
        if (!isActive) {
          tab.style.background = 'rgba(51, 65, 85, 0.5)';
          tab.style.borderColor = 'var(--glass-border)';
        }
      };

      tab.onmouseleave = () => {
        if (!isActive) {
          tab.style.background = 'transparent';
          tab.style.borderColor = 'transparent';
        }
      };

      tab.onclick = () => {
        if (this.onJoinChannel && channel !== this.currentChannel) {
          this.onJoinChannel(channel === 'Lobby' ? '' : channel);
        }
      };

      this.channelTabsContainer!.appendChild(tab);
    });
  }

  /**
   * Rend la liste des utilisateurs
   */
  private renderUserList() {
    if (!this.userListContainer) return;

    const users = Array.from(this.chatUsers.values());
    const onlineCount = users.length;

    this.userListContainer.innerHTML = `
      <div style="font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-3); font-size: var(--text-sm);">
        Online Users (${onlineCount})
      </div>
    `;

    users.forEach(user => {
      const userDiv = document.createElement('div');
      userDiv.style.cssText = `
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2);
        border-radius: var(--radius-md);
        margin-bottom: var(--space-1);
        transition: background var(--transition-fast);
      `;

      const avatarColor = this.getColorForUser(user.name);
      const isTyping = user.status === 1;

      userDiv.innerHTML = `
        <div style="
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: ${avatarColor};
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: var(--text-xs);
        ">${this.getInitials(user.name)}</div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: var(--text-sm); color: var(--text-primary); font-weight: 500;">${this.escapeHtml(user.name)}</div>
          ${isTyping ? `<div style="font-size: var(--text-xs); color: var(--text-muted); font-style: italic;">typing...</div>` : ''}
        </div>
      `;

      userDiv.onmouseenter = () => {
        userDiv.style.background = 'rgba(51, 65, 85, 0.4)';
      };

      userDiv.onmouseleave = () => {
        userDiv.style.background = 'transparent';
      };

      this.userListContainer!.appendChild(userDiv);
    });
  }

  /**
   * Update the typing indicator
   */
  private updateTypingIndicator() {
    if (!this.typingIndicator) return;

    if (this.typingUsers.size === 0) {
      this.typingIndicator.style.display = 'none';
      return;
    }

    this.typingIndicator.style.display = 'block';
    const users = Array.from(this.typingUsers);

    if (users.length === 1) {
      this.typingIndicator.innerHTML = `<span style="animation: pulse 2s ease-in-out infinite;">${this.escapeHtml(users[0])} is typing...</span>`;
    } else if (users.length === 2) {
      this.typingIndicator.innerHTML = `<span style="animation: pulse 2s ease-in-out infinite;">${this.escapeHtml(users[0])} and ${this.escapeHtml(users[1])} are typing...</span>`;
    } else {
      this.typingIndicator.innerHTML = `<span style="animation: pulse 2s ease-in-out infinite;">${users.length} people are typing...</span>`;
    }
  }

  /**
   * Envoie un message
   */
  private sendMessage() {
    if (!this.inputElement || !this.inputElement.value.trim()) return;

    const message = this.inputElement.value.trim();
    this.inputElement.value = '';

    // Stop typing indicator
    if (this.isCurrentlyTyping) {
      if (this.onTypingStatus) this.onTypingStatus(false);
      this.isCurrentlyTyping = false;
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
        this.typingTimeout = null;
      }
    }

    if (this.onSendMessage) {
      this.onSendMessage(message);
    }
  }

  /**
   * Gère l'indicateur de typing
   */
  private handleTyping() {
    const inputValue = this.inputElement?.value || '';

    if (inputValue.length === 0 && this.isCurrentlyTyping) {
      if (this.onTypingStatus) this.onTypingStatus(false);
      this.isCurrentlyTyping = false;
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
        this.typingTimeout = null;
      }
      return;
    }

    if (inputValue.length === 1 && !this.isCurrentlyTyping) {
      if (this.onTypingStatus) this.onTypingStatus(true);
      this.isCurrentlyTyping = true;
    }

    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    if (this.isCurrentlyTyping) {
      this.typingTimeout = window.setTimeout(() => {
        if (this.onTypingStatus) this.onTypingStatus(false);
        this.isCurrentlyTyping = false;
        this.typingTimeout = null;
      }, 3000);
    }
  }

  /**
   * Toggle la liste des utilisateurs
   */
  private toggleUserList() {
    this.showUserList = !this.showUserList;

    if (this.userListContainer) {
      this.userListContainer.style.display = this.showUserList ? 'block' : 'none';
    }

    if (this.showUserList && this.onGetUsers) {
      this.onGetUsers();
    }
  }

  /**
   * Toggle la liste des canaux
   */
  private toggleChannelList() {
    this.showChannelList = !this.showChannelList;

    if (this.channelListContainer) {
      this.channelListContainer.style.display = this.showChannelList ? 'block' : 'none';
    }

    if (this.showChannelList) {
      this.renderChannelList();
      if (this.onGetChannels) {
        this.onGetChannels();
      }
    }
  }

  /**
   * Rend la liste complète des canaux
   */
  private renderChannelList() {
    if (!this.channelListContainer) return;

    const channelCount = this.availableChannels.length;

    this.channelListContainer.innerHTML = `
      <div style="font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-3); font-size: var(--text-sm);">
        All Channels (${channelCount})
      </div>
    `;

    this.availableChannels.forEach(channel => {
      const channelDiv = document.createElement('div');
      const isActive = channel === this.currentChannel;

      channelDiv.style.cssText = `
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2);
        border-radius: var(--radius-md);
        margin-bottom: var(--space-1);
        cursor: pointer;
        transition: background var(--transition-fast);
        background: ${isActive ? 'var(--primary-blue)' : 'transparent'};
      `;

      channelDiv.innerHTML = `
        <div style="
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: ${isActive ? 'rgba(255,255,255,0.2)' : 'rgba(74, 144, 226, 0.3)'};
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: var(--text-sm);
        ">#</div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: var(--text-sm); color: ${isActive ? 'white' : 'var(--text-primary)'}; font-weight: ${isActive ? '600' : '500'};">
            ${this.escapeHtml(channel || 'Lobby')}
          </div>
        </div>
      `;

      channelDiv.onmouseenter = () => {
        if (!isActive) {
          channelDiv.style.background = 'rgba(51, 65, 85, 0.4)';
        }
      };

      channelDiv.onmouseleave = () => {
        if (!isActive) {
          channelDiv.style.background = 'transparent';
        }
      };

      channelDiv.onclick = () => {
        if (this.onJoinChannel && channel !== this.currentChannel) {
          this.onJoinChannel(channel === 'Lobby' ? '' : channel);
        }
      };

      this.channelListContainer!.appendChild(channelDiv);
    });
  }

  /**
   * Toggle collapse du chat
   */
  private toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;

    if (this.container) {
      this.container.style.height = this.isCollapsed ? '56px' : '420px';

      const children = this.container.children;
      for (let i = 1; i < children.length; i++) {
        (children[i] as HTMLElement).style.display = this.isCollapsed ? 'none' : 'flex';
      }
    }
  }

  /**
   * Scroll vers le bas
   */
  private scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  /**
   * Génère une couleur pour un utilisateur (basée sur le hash du nom)
   */
  private getColorForUser(username: string): string {
    const colors = [
      '#0EA5E9', '#8B5CF6', '#EC4899', '#F59E0B',
      '#10B981', '#3B82F6', '#EF4444', '#06B6D4'
    ];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Get initials from a name
   */
  private getInitials(name: string): string {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  /**
   * Save a message to localStorage for the current channel
   */
  private saveMessage(from: string, message: string, isSystem: boolean): void {
    const key = CHAT_STORAGE_PREFIX + (this.currentChannel || 'Lobby');
    try {
      const stored: StoredMessage[] = JSON.parse(localStorage.getItem(key) || '[]');
      stored.push({ from, message, isSystem, timestamp: Date.now() });
      // Cap at MAX_STORED_MESSAGES
      if (stored.length > MAX_STORED_MESSAGES) {
        stored.splice(0, stored.length - MAX_STORED_MESSAGES);
      }
      localStorage.setItem(key, JSON.stringify(stored));
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }

  /**
   * Load stored messages for the current channel into the container
   */
  private loadStoredMessages(): void {
    const key = CHAT_STORAGE_PREFIX + (this.currentChannel || 'Lobby');
    try {
      const stored: StoredMessage[] = JSON.parse(localStorage.getItem(key) || '[]');
      for (const msg of stored) {
        this.renderMessage(msg.from, msg.message, msg.isSystem, true);
      }
    } catch {
      // Corrupt data — silently ignore
    }
  }

  /**
   * Échappe le HTML pour prévenir XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Start dragging the chat panel
   */
  private startDrag(e: MouseEvent) {
    if (!this.container) return;

    // Don't drag if clicking on buttons
    if ((e.target as HTMLElement).tagName === 'BUTTON') {
      return;
    }

    this.isDragging = true;
    this.dragOffsetX = e.clientX - this.posX;
    this.dragOffsetY = e.clientY - this.posY;

    document.onmousemove = (e) => this.onDrag(e);
    document.onmouseup = () => this.stopDrag();

    e.preventDefault();
  }

  /**
   * Handle dragging
   */
  private onDrag(e: MouseEvent) {
    if (!this.isDragging || !this.container) return;

    this.posX = e.clientX - this.dragOffsetX;
    this.posY = e.clientY - this.dragOffsetY;

    // Keep within bounds
    const maxX = window.innerWidth - 380;
    const maxY = window.innerHeight - (this.isCollapsed ? 56 : 420);

    this.posX = Math.max(0, Math.min(this.posX, maxX));
    this.posY = Math.max(0, Math.min(this.posY, maxY));

    this.updatePosition();
  }

  /**
   * Stop dragging
   */
  private stopDrag() {
    this.isDragging = false;
    document.onmousemove = null;
    document.onmouseup = null;
  }

  /**
   * Update panel position
   */
  private updatePosition() {
    if (this.container) {
      this.container.style.left = `${this.posX}px`;
      this.container.style.top = `${this.posY}px`;
    }
  }
}
