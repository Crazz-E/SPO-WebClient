"use strict";
(() => {
  // src/shared/types/protocol-types.ts
  var WORLD_ZONES = [
    { id: "beta", name: "BETA", path: "Root/Areas/Asia/Worlds" },
    { id: "free", name: "Free Space", path: "Root/Areas/America/Worlds" },
    { id: "restricted", name: "Restricted Space", path: "Root/Areas/Europe/Worlds" }
  ];

  // src/shared/error-codes.ts
  var NOERROR = 0;
  var ERROR_Unknown = 1;
  var ERROR_CannotInstantiate = 2;
  var ERROR_AreaNotClear = 3;
  var ERROR_UnknownClass = 4;
  var ERROR_UnknownCompany = 5;
  var ERROR_UnknownCluster = 6;
  var ERROR_UnknownTycoon = 7;
  var ERROR_CannotCreateTycoon = 8;
  var ERROR_FacilityNotFound = 9;
  var ERROR_TycoonNameNotUnique = 10;
  var ERROR_CompanyNameNotUnique = 11;
  var ERROR_InvalidUserName = 12;
  var ERROR_InvalidPassword = 13;
  var ERROR_InvalidCompanyId = 14;
  var ERROR_AccessDenied = 15;
  var ERROR_CannotSetupEvents = 16;
  var ERROR_AccountActive = 17;
  var ERROR_AccountDisabled = 18;
  var ERROR_InvalidLogonData = 19;
  var ERROR_ModelServerIsDown = 20;
  var ERROR_UnknownCircuit = 21;
  var ERROR_CannotCreateSeg = 22;
  var ERROR_CannotBreakSeg = 23;
  var ERROR_LoanNotGranted = 24;
  var ERROR_InvalidMoneyValue = 25;
  var ERROR_InvalidProxy = 26;
  var ERROR_RequestDenied = 27;
  var ERROR_ZoneMissmatch = 28;
  var ERROR_InsuficientSpace = 30;
  var ERROR_CannotRegisterEvents = 31;
  var ERROR_NotEnoughRoom = 32;
  var ERROR_TooManyFacilities = 33;
  var ERROR_BuildingTooClose = 34;
  var ERROR_POLITICS_NOTALLOWED = 100;
  var ERROR_POLITICS_REJECTED = 101;
  var ERROR_POLITICS_NOTIME = 102;
  var ERROR_AccountAlreadyExists = 110;
  var ERROR_UnexistingAccount = 112;
  var ERROR_SerialMaxed = 113;
  var ERROR_InvalidSerial = 114;
  var ERROR_SubscriberIdNotFound = 115;
  function getErrorMessage(errorCode) {
    switch (errorCode) {
      case NOERROR:
        return "No error";
      case ERROR_Unknown:
        return "Unknown error";
      case ERROR_CannotInstantiate:
        return "Cannot instantiate";
      case ERROR_AreaNotClear:
        return "Area not clear";
      case ERROR_UnknownClass:
        return "Unknown class";
      case ERROR_UnknownCompany:
        return "Unknown company";
      case ERROR_UnknownCluster:
        return "Unknown cluster";
      case ERROR_UnknownTycoon:
        return "Unknown tycoon";
      case ERROR_CannotCreateTycoon:
        return "Cannot create tycoon";
      case ERROR_FacilityNotFound:
        return "Facility not found";
      case ERROR_TycoonNameNotUnique:
        return "Tycoon name already in use";
      case ERROR_CompanyNameNotUnique:
        return "Company name already in use";
      case ERROR_InvalidUserName:
        return "Invalid username";
      case ERROR_InvalidPassword:
        return "Invalid password";
      case ERROR_InvalidCompanyId:
        return "Invalid company ID";
      case ERROR_AccessDenied:
        return "Access denied";
      case ERROR_CannotSetupEvents:
        return "Cannot setup events";
      case ERROR_AccountActive:
        return "Account already active";
      case ERROR_AccountDisabled:
        return "Account disabled";
      case ERROR_InvalidLogonData:
        return "Invalid logon data";
      case ERROR_ModelServerIsDown:
        return "Model server is down";
      case ERROR_UnknownCircuit:
        return "Unknown circuit";
      case ERROR_CannotCreateSeg:
        return "Cannot create segment";
      case ERROR_CannotBreakSeg:
        return "Cannot break segment";
      case ERROR_LoanNotGranted:
        return "Loan not granted";
      case ERROR_InvalidMoneyValue:
        return "Invalid money value";
      case ERROR_InvalidProxy:
        return "Invalid proxy";
      case ERROR_RequestDenied:
        return "Request denied";
      case ERROR_ZoneMissmatch:
        return "Zone mismatch";
      case ERROR_InsuficientSpace:
        return "Insufficient space";
      case ERROR_CannotRegisterEvents:
        return "Cannot register events";
      case ERROR_NotEnoughRoom:
        return "Not enough room";
      case ERROR_TooManyFacilities:
        return "Too many facilities";
      case ERROR_BuildingTooClose:
        return "Building too close";
      case ERROR_POLITICS_NOTALLOWED:
        return "Political action not allowed";
      case ERROR_POLITICS_REJECTED:
        return "Political action rejected";
      case ERROR_POLITICS_NOTIME:
        return "Not the right time for this political action";
      case ERROR_AccountAlreadyExists:
        return "Account already exists";
      case ERROR_UnexistingAccount:
        return "Account does not exist";
      case ERROR_SerialMaxed:
        return "Serial number maxed out";
      case ERROR_InvalidSerial:
        return "Invalid serial number";
      case ERROR_SubscriberIdNotFound:
        return "Subscriber ID not found";
      default:
        return `Error ${errorCode}`;
    }
  }

  // src/shared/error-utils.ts
  function toErrorMessage(err) {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return String(err);
  }

  // src/client/ui/login-ui.ts
  var LoginUI = class {
    constructor() {
      this.currentZonePath = WORLD_ZONES[0].path;
      // Default to BETA
      // Callbacks
      this.onDirectoryConnect = null;
      this.onWorldSelect = null;
      this.onCompanySelect = null;
      this.uiLoginPanel = document.getElementById("login-panel");
      this.uiWorldList = document.getElementById("world-list");
      this.uiCompanySection = document.getElementById("company-section");
      this.uiCompanyList = document.getElementById("company-list");
      this.uiStatus = document.getElementById("status-indicator");
      this.renderLoginForm();
    }
    /**
     * Définit le callback pour la connexion au Directory
     */
    setOnDirectoryConnect(callback) {
      this.onDirectoryConnect = callback;
    }
    /**
     * Définit le callback pour la sélection de monde
     */
    setOnWorldSelect(callback) {
      this.onWorldSelect = callback;
    }
    /**
     * Définit le callback pour la sélection de compagnie
     */
    setOnCompanySelect(callback) {
      this.onCompanySelect = callback;
    }
    /**
     * Display the login form
     */
    renderLoginForm() {
      const btn = document.getElementById("btn-connect");
      if (btn) {
        btn.onclick = () => this.performDirectoryLogin();
      }
      const inputs = [
        document.getElementById("inp-username"),
        document.getElementById("inp-password")
      ];
      inputs.forEach((input) => {
        if (input) {
          input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
              this.performDirectoryLogin();
            }
          });
        }
      });
    }
    /**
     * Déclenche la connexion au Directory
     */
    performDirectoryLogin() {
      const username = document.getElementById("inp-username").value;
      const password = document.getElementById("inp-password").value;
      if (!username || !password) {
        this.showNotification("Please enter username and password", "error");
        return;
      }
      this.showWorldListLoading("Connecting to directory...");
      if (this.onDirectoryConnect) {
        this.onDirectoryConnect(username, password, this.currentZonePath);
      }
    }
    /**
     * Change la zone et recharge la liste des serveurs
     */
    changeZone(zonePath) {
      this.currentZonePath = zonePath;
      document.querySelectorAll(".zone-tab").forEach((tab) => {
        tab.classList.remove("active");
        if (tab.getAttribute("data-zone-path") === zonePath) {
          tab.classList.add("active");
        }
      });
      const username = document.getElementById("inp-username")?.value;
      const password = document.getElementById("inp-password")?.value;
      if (username && password && this.onDirectoryConnect) {
        this.showWorldListLoading("Loading worlds...");
        this.onDirectoryConnect(username, password, zonePath);
      }
    }
    /**
     * Display the available worlds list
     */
    renderWorldList(worlds) {
      this.uiWorldList.innerHTML = "";
      const authSection = document.querySelector(".login-section:has(.credentials-card)");
      if (authSection) {
        authSection.style.display = "none";
      }
      const zoneTabs = document.createElement("div");
      zoneTabs.className = "zone-tabs";
      WORLD_ZONES.forEach((zone) => {
        const tab = document.createElement("button");
        tab.className = "zone-tab";
        tab.textContent = zone.name;
        tab.setAttribute("data-zone-path", zone.path);
        if (zone.path === this.currentZonePath) {
          tab.classList.add("active");
        }
        tab.onclick = () => this.changeZone(zone.path);
        zoneTabs.appendChild(tab);
      });
      this.uiWorldList.appendChild(zoneTabs);
      if (worlds.length === 0) {
        const emptyMsg = document.createElement("div");
        emptyMsg.style.cssText = "padding: var(--space-6); text-align: center; color: var(--text-muted); font-style: italic;";
        emptyMsg.textContent = "No worlds available";
        this.uiWorldList.appendChild(emptyMsg);
        return;
      }
      const onlineWorlds = worlds.filter((w) => w.running3 === true);
      const offlineWorlds = worlds.filter((w) => w.running3 !== true);
      if (onlineWorlds.length > 0) {
        onlineWorlds.forEach((w) => {
          const card = document.createElement("div");
          card.className = "world-card";
          card.innerHTML = `
          <div class="world-header">
            <div class="world-name">${w.name}</div>
            ${this.getWorldStatusBadge(w)}
          </div>
          <div class="world-stats">
            <span>\u{1F4C5} ${w.date || "N/A"}</span>
            <span>\u{1F465} ${w.investors || 0} investors</span>
            <span>\u{1F7E2} ${w.online || w.players || 0} online</span>
            <span>\u{1F30D} ${w.population || 0} population</span>
          </div>
        `;
          card.onclick = () => {
            if (this.onWorldSelect) {
              this.onWorldSelect(w.name);
            }
          };
          this.uiWorldList.appendChild(card);
        });
      }
      if (offlineWorlds.length > 0) {
        offlineWorlds.forEach((w) => {
          const card = document.createElement("div");
          card.className = "world-card world-card-offline";
          card.innerHTML = `
          <div class="world-header">
            <div class="world-name">${w.name}</div>
            <span class="badge badge-error">Offline</span>
          </div>
        `;
          this.uiWorldList.appendChild(card);
        });
      }
    }
    /**
     * Génère un badge de statut pour le monde
     */
    getWorldStatusBadge(world) {
      const players = world.players || 0;
      let badgeClass = "badge-success";
      let status = "Online";
      if (players > 100) {
        badgeClass = "badge-error";
        status = "Full";
      } else if (players > 50) {
        badgeClass = "badge-warning";
        status = "Busy";
      }
      return `<span class="badge ${badgeClass}">${status}</span>`;
    }
    /**
     * Display company selection (grouped by role)
     */
    renderCompanySelection(companies) {
      const worldSection = this.uiWorldList.parentElement;
      if (worldSection) {
        worldSection.style.display = "none";
      }
      this.uiCompanySection.classList.remove("hidden");
      this.uiCompanyList.innerHTML = "";
      if (companies.length === 0) {
        this.uiCompanyList.innerHTML = '<div style="padding: var(--space-4); text-align: center; color: var(--text-muted); font-style: italic;">No companies available</div>';
        return;
      }
      const groupedCompanies = /* @__PURE__ */ new Map();
      companies.forEach((company) => {
        const role = company.ownerRole || "Player";
        if (!groupedCompanies.has(role)) {
          groupedCompanies.set(role, []);
        }
        groupedCompanies.get(role).push(company);
      });
      groupedCompanies.forEach((companyList, role) => {
        const roleHeader = document.createElement("div");
        roleHeader.className = "company-role-header";
        let icon = "\u{1F3E2}";
        let label = "Companies";
        if (role.toLowerCase().includes("maire") || role.toLowerCase().includes("mayor")) {
          icon = "\u{1F3DB}\uFE0F";
          label = `Maire - ${role}`;
        } else if (role.toLowerCase().includes("ministre") || role.toLowerCase().includes("minister")) {
          icon = "\u2696\uFE0F";
          label = `Ministre - ${role}`;
        } else if (role.toLowerCase().includes("pr\xE9sident") || role.toLowerCase().includes("president")) {
          icon = "\u{1F396}\uFE0F";
          label = `Pr\xE9sident - ${role}`;
        } else if (role !== "Player") {
          icon = "\u{1F464}";
          label = role;
        }
        roleHeader.innerHTML = `
        <div style="padding: var(--space-3); font-weight: 600; color: var(--text-primary); border-bottom: 1px solid var(--border-color);">
          ${icon} ${label}
        </div>
      `;
        this.uiCompanyList.appendChild(roleHeader);
        companyList.forEach((company) => {
          const card = document.createElement("div");
          card.className = "company-card";
          card.innerHTML = `
          <div class="company-name">\u{1F3E2} ${company.name}</div>
        `;
          card.onclick = () => {
            if (this.onCompanySelect) {
              this.onCompanySelect(company.id);
            }
          };
          this.uiCompanyList.appendChild(card);
        });
      });
    }
    /**
     * Display a notification (simple toast)
     */
    showNotification(message, type = "info") {
      const colors = {
        success: "var(--success)",
        error: "var(--error)",
        info: "var(--info)"
      };
      const toast = document.createElement("div");
      toast.style.cssText = `
      position: fixed;
      top: 80px;
      right: 16px;
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      border: 1px solid ${colors[type]};
      border-radius: var(--radius-md);
      padding: var(--space-4);
      color: ${colors[type]};
      font-size: var(--text-sm);
      z-index: var(--z-tooltip);
      animation: slideInRight 0.3s ease-out;
      box-shadow: var(--shadow-xl);
    `;
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.animation = "slideOutRight 0.3s ease-out";
        setTimeout(() => toast.remove(), 300);
      }, 3e3);
    }
    /**
     * Cache le bouton de connexion au Directory (deprecated)
     */
    hideConnectButton() {
    }
    /**
     * Cache le panel de login
     */
    hide() {
      this.uiLoginPanel.style.display = "none";
    }
    /**
     * Update the connection status
     */
    setStatus(text, color) {
      const statusText = this.uiStatus.querySelector("span:last-child");
      const statusDot = this.uiStatus.querySelector(".status-dot");
      if (statusText) {
        statusText.textContent = text;
      }
      if (statusDot) {
        const colorMap = {
          "#0f0": "var(--success)",
          "green": "var(--success)",
          "#f00": "var(--error)",
          "red": "var(--error)",
          "#ff0": "var(--warning)",
          "yellow": "var(--warning)"
        };
        statusDot.style.background = colorMap[color] || color;
      }
    }
    /**
     * Shows loading state in world list
     */
    showWorldListLoading(message) {
      const existingTabs = this.uiWorldList.querySelector(".zone-tabs");
      this.uiWorldList.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; padding: var(--space-6); color: var(--text-muted); font-style: italic;">
        <span class="spinner"></span>
        ${message}
      </div>
    `;
      if (existingTabs) {
        this.uiWorldList.insertBefore(existingTabs, this.uiWorldList.firstChild);
      }
    }
    /**
     * Shows loading state in company list
     */
    showCompanyListLoading(message) {
      this.uiCompanyList.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; padding: var(--space-4); color: var(--text-muted); font-style: italic;">
        <span class="spinner"></span>
        ${message}
      </div>
    `;
    }
  };

  // src/client/ui/chat-ui.ts
  var ChatUI = class {
    constructor() {
      // DOM elements
      this.container = null;
      this.messagesContainer = null;
      this.inputElement = null;
      this.userListContainer = null;
      this.channelTabsContainer = null;
      this.typingIndicator = null;
      // State
      this.currentChannel = "";
      this.availableChannels = [];
      this.chatUsers = /* @__PURE__ */ new Map();
      this.typingUsers = /* @__PURE__ */ new Set();
      this.isCurrentlyTyping = false;
      this.typingTimeout = null;
      this.isCollapsed = false;
      this.showUserList = false;
      this.showChannelList = false;
      this.channelListContainer = null;
      // Drag state
      this.isDragging = false;
      this.dragOffsetX = 0;
      this.dragOffsetY = 0;
      this.posX = 16;
      this.posY = 16;
      // Callbacks
      this.onSendMessage = null;
      this.onJoinChannel = null;
      this.onGetUsers = null;
      this.onGetChannels = null;
      this.onTypingStatus = null;
      this.init();
    }
    /**
     * Définit le callback pour l'envoi de messages
     */
    setOnSendMessage(callback) {
      this.onSendMessage = callback;
    }
    /**
     * Définit le callback pour changer de canal
     */
    setOnJoinChannel(callback) {
      this.onJoinChannel = callback;
    }
    /**
     * Définit le callback pour obtenir la liste des utilisateurs
     */
    setOnGetUsers(callback) {
      this.onGetUsers = callback;
    }
    /**
     * Définit le callback pour obtenir la liste des canaux
     */
    setOnGetChannels(callback) {
      this.onGetChannels = callback;
    }
    /**
     * Définit le callback pour le statut de typing
     */
    setOnTypingStatus(callback) {
      this.onTypingStatus = callback;
    }
    /**
     * Display a message in the chat
     */
    renderMessage(from, message, isSystem = false) {
      if (!this.messagesContainer) return;
      const msgDiv = document.createElement("div");
      msgDiv.className = "chat-message";
      msgDiv.style.cssText = `
      padding: var(--space-2) var(--space-3);
      margin-bottom: var(--space-1);
      border-radius: var(--radius-md);
      word-wrap: break-word;
      animation: fadeIn 0.2s ease-out;
      ${isSystem ? "background: rgba(245, 158, 11, 0.1); border-left: 2px solid var(--warning);" : ""}
    `;
      if (isSystem) {
        msgDiv.innerHTML = `
        <span style="color: var(--warning); font-style: italic; font-size: var(--text-sm);">
          *** ${this.escapeHtml(message)}
        </span>
      `;
      } else {
        const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
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
    updateUserList(users) {
      this.chatUsers.clear();
      users.forEach((user) => {
        this.chatUsers.set(user.id, user);
      });
      this.renderUserList();
    }
    /**
     * Update the channel list
     */
    updateChannelList(channels) {
      this.availableChannels = ["Lobby", ...channels.filter((c) => c !== "" && c !== "Lobby")];
      this.renderChannelTabs();
    }
    /**
     * Update the current channel
     */
    setCurrentChannel(channelName) {
      this.currentChannel = channelName;
      this.renderChannelTabs();
    }
    /**
     * Vide les messages
     */
    clearMessages() {
      if (this.messagesContainer) {
        this.messagesContainer.innerHTML = "";
      }
    }
    /**
     * Cache la liste des canaux
     */
    hideChannelList() {
    }
    /**
     * Update a user's typing status
     */
    updateUserTypingStatus(username, isTyping) {
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
    init() {
      this.posX = 16;
      this.posY = window.innerHeight - 420 - 16;
      this.container = document.createElement("div");
      this.container.id = "chat-panel";
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
      const header = this.createHeader();
      this.container.appendChild(header);
      this.channelTabsContainer = document.createElement("div");
      this.channelTabsContainer.className = "channel-tabs";
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
      this.messagesContainer = document.createElement("div");
      this.messagesContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    `;
      this.container.appendChild(this.messagesContainer);
      this.typingIndicator = document.createElement("div");
      this.typingIndicator.style.cssText = `
      padding: var(--space-2) var(--space-3);
      font-size: var(--text-xs);
      color: var(--text-muted);
      font-style: italic;
      min-height: 24px;
      display: none;
    `;
      this.container.appendChild(this.typingIndicator);
      const inputContainer = this.createInputContainer();
      this.container.appendChild(inputContainer);
      this.createUserListPanel();
      this.createChannelListPanel();
      document.body.appendChild(this.container);
      if (this.onGetUsers) this.onGetUsers();
      if (this.onGetChannels) this.onGetChannels();
    }
    /**
     * Crée le header du chat
     */
    createHeader() {
      const header = document.createElement("div");
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
      header.onmousedown = (e) => this.startDrag(e);
      const title = document.createElement("div");
      title.innerHTML = `
      <div style="font-weight: 600; font-size: var(--text-base); color: var(--text-primary);">\u{1F4AC} Chat</div>
      <div style="font-size: var(--text-xs); color: var(--text-muted);">${this.chatUsers.size} online</div>
    `;
      const controls = document.createElement("div");
      controls.style.cssText = "display: flex; gap: var(--space-2);";
      const channelsBtn = document.createElement("button");
      channelsBtn.className = "btn-icon";
      channelsBtn.innerHTML = "#";
      channelsBtn.title = "Toggle Channels";
      channelsBtn.onclick = (e) => {
        e.stopPropagation();
        this.toggleChannelList();
      };
      const usersBtn = document.createElement("button");
      usersBtn.className = "btn-icon";
      usersBtn.innerHTML = "\u{1F465}";
      usersBtn.title = "Toggle Users";
      usersBtn.onclick = (e) => {
        e.stopPropagation();
        this.toggleUserList();
      };
      const collapseBtn = document.createElement("button");
      collapseBtn.className = "btn-icon";
      collapseBtn.innerHTML = "\u2212";
      collapseBtn.title = "Minimize";
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
    createInputContainer() {
      const container = document.createElement("div");
      container.style.cssText = `
      padding: var(--space-3);
      border-top: 1px solid var(--glass-border);
      display: flex;
      gap: var(--space-2);
      background: rgba(0, 0, 0, 0.2);
    `;
      this.inputElement = document.createElement("input");
      this.inputElement.type = "text";
      this.inputElement.placeholder = "Type a message...";
      this.inputElement.className = "input";
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
        if (e.key === "Enter") {
          this.sendMessage();
        }
      };
      this.inputElement.oninput = () => this.handleTyping();
      const sendBtn = document.createElement("button");
      sendBtn.className = "btn btn-primary";
      sendBtn.innerHTML = "\u{1F4E4}";
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
    createUserListPanel() {
      this.userListContainer = document.createElement("div");
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
      this.container.appendChild(this.userListContainer);
    }
    /**
     * Crée le panel des canaux
     */
    createChannelListPanel() {
      this.channelListContainer = document.createElement("div");
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
      this.container.appendChild(this.channelListContainer);
    }
    /**
     * Rend les tabs de canaux
     */
    renderChannelTabs() {
      if (!this.channelTabsContainer) return;
      this.channelTabsContainer.innerHTML = "";
      this.availableChannels.forEach((channel) => {
        const tab = document.createElement("button");
        const isActive = channel === this.currentChannel;
        tab.className = "channel-tab";
        tab.textContent = `#${channel}`;
        tab.style.cssText = `
        padding: var(--space-2) var(--space-3);
        background: ${isActive ? "var(--primary-blue)" : "transparent"};
        color: ${isActive ? "white" : "var(--text-secondary)"};
        border: 1px solid ${isActive ? "var(--primary-blue)" : "transparent"};
        border-radius: var(--radius-md);
        font-size: var(--text-sm);
        font-weight: ${isActive ? "600" : "500"};
        cursor: pointer;
        transition: all var(--transition-base);
        white-space: nowrap;
      `;
        tab.onmouseenter = () => {
          if (!isActive) {
            tab.style.background = "rgba(51, 65, 85, 0.5)";
            tab.style.borderColor = "var(--glass-border)";
          }
        };
        tab.onmouseleave = () => {
          if (!isActive) {
            tab.style.background = "transparent";
            tab.style.borderColor = "transparent";
          }
        };
        tab.onclick = () => {
          if (this.onJoinChannel && channel !== this.currentChannel) {
            this.onJoinChannel(channel === "Lobby" ? "" : channel);
          }
        };
        this.channelTabsContainer.appendChild(tab);
      });
    }
    /**
     * Rend la liste des utilisateurs
     */
    renderUserList() {
      if (!this.userListContainer) return;
      const users = Array.from(this.chatUsers.values());
      const onlineCount = users.length;
      this.userListContainer.innerHTML = `
      <div style="font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-3); font-size: var(--text-sm);">
        Online Users (${onlineCount})
      </div>
    `;
      users.forEach((user) => {
        const userDiv = document.createElement("div");
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
          ${isTyping ? `<div style="font-size: var(--text-xs); color: var(--text-muted); font-style: italic;">typing...</div>` : ""}
        </div>
      `;
        userDiv.onmouseenter = () => {
          userDiv.style.background = "rgba(51, 65, 85, 0.4)";
        };
        userDiv.onmouseleave = () => {
          userDiv.style.background = "transparent";
        };
        this.userListContainer.appendChild(userDiv);
      });
    }
    /**
     * Update the typing indicator
     */
    updateTypingIndicator() {
      if (!this.typingIndicator) return;
      if (this.typingUsers.size === 0) {
        this.typingIndicator.style.display = "none";
        return;
      }
      this.typingIndicator.style.display = "block";
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
    sendMessage() {
      if (!this.inputElement || !this.inputElement.value.trim()) return;
      const message = this.inputElement.value.trim();
      this.inputElement.value = "";
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
    handleTyping() {
      const inputValue = this.inputElement?.value || "";
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
        }, 3e3);
      }
    }
    /**
     * Toggle la liste des utilisateurs
     */
    toggleUserList() {
      this.showUserList = !this.showUserList;
      if (this.userListContainer) {
        this.userListContainer.style.display = this.showUserList ? "block" : "none";
      }
      if (this.showUserList && this.onGetUsers) {
        this.onGetUsers();
      }
    }
    /**
     * Toggle la liste des canaux
     */
    toggleChannelList() {
      this.showChannelList = !this.showChannelList;
      if (this.channelListContainer) {
        this.channelListContainer.style.display = this.showChannelList ? "block" : "none";
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
    renderChannelList() {
      if (!this.channelListContainer) return;
      const channelCount = this.availableChannels.length;
      this.channelListContainer.innerHTML = `
      <div style="font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-3); font-size: var(--text-sm);">
        All Channels (${channelCount})
      </div>
    `;
      this.availableChannels.forEach((channel) => {
        const channelDiv = document.createElement("div");
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
        background: ${isActive ? "var(--primary-blue)" : "transparent"};
      `;
        channelDiv.innerHTML = `
        <div style="
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: ${isActive ? "rgba(255,255,255,0.2)" : "rgba(74, 144, 226, 0.3)"};
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: var(--text-sm);
        ">#</div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: var(--text-sm); color: ${isActive ? "white" : "var(--text-primary)"}; font-weight: ${isActive ? "600" : "500"};">
            ${this.escapeHtml(channel || "Lobby")}
          </div>
        </div>
      `;
        channelDiv.onmouseenter = () => {
          if (!isActive) {
            channelDiv.style.background = "rgba(51, 65, 85, 0.4)";
          }
        };
        channelDiv.onmouseleave = () => {
          if (!isActive) {
            channelDiv.style.background = "transparent";
          }
        };
        channelDiv.onclick = () => {
          if (this.onJoinChannel && channel !== this.currentChannel) {
            this.onJoinChannel(channel === "Lobby" ? "" : channel);
          }
        };
        this.channelListContainer.appendChild(channelDiv);
      });
    }
    /**
     * Toggle collapse du chat
     */
    toggleCollapse() {
      this.isCollapsed = !this.isCollapsed;
      if (this.container) {
        this.container.style.height = this.isCollapsed ? "56px" : "420px";
        const children = this.container.children;
        for (let i = 1; i < children.length; i++) {
          children[i].style.display = this.isCollapsed ? "none" : "flex";
        }
      }
    }
    /**
     * Scroll vers le bas
     */
    scrollToBottom() {
      if (this.messagesContainer) {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      }
    }
    /**
     * Génère une couleur pour un utilisateur (basée sur le hash du nom)
     */
    getColorForUser(username) {
      const colors = [
        "#0EA5E9",
        "#8B5CF6",
        "#EC4899",
        "#F59E0B",
        "#10B981",
        "#3B82F6",
        "#EF4444",
        "#06B6D4"
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
    getInitials(name) {
      const parts = name.trim().split(" ");
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    }
    /**
     * Échappe le HTML pour prévenir XSS
     */
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
    /**
     * Start dragging the chat panel
     */
    startDrag(e) {
      if (!this.container) return;
      if (e.target.tagName === "BUTTON") {
        return;
      }
      this.isDragging = true;
      this.dragOffsetX = e.clientX - this.posX;
      this.dragOffsetY = e.clientY - this.posY;
      document.onmousemove = (e2) => this.onDrag(e2);
      document.onmouseup = () => this.stopDrag();
      e.preventDefault();
    }
    /**
     * Handle dragging
     */
    onDrag(e) {
      if (!this.isDragging || !this.container) return;
      this.posX = e.clientX - this.dragOffsetX;
      this.posY = e.clientY - this.dragOffsetY;
      const maxX = window.innerWidth - 380;
      const maxY = window.innerHeight - (this.isCollapsed ? 56 : 420);
      this.posX = Math.max(0, Math.min(this.posX, maxX));
      this.posY = Math.max(0, Math.min(this.posY, maxY));
      this.updatePosition();
    }
    /**
     * Stop dragging
     */
    stopDrag() {
      this.isDragging = false;
      document.onmousemove = null;
      document.onmouseup = null;
    }
    /**
     * Update panel position
     */
    updatePosition() {
      if (this.container) {
        this.container.style.left = `${this.posX}px`;
        this.container.style.top = `${this.posY}px`;
      }
    }
  };

  // src/shared/land-utils.ts
  var LND_CLASS_MASK = 192;
  var LND_TYPE_MASK = 60;
  var LND_VAR_MASK = 3;
  var LND_CLASS_SHIFT = 6;
  var LND_TYPE_SHIFT = 2;
  function landClassOf(landId) {
    return (landId & LND_CLASS_MASK) >> LND_CLASS_SHIFT;
  }
  function landTypeOf(landId) {
    const typeIdx = (landId & LND_TYPE_MASK) >> LND_TYPE_SHIFT;
    return typeIdx <= 13 /* Special */ ? typeIdx : 13 /* Special */;
  }
  function landVarOf(landId) {
    return landId & LND_VAR_MASK;
  }
  function isWater(landId) {
    return landClassOf(landId) === 3 /* ZoneD */;
  }
  function isDeepWater(landId) {
    return isWater(landId) && landTypeOf(landId) === 0 /* Center */;
  }
  function isWaterEdge(landId) {
    return isWater(landId) && landTypeOf(landId) !== 0 /* Center */;
  }
  function isWaterCorner(landId) {
    if (!isWater(landId)) return false;
    const type = landTypeOf(landId);
    return type >= 5 /* NEo */ && type <= 12 /* NWi */;
  }
  function canBuildOn(landId) {
    if (isWater(landId)) return false;
    if (landTypeOf(landId) === 13 /* Special */) return false;
    return true;
  }
  function getEdgeDirection(landId) {
    const type = landTypeOf(landId);
    switch (type) {
      case 1 /* N */:
        return "N";
      case 2 /* E */:
        return "E";
      case 3 /* S */:
        return "S";
      case 4 /* W */:
        return "W";
      default:
        return null;
    }
  }
  function isSpecialTile(landId) {
    return landTypeOf(landId) === 13 /* Special */;
  }
  function decodeLandId(landId) {
    const landClass = landClassOf(landId);
    const landType = landTypeOf(landId);
    const landVar = landVarOf(landId);
    const water = landClass === 3 /* ZoneD */;
    return {
      raw: landId,
      landClass,
      landType,
      landVar,
      isWater: water,
      isWaterEdge: water && landType !== 0 /* Center */,
      isDeepWater: water && landType === 0 /* Center */,
      canBuild: !water && landType !== 13 /* Special */,
      edgeDirection: getEdgeDirection(landId)
    };
  }
  function landClassName(landClass) {
    switch (landClass) {
      case 0 /* ZoneA */:
        return "Grass";
      case 1 /* ZoneB */:
        return "MidGrass";
      case 2 /* ZoneC */:
        return "DryGround";
      case 3 /* ZoneD */:
        return "Water";
      default:
        return "Unknown";
    }
  }
  function landTypeName(landType) {
    switch (landType) {
      case 0 /* Center */:
        return "Center";
      case 1 /* N */:
        return "North";
      case 2 /* E */:
        return "East";
      case 3 /* S */:
        return "South";
      case 4 /* W */:
        return "West";
      case 5 /* NEo */:
        return "NE Outer";
      case 6 /* SEo */:
        return "SE Outer";
      case 7 /* SWo */:
        return "SW Outer";
      case 8 /* NWo */:
        return "NW Outer";
      case 9 /* NEi */:
        return "NE Inner";
      case 10 /* SEi */:
        return "SE Inner";
      case 11 /* SWi */:
        return "SW Inner";
      case 12 /* NWi */:
        return "NW Inner";
      case 13 /* Special */:
        return "Special";
      default:
        return "Unknown";
    }
  }
  function formatLandId(landId) {
    const decoded = decodeLandId(landId);
    const hex = "0x" + landId.toString(16).toUpperCase().padStart(2, "0");
    return `${hex} (${landClassName(decoded.landClass)}, ${landTypeName(decoded.landType)}, var=${decoded.landVar})`;
  }

  // src/client/renderer/terrain-loader.ts
  var TerrainLoader = class {
    constructor() {
      this.pixelData = null;
      this.width = 0;
      this.height = 0;
      this.metadata = null;
      this.loaded = false;
      this.mapName = "";
    }
    /**
     * Load terrain data for a map
     * @param mapName - Name of the map (e.g., 'Antiqua', 'Zyrane')
     * @returns TerrainData with pixel indices and metadata
     */
    async loadMap(mapName) {
      const apiUrl = `/api/map-data/${encodeURIComponent(mapName)}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch map data: ${response.status} - ${errorText}`);
      }
      const mapFileData = await response.json();
      const { metadata, bmpUrl } = mapFileData;
      const bmpResponse = await fetch(bmpUrl);
      if (!bmpResponse.ok) {
        throw new Error(`Failed to fetch BMP file: ${bmpResponse.status}`);
      }
      const bmpBuffer = await bmpResponse.arrayBuffer();
      const parsedBmp = this.parseBmp(bmpBuffer);
      if (parsedBmp.width !== metadata.width || parsedBmp.height !== metadata.height) {
        console.warn(`[TerrainLoader] Dimension mismatch: BMP is ${parsedBmp.width}\xD7${parsedBmp.height}, metadata says ${metadata.width}\xD7${metadata.height}`);
      }
      this.pixelData = parsedBmp.pixelData;
      this.width = parsedBmp.width;
      this.height = parsedBmp.height;
      this.metadata = metadata;
      this.mapName = mapName;
      this.loaded = true;
      const paletteData = this.generatePaletteData2D(this.pixelData, this.width, this.height);
      return {
        width: this.width,
        height: this.height,
        pixelData: this.pixelData,
        paletteData,
        metadata: this.metadata
      };
    }
    /**
     * Parse a BMP file from ArrayBuffer
     * Supports 8-bit indexed color BMPs (Windows 3.x format)
     */
    parseBmp(buffer) {
      const view = new DataView(buffer);
      const fileHeader = this.parseFileHeader(view);
      if (fileHeader.signature !== "BM") {
        throw new Error(`Invalid BMP signature: ${fileHeader.signature}`);
      }
      const dibHeader = this.parseDibHeader(view, 14);
      if (dibHeader.bitsPerPixel !== 8) {
        throw new Error(`Unsupported BMP format: ${dibHeader.bitsPerPixel} bits per pixel (only 8-bit supported)`);
      }
      if (dibHeader.compression !== 0) {
        throw new Error(`Unsupported BMP compression: ${dibHeader.compression} (only uncompressed supported)`);
      }
      const paletteOffset = 14 + dibHeader.headerSize;
      const paletteSize = dibHeader.colorsUsed || 256;
      const palette = new Uint8Array(buffer, paletteOffset, paletteSize * 4);
      const pixelData = this.parsePixelData(buffer, fileHeader.dataOffset, dibHeader);
      return {
        width: dibHeader.width,
        height: Math.abs(dibHeader.height),
        // Height can be negative for top-down BMPs
        bitsPerPixel: dibHeader.bitsPerPixel,
        palette,
        pixelData
      };
    }
    /**
     * Parse BMP file header (14 bytes)
     */
    parseFileHeader(view) {
      return {
        signature: String.fromCharCode(view.getUint8(0), view.getUint8(1)),
        fileSize: view.getUint32(2, true),
        reserved1: view.getUint16(6, true),
        reserved2: view.getUint16(8, true),
        dataOffset: view.getUint32(10, true)
      };
    }
    /**
     * Parse BMP DIB header (BITMAPINFOHEADER - 40 bytes)
     */
    parseDibHeader(view, offset) {
      return {
        headerSize: view.getUint32(offset, true),
        width: view.getInt32(offset + 4, true),
        height: view.getInt32(offset + 8, true),
        colorPlanes: view.getUint16(offset + 12, true),
        bitsPerPixel: view.getUint16(offset + 14, true),
        compression: view.getUint32(offset + 16, true),
        imageSize: view.getUint32(offset + 20, true),
        xPixelsPerMeter: view.getInt32(offset + 24, true),
        yPixelsPerMeter: view.getInt32(offset + 28, true),
        colorsUsed: view.getUint32(offset + 32, true),
        importantColors: view.getUint32(offset + 36, true)
      };
    }
    /**
     * Parse pixel data from BMP
     * BMP stores pixels bottom-up by default, with row padding to 4-byte boundaries
     */
    parsePixelData(buffer, dataOffset, header) {
      const width = header.width;
      const height = Math.abs(header.height);
      const isBottomUp = header.height > 0;
      const bytesPerRow = Math.ceil(width / 4) * 4;
      const pixelData = new Uint8Array(width * height);
      const rawData = new Uint8Array(buffer, dataOffset);
      for (let row = 0; row < height; row++) {
        const srcRow = isBottomUp ? height - 1 - row : row;
        const srcOffset = srcRow * bytesPerRow;
        const dstOffset = row * width;
        for (let col = 0; col < width; col++) {
          pixelData[dstOffset + col] = rawData[srcOffset + col];
        }
      }
      return pixelData;
    }
    /**
     * Generate 2D palette data array from flat pixelData
     * Used by road system for water detection
     * @param pixelData - Flat Uint8Array of palette indices
     * @param width - Map width
     * @param height - Map height
     * @returns 2D array [row][col] of palette indices
     */
    generatePaletteData2D(pixelData, width, height) {
      const result = [];
      for (let row = 0; row < height; row++) {
        const rowData = [];
        for (let col = 0; col < width; col++) {
          rowData.push(pixelData[row * width + col]);
        }
        result.push(rowData);
      }
      return result;
    }
    /**
     * Get texture ID (palette index) for a tile coordinate
     * @param x - X coordinate (0 to width-1)
     * @param y - Y coordinate (0 to height-1)
     * @returns Palette index (0-255) or 0 if out of bounds
     */
    getTextureId(x, y) {
      if (!this.pixelData) return 0;
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
      return this.pixelData[y * this.width + x];
    }
    /**
     * Get the raw pixel data array
     * @returns Uint8Array of palette indices, or empty array if not loaded
     */
    getPixelData() {
      return this.pixelData || new Uint8Array(0);
    }
    /**
     * Get map metadata
     * @returns MapMetadata or null if not loaded
     */
    getMetadata() {
      return this.metadata;
    }
    /**
     * Get map dimensions
     * @returns Object with width and height
     */
    getDimensions() {
      return { width: this.width, height: this.height };
    }
    /**
     * Check if terrain data is loaded
     */
    isLoaded() {
      return this.loaded;
    }
    /**
     * Get the name of the loaded map
     */
    getMapName() {
      return this.mapName;
    }
    // ===========================================================================
    // LAND METADATA METHODS
    // ===========================================================================
    /**
     * Get raw landId for a tile coordinate
     * @param x - X coordinate (0 to width-1)
     * @param y - Y coordinate (0 to height-1)
     * @returns Raw landId byte (0-255) or 0 if out of bounds
     */
    getLandId(x, y) {
      return this.getTextureId(x, y);
    }
    /**
     * Get LandClass for a tile coordinate
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns LandClass enum value (ZoneA, ZoneB, ZoneC, ZoneD)
     */
    getLandClass(x, y) {
      return landClassOf(this.getLandId(x, y));
    }
    /**
     * Get LandType for a tile coordinate
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns LandType enum value (Center, N, E, S, W, corners, Special)
     */
    getLandType(x, y) {
      return landTypeOf(this.getLandId(x, y));
    }
    /**
     * Get LandVar for a tile coordinate
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns Variation index (0-3)
     */
    getLandVar(x, y) {
      return landVarOf(this.getLandId(x, y));
    }
    /**
     * Check if a tile is water (ZoneD)
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns true if water tile
     */
    isWater(x, y) {
      return isWater(this.getLandId(x, y));
    }
    /**
     * Check if a tile is deep water (water center)
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns true if deep water (water + center type)
     */
    isDeepWater(x, y) {
      return isDeepWater(this.getLandId(x, y));
    }
    /**
     * Check if a tile is a water edge (water but not center)
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns true if water edge tile
     */
    isWaterEdge(x, y) {
      return isWaterEdge(this.getLandId(x, y));
    }
    /**
     * Check if a tile is a water corner (inner or outer)
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns true if water corner tile
     */
    isWaterCorner(x, y) {
      return isWaterCorner(this.getLandId(x, y));
    }
    /**
     * Check if buildings can be placed on a tile
     * Buildings cannot be placed on water or special tiles
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns true if building placement is allowed
     */
    canBuildOn(x, y) {
      return canBuildOn(this.getLandId(x, y));
    }
    /**
     * Check if a tile is a special tile (trees, decorations, etc.)
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns true if special tile
     */
    isSpecialTile(x, y) {
      return isSpecialTile(this.getLandId(x, y));
    }
    /**
     * Get fully decoded land information for a tile
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns Complete DecodedLandId object
     */
    getLandInfo(x, y) {
      return decodeLandId(this.getLandId(x, y));
    }
    /**
     * Get formatted landId string for debugging
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns Formatted string like "0xDE (Water, SWo, var=2)"
     */
    formatLandId(x, y) {
      return formatLandId(this.getLandId(x, y));
    }
    /**
     * Unload terrain data to free memory
     */
    unload() {
      this.pixelData = null;
      this.metadata = null;
      this.width = 0;
      this.height = 0;
      this.loaded = false;
      this.mapName = "";
      console.log("[TerrainLoader] Terrain data unloaded");
    }
  };

  // src/shared/map-config.ts
  var ZOOM_LEVELS = [
    { level: 0, u: 4, tileWidth: 8, tileHeight: 4 },
    // 4×8
    { level: 1, u: 8, tileWidth: 16, tileHeight: 8 },
    // 8×16
    { level: 2, u: 16, tileWidth: 32, tileHeight: 16 },
    // 16×32 (default)
    { level: 3, u: 32, tileWidth: 64, tileHeight: 32 }
    // 32×64
  ];
  var Rotation = /* @__PURE__ */ ((Rotation3) => {
    Rotation3[Rotation3["NORTH"] = 0] = "NORTH";
    Rotation3[Rotation3["EAST"] = 1] = "EAST";
    Rotation3[Rotation3["SOUTH"] = 2] = "SOUTH";
    Rotation3[Rotation3["WEST"] = 3] = "WEST";
    return Rotation3;
  })(Rotation || {});
  var SEASON_NAMES = {
    [0 /* WINTER */]: "Winter",
    [1 /* SPRING */]: "Spring",
    [2 /* SUMMER */]: "Summer",
    [3 /* AUTUMN */]: "Autumn"
  };
  var MAP_TERRAIN_TYPES = {
    "Shamba": "Alien Swamp",
    "Zorcon": "Earth",
    "Angelicus": "Earth",
    "Antiqua": "Earth",
    "Zyrane": "Earth"
  };
  function getTerrainTypeForMap(mapName) {
    return MAP_TERRAIN_TYPES[mapName] || "Earth";
  }

  // src/client/renderer/coordinate-mapper.ts
  var CoordinateMapper = class {
    constructor(mapWidth = 2e3, mapHeight = 2e3) {
      this.mapWidth = mapWidth;
      this.mapHeight = mapHeight;
    }
    /**
     * Convert map tile coordinates (i, j) to screen pixel coordinates (x, y)
     * Based on Lander.pas algorithm, modified for seamless isometric tiling.
     *
     * For seamless tiles, adjacent tiles must overlap by half their dimensions:
     * - X step between tiles = tileWidth/2 = u
     * - Y step between tiles = tileHeight/2 = u/2
     *
     * @param i - Row index (0 to mapHeight-1)
     * @param j - Column index (0 to mapWidth-1)
     * @param zoomLevel - Zoom level (0-3)
     * @param rotation - Rotation (0=North, 1=East, 2=South, 3=West)
     * @param origin - Camera position (screen origin offset)
     * @returns Screen coordinates {x, y} - top center point of the diamond tile
     */
    mapToScreen(i, j, zoomLevel, rotation, origin) {
      const config2 = ZOOM_LEVELS[zoomLevel];
      const u = config2.u;
      const rows = this.mapHeight;
      const cols = this.mapWidth;
      const rotated = this.rotateMapCoordinates(i, j, rotation);
      const ri = rotated.x;
      const rj = rotated.y;
      const x = u * (rows - ri + rj) - origin.x;
      const y = u / 2 * (rows - ri + (cols - rj)) - origin.y;
      return { x, y };
    }
    /**
     * Convert screen pixel coordinates (x, y) to map tile coordinates (i, j)
     * Inverse of mapToScreen, derived from the seamless tiling formula.
     *
     * @param x - Screen X coordinate
     * @param y - Screen Y coordinate
     * @param zoomLevel - Zoom level (0-3)
     * @param rotation - Rotation (0=North, 1=East, 2=South, 3=West)
     * @param origin - Camera position (screen origin offset)
     * @returns Map coordinates {x: i, y: j}
     */
    screenToMap(x, y, zoomLevel, rotation, origin) {
      const config2 = ZOOM_LEVELS[zoomLevel];
      const u = config2.u;
      const rows = this.mapHeight;
      const cols = this.mapWidth;
      const screenX = x + origin.x;
      const screenY = y + origin.y;
      const A = screenX / u;
      const B = 2 * screenY / u;
      const ri = Math.floor((2 * rows + cols - A - B) / 2);
      const rj = Math.floor((A - B + cols) / 2);
      const original = this.rotateMapCoordinates(ri, rj, this.getInverseRotation(rotation));
      return { x: original.x, y: original.y };
    }
    /**
     * Calculate visible tile bounds for a given viewport
     * Used for viewport culling to determine which tiles to render
     *
     * @param viewport - Screen viewport rectangle
     * @param zoomLevel - Zoom level (0-3)
     * @param rotation - Rotation (0-3)
     * @param origin - Camera position
     * @returns Tile bounds {minI, maxI, minJ, maxJ}
     */
    getVisibleBounds(viewport, zoomLevel, rotation, origin) {
      const corners = [
        this.screenToMap(viewport.x, viewport.y, zoomLevel, rotation, origin),
        this.screenToMap(viewport.x + viewport.width, viewport.y, zoomLevel, rotation, origin),
        this.screenToMap(viewport.x, viewport.y + viewport.height, zoomLevel, rotation, origin),
        this.screenToMap(viewport.x + viewport.width, viewport.y + viewport.height, zoomLevel, rotation, origin)
      ];
      const is = corners.map((c) => c.x);
      const js = corners.map((c) => c.y);
      const minI = Math.max(0, Math.floor(Math.min(...is)) - 1);
      const maxI = Math.min(this.mapHeight - 1, Math.ceil(Math.max(...is)) + 1);
      const minJ = Math.max(0, Math.floor(Math.min(...js)) - 1);
      const maxJ = Math.min(this.mapWidth - 1, Math.ceil(Math.max(...js)) + 1);
      return { minI, maxI, minJ, maxJ };
    }
    /**
     * Apply rotation transformation to map coordinates
     * Rotates around map center
     *
     * @param i - Row index
     * @param j - Column index
     * @param rotation - Rotation (0-3)
     * @returns Rotated coordinates {x: i, y: j}
     */
    rotateMapCoordinates(i, j, rotation) {
      const centerI = this.mapHeight / 2;
      const centerJ = this.mapWidth / 2;
      const relI = i - centerI;
      const relJ = j - centerJ;
      let newI;
      let newJ;
      switch (rotation) {
        case 0 /* NORTH */:
          newI = relI;
          newJ = relJ;
          break;
        case 1 /* EAST */:
          newI = relJ;
          newJ = -relI;
          break;
        case 2 /* SOUTH */:
          newI = -relI;
          newJ = -relJ;
          break;
        case 3 /* WEST */:
          newI = -relJ;
          newJ = relI;
          break;
        default:
          newI = relI;
          newJ = relJ;
      }
      return {
        x: newI + centerI,
        y: newJ + centerJ
      };
    }
    /**
     * Get inverse rotation
     * @param rotation - Original rotation
     * @returns Inverse rotation
     */
    getInverseRotation(rotation) {
      switch (rotation) {
        case 0 /* NORTH */:
          return 0 /* NORTH */;
        case 1 /* EAST */:
          return 3 /* WEST */;
        case 2 /* SOUTH */:
          return 2 /* SOUTH */;
        case 3 /* WEST */:
          return 1 /* EAST */;
        default:
          return 0 /* NORTH */;
      }
    }
  };

  // src/client/renderer/texture-cache.ts
  var TERRAIN_COLORS = {
    // Water (indices 192-255)
    192: "#1a3a5c",
    193: "#1d4268",
    194: "#204a74",
    195: "#234f80",
    196: "#1a3a5c",
    197: "#1d4268",
    198: "#204a74",
    199: "#234f80",
    200: "#287389",
    201: "#2a7a90",
    202: "#2c8197",
    203: "#2e889e",
    // Grass (indices 0-63)
    0: "#5a8c4f",
    1: "#5d8f52",
    2: "#608255",
    3: "#638558",
    4: "#4a7c3f",
    5: "#4d7f42",
    6: "#507245",
    7: "#537548",
    // MidGrass (indices 64-127)
    64: "#6b9460",
    65: "#6e9763",
    66: "#718a66",
    67: "#748d69",
    100: "#7a9a70",
    101: "#7d9d73",
    102: "#809076",
    103: "#839379",
    // DryGround (indices 128-191)
    128: "#8b7355",
    129: "#8e7658",
    130: "#91795b",
    131: "#947c5e",
    132: "#877050",
    133: "#8a7353",
    134: "#8d7656",
    135: "#907959",
    160: "#9a836a",
    161: "#9d866d",
    162: "#a08970",
    163: "#a38c73"
  };
  function getFallbackColor(paletteIndex) {
    if (TERRAIN_COLORS[paletteIndex]) {
      return TERRAIN_COLORS[paletteIndex];
    }
    const landClass = landClassOf(paletteIndex);
    switch (landClass) {
      case 3 /* ZoneD */: {
        const hue = 200 + paletteIndex % 20;
        const sat = 40 + paletteIndex % 20;
        const light = 25 + paletteIndex % 15;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
      case 2 /* ZoneC */: {
        const hue = 30 + paletteIndex % 15;
        const sat = 30 + paletteIndex % 20;
        const light = 35 + paletteIndex % 20;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
      case 1 /* ZoneB */: {
        const hue = 70 + paletteIndex % 30;
        const sat = 35 + paletteIndex % 25;
        const light = 35 + paletteIndex % 20;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
      case 0 /* ZoneA */:
      default: {
        const hue = 90 + paletteIndex % 30;
        const sat = 40 + paletteIndex % 25;
        const light = 30 + paletteIndex % 20;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
    }
  }
  var TextureCache = class {
    constructor(maxSize = 1024) {
      this.cache = /* @__PURE__ */ new Map();
      this.terrainType = "Earth";
      this.season = 2 /* SUMMER */;
      // Default to summer
      this.accessCounter = 0;
      // Statistics
      this.hits = 0;
      this.misses = 0;
      this.evictions = 0;
      this.maxSize = maxSize;
    }
    /**
     * Set the terrain type for texture loading
     */
    setTerrainType(terrainType) {
      if (this.terrainType !== terrainType) {
        this.terrainType = terrainType;
        this.clear();
        console.log(`[TextureCache] Terrain type set to: ${terrainType}, current season: ${SEASON_NAMES[this.season]}`);
      }
    }
    /**
     * Get the current terrain type
     */
    getTerrainType() {
      return this.terrainType;
    }
    /**
     * Set the season for texture loading
     * @param season - Season (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
     */
    setSeason(season) {
      if (this.season !== season) {
        this.season = season;
        this.clear();
        console.log(`[TextureCache] Season changed to ${SEASON_NAMES[season]}`);
      }
    }
    /**
     * Get the current season
     */
    getSeason() {
      return this.season;
    }
    /**
     * Get the current season name
     */
    getSeasonName() {
      return SEASON_NAMES[this.season];
    }
    /**
     * Generate cache key for a texture
     * Key is based on terrain type, season, and palette index
     */
    getCacheKey(paletteIndex) {
      return `${this.terrainType}-${this.season}-${paletteIndex}`;
    }
    /**
     * Get texture for a palette index (sync - returns cached or null)
     * Use this for fast rendering - if not cached, returns null and starts loading
     *
     * Note: The texture is the same regardless of zoom level.
     * Zoom level only affects how the texture is rendered (scaled).
     */
    getTextureSync(paletteIndex) {
      const key = this.getCacheKey(paletteIndex);
      const entry = this.cache.get(key);
      if (entry && entry.texture) {
        this.cache.delete(key);
        this.cache.set(key, entry);
        this.hits++;
        return entry.texture;
      }
      if (entry && entry.loaded) {
        this.misses++;
        return null;
      }
      if (!entry || !entry.loading) {
        this.loadTexture(paletteIndex);
      }
      this.misses++;
      return null;
    }
    /**
     * Get texture for a palette index (async - waits for load)
     */
    async getTextureAsync(paletteIndex) {
      const key = this.getCacheKey(paletteIndex);
      const entry = this.cache.get(key);
      if (entry) {
        if (entry.texture) {
          this.cache.delete(key);
          this.cache.set(key, entry);
          this.hits++;
          return entry.texture;
        }
        if (entry.loaded) {
          this.misses++;
          return null;
        }
        if (entry.loadPromise) {
          return entry.loadPromise;
        }
      }
      this.misses++;
      return this.loadTexture(paletteIndex);
    }
    /**
     * Get fallback color for a palette index
     */
    getFallbackColor(paletteIndex) {
      return getFallbackColor(paletteIndex);
    }
    /**
     * Load a texture from the server
     */
    async loadTexture(paletteIndex) {
      const key = this.getCacheKey(paletteIndex);
      const existing = this.cache.get(key);
      if (existing?.loadPromise) {
        return existing.loadPromise;
      }
      const loadPromise = this.fetchTexture(paletteIndex);
      this.cache.set(key, {
        texture: null,
        lastAccess: ++this.accessCounter,
        loading: true,
        loaded: false,
        loadPromise
      });
      try {
        const texture = await loadPromise;
        const entry = this.cache.get(key);
        if (entry) {
          entry.texture = texture;
          entry.loading = false;
          entry.loaded = true;
          entry.loadPromise = void 0;
        }
        this.evictIfNeeded();
        return texture;
      } catch (error) {
        this.cache.delete(key);
        return null;
      }
    }
    /**
     * Fetch texture from server and convert to ImageBitmap.
     * Uses season (not zoom level) to fetch the correct texture variant.
     *
     * Textures are served as pre-baked PNGs with alpha channel already applied,
     * so no client-side color keying is needed.
     */
    async fetchTexture(paletteIndex) {
      const url = `/api/terrain-texture/${encodeURIComponent(this.terrainType)}/${this.season}/${paletteIndex}`;
      try {
        const response = await fetch(url);
        if (response.status === 204) {
          return null;
        }
        if (!response.ok) {
          return null;
        }
        const blob = await response.blob();
        return createImageBitmap(blob);
      } catch (error) {
        console.warn(`[TextureCache] Failed to load texture ${paletteIndex}:`, error);
        return null;
      }
    }
    /**
     * Evict least recently used entries if cache is over capacity.
     * Uses Map insertion order for O(1) eviction — oldest entries are first.
     */
    evictIfNeeded() {
      if (this.cache.size <= this.maxSize) return;
      for (const [key, entry] of this.cache) {
        if (this.cache.size <= this.maxSize) break;
        if (entry.loading) continue;
        if (entry.texture) {
          entry.texture.close();
        }
        this.cache.delete(key);
        this.evictions++;
      }
    }
    /**
     * Preload textures for a list of palette indices
     */
    async preload(paletteIndices) {
      const loadPromises = paletteIndices.map(
        (index) => this.getTextureAsync(index)
      );
      await Promise.all(loadPromises);
    }
    /**
     * Clear the entire cache
     */
    clear() {
      for (const entry of this.cache.values()) {
        if (entry.texture) {
          entry.texture.close();
        }
      }
      this.cache.clear();
      this.hits = 0;
      this.misses = 0;
      this.evictions = 0;
      this.accessCounter = 0;
    }
    /**
     * Get cache statistics
     */
    getStats() {
      const total = this.hits + this.misses;
      return {
        size: this.cache.size,
        maxSize: this.maxSize,
        hits: this.hits,
        misses: this.misses,
        evictions: this.evictions,
        hitRate: total > 0 ? this.hits / total : 0
      };
    }
    /**
     * Check if a texture is cached
     */
    has(paletteIndex) {
      const key = this.getCacheKey(paletteIndex);
      const entry = this.cache.get(key);
      return entry !== void 0 && entry.texture !== null;
    }
    /**
     * Get count of loaded textures
     */
    getLoadedCount() {
      let count = 0;
      for (const entry of this.cache.values()) {
        if (entry.texture) {
          count++;
        }
      }
      return count;
    }
  };

  // src/client/renderer/texture-atlas-cache.ts
  var TERRAIN_COLORS2 = {
    192: "#1a3a5c",
    193: "#1d4268",
    194: "#204a74",
    195: "#234f80",
    196: "#1a3a5c",
    197: "#1d4268",
    198: "#204a74",
    199: "#234f80",
    200: "#287389",
    201: "#2a7a90",
    202: "#2c8197",
    203: "#2e889e",
    0: "#5a8c4f",
    1: "#5d8f52",
    2: "#608255",
    3: "#638558",
    4: "#4a7c3f",
    5: "#4d7f42",
    6: "#507245",
    7: "#537548",
    64: "#6b9460",
    65: "#6e9763",
    66: "#718a66",
    67: "#748d69",
    128: "#8b7355",
    129: "#8e7658",
    130: "#91795b",
    131: "#947c5e"
  };
  function getFallbackColor2(paletteIndex) {
    if (TERRAIN_COLORS2[paletteIndex]) {
      return TERRAIN_COLORS2[paletteIndex];
    }
    const landClass = landClassOf(paletteIndex);
    switch (landClass) {
      case 3 /* ZoneD */: {
        const hue = 200 + paletteIndex % 20;
        const sat = 40 + paletteIndex % 20;
        const light = 25 + paletteIndex % 15;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
      case 2 /* ZoneC */: {
        const hue = 30 + paletteIndex % 15;
        const sat = 30 + paletteIndex % 20;
        const light = 35 + paletteIndex % 20;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
      case 1 /* ZoneB */: {
        const hue = 70 + paletteIndex % 30;
        const sat = 35 + paletteIndex % 25;
        const light = 35 + paletteIndex % 20;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
      case 0 /* ZoneA */:
      default: {
        const hue = 90 + paletteIndex % 30;
        const sat = 40 + paletteIndex % 25;
        const light = 30 + paletteIndex % 20;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
    }
  }
  var TextureAtlasCache = class {
    constructor() {
      this.atlas = null;
      this.manifest = null;
      this.terrainType = "Earth";
      this.season = 2 /* SUMMER */;
      this.loading = false;
      this.loaded = false;
      this.loadPromise = null;
    }
    /**
     * Set the terrain type (triggers reload if changed)
     */
    setTerrainType(terrainType) {
      if (this.terrainType !== terrainType) {
        this.terrainType = terrainType;
        this.clear();
        console.log(`[TextureAtlasCache] Terrain type set to: ${terrainType}`);
      }
    }
    getTerrainType() {
      return this.terrainType;
    }
    /**
     * Set the season (triggers reload if changed)
     */
    setSeason(season) {
      if (this.season !== season) {
        this.season = season;
        this.clear();
        console.log(`[TextureAtlasCache] Season changed to ${SEASON_NAMES[season]}`);
      }
    }
    getSeason() {
      return this.season;
    }
    getSeasonName() {
      return SEASON_NAMES[this.season];
    }
    /**
     * Load the atlas PNG and manifest JSON from the server.
     * Returns a promise that resolves when both are loaded.
     */
    async loadAtlas() {
      if (this.loaded || this.loading) {
        return this.loadPromise || Promise.resolve();
      }
      this.loading = true;
      this.loadPromise = this._doLoadAtlas();
      try {
        await this.loadPromise;
      } finally {
        this.loading = false;
      }
    }
    async _doLoadAtlas() {
      const terrainType = encodeURIComponent(this.terrainType);
      const atlasUrl = `/api/terrain-atlas/${terrainType}/${this.season}`;
      const manifestUrl = `/api/terrain-atlas/${terrainType}/${this.season}/manifest`;
      try {
        const [atlasResponse, manifestResponse] = await Promise.all([
          fetch(atlasUrl),
          fetch(manifestUrl)
        ]);
        if (!atlasResponse.ok || !manifestResponse.ok) {
          console.warn(`[TextureAtlasCache] Atlas not available for ${this.terrainType}/${SEASON_NAMES[this.season]}`);
          this.loaded = true;
          return;
        }
        const [atlasBlob, manifest] = await Promise.all([
          atlasResponse.blob(),
          manifestResponse.json()
        ]);
        this.atlas = await createImageBitmap(atlasBlob);
        this.manifest = manifest;
        this.loaded = true;
        console.log(`[TextureAtlasCache] Loaded atlas: ${this.terrainType}/${SEASON_NAMES[this.season]} (${Object.keys(manifest.tiles).length} tiles, ${manifest.atlasWidth}x${manifest.atlasHeight})`);
      } catch (error) {
        console.error(`[TextureAtlasCache] Failed to load atlas:`, error);
        this.loaded = true;
      }
    }
    /**
     * Check if the atlas is loaded and ready for rendering
     */
    isReady() {
      return this.loaded && this.atlas !== null && this.manifest !== null;
    }
    /**
     * Get the atlas ImageBitmap for drawImage() calls
     */
    getAtlas() {
      if (!this.loaded && !this.loading) {
        this.loadAtlas();
      }
      return this.atlas;
    }
    /**
     * Get the source rectangle within the atlas for a given palette index.
     * Returns null if the tile is not in the atlas.
     */
    getTileRect(paletteIndex) {
      if (!this.manifest) return null;
      const tile = this.manifest.tiles[String(paletteIndex)];
      if (!tile) return null;
      return {
        sx: tile.x,
        sy: tile.y,
        sw: tile.width,
        sh: tile.height
      };
    }
    /**
     * Check if a tile exists in the atlas
     */
    hasTile(paletteIndex) {
      return this.manifest !== null && String(paletteIndex) in this.manifest.tiles;
    }
    /**
     * Get fallback color for missing tiles
     */
    getFallbackColor(paletteIndex) {
      return getFallbackColor2(paletteIndex);
    }
    /**
     * Get the standard tile height from the manifest
     */
    getStandardTileHeight() {
      return this.manifest?.tileHeight || 32;
    }
    /**
     * Clear the atlas cache (e.g., when terrain type or season changes)
     */
    clear() {
      if (this.atlas) {
        this.atlas.close();
        this.atlas = null;
      }
      this.manifest = null;
      this.loaded = false;
      this.loading = false;
      this.loadPromise = null;
    }
  };

  // src/client/renderer/chunk-cache.ts
  var CHUNK_SIZE = 32;
  var MAX_CHUNKS_PER_ZOOM = {
    0: 300,
    1: 160,
    2: 96,
    3: 48
  };
  var FLAT_MASK = 192;
  var isOffscreenCanvasSupported = typeof OffscreenCanvas !== "undefined";
  function calculateChunkCanvasDimensions(chunkSize, config2) {
    const u = config2.u;
    const width = u * (2 * chunkSize - 1) + config2.tileWidth;
    const height = u * chunkSize + config2.tileHeight;
    return { width, height };
  }
  function getTileScreenPosInChunk(localI, localJ, chunkSize, config2) {
    const u = config2.u;
    const x = u * (chunkSize - localI + localJ);
    const y = u / 2 * (chunkSize - localI + (chunkSize - localJ));
    return { x, y };
  }
  function getChunkScreenPosition(chunkI, chunkJ, chunkSize, config2, mapHeight, mapWidth, origin) {
    const u = config2.u;
    const baseI = chunkI * chunkSize;
    const baseJ = chunkJ * chunkSize;
    const worldX = u * (mapHeight - baseI + baseJ) - origin.x;
    const worldY = u / 2 * (mapHeight - baseI + (mapWidth - baseJ)) - origin.y;
    const localOrigin = getTileScreenPosInChunk(0, 0, chunkSize, config2);
    return {
      x: worldX - localOrigin.x,
      y: worldY - localOrigin.y
    };
  }
  var ChunkCache = class {
    constructor(textureCache, getTextureId) {
      // Cache per zoom level: Map<"chunkI,chunkJ", ChunkEntry>
      this.caches = /* @__PURE__ */ new Map();
      this.accessCounter = 0;
      this.atlasCache = null;
      this.mapWidth = 0;
      this.mapHeight = 0;
      // Server chunk fetching
      this.mapName = "";
      this.terrainType = "";
      this.season = 2;
      // Default to Summer
      this.useServerChunks = true;
      this.serverChunkFailed = false;
      // Set to true after first 404, disables server for session
      // Rendering queue
      this.renderQueue = [];
      this.isProcessingQueue = false;
      // Debounced chunk-ready notification (reduces render thrashing at Z0/Z1)
      this.chunkReadyTimer = null;
      this.CHUNK_READY_DEBOUNCE_MS = 80;
      // Batch notifications within this window
      // Stats
      this.stats = {
        chunksRendered: 0,
        cacheHits: 0,
        cacheMisses: 0,
        evictions: 0,
        serverChunksLoaded: 0
      };
      // Callback when chunk becomes ready
      this.onChunkReady = null;
      this.textureCache = textureCache;
      this.getTextureId = getTextureId;
      for (let i = 0; i <= 3; i++) {
        this.caches.set(i, /* @__PURE__ */ new Map());
      }
    }
    /**
     * Set map dimensions (call after loading map)
     */
    setMapDimensions(width, height) {
      this.mapWidth = width;
      this.mapHeight = height;
    }
    /**
     * Set map info for server chunk fetching.
     * Call after loading a map to enable fetching pre-rendered chunks from the server.
     */
    setMapInfo(mapName, terrainType, season) {
      const changed = this.mapName !== mapName || this.terrainType !== terrainType || this.season !== season;
      this.mapName = mapName;
      this.terrainType = terrainType;
      this.season = season;
      this.serverChunkFailed = false;
      if (changed) {
        console.log(`[ChunkCache] Map info set: ${mapName} / ${terrainType} / season=${season}, server chunks enabled`);
      }
    }
    /**
     * Set callback for when a chunk becomes ready (triggers re-render)
     */
    setOnChunkReady(callback) {
      this.onChunkReady = callback;
    }
    /**
     * Set texture atlas cache for atlas-based rendering.
     * When set and ready, chunks render from the atlas instead of individual textures.
     */
    setAtlasCache(atlas) {
      this.atlasCache = atlas;
    }
    /**
     * Get cache key for a chunk
     */
    getKey(chunkI, chunkJ) {
      return `${chunkI},${chunkJ}`;
    }
    /**
     * Get chunk coordinates for a tile
     */
    static getChunkCoords(tileI, tileJ) {
      return {
        chunkI: Math.floor(tileI / CHUNK_SIZE),
        chunkJ: Math.floor(tileJ / CHUNK_SIZE)
      };
    }
    /**
     * Check if chunk rendering is supported (requires OffscreenCanvas)
     */
    isSupported() {
      return isOffscreenCanvasSupported;
    }
    /**
     * Get a chunk canvas (sync - returns null if not ready, triggers async render)
     */
    getChunkSync(chunkI, chunkJ, zoomLevel) {
      if (!isOffscreenCanvasSupported) return null;
      const cache = this.caches.get(zoomLevel);
      if (!cache) return null;
      const key = this.getKey(chunkI, chunkJ);
      const entry = cache.get(key);
      if (entry && entry.ready) {
        entry.lastAccess = ++this.accessCounter;
        this.stats.cacheHits++;
        return entry.canvas;
      }
      if (!entry || !entry.rendering) {
        this.stats.cacheMisses++;
        this.queueChunkRender(chunkI, chunkJ, zoomLevel);
      }
      return null;
    }
    /**
     * Queue a chunk for async rendering
     */
    queueChunkRender(chunkI, chunkJ, zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      const key = this.getKey(chunkI, chunkJ);
      if (!cache.has(key)) {
        const config2 = ZOOM_LEVELS[zoomLevel];
        const dims = calculateChunkCanvasDimensions(CHUNK_SIZE, config2);
        cache.set(key, {
          canvas: new OffscreenCanvas(dims.width, dims.height),
          lastAccess: ++this.accessCounter,
          ready: false,
          rendering: true
        });
      } else {
        const entry = cache.get(key);
        entry.rendering = true;
      }
      this.renderQueue.push({
        chunkI,
        chunkJ,
        zoomLevel,
        resolve: () => {
        }
      });
      this.processRenderQueue();
    }
    /**
     * Get concurrency level based on zoom level in the current queue.
     * Z0/Z1 chunks are tiny (260×130 / 520×260 px) — safe to parallelize more aggressively.
     */
    getConcurrency(zoomLevel) {
      if (zoomLevel <= 0) return 16;
      if (zoomLevel <= 1) return 12;
      return 6;
    }
    /**
     * Schedule a debounced chunk-ready notification.
     * At Z0, dozens of chunks complete in rapid succession — coalescing notifications
     * reduces full pipeline re-renders from ~11 to ~2-3.
     */
    scheduleChunkReadyNotification() {
      if (!this.onChunkReady) return;
      if (this.chunkReadyTimer !== null) {
        clearTimeout(this.chunkReadyTimer);
      }
      this.chunkReadyTimer = setTimeout(() => {
        this.chunkReadyTimer = null;
        if (this.onChunkReady) {
          this.onChunkReady();
        }
      }, this.CHUNK_READY_DEBOUNCE_MS);
    }
    /**
     * Process render queue with parallel fetching.
     * Concurrency scales with zoom level (tiny Z0 chunks allow more parallelism).
     * Notifications are debounced to reduce render thrashing at far zoom.
     */
    async processRenderQueue() {
      if (this.isProcessingQueue) return;
      this.isProcessingQueue = true;
      const queueStart = performance.now();
      let processed = 0;
      const FRAME_BUDGET_MS = 8;
      while (this.renderQueue.length > 0) {
        const batchStart = performance.now();
        const currentZoom = this.renderQueue[0].zoomLevel;
        const concurrency = this.getConcurrency(currentZoom);
        const batch = this.renderQueue.splice(0, concurrency);
        const promises = batch.map(async (request) => {
          const t0 = performance.now();
          await this.renderChunk(request.chunkI, request.chunkJ, request.zoomLevel);
          const dt = performance.now() - t0;
          if (dt > 50) {
            console.log(`[ChunkCache] render ${request.chunkI},${request.chunkJ} z${request.zoomLevel}: ${dt.toFixed(0)}ms (queue: ${this.renderQueue.length})`);
          }
        });
        await Promise.all(promises);
        processed += batch.length;
        this.scheduleChunkReadyNotification();
        if (performance.now() - batchStart > FRAME_BUDGET_MS && this.renderQueue.length > 0) {
          const raf = typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
          await new Promise((resolve) => raf(() => resolve()));
        }
      }
      this.scheduleChunkReadyNotification();
      const totalDt = performance.now() - queueStart;
      if (processed > 1) {
        console.log(`[ChunkCache] queue done: ${processed} chunks in ${totalDt.toFixed(0)}ms (avg ${(totalDt / processed).toFixed(0)}ms/chunk)`);
      }
      this.isProcessingQueue = false;
    }
    /**
     * Flatten a texture ID: replace vegetation/special tiles with their flat center equivalent.
     * Keeps LandClass (bits 7-6), zeros LandType and LandVar.
     */
    flattenTextureId(textureId) {
      if (isSpecialTile(textureId)) {
        return textureId & FLAT_MASK;
      }
      return textureId;
    }
    /**
     * Render a single chunk: try server-side pre-rendered PNG first, fall back to local rendering.
     */
    async renderChunk(chunkI, chunkJ, zoomLevel) {
      if (this.useServerChunks && !this.serverChunkFailed && this.mapName) {
        const success = await this.fetchServerChunk(chunkI, chunkJ, zoomLevel);
        if (success) return;
      }
      await this.renderChunkLocally(chunkI, chunkJ, zoomLevel);
    }
    /**
     * Fetch a pre-rendered chunk PNG from the server.
     * @returns true if successful, false if failed (caller should fall back to local rendering)
     */
    async fetchServerChunk(chunkI, chunkJ, zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      const key = this.getKey(chunkI, chunkJ);
      const entry = cache.get(key);
      if (!entry) return false;
      try {
        const t0 = performance.now();
        const url = `/api/terrain-chunk/${encodeURIComponent(this.mapName)}/${encodeURIComponent(this.terrainType)}/${this.season}/${zoomLevel}/${chunkI}/${chunkJ}`;
        const response = await fetch(url);
        const tFetch = performance.now();
        if (!response.ok) {
          if (response.status === 404) {
            console.warn("[ChunkCache] Server chunks not available, falling back to local rendering");
            this.serverChunkFailed = true;
          }
          return false;
        }
        const blob = await response.blob();
        const tBlob = performance.now();
        const bitmap = await createImageBitmap(blob);
        const tBitmap = performance.now();
        const config2 = ZOOM_LEVELS[zoomLevel];
        const dims = calculateChunkCanvasDimensions(CHUNK_SIZE, config2);
        const ctx = entry.canvas.getContext("2d");
        if (!ctx) {
          bitmap.close();
          return false;
        }
        ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
        ctx.drawImage(bitmap, 0, 0);
        const tDraw = performance.now();
        bitmap.close();
        entry.ready = true;
        entry.rendering = false;
        this.stats.chunksRendered++;
        this.stats.serverChunksLoaded++;
        this.evictIfNeeded(zoomLevel);
        const total = tDraw - t0;
        if (total > 30) {
          console.log(`[ChunkCache] fetch ${chunkI},${chunkJ} z${zoomLevel}: fetch=${(tFetch - t0).toFixed(0)}ms blob=${(tBlob - tFetch).toFixed(0)}ms bitmap=${(tBitmap - tBlob).toFixed(0)}ms draw=${(tDraw - tBitmap).toFixed(0)}ms total=${total.toFixed(0)}ms (${(blob.size / 1024).toFixed(0)} KB)`);
        }
        return true;
      } catch (error) {
        console.warn(`[ChunkCache] Server chunk fetch failed for ${chunkI},${chunkJ}:`, error);
        return false;
      }
    }
    /**
     * Render a single chunk locally (flat terrain only — no tall/vegetation textures).
     * This is the fallback path when server chunks are not available.
     */
    async renderChunkLocally(chunkI, chunkJ, zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      const key = this.getKey(chunkI, chunkJ);
      const entry = cache.get(key);
      if (!entry) return;
      const config2 = ZOOM_LEVELS[zoomLevel];
      const ctx = entry.canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
      const startI = chunkI * CHUNK_SIZE;
      const startJ = chunkJ * CHUNK_SIZE;
      const endI = Math.min(startI + CHUNK_SIZE, this.mapHeight);
      const endJ = Math.min(startJ + CHUNK_SIZE, this.mapWidth);
      const halfWidth = config2.tileWidth / 2;
      const halfHeight = config2.tileHeight / 2;
      const atlas = this.atlasCache?.isReady() ? this.atlasCache : null;
      if (atlas) {
        const atlasImg = atlas.getAtlas();
        for (let i = startI; i < endI; i++) {
          for (let j = startJ; j < endJ; j++) {
            const textureId = this.flattenTextureId(this.getTextureId(j, i));
            const rect = atlas.getTileRect(textureId);
            const localI = i - startI;
            const localJ = j - startJ;
            const screenPos = getTileScreenPosInChunk(localI, localJ, CHUNK_SIZE, config2);
            const x = Math.round(screenPos.x);
            const y = Math.round(screenPos.y);
            if (rect) {
              ctx.drawImage(
                atlasImg,
                rect.sx,
                rect.sy,
                rect.sw,
                rect.sh,
                x - halfWidth,
                y,
                config2.tileWidth,
                config2.tileHeight
              );
            } else {
              const color = getFallbackColor(textureId);
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + halfWidth, y + halfHeight);
              ctx.lineTo(x, y + config2.tileHeight);
              ctx.lineTo(x - halfWidth, y + halfHeight);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
      } else {
        const textureIds = /* @__PURE__ */ new Set();
        for (let i = startI; i < endI; i++) {
          for (let j = startJ; j < endJ; j++) {
            textureIds.add(this.flattenTextureId(this.getTextureId(j, i)));
          }
        }
        await this.textureCache.preload(Array.from(textureIds));
        for (let i = startI; i < endI; i++) {
          for (let j = startJ; j < endJ; j++) {
            const textureId = this.flattenTextureId(this.getTextureId(j, i));
            const texture = this.textureCache.getTextureSync(textureId);
            const localI = i - startI;
            const localJ = j - startJ;
            const screenPos = getTileScreenPosInChunk(localI, localJ, CHUNK_SIZE, config2);
            const x = Math.round(screenPos.x);
            const y = Math.round(screenPos.y);
            if (texture) {
              ctx.drawImage(
                texture,
                x - halfWidth,
                y,
                config2.tileWidth,
                config2.tileHeight
              );
            } else {
              const color = getFallbackColor(textureId);
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + halfWidth, y + halfHeight);
              ctx.lineTo(x, y + config2.tileHeight);
              ctx.lineTo(x - halfWidth, y + halfHeight);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
      }
      entry.ready = true;
      entry.rendering = false;
      this.stats.chunksRendered++;
      this.evictIfNeeded(zoomLevel);
    }
    /**
     * Draw a chunk to the main canvas
     */
    drawChunkToCanvas(ctx, chunkI, chunkJ, zoomLevel, origin) {
      const chunk = this.getChunkSync(chunkI, chunkJ, zoomLevel);
      if (!chunk) return false;
      const config2 = ZOOM_LEVELS[zoomLevel];
      const screenPos = getChunkScreenPosition(
        chunkI,
        chunkJ,
        CHUNK_SIZE,
        config2,
        this.mapHeight,
        this.mapWidth,
        origin
      );
      ctx.drawImage(chunk, Math.round(screenPos.x), Math.round(screenPos.y));
      return true;
    }
    /**
     * Draw a chunk if it's already cached (no async render trigger).
     * Used by the ground layer cache to avoid re-queuing evicted chunks.
     */
    drawChunkIfReady(ctx, chunkI, chunkJ, zoomLevel, origin) {
      if (!isOffscreenCanvasSupported) return false;
      const cache = this.caches.get(zoomLevel);
      if (!cache) return false;
      const key = this.getKey(chunkI, chunkJ);
      const entry = cache.get(key);
      if (!entry || !entry.ready) return false;
      entry.lastAccess = ++this.accessCounter;
      const config2 = ZOOM_LEVELS[zoomLevel];
      const screenPos = getChunkScreenPosition(
        chunkI,
        chunkJ,
        CHUNK_SIZE,
        config2,
        this.mapHeight,
        this.mapWidth,
        origin
      );
      ctx.drawImage(entry.canvas, Math.round(screenPos.x), Math.round(screenPos.y));
      return true;
    }
    /**
     * Get screen position of a chunk for visibility testing
     */
    getChunkScreenBounds(chunkI, chunkJ, zoomLevel, origin) {
      const config2 = ZOOM_LEVELS[zoomLevel];
      const dims = calculateChunkCanvasDimensions(CHUNK_SIZE, config2);
      const screenPos = getChunkScreenPosition(
        chunkI,
        chunkJ,
        CHUNK_SIZE,
        config2,
        this.mapHeight,
        this.mapWidth,
        origin
      );
      return {
        x: screenPos.x,
        y: screenPos.y,
        width: dims.width,
        height: dims.height
      };
    }
    /**
     * Get visible chunk range from pre-computed tile bounds.
     * O(1) — converts tile bounds to chunk bounds with ±1 padding for isometric overlap.
     */
    getVisibleChunksFromBounds(tileBounds) {
      const maxChunkI = Math.ceil(this.mapHeight / CHUNK_SIZE);
      const maxChunkJ = Math.ceil(this.mapWidth / CHUNK_SIZE);
      return {
        minChunkI: Math.max(0, Math.floor(tileBounds.minI / CHUNK_SIZE) - 1),
        maxChunkI: Math.min(maxChunkI - 1, Math.floor(tileBounds.maxI / CHUNK_SIZE) + 1),
        minChunkJ: Math.max(0, Math.floor(tileBounds.minJ / CHUNK_SIZE) - 1),
        maxChunkJ: Math.min(maxChunkJ - 1, Math.floor(tileBounds.maxJ / CHUNK_SIZE) + 1)
      };
    }
    /**
     * Preload chunks for a specific area (anticipate pan)
     */
    preloadChunks(centerChunkI, centerChunkJ, radius, zoomLevel) {
      const maxChunkI = Math.ceil(this.mapHeight / CHUNK_SIZE);
      const maxChunkJ = Math.ceil(this.mapWidth / CHUNK_SIZE);
      for (let di = -radius; di <= radius; di++) {
        for (let dj = -radius; dj <= radius; dj++) {
          const ci = centerChunkI + di;
          const cj = centerChunkJ + dj;
          if (ci >= 0 && ci < maxChunkI && cj >= 0 && cj < maxChunkJ) {
            this.getChunkSync(ci, cj, zoomLevel);
          }
        }
      }
    }
    /**
     * LRU eviction for a specific zoom level
     */
    evictIfNeeded(zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      const maxChunks = MAX_CHUNKS_PER_ZOOM[zoomLevel] ?? 96;
      while (cache.size > maxChunks) {
        let oldestKey = null;
        let oldestAccess = Infinity;
        for (const [key, entry] of cache) {
          if (entry.ready && !entry.rendering && entry.lastAccess < oldestAccess) {
            oldestAccess = entry.lastAccess;
            oldestKey = key;
          }
        }
        if (oldestKey) {
          cache.delete(oldestKey);
          this.stats.evictions++;
        } else {
          break;
        }
      }
    }
    /**
     * Clear cache for a specific zoom level (call when zoom changes)
     */
    clearZoomLevel(zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      if (cache) {
        cache.clear();
      }
    }
    /**
     * Clear all caches
     */
    clearAll() {
      for (const cache of this.caches.values()) {
        cache.clear();
      }
      this.renderQueue = [];
      if (this.chunkReadyTimer !== null) {
        clearTimeout(this.chunkReadyTimer);
        this.chunkReadyTimer = null;
      }
      this.stats = {
        chunksRendered: 0,
        cacheHits: 0,
        cacheMisses: 0,
        evictions: 0,
        serverChunksLoaded: 0
      };
    }
    /**
     * Invalidate a specific chunk (e.g., if terrain changes)
     */
    invalidateChunk(chunkI, chunkJ, zoomLevel) {
      if (zoomLevel !== void 0) {
        const cache = this.caches.get(zoomLevel);
        if (cache) {
          cache.delete(this.getKey(chunkI, chunkJ));
        }
      } else {
        for (const cache of this.caches.values()) {
          cache.delete(this.getKey(chunkI, chunkJ));
        }
      }
    }
    /**
     * Get cache statistics
     */
    getStats() {
      const total = this.stats.cacheHits + this.stats.cacheMisses;
      const cacheSizes = {};
      for (const [level, cache] of this.caches) {
        cacheSizes[level] = cache.size;
      }
      return {
        ...this.stats,
        hitRate: total > 0 ? this.stats.cacheHits / total : 0,
        cacheSizes,
        queueLength: this.renderQueue.length
      };
    }
  };

  // src/client/renderer/isometric-terrain-renderer.ts
  var FLAT_MASK2 = 192;
  var IsometricTerrainRenderer = class {
    constructor(canvas, options) {
      this.chunkCache = null;
      // Rendering mode
      this.useTextures = true;
      this.useChunks = true;
      // Use chunk-based rendering (10-20x faster)
      this.showDebugInfo = true;
      // Show debug info overlay
      // View state
      this.zoomLevel = 2;
      // Default zoom (16×32 pixels per tile)
      this.rotation = 0 /* NORTH */;
      this.season = 2 /* SUMMER */;
      // Default season for textures
      // Camera position in map coordinates (center tile)
      this.cameraI = 500;
      this.cameraJ = 500;
      // Screen origin (for Lander.pas formula)
      this.origin = { x: 0, y: 0 };
      // State flags
      this.loaded = false;
      this.mapName = "";
      // Z0 terrain preview — a single low-res image of the entire map used as an
      // instant backdrop while chunks stream in (eliminates blue triangle flicker)
      this.terrainPreview = null;
      this.terrainPreviewLoading = false;
      // Preview origin offset: the preview image's (0,0) corresponds to chunk (0,0)'s
      // screen position. We store the world-space offset so we can position it correctly.
      this.previewOriginX = 0;
      this.previewOriginY = 0;
      // Available seasons for current terrain type (auto-detected from server)
      this.availableSeasons = [0 /* WINTER */, 1 /* SPRING */, 2 /* SUMMER */, 3 /* AUTUMN */];
      // Rendering stats (for debug info)
      this.lastRenderStats = {
        tilesRendered: 0,
        renderTimeMs: 0,
        visibleBounds: { minI: 0, maxI: 0, minJ: 0, maxJ: 0 }
      };
      // Mouse interaction state
      this.isDragging = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;
      // Render debouncing (prevents flickering when multiple chunks become ready)
      this.pendingRenderRequest = null;
      // External render callback: when set, chunk-ready events delegate to the parent renderer
      // instead of triggering terrain-only renders (which cause blinking)
      this.onRenderNeeded = null;
      this.canvas = canvas;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get 2D rendering context");
      }
      this.ctx = ctx;
      this.terrainLoader = new TerrainLoader();
      this.coordMapper = new CoordinateMapper(2e3, 2e3);
      this.textureCache = new TextureCache();
      this.atlasCache = new TextureAtlasCache();
      if (!options?.disableMouseControls) {
        this.setupMouseControls();
      }
      this.setupResizeHandler();
      this.render();
    }
    /**
     * Load terrain data for a map
     * @param mapName - Name of the map (e.g., 'Shamba', 'Antiqua')
     */
    async loadMap(mapName) {
      const terrainType = getTerrainTypeForMap(mapName);
      this.textureCache.setTerrainType(terrainType);
      this.atlasCache.setTerrainType(terrainType);
      await this.fetchAvailableSeasons(terrainType);
      this.atlasCache.setSeason(this.season);
      this.atlasCache.loadAtlas().then(() => {
        if (this.atlasCache.isReady()) {
          this.chunkCache?.clearAll();
          this.requestRender();
        }
      });
      const terrainData = await this.terrainLoader.loadMap(mapName);
      this.coordMapper = new CoordinateMapper(
        terrainData.width,
        terrainData.height
      );
      this.chunkCache = new ChunkCache(
        this.textureCache,
        (x, y) => this.terrainLoader.getTextureId(x, y)
      );
      this.chunkCache.setAtlasCache(this.atlasCache);
      this.chunkCache.setMapDimensions(terrainData.width, terrainData.height);
      this.chunkCache.setMapInfo(mapName, terrainType, this.season);
      this.chunkCache.setOnChunkReady(() => {
        if (this.onRenderNeeded) {
          this.onRenderNeeded();
        } else {
          this.requestRender();
        }
      });
      this.cameraI = Math.floor(terrainData.height / 2);
      this.cameraJ = Math.floor(terrainData.width / 2);
      this.updateOrigin();
      this.mapName = mapName;
      this.loaded = true;
      this.loadTerrainPreview(mapName, terrainType, this.season);
      this.render();
      return terrainData;
    }
    /**
     * Load the terrain preview image — a single low-res image of the entire map.
     * Used as an instant backdrop at Z0/Z1 while chunks stream in.
     */
    async loadTerrainPreview(mapName, terrainType, season) {
      if (this.terrainPreviewLoading) return;
      this.terrainPreviewLoading = true;
      try {
        const url = `/api/terrain-preview/${encodeURIComponent(mapName)}/${encodeURIComponent(terrainType)}/${season}`;
        const response = await fetch(url);
        if (!response.ok) {
          console.log(`[IsometricRenderer] Terrain preview not available (${response.status})`);
          return;
        }
        const blob = await response.blob();
        this.terrainPreview = await createImageBitmap(blob);
        const mapH = this.terrainLoader.getDimensions().height;
        const mapW = this.terrainLoader.getDimensions().width;
        const z0U = 4;
        const chunkSize = 32;
        const localOriginX = z0U * chunkSize;
        const localOriginY = z0U / 2 * (chunkSize + chunkSize);
        const chunksI = Math.ceil(mapH / chunkSize);
        const chunksJ = Math.ceil(mapW / chunkSize);
        let minX = Infinity, minY = Infinity;
        for (let ci = 0; ci < chunksI; ci++) {
          for (let cj = 0; cj < chunksJ; cj++) {
            const baseI = ci * chunkSize;
            const baseJ = cj * chunkSize;
            const sx = z0U * (mapH - baseI + baseJ) - localOriginX;
            const sy = z0U / 2 * (mapH - baseI + (mapW - baseJ)) - localOriginY;
            minX = Math.min(minX, sx);
            minY = Math.min(minY, sy);
          }
        }
        this.previewOriginX = minX;
        this.previewOriginY = minY;
        console.log(`[IsometricRenderer] Terrain preview loaded: ${this.terrainPreview.width}\xD7${this.terrainPreview.height}`);
        this.requestRender();
      } catch (error) {
        console.warn("[IsometricRenderer] Failed to load terrain preview:", error);
      } finally {
        this.terrainPreviewLoading = false;
      }
    }
    /**
     * Fetch available seasons for a terrain type from server
     * Auto-selects the default season if current season is not available
     */
    async fetchAvailableSeasons(terrainType) {
      try {
        const url = `/api/terrain-info/${encodeURIComponent(terrainType)}`;
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[IsometricRenderer] Failed to fetch terrain info for ${terrainType}: ${response.status}`);
          return;
        }
        const info = await response.json();
        this.availableSeasons = info.availableSeasons;
        if (!info.availableSeasons.includes(this.season)) {
          this.season = info.defaultSeason;
          this.textureCache.setSeason(info.defaultSeason);
          this.atlasCache.setSeason(info.defaultSeason);
          this.chunkCache?.clearAll();
        }
      } catch (error) {
        console.warn(`[IsometricRenderer] Error fetching terrain info:`, error);
      }
    }
    /**
     * Update origin based on camera position
     * The origin is the screen offset that centers the camera tile
     * Uses CoordinateMapper to properly account for rotation
     */
    updateOrigin() {
      const cameraScreen = this.coordMapper.mapToScreen(
        this.cameraI,
        this.cameraJ,
        this.zoomLevel,
        this.rotation,
        { x: 0, y: 0 }
      );
      this.origin = {
        x: Math.round(cameraScreen.x - this.canvas.width / 2),
        y: Math.round(cameraScreen.y - this.canvas.height / 2)
      };
    }
    /**
     * Request a render (debounced via requestAnimationFrame)
     * This prevents flickering when multiple chunks become ready simultaneously
     */
    requestRender() {
      if (this.pendingRenderRequest !== null) {
        return;
      }
      this.pendingRenderRequest = requestAnimationFrame(() => {
        this.pendingRenderRequest = null;
        this.render();
      });
    }
    /**
     * Main render loop
     */
    render() {
      const startTime = performance.now();
      const ctx = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, width, height);
      if (!this.loaded) {
        ctx.fillStyle = "#666";
        ctx.font = "16px monospace";
        ctx.textAlign = "center";
        ctx.fillText("Loading terrain data...", width / 2, height / 2);
        return;
      }
      this.updateOrigin();
      const viewport = {
        x: 0,
        y: 0,
        width,
        height
      };
      const bounds = this.coordMapper.getVisibleBounds(
        viewport,
        this.zoomLevel,
        this.rotation,
        this.origin
      );
      const tilesRendered = this.renderTerrainLayer(bounds);
      if (this.showDebugInfo) {
        this.renderDebugInfo(bounds, tilesRendered);
      }
      this.lastRenderStats = {
        tilesRendered,
        renderTimeMs: performance.now() - startTime,
        visibleBounds: bounds
      };
    }
    /**
     * Render the terrain layer (flat only — no vegetation/tall textures)
     * Uses chunk-based rendering for performance (10-20x faster)
     * Falls back to tile-by-tile rendering when chunks not available or rotation is active
     */
    renderTerrainLayer(bounds) {
      if (this.useChunks && this.chunkCache && this.chunkCache.isSupported() && this.rotation === 0 /* NORTH */) {
        return this.renderTerrainLayerChunked(bounds);
      }
      return this.renderTerrainLayerTiles(bounds);
    }
    /**
     * Chunk-based terrain rendering (fast path)
     * Renders pre-cached chunks instead of individual tiles.
     * At Z0/Z1, draws the terrain preview image as an instant backdrop while chunks load.
     */
    renderTerrainLayerChunked(bounds) {
      if (!this.chunkCache) return 0;
      const ctx = this.ctx;
      const canvasWidth = this.canvas.width;
      const canvasHeight = this.canvas.height;
      const prevSmoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      if (this.terrainPreview && this.zoomLevel <= 1) {
        this.drawTerrainPreview(ctx);
      }
      const visibleChunks = this.chunkCache.getVisibleChunksFromBounds(bounds);
      let chunksDrawn = 0;
      let tilesRendered = 0;
      let visMinI = visibleChunks.maxChunkI, visMaxI = visibleChunks.minChunkI;
      let visMinJ = visibleChunks.maxChunkJ, visMaxJ = visibleChunks.minChunkJ;
      for (let ci = visibleChunks.minChunkI; ci <= visibleChunks.maxChunkI; ci++) {
        for (let cj = visibleChunks.minChunkJ; cj <= visibleChunks.maxChunkJ; cj++) {
          const screenBounds = this.chunkCache.getChunkScreenBounds(ci, cj, this.zoomLevel, this.origin);
          if (screenBounds.x + screenBounds.width < 0 || screenBounds.x > canvasWidth || screenBounds.y + screenBounds.height < 0 || screenBounds.y > canvasHeight) {
            continue;
          }
          visMinI = Math.min(visMinI, ci);
          visMaxI = Math.max(visMaxI, ci);
          visMinJ = Math.min(visMinJ, cj);
          visMaxJ = Math.max(visMaxJ, cj);
          const drawn = this.chunkCache.drawChunkToCanvas(
            ctx,
            ci,
            cj,
            this.zoomLevel,
            this.origin
          );
          if (drawn) {
            chunksDrawn++;
            tilesRendered += CHUNK_SIZE * CHUNK_SIZE;
          } else if (this.zoomLevel >= 2) {
            tilesRendered += this.renderChunkTilesFallback(ci, cj);
          }
        }
      }
      if (visMinI <= visMaxI) {
        const preloadRadius = this.zoomLevel <= 1 ? 1 : 2;
        const centerChunkI = Math.floor((visMinI + visMaxI) / 2);
        const centerChunkJ = Math.floor((visMinJ + visMaxJ) / 2);
        this.chunkCache.preloadChunks(centerChunkI, centerChunkJ, preloadRadius, this.zoomLevel);
      }
      ctx.imageSmoothingEnabled = prevSmoothing;
      return tilesRendered;
    }
    /**
     * Render individual tiles for a chunk that isn't cached yet
     * Flat only — all special tiles are flattened
     */
    renderChunkTilesFallback(chunkI, chunkJ) {
      const config2 = ZOOM_LEVELS[this.zoomLevel];
      const tileWidth = config2.tileWidth;
      const tileHeight = config2.tileHeight;
      const startI = chunkI * CHUNK_SIZE;
      const startJ = chunkJ * CHUNK_SIZE;
      const endI = Math.min(startI + CHUNK_SIZE, this.terrainLoader.getDimensions().height);
      const endJ = Math.min(startJ + CHUNK_SIZE, this.terrainLoader.getDimensions().width);
      let tilesRendered = 0;
      for (let i = startI; i < endI; i++) {
        for (let j = startJ; j < endJ; j++) {
          let textureId = this.terrainLoader.getTextureId(j, i);
          if (isSpecialTile(textureId)) {
            textureId = textureId & FLAT_MASK2;
          }
          const screenPos = this.coordMapper.mapToScreen(
            i,
            j,
            this.zoomLevel,
            this.rotation,
            this.origin
          );
          if (screenPos.x < -tileWidth || screenPos.x > this.canvas.width + tileWidth || screenPos.y < -tileHeight || screenPos.y > this.canvas.height + tileHeight) {
            continue;
          }
          this.drawIsometricTile(Math.round(screenPos.x), Math.round(screenPos.y), config2, textureId);
          tilesRendered++;
        }
      }
      return tilesRendered;
    }
    /**
     * Draw the terrain preview image as a backdrop.
     * The preview is a single image of the entire map at Z0 scale, positioned
     * using the same isometric projection as chunks. At Z1 we scale it 2×.
     */
    drawTerrainPreview(ctx) {
      if (!this.terrainPreview) return;
      const scale = this.zoomLevel === 0 ? 1 : 2;
      const drawX = this.previewOriginX * scale - this.origin.x;
      const drawY = this.previewOriginY * scale - this.origin.y;
      const drawW = this.terrainPreview.width * scale;
      const drawH = this.terrainPreview.height * scale;
      ctx.drawImage(this.terrainPreview, drawX, drawY, drawW, drawH);
    }
    /**
     * Tile-by-tile terrain rendering (slow path, fallback for non-NORTH rotations)
     * Flat only — all special tiles are flattened
     */
    renderTerrainLayerTiles(bounds) {
      const config2 = ZOOM_LEVELS[this.zoomLevel];
      const tileWidth = config2.tileWidth;
      const tileHeight = config2.tileHeight;
      let tilesRendered = 0;
      for (let i = bounds.minI; i <= bounds.maxI; i++) {
        for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
          let textureId = this.terrainLoader.getTextureId(j, i);
          if (isSpecialTile(textureId)) {
            textureId = textureId & FLAT_MASK2;
          }
          const screenPos = this.coordMapper.mapToScreen(
            i,
            j,
            this.zoomLevel,
            this.rotation,
            this.origin
          );
          if (screenPos.x < -tileWidth || screenPos.x > this.canvas.width + tileWidth || screenPos.y < -tileHeight || screenPos.y > this.canvas.height + tileHeight) {
            continue;
          }
          this.drawIsometricTile(Math.round(screenPos.x), Math.round(screenPos.y), config2, textureId);
          tilesRendered++;
        }
      }
      return tilesRendered;
    }
    /**
     * Draw a single isometric diamond tile (flat terrain only)
     *
     * When textures are available: Draw the texture
     * When textures are NOT available: Draw a diamond-shaped fallback color
     */
    drawIsometricTile(screenX, screenY, config2, textureId) {
      const ctx = this.ctx;
      const halfWidth = config2.tileWidth / 2;
      const halfHeight = config2.tileHeight / 2;
      let texture = null;
      if (this.useTextures) {
        texture = this.textureCache.getTextureSync(textureId);
      }
      if (texture) {
        ctx.drawImage(
          texture,
          screenX - halfWidth,
          screenY,
          config2.tileWidth,
          config2.tileHeight
        );
      } else {
        const color = this.textureCache.getFallbackColor(textureId);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX + halfWidth, screenY + halfHeight);
        ctx.lineTo(screenX, screenY + config2.tileHeight);
        ctx.lineTo(screenX - halfWidth, screenY + halfHeight);
        ctx.closePath();
        ctx.fill();
      }
    }
    /**
     * Render debug information overlay
     */
    renderDebugInfo(bounds, tilesRendered) {
      const ctx = this.ctx;
      const config2 = ZOOM_LEVELS[this.zoomLevel];
      const cacheStats = this.textureCache.getStats();
      const chunkStats = this.chunkCache?.getStats();
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(10, 10, 420, 210);
      ctx.fillStyle = "#fff";
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      const availableSeasonStr = this.availableSeasons.length === 1 ? `(only ${SEASON_NAMES[this.availableSeasons[0]]})` : `(${this.availableSeasons.length} available)`;
      const lines = [
        `Map: ${this.mapName} (${this.terrainLoader.getDimensions().width}\xD7${this.terrainLoader.getDimensions().height})`,
        `Terrain: ${this.textureCache.getTerrainType()} | Season: ${SEASON_NAMES[this.season]} ${availableSeasonStr}`,
        `Camera: (${Math.round(this.cameraI)}, ${Math.round(this.cameraJ)})`,
        `Zoom Level: ${this.zoomLevel} (${config2.tileWidth}\xD7${config2.tileHeight}px)`,
        `Visible: i[${bounds.minI}..${bounds.maxI}] j[${bounds.minJ}..${bounds.maxJ}]`,
        `Tiles Rendered: ${tilesRendered}`,
        `Textures: ${this.useTextures ? "ON" : "OFF"} | Cache: ${cacheStats.size}/${cacheStats.maxSize} (${(cacheStats.hitRate * 100).toFixed(1)}% hit)`,
        `Chunks: ${this.useChunks ? "ON" : "OFF"} | Cached: ${chunkStats?.cacheSizes[this.zoomLevel] || 0} (${((chunkStats?.hitRate || 0) * 100).toFixed(1)}% hit)`,
        `Render Time: ${this.lastRenderStats.renderTimeMs.toFixed(2)}ms`,
        `Controls: Drag=Pan, Wheel=Zoom, T=Textures, C=Chunks, S=Season`
      ];
      lines.forEach((line, index) => {
        ctx.fillText(line, 20, 30 + index * 18);
      });
    }
    /**
     * Setup mouse controls for pan and zoom
     */
    setupMouseControls() {
      this.canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const oldZoom = this.zoomLevel;
        if (e.deltaY > 0) {
          this.zoomLevel = Math.max(0, this.zoomLevel - 1);
        } else {
          this.zoomLevel = Math.min(3, this.zoomLevel + 1);
        }
        if (oldZoom !== this.zoomLevel) {
          this.render();
        }
      });
      this.canvas.addEventListener("mousedown", (e) => {
        if (e.button === 0 || e.button === 2) {
          this.isDragging = true;
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
          this.canvas.style.cursor = "grabbing";
        }
      });
      this.canvas.addEventListener("mousemove", (e) => {
        if (!this.isDragging) return;
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        const config2 = ZOOM_LEVELS[this.zoomLevel];
        const u = config2.u;
        const mapDeltaI = (dy / u + dx / (2 * u)) * 0.5;
        const mapDeltaJ = (dy / u - dx / (2 * u)) * 0.5;
        this.cameraI += mapDeltaI;
        this.cameraJ -= mapDeltaJ;
        const dims = this.terrainLoader.getDimensions();
        this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
        this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.render();
      });
      const stopDrag = () => {
        if (this.isDragging) {
          this.isDragging = false;
          this.canvas.style.cursor = "grab";
        }
      };
      this.canvas.addEventListener("mouseup", stopDrag);
      this.canvas.addEventListener("mouseleave", stopDrag);
      this.canvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
      });
      this.canvas.style.cursor = "grab";
      window.addEventListener("keydown", (e) => {
        if (e.key === "t" || e.key === "T") {
          this.toggleTextures();
        }
        if (e.key === "c" || e.key === "C") {
          this.toggleChunks();
        }
        if (e.key === "s" || e.key === "S") {
          this.cycleSeason();
        }
      });
    }
    /**
     * Setup window resize handler
     */
    setupResizeHandler() {
      const resizeObserver = new ResizeObserver(() => {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.render();
      });
      resizeObserver.observe(this.canvas);
    }
    // =========================================================================
    // PUBLIC API
    // =========================================================================
    /**
     * Set zoom level (0-3)
     */
    setZoomLevel(level) {
      this.zoomLevel = Math.max(0, Math.min(3, level));
      this.render();
    }
    /**
     * Get current zoom level
     */
    getZoomLevel() {
      return this.zoomLevel;
    }
    /**
     * Enable/disable debug info rendering
     * Used when a parent renderer handles its own debug overlay
     */
    setShowDebugInfo(show) {
      this.showDebugInfo = show;
    }
    /**
     * Set rotation (90° snap: N/E/S/W)
     * Clears chunk cache since chunks are rendered without rotation
     */
    setRotation(rotation) {
      if (this.rotation !== rotation) {
        this.rotation = rotation;
        this.chunkCache?.clearAll();
        this.render();
      }
    }
    /**
     * Get current rotation
     */
    getRotation() {
      return this.rotation;
    }
    /**
     * Pan camera by delta in map coordinates
     */
    pan(deltaI, deltaJ) {
      this.cameraI += deltaI;
      this.cameraJ += deltaJ;
      const dims = this.terrainLoader.getDimensions();
      this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
      this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));
      this.render();
    }
    /**
     * Center camera on specific map coordinates
     */
    centerOn(i, j) {
      this.cameraI = i;
      this.cameraJ = j;
      const dims = this.terrainLoader.getDimensions();
      this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
      this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));
      this.render();
    }
    /**
     * Get camera position
     */
    getCameraPosition() {
      return { i: this.cameraI, j: this.cameraJ };
    }
    /**
     * Get the current screen origin (for coordinate mapping)
     * Origin is computed so that camera position appears at canvas center
     */
    getOrigin() {
      return this.origin;
    }
    /**
     * Convert screen coordinates to map coordinates
     */
    screenToMap(screenX, screenY) {
      return this.coordMapper.screenToMap(
        screenX,
        screenY,
        this.zoomLevel,
        this.rotation,
        this.origin
      );
    }
    /**
     * Convert map coordinates to screen coordinates
     */
    mapToScreen(i, j) {
      return this.coordMapper.mapToScreen(
        i,
        j,
        this.zoomLevel,
        this.rotation,
        this.origin
      );
    }
    /**
     * Get terrain loader (for accessing terrain data)
     */
    getTerrainLoader() {
      return this.terrainLoader;
    }
    /**
     * Get coordinate mapper
     */
    getCoordinateMapper() {
      return this.coordMapper;
    }
    /**
     * Get texture cache for advanced operations
     */
    getTextureCache() {
      return this.textureCache;
    }
    /**
     * Get atlas cache for vegetation overlay rendering
     */
    getAtlasCache() {
      return this.atlasCache;
    }
    /**
     * Get chunk cache for direct chunk rendering (used by ground layer cache)
     */
    getChunkCache() {
      return this.chunkCache;
    }
    /**
     * Invalidate specific chunks (e.g., after dynamic content changes)
     */
    invalidateChunks(chunkI, chunkJ) {
      this.chunkCache?.invalidateChunk(chunkI, chunkJ);
    }
    /**
     * Check if map is loaded
     */
    isLoaded() {
      return this.loaded;
    }
    /**
     * Get map name
     */
    getMapName() {
      return this.mapName;
    }
    /**
     * Get last render statistics
     */
    getRenderStats() {
      return { ...this.lastRenderStats };
    }
    /**
     * Set external render callback.
     * When set, chunk-ready events call this instead of triggering a terrain-only render.
     * This prevents blinking: the parent renderer can do a full-pipeline render
     * (terrain + buildings + roads) instead of a terrain-only render.
     */
    setOnRenderNeeded(callback) {
      this.onRenderNeeded = callback;
    }
    /**
     * Clear chunk caches for zoom levels far from the current one.
     * Keeps current and ±1 adjacent zoom levels to allow smooth transitions.
     */
    clearDistantZoomCaches(currentZoom) {
      if (!this.chunkCache) return;
      for (let z = 0; z <= 3; z++) {
        if (Math.abs(z - currentZoom) > 1) {
          this.chunkCache.clearZoomLevel(z);
        }
      }
    }
    /**
     * Destroy renderer and release all resources.
     * Cancels pending RAF, clears all caches.
     */
    destroy() {
      if (this.pendingRenderRequest !== null) {
        cancelAnimationFrame(this.pendingRenderRequest);
        this.pendingRenderRequest = null;
      }
      this.onRenderNeeded = null;
      this.terrainLoader.unload();
      this.textureCache.clear();
      this.atlasCache.clear();
      this.chunkCache?.clearAll();
      this.chunkCache = null;
      this.loaded = false;
    }
    /**
     * Unload and cleanup
     */
    unload() {
      this.terrainLoader.unload();
      this.textureCache.clear();
      this.atlasCache.clear();
      this.chunkCache?.clearAll();
      this.chunkCache = null;
      this.loaded = false;
      this.mapName = "";
      this.render();
    }
    // =========================================================================
    // TEXTURE API
    // =========================================================================
    /**
     * Toggle texture rendering on/off
     */
    toggleTextures() {
      this.useTextures = !this.useTextures;
      console.log(`[IsometricRenderer] Textures: ${this.useTextures ? "ON" : "OFF"}`);
      this.render();
    }
    /**
     * Toggle chunk-based rendering on/off
     * When OFF, uses tile-by-tile rendering (slower but useful for debugging)
     */
    toggleChunks() {
      this.useChunks = !this.useChunks;
      console.log(`[IsometricRenderer] Chunks: ${this.useChunks ? "ON" : "OFF"}`);
      this.render();
    }
    /**
     * Set texture rendering mode
     */
    setTextureMode(enabled) {
      this.useTextures = enabled;
      this.render();
    }
    /**
     * Check if texture rendering is enabled
     */
    isTextureMode() {
      return this.useTextures;
    }
    /**
     * Preload textures for visible area
     */
    async preloadTextures() {
      if (!this.loaded) return;
      const viewport = {
        x: 0,
        y: 0,
        width: this.canvas.width,
        height: this.canvas.height
      };
      const bounds = this.coordMapper.getVisibleBounds(
        viewport,
        this.zoomLevel,
        this.rotation,
        this.origin
      );
      const textureIds = /* @__PURE__ */ new Set();
      for (let i = bounds.minI; i <= bounds.maxI; i++) {
        for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
          textureIds.add(this.terrainLoader.getTextureId(j, i));
        }
      }
      await this.textureCache.preload(Array.from(textureIds));
      this.render();
    }
    // =========================================================================
    // SEASON API
    // =========================================================================
    /**
     * Set the season for terrain textures
     * @param season - Season (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
     */
    setSeason(season) {
      if (this.season !== season) {
        this.season = season;
        this.textureCache.setSeason(season);
        this.atlasCache.setSeason(season);
        this.chunkCache?.clearAll();
        if (this.mapName) {
          const terrainType = getTerrainTypeForMap(this.mapName);
          this.chunkCache?.setMapInfo(this.mapName, terrainType, season);
        }
        console.log(`[IsometricRenderer] Season changed to ${SEASON_NAMES[season]}`);
        this.atlasCache.loadAtlas().then(() => {
          if (this.atlasCache.isReady()) {
            this.chunkCache?.clearAll();
            this.requestRender();
          }
        });
        this.render();
      }
    }
    /**
     * Get current season
     */
    getSeason() {
      return this.season;
    }
    /**
     * Get current season name
     */
    getSeasonName() {
      return SEASON_NAMES[this.season];
    }
    /**
     * Cycle to next season (for keyboard shortcut)
     * Only cycles through available seasons for this terrain type
     */
    cycleSeason() {
      if (this.availableSeasons.length <= 1) {
        console.log(`[IsometricRenderer] Only one season available, cannot cycle`);
        return;
      }
      const currentIndex = this.availableSeasons.indexOf(this.season);
      const nextIndex = (currentIndex + 1) % this.availableSeasons.length;
      const nextSeason = this.availableSeasons[nextIndex];
      this.setSeason(nextSeason);
    }
    /**
     * Get available seasons for current terrain type
     */
    getAvailableSeasons() {
      return [...this.availableSeasons];
    }
  };

  // src/shared/config.ts
  var getEnv = (key) => {
    return typeof process !== "undefined" && process.env ? process.env[key] : void 0;
  };
  var config = {
    /**
     * Configuration du serveur WebSocket
     */
    server: {
      port: Number(getEnv("PORT")) || 8080
    },
    /**
     * Configuration du protocole RDO
     */
    rdo: {
      // Host du serveur Directory (utiliser 'localhost' pour mock_srv et www.starpeaceonline.com pour la production.)
      directoryHost: getEnv("RDO_DIR_HOST") || "www.starpeaceonline.com",
      // Ports standards du protocole
      ports: {
        directory: 1111
      }
    },
    /**
     * Logging
     */
    logging: {
      // Niveaux: 'debug' | 'info' | 'warn' | 'error'
      level: getEnv("LOG_LEVEL") || "info",
      colorize: getEnv("NODE_ENV") !== "production"
    }
  };

  // src/shared/logger.ts
  var LOG_LEVEL_NAMES = {
    [0 /* DEBUG */]: "DEBUG",
    [1 /* INFO */]: "INFO",
    [2 /* WARN */]: "WARN",
    [3 /* ERROR */]: "ERROR"
  };
  var LOG_LEVEL_COLORS = {
    [0 /* DEBUG */]: "\x1B[36m",
    // Cyan
    [1 /* INFO */]: "\x1B[32m",
    // Green
    [2 /* WARN */]: "\x1B[33m",
    // Yellow
    [3 /* ERROR */]: "\x1B[31m"
    // Red
  };
  var RESET_COLOR = "\x1B[0m";
  function parseLogLevel(level) {
    switch (level.toLowerCase()) {
      case "debug":
        return 0 /* DEBUG */;
      case "info":
        return 1 /* INFO */;
      case "warn":
        return 2 /* WARN */;
      case "error":
        return 3 /* ERROR */;
      default:
        return 1 /* INFO */;
    }
  }
  var currentLogLevel = parseLogLevel(config.logging.level);
  var Logger = class {
    constructor(context) {
      this.context = context;
    }
    debug(message, meta) {
      this.log(0 /* DEBUG */, message, meta);
    }
    info(message, meta) {
      this.log(1 /* INFO */, message, meta);
    }
    warn(message, meta) {
      this.log(2 /* WARN */, message, meta);
    }
    error(message, meta) {
      this.log(3 /* ERROR */, message, meta);
    }
    log(level, message, meta) {
      if (level < currentLogLevel) {
        return;
      }
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      const levelName = LOG_LEVEL_NAMES[level];
      const contextStr = this.context ? `[${this.context}]` : "";
      let logMessage;
      if (config.logging.colorize) {
        const color = LOG_LEVEL_COLORS[level];
        logMessage = `${color}${timestamp} ${levelName.padEnd(5)}${RESET_COLOR} ${contextStr} ${message}`;
      } else {
        logMessage = `${timestamp} ${levelName.padEnd(5)} ${contextStr} ${message}`;
      }
      if (meta !== void 0) {
        logMessage += ` ${JSON.stringify(meta)}`;
      }
      switch (level) {
        case 0 /* DEBUG */:
        case 1 /* INFO */:
          console.log(logMessage);
          break;
        case 2 /* WARN */:
          console.warn(logMessage);
          break;
        case 3 /* ERROR */:
          console.error(logMessage);
          break;
      }
    }
  };
  function createLogger(context) {
    return new Logger(context);
  }

  // src/client/facility-dimensions-cache.ts
  var logger = createLogger("FacilityDimensionsCache[Client]");
  var MAX_FALLBACK_SEARCH = 7;
  var ClientFacilityDimensionsCache = class {
    constructor() {
      this.cache = /* @__PURE__ */ new Map();
      this.initialized = false;
      /** Fallback resolution cache: maps unresolved IDs to resolved IDs (or '' for no match) */
      this.fallbackCache = /* @__PURE__ */ new Map();
    }
    /**
     * Initialize cache with all facility dimensions
     */
    initialize(dimensions) {
      if (this.initialized) {
        logger.warn("[ClientFacilityDimensionsCache] Already initialized, skipping");
        return;
      }
      for (const [visualClass, facility] of Object.entries(dimensions)) {
        this.cache.set(visualClass, facility);
      }
      this.initialized = true;
      logger.info(`[ClientFacilityDimensionsCache] Initialized with ${this.cache.size} facilities`);
    }
    /**
     * Get facility dimensions by visualClass.
     *
     * Uses the VisualClass matching algorithm (spec Section 7.7):
     * 1. Direct lookup by exact ID
     * 2. Fallback: walk backwards up to MAX_FALLBACK_SEARCH=7 steps
     *    to find the nearest base entry
     *
     * Results are cached so subsequent lookups for the same ID skip the walk.
     */
    getFacility(visualClass) {
      if (!this.initialized) {
        logger.warn("[ClientFacilityDimensionsCache] Cache not initialized, returning undefined");
        return void 0;
      }
      const direct = this.cache.get(visualClass);
      if (direct) {
        return direct;
      }
      const cached = this.fallbackCache.get(visualClass);
      if (cached !== void 0) {
        return cached === "" ? void 0 : this.cache.get(cached);
      }
      const id = parseInt(visualClass, 10);
      if (isNaN(id)) {
        return void 0;
      }
      for (let offset = 1; offset <= MAX_FALLBACK_SEARCH; offset++) {
        const candidateId = id - offset;
        if (candidateId < 0) break;
        const candidateKey = String(candidateId);
        const candidate = this.cache.get(candidateKey);
        if (candidate && candidate.textureFilename) {
          this.fallbackCache.set(visualClass, candidateKey);
          return candidate;
        }
      }
      this.fallbackCache.set(visualClass, "");
      return void 0;
    }
    /**
     * Check if cache is initialized
     */
    isInitialized() {
      return this.initialized;
    }
    /**
     * Get cache size
     */
    getSize() {
      return this.cache.size;
    }
    /**
     * Clear cache (for testing)
     */
    clear() {
      this.cache.clear();
      this.fallbackCache.clear();
      this.initialized = false;
      logger.info("[ClientFacilityDimensionsCache] Cache cleared");
    }
  };
  var cacheInstance = null;
  function getFacilityDimensionsCache() {
    if (!cacheInstance) {
      cacheInstance = new ClientFacilityDimensionsCache();
    }
    return cacheInstance;
  }

  // src/client/renderer/game-object-texture-cache.ts
  var GameObjectTextureCache = class _GameObjectTextureCache {
    constructor(maxSize = 2048) {
      this.cache = /* @__PURE__ */ new Map();
      this.accessCounter = 0;
      // Statistics
      this.hits = 0;
      this.misses = 0;
      this.evictions = 0;
      // Object atlases (road, concrete)
      this.atlases = /* @__PURE__ */ new Map();
      this.atlasLoading = /* @__PURE__ */ new Map();
      this.maxSize = maxSize;
    }
    static {
      // Deduplicate warnings for unknown visualClasses (log once per class)
      this._warnedVisualClasses = /* @__PURE__ */ new Set();
    }
    /**
     * Set callback to be notified when textures are loaded
     */
    setOnTextureLoaded(callback) {
      this.onTextureLoadedCallback = callback;
    }
    /**
     * Generate cache key for a texture
     */
    getCacheKey(category, name) {
      return `${category}/${name}`;
    }
    /**
     * Get texture synchronously (returns null if not cached, triggers async load)
     */
    getTextureSync(category, name) {
      const key = this.getCacheKey(category, name);
      const entry = this.cache.get(key);
      if (entry && entry.texture) {
        entry.lastAccess = ++this.accessCounter;
        this.hits++;
        return entry.texture;
      }
      if (entry && entry.loaded) {
        this.misses++;
        return null;
      }
      if (!entry || !entry.loading) {
        this.loadTexture(category, name);
      }
      this.misses++;
      return null;
    }
    /**
     * Get texture asynchronously (waits for load)
     */
    async getTextureAsync(category, name) {
      const key = this.getCacheKey(category, name);
      const entry = this.cache.get(key);
      if (entry) {
        entry.lastAccess = ++this.accessCounter;
        if (entry.texture) {
          this.hits++;
          return entry.texture;
        }
        if (entry.loaded) {
          this.misses++;
          return null;
        }
        if (entry.loadPromise) {
          return entry.loadPromise;
        }
      }
      this.misses++;
      return this.loadTexture(category, name);
    }
    /**
     * Load a texture from the server
     */
    async loadTexture(category, name) {
      const key = this.getCacheKey(category, name);
      const existing = this.cache.get(key);
      if (existing?.loadPromise) {
        return existing.loadPromise;
      }
      const loadPromise = this.fetchTexture(category, name);
      this.cache.set(key, {
        texture: null,
        lastAccess: ++this.accessCounter,
        loading: true,
        loaded: false,
        loadPromise
      });
      try {
        const texture = await loadPromise;
        const entry = this.cache.get(key);
        if (entry) {
          entry.texture = texture;
          entry.loading = false;
          entry.loaded = true;
          entry.loadPromise = void 0;
        }
        this.evictIfNeeded();
        if (texture && this.onTextureLoadedCallback) {
          this.onTextureLoadedCallback(category, name);
        }
        return texture;
      } catch (error) {
        this.cache.delete(key);
        return null;
      }
    }
    /**
     * Fetch texture from server and convert to ImageBitmap.
     *
     * Textures are served as pre-baked PNGs with alpha channel already applied
     * (for BMP textures like roads/concrete). GIF textures (buildings) are served
     * as-is since the browser handles GIF transparency natively.
     * No client-side color keying is needed.
     */
    async fetchTexture(category, name) {
      const url = `/cache/${category}/${encodeURIComponent(name)}`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          return null;
        }
        const blob = await response.blob();
        return createImageBitmap(blob);
      } catch (error) {
        console.warn(`[GameObjectTextureCache] Failed to load ${category}/${name}:`, error);
        return null;
      }
    }
    /**
     * Evict least recently used entries if cache is over capacity
     */
    evictIfNeeded() {
      while (this.cache.size > this.maxSize) {
        let oldestKey = null;
        let oldestAccess = Infinity;
        for (const [key, entry] of this.cache) {
          if (!entry.loading && entry.lastAccess < oldestAccess) {
            oldestAccess = entry.lastAccess;
            oldestKey = key;
          }
        }
        if (oldestKey) {
          const entry = this.cache.get(oldestKey);
          if (entry?.texture) {
            entry.texture.close();
          }
          this.cache.delete(oldestKey);
          this.evictions++;
        } else {
          break;
        }
      }
    }
    /**
     * Preload textures for a list of names
     */
    async preload(category, names) {
      const loadPromises = names.map(
        (name) => this.getTextureAsync(category, name)
      );
      await Promise.all(loadPromises);
    }
    /**
     * Load an object atlas (road or concrete) from the server.
     * Atlas replaces individual texture fetches with a single image + manifest.
     * @param category - 'road' or 'concrete'
     */
    async loadObjectAtlas(category) {
      if (this.atlases.has(category) || this.atlasLoading.has(category)) {
        return this.atlasLoading.get(category) || Promise.resolve();
      }
      const promise = this._doLoadObjectAtlas(category);
      this.atlasLoading.set(category, promise);
      try {
        await promise;
      } finally {
        this.atlasLoading.delete(category);
      }
    }
    async _doLoadObjectAtlas(category) {
      const atlasUrl = `/api/object-atlas/${encodeURIComponent(category)}`;
      const manifestUrl = `/api/object-atlas/${encodeURIComponent(category)}/manifest`;
      try {
        const [atlasResponse, manifestResponse] = await Promise.all([
          fetch(atlasUrl),
          fetch(manifestUrl)
        ]);
        if (!atlasResponse.ok || !manifestResponse.ok) {
          return;
        }
        const [atlasBlob, manifest] = await Promise.all([
          atlasResponse.blob(),
          manifestResponse.json()
        ]);
        const image = await createImageBitmap(atlasBlob);
        this.atlases.set(category, { image, manifest });
        console.log(`[GameObjectTextureCache] Loaded ${category} atlas (${Object.keys(manifest.tiles).length} textures)`);
      } catch (error) {
        console.warn(`[GameObjectTextureCache] Failed to load ${category} atlas:`, error);
      }
    }
    /**
     * Get atlas source rectangle for a texture.
     * Returns null if no atlas is loaded for this category or the texture isn't in the atlas.
     */
    getAtlasRect(category, name) {
      let atlasKey;
      if (category === "RoadBlockImages") {
        atlasKey = "road";
      } else if (category === "ConcreteImages") {
        atlasKey = "concrete";
      } else if (category === "CarImages") {
        atlasKey = "car";
      } else {
        return null;
      }
      const entry = this.atlases.get(atlasKey);
      if (!entry) return null;
      const lookupName = name.replace(/\.bmp$/i, "");
      let tile = entry.manifest.tiles[name] ?? entry.manifest.tiles[lookupName];
      if (!tile) {
        const lowerName = lookupName.toLowerCase();
        for (const key of Object.keys(entry.manifest.tiles)) {
          if (key.toLowerCase() === lowerName) {
            tile = entry.manifest.tiles[key];
            break;
          }
        }
      }
      if (!tile) return null;
      return {
        atlas: entry.image,
        sx: tile.x,
        sy: tile.y,
        sw: tile.width,
        sh: tile.height
      };
    }
    /**
     * Check if an object atlas is loaded for a category
     */
    hasAtlas(category) {
      return this.atlases.has(category);
    }
    /**
     * Clear the entire cache
     */
    clear() {
      for (const entry of this.cache.values()) {
        if (entry.texture) {
          entry.texture.close();
        }
      }
      for (const atlas of this.atlases.values()) {
        atlas.image.close();
      }
      this.atlases.clear();
      this.atlasLoading.clear();
      this.cache.clear();
      this.hits = 0;
      this.misses = 0;
      this.evictions = 0;
      this.accessCounter = 0;
    }
    /**
     * Get cache statistics
     */
    getStats() {
      const total = this.hits + this.misses;
      return {
        size: this.cache.size,
        maxSize: this.maxSize,
        hits: this.hits,
        misses: this.misses,
        evictions: this.evictions,
        hitRate: total > 0 ? this.hits / total : 0
      };
    }
    /**
     * Get road texture type based on segment neighbors
     * Analyzes adjacent road tiles to determine the correct texture variant
     */
    static getRoadTextureType(hasNorth, hasEast, hasSouth, hasWest) {
      const count = [hasNorth, hasEast, hasSouth, hasWest].filter(Boolean).length;
      if (count === 4) {
        return "Roadcross";
      }
      if (count === 3) {
        if (!hasNorth) return "RoadTS";
        if (!hasEast) return "RoadTW";
        if (!hasSouth) return "RoadTN";
        if (!hasWest) return "RoadTE";
      }
      if (count === 2) {
        if (hasNorth && hasSouth) return "Roadvert";
        if (hasEast && hasWest) return "Roadhorz";
        if (hasNorth && hasEast) return "RoadcornerW";
        if (hasEast && hasSouth) return "RoadcornerN";
        if (hasSouth && hasWest) return "RoadcornerE";
        if (hasWest && hasNorth) return "RoadcornerS";
      }
      if (hasNorth || hasSouth) return "Roadvert";
      return "Roadhorz";
    }
    /**
     * Get the BMP filename for a road texture type
     */
    static getRoadTextureFilename(type) {
      return `${type}.bmp`;
    }
    /**
     * Get building texture filename from visualClass
     * Looks up the correct texture filename from the facility dimensions cache.
     * Falls back to a generated pattern if the building is not found in cache.
     *
     * @param visualClass - The runtime VisualClass from ObjectsInArea
     * @returns The correct texture filename (e.g., "MapPGIFoodStore64x32x0.gif")
     */
    static getBuildingTextureFilename(visualClass) {
      const cache = getFacilityDimensionsCache();
      const facility = cache.getFacility(visualClass);
      if (facility?.textureFilename) {
        return facility.textureFilename;
      }
      if (!_GameObjectTextureCache._warnedVisualClasses.has(visualClass)) {
        _GameObjectTextureCache._warnedVisualClasses.add(visualClass);
        console.warn(`[GameObjectTextureCache] Unknown visualClass ${visualClass}, using fallback pattern`);
      }
      return `Map${visualClass}64x32x0.gif`;
    }
    /**
     * Get construction texture filename based on building size
     * Construction textures are shared across all buildings based on their footprint size.
     *
     * @param visualClass - The runtime VisualClass from ObjectsInArea
     * @returns Construction texture filename (e.g., "Construction64.gif")
     */
    static getConstructionTextureFilename(visualClass) {
      const cache = getFacilityDimensionsCache();
      const facility = cache.getFacility(visualClass);
      if (facility?.constructionTextureFilename) {
        return facility.constructionTextureFilename;
      }
      return "Construction64.gif";
    }
    /**
     * Get empty residential texture filename
     * Used for residential buildings that have no occupants.
     *
     * @param visualClass - The runtime VisualClass from ObjectsInArea
     * @returns Empty texture filename or undefined if not a residential building
     */
    static getEmptyTextureFilename(visualClass) {
      const cache = getFacilityDimensionsCache();
      const facility = cache.getFacility(visualClass);
      return facility?.emptyTextureFilename;
    }
  };

  // src/client/renderer/vegetation-flat-mapper.ts
  var FLAT_MASK3 = 192;
  var VegetationFlatMapper = class {
    constructor(bufferRadius = 2) {
      /** Set of "i,j" tile keys that should use flat textures */
      this.flatZones = /* @__PURE__ */ new Set();
      /** Track which chunks are dirty after an update */
      this.dirtyChunks = /* @__PURE__ */ new Set();
      /** Previous flat zones for dirty chunk detection */
      this.previousFlatZones = /* @__PURE__ */ new Set();
      this.bufferRadius = bufferRadius;
    }
    /**
     * Update the flat zones based on current dynamic content.
     * Call this whenever buildings or road segments change.
     */
    updateDynamicContent(buildings, segments, facilityCache) {
      this.previousFlatZones = this.flatZones;
      this.flatZones = /* @__PURE__ */ new Set();
      this.dirtyChunks.clear();
      const R = this.bufferRadius;
      for (const building of buildings) {
        const dims = facilityCache.get(building.visualClass);
        const xsize = dims?.xsize || 1;
        const ysize = dims?.ysize || 1;
        for (let dy = -R; dy < ysize + R; dy++) {
          for (let dx = -R; dx < xsize + R; dx++) {
            const ti = building.y + dy;
            const tj = building.x + dx;
            if (ti >= 0 && tj >= 0) {
              this.flatZones.add(`${ti},${tj}`);
            }
          }
        }
      }
      for (const seg of segments) {
        const minX = Math.min(seg.x1, seg.x2);
        const maxX = Math.max(seg.x1, seg.x2);
        const minY = Math.min(seg.y1, seg.y2);
        const maxY = Math.max(seg.y1, seg.y2);
        for (let y = minY - R; y <= maxY + R; y++) {
          for (let x = minX - R; x <= maxX + R; x++) {
            if (y >= 0 && x >= 0) {
              this.flatZones.add(`${y},${x}`);
            }
          }
        }
      }
      this.computeDirtyChunks();
    }
    /**
     * Check if a tile should be flattened (vegetation replaced by center texture).
     * Only flattens tiles that are actually "special" (vegetation/decorations).
     *
     * @param i - Row coordinate
     * @param j - Column coordinate
     * @param landId - The raw landId from the terrain BMP
     * @returns true if this tile should use a flat texture
     */
    shouldFlatten(i, j, landId) {
      if (!isSpecialTile(landId)) return false;
      return this.flatZones.has(`${i},${j}`);
    }
    /**
     * Get the flat equivalent of a landId.
     * Keeps LandClass (bits 7-6), zeros LandType and LandVar.
     *
     * Examples:
     *   GrassSpecial (52 = 0x34) → GrassCenter (0 = 0x00)
     *   DryGroundSpecial (180 = 0xB4) → DryGroundCenter (128 = 0x80)
     */
    getFlatLandId(landId) {
      return landId & FLAT_MASK3;
    }
    /**
     * Get the set of chunk keys that need re-rendering.
     * A chunk is dirty if any of its tiles changed flatten state.
     *
     * @param chunkSize - Tiles per chunk dimension (default CHUNK_SIZE)
     * @returns Set of "chunkI,chunkJ" keys
     */
    getDirtyChunks(chunkSize = CHUNK_SIZE) {
      return this.dirtyChunks;
    }
    /**
     * Check if there are any flat zones defined
     */
    hasFlatZones() {
      return this.flatZones.size > 0;
    }
    /**
     * Get the number of tiles in the flat zone
     */
    getFlatZoneSize() {
      return this.flatZones.size;
    }
    /**
     * Get the buffer radius
     */
    getBufferRadius() {
      return this.bufferRadius;
    }
    /**
     * Set the buffer radius and mark everything dirty
     */
    setBufferRadius(radius) {
      this.bufferRadius = radius;
    }
    /**
     * Clear all flat zones
     */
    clear() {
      this.previousFlatZones = this.flatZones;
      this.flatZones = /* @__PURE__ */ new Set();
      this.dirtyChunks.clear();
    }
    /**
     * Compute which chunks changed between previous and current flat zones
     */
    computeDirtyChunks() {
      const changedTiles = /* @__PURE__ */ new Set();
      for (const key of this.flatZones) {
        if (!this.previousFlatZones.has(key)) {
          changedTiles.add(key);
        }
      }
      for (const key of this.previousFlatZones) {
        if (!this.flatZones.has(key)) {
          changedTiles.add(key);
        }
      }
      for (const key of changedTiles) {
        const [i, j] = key.split(",").map(Number);
        const chunkI = Math.floor(i / CHUNK_SIZE);
        const chunkJ = Math.floor(j / CHUNK_SIZE);
        this.dirtyChunks.add(`${chunkI},${chunkJ}`);
      }
    }
  };

  // src/client/renderer/touch-handler-2d.ts
  var ROTATION_THRESHOLD = Math.PI / 4;
  var DOUBLE_TAP_DELAY = 300;
  var DOUBLE_TAP_DISTANCE = 30;
  var TouchHandler2D = class {
    constructor(canvas, callbacks) {
      // Touch state
      this.activeTouches = /* @__PURE__ */ new Map();
      // Pan state (1-finger)
      this.isPanning = false;
      // Pinch/rotate state (2-finger)
      this.initialPinchDistance = 0;
      this.initialPinchAngle = 0;
      this.accumulatedAngle = 0;
      // Double-tap detection
      this.lastTapTime = 0;
      this.lastTapX = 0;
      this.lastTapY = 0;
      this.canvas = canvas;
      this.callbacks = callbacks;
      this.boundHandlers = {
        touchstart: (e) => this.onTouchStart(e),
        touchmove: (e) => this.onTouchMove(e),
        touchend: (e) => this.onTouchEnd(e),
        touchcancel: (e) => this.onTouchEnd(e)
      };
      canvas.addEventListener("touchstart", this.boundHandlers.touchstart, { passive: false });
      canvas.addEventListener("touchmove", this.boundHandlers.touchmove, { passive: false });
      canvas.addEventListener("touchend", this.boundHandlers.touchend, { passive: false });
      canvas.addEventListener("touchcancel", this.boundHandlers.touchcancel, { passive: false });
    }
    onTouchStart(e) {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        this.activeTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
      }
      if (this.activeTouches.size === 1) {
        this.isPanning = true;
      } else if (this.activeTouches.size === 2) {
        this.isPanning = false;
        this.initPinchRotate();
      }
    }
    onTouchMove(e) {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const prev = this.activeTouches.get(touch.identifier);
        if (!prev) continue;
        if (this.activeTouches.size === 1 && this.isPanning) {
          const dx = touch.clientX - prev.x;
          const dy = touch.clientY - prev.y;
          this.callbacks.onPan(dx, dy);
        }
        this.activeTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
      }
      if (this.activeTouches.size === 2) {
        this.handlePinchRotate();
      }
    }
    onTouchEnd(e) {
      e.preventDefault();
      if (e.changedTouches.length === 1 && this.activeTouches.size === 1) {
        const touch = e.changedTouches[0];
        const now = Date.now();
        const dx = touch.clientX - this.lastTapX;
        const dy = touch.clientY - this.lastTapY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (now - this.lastTapTime < DOUBLE_TAP_DELAY && dist < DOUBLE_TAP_DISTANCE) {
          const rect = this.canvas.getBoundingClientRect();
          this.callbacks.onDoubleTap(
            touch.clientX - rect.left,
            touch.clientY - rect.top
          );
          this.lastTapTime = 0;
        } else {
          this.lastTapTime = now;
          this.lastTapX = touch.clientX;
          this.lastTapY = touch.clientY;
        }
      }
      for (let i = 0; i < e.changedTouches.length; i++) {
        this.activeTouches.delete(e.changedTouches[i].identifier);
      }
      if (this.activeTouches.size < 2) {
        this.accumulatedAngle = 0;
      }
      if (this.activeTouches.size === 0) {
        this.isPanning = false;
        if (this.callbacks.onPanEnd) {
          this.callbacks.onPanEnd();
        }
      } else if (this.activeTouches.size === 1) {
        this.isPanning = true;
      }
    }
    initPinchRotate() {
      const touches = Array.from(this.activeTouches.values());
      if (touches.length < 2) return;
      const dx = touches[1].x - touches[0].x;
      const dy = touches[1].y - touches[0].y;
      this.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
      this.initialPinchAngle = Math.atan2(dy, dx);
      this.accumulatedAngle = 0;
    }
    handlePinchRotate() {
      const touches = Array.from(this.activeTouches.values());
      if (touches.length < 2) return;
      const dx = touches[1].x - touches[0].x;
      const dy = touches[1].y - touches[0].y;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);
      const currentAngle = Math.atan2(dy, dx);
      if (this.initialPinchDistance > 0) {
        const scale = currentDistance / this.initialPinchDistance;
        if (scale > 1.3) {
          this.callbacks.onZoom(1);
          this.initialPinchDistance = currentDistance;
        } else if (scale < 0.7) {
          this.callbacks.onZoom(-1);
          this.initialPinchDistance = currentDistance;
        }
      }
      let angleDelta = currentAngle - this.initialPinchAngle;
      while (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
      while (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;
      this.accumulatedAngle += angleDelta;
      this.initialPinchAngle = currentAngle;
      if (this.accumulatedAngle > ROTATION_THRESHOLD) {
        this.callbacks.onRotate("ccw");
        this.accumulatedAngle = 0;
      } else if (this.accumulatedAngle < -ROTATION_THRESHOLD) {
        this.callbacks.onRotate("cw");
        this.accumulatedAngle = 0;
      }
    }
    /**
     * Remove all event listeners
     */
    destroy() {
      this.canvas.removeEventListener("touchstart", this.boundHandlers.touchstart);
      this.canvas.removeEventListener("touchmove", this.boundHandlers.touchmove);
      this.canvas.removeEventListener("touchend", this.boundHandlers.touchend);
      this.canvas.removeEventListener("touchcancel", this.boundHandlers.touchcancel);
      this.activeTouches.clear();
    }
  };

  // src/client/renderer/road-texture-system.ts
  var ROAD_TYPE = {
    LAND_ROAD: 0,
    // Rural road on land
    URBAN_ROAD: 1,
    // Urban road on concrete
    NORTH_BRIDGE: 2,
    // Bridge facing North
    SOUTH_BRIDGE: 3,
    // Bridge facing South
    EAST_BRIDGE: 4,
    // Bridge facing East
    WEST_BRIDGE: 5,
    // Bridge facing West
    FULL_BRIDGE: 6,
    // Full bridge (center water)
    LEVEL_PASS: 7,
    // Railroad level crossing (rural)
    URBAN_LEVEL_PASS: 8,
    // Railroad level crossing (urban)
    SMOOTH_ROAD: 9,
    // Smooth corner (rural)
    URBAN_SMOOTH_ROAD: 10
    // Smooth corner (urban)
  };
  var HIGH_ROAD_ID_MASK = 240;
  var LAND_TYPE_SHIFT = 4;
  var DUMMY_ROAD_MASK = 256;
  var ROAD_NONE = 4294967295;
  var NS_ROAD_START_MAPPINGS = [
    1 /* NSRoadStart */,
    // None -> NSRoadStart
    1 /* NSRoadStart */,
    // NSRoadStart -> NSRoadStart
    5 /* NSRoad */,
    // NSRoadEnd -> NSRoad
    11 /* CornerW */,
    // WERoadStart -> CornerW
    13 /* CornerN */,
    // WERoadEnd -> CornerN
    5 /* NSRoad */,
    // NSRoad -> NSRoad
    10 /* BottomPlug */,
    // WERoad -> BottomPlug
    7 /* LeftPlug */,
    // LeftPlug -> LeftPlug
    8 /* RightPlug */,
    // RightPlug -> RightPlug
    15 /* CrossRoads */,
    // TopPlug -> CrossRoads
    10 /* BottomPlug */,
    // BottomPlug -> BottomPlug
    11 /* CornerW */,
    // CornerW -> CornerW
    8 /* RightPlug */,
    // CornerS -> RightPlug
    13 /* CornerN */,
    // CornerN -> CornerN
    7 /* LeftPlug */,
    // CornerE -> LeftPlug
    15 /* CrossRoads */
    // CrossRoads -> CrossRoads
  ];
  var NS_ROAD_BLOCK_MAPPINGS = [
    5 /* NSRoad */,
    // None -> NSRoad
    5 /* NSRoad */,
    // NSRoadStart -> NSRoad
    5 /* NSRoad */,
    // NSRoadEnd -> NSRoad
    8 /* RightPlug */,
    // WERoadStart -> RightPlug
    7 /* LeftPlug */,
    // WERoadEnd -> LeftPlug
    5 /* NSRoad */,
    // NSRoad -> NSRoad
    15 /* CrossRoads */,
    // WERoad -> CrossRoads
    7 /* LeftPlug */,
    // LeftPlug -> LeftPlug
    8 /* RightPlug */,
    // RightPlug -> RightPlug
    15 /* CrossRoads */,
    // TopPlug -> CrossRoads
    15 /* CrossRoads */,
    // BottomPlug -> CrossRoads
    8 /* RightPlug */,
    // CornerW -> RightPlug
    8 /* RightPlug */,
    // CornerS -> RightPlug
    7 /* LeftPlug */,
    // CornerN -> LeftPlug
    7 /* LeftPlug */,
    // CornerE -> LeftPlug
    15 /* CrossRoads */
    // CrossRoads -> CrossRoads
  ];
  var NS_ROAD_END_MAPPINGS = [
    2 /* NSRoadEnd */,
    // None -> NSRoadEnd
    5 /* NSRoad */,
    // NSRoadStart -> NSRoad
    2 /* NSRoadEnd */,
    // NSRoadEnd -> NSRoadEnd
    12 /* CornerS */,
    // WERoadStart -> CornerS
    14 /* CornerE */,
    // WERoadEnd -> CornerE
    5 /* NSRoad */,
    // NSRoad -> NSRoad
    9 /* TopPlug */,
    // WERoad -> TopPlug
    7 /* LeftPlug */,
    // LeftPlug -> LeftPlug
    8 /* RightPlug */,
    // RightPlug -> RightPlug
    9 /* TopPlug */,
    // TopPlug -> TopPlug
    15 /* CrossRoads */,
    // BottomPlug -> CrossRoads
    8 /* RightPlug */,
    // CornerW -> RightPlug
    12 /* CornerS */,
    // CornerS -> CornerS
    7 /* LeftPlug */,
    // CornerN -> LeftPlug
    14 /* CornerE */,
    // CornerE -> CornerE
    15 /* CrossRoads */
    // CrossRoads -> CrossRoads
  ];
  var WE_ROAD_START_MAPPINGS = [
    3 /* WERoadStart */,
    // None -> WERoadStart
    11 /* CornerW */,
    // NSRoadStart -> CornerW
    12 /* CornerS */,
    // NSRoadEnd -> CornerS
    3 /* WERoadStart */,
    // WERoadStart -> WERoadStart
    6 /* WERoad */,
    // WERoadEnd -> WERoad
    8 /* RightPlug */,
    // NSRoad -> RightPlug
    6 /* WERoad */,
    // WERoad -> WERoad
    15 /* CrossRoads */,
    // LeftPlug -> CrossRoads
    8 /* RightPlug */,
    // RightPlug -> RightPlug
    9 /* TopPlug */,
    // TopPlug -> TopPlug
    10 /* BottomPlug */,
    // BottomPlug -> BottomPlug
    11 /* CornerW */,
    // CornerW -> CornerW
    12 /* CornerS */,
    // CornerS -> CornerS
    10 /* BottomPlug */,
    // CornerN -> BottomPlug
    9 /* TopPlug */,
    // CornerE -> TopPlug
    15 /* CrossRoads */
    // CrossRoads -> CrossRoads
  ];
  var WE_ROAD_BLOCK_MAPPINGS = [
    6 /* WERoad */,
    // None -> WERoad
    10 /* BottomPlug */,
    // NSRoadStart -> BottomPlug
    9 /* TopPlug */,
    // NSRoadEnd -> TopPlug
    6 /* WERoad */,
    // WERoadStart -> WERoad
    6 /* WERoad */,
    // WERoadEnd -> WERoad
    15 /* CrossRoads */,
    // NSRoad -> CrossRoads
    6 /* WERoad */,
    // WERoad -> WERoad
    15 /* CrossRoads */,
    // LeftPlug -> CrossRoads
    15 /* CrossRoads */,
    // RightPlug -> CrossRoads
    9 /* TopPlug */,
    // TopPlug -> TopPlug
    10 /* BottomPlug */,
    // BottomPlug -> BottomPlug
    10 /* BottomPlug */,
    // CornerW -> BottomPlug
    9 /* TopPlug */,
    // CornerS -> TopPlug
    10 /* BottomPlug */,
    // CornerN -> BottomPlug
    9 /* TopPlug */,
    // CornerE -> TopPlug
    15 /* CrossRoads */
    // CrossRoads -> CrossRoads
  ];
  var WE_ROAD_END_MAPPINGS = [
    4 /* WERoadEnd */,
    // None -> WERoadEnd
    13 /* CornerN */,
    // NSRoadStart -> CornerN
    14 /* CornerE */,
    // NSRoadEnd -> CornerE
    6 /* WERoad */,
    // WERoadStart -> WERoad
    4 /* WERoadEnd */,
    // WERoadEnd -> WERoadEnd
    7 /* LeftPlug */,
    // NSRoad -> LeftPlug
    6 /* WERoad */,
    // WERoad -> WERoad
    7 /* LeftPlug */,
    // LeftPlug -> LeftPlug
    15 /* CrossRoads */,
    // RightPlug -> CrossRoads
    9 /* TopPlug */,
    // TopPlug -> TopPlug
    10 /* BottomPlug */,
    // BottomPlug -> BottomPlug
    10 /* BottomPlug */,
    // CornerW -> BottomPlug
    9 /* TopPlug */,
    // CornerS -> TopPlug
    13 /* CornerN */,
    // CornerN -> CornerN
    14 /* CornerE */,
    // CornerE -> CornerE
    15 /* CrossRoads */
    // CrossRoads -> CrossRoads
  ];
  var VALID_ROAD_BLOCKS_BY_LAND_TYPE = {
    [0 /* Center */]: /* @__PURE__ */ new Set([
      1 /* NSRoadStart */,
      2 /* NSRoadEnd */,
      3 /* WERoadStart */,
      4 /* WERoadEnd */,
      5 /* NSRoad */,
      6 /* WERoad */,
      7 /* LeftPlug */,
      8 /* RightPlug */,
      9 /* TopPlug */,
      10 /* BottomPlug */,
      11 /* CornerW */,
      12 /* CornerS */,
      13 /* CornerN */,
      14 /* CornerE */,
      15 /* CrossRoads */
    ]),
    [1 /* N */]: /* @__PURE__ */ new Set([1 /* NSRoadStart */, 2 /* NSRoadEnd */, 5 /* NSRoad */]),
    [2 /* E */]: /* @__PURE__ */ new Set([3 /* WERoadStart */, 4 /* WERoadEnd */, 6 /* WERoad */]),
    [3 /* S */]: /* @__PURE__ */ new Set([1 /* NSRoadStart */, 2 /* NSRoadEnd */, 5 /* NSRoad */]),
    [4 /* W */]: /* @__PURE__ */ new Set([3 /* WERoadStart */, 4 /* WERoadEnd */, 6 /* WERoad */]),
    [5 /* NEo */]: /* @__PURE__ */ new Set([
      1 /* NSRoadStart */,
      2 /* NSRoadEnd */,
      3 /* WERoadStart */,
      4 /* WERoadEnd */,
      5 /* NSRoad */,
      6 /* WERoad */
    ]),
    [6 /* SEo */]: /* @__PURE__ */ new Set([
      1 /* NSRoadStart */,
      2 /* NSRoadEnd */,
      3 /* WERoadStart */,
      4 /* WERoadEnd */,
      5 /* NSRoad */,
      6 /* WERoad */
    ]),
    [7 /* SWo */]: /* @__PURE__ */ new Set([
      1 /* NSRoadStart */,
      2 /* NSRoadEnd */,
      3 /* WERoadStart */,
      4 /* WERoadEnd */,
      5 /* NSRoad */,
      6 /* WERoad */
    ]),
    [8 /* NWo */]: /* @__PURE__ */ new Set([
      1 /* NSRoadStart */,
      2 /* NSRoadEnd */,
      3 /* WERoadStart */,
      4 /* WERoadEnd */,
      5 /* NSRoad */,
      6 /* WERoad */
    ]),
    [9 /* NEi */]: /* @__PURE__ */ new Set([
      1 /* NSRoadStart */,
      2 /* NSRoadEnd */,
      3 /* WERoadStart */,
      4 /* WERoadEnd */,
      5 /* NSRoad */,
      6 /* WERoad */
    ]),
    [10 /* SEi */]: /* @__PURE__ */ new Set([
      1 /* NSRoadStart */,
      2 /* NSRoadEnd */,
      3 /* WERoadStart */,
      4 /* WERoadEnd */,
      5 /* NSRoad */,
      6 /* WERoad */
    ]),
    [11 /* SWi */]: /* @__PURE__ */ new Set([
      1 /* NSRoadStart */,
      2 /* NSRoadEnd */,
      3 /* WERoadStart */,
      4 /* WERoadEnd */,
      5 /* NSRoad */,
      6 /* WERoad */
    ]),
    [12 /* NWi */]: /* @__PURE__ */ new Set([
      1 /* NSRoadStart */,
      2 /* NSRoadEnd */,
      3 /* WERoadStart */,
      4 /* WERoadEnd */,
      5 /* NSRoad */,
      6 /* WERoad */
    ]),
    [13 /* Special */]: /* @__PURE__ */ new Set([
      1 /* NSRoadStart */,
      2 /* NSRoadEnd */,
      3 /* WERoadStart */,
      4 /* WERoadEnd */,
      5 /* NSRoad */,
      6 /* WERoad */
    ])
  };
  var INVALID_ROAD_BLOCK_IDS = /* @__PURE__ */ new Set([
    34,
    35,
    37,
    38,
    39,
    42,
    46,
    50,
    51,
    53,
    54,
    56,
    59,
    64,
    65,
    68,
    80,
    81,
    84,
    86,
    89,
    102,
    109,
    110
  ]);
  function highRoadIdOf(roadblock) {
    return (roadblock & HIGH_ROAD_ID_MASK) >> 4;
  }
  function makeRoadBlockOf(topId, highId) {
    return highId << 4 | topId - 1;
  }
  function isBridge(roadblock) {
    const highId = highRoadIdOf(roadblock);
    return highId >= ROAD_TYPE.NORTH_BRIDGE && highId <= ROAD_TYPE.FULL_BRIDGE;
  }
  function isJunctionTopology(topId) {
    return topId === 11 /* CornerW */ || topId === 12 /* CornerS */ || topId === 13 /* CornerN */ || topId === 14 /* CornerE */ || topId === 7 /* LeftPlug */ || topId === 8 /* RightPlug */ || topId === 9 /* TopPlug */ || topId === 10 /* BottomPlug */ || topId === 15 /* CrossRoads */;
  }
  function isHorizontalRoad(topId) {
    return topId === 6 /* WERoad */ || topId === 3 /* WERoadStart */ || topId === 4 /* WERoadEnd */;
  }
  function roadBlockId(topolId, landId, onConcrete, onRailroad, isDummy) {
    if (topolId === 0 /* None */) {
      return ROAD_NONE;
    }
    const topolIdOrd = topolId - 1;
    const horizRoad = isHorizontalRoad(topolId);
    let result;
    if (landClassOf(landId) === 3 /* ZoneD */ && !onConcrete) {
      const landType = landTypeOf(landId);
      switch (landType) {
        case 1 /* N */:
          result = topolIdOrd | ROAD_TYPE.NORTH_BRIDGE << LAND_TYPE_SHIFT;
          break;
        case 3 /* S */:
          result = topolIdOrd | ROAD_TYPE.SOUTH_BRIDGE << LAND_TYPE_SHIFT;
          break;
        case 2 /* E */:
          result = topolIdOrd | ROAD_TYPE.EAST_BRIDGE << LAND_TYPE_SHIFT;
          break;
        case 4 /* W */:
          result = topolIdOrd | ROAD_TYPE.WEST_BRIDGE << LAND_TYPE_SHIFT;
          break;
        case 5 /* NEo */:
          result = horizRoad ? topolIdOrd | ROAD_TYPE.EAST_BRIDGE << LAND_TYPE_SHIFT : topolIdOrd | ROAD_TYPE.NORTH_BRIDGE << LAND_TYPE_SHIFT;
          break;
        case 6 /* SEo */:
          result = horizRoad ? topolIdOrd | ROAD_TYPE.EAST_BRIDGE << LAND_TYPE_SHIFT : topolIdOrd | ROAD_TYPE.SOUTH_BRIDGE << LAND_TYPE_SHIFT;
          break;
        case 7 /* SWo */:
          result = horizRoad ? topolIdOrd | ROAD_TYPE.WEST_BRIDGE << LAND_TYPE_SHIFT : topolIdOrd | ROAD_TYPE.SOUTH_BRIDGE << LAND_TYPE_SHIFT;
          break;
        case 8 /* NWo */:
          result = horizRoad ? topolIdOrd | ROAD_TYPE.WEST_BRIDGE << LAND_TYPE_SHIFT : topolIdOrd | ROAD_TYPE.NORTH_BRIDGE << LAND_TYPE_SHIFT;
          break;
        case 0 /* Center */:
        case 9 /* NEi */:
        case 10 /* SEi */:
        case 11 /* SWi */:
        case 12 /* NWi */:
          result = topolIdOrd | ROAD_TYPE.FULL_BRIDGE << LAND_TYPE_SHIFT;
          break;
        default:
          result = topolIdOrd;
      }
    } else {
      if (onConcrete) {
        if (onRailroad) {
          result = topolIdOrd | ROAD_TYPE.URBAN_LEVEL_PASS << LAND_TYPE_SHIFT;
        } else {
          result = topolIdOrd | ROAD_TYPE.URBAN_ROAD << LAND_TYPE_SHIFT;
        }
      } else {
        if (onRailroad) {
          result = topolIdOrd | ROAD_TYPE.LEVEL_PASS << LAND_TYPE_SHIFT;
        } else {
          result = topolIdOrd;
        }
      }
    }
    if (isDummy) {
      result = result | DUMMY_ROAD_MASK;
    }
    if (INVALID_ROAD_BLOCK_IDS.has(result)) {
      return ROAD_NONE;
    }
    if (result === 86) {
      return 22;
    }
    return result;
  }
  function detectSmoothCorner(row, col, renderedRoads, hasConcrete) {
    const currentBlock = renderedRoads.get(row, col);
    const uBlock = renderedRoads.get(row + 1, col);
    const dBlock = renderedRoads.get(row - 1, col);
    const rBlock = renderedRoads.get(row, col + 1);
    const lBlock = renderedRoads.get(row, col - 1);
    let isSmooth = false;
    switch (currentBlock) {
      case 11 /* CornerW */:
        isSmooth = dBlock !== 14 /* CornerE */ && rBlock !== 14 /* CornerE */;
        break;
      case 12 /* CornerS */:
        isSmooth = uBlock !== 13 /* CornerN */ && rBlock !== 13 /* CornerN */;
        break;
      case 13 /* CornerN */:
        isSmooth = dBlock !== 12 /* CornerS */ && lBlock !== 12 /* CornerS */;
        break;
      case 14 /* CornerE */:
        isSmooth = uBlock !== 11 /* CornerW */ && lBlock !== 11 /* CornerW */;
        break;
    }
    if (isSmooth) {
      const roadType = hasConcrete(row, col) ? ROAD_TYPE.URBAN_SMOOTH_ROAD : ROAD_TYPE.SMOOTH_ROAD;
      return {
        isSmooth: true,
        roadBlock: makeRoadBlockOf(currentBlock, roadType)
      };
    }
    return { isSmooth: false, roadBlock: ROAD_NONE };
  }
  var RoadsRendering = class {
    constructor(top, left, width, height) {
      this.top = top;
      this.left = left;
      this.width = width;
      this.height = height;
      this.roadIds = [];
      for (let i = 0; i < height; i++) {
        this.roadIds[i] = new Array(width).fill(0 /* None */);
      }
    }
    isValidAddress(row, col) {
      return row >= this.top && row < this.top + this.height && col >= this.left && col < this.left + this.width;
    }
    get(row, col) {
      if (this.isValidAddress(row, col)) {
        return this.roadIds[row - this.top][col - this.left];
      }
      return 0 /* None */;
    }
    set(row, col, value) {
      if (this.isValidAddress(row, col)) {
        this.roadIds[row - this.top][col - this.left] = value;
      }
    }
    getAll() {
      return this.roadIds;
    }
  };
  function renderRoadSegment(rendering, segment) {
    const { x1, y1, x2, y2 } = segment;
    if (x1 === x2) {
      const x = x1;
      let ymin = y1;
      let ymax = y2;
      if (ymin > ymax) {
        ymin = y2;
        ymax = y1;
      }
      let y = ymin;
      rendering.set(y, x, NS_ROAD_END_MAPPINGS[rendering.get(y, x)]);
      y++;
      while (y < ymax) {
        rendering.set(y, x, NS_ROAD_BLOCK_MAPPINGS[rendering.get(y, x)]);
        y++;
      }
      if (y === ymax) {
        rendering.set(y, x, NS_ROAD_START_MAPPINGS[rendering.get(y, x)]);
      }
    } else if (y1 === y2) {
      const y = y1;
      let xmin = x1;
      let xmax = x2;
      if (xmin > xmax) {
        xmin = x2;
        xmax = x1;
      }
      let x = xmin;
      rendering.set(y, x, WE_ROAD_START_MAPPINGS[rendering.get(y, x)]);
      x++;
      while (x < xmax) {
        rendering.set(y, x, WE_ROAD_BLOCK_MAPPINGS[rendering.get(y, x)]);
        x++;
      }
      if (x === xmax) {
        rendering.set(y, x, WE_ROAD_END_MAPPINGS[rendering.get(y, x)]);
      }
    }
  }
  function parseIniFile(content) {
    const sections = /* @__PURE__ */ new Map();
    let currentSection = "";
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#")) {
        continue;
      }
      const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        if (!sections.has(currentSection)) {
          sections.set(currentSection, /* @__PURE__ */ new Map());
        }
        continue;
      }
      const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
      if (kvMatch && currentSection) {
        const key = kvMatch[1].trim();
        const value = kvMatch[2].trim();
        sections.get(currentSection).set(key, value);
      }
    }
    return sections;
  }
  function parseCarPathSegments(value) {
    const segments = [];
    const segmentPattern = /\(([^)]+)\)/g;
    let match;
    while ((match = segmentPattern.exec(value)) !== null) {
      const parts = match[1].split(",").map((s) => s.trim());
      if (parts.length >= 6) {
        segments.push({
          startX: parseFloat(parts[0]),
          startY: parseFloat(parts[1]),
          endX: parseFloat(parts[2]),
          endY: parseFloat(parts[3]),
          direction: parts[4],
          steps: parseInt(parts[5], 10)
        });
      }
    }
    return segments;
  }
  function parseCarPaths(carPathsSection) {
    const paths = [];
    for (const [key, value] of carPathsSection) {
      const keyMatch = key.match(/^([NSEW])\.G([NSEW])$/);
      if (!keyMatch) continue;
      const segments = parseCarPathSegments(value);
      if (segments.length > 0) {
        paths.push({
          entryDirection: keyMatch[1],
          exitDirection: keyMatch[2],
          segments
        });
      }
    }
    return paths;
  }
  function parseDelphiInt(value, defaultValue = 0) {
    if (!value) return defaultValue;
    const trimmed = value.trim();
    if (trimmed.startsWith("$")) {
      return parseInt(trimmed.substring(1), 16);
    }
    return parseInt(trimmed, 10);
  }
  function loadRoadBlockClassFromIni(iniContent) {
    const sections = parseIniFile(iniContent);
    const general = sections.get("General") ?? /* @__PURE__ */ new Map();
    const images = sections.get("Images") ?? /* @__PURE__ */ new Map();
    const carPathsSection = sections.get("CarPaths") ?? /* @__PURE__ */ new Map();
    const carPaths = parseCarPaths(carPathsSection);
    return {
      id: parseDelphiInt(general.get("Id") ?? "", 255),
      imagePath: images.get("64x32") ?? "",
      railingImagePath: images.get("Railing64x32") ?? "",
      frequency: parseDelphiInt(general.get("Freq") ?? "", 1),
      carPaths
    };
  }
  var RoadBlockClassManager = class {
    constructor() {
      this.classes = /* @__PURE__ */ new Map();
      this.basePath = "";
    }
    setBasePath(path) {
      this.basePath = path.endsWith("/") ? path : path + "/";
    }
    /**
     * Load a road block class from INI content
     */
    loadFromIni(iniContent) {
      const config2 = loadRoadBlockClassFromIni(iniContent);
      this.classes.set(config2.id, config2);
    }
    /**
     * Get road block class by ID
     */
    getClass(id) {
      return this.classes.get(id);
    }
    /**
     * Get the image path for a road block ID
     */
    getImagePath(roadBlockId2) {
      const config2 = this.classes.get(roadBlockId2);
      if (config2 && config2.imagePath) {
        return this.basePath + "RoadBlockImages/" + config2.imagePath;
      }
      return null;
    }
    /**
     * Get the railing image path for a road block ID (for bridges)
     */
    getRailingImagePath(roadBlockId2) {
      const config2 = this.classes.get(roadBlockId2);
      if (config2 && config2.railingImagePath) {
        return this.basePath + "RoadBlockImages/" + config2.railingImagePath;
      }
      return null;
    }
  };

  // src/client/renderer/concrete-texture-system.ts
  var CONCRETE_FULL = 12;
  var CONCRETE_SPECIAL = 15;
  var CONCRETE_ROAD_FLAG = 16;
  var CONCRETE_NONE = 255;
  var PLATFORM_SHIFT = 12;
  var NEIGHBOR_OFFSETS = [
    [-1, -1],
    // 0: top-left (diagonal)
    [-1, 0],
    // 1: top (cardinal)
    [-1, 1],
    // 2: top-right (diagonal)
    [0, -1],
    // 3: left (cardinal)
    [0, 1],
    // 4: right (cardinal)
    [1, -1],
    // 5: bottom-left (diagonal)
    [1, 0],
    // 6: bottom (cardinal)
    [1, 1]
    // 7: bottom-right (diagonal)
  ];
  var CARDINAL_INDICES = {
    TOP: 1,
    LEFT: 3,
    RIGHT: 4,
    BOTTOM: 6
  };
  var PLATFORM_IDS = {
    CENTER: 128,
    // platC - all 4 cardinal neighbors present (center tile)
    E: 129,
    // platE - East edge exposed (missing E neighbor)
    N: 130,
    // platN - North edge exposed (missing N neighbor)
    NE: 131,
    // platNE - NE corner exposed (missing N,E neighbors)
    NW: 132,
    // platNW - NW corner exposed (missing N,W neighbors)
    S: 133,
    // platS - South edge exposed (missing S neighbor)
    SE: 134,
    // platSE - SE corner exposed (missing S,E neighbors)
    SW: 135,
    // platSW - SW corner exposed (missing S,W neighbors)
    W: 136
    // platW - West edge exposed (missing W neighbor)
  };
  var WATER_CONCRETE_LOOKUP = {
    15: PLATFORM_IDS.CENTER,
    // TLRB = all present → center
    7: PLATFORM_IDS.SE,
    // _LRB = missing T → SE edge on screen
    11: PLATFORM_IDS.SW,
    // T_RB = missing L → SW edge on screen
    13: PLATFORM_IDS.NE,
    // TL_B = missing R → NE edge on screen
    14: PLATFORM_IDS.NW,
    // TLR_ = missing B → NW edge on screen
    3: PLATFORM_IDS.S,
    // __RB = missing T,L → S corner on screen
    5: PLATFORM_IDS.E,
    // _L_B = missing T,R → E corner on screen
    9: PLATFORM_IDS.CENTER,
    // T__B = missing L,R → vertical strip (use center)
    12: PLATFORM_IDS.N,
    // TL__ = missing R,B → N corner on screen
    10: PLATFORM_IDS.W,
    // T_R_ = missing L,B → W corner on screen
    6: PLATFORM_IDS.CENTER,
    // _LR_ = missing T,B → horizontal strip (use center)
    // Isolated patterns - use center as fallback
    1: PLATFORM_IDS.CENTER,
    // ___B
    2: PLATFORM_IDS.CENTER,
    // __R_
    4: PLATFORM_IDS.CENTER,
    // _L__
    8: PLATFORM_IDS.CENTER,
    // T___
    0: PLATFORM_IDS.CENTER
    // ____ (no neighbors)
  };
  function getLandConcreteIdFromDecisionTree(cfg) {
    const topLeft = cfg[0];
    const top = cfg[1];
    const topRight = cfg[2];
    const left = cfg[3];
    const right = cfg[4];
    const bottomLeft = cfg[5];
    const bottom = cfg[6];
    const bottomRight = cfg[7];
    if (top) {
      if (left) {
        if (right) {
          if (bottom) {
            if (!topLeft) return 1;
            if (!topRight) return 4;
            if (!bottomRight) return 8;
            if (!bottomLeft) return 11;
            return CONCRETE_FULL;
          } else {
            if (!topLeft) return 6;
            if (!topRight) return 6;
            return 6;
          }
        } else {
          if (bottom) {
            if (!topLeft) return 5;
            if (!bottomLeft) return 5;
            return 5;
          } else {
            return 3;
          }
        }
      } else {
        if (right) {
          if (bottom) {
            if (!topRight) return 7;
            if (!bottomRight) return 7;
            return 7;
          } else {
            return 9;
          }
        } else {
          if (bottom) {
            return 0;
          } else {
            return 10;
          }
        }
      }
    } else {
      if (left) {
        if (right) {
          if (bottom) {
            if (!bottomLeft) return 0;
            if (!bottomRight) return 0;
            return 0;
          } else {
            return 0;
          }
        } else {
          if (bottom) {
            return 2;
          } else {
            return 10;
          }
        }
      } else {
        if (right) {
          if (bottom) {
            return 10;
          } else {
            return 10;
          }
        } else {
          if (bottom) {
            return 10;
          } else {
            return CONCRETE_FULL;
          }
        }
      }
    }
  }
  function buildNeighborConfig(row, col, mapData) {
    const cfg = [false, false, false, false, false, false, false, false];
    for (let i = 0; i < 8; i++) {
      const [di, dj] = NEIGHBOR_OFFSETS[i];
      const neighborRow = row + di;
      const neighborCol = col + dj;
      cfg[i] = mapData.hasConcrete(neighborRow, neighborCol);
    }
    return cfg;
  }
  function getLandConcreteId(cfg) {
    return getLandConcreteIdFromDecisionTree(cfg);
  }
  function getWaterConcreteId(cfg) {
    const top = cfg[CARDINAL_INDICES.TOP];
    const left = cfg[CARDINAL_INDICES.LEFT];
    const right = cfg[CARDINAL_INDICES.RIGHT];
    const bottom = cfg[CARDINAL_INDICES.BOTTOM];
    const key = (top ? 8 : 0) | (left ? 4 : 0) | (right ? 2 : 0) | (bottom ? 1 : 0);
    return WATER_CONCRETE_LOOKUP[key] ?? PLATFORM_IDS.CENTER;
  }
  function isWaterPlatformTile(row, col, mapData) {
    const landId = mapData.getLandId(row, col);
    return landClassOf(landId) === 3 /* ZoneD */;
  }
  function canReceiveConcrete(landId) {
    if (landClassOf(landId) === 3 /* ZoneD */) {
      return landTypeOf(landId) === 0 /* Center */;
    }
    return true;
  }
  function getConcreteId(row, col, mapData) {
    if (!mapData.hasConcrete(row, col)) {
      return CONCRETE_NONE;
    }
    const hasBuilding = mapData.hasBuilding(row, col);
    const hasRoad = mapData.hasRoad(row, col);
    const isWaterPlatform = isWaterPlatformTile(row, col, mapData);
    if (hasBuilding && !isWaterPlatform) {
      return CONCRETE_FULL;
    }
    const cfg = buildNeighborConfig(row, col, mapData);
    if (isWaterPlatform) {
      return getWaterConcreteId(cfg);
    }
    let concreteId = getLandConcreteId(cfg);
    if (hasRoad && concreteId < CONCRETE_FULL) {
      concreteId |= CONCRETE_ROAD_FLAG;
    }
    if (concreteId === CONCRETE_FULL && !hasBuilding && !hasRoad && row % 2 === 0 && col % 2 === 0) {
      return CONCRETE_SPECIAL;
    }
    return concreteId;
  }
  var ConcreteBlockClassManager = class {
    constructor() {
      this.classes = /* @__PURE__ */ new Map();
      this.basePath = "";
    }
    /**
     * Set the base path for texture loading
     */
    setBasePath(path) {
      this.basePath = path.endsWith("/") ? path : path + "/";
    }
    /**
     * Load a concrete block class from INI content
     */
    loadFromIni(iniContent) {
      const config2 = loadConcreteBlockClassFromIni(iniContent);
      if (config2.id !== CONCRETE_NONE) {
        this.classes.set(config2.id, config2);
      }
    }
    /**
     * Get concrete block class by ID
     */
    getClass(id) {
      return this.classes.get(id);
    }
    /**
     * Get the image path for a concrete block ID
     * Returns the full path to the texture file
     */
    getImagePath(concreteBlockId) {
      const config2 = this.classes.get(concreteBlockId);
      if (config2 && config2.imagePath) {
        return this.basePath + "ConcreteImages/" + config2.imagePath;
      }
      return null;
    }
    /**
     * Get the image filename (without path) for a concrete block ID
     */
    getImageFilename(concreteBlockId) {
      const config2 = this.classes.get(concreteBlockId);
      return config2?.imagePath || null;
    }
    /**
     * Check if a concrete block class is loaded
     */
    hasClass(id) {
      return this.classes.has(id);
    }
    /**
     * Get all loaded class IDs
     */
    getAllIds() {
      return Array.from(this.classes.keys());
    }
    /**
     * Get count of loaded classes
     */
    getClassCount() {
      return this.classes.size;
    }
  };
  function loadConcreteBlockClassFromIni(iniContent) {
    const sections = parseIniFile(iniContent);
    const general = sections.get("General") ?? /* @__PURE__ */ new Map();
    const images = sections.get("Images") ?? /* @__PURE__ */ new Map();
    const idStr = general.get("Id") ?? "";
    const id = parseDelphiInt(idStr, CONCRETE_NONE);
    const imagePath = images.get("64X32") ?? images.get("64x32") ?? "";
    return { id, imagePath };
  }

  // src/client/renderer/painter-algorithm.ts
  function painterSort(a, b) {
    return b.i + b.j - (a.i + a.j);
  }

  // src/client/renderer/car-class-system.ts
  var CAR_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  function loadCarClassFromIni(iniContent) {
    const sections = parseIniFile(iniContent);
    const general = sections.get("General") ?? /* @__PURE__ */ new Map();
    const imagesSection = sections.get("Images") ?? /* @__PURE__ */ new Map();
    const id = parseInt(general.get("Id") ?? "0", 10);
    const prob = parseFloat(general.get("Prob") ?? "1");
    const cargo = general.get("Cargo") ?? "People";
    const images = {};
    for (const dir of CAR_DIRECTIONS) {
      const key = `64X32${dir}`;
      const filename = imagesSection.get(key);
      if (filename) {
        images[dir] = filename;
      }
    }
    return { id, prob, cargo, images };
  }
  var CarClassManager = class {
    constructor() {
      this.classes = /* @__PURE__ */ new Map();
      this.totalProbWeight = 0;
    }
    /**
     * Load a car class from INI content
     */
    loadFromIni(iniContent) {
      const config2 = loadCarClassFromIni(iniContent);
      this.classes.set(config2.id, config2);
      this.recalculateProbWeight();
    }
    /**
     * Load multiple car classes from an array of INI contents
     */
    loadAll(iniContents) {
      for (const content of iniContents) {
        const config2 = loadCarClassFromIni(content);
        this.classes.set(config2.id, config2);
      }
      this.recalculateProbWeight();
    }
    /**
     * Get a car class by ID
     */
    getClass(id) {
      return this.classes.get(id);
    }
    /**
     * Get all loaded car classes
     */
    getAllClasses() {
      return Array.from(this.classes.values());
    }
    /**
     * Get the number of loaded classes
     */
    getClassCount() {
      return this.classes.size;
    }
    /**
     * Select a random car class, weighted by probability.
     * Trucks (Prob=0.2) spawn less often than cars/vans (Prob=1).
     */
    getRandomClass() {
      if (this.classes.size === 0) return void 0;
      let roll = Math.random() * this.totalProbWeight;
      for (const config2 of this.classes.values()) {
        roll -= config2.prob;
        if (roll <= 0) return config2;
      }
      const values = Array.from(this.classes.values());
      return values[values.length - 1];
    }
    /**
     * Get the sprite filename for a car class and direction
     */
    getImageFilename(classId, direction) {
      const config2 = this.classes.get(classId);
      if (!config2) return null;
      return config2.images[direction] ?? null;
    }
    /**
     * Clear all loaded classes
     */
    clear() {
      this.classes.clear();
      this.totalProbWeight = 0;
    }
    recalculateProbWeight() {
      this.totalProbWeight = 0;
      for (const config2 of this.classes.values()) {
        this.totalProbWeight += config2.prob;
      }
    }
  };

  // src/client/renderer/vehicle-animation-system.ts
  var EXIT_DIRECTION_OFFSETS = {
    "N": { dRow: -1, dCol: 0 },
    // North: previous row
    "S": { dRow: 1, dCol: 0 },
    // South: next row
    "E": { dRow: 0, dCol: 1 },
    // East: next column
    "W": { dRow: 0, dCol: -1 }
    // West: previous column
  };
  var OPPOSITE_DIRECTION = {
    "N": "S",
    "S": "N",
    "E": "W",
    "W": "E"
  };
  var VehicleAnimationSystem = class {
    constructor() {
      this.vehicles = [];
      this.nextVehicleId = 0;
      this.maxVehicles = 40;
      this.spawnCooldownRemaining = 0;
      this.SPAWN_COOLDOWN = 0.8;
      // seconds between spawn attempts
      this.VEHICLE_SPEED = 1.2;
      // tiles per second
      this.MIN_SPAWN_PATH_LENGTH = 3;
      // minimum tiles a vehicle must be able to travel
      // State
      this.paused = false;
      this.enabled = true;
      // Dependencies
      this.carClassManager = null;
      this.roadBlockClassManager = null;
      this.gameObjectTextureCache = null;
      this.roadTilesMap = null;
      this.roadsRendering = null;
      this.getLandId = null;
      this.hasConcrete = null;
      // Building positions for proximity-based spawning
      this.buildingTiles = /* @__PURE__ */ new Set();
      // Cached road tiles near buildings (within BUILDING_PROXIMITY radius)
      this.nearBuildingRoadTiles = null;
      this.BUILDING_PROXIMITY = 5;
    }
    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================
    setCarClassManager(manager) {
      this.carClassManager = manager;
    }
    setRoadBlockClassManager(manager) {
      this.roadBlockClassManager = manager;
    }
    setGameObjectTextureCache(cache) {
      this.gameObjectTextureCache = cache;
    }
    setRoadData(roadTilesMap, roadsRendering, getLandId, hasConcrete) {
      if (this.roadTilesMap !== roadTilesMap) {
        this.nearBuildingRoadTiles = null;
      }
      this.roadTilesMap = roadTilesMap;
      this.roadsRendering = roadsRendering;
      this.getLandId = getLandId;
      this.hasConcrete = hasConcrete;
    }
    /**
     * Set building tile positions for proximity-based vehicle spawning.
     * Buildings are passed as a Set of "col,row" strings.
     */
    setBuildingTiles(tiles) {
      if (tiles.size !== this.buildingTiles.size) {
        this.nearBuildingRoadTiles = null;
      }
      this.buildingTiles = tiles;
    }
    setEnabled(enabled) {
      this.enabled = enabled;
      if (!enabled) this.vehicles = [];
    }
    setPaused(paused) {
      this.paused = paused;
    }
    isActive() {
      return this.enabled && this.vehicles.length > 0;
    }
    getVehicleCount() {
      return this.vehicles.length;
    }
    clear() {
      this.vehicles = [];
      this.spawnCooldownRemaining = 0;
      this.nearBuildingRoadTiles = null;
    }
    // ==========================================================================
    // UPDATE (called every frame)
    // ==========================================================================
    update(deltaTime, bounds) {
      if (!this.enabled || this.paused) return;
      if (!this.carClassManager || !this.roadBlockClassManager || !this.roadTilesMap) return;
      const dt = Math.min(deltaTime, 0.1);
      for (const vehicle of this.vehicles) {
        this.updateVehicle(vehicle, dt);
      }
      this.vehicles = this.vehicles.filter((v) => v.alive);
      this.spawnCooldownRemaining -= dt;
      if (this.spawnCooldownRemaining <= 0 && this.vehicles.length < this.maxVehicles) {
        this.trySpawnVehicle(bounds);
        this.spawnCooldownRemaining = this.SPAWN_COOLDOWN;
      }
    }
    // ==========================================================================
    // RENDER (called every frame after update)
    // ==========================================================================
    render(ctx, mapToScreen, zoomConfig, canvasWidth, canvasHeight, isOnWaterPlatform) {
      if (!this.enabled || this.vehicles.length === 0) return;
      if (!this.gameObjectTextureCache) return;
      const scaleFactor = zoomConfig.tileWidth / 64;
      const halfWidth = zoomConfig.tileWidth / 2;
      const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);
      for (const vehicle of this.vehicles) {
        const screenPos = mapToScreen(vehicle.tileY, vehicle.tileX);
        const screenX = screenPos.x - halfWidth + vehicle.pixelX * scaleFactor;
        const onPlatform = isOnWaterPlatform ? isOnWaterPlatform(vehicle.tileX, vehicle.tileY) : false;
        const screenY = screenPos.y + vehicle.pixelY * scaleFactor - (onPlatform ? platformYShift : 0);
        const filename = this.carClassManager.getImageFilename(vehicle.carClassId, vehicle.direction);
        if (!filename) continue;
        const atlasRect = this.gameObjectTextureCache.getAtlasRect("CarImages", filename);
        if (atlasRect) {
          const sw = atlasRect.sw;
          const sh = atlasRect.sh;
          const drawX = Math.round(screenX - sw / 2);
          const drawY = Math.round(screenY - sh / 2);
          if (drawX + sw < 0 || drawX > canvasWidth || drawY + sh < 0 || drawY > canvasHeight) continue;
          ctx.drawImage(
            atlasRect.atlas,
            atlasRect.sx,
            atlasRect.sy,
            sw,
            sh,
            drawX,
            drawY,
            sw,
            sh
          );
        } else {
          const texture = this.gameObjectTextureCache.getTextureSync("CarImages", filename);
          if (texture) {
            const drawX = Math.round(screenX - texture.width / 2);
            const drawY = Math.round(screenY - texture.height / 2);
            if (drawX + texture.width < 0 || drawX > canvasWidth || drawY + texture.height < 0 || drawY > canvasHeight) continue;
            ctx.drawImage(texture, drawX, drawY);
          }
        }
      }
    }
    // ==========================================================================
    // VEHICLE UPDATE LOGIC
    // ==========================================================================
    updateVehicle(vehicle, dt) {
      const segment = vehicle.currentPath.segments[vehicle.segmentIndex];
      if (!segment) {
        vehicle.alive = false;
        return;
      }
      const totalSteps = this.getTotalPathSteps(vehicle.currentPath);
      const segmentFraction = segment.steps / totalSteps;
      const progressPerSecond = vehicle.speed / segmentFraction;
      vehicle.progress += progressPerSecond * dt / segment.steps;
      if (vehicle.progress >= 1) {
        vehicle.segmentIndex++;
        vehicle.progress = 0;
        if (vehicle.segmentIndex >= vehicle.currentPath.segments.length) {
          if (!this.transitionToNextTile(vehicle)) {
            vehicle.alive = false;
            return;
          }
        }
      }
      const seg = vehicle.currentPath.segments[vehicle.segmentIndex];
      if (seg) {
        const t = Math.min(vehicle.progress, 1);
        vehicle.pixelX = seg.startX + (seg.endX - seg.startX) * t;
        vehicle.pixelY = seg.startY + (seg.endY - seg.startY) * t;
        vehicle.direction = seg.direction;
      }
    }
    getTotalPathSteps(path) {
      let total = 0;
      for (const seg of path.segments) {
        total += seg.steps;
      }
      return total || 1;
    }
    transitionToNextTile(vehicle) {
      const exitDir = vehicle.currentPath.exitDirection;
      const offset = EXIT_DIRECTION_OFFSETS[exitDir];
      if (!offset) return false;
      const newRow = vehicle.tileY + offset.dRow;
      const newCol = vehicle.tileX + offset.dCol;
      if (!this.roadTilesMap?.has(`${newCol},${newRow}`)) return false;
      const entryDir = OPPOSITE_DIRECTION[exitDir];
      const nextPath = this.findCarPathForTile(newCol, newRow, entryDir);
      if (!nextPath) return false;
      vehicle.tileX = newCol;
      vehicle.tileY = newRow;
      vehicle.currentPath = nextPath;
      vehicle.segmentIndex = 0;
      vehicle.progress = 0;
      return true;
    }
    // ==========================================================================
    // SPAWNING
    // ==========================================================================
    /**
     * Build cached list of road tiles near buildings (within BUILDING_PROXIMITY tiles).
     * This is cached and only rebuilt when buildings or roads change.
     */
    buildNearBuildingRoadTiles() {
      const result = [];
      if (!this.roadTilesMap || this.buildingTiles.size === 0) return result;
      const radius = this.BUILDING_PROXIMITY;
      for (const [key] of this.roadTilesMap) {
        const [colStr, rowStr] = key.split(",");
        const col = parseInt(colStr, 10);
        const row = parseInt(rowStr, 10);
        let nearBuilding = false;
        for (let dr = -radius; dr <= radius && !nearBuilding; dr++) {
          for (let dc = -radius; dc <= radius && !nearBuilding; dc++) {
            if (this.buildingTiles.has(`${col + dc},${row + dr}`)) {
              nearBuilding = true;
            }
          }
        }
        if (nearBuilding) {
          result.push({ col, row });
        }
      }
      return result;
    }
    trySpawnVehicle(bounds) {
      if (!this.roadTilesMap || !this.carClassManager) return;
      if (!this.nearBuildingRoadTiles) {
        this.nearBuildingRoadTiles = this.buildNearBuildingRoadTiles();
      }
      const visibleCandidates = this.nearBuildingRoadTiles.filter(
        (t) => t.col >= bounds.minJ && t.col <= bounds.maxJ && t.row >= bounds.minI && t.row <= bounds.maxI
      );
      if (visibleCandidates.length === 0) return;
      const maxAttempts = Math.min(5, visibleCandidates.length);
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const idx = Math.floor(Math.random() * visibleCandidates.length);
        const tile = visibleCandidates[idx];
        if (this.vehicles.some((v) => v.tileX === tile.col && v.tileY === tile.row)) continue;
        const directions = ["N", "S", "E", "W"];
        const shuffled = directions.sort(() => Math.random() - 0.5);
        for (const entryDir of shuffled) {
          const carPath = this.findCarPathForTile(tile.col, tile.row, entryDir);
          if (!carPath) continue;
          const pathLength = this.measurePathLength(tile.col, tile.row, carPath);
          if (pathLength < this.MIN_SPAWN_PATH_LENGTH) continue;
          const carClass = this.carClassManager.getRandomClass();
          if (!carClass) return;
          const firstSegment = carPath.segments[0];
          this.vehicles.push({
            id: this.nextVehicleId++,
            carClassId: carClass.id,
            tileX: tile.col,
            tileY: tile.row,
            currentPath: carPath,
            segmentIndex: 0,
            progress: 0,
            direction: firstSegment.direction,
            pixelX: firstSegment.startX,
            pixelY: firstSegment.startY,
            speed: this.VEHICLE_SPEED,
            alive: true
          });
          return;
        }
      }
    }
    /**
     * Measure how many tiles a vehicle can travel from a starting tile/path.
     * Simulates tile transitions without creating a vehicle.
     * Used to validate spawn locations for long enough journeys.
     */
    measurePathLength(startCol, startRow, startPath) {
      let col = startCol;
      let row = startRow;
      let path = startPath;
      let length = 1;
      const maxCheck = 20;
      while (length < maxCheck) {
        const exitDir = path.exitDirection;
        const offset = EXIT_DIRECTION_OFFSETS[exitDir];
        if (!offset) break;
        const nextRow = row + offset.dRow;
        const nextCol = col + offset.dCol;
        if (!this.roadTilesMap?.has(`${nextCol},${nextRow}`)) break;
        const entryDir = OPPOSITE_DIRECTION[exitDir];
        const nextPath = this.findCarPathForTile(nextCol, nextRow, entryDir);
        if (!nextPath) break;
        col = nextCol;
        row = nextRow;
        path = nextPath;
        length++;
      }
      return length;
    }
    // ==========================================================================
    // PATH LOOKUP
    // ==========================================================================
    findCarPathForTile(col, row, entryDirection) {
      if (!this.roadsRendering || !this.roadBlockClassManager) return null;
      const topology = this.roadsRendering.get(row, col);
      if (topology === 0 /* None */) return null;
      const landId = this.getLandId ? this.getLandId(col, row) : 0;
      const onConcrete = this.hasConcrete ? this.hasConcrete(col, row) : false;
      const fullRoadBlockId = roadBlockId(topology, landId, onConcrete, false, false);
      const config2 = this.roadBlockClassManager.getClass(fullRoadBlockId);
      if (!config2 || config2.carPaths.length === 0) return null;
      const matchingPaths = config2.carPaths.filter((p) => p.entryDirection === entryDirection);
      if (matchingPaths.length === 0) return null;
      return matchingPaths[Math.floor(Math.random() * matchingPaths.length)];
    }
  };

  // src/client/renderer/isometric-map-renderer.ts
  var ZoneRequestManager = class {
    constructor(onLoadZone, zoneSize = 64) {
      this.onLoadZone = onLoadZone;
      this.zoneSize = zoneSize;
      // Queue of pending zone requests (sorted by priority)
      this.zoneQueue = [];
      // Currently loading zones with timestamps for timeout detection
      this.loadingZones = /* @__PURE__ */ new Map();
      // Movement state tracking
      this.isMoving = false;
      this.movementStopTimer = null;
      // Zoom-based delay configuration (milliseconds)
      this.ZOOM_DELAYS = {
        0: 500,
        // Z0 (farthest) - wait for movement fully stops
        1: 300,
        // Z1 - moderate delay
        2: 100,
        // Z2 - short delay
        3: 0
        // Z3 (closest) - immediate
      };
      // Server limit: max 3 concurrent requests
      this.MAX_CONCURRENT = 3;
      this.REQUEST_TIMEOUT = 15e3;
      // 15s timeout
      // Zone staleness threshold (5 minutes)
      this.ZONE_EXPIRY_MS = 5 * 60 * 1e3;
    }
    /**
     * Mark camera as moving (called during pan/zoom/rotate)
     */
    markMoving() {
      this.isMoving = true;
      if (this.movementStopTimer !== null) {
        clearTimeout(this.movementStopTimer);
        this.movementStopTimer = null;
      }
    }
    /**
     * Mark camera as stopped (called after pan/zoom/rotate ends)
     * Triggers delayed zone loading based on zoom level
     */
    markStopped(currentZoom) {
      this.isMoving = false;
      if (this.movementStopTimer !== null) {
        clearTimeout(this.movementStopTimer);
      }
      const delay = this.ZOOM_DELAYS[currentZoom] || 500;
      this.movementStopTimer = window.setTimeout(() => {
        this.processQueue();
      }, delay);
    }
    /**
     * Request zones for visible area
     * Queues all needed zones and processes them based on movement state
     */
    requestVisibleZones(visibleBounds, cachedZones, cameraPos, currentZoom) {
      const minI = Math.min(visibleBounds.minI, visibleBounds.maxI);
      const maxI = Math.max(visibleBounds.minI, visibleBounds.maxI);
      const minJ = Math.min(visibleBounds.minJ, visibleBounds.maxJ);
      const maxJ = Math.max(visibleBounds.minJ, visibleBounds.maxJ);
      const startZoneX = Math.floor(minJ / this.zoneSize) * this.zoneSize;
      const endZoneX = Math.ceil(maxJ / this.zoneSize) * this.zoneSize;
      const startZoneY = Math.floor(minI / this.zoneSize) * this.zoneSize;
      const endZoneY = Math.ceil(maxI / this.zoneSize) * this.zoneSize;
      const zonesToAdd = [];
      const now = Date.now();
      for (let zx = startZoneX; zx < endZoneX; zx += this.zoneSize) {
        for (let zy = startZoneY; zy < endZoneY; zy += this.zoneSize) {
          const key = `${zx},${zy}`;
          const cached = cachedZones.get(key);
          let needsLoad = false;
          if (!cached) {
            needsLoad = true;
          } else {
            const age = now - cached.lastLoadTime;
            const isStale = age > this.ZONE_EXPIRY_MS;
            if (cached.forceRefresh || isStale) {
              cachedZones.delete(key);
              needsLoad = true;
              if (isStale) {
                console.log(`[ZoneRequestManager] Zone ${key} is stale (${Math.floor(age / 1e3)}s old), reloading`);
              } else {
                console.log(`[ZoneRequestManager] Zone ${key} marked for force refresh, reloading`);
              }
            }
          }
          if (!needsLoad) {
            continue;
          }
          if (this.loadingZones.has(key)) {
            continue;
          }
          if (this.zoneQueue.some((z) => z.x === zx && z.y === zy)) {
            continue;
          }
          const centerX = zx + this.zoneSize / 2;
          const centerY = zy + this.zoneSize / 2;
          const distSq = (centerX - cameraPos.j) ** 2 + (centerY - cameraPos.i) ** 2;
          zonesToAdd.push({ x: zx, y: zy, priority: distSq });
        }
      }
      this.zoneQueue.push(...zonesToAdd);
      this.zoneQueue.sort((a, b) => a.priority - b.priority);
      if (currentZoom === 3 && !this.isMoving) {
        this.processQueue();
      }
    }
    /**
     * Process zone queue - send requests up to concurrent limit
     */
    processQueue() {
      this.cleanupTimedOutRequests();
      const currentLoading = this.loadingZones.size;
      const slotsAvailable = this.MAX_CONCURRENT - currentLoading;
      if (slotsAvailable <= 0 || this.zoneQueue.length === 0) {
        return;
      }
      const zonesToRequest = this.zoneQueue.splice(0, slotsAvailable);
      for (const zone of zonesToRequest) {
        const key = `${zone.x},${zone.y}`;
        this.loadingZones.set(key, Date.now());
        this.onLoadZone(zone.x, zone.y, this.zoneSize, this.zoneSize);
      }
    }
    /**
     * Mark zone as loaded (called when response arrives)
     */
    markZoneLoaded(x, y) {
      const alignedX = Math.floor(x / this.zoneSize) * this.zoneSize;
      const alignedY = Math.floor(y / this.zoneSize) * this.zoneSize;
      const key = `${alignedX},${alignedY}`;
      this.loadingZones.delete(key);
      if (this.zoneQueue.length > 0 && !this.isMoving) {
        this.processQueue();
      }
    }
    /**
     * Clean up requests that have timed out
     */
    cleanupTimedOutRequests() {
      const now = Date.now();
      const timedOut = [];
      this.loadingZones.forEach((timestamp, key) => {
        if (now - timestamp > this.REQUEST_TIMEOUT) {
          timedOut.push(key);
        }
      });
      timedOut.forEach((key) => {
        console.warn(`[ZoneRequestManager] Zone ${key} request timed out`);
        this.loadingZones.delete(key);
      });
    }
    /**
     * Clear all pending requests and queue
     */
    clear() {
      this.zoneQueue = [];
      this.loadingZones.clear();
      this.isMoving = false;
      if (this.movementStopTimer !== null) {
        clearTimeout(this.movementStopTimer);
        this.movementStopTimer = null;
      }
    }
    /**
     * Get current queue size (for debugging)
     */
    getQueueSize() {
      return this.zoneQueue.length;
    }
    /**
     * Get current loading count (for debugging)
     */
    getLoadingCount() {
      return this.loadingZones.size;
    }
  };
  var IsometricMapRenderer = class {
    constructor(canvasId) {
      // Game objects
      this.cachedZones = /* @__PURE__ */ new Map();
      this.allBuildings = [];
      this.allSegments = [];
      // Road tiles map for texture type detection
      this.roadTilesMap = /* @__PURE__ */ new Map();
      // Pre-computed concrete adjacency tiles (tiles within 1 tile of any building)
      this.concreteTilesSet = /* @__PURE__ */ new Set();
      // Pre-computed building occupation map — invalidated on zone change, reused across frame
      this.cachedOccupiedTiles = null;
      this.roadsRendering = null;
      this.roadBlockClassesLoaded = false;
      this.concreteBlockClassesLoaded = false;
      // Building dimensions cache
      this.facilityDimensionsCache = /* @__PURE__ */ new Map();
      // Mouse state
      this.isDragging = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;
      this.hoveredBuilding = null;
      this.mouseMapI = 0;
      this.mouseMapJ = 0;
      // Zone loading - managed by ZoneRequestManager
      this.zoneRequestManager = null;
      // Callbacks
      this.onLoadZone = null;
      this.onBuildingClick = null;
      this.onCancelPlacement = null;
      this.onFetchFacilityDimensions = null;
      this.onRoadSegmentComplete = null;
      this.onCancelRoadDrawing = null;
      // Zone overlay
      this.zoneOverlayEnabled = false;
      this.zoneOverlayData = null;
      this.zoneOverlayX1 = 0;
      this.zoneOverlayY1 = 0;
      // Placement preview
      this.placementPreview = null;
      this.placementMode = false;
      // Road drawing
      this.roadDrawingMode = false;
      this.roadDrawingState = {
        isDrawing: false,
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        isMouseDown: false,
        mouseDownTime: 0
      };
      this.roadCostPerTile = 2e6;
      // Map loaded flag
      this.mapLoaded = false;
      this.mapName = "";
      // Debug mode
      this.debugMode = false;
      this.debugShowTileInfo = true;
      this.debugShowBuildingInfo = true;
      this.debugShowConcreteInfo = true;
      this.debugShowRoadInfo = false;
      this.debugShowWaterGrid = false;
      // Debug: track why each concrete tile was added (building buffer / junction 3×3)
      this.debugConcreteSourceMap = /* @__PURE__ */ new Map();
      // Touch handler for mobile
      this.touchHandler = null;
      // Vegetation display control
      this.vegetationEnabled = true;
      this.hideVegetationOnMove = false;
      this.isCameraMoving = false;
      this.cameraStopTimer = null;
      this.CAMERA_STOP_DEBOUNCE_MS = 200;
      // Render debouncing (RAF-based, prevents redundant renders per frame)
      this.pendingRender = null;
      // Ground layer cache (OffscreenCanvas bakes terrain+veg+concrete+roads at Z2/Z3)
      this.groundCanvas = null;
      this.groundCtx = null;
      this.groundCacheValid = false;
      this.groundCacheZoom = -1;
      this.groundCacheRotation = 0 /* NORTH */;
      this.groundCacheOriginX = 0;
      this.groundCacheOriginY = 0;
      // Extra frustum culling padding during ground cache rebuild (extends viewport clip)
      this.cullingPadding = 0;
      // Vehicle animation system
      this.carClassManager = new CarClassManager();
      this.vehicleSystem = null;
      this.vehicleSystemReady = false;
      this.animationLoopRunning = false;
      this.lastRenderTime = 0;
      const canvas = document.getElementById(canvasId);
      if (!canvas) {
        throw new Error(`Canvas with id "${canvasId}" not found`);
      }
      this.canvas = canvas;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get 2D rendering context");
      }
      this.ctx = ctx;
      this.terrainRenderer = new IsometricTerrainRenderer(canvas, { disableMouseControls: true });
      this.vegetationMapper = new VegetationFlatMapper(2);
      this.terrainRenderer.setShowDebugInfo(false);
      this.terrainRenderer.setOnRenderNeeded(() => {
        this.groundCacheValid = false;
        this.requestRender();
      });
      this.gameObjectTextureCache = new GameObjectTextureCache();
      this.gameObjectTextureCache.setOnTextureLoaded((category, name) => {
        if (category === "BuildingImages" || category === "RoadBlockImages" || category === "ConcreteImages" || category === "CarImages") {
          this.requestRender();
        }
      });
      Promise.all([
        this.gameObjectTextureCache.loadObjectAtlas("road"),
        this.gameObjectTextureCache.loadObjectAtlas("concrete"),
        this.gameObjectTextureCache.loadObjectAtlas("car")
      ]).then(() => this.requestRender());
      this.roadBlockClassManager = new RoadBlockClassManager();
      this.roadBlockClassManager.setBasePath("/cache/");
      this.loadRoadBlockClasses();
      this.concreteBlockClassManager = new ConcreteBlockClassManager();
      this.concreteBlockClassManager.setBasePath("/cache/");
      this.loadConcreteBlockClasses();
      this.loadCarClasses();
      this.setupMouseControls();
      this.setupKeyboardControls();
      this.setupTouchControls();
      this.render();
    }
    /**
     * Setup keyboard controls for debug mode
     */
    setupKeyboardControls() {
      document.addEventListener("keydown", (e) => {
        if (e.key === "q" || e.key === "Q") {
          this.rotateCounterClockwise();
        }
        if (e.key === "e" || e.key === "E") {
          this.rotateClockwise();
        }
        if (e.key === "d" || e.key === "D") {
          this.debugMode = !this.debugMode;
          console.log(`[IsometricMapRenderer] Debug mode: ${this.debugMode ? "ON" : "OFF"}`);
          this.requestRender();
        }
        if (e.key === "1" && this.debugMode) {
          this.debugShowTileInfo = !this.debugShowTileInfo;
          this.requestRender();
        }
        if (e.key === "2" && this.debugMode) {
          this.debugShowBuildingInfo = !this.debugShowBuildingInfo;
          this.requestRender();
        }
        if (e.key === "3" && this.debugMode) {
          this.debugShowConcreteInfo = !this.debugShowConcreteInfo;
          this.requestRender();
        }
        if (e.key === "4" && this.debugMode) {
          this.debugShowWaterGrid = !this.debugShowWaterGrid;
          this.requestRender();
        }
        if (e.key === "5" && this.debugMode) {
          this.debugShowRoadInfo = !this.debugShowRoadInfo;
          this.requestRender();
        }
      });
    }
    /**
     * Rotate view clockwise (Q: NORTH→EAST→SOUTH→WEST→NORTH)
     */
    rotateClockwise() {
      const current = this.terrainRenderer.getRotation();
      const next = (current + 1) % 4;
      this.terrainRenderer.setRotation(next);
      this.markCameraMoving();
      if (this.vehicleSystem) this.vehicleSystem.clear();
      if (this.zoneRequestManager) {
        const currentZoom = this.terrainRenderer.getZoomLevel();
        this.zoneRequestManager.markMoving();
        this.zoneRequestManager.markStopped(currentZoom);
      }
      this.checkVisibleZones();
      console.log(`[IsometricMapRenderer] Rotation: ${Rotation[next]}`);
      this.requestRender();
    }
    /**
     * Rotate view counter-clockwise (E: NORTH→WEST→SOUTH→EAST→NORTH)
     */
    rotateCounterClockwise() {
      const current = this.terrainRenderer.getRotation();
      const next = (current + 3) % 4;
      this.terrainRenderer.setRotation(next);
      this.markCameraMoving();
      if (this.vehicleSystem) this.vehicleSystem.clear();
      if (this.zoneRequestManager) {
        const currentZoom = this.terrainRenderer.getZoomLevel();
        this.zoneRequestManager.markMoving();
        this.zoneRequestManager.markStopped(currentZoom);
      }
      this.checkVisibleZones();
      console.log(`[IsometricMapRenderer] Rotation: ${Rotation[next]}`);
      this.requestRender();
    }
    /**
     * Setup touch controls for mobile (pan, pinch-zoom, rotation snap, double-tap)
     */
    setupTouchControls() {
      this.touchHandler = new TouchHandler2D(this.canvas, {
        onPan: (dx, dy) => {
          const config2 = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
          const u = config2.u;
          const mapDeltaI = (dy / u + dx / (2 * u)) * 0.5;
          const mapDeltaJ = (dy / u - dx / (2 * u)) * 0.5;
          this.terrainRenderer.pan(mapDeltaI, -mapDeltaJ);
          this.markCameraMoving();
          if (this.zoneRequestManager) {
            this.zoneRequestManager.markMoving();
          }
          this.requestRender();
        },
        onPanEnd: () => {
          if (this.zoneRequestManager) {
            const currentZoom = this.terrainRenderer.getZoomLevel();
            this.zoneRequestManager.markStopped(currentZoom);
          }
          this.checkVisibleZones();
        },
        onZoom: (delta) => {
          const current = this.terrainRenderer.getZoomLevel();
          const newZoom = current + delta;
          this.terrainRenderer.setZoomLevel(newZoom);
          this.terrainRenderer.clearDistantZoomCaches(newZoom);
          if (current >= 2 && newZoom < 2 && this.vehicleSystem) {
            this.vehicleSystem.clear();
            this.animationLoopRunning = false;
          }
          if (current < 2 && newZoom >= 2) {
            this.startAnimationLoop();
          }
          if (this.zoneRequestManager) {
            this.zoneRequestManager.markMoving();
            this.zoneRequestManager.markStopped(newZoom);
          }
          this.checkVisibleZones();
          this.requestRender();
        },
        onRotate: (direction) => {
          if (direction === "cw") {
            this.rotateClockwise();
          } else {
            this.rotateCounterClockwise();
          }
        },
        onDoubleTap: (x, y) => {
          const mapPos = this.terrainRenderer.screenToMap(x, y);
          this.terrainRenderer.centerOn(mapPos.x, mapPos.y);
          this.requestRender();
        }
      });
    }
    // =========================================================================
    // MAP LOADING
    // =========================================================================
    /**
     * Load terrain for a map
     */
    async loadMap(mapName) {
      this.mapName = mapName;
      const terrainData = await this.terrainRenderer.loadMap(mapName);
      this.mapLoaded = true;
      this.cachedZones.clear();
      if (this.zoneRequestManager) {
        this.zoneRequestManager.clear();
      }
      this.allBuildings = [];
      this.allSegments = [];
      this.render();
      return terrainData;
    }
    /**
     * Check if map is loaded
     */
    isLoaded() {
      return this.mapLoaded && this.terrainRenderer.isLoaded();
    }
    /**
     * Load road block class configurations from the server
     */
    async loadRoadBlockClasses() {
      try {
        const response = await fetch("/api/road-block-classes");
        if (!response.ok) {
          console.error("[IsometricMapRenderer] Failed to load road block classes:", response.status);
          return;
        }
        const data = await response.json();
        const files = data.files || [];
        console.log(`[IsometricMapRenderer] Loading ${files.length} road block classes...`);
        for (const file of files) {
          this.roadBlockClassManager.loadFromIni(file.content);
        }
        this.roadBlockClassesLoaded = true;
        console.log(`[IsometricMapRenderer] Road block classes loaded successfully`);
        this.requestRender();
      } catch (error) {
        console.error("[IsometricMapRenderer] Error loading road block classes:", error);
      }
    }
    /**
     * Load concrete block class configurations from the server
     */
    async loadConcreteBlockClasses() {
      try {
        const response = await fetch("/api/concrete-block-classes");
        if (!response.ok) {
          console.error("[IsometricMapRenderer] Failed to load concrete block classes:", response.status);
          return;
        }
        const data = await response.json();
        const files = data.files || [];
        console.log(`[IsometricMapRenderer] Loading ${files.length} concrete block classes...`);
        for (const file of files) {
          const config2 = loadConcreteBlockClassFromIni(file.content);
          console.log(`[ConcreteINI] ${file.filename}: ID=${config2.id} (0x${config2.id.toString(16)}) -> ${config2.imagePath}`);
          this.concreteBlockClassManager.loadFromIni(file.content);
        }
        this.concreteBlockClassesLoaded = true;
        console.log(`[IsometricMapRenderer] Concrete block classes loaded successfully (${this.concreteBlockClassManager.getClassCount()} classes)`);
        const platformIds = [128, 129, 130, 131, 132, 133, 134, 135, 136];
        console.log("[ConcreteDebug] === PLATFORM ID CHECK ===");
        for (const id of platformIds) {
          const hasClass = this.concreteBlockClassManager.hasClass(id);
          const filename = this.concreteBlockClassManager.getImageFilename(id);
          console.log(`[ConcreteDebug] Platform ID 0x${id.toString(16)} (${id}): loaded=${hasClass}, texture=${filename}`);
        }
        const allIds = this.concreteBlockClassManager.getAllIds();
        console.log(`[ConcreteDebug] All ${allIds.length} loaded IDs:`, allIds.map((id) => `0x${id.toString(16)}(${id})`).join(", "));
        this.requestRender();
      } catch (error) {
        console.error("[IsometricMapRenderer] Error loading concrete block classes:", error);
      }
    }
    /**
     * Load car class configurations from the server and initialize the vehicle animation system
     */
    async loadCarClasses() {
      try {
        const response = await fetch("/api/car-classes");
        if (!response.ok) {
          console.error("[IsometricMapRenderer] Failed to load car classes:", response.status);
          return;
        }
        const data = await response.json();
        const files = data.files || [];
        console.log(`[IsometricMapRenderer] Loading ${files.length} car classes...`);
        for (const file of files) {
          this.carClassManager.loadFromIni(file.content);
        }
        console.log(`[IsometricMapRenderer] Car classes loaded: ${this.carClassManager.getClassCount()} classes`);
        this.vehicleSystem = new VehicleAnimationSystem();
        this.vehicleSystem.setCarClassManager(this.carClassManager);
        this.vehicleSystem.setRoadBlockClassManager(this.roadBlockClassManager);
        this.vehicleSystem.setGameObjectTextureCache(this.gameObjectTextureCache);
        this.vehicleSystemReady = true;
      } catch (error) {
        console.error("[IsometricMapRenderer] Error loading car classes:", error);
      }
    }
    /**
     * Start the continuous animation loop for vehicles.
     * Only runs when vehicles are active (Z2/Z3 + vehicles exist).
     */
    startAnimationLoop() {
      if (this.animationLoopRunning) return;
      this.animationLoopRunning = true;
      this.lastRenderTime = performance.now();
      const loop = () => {
        if (!this.animationLoopRunning) return;
        const zoom = this.terrainRenderer.getZoomLevel();
        if (zoom >= 2 && this.vehicleSystemReady && this.vehicleSystem) {
          this.requestRender();
          requestAnimationFrame(loop);
        } else {
          this.animationLoopRunning = false;
        }
      };
      requestAnimationFrame(loop);
    }
    /**
     * Draw animated vehicles on roads (layer between buildings and zone overlay).
     * Active only at Z2 and Z3 zoom levels.
     */
    drawVehicles(bounds, deltaTime, occupiedTiles) {
      const zoom = this.terrainRenderer.getZoomLevel();
      if (zoom < 2) return;
      if (!this.vehicleSystemReady || !this.vehicleSystem) return;
      this.vehicleSystem.setRoadData(
        this.roadTilesMap,
        this.roadsRendering,
        (col, row) => {
          const terrainLoader = this.terrainRenderer.getTerrainLoader();
          return terrainLoader.getLandId(col, row);
        },
        (col, row) => this.hasConcrete(col, row)
      );
      this.vehicleSystem.setBuildingTiles(occupiedTiles);
      this.vehicleSystem.setPaused(this.isCameraMoving);
      this.vehicleSystem.update(deltaTime, bounds);
      const config2 = ZOOM_LEVELS[zoom];
      this.vehicleSystem.render(
        this.ctx,
        (i, j) => this.terrainRenderer.mapToScreen(i, j),
        config2,
        this.canvas.width,
        this.canvas.height,
        (col, row) => this.isOnWaterPlatform(col, row)
      );
      if (this.vehicleSystem.isActive() || this.vehicleSystem.getVehicleCount() === 0) {
        this.startAnimationLoop();
      }
    }
    // =========================================================================
    // ZONE MANAGEMENT
    // =========================================================================
    /**
     * Add a cached zone with buildings and segments
     * Note: Cache key is aligned to zone grid (64-tile boundaries) for consistency
     */
    addCachedZone(x, y, w, h, buildings, segments) {
      const zoneSize = 64;
      const alignedX = Math.floor(x / zoneSize) * zoneSize;
      const alignedY = Math.floor(y / zoneSize) * zoneSize;
      const key = `${alignedX},${alignedY}`;
      const existing = this.cachedZones.get(key);
      const segmentsChanged = !existing || existing.segments.length !== segments.length || existing.buildings.length !== buildings.length;
      this.cachedZones.set(key, {
        x: alignedX,
        y: alignedY,
        w,
        h,
        buildings,
        segments,
        lastLoadTime: Date.now(),
        forceRefresh: false
      });
      if (this.zoneRequestManager) {
        this.zoneRequestManager.markZoneLoaded(alignedX, alignedY);
      }
      this.rebuildAggregatedData();
      this.fetchDimensionsForBuildings(buildings);
      if (segmentsChanged) {
        this.invalidateGroundCache();
      }
      this.requestRender();
    }
    /**
     * Rebuild all buildings and segments from cached zones
     */
    rebuildAggregatedData() {
      this.allBuildings = [];
      this.allSegments = [];
      this.roadTilesMap.clear();
      this.cachedOccupiedTiles = null;
      this.cachedZones.forEach((zone) => {
        this.allBuildings.push(...zone.buildings);
        this.allSegments.push(...zone.segments);
      });
      this.allSegments.forEach((seg) => {
        const minX = Math.min(seg.x1, seg.x2);
        const maxX = Math.max(seg.x1, seg.x2);
        const minY = Math.min(seg.y1, seg.y2);
        const maxY = Math.max(seg.y1, seg.y2);
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            this.roadTilesMap.set(`${x},${y}`, true);
          }
        }
      });
      this.rebuildRoadsRendering();
      this.concreteTilesSet.clear();
      this.debugConcreteSourceMap.clear();
      const terrainLoaderForConcrete = this.terrainRenderer.getTerrainLoader();
      for (const building of this.allBuildings) {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const bw = dims?.xsize || 1;
        const bh = dims?.ysize || 1;
        for (let y = building.y - 1; y < building.y + bh + 1; y++) {
          for (let x = building.x - 1; x < building.x + bw + 1; x++) {
            if (terrainLoaderForConcrete) {
              const landId = terrainLoaderForConcrete.getLandId(x, y);
              if (!canReceiveConcrete(landId)) continue;
            }
            const key = `${x},${y}`;
            this.concreteTilesSet.add(key);
            this.debugConcreteSourceMap.set(key, "building");
          }
        }
      }
      this.addWaterRoadJunctionConcrete(terrainLoaderForConcrete);
      this.vegetationMapper.updateDynamicContent(
        this.allBuildings,
        this.allSegments,
        this.facilityDimensionsCache
      );
    }
    /**
     * Rebuild the RoadsRendering buffer from all segments
     * This computes the topology (shape) of each road tile
     */
    rebuildRoadsRendering() {
      if (this.allSegments.length === 0) {
        this.roadsRendering = null;
        return;
      }
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      for (const seg of this.allSegments) {
        minX = Math.min(minX, seg.x1, seg.x2);
        maxX = Math.max(maxX, seg.x1, seg.x2);
        minY = Math.min(minY, seg.y1, seg.y2);
        maxY = Math.max(maxY, seg.y1, seg.y2);
      }
      const padding = 1;
      const left = minX - padding;
      const top = minY - padding;
      const width = maxX - minX + 1 + 2 * padding;
      const height = maxY - minY + 1 + 2 * padding;
      this.roadsRendering = new RoadsRendering(top, left, width, height);
      for (const seg of this.allSegments) {
        renderRoadSegment(this.roadsRendering, {
          x1: seg.x1,
          y1: seg.y1,
          x2: seg.x2,
          y2: seg.y2
        });
      }
    }
    /**
     * Check if a road tile exists at the given coordinates
     */
    hasRoadAt(x, y) {
      return this.roadTilesMap.has(`${x},${y}`);
    }
    /**
     * Check if a tile is adjacent to an existing road (including diagonal adjacency)
     * Returns true if any of the 8 surrounding tiles has a road
     */
    isAdjacentToRoad(x, y) {
      const neighbors = [
        { x: x - 1, y },
        // West
        { x: x + 1, y },
        // East
        { x, y: y - 1 },
        // North
        { x, y: y + 1 },
        // South
        { x: x - 1, y: y - 1 },
        // NW
        { x: x + 1, y: y - 1 },
        // NE
        { x: x - 1, y: y + 1 },
        // SW
        { x: x + 1, y: y + 1 }
        // SE
      ];
      return neighbors.some((n) => this.hasRoadAt(n.x, n.y));
    }
    /**
     * Check if a road path connects to existing roads
     * Returns true if:
     * - Any tile of the path is adjacent to an existing road, OR
     * - No roads exist yet (first road on map)
     */
    checkRoadPathConnectsToExisting(pathTiles) {
      if (this.roadTilesMap.size === 0) {
        return true;
      }
      for (const tile of pathTiles) {
        if (this.isAdjacentToRoad(tile.x, tile.y)) {
          return true;
        }
        if (this.hasRoadAt(tile.x, tile.y)) {
          return true;
        }
      }
      return false;
    }
    /**
     * Get the number of existing road tiles (for checking if any roads exist)
     */
    getRoadTileCount() {
      return this.roadTilesMap.size;
    }
    /**
     * Fetch facility dimensions for buildings and preload their textures
     */
    async fetchDimensionsForBuildings(buildings) {
      if (!this.onFetchFacilityDimensions) return;
      const uniqueClasses = /* @__PURE__ */ new Set();
      buildings.forEach((b) => {
        if (!this.facilityDimensionsCache.has(b.visualClass)) {
          uniqueClasses.add(b.visualClass);
        }
      });
      for (const visualClass of uniqueClasses) {
        const dims = await this.onFetchFacilityDimensions(visualClass);
        if (dims) {
          this.facilityDimensionsCache.set(visualClass, dims);
        }
      }
      this.cachedOccupiedTiles = null;
      this.rebuildConcreteSet();
      this.preloadBuildingTextures(buildings);
      this.requestRender();
    }
    /**
     * Rebuild the pre-computed concrete adjacency set from all buildings.
     * Called when building dimensions change (after fetching from server).
     */
    rebuildConcreteSet() {
      this.concreteTilesSet.clear();
      this.debugConcreteSourceMap.clear();
      const terrainLoader = this.terrainRenderer.getTerrainLoader();
      for (const building of this.allBuildings) {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const bw = dims?.xsize || 1;
        const bh = dims?.ysize || 1;
        for (let y = building.y - 1; y < building.y + bh + 1; y++) {
          for (let x = building.x - 1; x < building.x + bw + 1; x++) {
            if (terrainLoader) {
              const landId = terrainLoader.getLandId(x, y);
              if (!canReceiveConcrete(landId)) continue;
            }
            const key = `${x},${y}`;
            this.concreteTilesSet.add(key);
            this.debugConcreteSourceMap.set(key, "building");
          }
        }
      }
      this.addWaterRoadJunctionConcrete(terrainLoader);
    }
    /**
     * Add concrete platforms around road junctions on water.
     *
     * Bridge textures only support straight segments (NS/WE roads and their start/end caps).
     * Corners, T-intersections, and crossroads CANNOT use bridge textures — they need
     * a concrete platform with regular urban road textures.
     *
     * For each junction tile on water, add a 3×3 concrete area:
     * - The junction tile itself
     * - All 8 neighbors (includes connected road tiles at +1 AND border tiles)
     * Roads at +2 and beyond remain bridges (outside the 3×3).
     */
    addWaterRoadJunctionConcrete(terrainLoader) {
      if (!this.roadsRendering || !terrainLoader) return;
      for (const [key] of this.roadTilesMap) {
        const [xStr, yStr] = key.split(",");
        const x = parseInt(xStr, 10);
        const y = parseInt(yStr, 10);
        const topology = this.roadsRendering.get(y, x);
        if (topology === 0 /* None */) continue;
        if (!isJunctionTopology(topology)) continue;
        const landId = terrainLoader.getLandId(x, y);
        if (!isWater(landId)) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            const nLandId = terrainLoader.getLandId(nx, ny);
            if (canReceiveConcrete(nLandId)) {
              const nKey = `${nx},${ny}`;
              this.concreteTilesSet.add(nKey);
              if (!this.debugConcreteSourceMap.has(nKey)) {
                this.debugConcreteSourceMap.set(nKey, "junction");
              }
            }
          }
        }
      }
    }
    /**
     * Preload building textures for faster rendering
     */
    preloadBuildingTextures(buildings) {
      const uniqueClasses = /* @__PURE__ */ new Set();
      buildings.forEach((b) => uniqueClasses.add(b.visualClass));
      const textureFilenames = Array.from(uniqueClasses).map(
        (visualClass) => GameObjectTextureCache.getBuildingTextureFilename(visualClass)
      );
      this.gameObjectTextureCache.preload("BuildingImages", textureFilenames);
    }
    /**
     * Update map data with buildings and road segments for a zone
     */
    updateMapData(mapData) {
      this.addCachedZone(mapData.x, mapData.y, mapData.w, mapData.h, mapData.buildings, mapData.segments);
    }
    /**
     * Invalidate a specific zone, forcing it to reload on next visibility check
     * Use this when the server notifies that a specific area has changed
     */
    invalidateZone(x, y) {
      const zoneSize = 64;
      const alignedX = Math.floor(x / zoneSize) * zoneSize;
      const alignedY = Math.floor(y / zoneSize) * zoneSize;
      const key = `${alignedX},${alignedY}`;
      const cached = this.cachedZones.get(key);
      if (cached) {
        cached.forceRefresh = true;
        console.log(`[IsometricMapRenderer] Zone ${key} marked for refresh`);
      }
    }
    /**
     * Invalidate all cached zones, forcing full reload
     * Use this when reconnecting or after major game state changes
     */
    invalidateAllZones() {
      let count = 0;
      this.cachedZones.forEach((zone) => {
        zone.forceRefresh = true;
        count++;
      });
      console.log(`[IsometricMapRenderer] Marked ${count} zones for refresh`);
    }
    /**
     * Invalidate zones within a rectangular area
     * Use this when the server notifies that a region has changed
     */
    invalidateArea(x1, y1, x2, y2) {
      const zoneSize = 64;
      const startX = Math.floor(Math.min(x1, x2) / zoneSize) * zoneSize;
      const endX = Math.ceil(Math.max(x1, x2) / zoneSize) * zoneSize;
      const startY = Math.floor(Math.min(y1, y2) / zoneSize) * zoneSize;
      const endY = Math.ceil(Math.max(y1, y2) / zoneSize) * zoneSize;
      let count = 0;
      for (let x = startX; x < endX; x += zoneSize) {
        for (let y = startY; y < endY; y += zoneSize) {
          const key = `${x},${y}`;
          const cached = this.cachedZones.get(key);
          if (cached) {
            cached.forceRefresh = true;
            count++;
          }
        }
      }
      console.log(`[IsometricMapRenderer] Marked ${count} zones in area for refresh`);
    }
    // =========================================================================
    // CALLBACKS
    // =========================================================================
    setLoadZoneCallback(callback) {
      this.onLoadZone = callback;
      this.zoneRequestManager = new ZoneRequestManager(callback, 64);
    }
    /**
     * Manually trigger zone checking (useful after callbacks are set up)
     */
    triggerZoneCheck() {
      this.checkVisibleZones();
    }
    setBuildingClickCallback(callback) {
      this.onBuildingClick = callback;
    }
    setCancelPlacementCallback(callback) {
      this.onCancelPlacement = callback;
    }
    setFetchFacilityDimensionsCallback(callback) {
      this.onFetchFacilityDimensions = callback;
    }
    setRoadSegmentCompleteCallback(callback) {
      this.onRoadSegmentComplete = callback;
    }
    setCancelRoadDrawingCallback(callback) {
      this.onCancelRoadDrawing = callback;
    }
    // =========================================================================
    // CAMERA CONTROL
    // =========================================================================
    /**
     * Center camera on specific coordinates (in original map coordinates x, y)
     */
    centerOn(x, y) {
      this.terrainRenderer.centerOn(y, x);
      this.checkVisibleZones();
    }
    /**
     * Get current camera position
     */
    getCameraPosition() {
      const pos = this.terrainRenderer.getCameraPosition();
      return { x: pos.j, y: pos.i };
    }
    /**
     * Set zoom level (0-3)
     */
    setZoom(level) {
      const previousZoom = this.terrainRenderer.getZoomLevel();
      this.terrainRenderer.setZoomLevel(level);
      this.terrainRenderer.clearDistantZoomCaches(level);
      if (previousZoom >= 2 && level < 2 && this.vehicleSystem) {
        this.vehicleSystem.clear();
        this.animationLoopRunning = false;
      }
      if (previousZoom < 2 && level >= 2) {
        this.startAnimationLoop();
      }
      this.checkVisibleZones();
      this.requestRender();
    }
    /**
     * Get current zoom level
     */
    getZoom() {
      return this.terrainRenderer.getZoomLevel();
    }
    /**
     * Set terrain season from server WorldSeason property
     */
    setSeason(season) {
      this.terrainRenderer.setSeason(season);
      this.requestRender();
    }
    // =========================================================================
    // ZONE OVERLAY
    // =========================================================================
    setZoneOverlay(enabled, data, x1, y1) {
      this.zoneOverlayEnabled = enabled;
      if (data) {
        this.zoneOverlayData = data;
        this.zoneOverlayX1 = x1 || 0;
        this.zoneOverlayY1 = y1 || 0;
      }
      this.requestRender();
    }
    // =========================================================================
    // PLACEMENT MODE
    // =========================================================================
    setPlacementMode(enabled, buildingName = "", cost = 0, area = 0, zoneRequirement = "", xsize = 1, ysize = 1) {
      this.placementMode = enabled;
      if (enabled && buildingName) {
        this.placementPreview = {
          i: this.mouseMapI,
          j: this.mouseMapJ,
          buildingName,
          cost,
          area,
          zoneRequirement,
          xsize,
          ysize
        };
        this.canvas.style.cursor = "crosshair";
      } else {
        this.placementPreview = null;
        this.canvas.style.cursor = "grab";
      }
      this.requestRender();
    }
    getPlacementCoordinates() {
      if (!this.placementPreview) return null;
      return { x: this.placementPreview.j, y: this.placementPreview.i };
    }
    // =========================================================================
    // ROAD DRAWING MODE
    // =========================================================================
    setRoadDrawingMode(enabled) {
      this.roadDrawingMode = enabled;
      this.roadDrawingState = {
        isDrawing: false,
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        isMouseDown: false,
        mouseDownTime: 0
      };
      this.canvas.style.cursor = enabled ? "crosshair" : "grab";
      this.requestRender();
    }
    isRoadDrawingModeActive() {
      return this.roadDrawingMode;
    }
    setOnRoadSegmentComplete(callback) {
      this.onRoadSegmentComplete = callback;
    }
    setOnRoadDrawingCancel(callback) {
      this.onCancelRoadDrawing = callback;
    }
    /**
     * Validate if a road can be built between two points
     * Returns an object with valid flag and optional error message
     */
    validateRoadPath(x1, y1, x2, y2) {
      const pathTiles = this.generateStaircasePath(x1, y1, x2, y2);
      for (const tile of pathTiles) {
        for (const building of this.allBuildings) {
          const dims = this.facilityDimensionsCache.get(building.visualClass);
          const bw = dims?.xsize || 1;
          const bh = dims?.ysize || 1;
          if (tile.x >= building.x && tile.x < building.x + bw && tile.y >= building.y && tile.y < building.y + bh) {
            return { valid: false, error: "Road blocked by building" };
          }
        }
      }
      if (!this.checkRoadPathConnectsToExisting(pathTiles)) {
        return { valid: false, error: "Road must connect to existing road network" };
      }
      return { valid: true };
    }
    // =========================================================================
    // GROUND LAYER CACHE
    // =========================================================================
    /**
     * Get zoom-dependent ground margin (pixels of overscan around viewport).
     * Larger margins = fewer rebuilds during pan, at the cost of more memory.
     */
    getGroundMargin() {
      const zoom = this.terrainRenderer.getZoomLevel();
      if (zoom >= 3) return 512;
      if (zoom >= 2) return 768;
      return 1024;
    }
    /**
     * Mark the ground cache as needing rebuild on next render.
     */
    invalidateGroundCache() {
      this.groundCacheValid = false;
    }
    /**
     * Create or resize the ground cache OffscreenCanvas to match viewport + margins.
     */
    ensureGroundCanvas() {
      const margin = this.getGroundMargin();
      const w = this.canvas.width + 2 * margin;
      const h = this.canvas.height + 2 * margin;
      if (!this.groundCanvas || this.groundCanvas.width !== w || this.groundCanvas.height !== h) {
        this.groundCanvas = new OffscreenCanvas(w, h);
        this.groundCtx = this.groundCanvas.getContext("2d");
        this.groundCacheValid = false;
      }
    }
    /**
     * Check if the ground cache can be reused (same zoom/rotation, pan within margin).
     */
    canReuseGroundCache() {
      if (!this.groundCacheValid || !this.groundCanvas) return false;
      const zoom = this.terrainRenderer.getZoomLevel();
      const rotation = this.terrainRenderer.getRotation();
      if (zoom !== this.groundCacheZoom || rotation !== this.groundCacheRotation) return false;
      const margin = this.getGroundMargin();
      const origin = this.terrainRenderer.getOrigin();
      const dx = Math.abs(origin.x - this.groundCacheOriginX);
      const dy = Math.abs(origin.y - this.groundCacheOriginY);
      return dx < margin && dy < margin;
    }
    /**
     * Get extended tile bounds that include the ground cache margin area.
     * Used during ground cache rebuild to render tiles beyond the viewport.
     */
    getExtendedBounds(margin) {
      const origin = this.terrainRenderer.getOrigin();
      const zoom = this.terrainRenderer.getZoomLevel();
      const rotation = this.terrainRenderer.getRotation();
      const extViewport = {
        x: -margin,
        y: -margin,
        width: this.canvas.width + 2 * margin,
        height: this.canvas.height + 2 * margin
      };
      return this.terrainRenderer.getCoordinateMapper().getVisibleBounds(
        extViewport,
        zoom,
        rotation,
        origin
      );
    }
    /**
     * Rebuild the ground cache: render terrain + vegetation + concrete + roads
     * to an OffscreenCanvas sized viewport + 2*margin.
     * Uses ctx-swap technique so draw methods render to the cache instead of main canvas.
     */
    rebuildGroundCache() {
      this.ensureGroundCanvas();
      if (!this.groundCtx) return;
      const margin = this.getGroundMargin();
      const origin = this.terrainRenderer.getOrigin();
      const zoom = this.terrainRenderer.getZoomLevel();
      const rotation = this.terrainRenderer.getRotation();
      const chunkCache = this.terrainRenderer.getChunkCache();
      this.groundCtx.clearRect(0, 0, this.groundCanvas.width, this.groundCanvas.height);
      if (chunkCache) {
        const extBounds2 = this.getExtendedBounds(margin);
        const visibleChunks = chunkCache.getVisibleChunksFromBounds(extBounds2);
        this.groundCtx.imageSmoothingEnabled = false;
        this.groundCtx.save();
        this.groundCtx.translate(margin, margin);
        for (let ci = visibleChunks.minChunkI; ci <= visibleChunks.maxChunkI; ci++) {
          for (let cj = visibleChunks.minChunkJ; cj <= visibleChunks.maxChunkJ; cj++) {
            chunkCache.drawChunkIfReady(
              this.groundCtx,
              ci,
              cj,
              zoom,
              origin
            );
          }
        }
        this.groundCtx.restore();
      }
      const savedCtx = this.ctx;
      this.ctx = this.groundCtx;
      this.ctx.save();
      this.ctx.translate(margin, margin);
      this.cullingPadding = margin;
      const extBounds = this.getExtendedBounds(margin);
      const occupiedTiles = this.buildTileOccupationMap();
      this.drawVegetation(extBounds);
      this.drawConcrete(extBounds);
      this.drawRoads(extBounds, occupiedTiles);
      this.ctx.restore();
      this.cullingPadding = 0;
      this.ctx = savedCtx;
      this.groundCacheValid = true;
      this.groundCacheZoom = zoom;
      this.groundCacheRotation = rotation;
      this.groundCacheOriginX = origin.x;
      this.groundCacheOriginY = origin.y;
    }
    /**
     * Blit the ground cache to the main canvas at the current pan offset.
     * Fast path: one drawImage call instead of rendering thousands of tiles.
     */
    blitGroundCache() {
      if (!this.groundCanvas || !this.groundCacheValid) return;
      const margin = this.getGroundMargin();
      const origin = this.terrainRenderer.getOrigin();
      const dx = origin.x - this.groundCacheOriginX;
      const dy = origin.y - this.groundCacheOriginY;
      const srcX = margin + dx;
      const srcY = margin + dy;
      this.ctx.drawImage(
        this.groundCanvas,
        srcX,
        srcY,
        this.canvas.width,
        this.canvas.height,
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );
    }
    // =========================================================================
    // RENDERING
    // =========================================================================
    /**
     * Schedule a render on the next animation frame (debounced).
     * Multiple calls within the same frame are coalesced into one render.
     * Use this for event-driven updates (mouse move, texture loaded, chunk ready).
     */
    requestRender() {
      if (this.pendingRender !== null) return;
      this.pendingRender = requestAnimationFrame(() => {
        this.pendingRender = null;
        this.render();
      });
    }
    /**
     * Main render loop
     */
    render() {
      const now = performance.now();
      const deltaTime = this.lastRenderTime > 0 ? (now - this.lastRenderTime) / 1e3 : 0;
      this.lastRenderTime = now;
      const zoom = this.terrainRenderer.getZoomLevel();
      if (zoom >= 1) {
        this.terrainRenderer.render();
        const canReuse = this.canReuseGroundCache();
        if (canReuse) {
          this.ctx.fillStyle = "#0a0a0f";
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          this.blitGroundCache();
        } else {
          this.rebuildGroundCache();
          this.ctx.fillStyle = "#0a0a0f";
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          this.blitGroundCache();
        }
      } else {
        this.terrainRenderer.render();
      }
      if (!this.mapLoaded) return;
      const bounds = this.getVisibleBounds();
      const occupiedTiles = this.buildTileOccupationMap();
      this.drawBuildings(bounds);
      this.drawVehicles(bounds, deltaTime, occupiedTiles);
      this.drawZoneOverlay(bounds);
      this.drawPlacementPreview();
      this.drawRoadDrawingPreview();
      if (this.debugMode) {
        this.drawDebugOverlay(bounds);
      }
      this.drawGameInfo();
    }
    /**
     * Get visible tile bounds
     */
    getVisibleBounds() {
      const viewport = {
        x: 0,
        y: 0,
        width: this.canvas.width,
        height: this.canvas.height
      };
      const origin = this.terrainRenderer.getOrigin();
      return this.terrainRenderer.getCoordinateMapper().getVisibleBounds(
        viewport,
        this.terrainRenderer.getZoomLevel(),
        this.terrainRenderer.getRotation(),
        origin
      );
    }
    /**
     * Build occupied tiles map (buildings have priority over roads).
     * Cached and reused across frame — invalidated when zones change.
     */
    buildTileOccupationMap() {
      if (this.cachedOccupiedTiles) return this.cachedOccupiedTiles;
      const occupied = /* @__PURE__ */ new Set();
      for (const building of this.allBuildings) {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const xsize = dims?.xsize || 1;
        const ysize = dims?.ysize || 1;
        for (let dy = 0; dy < ysize; dy++) {
          for (let dx = 0; dx < xsize; dx++) {
            occupied.add(`${building.x + dx},${building.y + dy}`);
          }
        }
      }
      this.cachedOccupiedTiles = occupied;
      return occupied;
    }
    /**
     * Check if a tile has concrete (building adjacency approach)
     * Uses pre-computed Set for O(1) lookup instead of scanning all buildings
     */
    hasConcrete(x, y) {
      return this.concreteTilesSet.has(`${x},${y}`);
    }
    /**
     * Check if a tile is on a water platform (has concrete AND is on water).
     * Used for applying platform Y-shift to concrete, roads, and buildings.
     */
    isOnWaterPlatform(x, y) {
      if (!this.hasConcrete(x, y)) return false;
      const terrainLoader = this.terrainRenderer.getTerrainLoader();
      if (!terrainLoader) return false;
      return isWater(terrainLoader.getLandId(x, y));
    }
    /**
     * Check if a building occupies a specific tile.
     * Uses pre-computed occupation map for O(1) lookup.
     */
    isTileOccupiedByBuilding(x, y) {
      return this.buildTileOccupationMap().has(`${x},${y}`);
    }
    /**
     * Get building at a specific tile position
     * Returns the building object if found, undefined otherwise
     */
    getBuildingAtTile(x, y) {
      for (const building of this.allBuildings) {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const bw = dims?.xsize || 1;
        const bh = dims?.ysize || 1;
        if (x >= building.x && x < building.x + bw && y >= building.y && y < building.y + bh) {
          return building;
        }
      }
      return void 0;
    }
    /**
     * Draw concrete tiles around buildings
     * Concrete appears on tiles adjacent to buildings to create paved areas
     */
    drawConcrete(bounds) {
      if (!this.concreteBlockClassesLoaded) return;
      if (this.terrainRenderer.getZoomLevel() <= 1) return;
      const ctx = this.ctx;
      const config2 = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
      const terrainLoader = this.terrainRenderer.getTerrainLoader();
      const mapData = {
        getLandId: (row, col) => {
          if (!terrainLoader) return 0;
          return terrainLoader.getLandId(col, row);
        },
        hasConcrete: (row, col) => this.hasConcrete(col, row),
        hasRoad: (row, col) => this.roadTilesMap.has(`${col},${row}`),
        hasBuilding: (row, col) => this.isTileOccupiedByBuilding(col, row)
      };
      const concreteTiles = [];
      for (let i = bounds.minI; i <= bounds.maxI; i++) {
        for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
          if (!mapData.hasConcrete(i, j)) continue;
          const concreteId = getConcreteId(i, j, mapData);
          if (concreteId === CONCRETE_NONE) continue;
          const screenPos = this.terrainRenderer.mapToScreen(i, j);
          concreteTiles.push({
            i,
            j,
            concreteId,
            screenX: screenPos.x,
            screenY: screenPos.y
          });
        }
      }
      concreteTiles.sort(painterSort);
      const scaleFactor = config2.tileWidth / 64;
      const debugBoxes = [];
      const collectDebug = this.debugMode && this.debugShowWaterGrid;
      for (const tile of concreteTiles) {
        const isWaterPlatform = (tile.concreteId & 128) !== 0;
        const filename = this.concreteBlockClassManager.getImageFilename(tile.concreteId);
        if (filename) {
          let texW = 0, texH = 0;
          const atlasRect = this.gameObjectTextureCache.getAtlasRect("ConcreteImages", filename);
          if (atlasRect) {
            texW = atlasRect.sw;
            texH = atlasRect.sh;
          } else {
            const texture = this.gameObjectTextureCache.getTextureSync("ConcreteImages", filename);
            if (texture) {
              texW = texture.width;
              texH = texture.height;
            }
          }
          if (texW > 0) {
            const scaledWidth = Math.round(texW * scaleFactor);
            const scaledHeight = Math.round(texH * scaleFactor);
            const drawX = tile.screenX - scaledWidth / 2;
            const PLATFORM_DIAMOND_TOP = 30;
            const yOffset = isWaterPlatform && scaledHeight > config2.tileHeight ? Math.round(PLATFORM_DIAMOND_TOP * scaleFactor) : scaledHeight - config2.tileHeight;
            const drawY = tile.screenY - yOffset;
            if (atlasRect) {
              ctx.drawImage(
                atlasRect.atlas,
                atlasRect.sx,
                atlasRect.sy,
                atlasRect.sw,
                atlasRect.sh,
                drawX,
                drawY,
                scaledWidth,
                scaledHeight
              );
            } else {
              const texture = this.gameObjectTextureCache.getTextureSync("ConcreteImages", filename);
              ctx.drawImage(texture, drawX, drawY, scaledWidth, scaledHeight);
            }
            if (collectDebug) {
              debugBoxes.push({
                drawX,
                drawY,
                w: scaledWidth,
                h: scaledHeight,
                screenX: tile.screenX,
                screenY: tile.screenY,
                concreteId: tile.concreteId,
                texW,
                texH,
                isPlatform: isWaterPlatform
              });
            }
            continue;
          }
        }
        this.drawDebugConcreteTile(ctx, tile.screenX, tile.screenY, tile.concreteId, config2);
      }
      if (collectDebug && debugBoxes.length > 0) {
        ctx.save();
        ctx.lineWidth = 1;
        const zoomLevel = this.terrainRenderer.getZoomLevel();
        const showLabels = zoomLevel >= 2;
        for (const box of debugBoxes) {
          ctx.strokeStyle = box.isPlatform ? "#ff00ff" : "#00ffff";
          ctx.strokeRect(box.drawX, box.drawY, box.w, box.h);
          ctx.strokeStyle = "#ff0000";
          ctx.beginPath();
          ctx.moveTo(box.screenX - 3, box.screenY);
          ctx.lineTo(box.screenX + 3, box.screenY);
          ctx.moveTo(box.screenX, box.screenY - 3);
          ctx.lineTo(box.screenX, box.screenY + 3);
          ctx.stroke();
          if (showLabels) {
            const label = `$${box.concreteId.toString(16).toUpperCase()} ${box.texW}x${box.texH}`;
            ctx.font = "9px monospace";
            ctx.fillStyle = box.isPlatform ? "#ff00ff" : "#00ffff";
            ctx.fillText(label, box.drawX + 1, box.drawY + 9);
          }
        }
        ctx.restore();
      }
    }
    /**
     * Draw a debug colored tile for concrete (when texture not available)
     */
    drawDebugConcreteTile(ctx, sx, sy, concreteId, config2) {
      const halfWidth = config2.tileWidth / 2;
      const halfHeight = config2.tileHeight / 2;
      let color;
      if ((concreteId & 128) !== 0) {
        color = "rgba(100, 120, 140, 0.7)";
      } else if ((concreteId & 16) !== 0) {
        color = "rgba(80, 80, 80, 0.7)";
      } else if (concreteId === 15) {
        color = "rgba(160, 160, 160, 0.7)";
      } else if (concreteId === 12) {
        color = "rgba(140, 140, 140, 0.7)";
      } else {
        color = "rgba(130, 130, 130, 0.7)";
      }
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + halfWidth, sy + halfHeight);
      ctx.lineTo(sx, sy + config2.tileHeight);
      ctx.lineTo(sx - halfWidth, sy + halfHeight);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
    /**
     * Draw road segments as isometric tiles with textures
     * Uses the road texture system to determine correct textures based on topology
     *
     * Two-pass rendering (same as terrain special textures):
     * - Pass 1: Standard road tiles (texture height <= 32)
     * - Pass 2: Tall road tiles (bridges) sorted by (i+j) ascending for painter's algorithm
     */
    drawRoads(bounds, occupiedTiles) {
      const ctx = this.ctx;
      const config2 = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
      const halfWidth = config2.tileWidth / 2;
      const halfHeight = config2.tileHeight / 2;
      const terrainLoader = this.terrainRenderer.getTerrainLoader();
      const BASE_TILE_HEIGHT = 32;
      const scaleFactor = config2.tileWidth / 64;
      const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);
      const allRoadTiles = [];
      for (const [key] of this.roadTilesMap) {
        const [xStr, yStr] = key.split(",");
        const x = parseInt(xStr, 10);
        const y = parseInt(yStr, 10);
        if (occupiedTiles.has(key)) continue;
        if (x < bounds.minJ || x > bounds.maxJ || y < bounds.minI || y > bounds.maxI) {
          continue;
        }
        const screenPos = this.terrainRenderer.mapToScreen(y, x);
        if (screenPos.x < -config2.tileWidth - this.cullingPadding || screenPos.x > this.canvas.width + config2.tileWidth + this.cullingPadding || screenPos.y < -config2.tileHeight * 2 - this.cullingPadding || screenPos.y > this.canvas.height + config2.tileHeight * 2 + this.cullingPadding) {
          continue;
        }
        const sx = Math.round(screenPos.x);
        const sy = Math.round(screenPos.y);
        let topology = 0 /* None */;
        let texture = null;
        let atlasRect = null;
        let textureHeight = 0;
        let fullRoadBlockId = 0;
        if (this.roadBlockClassesLoaded && this.roadsRendering) {
          topology = this.roadsRendering.get(y, x);
          if (topology !== 0 /* None */) {
            const landId = terrainLoader.getLandId(x, y);
            const onConcrete = this.hasConcrete(x, y);
            const smoothResult = detectSmoothCorner(
              y,
              x,
              this.roadsRendering,
              (_r, c) => this.hasConcrete(c, _r)
            );
            fullRoadBlockId = smoothResult.isSmooth ? smoothResult.roadBlock : roadBlockId(topology, landId, onConcrete, false, false);
            const texturePath = this.roadBlockClassManager.getImagePath(fullRoadBlockId);
            if (texturePath) {
              const filename = texturePath.split("/").pop() || "";
              const rect = this.gameObjectTextureCache.getAtlasRect("RoadBlockImages", filename);
              if (rect) {
                atlasRect = rect;
                textureHeight = rect.sh;
              } else {
                texture = this.gameObjectTextureCache.getTextureSync("RoadBlockImages", filename);
                if (texture) textureHeight = texture.height;
              }
            }
          }
        }
        const onWaterPlatform = this.isOnWaterPlatform(x, y);
        const isTall = (texture !== null || atlasRect !== null) && textureHeight > BASE_TILE_HEIGHT;
        allRoadTiles.push({
          x,
          y,
          sx,
          sy,
          topology,
          texture,
          atlasRect,
          onWaterPlatform,
          isTall,
          textureHeight,
          roadBlockId: fullRoadBlockId
        });
      }
      allRoadTiles.sort((a, b) => b.y + b.x - (a.y + a.x));
      const scale = config2.tileWidth / 64;
      for (const tile of allRoadTiles) {
        if (tile.isTall) {
          const scaledHeight = tile.textureHeight * scale;
          const yOffset = scaledHeight - config2.tileHeight;
          if (tile.atlasRect) {
            const r = tile.atlasRect;
            ctx.drawImage(r.atlas, r.sx, r.sy, r.sw, r.sh, tile.sx - halfWidth, tile.sy - yOffset, config2.tileWidth, scaledHeight);
          } else if (tile.texture) {
            ctx.drawImage(tile.texture, tile.sx - halfWidth, tile.sy - yOffset, config2.tileWidth, scaledHeight);
          }
          if (isBridge(tile.roadBlockId)) {
            const railingPath = this.roadBlockClassManager.getRailingImagePath(tile.roadBlockId);
            if (railingPath) {
              const railingFilename = railingPath.split("/").pop() || "";
              const railingRect = this.gameObjectTextureCache.getAtlasRect("RoadBlockImages", railingFilename);
              if (railingRect) {
                const rScaledHeight = railingRect.sh * scale;
                const rYOffset = rScaledHeight - config2.tileHeight;
                ctx.drawImage(
                  railingRect.atlas,
                  railingRect.sx,
                  railingRect.sy,
                  railingRect.sw,
                  railingRect.sh,
                  tile.sx - halfWidth,
                  tile.sy - rYOffset,
                  config2.tileWidth,
                  rScaledHeight
                );
              } else {
                const railingTex = this.gameObjectTextureCache.getTextureSync("RoadBlockImages", railingFilename);
                if (railingTex) {
                  const rScaledHeight = railingTex.height * scale;
                  const rYOffset = rScaledHeight - config2.tileHeight;
                  ctx.drawImage(railingTex, tile.sx - halfWidth, tile.sy - rYOffset, config2.tileWidth, rScaledHeight);
                }
              }
            }
          }
        } else {
          const drawSy = tile.onWaterPlatform ? tile.sy - platformYShift : tile.sy;
          if (tile.atlasRect) {
            const r = tile.atlasRect;
            ctx.drawImage(r.atlas, r.sx, r.sy, r.sw, r.sh, tile.sx - halfWidth, drawSy, config2.tileWidth, config2.tileHeight);
          } else if (tile.texture) {
            ctx.drawImage(tile.texture, tile.sx - halfWidth, drawSy, config2.tileWidth, config2.tileHeight);
          } else {
            ctx.beginPath();
            ctx.moveTo(tile.sx, drawSy);
            ctx.lineTo(tile.sx - halfWidth, drawSy + halfHeight);
            ctx.lineTo(tile.sx, drawSy + config2.tileHeight);
            ctx.lineTo(tile.sx + halfWidth, drawSy + halfHeight);
            ctx.closePath();
            ctx.fillStyle = this.getDebugColorForTopology(tile.topology);
            ctx.fill();
          }
        }
      }
    }
    /**
     * Draw vegetation overlay (special terrain tiles: trees, decorations)
     * Rendered on top of flat terrain base, below concrete/roads/buildings.
     * Vegetation within 2 tiles of buildings/roads is automatically hidden.
     * Can be disabled during camera movement for performance.
     * Uses painter's algorithm: lower tiles (closer to viewer) drawn last.
     */
    drawVegetation(bounds) {
      if (!this.vegetationEnabled) return;
      const currentZoom = this.terrainRenderer.getZoomLevel();
      if (currentZoom === 0) return;
      if ((this.hideVegetationOnMove || currentZoom === 1) && this.isCameraMoving) return;
      const ctx = this.ctx;
      const config2 = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
      const halfWidth = config2.tileWidth / 2;
      const terrainLoader = this.terrainRenderer.getTerrainLoader();
      const textureCache = this.terrainRenderer.getTextureCache();
      const atlasCache = this.terrainRenderer.getAtlasCache();
      const useAtlas = atlasCache.isReady();
      const BASE_TILE_HEIGHT = 32;
      const vegTiles = [];
      for (let i = bounds.minI - 2; i <= bounds.maxI + 2; i++) {
        for (let j = bounds.minJ - 2; j <= bounds.maxJ + 2; j++) {
          const textureId = terrainLoader.getTextureId(j, i);
          if (!isSpecialTile(textureId)) continue;
          if (this.vegetationMapper.shouldFlatten(i, j, textureId)) continue;
          const screenPos = this.terrainRenderer.mapToScreen(i, j);
          if (screenPos.x < -config2.tileWidth * 2 - this.cullingPadding || screenPos.x > this.canvas.width + config2.tileWidth * 2 + this.cullingPadding || screenPos.y < -config2.tileHeight * 4 - this.cullingPadding || screenPos.y > this.canvas.height + config2.tileHeight * 2 + this.cullingPadding) {
            continue;
          }
          vegTiles.push({
            i,
            j,
            sx: Math.round(screenPos.x),
            sy: Math.round(screenPos.y),
            textureId
          });
        }
      }
      vegTiles.sort((a, b) => b.i + b.j - (a.i + a.j));
      if (useAtlas) {
        const atlasImg = atlasCache.getAtlas();
        for (const tile of vegTiles) {
          const rect = atlasCache.getTileRect(tile.textureId);
          if (!rect) continue;
          if (rect.sh > BASE_TILE_HEIGHT) {
            const scale = config2.tileWidth / 64;
            const scaledHeight = rect.sh * scale;
            const yOffset = scaledHeight - config2.tileHeight;
            ctx.drawImage(
              atlasImg,
              rect.sx,
              rect.sy,
              rect.sw,
              rect.sh,
              tile.sx - halfWidth,
              tile.sy - yOffset,
              config2.tileWidth,
              scaledHeight
            );
          } else {
            ctx.drawImage(
              atlasImg,
              rect.sx,
              rect.sy,
              rect.sw,
              rect.sh,
              tile.sx - halfWidth,
              tile.sy,
              config2.tileWidth,
              config2.tileHeight
            );
          }
        }
      } else {
        for (const tile of vegTiles) {
          const texture = textureCache.getTextureSync(tile.textureId);
          if (!texture) continue;
          if (texture.height > BASE_TILE_HEIGHT) {
            const scale = config2.tileWidth / 64;
            const scaledHeight = texture.height * scale;
            const yOffset = scaledHeight - config2.tileHeight;
            ctx.drawImage(
              texture,
              tile.sx - halfWidth,
              tile.sy - yOffset,
              config2.tileWidth,
              scaledHeight
            );
          } else {
            ctx.drawImage(
              texture,
              tile.sx - halfWidth,
              tile.sy,
              config2.tileWidth,
              config2.tileHeight
            );
          }
        }
      }
    }
    /**
     * Check if a tile is on concrete (urban area)
     * Simple heuristic: check if adjacent to an urban building
     */
    isOnConcrete(x, y) {
      const checkRadius = 2;
      for (const building of this.allBuildings) {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const xsize = dims?.xsize || 1;
        const ysize = dims?.ysize || 1;
        const nearX = x >= building.x - checkRadius && x < building.x + xsize + checkRadius;
        const nearY = y >= building.y - checkRadius && y < building.y + ysize + checkRadius;
        if (nearX && nearY) {
          const name = dims?.Name?.toLowerCase() || "";
          if (this.isUrbanBuilding(name)) {
            return true;
          }
        }
      }
      return false;
    }
    /**
     * Check if a building name suggests it's an urban building
     */
    isUrbanBuilding(name) {
      const urbanKeywords = [
        "office",
        "store",
        "shop",
        "mall",
        "bank",
        "hotel",
        "hospital",
        "clinic",
        "school",
        "university",
        "restaurant",
        "bar",
        "club",
        "theater",
        "cinema",
        "apartment",
        "condo",
        "tower",
        "headquarters"
      ];
      return urbanKeywords.some((keyword) => name.includes(keyword));
    }
    /**
     * Get debug color for road topology (used when texture not available)
     */
    getDebugColorForTopology(topology) {
      switch (topology) {
        case 5 /* NSRoad */:
        case 1 /* NSRoadStart */:
        case 2 /* NSRoadEnd */:
          return "#777";
        // Vertical roads - lighter gray
        case 6 /* WERoad */:
        case 3 /* WERoadStart */:
        case 4 /* WERoadEnd */:
          return "#555";
        // Horizontal roads - darker gray
        case 13 /* CornerN */:
        case 14 /* CornerE */:
        case 12 /* CornerS */:
        case 11 /* CornerW */:
          return "#886";
        // Corners - brownish
        case 7 /* LeftPlug */:
        case 8 /* RightPlug */:
        case 9 /* TopPlug */:
        case 10 /* BottomPlug */:
          return "#868";
        // T-junctions - purplish
        case 15 /* CrossRoads */:
          return "#688";
        // Crossroads - teal
        default:
          return "#666";
      }
    }
    /**
     * Draw buildings as isometric tiles with textures
     * Uses Painter's algorithm: sort by depth (y + x) so buildings closer to viewer are drawn last
     */
    drawBuildings(bounds) {
      const ctx = this.ctx;
      const config2 = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
      const halfWidth = config2.tileWidth / 2;
      const halfHeight = config2.tileHeight / 2;
      const margin = 10;
      const visibleBuildings = this.allBuildings.filter((b) => {
        const dims = this.facilityDimensionsCache.get(b.visualClass);
        const bw = dims?.xsize || 1;
        const bh = dims?.ysize || 1;
        return b.x + bw > bounds.minJ - margin && b.x < bounds.maxJ + margin && b.y + bh > bounds.minI - margin && b.y < bounds.maxI + margin;
      });
      const sortedBuildings = visibleBuildings.sort((a, b) => {
        const aDepth = a.y + a.x;
        const bDepth = b.y + b.x;
        return bDepth - aDepth;
      });
      sortedBuildings.forEach((building) => {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const xsize = dims?.xsize || 1;
        const ysize = dims?.ysize || 1;
        const isHovered = this.hoveredBuilding === building;
        const textureFilename = GameObjectTextureCache.getBuildingTextureFilename(building.visualClass);
        const texture = this.gameObjectTextureCache.getTextureSync("BuildingImages", textureFilename);
        if (texture) {
          const scaleFactor = config2.tileWidth / 64;
          const scaledWidth = texture.width * scaleFactor;
          const scaledHeight = texture.height * scaleFactor;
          const southCornerScreenPos = this.terrainRenderer.mapToScreen(building.y, building.x);
          const drawX = Math.round(southCornerScreenPos.x - scaledWidth / 2);
          let drawY = Math.round(southCornerScreenPos.y + config2.tileHeight - scaledHeight);
          if (this.isOnWaterPlatform(building.x, building.y)) {
            const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);
            drawY -= platformYShift;
          }
          if (drawX + scaledWidth < 0 || drawX > this.canvas.width || drawY + scaledHeight < 0 || drawY > this.canvas.height) {
            return;
          }
          if (isHovered) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = "#5fadff";
            this.drawBuildingFootprint(building, xsize, ysize, config2, halfWidth, halfHeight);
            ctx.globalAlpha = 1;
          }
          ctx.drawImage(texture, drawX, drawY, scaledWidth, scaledHeight);
          this.drawBuildingLabel(building.visualClass, southCornerScreenPos.x, southCornerScreenPos.y + halfHeight);
        } else {
          return;
        }
      });
    }
    /**
     * Draw building VisualClass label for identification
     * Skipped at zoom levels 0-1 where tiles are too small for readable labels
     */
    drawBuildingLabel(visualClass, x, y) {
      if (this.terrainRenderer.getZoomLevel() <= 1) return;
      const ctx = this.ctx;
      ctx.font = "10px monospace";
      const text = visualClass;
      const metrics = ctx.measureText(text);
      const padding = 2;
      const bgWidth = metrics.width + padding * 2;
      const bgHeight = 12;
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(Math.round(x - bgWidth / 2), Math.round(y - bgHeight / 2), bgWidth, bgHeight);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, Math.round(x), Math.round(y));
    }
    /**
     * Draw building footprint outline (used for hover highlighting)
     */
    drawBuildingFootprint(building, xsize, ysize, config2, halfWidth, halfHeight) {
      const ctx = this.ctx;
      for (let dy = 0; dy < ysize; dy++) {
        for (let dx = 0; dx < xsize; dx++) {
          const screenPos = this.terrainRenderer.mapToScreen(building.y + dy, building.x + dx);
          const sx = Math.round(screenPos.x);
          const sy = Math.round(screenPos.y);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - halfWidth, sy + halfHeight);
          ctx.lineTo(sx, sy + config2.tileHeight);
          ctx.lineTo(sx + halfWidth, sy + halfHeight);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    /**
     * Draw zone overlay as semi-transparent isometric tiles
     */
    drawZoneOverlay(bounds) {
      if (!this.zoneOverlayEnabled || !this.zoneOverlayData) return;
      const ctx = this.ctx;
      const config2 = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
      const halfWidth = config2.tileWidth / 2;
      const halfHeight = config2.tileHeight / 2;
      const data = this.zoneOverlayData;
      const zoneColors = {
        0: "transparent",
        3e3: "rgba(255, 107, 107, 0.3)",
        // Residential - Red
        4e3: "rgba(77, 171, 247, 0.3)",
        // Commercial - Blue
        5e3: "rgba(255, 212, 59, 0.3)",
        // Industrial - Yellow
        6e3: "rgba(81, 207, 102, 0.3)",
        // Agricultural - Green
        7e3: "rgba(255, 146, 43, 0.3)",
        // Mixed - Orange
        8e3: "rgba(132, 94, 247, 0.3)",
        // Special - Purple
        9e3: "rgba(253, 126, 20, 0.3)"
        // Other - Bright Orange
      };
      for (let row = 0; row < data.rows.length; row++) {
        const rowData = data.rows[row];
        for (let col = 0; col < rowData.length; col++) {
          const value = rowData[col];
          if (value === 0) continue;
          const worldX = this.zoneOverlayX1 + col;
          const worldY = this.zoneOverlayY1 + row;
          const screenPos = this.terrainRenderer.mapToScreen(worldY, worldX);
          if (screenPos.x < -config2.tileWidth || screenPos.x > this.canvas.width + config2.tileWidth || screenPos.y < -config2.tileHeight || screenPos.y > this.canvas.height + config2.tileHeight) {
            continue;
          }
          const color = zoneColors[value] || "rgba(136, 136, 136, 0.3)";
          ctx.beginPath();
          ctx.moveTo(screenPos.x, screenPos.y);
          ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
          ctx.lineTo(screenPos.x, screenPos.y + config2.tileHeight);
          ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
    }
    /**
     * Draw building placement preview
     */
    drawPlacementPreview() {
      if (!this.placementMode || !this.placementPreview) return;
      const ctx = this.ctx;
      const config2 = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
      const halfWidth = config2.tileWidth / 2;
      const halfHeight = config2.tileHeight / 2;
      const preview = this.placementPreview;
      let hasCollision = false;
      for (let dy = 0; dy < preview.ysize && !hasCollision; dy++) {
        for (let dx = 0; dx < preview.xsize && !hasCollision; dx++) {
          const checkX = preview.j + dx;
          const checkY = preview.i + dy;
          for (const building of this.allBuildings) {
            const dims = this.facilityDimensionsCache.get(building.visualClass);
            const bw = dims?.xsize || 1;
            const bh = dims?.ysize || 1;
            if (checkX >= building.x && checkX < building.x + bw && checkY >= building.y && checkY < building.y + bh) {
              hasCollision = true;
              break;
            }
          }
          for (const seg of this.allSegments) {
            const minX = Math.min(seg.x1, seg.x2);
            const maxX = Math.max(seg.x1, seg.x2);
            const minY = Math.min(seg.y1, seg.y2);
            const maxY = Math.max(seg.y1, seg.y2);
            if (checkX >= minX && checkX <= maxX && checkY >= minY && checkY <= maxY) {
              hasCollision = true;
              break;
            }
          }
        }
      }
      const fillColor = hasCollision ? "rgba(255, 100, 100, 0.5)" : "rgba(100, 255, 100, 0.5)";
      const strokeColor = hasCollision ? "#ff4444" : "#44ff44";
      for (let dy = 0; dy < preview.ysize; dy++) {
        for (let dx = 0; dx < preview.xsize; dx++) {
          const tileJ = preview.j + dx;
          const tileI = preview.i + dy;
          const screenPos = this.terrainRenderer.mapToScreen(tileI, tileJ);
          ctx.beginPath();
          ctx.moveTo(screenPos.x, screenPos.y);
          ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
          ctx.lineTo(screenPos.x, screenPos.y + config2.tileHeight);
          ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
          ctx.closePath();
          ctx.fillStyle = fillColor;
          ctx.fill();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      const centerPos = this.terrainRenderer.mapToScreen(preview.i, preview.j);
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(centerPos.x + 20, centerPos.y - 60, 200, 80);
      ctx.fillStyle = "#fff";
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      ctx.fillText(preview.buildingName, centerPos.x + 30, centerPos.y - 42);
      ctx.fillText(`Cost: $${preview.cost.toLocaleString()}`, centerPos.x + 30, centerPos.y - 24);
      ctx.fillText(`Size: ${preview.xsize}\xD7${preview.ysize}`, centerPos.x + 30, centerPos.y - 6);
      ctx.fillText(`Zone: ${preview.zoneRequirement}`, centerPos.x + 30, centerPos.y + 12);
    }
    /**
     * Draw road drawing preview
     * Shows either:
     * - A hover indicator for the current tile (when not drawing)
     * - The full path preview (when drawing/dragging)
     */
    drawRoadDrawingPreview() {
      if (!this.roadDrawingMode) return;
      const ctx = this.ctx;
      const config2 = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
      const halfWidth = config2.tileWidth / 2;
      const halfHeight = config2.tileHeight / 2;
      const state = this.roadDrawingState;
      if (!state.isDrawing) {
        this.drawRoadHoverIndicator(ctx, config2, halfWidth, halfHeight);
        return;
      }
      const pathTiles = this.generateStaircasePath(
        state.startX,
        state.startY,
        state.endX,
        state.endY
      );
      let hasBuildingCollision = false;
      for (const tile of pathTiles) {
        for (const building of this.allBuildings) {
          const dims = this.facilityDimensionsCache.get(building.visualClass);
          const bw = dims?.xsize || 1;
          const bh = dims?.ysize || 1;
          if (tile.x >= building.x && tile.x < building.x + bw && tile.y >= building.y && tile.y < building.y + bh) {
            hasBuildingCollision = true;
            break;
          }
        }
        if (hasBuildingCollision) break;
      }
      const connectsToRoad = this.checkRoadPathConnectsToExisting(pathTiles);
      const hasConnectionError = !connectsToRoad;
      const hasError = hasBuildingCollision || hasConnectionError;
      const fillColor = hasError ? "rgba(255, 100, 100, 0.5)" : "rgba(100, 200, 100, 0.5)";
      const strokeColor = hasError ? "#ff4444" : "#88ff88";
      for (const tile of pathTiles) {
        const screenPos = this.terrainRenderer.mapToScreen(tile.y, tile.x);
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
        ctx.lineTo(screenPos.x, screenPos.y + config2.tileHeight);
        ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      const endPos = this.terrainRenderer.mapToScreen(state.endY, state.endX);
      const tileCount = pathTiles.length;
      const cost = tileCount * this.roadCostPerTile;
      let errorMessage = "";
      if (hasBuildingCollision) {
        errorMessage = "Blocked by building";
      } else if (hasConnectionError) {
        errorMessage = "Must connect to road";
      }
      const tooltipHeight = errorMessage ? 55 : 40;
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(endPos.x + 10, endPos.y - 30, 160, tooltipHeight);
      ctx.fillStyle = "#fff";
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`Tiles: ${tileCount}`, endPos.x + 20, endPos.y - 12);
      ctx.fillText(`Cost: $${cost.toLocaleString()}`, endPos.x + 20, endPos.y + 4);
      if (errorMessage) {
        ctx.fillStyle = "#ff6666";
        ctx.fillText(`\u26A0 ${errorMessage}`, endPos.x + 20, endPos.y + 20);
      }
    }
    /**
     * Draw hover indicator for road drawing start point
     * Shows a highlighted tile where the road will start when user clicks
     */
    drawRoadHoverIndicator(ctx, config2, halfWidth, halfHeight) {
      const x = this.mouseMapJ;
      const y = this.mouseMapI;
      const connectsToRoad = this.checkRoadPathConnectsToExisting([{ x, y }]);
      const hasExistingRoad = this.hasRoadAt(x, y);
      let hasBuildingCollision = false;
      for (const building of this.allBuildings) {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const bw = dims?.xsize || 1;
        const bh = dims?.ysize || 1;
        if (x >= building.x && x < building.x + bw && y >= building.y && y < building.y + bh) {
          hasBuildingCollision = true;
          break;
        }
      }
      const isValid = !hasBuildingCollision && (connectsToRoad || hasExistingRoad);
      const fillColor = isValid ? "rgba(100, 200, 255, 0.4)" : "rgba(255, 150, 100, 0.4)";
      const strokeColor = isValid ? "#66ccff" : "#ff9966";
      const screenPos = this.terrainRenderer.mapToScreen(y, x);
      ctx.beginPath();
      ctx.moveTo(screenPos.x, screenPos.y);
      ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
      ctx.lineTo(screenPos.x, screenPos.y + config2.tileHeight);
      ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(screenPos.x + 15, screenPos.y - 25, 180, 45);
      ctx.fillStyle = "#fff";
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`Tile: (${x}, ${y})`, screenPos.x + 25, screenPos.y - 8);
      const roadTileCount = this.roadTilesMap.size;
      if (hasBuildingCollision) {
        ctx.fillStyle = "#ff6666";
        ctx.fillText("Blocked by building", screenPos.x + 25, screenPos.y + 8);
      } else if (roadTileCount === 0) {
        ctx.fillStyle = "#66ff66";
        ctx.fillText("Click to start first road", screenPos.x + 25, screenPos.y + 8);
      } else if (connectsToRoad || hasExistingRoad) {
        ctx.fillStyle = "#66ff66";
        ctx.fillText("Click to start drawing", screenPos.x + 25, screenPos.y + 8);
      } else {
        ctx.fillStyle = "#ff6666";
        ctx.fillText(`Must connect to road (${roadTileCount} tiles)`, screenPos.x + 25, screenPos.y + 8);
      }
    }
    /**
     * Generate staircase path between two points (for diagonal roads)
     */
    generateStaircasePath(x1, y1, x2, y2) {
      const tiles = [];
      let x = x1;
      let y = y1;
      tiles.push({ x, y });
      const dx = x2 - x1;
      const dy = y2 - y1;
      const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
      const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
      let remainingX = Math.abs(dx);
      let remainingY = Math.abs(dy);
      while (remainingX > 0 || remainingY > 0) {
        if (remainingX >= remainingY && remainingX > 0) {
          x += sx;
          remainingX--;
        } else if (remainingY > 0) {
          y += sy;
          remainingY--;
        }
        tiles.push({ x, y });
      }
      return tiles;
    }
    /**
     * Draw water concrete debug grid overlay.
     * Shows isometric diamond outlines for every concrete tile on water, color-coded by source:
     *   Green  = building buffer (+1 around buildings)
     *   Blue   = junction 3×3 (corners, T, crossroads on water)
     * Road tiles on water with concrete get an orange outline.
     * Labels show (x,y) coordinates and concreteId hex.
     */
    drawWaterConcreteGrid(bounds) {
      const ctx = this.ctx;
      const config2 = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
      const halfWidth = config2.tileWidth / 2;
      const halfHeight = config2.tileHeight / 2;
      const terrainLoader = this.terrainRenderer.getTerrainLoader();
      const scaleFactor = config2.tileWidth / 64;
      const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);
      const mapData = {
        getLandId: (row, col) => terrainLoader ? terrainLoader.getLandId(col, row) : 0,
        hasConcrete: (row, col) => this.hasConcrete(col, row),
        hasRoad: (row, col) => this.roadTilesMap.has(`${col},${row}`),
        hasBuilding: (row, col) => this.isTileOccupiedByBuilding(col, row)
      };
      const sourceColors = {
        building: "#00ff00",
        // Green
        junction: "#4488ff"
        // Blue
      };
      const sourceFills = {
        building: "rgba(0, 255, 0, 0.15)",
        junction: "rgba(68, 136, 255, 0.15)"
      };
      ctx.save();
      for (let i = bounds.minI; i <= bounds.maxI; i++) {
        for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
          const key = `${j},${i}`;
          if (!this.concreteTilesSet.has(key)) continue;
          const landId = terrainLoader ? terrainLoader.getLandId(j, i) : 0;
          if (!isWater(landId)) continue;
          const screenPos = this.terrainRenderer.mapToScreen(i, j);
          if (screenPos.x < -50 || screenPos.x > this.canvas.width + 50 || screenPos.y < -50 || screenPos.y > this.canvas.height + 50) {
            continue;
          }
          const isRoadTile = this.roadTilesMap.has(key);
          const source = this.debugConcreteSourceMap.get(key) || "junction";
          const drawY = screenPos.y - platformYShift;
          ctx.beginPath();
          ctx.moveTo(screenPos.x, drawY);
          ctx.lineTo(screenPos.x - halfWidth, drawY + halfHeight);
          ctx.lineTo(screenPos.x, drawY + config2.tileHeight);
          ctx.lineTo(screenPos.x + halfWidth, drawY + halfHeight);
          ctx.closePath();
          if (isRoadTile) {
            ctx.fillStyle = "rgba(255, 136, 0, 0.12)";
          } else {
            ctx.fillStyle = sourceFills[source] || "rgba(255, 255, 255, 0.1)";
          }
          ctx.fill();
          if (isRoadTile) {
            ctx.strokeStyle = "#ff8800";
            ctx.lineWidth = 2;
          } else {
            ctx.strokeStyle = sourceColors[source] || "#ffffff";
            ctx.lineWidth = 1.5;
          }
          ctx.stroke();
          if (config2.tileWidth >= 32) {
            const concreteId = getConcreteId(i, j, mapData);
            const idHex = concreteId !== CONCRETE_NONE ? concreteId.toString(16).toUpperCase().padStart(2, "0") : "--";
            ctx.font = "8px monospace";
            ctx.textAlign = "center";
            ctx.fillStyle = isRoadTile ? "#ff8800" : sourceColors[source] || "#ffffff";
            ctx.fillText(`${j},${i}`, screenPos.x, drawY + halfHeight - 2);
            ctx.fillText(`$${idHex}`, screenPos.x, drawY + halfHeight + 8);
            if (isRoadTile) {
              const topology = this.roadsRendering ? this.roadsRendering.get(i, j) : 0 /* None */;
              const fullRbId = roadBlockId(topology, landId, this.hasConcrete(j, i), false, false);
              const bridgeFlag = isBridge(fullRbId);
              ctx.fillStyle = bridgeFlag ? "#ff4444" : "#ff8800";
              ctx.fillText(bridgeFlag ? "X" : "R", screenPos.x, drawY + halfHeight + 18);
            }
          }
        }
      }
      ctx.restore();
    }
    /**
     * Draw debug overlay showing tile metadata across the full screen.
     * Optimized for screenshot analysis by sub-agents:
     * - Every visible tile gets labeled (no mouse-radius limitation)
     * - Compact labels: land type + concrete ID + road status per tile
     * - High-contrast colors on dark backgrounds for OCR readability
     * - Static legend (no mouse-dependent data that changes between captures)
     */
    drawDebugOverlay(bounds) {
      const ctx = this.ctx;
      const config2 = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
      const terrainLoader = this.terrainRenderer.getTerrainLoader();
      const halfWidth = config2.tileWidth / 2;
      const halfHeight = config2.tileHeight / 2;
      const scaleFactor = config2.tileWidth / 64;
      const platformYShift = Math.round(PLATFORM_SHIFT * scaleFactor);
      if (this.debugShowWaterGrid) {
        this.drawWaterConcreteGrid(bounds);
      }
      const mapData = {
        getLandId: (row, col) => terrainLoader ? terrainLoader.getLandId(col, row) : 0,
        hasConcrete: (row, col) => this.hasConcrete(col, row),
        hasRoad: (row, col) => this.roadTilesMap.has(`${col},${row}`),
        hasBuilding: (row, col) => this.isTileOccupiedByBuilding(col, row)
      };
      const showLabels = this.debugShowTileInfo || this.debugShowRoadInfo || this.debugShowConcreteInfo;
      if (showLabels) {
        ctx.save();
        ctx.font = config2.tileWidth >= 32 ? "8px monospace" : "6px monospace";
        ctx.textAlign = "center";
        for (let i = bounds.minI; i <= bounds.maxI; i++) {
          for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
            const screenPos = this.terrainRenderer.mapToScreen(i, j);
            if (screenPos.x < -50 || screenPos.x > this.canvas.width + 50 || screenPos.y < -50 || screenPos.y > this.canvas.height + 50) {
              continue;
            }
            const key = `${j},${i}`;
            const landId = terrainLoader ? terrainLoader.getLandId(j, i) : 0;
            const decoded = decodeLandId(landId);
            const hasRoad = this.roadTilesMap.has(key);
            const hasConcrete = this.concreteTilesSet.has(key);
            const onWater = decoded.isWater;
            if (!hasRoad && !hasConcrete && !onWater && this.debugShowConcreteInfo) continue;
            const isWaterPlatform = hasConcrete && onWater;
            const baseY = isWaterPlatform ? screenPos.y - platformYShift : screenPos.y;
            let labelY = baseY + halfHeight;
            if (this.debugShowTileInfo) {
              const landClassChar = ["G", "M", "D", "W"][decoded.landClass] || "?";
              ctx.fillStyle = onWater ? "#00ffff" : "rgba(255,255,255,0.6)";
              ctx.fillText(`${j},${i} ${landClassChar}`, screenPos.x, labelY - 4);
            }
            if (this.debugShowConcreteInfo && hasConcrete) {
              const concreteId = getConcreteId(i, j, mapData);
              if (concreteId !== CONCRETE_NONE) {
                const isPlatform = (concreteId & 128) !== 0;
                ctx.fillStyle = isPlatform ? "#00ccff" : "#cc88ff";
                ctx.fillText(`$${concreteId.toString(16).toUpperCase().padStart(2, "0")}`, screenPos.x, labelY + 6);
              }
            }
            if (this.debugShowRoadInfo && hasRoad && this.roadsRendering) {
              const topology = this.roadsRendering.get(i, j);
              const fullRbId = roadBlockId(topology, landId, this.isOnConcrete(j, i), false, false);
              const bridgeFlag = isBridge(fullRbId);
              ctx.fillStyle = bridgeFlag ? "#ff4444" : "#ff8800";
              ctx.fillText(bridgeFlag ? `X:${fullRbId.toString(16).toUpperCase()}` : `R:${fullRbId.toString(16).toUpperCase()}`, screenPos.x, labelY + 16);
            }
          }
        }
        ctx.restore();
      }
      {
        const screenPos = this.terrainRenderer.mapToScreen(this.mouseMapI, this.mouseMapJ);
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(screenPos.x - halfWidth, screenPos.y + halfHeight);
        ctx.lineTo(screenPos.x, screenPos.y + config2.tileHeight);
        ctx.lineTo(screenPos.x + halfWidth, screenPos.y + halfHeight);
        ctx.closePath();
        ctx.strokeStyle = "#ffff00";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      this.drawDebugPanel(ctx);
    }
    /**
     * Draw debug info panel
     */
    drawDebugPanel(ctx) {
      const terrainLoader = this.terrainRenderer.getTerrainLoader();
      const x = this.mouseMapJ;
      const y = this.mouseMapI;
      const landId = terrainLoader ? terrainLoader.getLandId(x, y) : 0;
      const decoded = decodeLandId(landId);
      const hasConcrete = this.hasConcrete(x, y);
      const hasRoad = this.roadTilesMap.has(`${x},${y}`);
      const legendLines = [];
      legendLines.push({ text: "DEBUG [D=off 1=tile 2=bldg 3=conc 4=wgrid 5=road]", color: "#ffff00" });
      const toggles = [
        this.debugShowTileInfo ? "1:ON" : "1:off",
        this.debugShowBuildingInfo ? "2:ON" : "2:off",
        this.debugShowConcreteInfo ? "3:ON" : "3:off",
        this.debugShowWaterGrid ? "4:ON" : "4:off",
        this.debugShowRoadInfo ? "5:ON" : "5:off"
      ].join(" ");
      legendLines.push({ text: toggles, color: "#aaaaaa" });
      if (this.debugShowWaterGrid) {
        legendLines.push({ text: "WATER GRID:", color: "#00ccff" });
        legendLines.push({ text: " Green=bldg  Blue=junc  Orange=road", color: "#cccccc" });
      }
      if (this.debugShowTileInfo || this.debugShowConcreteInfo || this.debugShowRoadInfo) {
        legendLines.push({ text: "TILE LABELS:", color: "#ffff00" });
        const parts = [];
        if (this.debugShowTileInfo) parts.push("j,i+land");
        if (this.debugShowConcreteInfo) parts.push("$XX=concId");
        if (this.debugShowRoadInfo) parts.push("R/X:rbId");
        legendLines.push({ text: " " + parts.join("  "), color: "#cccccc" });
      }
      const legendH = 14 + legendLines.length * 14;
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(8, 8, 390, legendH);
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      for (let li = 0; li < legendLines.length; li++) {
        ctx.fillStyle = legendLines[li].color;
        ctx.fillText(legendLines[li].text, 14, 22 + li * 14);
      }
      const detailLines = [];
      detailLines.push({ text: `Tile (${x},${y}) LandId:0x${landId.toString(16).toUpperCase().padStart(2, "0")}`, color: "#ffffff" });
      detailLines.push({ text: `${landClassName(decoded.landClass)} | ${landTypeName(decoded.landType)} | Var:${decoded.landVar}`, color: "#ffffff" });
      if (decoded.isWater) {
        const wtype = decoded.isDeepWater ? "Deep(Center)" : decoded.isWaterEdge ? "Edge" : "Water";
        detailLines.push({ text: `WATER: ${wtype}`, color: "#00ffff" });
      }
      if (hasRoad && this.roadsRendering) {
        const topology = this.roadsRendering.get(y, x);
        const fullRbId = roadBlockId(topology, landId, this.isOnConcrete(x, y), false, false);
        const bridgeFlag = isBridge(fullRbId);
        detailLines.push({ text: `Road: ${bridgeFlag ? "BRIDGE" : "ROAD"} rbId=0x${fullRbId.toString(16).toUpperCase()}`, color: bridgeFlag ? "#ff4444" : "#ff8800" });
      }
      if (hasConcrete) {
        const concreteKey = `${x},${y}`;
        const source = this.debugConcreteSourceMap.get(concreteKey) || "?";
        const mapDataLocal = {
          getLandId: (row, col) => terrainLoader ? terrainLoader.getLandId(col, row) : 0,
          hasConcrete: (row, col) => this.hasConcrete(col, row),
          hasRoad: (row, col) => this.roadTilesMap.has(`${col},${row}`),
          hasBuilding: (row, col) => this.isTileOccupiedByBuilding(col, row)
        };
        const concreteId = getConcreteId(y, x, mapDataLocal);
        const cfg = buildNeighborConfig(y, x, mapDataLocal);
        const isPlatform = (concreteId & 128) !== 0;
        const neighborStr = this.formatNeighborConfig(cfg);
        let idType;
        if (isPlatform) {
          idType = this.getPlatformIdName(concreteId);
        } else if ((concreteId & 16) !== 0) {
          idType = `ROAD_CONC`;
        } else if (concreteId === CONCRETE_FULL) {
          idType = "FULL";
        } else {
          idType = `EDGE(${concreteId & 15})`;
        }
        detailLines.push({ text: `Concrete: $${concreteId.toString(16).toUpperCase().padStart(2, "0")} ${idType} src:${source}`, color: isPlatform ? "#00ccff" : "#cc88ff" });
        detailLines.push({ text: `Neighbors: ${neighborStr}`, color: "#ffffff" });
        const texPath = this.concreteBlockClassManager.getImageFilename(concreteId);
        detailLines.push({ text: texPath ? `Tex: ${texPath}` : `Tex: MISSING id=${concreteId}`, color: texPath ? "#00ff00" : "#ff0000" });
      }
      if (this.debugShowBuildingInfo) {
        const buildingAtMouse = this.getBuildingAtTile(x, y);
        if (buildingAtMouse) {
          const dims = this.facilityDimensionsCache.get(buildingAtMouse.visualClass);
          detailLines.push({ text: `Bldg: ${buildingAtMouse.visualClass} at(${buildingAtMouse.x},${buildingAtMouse.y}) ${dims ? dims.xsize + "x" + dims.ysize : "NO DIMS"}`, color: "#ff8800" });
        }
      }
      const detailH = 10 + detailLines.length * 14;
      const detailY = this.canvas.height - detailH - 55;
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(8, detailY, 420, detailH);
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      for (let li = 0; li < detailLines.length; li++) {
        ctx.fillStyle = detailLines[li].color;
        ctx.fillText(detailLines[li].text, 14, detailY + 14 + li * 14);
      }
    }
    /**
     * Format neighbor configuration as visual string
     * Shows [TL T TR / L X R / BL B BR]
     */
    formatNeighborConfig(cfg) {
      const c = (b) => b ? "\u25A0" : "\u25A1";
      return `${c(cfg[0])}${c(cfg[1])}${c(cfg[2])} ${c(cfg[3])}X${c(cfg[4])} ${c(cfg[5])}${c(cfg[6])}${c(cfg[7])}`;
    }
    /**
     * Get platform ID name for debug display
     */
    getPlatformIdName(concreteId) {
      switch (concreteId) {
        case PLATFORM_IDS.CENTER:
          return "PLATFORM_CENTER ($80)";
        case PLATFORM_IDS.E:
          return "PLATFORM_E ($81)";
        case PLATFORM_IDS.N:
          return "PLATFORM_N ($82)";
        case PLATFORM_IDS.NE:
          return "PLATFORM_NE ($83)";
        case PLATFORM_IDS.NW:
          return "PLATFORM_NW ($84)";
        case PLATFORM_IDS.S:
          return "PLATFORM_S ($85)";
        case PLATFORM_IDS.SE:
          return "PLATFORM_SE ($86)";
        case PLATFORM_IDS.SW:
          return "PLATFORM_SW ($87)";
        case PLATFORM_IDS.W:
          return "PLATFORM_W ($88)";
        default:
          return `PLATFORM_??? ($${concreteId.toString(16)})`;
      }
    }
    /**
     * Draw game-specific info overlay
     */
    drawGameInfo() {
      const ctx = this.ctx;
      const pos = this.terrainRenderer.getCameraPosition();
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(10, this.canvas.height - 50, 260, 40);
      ctx.fillStyle = "#fff";
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`Buildings: ${this.allBuildings.length} | Segments: ${this.allSegments.length} | Road tiles: ${this.roadTilesMap.size}`, 20, this.canvas.height - 32);
      ctx.fillText(`Zones: ${this.cachedZones.size} | Mouse: (${this.mouseMapJ}, ${this.mouseMapI})`, 20, this.canvas.height - 16);
      this.drawCompass(ctx);
    }
    /**
     * Draw compass indicator showing cardinal directions in ISOMETRIC orientation
     *
     * Isometric grid mapping (45° rotation from top-down view):
     * - Grid row (i) increases toward bottom-left on screen
     * - Grid col (j) increases toward bottom-right on screen
     *
     * Cardinal directions (rotated 45° for isometric):
     * - N (North) = top-right on screen (decreasing row)
     * - E (East) = bottom-right on screen (increasing col)
     * - S (South) = bottom-left on screen (increasing row)
     * - W (West) = top-left on screen (decreasing col)
     */
    drawCompass(ctx) {
      const compassX = this.canvas.width - 55;
      const compassY = this.canvas.height - 55;
      const radius = 35;
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.beginPath();
      ctx.roundRect(compassX - radius - 12, compassY - radius - 12, (radius + 12) * 2, (radius + 12) * 2, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      const tileW = radius * 0.6;
      const tileH = radius * 0.3;
      ctx.beginPath();
      ctx.moveTo(compassX, compassY - tileH);
      ctx.lineTo(compassX + tileW, compassY);
      ctx.lineTo(compassX, compassY + tileH);
      ctx.lineTo(compassX - tileW, compassY);
      ctx.closePath();
      ctx.stroke();
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ff6666";
      ctx.fillText("N", compassX + radius * 0.65, compassY - radius * 0.65);
      ctx.fillStyle = "#6699ff";
      ctx.fillText("E", compassX + radius * 0.65, compassY + radius * 0.65);
      ctx.fillStyle = "#ffcc44";
      ctx.fillText("S", compassX - radius * 0.65, compassY + radius * 0.65);
      ctx.fillStyle = "#66cc66";
      ctx.fillText("W", compassX - radius * 0.65, compassY - radius * 0.65);
      ctx.strokeStyle = "#ff6666";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(compassX, compassY);
      ctx.lineTo(compassX + radius * 0.4, compassY - radius * 0.4);
      ctx.stroke();
      ctx.fillStyle = "#ff6666";
      ctx.beginPath();
      ctx.moveTo(compassX + radius * 0.5, compassY - radius * 0.5);
      ctx.lineTo(compassX + radius * 0.25, compassY - radius * 0.35);
      ctx.lineTo(compassX + radius * 0.35, compassY - radius * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(compassX, compassY, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "7px monospace";
      ctx.fillText("i-", compassX + radius * 0.2, compassY - radius * 0.2);
      ctx.fillText("j+", compassX + radius * 0.2, compassY + radius * 0.2);
    }
    // =========================================================================
    // MOUSE CONTROLS
    // =========================================================================
    // =========================================================================
    // VEGETATION CONTROL
    // =========================================================================
    /**
     * Mark camera as moving (resets debounce timer).
     * When the timer expires, vegetation is re-rendered.
     */
    markCameraMoving() {
      this.isCameraMoving = true;
      if (this.cameraStopTimer !== null) {
        clearTimeout(this.cameraStopTimer);
      }
      this.cameraStopTimer = window.setTimeout(() => {
        this.isCameraMoving = false;
        this.cameraStopTimer = null;
        if (this.hideVegetationOnMove) {
          this.requestRender();
        }
      }, this.CAMERA_STOP_DEBOUNCE_MS);
    }
    /**
     * Enable/disable vegetation rendering globally
     */
    setVegetationEnabled(enabled) {
      if (this.vegetationEnabled !== enabled) {
        this.vegetationEnabled = enabled;
        this.requestRender();
      }
    }
    /**
     * Check if vegetation rendering is enabled
     */
    isVegetationEnabled() {
      return this.vegetationEnabled;
    }
    /**
     * Enable/disable hiding vegetation during camera movement
     */
    setHideVegetationOnMove(enabled) {
      this.hideVegetationOnMove = enabled;
    }
    /**
     * Check if hide-vegetation-on-move is enabled
     */
    isHideVegetationOnMove() {
      return this.hideVegetationOnMove;
    }
    // =========================================================================
    // MOUSE CONTROLS
    // =========================================================================
    setupMouseControls() {
      this.canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
      this.canvas.addEventListener("mousemove", (e) => this.onMouseMove(e));
      this.canvas.addEventListener("mouseup", (e) => this.onMouseUp(e));
      this.canvas.addEventListener("mouseleave", () => this.onMouseLeave());
      this.canvas.addEventListener("wheel", (e) => this.onWheel(e));
      this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    onMouseDown(e) {
      const mapPos = this.screenToMap(e.clientX, e.clientY);
      this.mouseMapI = mapPos.i;
      this.mouseMapJ = mapPos.j;
      if (e.button === 2) {
        e.preventDefault();
        if (this.placementMode && this.onCancelPlacement) {
          this.onCancelPlacement();
          return;
        }
        if (this.roadDrawingMode && this.onCancelRoadDrawing) {
          this.onCancelRoadDrawing();
          return;
        }
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvas.style.cursor = "grabbing";
      }
      if (e.button === 0) {
        if (this.roadDrawingMode) {
          this.roadDrawingState.isDrawing = true;
          this.roadDrawingState.startX = mapPos.j;
          this.roadDrawingState.startY = mapPos.i;
          this.roadDrawingState.endX = mapPos.j;
          this.roadDrawingState.endY = mapPos.i;
          this.requestRender();
        } else if (this.placementMode) {
        } else {
          const building = this.getBuildingAt(mapPos.j, mapPos.i);
          if (building && this.onBuildingClick) {
            this.onBuildingClick(building.x, building.y, building.visualClass);
          }
        }
      }
    }
    onMouseMove(e) {
      const mapPos = this.screenToMap(e.clientX, e.clientY);
      this.mouseMapI = mapPos.i;
      this.mouseMapJ = mapPos.j;
      if (this.isDragging) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        const config2 = ZOOM_LEVELS[this.terrainRenderer.getZoomLevel()];
        const u = config2.u;
        const deltaI = (dx + 2 * dy) / (2 * u);
        const deltaJ = (2 * dy - dx) / (2 * u);
        this.terrainRenderer.pan(deltaI, deltaJ);
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.markCameraMoving();
        if (this.zoneRequestManager) {
          this.zoneRequestManager.markMoving();
        }
      }
      if (this.roadDrawingMode && this.roadDrawingState.isDrawing) {
        this.roadDrawingState.endX = mapPos.j;
        this.roadDrawingState.endY = mapPos.i;
      }
      if (this.placementMode && this.placementPreview) {
        this.placementPreview.i = mapPos.i;
        this.placementPreview.j = mapPos.j;
      }
      this.hoveredBuilding = this.getBuildingAt(mapPos.j, mapPos.i);
      this.updateCursor();
      this.requestRender();
    }
    onMouseUp(e) {
      if (e.button === 2 && this.isDragging) {
        this.isDragging = false;
        this.updateCursor();
        if (this.zoneRequestManager) {
          const currentZoom = this.terrainRenderer.getZoomLevel();
          this.zoneRequestManager.markStopped(currentZoom);
        }
        this.checkVisibleZones();
      }
      if (e.button === 0 && this.roadDrawingMode && this.roadDrawingState.isDrawing) {
        this.roadDrawingState.isDrawing = false;
        if (this.onRoadSegmentComplete) {
          this.onRoadSegmentComplete(
            this.roadDrawingState.startX,
            this.roadDrawingState.startY,
            this.roadDrawingState.endX,
            this.roadDrawingState.endY
          );
        }
      }
    }
    onMouseLeave() {
      if (this.isDragging) {
        this.isDragging = false;
        this.updateCursor();
        if (this.zoneRequestManager) {
          const currentZoom = this.terrainRenderer.getZoomLevel();
          this.zoneRequestManager.markStopped(currentZoom);
        }
        this.checkVisibleZones();
      }
    }
    onWheel(e) {
      e.preventDefault();
      const oldZoom = this.terrainRenderer.getZoomLevel();
      const newZoom = e.deltaY > 0 ? Math.max(0, oldZoom - 1) : Math.min(3, oldZoom + 1);
      if (newZoom !== oldZoom) {
        this.terrainRenderer.setZoomLevel(newZoom);
        this.terrainRenderer.clearDistantZoomCaches(newZoom);
        if (this.zoneRequestManager) {
          this.zoneRequestManager.markMoving();
          this.zoneRequestManager.markStopped(newZoom);
        }
        this.checkVisibleZones();
        this.requestRender();
      }
    }
    updateCursor() {
      if (this.placementMode || this.roadDrawingMode) {
        this.canvas.style.cursor = "crosshair";
      } else if (this.hoveredBuilding) {
        this.canvas.style.cursor = "pointer";
      } else if (this.isDragging) {
        this.canvas.style.cursor = "grabbing";
      } else {
        this.canvas.style.cursor = "grab";
      }
    }
    /**
     * Convert screen coordinates to map coordinates
     */
    screenToMap(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      const mapPos = this.terrainRenderer.screenToMap(screenX, screenY);
      return { i: Math.floor(mapPos.x), j: Math.floor(mapPos.y) };
    }
    /**
     * Get building at map coordinates
     */
    getBuildingAt(x, y) {
      for (const building of this.allBuildings) {
        const dims = this.facilityDimensionsCache.get(building.visualClass);
        const xsize = dims?.xsize || 1;
        const ysize = dims?.ysize || 1;
        if (x >= building.x && x < building.x + xsize && y >= building.y && y < building.y + ysize) {
          return building;
        }
      }
      return null;
    }
    /**
     * Check and load zones for visible area
     */
    checkVisibleZones() {
      if (!this.zoneRequestManager) {
        return;
      }
      const bounds = this.getVisibleBounds();
      const cameraPos = this.terrainRenderer.getCameraPosition();
      const currentZoom = this.terrainRenderer.getZoomLevel();
      this.zoneRequestManager.requestVisibleZones(
        bounds,
        this.cachedZones,
        cameraPos,
        currentZoom
      );
    }
    // =========================================================================
    // CLEANUP
    // =========================================================================
    destroy() {
      if (this.pendingRender !== null) {
        cancelAnimationFrame(this.pendingRender);
        this.pendingRender = null;
      }
      if (this.cameraStopTimer !== null) {
        clearTimeout(this.cameraStopTimer);
        this.cameraStopTimer = null;
      }
      if (this.touchHandler) {
        this.touchHandler.destroy();
        this.touchHandler = null;
      }
      this.terrainRenderer.destroy();
      this.gameObjectTextureCache.clear();
      this.cachedZones.clear();
      this.allBuildings = [];
      this.allSegments = [];
      this.roadTilesMap.clear();
      this.concreteTilesSet.clear();
      this.facilityDimensionsCache.clear();
      if (this.zoneRequestManager) {
        this.zoneRequestManager.clear();
        this.zoneRequestManager = null;
      }
      this.onLoadZone = null;
      this.onBuildingClick = null;
      this.onCancelPlacement = null;
      this.onFetchFacilityDimensions = null;
      this.onRoadSegmentComplete = null;
      this.onCancelRoadDrawing = null;
    }
  };

  // src/client/ui/map-navigation-ui.ts
  var MapNavigationUI = class {
    constructor(gamePanel) {
      this.gamePanel = gamePanel;
      this.canvas = null;
      this.renderer = null;
      // Callbacks
      this.onLoadZone = null;
      this.onBuildingClick = null;
      this.onFetchFacilityDimensions = null;
    }
    /**
     * Set callback for loading new zones
     */
    setOnLoadZone(callback) {
      this.onLoadZone = callback;
      console.log("[MapNavigationUI] onLoadZone callback set");
      if (this.renderer) {
        console.log("[MapNavigationUI] Triggering initial zone load");
        setTimeout(() => {
          this.renderer?.triggerZoneCheck();
        }, 100);
      }
    }
    /**
     * Set callback for building clicks
     */
    setOnBuildingClick(callback) {
      this.onBuildingClick = callback;
    }
    /**
     * Set callback for fetching facility dimensions
     */
    setOnFetchFacilityDimensions(callback) {
      this.onFetchFacilityDimensions = callback;
    }
    /**
     * Initialize the canvas and renderer
     */
    init() {
      const placeholder = this.gamePanel.querySelector("div");
      if (placeholder) {
        placeholder.remove();
      }
      this.canvas = document.createElement("canvas");
      this.canvas.id = "game-canvas";
      this.canvas.style.flex = "1";
      this.canvas.style.width = "100%";
      this.canvas.style.backgroundColor = "#111";
      this.gamePanel.appendChild(this.canvas);
      console.log("[MapNavigationUI] Initializing Canvas 2D isometric renderer");
      this.renderer = new IsometricMapRenderer("game-canvas");
      this.setupRendererCallbacks();
      this.createVegetationControls();
      this.renderer.loadMap("Shamba").then(() => {
        console.log("[MapNavigationUI] Terrain loaded successfully");
      }).catch((err) => {
        console.error("[MapNavigationUI] Failed to load terrain:", err);
      });
    }
    /**
     * Setup renderer callbacks
     */
    setupRendererCallbacks() {
      if (!this.renderer) return;
      this.renderer.setLoadZoneCallback((x, y, w, h) => {
        console.log(`[MapNavigationUI] Zone callback triggered: (${x}, ${y}) ${w}x${h}, onLoadZone=${!!this.onLoadZone}`);
        if (this.onLoadZone) {
          this.onLoadZone(x, y, w, h);
        } else {
          console.warn("[MapNavigationUI] onLoadZone callback not set yet!");
        }
      });
      this.renderer.setBuildingClickCallback((x, y, visualClass) => {
        if (this.onBuildingClick) this.onBuildingClick(x, y, visualClass);
      });
      this.renderer.setFetchFacilityDimensionsCallback(async (visualClass) => {
        if (this.onFetchFacilityDimensions) {
          return await this.onFetchFacilityDimensions(visualClass);
        }
        return null;
      });
    }
    /**
     * Get the renderer (for map data operations)
     */
    getRenderer() {
      return this.renderer;
    }
    /**
     * Create vegetation display controls
     */
    createVegetationControls() {
      if (!this.renderer) return;
      const panel = document.createElement("div");
      panel.id = "vegetation-controls";
      panel.style.cssText = "position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.7);padding:8px 12px;border-radius:6px;color:#fff;font:12px monospace;z-index:10;display:flex;flex-direction:column;gap:4px;";
      const moveLabel = document.createElement("label");
      moveLabel.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;";
      const moveCheckbox = document.createElement("input");
      moveCheckbox.type = "checkbox";
      moveCheckbox.checked = false;
      moveCheckbox.addEventListener("change", () => {
        this.renderer?.setHideVegetationOnMove(moveCheckbox.checked);
      });
      moveLabel.appendChild(moveCheckbox);
      moveLabel.appendChild(document.createTextNode("Hide vegetation on move"));
      panel.appendChild(moveLabel);
      this.gamePanel.style.position = "relative";
      this.gamePanel.appendChild(panel);
    }
    /**
     * Destroy renderer and cleanup
     */
    destroy() {
      this.renderer?.destroy();
      this.renderer = null;
      if (this.canvas) {
        this.canvas.remove();
        this.canvas = null;
      }
    }
  };

  // src/client/ui/toolbar-ui.ts
  var ToolbarUI = class {
    constructor() {
      this.toolbar = null;
      this.container = null;
      // Callbacks for unimplemented buttons
      this.onBuildMenu = null;
      this.onBuildRoad = null;
      this.onSearch = null;
      this.onCompanyMenu = null;
      this.onMail = null;
      this.onSettings = null;
      this.onRefresh = null;
      this.onLogout = null;
      // Button references for state updates
      this.roadBuildingBtn = null;
      this.mailBtn = null;
      this.mailBadge = null;
      this.container = document.getElementById("toolbar-container");
      if (!this.container) {
        console.warn("Toolbar container not found in header, toolbar will not be displayed");
      }
    }
    /**
     * Initialize toolbar - should be called when game starts
     */
    init() {
      if (!this.container) return;
      this.createToolbar();
    }
    /**
     * Définit le callback pour le menu Build
     */
    setOnBuildMenu(callback) {
      this.onBuildMenu = callback;
    }
    /**
     * Définit le callback pour Build Road
     */
    setOnBuildRoad(callback) {
      this.onBuildRoad = callback;
    }
    /**
     * Définit le callback pour Search
     */
    setOnSearch(callback) {
      this.onSearch = callback;
    }
    /**
     * Définit le callback pour le menu Company
     */
    setOnCompanyMenu(callback) {
      this.onCompanyMenu = callback;
    }
    /**
     * Définit le callback pour Mail
     */
    setOnMail(callback) {
      this.onMail = callback;
    }
    /**
     * Définit le callback pour Settings
     */
    setOnSettings(callback) {
      this.onSettings = callback;
    }
    /**
     * Définit le callback pour Refresh Map
     */
    setOnRefresh(callback) {
      this.onRefresh = callback;
    }
    /**
     * Définit le callback pour Logout
     */
    setOnLogout(callback) {
      this.onLogout = callback;
    }
    /**
     * Creates the toolbar
     */
    createToolbar() {
      this.toolbar = document.createElement("div");
      this.toolbar.id = "toolbar";
      this.toolbar.style.cssText = `
      display: flex;
      gap: var(--space-2);
      background: rgba(51, 65, 85, 0.3);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-2xl);
      padding: var(--space-2);
    `;
      const buttons = [
        {
          icon: "\u{1F528}",
          label: "Build",
          tooltip: "Construction Menu",
          callback: () => this.onBuildMenu?.()
        },
        {
          icon: "\u{1F6E4}\uFE0F",
          label: "Road",
          tooltip: "Build Roads",
          callback: () => this.onBuildRoad?.(),
          isRoadButton: true
        },
        {
          icon: "\u{1F50D}",
          label: "Search",
          tooltip: "Search Buildings",
          callback: () => this.onSearch?.()
        },
        {
          icon: "\u{1F3E2}",
          label: "Company",
          tooltip: "Company Overview",
          callback: () => this.onCompanyMenu?.()
        },
        {
          icon: "\u2709\uFE0F",
          label: "Mail",
          tooltip: "Messages",
          callback: () => this.onMail?.(),
          isMailButton: true
        },
        {
          icon: "\u2699\uFE0F",
          label: "Settings",
          tooltip: "Game Settings",
          callback: () => this.onSettings?.()
        },
        {
          icon: "\u{1F504}",
          label: "Refresh",
          tooltip: "Refresh Map",
          callback: () => this.onRefresh?.()
        },
        {
          icon: "\u{1F6AA}",
          label: "Logout",
          tooltip: "Logout",
          callback: () => this.onLogout?.(),
          isLogoutButton: true
        }
      ];
      buttons.forEach((btnConfig) => {
        const btn = this.createToolbarButton(btnConfig.icon, btnConfig.label, btnConfig.tooltip, btnConfig.callback);
        if ("isRoadButton" in btnConfig && btnConfig.isRoadButton) {
          this.roadBuildingBtn = btn;
        }
        if ("isMailButton" in btnConfig && btnConfig.isMailButton) {
          this.mailBtn = btn;
        }
        if ("isLogoutButton" in btnConfig && btnConfig.isLogoutButton) {
          btn.classList.add("logout-btn");
        }
        this.toolbar.appendChild(btn);
      });
      this.container.appendChild(this.toolbar);
    }
    /**
     * Crée un bouton de toolbar avec tooltip
     */
    createToolbarButton(icon, label, tooltip, callback) {
      const btn = document.createElement("button");
      btn.className = "toolbar-btn";
      btn.title = tooltip;
      btn.setAttribute("aria-label", tooltip);
      btn.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      padding: var(--space-3);
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-lg);
      color: var(--text-secondary);
      font-family: var(--font-primary);
      font-size: var(--text-sm);
      font-weight: 600;
      cursor: pointer;
      transition: all var(--transition-base);
      min-width: 44px;
      min-height: 44px;
    `;
      const iconSpan = document.createElement("span");
      iconSpan.textContent = icon;
      iconSpan.style.fontSize = "20px";
      iconSpan.style.lineHeight = "1";
      btn.appendChild(iconSpan);
      const tooltipEl = document.createElement("div");
      tooltipEl.className = "toolbar-tooltip";
      tooltipEl.textContent = tooltip;
      tooltipEl.style.cssText = `
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      font-size: var(--text-xs);
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity var(--transition-base);
      box-shadow: var(--shadow-lg);
      border: 1px solid var(--glass-border);
      z-index: 1;
    `;
      btn.appendChild(tooltipEl);
      btn.onmouseenter = () => {
        btn.style.background = "rgba(51, 65, 85, 0.6)";
        btn.style.borderColor = "var(--primary-blue)";
        btn.style.color = "var(--primary-blue-light)";
        btn.style.transform = "translateY(-2px)";
        tooltipEl.style.opacity = "1";
      };
      btn.onmouseleave = () => {
        btn.style.background = "transparent";
        btn.style.borderColor = "transparent";
        btn.style.color = "var(--text-secondary)";
        btn.style.transform = "translateY(0)";
        tooltipEl.style.opacity = "0";
      };
      btn.onmousedown = () => {
        btn.style.transform = "translateY(0) scale(0.95)";
      };
      btn.onmouseup = () => {
        btn.style.transform = "translateY(-2px) scale(1)";
      };
      btn.onclick = () => {
        callback();
        this.showButtonFeedback(btn);
      };
      return btn;
    }
    /**
     * Display visual feedback on click
     */
    showButtonFeedback(btn) {
      const ripple = document.createElement("span");
      ripple.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 10px;
      height: 10px;
      background: var(--primary-blue-light);
      border-radius: 50%;
      transform: translate(-50%, -50%) scale(0);
      opacity: 0.5;
      pointer-events: none;
      animation: ripple 0.6s ease-out;
    `;
      btn.appendChild(ripple);
      if (!document.querySelector("#ripple-keyframes")) {
        const style = document.createElement("style");
        style.id = "ripple-keyframes";
        style.textContent = `
        @keyframes ripple {
          to {
            transform: translate(-50%, -50%) scale(4);
            opacity: 0;
          }
        }
      `;
        document.head.appendChild(style);
      }
      setTimeout(() => ripple.remove(), 600);
    }
    /**
     * Met en surbrillance un bouton (pour indiquer un état actif)
     */
    highlightButton(buttonLabel) {
      if (!this.toolbar) return;
      const buttons = this.toolbar.querySelectorAll(".toolbar-btn");
      buttons.forEach((btn, index) => {
        const labels = ["Build", "Search", "Company", "Mail", "Settings"];
        if (labels[index] === buttonLabel) {
          btn.style.background = "rgba(14, 165, 233, 0.2)";
          btn.style.borderColor = "var(--primary-blue)";
        } else {
          btn.style.background = "transparent";
          btn.style.borderColor = "transparent";
        }
      });
    }
    /**
     * Réinitialise tous les boutons
     */
    clearHighlights() {
      if (!this.toolbar) return;
      const buttons = this.toolbar.querySelectorAll(".toolbar-btn");
      buttons.forEach((btn) => {
        btn.style.background = "transparent";
        btn.style.borderColor = "transparent";
      });
    }
    /**
     * Show/hide the toolbar
     */
    setVisible(visible) {
      if (this.toolbar) {
        this.toolbar.style.display = visible ? "flex" : "none";
      }
    }
    /**
     * Détruit la toolbar
     */
    destroy() {
      if (this.toolbar && this.toolbar.parentElement) {
        this.toolbar.parentElement.removeChild(this.toolbar);
        this.toolbar = null;
      }
    }
    /**
     * Set unread mail badge count on the mail button
     */
    setMailBadge(count) {
      if (!this.mailBtn) return;
      if (this.mailBadge) {
        this.mailBadge.remove();
        this.mailBadge = null;
      }
      if (count <= 0) return;
      this.mailBadge = document.createElement("span");
      this.mailBadge.textContent = count > 99 ? "99+" : String(count);
      this.mailBadge.style.cssText = `
      position: absolute;
      top: 2px;
      right: 2px;
      min-width: 18px;
      height: 18px;
      background: #ef4444;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      line-height: 18px;
      text-align: center;
      border-radius: 9px;
      padding: 0 4px;
      pointer-events: none;
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    `;
      this.mailBtn.appendChild(this.mailBadge);
    }
    /**
     * Set road building button active state
     */
    setRoadBuildingActive(active) {
      if (!this.roadBuildingBtn) return;
      if (active) {
        this.roadBuildingBtn.style.background = "rgba(234, 88, 12, 0.3)";
        this.roadBuildingBtn.style.borderColor = "#ea580c";
        this.roadBuildingBtn.style.color = "#fb923c";
        this.roadBuildingBtn.classList.add("road-active");
      } else {
        this.roadBuildingBtn.style.background = "transparent";
        this.roadBuildingBtn.style.borderColor = "transparent";
        this.roadBuildingBtn.style.color = "var(--text-secondary)";
        this.roadBuildingBtn.classList.remove("road-active");
      }
    }
  };

  // src/client/ui/tycoon-stats-ui.ts
  var TycoonStatsUI = class {
    constructor() {
      this.container = null;
      this.statsPanel = null;
      this.container = document.getElementById("tycoon-stats-container");
      if (!this.container) {
        console.warn("[TycoonStatsUI] Container not found, creating dynamically");
        const header = document.querySelector("header");
        if (header) {
          this.container = document.createElement("div");
          this.container.id = "tycoon-stats-container";
          this.container.style.cssText = `
          display: flex;
          align-items: center;
          margin-left: auto;
        `;
          const toolbarContainer = document.getElementById("toolbar-container");
          if (toolbarContainer) {
            toolbarContainer.insertAdjacentElement("afterend", this.container);
          } else {
            header.appendChild(this.container);
          }
          console.log("[TycoonStatsUI] Container created and inserted into header");
        } else {
          console.error("[TycoonStatsUI] No header element found in DOM");
        }
      }
    }
    /**
     * Initialize stats panel
     */
    init(username) {
      console.log("[TycoonStatsUI] init() called with username:", username);
      if (!this.container) {
        console.error("[TycoonStatsUI] Cannot init - container is null");
        return;
      }
      this.statsPanel = document.createElement("div");
      this.statsPanel.id = "tycoon-stats";
      this.statsPanel.style.cssText = `
      display: flex;
      align-items: center;
      gap: var(--space-4);
      background: rgba(51, 65, 85, 0.3);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-2xl);
      padding: var(--space-2) var(--space-4);
      font-family: var(--font-primary);
    `;
      const rankingEl = this.createStatElement("\u{1F3C6}", `#0 ${username}`, "Ranking & Username");
      rankingEl.dataset.type = "ranking";
      const buildingsEl = this.createStatElement("\u{1F3E2}", "0/0", "Buildings");
      buildingsEl.dataset.type = "buildings";
      const cashEl = this.createStatElement("\u{1F4B0}", "$0", "Cash");
      cashEl.dataset.type = "cash";
      const incomeEl = this.createStatElement("\u{1F4C8}", "$0/h", "Income per Hour");
      incomeEl.dataset.type = "income";
      const prestigeEl = this.createStatElement("\u2728", "0", "Prestige");
      prestigeEl.dataset.type = "prestige";
      prestigeEl.style.display = "none";
      const areaEl = this.createStatElement("\u{1F4D0}", "0", "Land Area");
      areaEl.dataset.type = "area";
      areaEl.style.display = "none";
      this.statsPanel.appendChild(rankingEl);
      this.statsPanel.appendChild(buildingsEl);
      this.statsPanel.appendChild(cashEl);
      this.statsPanel.appendChild(incomeEl);
      this.statsPanel.appendChild(prestigeEl);
      this.statsPanel.appendChild(areaEl);
      this.container.appendChild(this.statsPanel);
    }
    /**
     * Create a stat element
     */
    createStatElement(icon, value, tooltip) {
      const statEl = document.createElement("div");
      statEl.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: 600;
      transition: color var(--transition-base);
    `;
      const iconSpan = document.createElement("span");
      iconSpan.textContent = icon;
      iconSpan.style.fontSize = "18px";
      iconSpan.style.lineHeight = "1";
      statEl.appendChild(iconSpan);
      const valueSpan = document.createElement("span");
      valueSpan.className = "stat-value";
      valueSpan.textContent = value;
      valueSpan.style.cssText = `
      color: var(--text-primary);
      font-weight: 700;
      letter-spacing: 0.02em;
    `;
      statEl.appendChild(valueSpan);
      const tooltipEl = document.createElement("div");
      tooltipEl.className = "stat-tooltip";
      tooltipEl.textContent = tooltip;
      tooltipEl.style.cssText = `
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      font-size: var(--text-xs);
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity var(--transition-base);
      box-shadow: var(--shadow-lg);
      border: 1px solid var(--glass-border);
      z-index: 10;
    `;
      statEl.appendChild(tooltipEl);
      statEl.onmouseenter = () => {
        statEl.style.color = "var(--primary-blue-light)";
        tooltipEl.style.opacity = "1";
      };
      statEl.onmouseleave = () => {
        statEl.style.color = "var(--text-secondary)";
        tooltipEl.style.opacity = "0";
      };
      return statEl;
    }
    /**
     * Update tycoon stats
     */
    updateStats(stats) {
      console.log("[TycoonStatsUI] updateStats() called:", stats);
      if (!this.statsPanel) {
        console.error("[TycoonStatsUI] Cannot update - statsPanel not initialized yet");
        return;
      }
      const rankingEl = this.statsPanel.querySelector('[data-type="ranking"] .stat-value');
      if (rankingEl) {
        rankingEl.textContent = `#${stats.ranking} ${stats.username}`;
      }
      const buildingsEl = this.statsPanel.querySelector('[data-type="buildings"] .stat-value');
      if (buildingsEl) {
        buildingsEl.textContent = `${stats.buildingCount}/${stats.maxBuildings}`;
      }
      const cashEl = this.statsPanel.querySelector('[data-type="cash"] .stat-value');
      if (cashEl) {
        cashEl.textContent = this.formatCurrency(stats.cash);
      }
      const incomeEl = this.statsPanel.querySelector('[data-type="income"] .stat-value');
      if (incomeEl) {
        incomeEl.textContent = `${this.formatCurrency(stats.incomePerHour)}/h`;
      }
      if (stats.prestige !== void 0) {
        const prestigeContainer = this.statsPanel.querySelector('[data-type="prestige"]');
        const prestigeVal = prestigeContainer?.querySelector(".stat-value");
        if (prestigeContainer && prestigeVal) {
          prestigeContainer.style.display = "flex";
          prestigeVal.textContent = String(Math.round(stats.prestige));
        }
      }
      if (stats.area !== void 0) {
        const areaContainer = this.statsPanel.querySelector('[data-type="area"]');
        const areaVal = areaContainer?.querySelector(".stat-value");
        if (areaContainer && areaVal) {
          areaContainer.style.display = "flex";
          areaVal.textContent = String(stats.area);
        }
      }
      if (stats.levelName) {
        const rankingVal = this.statsPanel.querySelector('[data-type="ranking"] .stat-value');
        if (rankingVal) {
          rankingVal.textContent = `#${stats.ranking} ${stats.username} (${stats.levelName})`;
        }
      }
    }
    /**
     * Format currency string (handles both string and number formats)
     */
    formatCurrency(value) {
      const cleaned = value.replace(/[$\s]/g, "");
      const num = parseFloat(cleaned);
      if (isNaN(num)) {
        return `$${cleaned}`;
      }
      if (num >= 1e9) {
        return `$${(num / 1e9).toFixed(2)}B`;
      } else if (num >= 1e6) {
        return `$${(num / 1e6).toFixed(2)}M`;
      } else if (num >= 1e3) {
        return `$${(num / 1e3).toFixed(2)}K`;
      } else {
        return `$${num.toFixed(2)}`;
      }
    }
    /**
     * Hide stats panel
     */
    hide() {
      if (this.statsPanel) {
        this.statsPanel.style.display = "none";
      }
    }
    /**
     * Show stats panel
     */
    show() {
      if (this.statsPanel) {
        this.statsPanel.style.display = "flex";
      }
    }
    /**
     * Destroy stats panel
     */
    destroy() {
      if (this.statsPanel && this.statsPanel.parentElement) {
        this.statsPanel.parentElement.removeChild(this.statsPanel);
        this.statsPanel = null;
      }
    }
  };

  // src/client/ui/build-menu-ui.ts
  var BuildMenuUI = class {
    constructor() {
      // DOM elements
      this.container = null;
      this.categoriesContainer = null;
      this.facilitiesContainer = null;
      this.backButton = null;
      this.currentView = "categories";
      this.selectedCategory = null;
      // Callbacks
      this.onCategorySelected = null;
      this.onBuildingSelected = null;
      this.onClose = null;
      // Track if menu was closed due to building selection
      this.closedForPlacement = false;
      this.init();
    }
    /**
     * Initialize the UI
     */
    init() {
      this.container = document.createElement("div");
      this.container.id = "build-menu";
      this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 600px;
      max-height: 70vh;
      background: rgba(20, 20, 30, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-lg);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(10px);
      display: none;
      flex-direction: column;
      z-index: 1000;
      overflow: hidden;
    `;
      const header = document.createElement("div");
      header.style.cssText = `
      padding: var(--space-4);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
      const title = document.createElement("h2");
      title.textContent = "Build Menu";
      title.style.cssText = `
      margin: 0;
      font-size: var(--text-lg);
      color: var(--text-primary);
    `;
      this.backButton = document.createElement("button");
      this.backButton.textContent = "\u2190 Back";
      this.backButton.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: var(--text-primary);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      cursor: pointer;
      font-size: var(--text-sm);
      display: none;
    `;
      this.backButton.onmouseover = () => {
        this.backButton.style.background = "rgba(255, 255, 255, 0.15)";
      };
      this.backButton.onmouseout = () => {
        this.backButton.style.background = "rgba(255, 255, 255, 0.1)";
      };
      this.backButton.onclick = () => this.showCategories();
      const closeButton = document.createElement("button");
      closeButton.textContent = "\xD7";
      closeButton.style.cssText = `
      background: none;
      border: none;
      color: var(--text-primary);
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      line-height: 24px;
    `;
      closeButton.onclick = () => this.hide();
      header.appendChild(this.backButton);
      header.appendChild(title);
      header.appendChild(closeButton);
      const content = document.createElement("div");
      content.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: var(--space-4);
    `;
      this.categoriesContainer = document.createElement("div");
      this.categoriesContainer.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: var(--space-3);
    `;
      this.facilitiesContainer = document.createElement("div");
      this.facilitiesContainer.style.cssText = `
      display: none;
      flex-direction: column;
      gap: var(--space-3);
    `;
      content.appendChild(this.categoriesContainer);
      content.appendChild(this.facilitiesContainer);
      this.container.appendChild(header);
      this.container.appendChild(content);
      document.body.appendChild(this.container);
    }
    /**
     * Set callback for category selection
     */
    setOnCategorySelected(callback) {
      this.onCategorySelected = callback;
    }
    /**
     * Set callback for building selection
     */
    setOnBuildingSelected(callback) {
      this.onBuildingSelected = callback;
    }
    /**
     * Set callback for menu close
     */
    setOnClose(callback) {
      this.onClose = callback;
    }
    /**
     * Show the build menu with categories
     */
    show(categories) {
      if (!this.container || !this.categoriesContainer) return;
      this.currentView = "categories";
      this.container.style.display = "flex";
      this.renderCategories(categories);
      this.showCategories();
    }
    /**
     * Hide the build menu
     */
    hide() {
      if (!this.container) return;
      this.container.style.display = "none";
      if (this.onClose && !this.closedForPlacement) {
        this.onClose();
      }
      this.closedForPlacement = false;
    }
    /**
     * Show categories view
     */
    showCategories() {
      this.currentView = "categories";
      if (this.categoriesContainer) {
        this.categoriesContainer.style.display = "grid";
      }
      if (this.facilitiesContainer) {
        this.facilitiesContainer.style.display = "none";
      }
      if (this.backButton) {
        this.backButton.style.display = "none";
      }
    }
    /**
     * Show facilities view
     */
    showFacilities(category, facilities) {
      this.selectedCategory = category;
      this.currentView = "facilities";
      if (this.categoriesContainer) {
        this.categoriesContainer.style.display = "none";
      }
      if (this.facilitiesContainer) {
        this.facilitiesContainer.style.display = "flex";
      }
      if (this.backButton) {
        this.backButton.style.display = "block";
      }
      this.renderFacilities(facilities);
    }
    /**
     * Render category cards
     */
    renderCategories(categories) {
      if (!this.categoriesContainer) return;
      this.categoriesContainer.innerHTML = "";
      categories.forEach((category) => {
        const card = document.createElement("div");
        card.style.cssText = `
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        cursor: pointer;
        text-align: center;
        transition: all 0.2s;
      `;
        card.onmouseover = () => {
          card.style.background = "rgba(255, 255, 255, 0.1)";
          card.style.borderColor = "rgba(255, 255, 255, 0.3)";
        };
        card.onmouseout = () => {
          card.style.background = "rgba(255, 255, 255, 0.05)";
          card.style.borderColor = "rgba(255, 255, 255, 0.1)";
        };
        card.onclick = () => {
          if (this.onCategorySelected) {
            this.onCategorySelected(category);
          }
        };
        if (category.iconPath) {
          const icon = document.createElement("img");
          icon.src = this.normalizeImagePath(category.iconPath);
          icon.style.cssText = `
          width: 64px;
          height: 64px;
          object-fit: contain;
          margin-bottom: var(--space-2);
        `;
          card.appendChild(icon);
        }
        const name = document.createElement("div");
        name.textContent = category.kindName;
        name.style.cssText = `
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-weight: 500;
      `;
        card.appendChild(name);
        this.categoriesContainer.appendChild(card);
      });
    }
    /**
     * Render facility list
     */
    renderFacilities(facilities) {
      if (!this.facilitiesContainer) return;
      this.facilitiesContainer.innerHTML = "";
      facilities.forEach((facility) => {
        const card = document.createElement("div");
        card.style.cssText = `
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        display: flex;
        gap: var(--space-3);
        ${!facility.available ? "opacity: 0.5; cursor: not-allowed;" : "cursor: pointer;"}
        transition: all 0.2s;
      `;
        if (facility.available) {
          card.onmouseover = () => {
            card.style.background = "rgba(255, 255, 255, 0.1)";
            card.style.borderColor = "rgba(255, 255, 255, 0.3)";
          };
          card.onmouseout = () => {
            card.style.background = "rgba(255, 255, 255, 0.05)";
            card.style.borderColor = "rgba(255, 255, 255, 0.1)";
          };
          card.onclick = () => {
            if (this.onBuildingSelected) {
              this.closedForPlacement = true;
              this.onBuildingSelected(facility);
              this.hide();
            }
          };
        }
        const iconContainer = document.createElement("div");
        iconContainer.style.cssText = `
        flex-shrink: 0;
      `;
        if (facility.iconPath) {
          const icon = document.createElement("img");
          icon.src = this.normalizeImagePath(facility.iconPath);
          icon.style.cssText = `
          width: 80px;
          height: 60px;
          object-fit: contain;
        `;
          iconContainer.appendChild(icon);
        }
        const info = document.createElement("div");
        info.style.cssText = `
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      `;
        const name = document.createElement("div");
        name.textContent = facility.name;
        name.style.cssText = `
        color: var(--text-primary);
        font-size: var(--text-base);
        font-weight: 600;
      `;
        const details = document.createElement("div");
        details.style.cssText = `
        display: flex;
        gap: var(--space-3);
        font-size: var(--text-sm);
        color: var(--text-secondary);
      `;
        const cost = document.createElement("span");
        cost.textContent = `$${this.formatCost(facility.cost)}`;
        cost.style.color = "var(--success)";
        const area = document.createElement("span");
        area.textContent = `${facility.area} m\xB2`;
        details.appendChild(cost);
        details.appendChild(area);
        if (facility.description) {
          const desc = document.createElement("div");
          desc.textContent = facility.description;
          desc.style.cssText = `
          font-size: var(--text-xs);
          color: var(--text-secondary);
          line-height: 1.4;
        `;
          info.appendChild(name);
          info.appendChild(details);
          info.appendChild(desc);
        } else {
          info.appendChild(name);
          info.appendChild(details);
        }
        const buildButton = document.createElement("button");
        buildButton.textContent = facility.available ? "Build" : "Locked";
        buildButton.disabled = !facility.available;
        buildButton.style.cssText = `
        background: ${facility.available ? "var(--primary)" : "rgba(255, 255, 255, 0.1)"};
        border: none;
        color: var(--text-primary);
        padding: var(--space-2) var(--space-4);
        border-radius: var(--radius-md);
        cursor: ${facility.available ? "pointer" : "not-allowed"};
        font-size: var(--text-sm);
        font-weight: 600;
        align-self: center;
      `;
        if (facility.available) {
          buildButton.onmouseover = () => {
            buildButton.style.background = "var(--primary-hover)";
          };
          buildButton.onmouseout = () => {
            buildButton.style.background = "var(--primary)";
          };
          buildButton.onclick = (e) => {
            e.stopPropagation();
            if (this.onBuildingSelected) {
              this.closedForPlacement = true;
              this.onBuildingSelected(facility);
              this.hide();
            }
          };
        }
        card.appendChild(iconContainer);
        card.appendChild(info);
        card.appendChild(buildButton);
        this.facilitiesContainer.appendChild(card);
      });
    }
    /**
     * Normalize image path to absolute URL
     */
    normalizeImagePath(path) {
      if (path.startsWith("/proxy-image")) {
        return path;
      }
      if (path.startsWith("http://") || path.startsWith("https://")) {
        return path;
      }
      const BASE_IMAGE_URL = "http://www.starpeaceonline.com/five/0/visual/voyager/Build/";
      const cleanPath = path.startsWith("/") ? path.substring(1) : path;
      return BASE_IMAGE_URL + cleanPath;
    }
    /**
     * Format cost with K/M suffix
     */
    formatCost(cost) {
      if (cost >= 1e6) {
        return `${(cost / 1e6).toFixed(1)}M`;
      } else if (cost >= 1e3) {
        return `${(cost / 1e3).toFixed(0)}K`;
      }
      return cost.toString();
    }
  };

  // src/client/ui/zone-overlay-ui.ts
  var ZoneOverlayUI = class {
    constructor() {
      this.button = null;
      this.isEnabled = false;
      this.onToggle = null;
      this.init();
    }
    /**
     * Initialize the UI
     */
    init() {
      this.button = document.createElement("button");
      this.button.id = "zone-overlay-button";
      this.button.textContent = "Zones";
      this.button.title = "Toggle zone overlay";
      this.button.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: var(--text-primary);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      cursor: pointer;
      font-size: var(--text-sm);
      transition: all 0.2s;
    `;
      this.button.onmouseover = () => {
        if (this.button) {
          this.button.style.background = "rgba(255, 255, 255, 0.15)";
        }
      };
      this.button.onmouseout = () => {
        if (this.button) {
          this.button.style.background = this.isEnabled ? "rgba(66, 153, 225, 0.3)" : "rgba(255, 255, 255, 0.1)";
        }
      };
      this.button.onclick = () => {
        this.toggle();
      };
      const toolbar = document.getElementById("toolbar");
      if (toolbar) {
        toolbar.appendChild(this.button);
      }
    }
    /**
     * Set callback for toggle
     */
    setOnToggle(callback) {
      this.onToggle = callback;
    }
    /**
     * Toggle zone overlay
     */
    toggle() {
      this.isEnabled = !this.isEnabled;
      if (this.button) {
        this.button.style.background = this.isEnabled ? "rgba(66, 153, 225, 0.3)" : "rgba(255, 255, 255, 0.1)";
        this.button.style.borderColor = this.isEnabled ? "rgba(66, 153, 225, 0.5)" : "rgba(255, 255, 255, 0.2)";
      }
      if (this.onToggle) {
        this.onToggle(this.isEnabled, "ZONES" /* ZONES */);
      }
    }
    /**
     * Enable/disable the button
     */
    setEnabled(enabled) {
      if (this.button) {
        this.button.disabled = !enabled;
        this.button.style.opacity = enabled ? "1" : "0.5";
        this.button.style.cursor = enabled ? "pointer" : "not-allowed";
      }
    }
  };

  // src/shared/building-details/property-definitions.ts
  function formatCurrency(value) {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "$0";
    const absNum = Math.abs(num);
    const sign = num < 0 ? "-" : "";
    if (absNum >= 1e9) {
      return `${sign}$${(absNum / 1e9).toFixed(2)}B`;
    } else if (absNum >= 1e6) {
      return `${sign}$${(absNum / 1e6).toFixed(2)}M`;
    } else if (absNum >= 1e3) {
      return `${sign}$${(absNum / 1e3).toFixed(2)}K`;
    }
    return `${sign}$${absNum.toFixed(2)}`;
  }
  function formatPercentage(value) {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "0%";
    return `${num.toFixed(0)}%`;
  }
  function formatNumber(value, unit) {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return "0";
    let formatted;
    if (Math.abs(num) >= 1e6) {
      formatted = `${(num / 1e6).toFixed(2)}M`;
    } else if (Math.abs(num) >= 1e3) {
      formatted = `${(num / 1e3).toFixed(2)}K`;
    } else if (Number.isInteger(num)) {
      formatted = num.toString();
    } else {
      formatted = num.toFixed(2);
    }
    return unit ? `${formatted} ${unit}` : formatted;
  }

  // src/shared/building-details/template-groups.ts
  var GENERIC_GROUP = {
    id: "generic",
    name: "Details",
    icon: "D",
    order: 0,
    properties: [
      { rdoName: "Name", displayName: "Name", type: "TEXT" /* TEXT */ },
      { rdoName: "Creator", displayName: "Owner", type: "TEXT" /* TEXT */ },
      { rdoName: "SecurityId", displayName: "Security ID", type: "TEXT" /* TEXT */ },
      { rdoName: "ObjectId", displayName: "Object ID", type: "TEXT" /* TEXT */, hideEmpty: true },
      { rdoName: "CurrBlock", displayName: "Block ID", type: "TEXT" /* TEXT */, hideEmpty: true },
      { rdoName: "Cost", displayName: "Value", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "ROI", displayName: "ROI", type: "PERCENTAGE" /* PERCENTAGE */, colorCode: "auto" },
      { rdoName: "Years", displayName: "Age", type: "NUMBER" /* NUMBER */, unit: "years" },
      { rdoName: "Trouble", displayName: "Trouble", type: "NUMBER" /* NUMBER */, hideEmpty: true }
    ]
  };
  var UNK_GENERAL_GROUP = {
    id: "unkGeneral",
    name: "General",
    icon: "i",
    order: 0,
    properties: [
      { rdoName: "Name", displayName: "Name", type: "TEXT" /* TEXT */ },
      { rdoName: "Creator", displayName: "Owner", type: "TEXT" /* TEXT */ },
      { rdoName: "Cost", displayName: "Value", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "ROI", displayName: "ROI", type: "PERCENTAGE" /* PERCENTAGE */, colorCode: "auto" },
      { rdoName: "Years", displayName: "Age", type: "NUMBER" /* NUMBER */, unit: "years" },
      { rdoName: "Trouble", displayName: "Status", type: "NUMBER" /* NUMBER */, hideEmpty: true }
    ]
  };
  var IND_GENERAL_GROUP = {
    id: "indGeneral",
    name: "General",
    icon: "i",
    order: 0,
    properties: [
      { rdoName: "Name", displayName: "Name", type: "TEXT" /* TEXT */ },
      { rdoName: "Creator", displayName: "Owner", type: "TEXT" /* TEXT */ },
      { rdoName: "Cost", displayName: "Value", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "ROI", displayName: "ROI", type: "PERCENTAGE" /* PERCENTAGE */, colorCode: "auto" },
      { rdoName: "Years", displayName: "Age", type: "NUMBER" /* NUMBER */, unit: "years" },
      { rdoName: "Trouble", displayName: "Status", type: "NUMBER" /* NUMBER */, hideEmpty: true },
      { rdoName: "Stopped", displayName: "Paused", type: "BOOLEAN" /* BOOLEAN */, editable: true },
      { rdoName: "Role", displayName: "Role", type: "ENUM" /* ENUM */, enumLabels: { "0": "Neutral", "1": "Producer", "2": "Distributor", "3": "Buyer", "4": "Importer", "5": "Export", "6": "Import" } },
      { rdoName: "TradeRole", displayName: "Trade Role", type: "ENUM" /* ENUM */, enumLabels: { "0": "Neutral", "1": "Producer", "2": "Distributor", "3": "Buyer", "4": "Importer", "5": "Export", "6": "Import" } },
      { rdoName: "TradeLevel", displayName: "Trade Level", type: "ENUM" /* ENUM */, editable: true, enumLabels: { "0": "Same Owner", "1": "Subsidiaries", "2": "Allies", "3": "Anyone" } }
    ],
    rdoCommands: {
      "TradeLevel": { command: "RDOSetTradeLevel" },
      "Role": { command: "RDOSetRole" },
      "Stopped": { command: "property" },
      "RDOConnectToTycoon": { command: "RDOConnectToTycoon" },
      "RDODisconnectFromTycoon": { command: "RDODisconnectFromTycoon" }
    }
  };
  var SRV_GENERAL_GROUP = {
    id: "srvGeneral",
    name: "General",
    icon: "i",
    order: 0,
    properties: [
      { rdoName: "Name", displayName: "Name", type: "TEXT" /* TEXT */ },
      { rdoName: "Creator", displayName: "Owner", type: "TEXT" /* TEXT */ },
      { rdoName: "Cost", displayName: "Value", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "ROI", displayName: "ROI", type: "PERCENTAGE" /* PERCENTAGE */, colorCode: "auto" },
      { rdoName: "Years", displayName: "Age", type: "NUMBER" /* NUMBER */, unit: "years" },
      { rdoName: "Trouble", displayName: "Status", type: "NUMBER" /* NUMBER */, hideEmpty: true },
      {
        rdoName: "srvNames",
        displayName: "Services",
        type: "TABLE" /* TABLE */,
        indexed: true,
        countProperty: "ServiceCount",
        columns: [
          { rdoSuffix: "srvNames", label: "Product", type: "TEXT" /* TEXT */, width: "20%" },
          { rdoSuffix: "srvPrices", label: "Price", type: "SLIDER" /* SLIDER */, width: "15%", editable: true, min: 0, max: 500, step: 10 },
          { rdoSuffix: "srvSupplies", label: "Offer", type: "NUMBER" /* NUMBER */, width: "15%" },
          { rdoSuffix: "srvDemands", label: "Demand", type: "NUMBER" /* NUMBER */, width: "15%" },
          { rdoSuffix: "srvMarketPrices", label: "Market", type: "CURRENCY" /* CURRENCY */, width: "15%" },
          { rdoSuffix: "srvAvgPrices", label: "Avg Price", type: "CURRENCY" /* CURRENCY */, width: "15%" }
        ]
      }
    ],
    rdoCommands: {
      "srvPrices": { command: "RDOSetPrice", indexed: true }
    }
  };
  var RES_GENERAL_GROUP = {
    id: "resGeneral",
    name: "General",
    icon: "i",
    order: 0,
    properties: [
      { rdoName: "Name", displayName: "Name", type: "TEXT" /* TEXT */ },
      { rdoName: "Creator", displayName: "Owner", type: "TEXT" /* TEXT */ },
      { rdoName: "Cost", displayName: "Value", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "ROI", displayName: "ROI", type: "PERCENTAGE" /* PERCENTAGE */, colorCode: "auto" },
      { rdoName: "Years", displayName: "Age", type: "NUMBER" /* NUMBER */, unit: "years" },
      { rdoName: "Trouble", displayName: "Status", type: "NUMBER" /* NUMBER */, hideEmpty: true },
      // Residential-specific stats (PopulatedBlock.StoreToCache)
      { rdoName: "Occupancy", displayName: "Occupancy", type: "PERCENTAGE" /* PERCENTAGE */ },
      { rdoName: "Inhabitants", displayName: "Inhabitants", type: "NUMBER" /* NUMBER */ },
      { rdoName: "QOL", displayName: "Quality of Life", type: "PERCENTAGE" /* PERCENTAGE */ },
      { rdoName: "Beauty", displayName: "Beauty", type: "PERCENTAGE" /* PERCENTAGE */ },
      { rdoName: "Crime", displayName: "Crime", type: "PERCENTAGE" /* PERCENTAGE */ },
      { rdoName: "Pollution", displayName: "Pollution", type: "PERCENTAGE" /* PERCENTAGE */ },
      // Investment sliders (ResidentialSheet.pas xfer_ controls)
      { rdoName: "invCrimeRes", displayName: "Crime Resistance", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 500, unit: "%" },
      { rdoName: "invPollutionRes", displayName: "Pollution Resistance", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 500, unit: "%" },
      { rdoName: "invPrivacy", displayName: "Privacy", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 500, unit: "%" },
      { rdoName: "InvBeauty", displayName: "Beauty Investment", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 500, unit: "%" },
      // Editable sliders
      { rdoName: "Rent", displayName: "Rent", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 500, unit: "%" },
      { rdoName: "Maintenance", displayName: "Maintenance", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 500, unit: "%" },
      // Repair info
      { rdoName: "Repair", displayName: "Repair Status", type: "TEXT" /* TEXT */ },
      { rdoName: "RepairPrice", displayName: "Repair Cost", type: "CURRENCY" /* CURRENCY */ }
    ],
    rdoCommands: {
      "Rent": { command: "property" },
      "Maintenance": { command: "property" },
      "invCrimeRes": { command: "property" },
      "invPollutionRes": { command: "property" },
      "invPrivacy": { command: "property" },
      "InvBeauty": { command: "property" }
    }
  };
  var HQ_GENERAL_GROUP = {
    id: "hqGeneral",
    name: "General",
    icon: "i",
    order: 0,
    properties: [
      { rdoName: "Name", displayName: "Name", type: "TEXT" /* TEXT */ },
      { rdoName: "Creator", displayName: "Owner", type: "TEXT" /* TEXT */ },
      { rdoName: "Cost", displayName: "Value", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "ROI", displayName: "ROI", type: "PERCENTAGE" /* PERCENTAGE */, colorCode: "auto" },
      { rdoName: "Years", displayName: "Age", type: "NUMBER" /* NUMBER */, unit: "years" },
      { rdoName: "Trouble", displayName: "Status", type: "NUMBER" /* NUMBER */, hideEmpty: true }
    ]
  };
  var BANK_GENERAL_GROUP = {
    id: "bankGeneral",
    name: "General",
    icon: "i",
    order: 0,
    properties: [
      { rdoName: "Name", displayName: "Name", type: "TEXT" /* TEXT */ },
      { rdoName: "Creator", displayName: "Owner", type: "TEXT" /* TEXT */ },
      { rdoName: "Trouble", displayName: "Status", type: "NUMBER" /* NUMBER */, hideEmpty: true },
      { rdoName: "EstLoan", displayName: "Estimated Loan", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "Interest", displayName: "Interest Rate", type: "PERCENTAGE" /* PERCENTAGE */ },
      { rdoName: "Term", displayName: "Loan Term", type: "NUMBER" /* NUMBER */, unit: "years" },
      { rdoName: "BudgetPerc", displayName: "Budget", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 100, unit: "%" }
    ],
    rdoCommands: {
      "BudgetPerc": { command: "RDOSetLoanPerc" }
    }
  };
  var WH_GENERAL_GROUP = {
    id: "whGeneral",
    name: "General",
    icon: "i",
    order: 0,
    properties: [
      { rdoName: "Name", displayName: "Name", type: "TEXT" /* TEXT */ },
      { rdoName: "Creator", displayName: "Owner", type: "TEXT" /* TEXT */ },
      { rdoName: "Cost", displayName: "Value", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "ROI", displayName: "ROI", type: "PERCENTAGE" /* PERCENTAGE */, colorCode: "auto" },
      { rdoName: "Trouble", displayName: "Status", type: "NUMBER" /* NUMBER */, hideEmpty: true },
      { rdoName: "TradeRole", displayName: "Trade Role", type: "ENUM" /* ENUM */, enumLabels: { "0": "Neutral", "1": "Producer", "2": "Distributor", "3": "Buyer", "4": "Importer", "5": "Export", "6": "Import" } },
      { rdoName: "TradeLevel", displayName: "Trade Level", type: "ENUM" /* ENUM */, editable: true, enumLabels: { "0": "Same Owner", "1": "Subsidiaries", "2": "Allies", "3": "Anyone" } },
      { rdoName: "GateMap", displayName: "Gate Map", type: "NUMBER" /* NUMBER */, hideEmpty: true }
    ],
    rdoCommands: {
      "TradeLevel": { command: "RDOSetTradeLevel" }
    }
  };
  var TV_GENERAL_GROUP = {
    id: "tvGeneral",
    name: "General",
    icon: "i",
    order: 0,
    properties: [
      { rdoName: "Name", displayName: "Name", type: "TEXT" /* TEXT */ },
      { rdoName: "Creator", displayName: "Owner", type: "TEXT" /* TEXT */ },
      { rdoName: "Cost", displayName: "Value", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "ROI", displayName: "ROI", type: "PERCENTAGE" /* PERCENTAGE */, colorCode: "auto" },
      { rdoName: "Years", displayName: "Age", type: "NUMBER" /* NUMBER */, unit: "years" },
      { rdoName: "Trouble", displayName: "Status", type: "NUMBER" /* NUMBER */, hideEmpty: true },
      { rdoName: "HoursOnAir", displayName: "Hours On Air", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 100, unit: "%" },
      { rdoName: "Comercials", displayName: "Commercials", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 100, unit: "%" }
    ],
    rdoCommands: {
      "HoursOnAir": { command: "property" },
      "Comercials": { command: "property" }
    }
  };
  var CAPITOL_GENERAL_GROUP = {
    id: "capitolGeneral",
    name: "General",
    icon: "i",
    order: 0,
    properties: [
      { rdoName: "HasRuler", displayName: "Has Ruler", type: "BOOLEAN" /* BOOLEAN */ },
      { rdoName: "YearsToElections", displayName: "Years to Elections", type: "NUMBER" /* NUMBER */ },
      { rdoName: "RulerActualPrestige", displayName: "Prestige", type: "NUMBER" /* NUMBER */ },
      { rdoName: "RulerRating", displayName: "Ruler Rating", type: "PERCENTAGE" /* PERCENTAGE */ },
      { rdoName: "TycoonsRating", displayName: "Tycoons Rating", type: "PERCENTAGE" /* PERCENTAGE */ },
      {
        rdoName: "covName",
        displayName: "Coverage",
        type: "TABLE" /* TABLE */,
        indexed: true,
        indexSuffix: ".0",
        countProperty: "covCount",
        columns: [
          { rdoSuffix: "covName", label: "Service", type: "TEXT" /* TEXT */, width: "50%" },
          { rdoSuffix: "covValue", label: "Coverage", type: "PERCENTAGE" /* PERCENTAGE */, width: "50%" }
        ]
      }
    ]
  };
  var TOWN_GENERAL_GROUP = {
    id: "townGeneral",
    name: "General",
    icon: "i",
    order: 0,
    properties: [
      { rdoName: "ActualRuler", displayName: "Mayor", type: "TEXT" /* TEXT */ },
      { rdoName: "Town", displayName: "Town", type: "TEXT" /* TEXT */ },
      { rdoName: "NewspaperName", displayName: "Newspaper", type: "TEXT" /* TEXT */ },
      { rdoName: "RulerPrestige", displayName: "Prestige", type: "NUMBER" /* NUMBER */ },
      { rdoName: "RulerRating", displayName: "Ruler Rating", type: "PERCENTAGE" /* PERCENTAGE */ },
      { rdoName: "TycoonsRating", displayName: "Tycoons Rating", type: "PERCENTAGE" /* PERCENTAGE */ },
      { rdoName: "YearsToElections", displayName: "Years to Elections", type: "NUMBER" /* NUMBER */ },
      { rdoName: "HasRuler", displayName: "Has Ruler", type: "BOOLEAN" /* BOOLEAN */ },
      { rdoName: "RulerPeriods", displayName: "Ruler Periods", type: "NUMBER" /* NUMBER */ },
      {
        rdoName: "covName",
        displayName: "Coverage",
        type: "TABLE" /* TABLE */,
        indexed: true,
        indexSuffix: ".0",
        countProperty: "covCount",
        columns: [
          { rdoSuffix: "covName", label: "Service", type: "TEXT" /* TEXT */, width: "50%" },
          { rdoSuffix: "covValue", label: "Coverage", type: "PERCENTAGE" /* PERCENTAGE */, width: "50%" }
        ]
      },
      {
        rdoName: "visitPolitics",
        displayName: "Visit Politics Page",
        type: "ACTION_BUTTON" /* ACTION_BUTTON */,
        actionId: "visitPolitics",
        buttonLabel: "Visit Politics Page"
      }
    ]
  };
  var WORKFORCE_GROUP = {
    id: "workforce",
    name: "Workforce",
    icon: "W",
    order: 10,
    special: "workforce",
    properties: [
      {
        rdoName: "WorkforceTable",
        displayName: "Workforce Overview",
        type: "WORKFORCE_TABLE" /* WORKFORCE_TABLE */
      }
    ]
  };
  var SUPPLIES_GROUP = {
    id: "supplies",
    name: "Supplies",
    icon: "S",
    order: 20,
    special: "supplies",
    properties: [
      { rdoName: "MetaFluid", displayName: "Product", type: "TEXT" /* TEXT */ },
      { rdoName: "FluidValue", displayName: "Last Value", type: "TEXT" /* TEXT */ },
      { rdoName: "LastCostPerc", displayName: "Cost %", type: "PERCENTAGE" /* PERCENTAGE */ },
      { rdoName: "minK", displayName: "Min Quality", type: "NUMBER" /* NUMBER */, hideEmpty: true },
      { rdoName: "MaxPrice", displayName: "Max Price", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 1e3 },
      { rdoName: "QPSorted", displayName: "Sort by Q/P", type: "TEXT" /* TEXT */, hideEmpty: true },
      { rdoName: "cnxCount", displayName: "Connections", type: "NUMBER" /* NUMBER */ }
    ],
    rdoCommands: {
      "MaxPrice": { command: "RDOSetInputMaxPrice" },
      "minK": { command: "RDOSetInputMinK" },
      "RDOConnectInput": { command: "RDOConnectInput" },
      "RDODisconnectInput": { command: "RDODisconnectInput" },
      "RDOSetInputOverPrice": { command: "RDOSetInputOverPrice" },
      "RDOSetInputSortMode": { command: "RDOSetInputSortMode" },
      "RDOSelSelected": { command: "RDOSelSelected" },
      "RDOSetBuyingStatus": { command: "RDOSetBuyingStatus" }
    }
  };
  var SERVICES_GROUP = {
    id: "services",
    name: "Services",
    icon: "$",
    order: 30,
    special: "services",
    properties: [
      {
        rdoName: "srvNames",
        displayName: "Product",
        type: "TEXT" /* TEXT */,
        indexed: true,
        indexSuffix: ".0",
        countProperty: "ServiceCount"
      },
      {
        rdoName: "srvPrices",
        displayName: "Price",
        type: "SLIDER" /* SLIDER */,
        editable: true,
        indexed: true,
        min: 0,
        max: 500,
        step: 10,
        unit: "%",
        countProperty: "ServiceCount"
      },
      {
        rdoName: "srvSupplies",
        displayName: "Offer",
        type: "NUMBER" /* NUMBER */,
        indexed: true,
        countProperty: "ServiceCount"
      },
      {
        rdoName: "srvDemands",
        displayName: "Demand",
        type: "NUMBER" /* NUMBER */,
        indexed: true,
        countProperty: "ServiceCount"
      },
      {
        rdoName: "srvMarketPrices",
        displayName: "Market Price",
        type: "CURRENCY" /* CURRENCY */,
        indexed: true,
        countProperty: "ServiceCount"
      },
      {
        rdoName: "srvAvgPrices",
        displayName: "Avg Price",
        type: "CURRENCY" /* CURRENCY */,
        indexed: true,
        countProperty: "ServiceCount"
      }
    ]
  };
  var PRODUCTS_GROUP = {
    id: "products",
    name: "Products",
    icon: "P",
    order: 30,
    special: "products",
    properties: [
      { rdoName: "MetaFluid", displayName: "Product", type: "TEXT" /* TEXT */ },
      { rdoName: "LastFluid", displayName: "Produced", type: "NUMBER" /* NUMBER */ },
      { rdoName: "FluidQuality", displayName: "Quality", type: "PERCENTAGE" /* PERCENTAGE */ },
      { rdoName: "PricePc", displayName: "Price", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 300, step: 5, unit: "%" },
      { rdoName: "AvgPrice", displayName: "Avg Price", type: "PERCENTAGE" /* PERCENTAGE */ },
      { rdoName: "MarketPrice", displayName: "Market Price", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "cnxCount", displayName: "Clients", type: "NUMBER" /* NUMBER */ }
    ],
    rdoCommands: {
      "PricePc": { command: "RDOSetOutputPrice" },
      "RDOConnectOutput": { command: "RDOConnectOutput" },
      "RDODisconnectOutput": { command: "RDODisconnectOutput" }
    }
  };
  var ADVERTISEMENT_GROUP = {
    id: "advertisement",
    name: "Advertising",
    icon: "A",
    order: 25,
    properties: [
      { rdoName: "cInput", displayName: "Services", type: "TEXT" /* TEXT */, indexed: true, indexSuffix: ".0", countProperty: "cInputCount" },
      { rdoName: "cInputSup", displayName: "Receiving", type: "NUMBER" /* NUMBER */, indexed: true, countProperty: "cInputCount" },
      { rdoName: "cInputDem", displayName: "Requesting", type: "NUMBER" /* NUMBER */, indexed: true, countProperty: "cInputCount" },
      { rdoName: "cInputRatio", displayName: "Ratio", type: "PERCENTAGE" /* PERCENTAGE */, indexed: true, countProperty: "cInputCount" },
      { rdoName: "cInputMax", displayName: "Max", type: "NUMBER" /* NUMBER */, indexed: true, countProperty: "cInputCount" },
      { rdoName: "cEditable", displayName: "Editable", type: "BOOLEAN" /* BOOLEAN */, indexed: true, countProperty: "cInputCount" },
      { rdoName: "cUnits", displayName: "Units", type: "TEXT" /* TEXT */, indexed: true, countProperty: "cInputCount" }
    ]
  };
  var UPGRADE_GROUP = {
    id: "upgrade",
    name: "Upgrade",
    icon: "U",
    order: 40,
    properties: [
      { rdoName: "UpgradeLevel", displayName: "Current Level", type: "NUMBER" /* NUMBER */, hideEmpty: true },
      { rdoName: "MaxUpgrade", displayName: "Max Level", type: "NUMBER" /* NUMBER */, hideEmpty: true },
      { rdoName: "NextUpgCost", displayName: "Upgrade Cost", type: "CURRENCY" /* CURRENCY */, hideEmpty: true },
      { rdoName: "Upgrading", displayName: "Upgrading", type: "BOOLEAN" /* BOOLEAN */, hideEmpty: true },
      { rdoName: "Pending", displayName: "Pending", type: "NUMBER" /* NUMBER */, hideEmpty: true },
      { rdoName: "UpgradeActions", displayName: "Actions", type: "UPGRADE_ACTIONS" /* UPGRADE_ACTIONS */ },
      { rdoName: "cloneFacility", displayName: "Clone Facility", type: "ACTION_BUTTON" /* ACTION_BUTTON */, actionId: "clone", buttonLabel: "Clone Facility" }
    ],
    rdoCommands: {
      "RDOAcceptCloning": { command: "RDOAcceptCloning" },
      "CloneFacility": { command: "CloneFacility" }
    }
  };
  var FINANCES_GROUP = {
    id: "finances",
    name: "Finances",
    icon: "F",
    order: 50,
    properties: [
      { rdoName: "MoneyGraphInfo", displayName: "Revenue History", type: "GRAPH" /* GRAPH */ },
      { rdoName: "MoneyGraph", displayName: "Has Graph", type: "BOOLEAN" /* BOOLEAN */, hideEmpty: true }
    ]
  };
  var BANK_LOANS_GROUP = {
    id: "bankLoans",
    name: "Loans",
    icon: "L",
    order: 10,
    properties: [
      {
        rdoName: "Debtor",
        displayName: "Loans",
        type: "TABLE" /* TABLE */,
        indexed: true,
        countProperty: "LoanCount",
        columns: [
          { rdoSuffix: "Debtor", label: "Debtor", type: "TEXT" /* TEXT */, width: "30%" },
          { rdoSuffix: "Amount", label: "Amount", type: "CURRENCY" /* CURRENCY */, width: "25%" },
          { rdoSuffix: "Interest", label: "Interest", type: "PERCENTAGE" /* PERCENTAGE */, width: "20%" },
          { rdoSuffix: "Term", label: "Term", type: "NUMBER" /* NUMBER */, width: "25%" }
        ]
      }
    ]
  };
  var ANTENNAS_GROUP = {
    id: "antennas",
    name: "Antennas",
    icon: "A",
    order: 10,
    properties: [
      {
        rdoName: "antName",
        displayName: "Antennas",
        type: "TABLE" /* TABLE */,
        indexed: true,
        countProperty: "antCount",
        columns: [
          { rdoSuffix: "antName", label: "Name", type: "TEXT" /* TEXT */, width: "25%" },
          { rdoSuffix: "antTown", label: "Town", type: "TEXT" /* TEXT */, width: "20%" },
          { rdoSuffix: "antViewers", label: "Viewers", type: "NUMBER" /* NUMBER */, width: "15%" },
          { rdoSuffix: "antActive", label: "Active", type: "BOOLEAN" /* BOOLEAN */, width: "15%" },
          { rdoSuffix: "antX", label: "X", type: "NUMBER" /* NUMBER */, width: "12%" },
          { rdoSuffix: "antY", label: "Y", type: "NUMBER" /* NUMBER */, width: "13%" }
        ]
      }
    ]
  };
  var FILMS_GROUP = {
    id: "films",
    name: "Films",
    icon: "F",
    order: 10,
    properties: [
      // Current film info (FilmsSheet.pas queries)
      { rdoName: "FilmName", displayName: "Film Name", type: "TEXT" /* TEXT */ },
      { rdoName: "FilmBudget", displayName: "Budget", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "FilmTime", displayName: "Duration", type: "NUMBER" /* NUMBER */, unit: "months" },
      { rdoName: "InProd", displayName: "In Production", type: "TEXT" /* TEXT */ },
      { rdoName: "FilmDone", displayName: "Film Done", type: "BOOLEAN" /* BOOLEAN */ },
      { rdoName: "AutoProd", displayName: "Auto Produce", type: "BOOLEAN" /* BOOLEAN */, editable: true },
      { rdoName: "AutoRel", displayName: "Auto Release", type: "BOOLEAN" /* BOOLEAN */, editable: true },
      { rdoName: "launchMovie", displayName: "Launch Movie", type: "ACTION_BUTTON" /* ACTION_BUTTON */, actionId: "launchMovie", buttonLabel: "Launch Movie" },
      { rdoName: "cancelMovie", displayName: "Cancel Movie", type: "ACTION_BUTTON" /* ACTION_BUTTON */, actionId: "cancelMovie", buttonLabel: "Cancel Movie" },
      { rdoName: "releaseMovie", displayName: "Release Movie", type: "ACTION_BUTTON" /* ACTION_BUTTON */, actionId: "releaseMovie", buttonLabel: "Release Movie" }
    ],
    rdoCommands: {
      "AutoProd": { command: "RDOAutoProduce" },
      "AutoRel": { command: "RDOAutoRelease" }
    }
  };
  var MAUSOLEUM_GROUP = {
    id: "mausoleum",
    name: "Memorial",
    icon: "M",
    order: 10,
    properties: [
      { rdoName: "WordsOfWisdom", displayName: "Words of Wisdom", type: "TEXT" /* TEXT */ },
      { rdoName: "OwnerName", displayName: "Owner", type: "TEXT" /* TEXT */ },
      { rdoName: "Transcended", displayName: "Transcended", type: "BOOLEAN" /* BOOLEAN */ }
    ]
  };
  var VOTES_GROUP = {
    id: "votes",
    name: "Votes",
    icon: "V",
    order: 10,
    properties: [
      { rdoName: "RulerName", displayName: "Ruler", type: "TEXT" /* TEXT */ },
      { rdoName: "RulerVotes", displayName: "Ruler Votes", type: "NUMBER" /* NUMBER */ },
      { rdoName: "RulerCmpRat", displayName: "Ruler Campaign Rating", type: "PERCENTAGE" /* PERCENTAGE */ },
      { rdoName: "RulerCmpPnts", displayName: "Ruler Campaign Points", type: "NUMBER" /* NUMBER */ },
      {
        rdoName: "Candidate",
        displayName: "Candidates",
        type: "TABLE" /* TABLE */,
        indexed: true,
        countProperty: "CampaignCount",
        columns: [
          { rdoSuffix: "Candidate", label: "Candidate", type: "TEXT" /* TEXT */, width: "30%" },
          { rdoSuffix: "Votes", label: "Votes", type: "NUMBER" /* NUMBER */, width: "25%" },
          { rdoSuffix: "CmpRat", label: "Rating", type: "PERCENTAGE" /* PERCENTAGE */, width: "25%" },
          { rdoSuffix: "CmpPnts", label: "Points", type: "NUMBER" /* NUMBER */, width: "20%" }
        ]
      },
      { rdoName: "voteAction", displayName: "Vote", type: "ACTION_BUTTON" /* ACTION_BUTTON */, actionId: "vote", buttonLabel: "Vote for Candidate" }
    ]
  };
  var CAPITOL_TOWNS_GROUP = {
    id: "capitolTowns",
    name: "Towns",
    icon: "T",
    order: 10,
    properties: [
      { rdoName: "ActualRuler", displayName: "Ruler", type: "TEXT" /* TEXT */ },
      {
        rdoName: "Town",
        displayName: "Towns",
        type: "TABLE" /* TABLE */,
        indexed: true,
        countProperty: "TownCount",
        columns: [
          { rdoSuffix: "Town", label: "Town", type: "TEXT" /* TEXT */, width: "16%" },
          { rdoSuffix: "TownPopulation", label: "Population", type: "NUMBER" /* NUMBER */, width: "12%" },
          { rdoSuffix: "TownRating", label: "Rating", type: "PERCENTAGE" /* PERCENTAGE */, width: "12%" },
          { rdoSuffix: "TownQOL", label: "QoL", type: "PERCENTAGE" /* PERCENTAGE */, width: "12%" },
          { rdoSuffix: "TownQOS", label: "QoS", type: "PERCENTAGE" /* PERCENTAGE */, width: "12%" },
          { rdoSuffix: "TownWealth", label: "Wealth", type: "CURRENCY" /* CURRENCY */, width: "12%" },
          { rdoSuffix: "TownTax", label: "Tax", type: "PERCENTAGE" /* PERCENTAGE */, width: "12%" },
          { rdoSuffix: "HasMayor", label: "Mayor", type: "BOOLEAN" /* BOOLEAN */, width: "10%" }
        ]
      }
    ]
  };
  var MINISTERIES_GROUP = {
    id: "ministeries",
    name: "Ministries",
    icon: "M",
    order: 10,
    properties: [
      { rdoName: "ActualRuler", displayName: "Ruler", type: "TEXT" /* TEXT */ },
      {
        rdoName: "Ministry",
        displayName: "Ministries",
        type: "TABLE" /* TABLE */,
        indexed: true,
        countProperty: "MinisterCount",
        columns: [
          { rdoSuffix: "MinistryId", label: "ID", type: "TEXT" /* TEXT */, width: "0%" },
          { rdoSuffix: "Ministry", label: "Ministry", type: "TEXT" /* TEXT */, width: "25%" },
          { rdoSuffix: "Minister", label: "Minister", type: "TEXT" /* TEXT */, width: "25%" },
          { rdoSuffix: "MinisterRating", label: "Rating", type: "PERCENTAGE" /* PERCENTAGE */, width: "25%" },
          { rdoSuffix: "MinisterBudget", label: "Budget", type: "CURRENCY" /* CURRENCY */, width: "25%" }
        ]
      },
      { rdoName: "banMinister", displayName: "Depose Minister", type: "ACTION_BUTTON" /* ACTION_BUTTON */, actionId: "banMinister", buttonLabel: "Depose Minister" },
      { rdoName: "sitMinister", displayName: "Appoint Minister", type: "ACTION_BUTTON" /* ACTION_BUTTON */, actionId: "sitMinister", buttonLabel: "Appoint Minister" }
    ],
    rdoCommands: {
      "MinisterBudget": { command: "RDOSetMinistryBudget" }
    }
  };
  var TOWN_JOBS_GROUP = {
    id: "townJobs",
    name: "Jobs",
    icon: "J",
    order: 10,
    properties: [
      { rdoName: "hiActualMinSalary", displayName: "Executive Min Salary", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 500, step: 5 },
      { rdoName: "midActualMinSalary", displayName: "Professional Min Salary", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 500, step: 5 },
      { rdoName: "loActualMinSalary", displayName: "Worker Min Salary", type: "SLIDER" /* SLIDER */, editable: true, min: 0, max: 500, step: 5 }
    ],
    rdoCommands: {
      "hiActualMinSalary": { command: "RDOSetMinSalaryValue", params: { levelIndex: "0" } },
      "midActualMinSalary": { command: "RDOSetMinSalaryValue", params: { levelIndex: "1" } },
      "loActualMinSalary": { command: "RDOSetMinSalaryValue", params: { levelIndex: "2" } }
    }
  };
  var TOWN_RES_GROUP = {
    id: "townRes",
    name: "Residential",
    icon: "R",
    order: 10,
    properties: [
      { rdoName: "hiResDemand", displayName: "High Class Demand", type: "NUMBER" /* NUMBER */ },
      { rdoName: "hiResQ", displayName: "High Class Population", type: "NUMBER" /* NUMBER */ },
      { rdoName: "hiRentPrice", displayName: "High Class Rent", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "midResDemand", displayName: "Middle Class Demand", type: "NUMBER" /* NUMBER */ },
      { rdoName: "midResQ", displayName: "Middle Class Population", type: "NUMBER" /* NUMBER */ },
      { rdoName: "midRentPrice", displayName: "Middle Class Rent", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "loResDemand", displayName: "Low Class Demand", type: "NUMBER" /* NUMBER */ },
      { rdoName: "loResQ", displayName: "Low Class Population", type: "NUMBER" /* NUMBER */ },
      { rdoName: "loRentPrice", displayName: "Low Class Rent", type: "CURRENCY" /* CURRENCY */ }
    ]
  };
  var TOWN_SERVICES_GROUP = {
    id: "townServices",
    name: "Services",
    icon: "S",
    order: 10,
    properties: [
      {
        rdoName: "prdName",
        displayName: "Products",
        type: "TABLE" /* TABLE */,
        indexed: true,
        indexSuffix: ".0",
        countProperty: "prdCount",
        columns: [
          { rdoSuffix: "prdName", label: "Product", type: "TEXT" /* TEXT */, width: "12%" },
          { rdoSuffix: "prdInputValue", label: "In Value", type: "NUMBER" /* NUMBER */, width: "10%" },
          { rdoSuffix: "prdInputCapacity", label: "In Cap", type: "NUMBER" /* NUMBER */, width: "10%" },
          { rdoSuffix: "prdInputQuality", label: "In Qual", type: "PERCENTAGE" /* PERCENTAGE */, width: "10%" },
          { rdoSuffix: "prdInputPrice", label: "In Price", type: "CURRENCY" /* CURRENCY */, width: "9%" },
          { rdoSuffix: "prdInputMaxPrice", label: "Max Price", type: "CURRENCY" /* CURRENCY */, width: "9%" },
          { rdoSuffix: "prdOutputValue", label: "Out Value", type: "NUMBER" /* NUMBER */, width: "9%" },
          { rdoSuffix: "prdOutputCapacity", label: "Out Cap", type: "NUMBER" /* NUMBER */, width: "9%" },
          { rdoSuffix: "prdOutputQuality", label: "Out Qual", type: "PERCENTAGE" /* PERCENTAGE */, width: "9%" },
          { rdoSuffix: "prdOutputPrice", label: "Out Price", type: "CURRENCY" /* CURRENCY */, width: "9%" }
        ]
      }
    ]
  };
  var TOWN_TAXES_GROUP = {
    id: "townTaxes",
    name: "Taxes",
    icon: "T",
    order: 10,
    properties: [
      {
        rdoName: "Tax",
        displayName: "Taxes",
        type: "TABLE" /* TABLE */,
        indexed: true,
        countProperty: "TaxCount",
        columns: [
          { rdoSuffix: "Tax", columnSuffix: "Name", label: "Tax", type: "TEXT" /* TEXT */, width: "30%" },
          { rdoSuffix: "Tax", columnSuffix: "Kind", label: "Kind", type: "TEXT" /* TEXT */, width: "20%" },
          { rdoSuffix: "Tax", columnSuffix: "Percent", label: "Rate", type: "SLIDER" /* SLIDER */, width: "25%", editable: true, min: 0, max: 100, step: 1 },
          { rdoSuffix: "Tax", columnSuffix: "LastYear", label: "Last Year", type: "CURRENCY" /* CURRENCY */, width: "25%" }
        ]
      }
    ],
    rdoCommands: {
      "TaxPercent": { command: "RDOSetTaxPercent", indexed: true }
    }
  };
  var OVERVIEW_GROUP = {
    id: "overview",
    name: "Overview",
    icon: "i",
    order: 0,
    properties: [
      { rdoName: "Name", displayName: "Building Name", type: "TEXT" /* TEXT */ },
      { rdoName: "Creator", displayName: "Owner", type: "TEXT" /* TEXT */ },
      { rdoName: "Years", displayName: "Age", type: "NUMBER" /* NUMBER */, unit: "years" },
      { rdoName: "Cost", displayName: "Value", type: "CURRENCY" /* CURRENCY */ },
      { rdoName: "ROI", displayName: "Return on Investment", type: "PERCENTAGE" /* PERCENTAGE */, colorCode: "auto" },
      { rdoName: "Trouble", displayName: "Status", type: "NUMBER" /* NUMBER */, hideEmpty: true }
    ]
  };
  var TOWN_GROUP = {
    id: "town",
    name: "Location",
    icon: "L",
    order: 60,
    special: "town",
    properties: [
      { rdoName: "Town", displayName: "Town", type: "TEXT" /* TEXT */ },
      { rdoName: "TownName", displayName: "Town Name", type: "TEXT" /* TEXT */, hideEmpty: true },
      { rdoName: "ActualRuler", displayName: "Mayor", type: "TEXT" /* TEXT */ },
      { rdoName: "TownQOL", displayName: "Quality of Life", type: "PERCENTAGE" /* PERCENTAGE */, hideEmpty: true },
      { rdoName: "QOL", displayName: "QoL", type: "PERCENTAGE" /* PERCENTAGE */, hideEmpty: true }
    ]
  };
  var COVERAGE_GROUP = {
    id: "coverage",
    name: "Coverage",
    icon: "C",
    order: 70,
    properties: [
      { rdoName: "covValue0", displayName: "Colleges", type: "PERCENTAGE" /* PERCENTAGE */, hideEmpty: true },
      { rdoName: "covValue1", displayName: "Garbage Disposal", type: "PERCENTAGE" /* PERCENTAGE */, hideEmpty: true },
      { rdoName: "covValue2", displayName: "Fire Coverage", type: "PERCENTAGE" /* PERCENTAGE */, hideEmpty: true },
      { rdoName: "covValue3", displayName: "Health Coverage", type: "PERCENTAGE" /* PERCENTAGE */, hideEmpty: true },
      { rdoName: "covValue4", displayName: "Jails", type: "PERCENTAGE" /* PERCENTAGE */, hideEmpty: true },
      { rdoName: "covValue5", displayName: "Museums", type: "PERCENTAGE" /* PERCENTAGE */, hideEmpty: true },
      { rdoName: "covValue6", displayName: "Police Coverage", type: "PERCENTAGE" /* PERCENTAGE */, hideEmpty: true },
      { rdoName: "covValue7", displayName: "School Coverage", type: "PERCENTAGE" /* PERCENTAGE */, hideEmpty: true },
      { rdoName: "covValue8", displayName: "Recreation", type: "PERCENTAGE" /* PERCENTAGE */, hideEmpty: true }
    ]
  };
  var TRADE_GROUP = {
    id: "trade",
    name: "Trade",
    icon: "T",
    order: 35,
    properties: [
      { rdoName: "TradeRole", displayName: "Trade Role", type: "ENUM" /* ENUM */, enumLabels: { "0": "Neutral", "1": "Producer", "2": "Distributor", "3": "Buyer", "4": "Importer", "5": "Export", "6": "Import" } },
      { rdoName: "TradeLevel", displayName: "Trade Level", type: "ENUM" /* ENUM */, editable: true, enumLabels: { "0": "Same Owner", "1": "Subsidiaries", "2": "Allies", "3": "Anyone" } },
      { rdoName: "GateMap", displayName: "Gate Map", type: "NUMBER" /* NUMBER */, hideEmpty: true }
    ]
  };
  var LOCAL_SERVICES_GROUP = {
    id: "localServices",
    name: "Services",
    icon: "Q",
    order: 45,
    properties: [
      { rdoName: "srvCount", displayName: "Service Count", type: "NUMBER" /* NUMBER */ },
      { rdoName: "GQOS", displayName: "Quality of Service", type: "PERCENTAGE" /* PERCENTAGE */ },
      {
        rdoName: "svrName",
        displayName: "Service",
        type: "TABLE" /* TABLE */,
        indexed: true,
        indexSuffix: ".0",
        countProperty: "srvCount",
        columns: [
          { rdoSuffix: "svrName", label: "Service", type: "TEXT" /* TEXT */, width: "25%" },
          { rdoSuffix: "svrDemand", label: "Demand", type: "NUMBER" /* NUMBER */, width: "12%" },
          { rdoSuffix: "svrOffer", label: "Offer", type: "NUMBER" /* NUMBER */, width: "12%" },
          { rdoSuffix: "svrCapacity", label: "Capacity", type: "NUMBER" /* NUMBER */, width: "12%" },
          { rdoSuffix: "svrRatio", label: "Ratio", type: "PERCENTAGE" /* PERCENTAGE */, width: "12%" },
          { rdoSuffix: "svrMarketPrice", label: "Market", type: "CURRENCY" /* CURRENCY */, width: "12%" },
          { rdoSuffix: "svrQuality", label: "Quality", type: "PERCENTAGE" /* PERCENTAGE */, width: "12%" }
        ]
      }
    ]
  };
  var GROUP_BY_ID = {
    "overview": OVERVIEW_GROUP,
    "generic": GENERIC_GROUP,
    "unkGeneral": UNK_GENERAL_GROUP,
    "indGeneral": IND_GENERAL_GROUP,
    "srvGeneral": SRV_GENERAL_GROUP,
    "resGeneral": RES_GENERAL_GROUP,
    "hqGeneral": HQ_GENERAL_GROUP,
    "bankGeneral": BANK_GENERAL_GROUP,
    "whGeneral": WH_GENERAL_GROUP,
    "tvGeneral": TV_GENERAL_GROUP,
    "capitolGeneral": CAPITOL_GENERAL_GROUP,
    "townGeneral": TOWN_GENERAL_GROUP,
    "workforce": WORKFORCE_GROUP,
    "supplies": SUPPLIES_GROUP,
    "services": SERVICES_GROUP,
    "products": PRODUCTS_GROUP,
    "upgrade": UPGRADE_GROUP,
    "finances": FINANCES_GROUP,
    "advertisement": ADVERTISEMENT_GROUP,
    "town": TOWN_GROUP,
    "coverage": COVERAGE_GROUP,
    "trade": TRADE_GROUP,
    "localServices": LOCAL_SERVICES_GROUP,
    "bankLoans": BANK_LOANS_GROUP,
    "antennas": ANTENNAS_GROUP,
    "films": FILMS_GROUP,
    "mausoleum": MAUSOLEUM_GROUP,
    "votes": VOTES_GROUP,
    "capitolTowns": CAPITOL_TOWNS_GROUP,
    "ministeries": MINISTERIES_GROUP,
    "townJobs": TOWN_JOBS_GROUP,
    "townRes": TOWN_RES_GROUP,
    "townServices": TOWN_SERVICES_GROUP,
    "townTaxes": TOWN_TAXES_GROUP
  };
  function getGroupById(tabId) {
    if (GROUP_BY_ID[tabId]) return GROUP_BY_ID[tabId];
    const underscoreIdx = tabId.indexOf("_");
    if (underscoreIdx > 0) {
      const baseId = tabId.substring(0, underscoreIdx);
      return GROUP_BY_ID[baseId];
    }
    return void 0;
  }

  // src/client/ui/building-details/property-renderers.ts
  function getColorClass(value, colorCode) {
    if (colorCode === "positive") return "text-success";
    if (colorCode === "negative") return "text-error";
    if (colorCode === "neutral") return "text-muted";
    if (colorCode === "auto") {
      if (value > 0) return "text-success";
      if (value < 0) return "text-error";
      return "text-muted";
    }
    return "";
  }
  function renderTextProperty(value) {
    const span = document.createElement("span");
    span.className = "property-value property-text";
    span.textContent = value || "-";
    return span;
  }
  function renderNumberProperty(value, definition) {
    const span = document.createElement("span");
    span.className = "property-value property-number";
    const num = parseFloat(value);
    if (isNaN(num)) {
      span.textContent = value || "0";
    } else {
      span.textContent = formatNumber(num, definition.unit);
      const colorClass = getColorClass(num, definition.colorCode);
      if (colorClass) span.classList.add(colorClass);
    }
    return span;
  }
  function renderCurrencyProperty(value, definition) {
    const span = document.createElement("span");
    span.className = "property-value property-currency";
    const num = parseFloat(value);
    span.textContent = formatCurrency(num);
    const colorClass = getColorClass(num, definition.colorCode);
    if (colorClass) span.classList.add(colorClass);
    return span;
  }
  function renderPercentageProperty(value, definition) {
    const span = document.createElement("span");
    span.className = "property-value property-percentage";
    const num = parseFloat(value);
    span.textContent = formatPercentage(num);
    const colorClass = getColorClass(num, definition.colorCode);
    if (colorClass) span.classList.add(colorClass);
    return span;
  }
  function renderRatioProperty(value, maxValue) {
    const container = document.createElement("div");
    container.className = "property-value property-ratio";
    const current = parseFloat(value) || 0;
    const max = maxValue ? parseFloat(maxValue) || 0 : 0;
    const percentage = max > 0 ? current / max * 100 : 0;
    const bar = document.createElement("div");
    bar.className = "ratio-bar";
    bar.innerHTML = `
    <div class="ratio-fill" style="width: ${Math.min(100, percentage)}%"></div>
  `;
    const text = document.createElement("span");
    text.className = "ratio-text";
    text.textContent = max > 0 ? `${current}/${max}` : `${current}`;
    container.appendChild(bar);
    container.appendChild(text);
    return container;
  }
  function renderBooleanProperty(value, editable, onChange) {
    const isTrue = value === "1" || value.toLowerCase() === "yes" || value.toLowerCase() === "true";
    if (editable && onChange) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "property-checkbox";
      checkbox.checked = isTrue;
      checkbox.onchange = () => onChange(checkbox.checked ? 1 : 0);
      return checkbox;
    }
    const span = document.createElement("span");
    span.className = "property-value property-boolean";
    span.textContent = isTrue ? "Yes" : "No";
    span.classList.add(isTrue ? "text-success" : "text-muted");
    return span;
  }
  function renderEnumProperty(value, definition, onChange) {
    if (definition.editable && definition.enumLabels && onChange) {
      const select = document.createElement("select");
      select.className = "property-enum-select";
      for (const [val, label] of Object.entries(definition.enumLabels)) {
        const option = document.createElement("option");
        option.value = val;
        option.textContent = label;
        option.selected = val === value;
        select.appendChild(option);
      }
      select.onchange = () => onChange(parseInt(select.value, 10));
      return select;
    }
    const span = document.createElement("span");
    span.className = "property-value property-enum";
    span.textContent = definition.enumLabels?.[value] || value;
    return span;
  }
  function renderPropertyRow(definition, propertyValue, maxValue, onSliderChange) {
    const row = document.createElement("div");
    row.className = "property-row";
    const label = document.createElement("div");
    label.className = "property-label";
    label.textContent = definition.displayName;
    if (definition.tooltip) {
      label.title = definition.tooltip;
    }
    row.appendChild(label);
    let valueElement;
    switch (definition.type) {
      case "TEXT" /* TEXT */:
        valueElement = renderTextProperty(propertyValue.value);
        break;
      case "NUMBER" /* NUMBER */:
        valueElement = renderNumberProperty(propertyValue.value, definition);
        break;
      case "CURRENCY" /* CURRENCY */:
        valueElement = renderCurrencyProperty(propertyValue.value, definition);
        break;
      case "PERCENTAGE" /* PERCENTAGE */:
        valueElement = renderPercentageProperty(propertyValue.value, definition);
        break;
      case "RATIO" /* RATIO */:
        valueElement = renderRatioProperty(propertyValue.value, maxValue);
        break;
      case "BOOLEAN" /* BOOLEAN */:
        valueElement = renderBooleanProperty(
          propertyValue.value,
          definition.editable,
          definition.editable && onSliderChange ? onSliderChange : void 0
        );
        break;
      case "ENUM" /* ENUM */:
        valueElement = renderEnumProperty(
          propertyValue.value,
          definition,
          definition.editable && onSliderChange ? onSliderChange : void 0
        );
        break;
      case "SLIDER" /* SLIDER */:
        valueElement = renderSliderProperty(
          propertyValue.value,
          definition,
          onSliderChange
        );
        break;
      default:
        valueElement = renderTextProperty(propertyValue.value);
    }
    row.appendChild(valueElement);
    return row;
  }
  function renderSliderProperty(value, definition, onChange) {
    const container = document.createElement("div");
    container.className = "property-slider-container";
    const num = parseFloat(value) || 0;
    const min = definition.min ?? 0;
    const max = definition.max ?? 300;
    const step = definition.step ?? 5;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "property-slider";
    slider.min = min.toString();
    slider.max = max.toString();
    slider.step = step.toString();
    slider.value = num.toString();
    const valueDisplay = document.createElement("span");
    valueDisplay.className = "slider-value";
    valueDisplay.textContent = definition.unit ? `${num}${definition.unit}` : num.toString();
    slider.oninput = () => {
      const newVal = parseFloat(slider.value);
      valueDisplay.textContent = definition.unit ? `${newVal}${definition.unit}` : newVal.toString();
    };
    const handleChange = () => {
      const newVal = parseFloat(slider.value);
      if (onChange) {
        onChange(newVal);
      }
    };
    slider.onchange = handleChange;
    slider.addEventListener("change", handleChange);
    slider.addEventListener("mouseup", handleChange);
    slider.addEventListener("touchend", handleChange);
    container.appendChild(slider);
    container.appendChild(valueDisplay);
    return container;
  }
  function renderWorkforceTable(properties, onPropertyChange) {
    const table = document.createElement("table");
    table.className = "workforce-table";
    const valueMap = /* @__PURE__ */ new Map();
    for (const prop of properties) {
      valueMap.set(prop.name, prop.value);
    }
    const getValue = (name) => valueMap.get(name) || "0";
    const getNumValue = (name) => parseFloat(getValue(name)) || 0;
    const thead = document.createElement("thead");
    thead.innerHTML = `
    <tr>
      <th class="workforce-label-col"></th>
      <th class="workforce-class-col">Executives</th>
      <th class="workforce-class-col">Professionals</th>
      <th class="workforce-class-col">Workers</th>
    </tr>
  `;
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    const isClassActive = (classIndex) => {
      const cap = valueMap.has(`WorkersCap${classIndex}`) ? getNumValue(`WorkersCap${classIndex}`) : getNumValue(`WorkersMax${classIndex}`);
      return cap > 0;
    };
    const jobsRow = document.createElement("tr");
    jobsRow.innerHTML = `<td class="workforce-label">Jobs</td>`;
    for (let i = 0; i < 3; i++) {
      const workers = getNumValue(`Workers${i}`);
      const workersMax = getNumValue(`WorkersMax${i}`);
      const td = document.createElement("td");
      td.className = "workforce-value";
      if (!isClassActive(i)) {
        td.textContent = "";
      } else {
        td.textContent = `${workers}/${workersMax}`;
      }
      jobsRow.appendChild(td);
    }
    tbody.appendChild(jobsRow);
    const qualityRow = document.createElement("tr");
    qualityRow.innerHTML = `<td class="workforce-label">Work Force Quality</td>`;
    for (let i = 0; i < 3; i++) {
      const quality = getNumValue(`WorkersK${i}`);
      const td = document.createElement("td");
      td.className = "workforce-value";
      if (!isClassActive(i)) {
        td.textContent = "";
      } else {
        td.textContent = formatPercentage(quality);
      }
      qualityRow.appendChild(td);
    }
    tbody.appendChild(qualityRow);
    const salariesRow = document.createElement("tr");
    salariesRow.innerHTML = `<td class="workforce-label">Salaries</td>`;
    for (let i = 0; i < 3; i++) {
      const workforcePrice = getNumValue(`WorkForcePrice${i}`);
      const salaryPercent = getNumValue(`Salaries${i}`);
      const minSalary = getNumValue(`MinSalaries${i}`);
      const td = document.createElement("td");
      td.className = "workforce-value workforce-salary-cell";
      if (isClassActive(i)) {
        const priceSpan = document.createElement("span");
        priceSpan.className = "workforce-salary-price";
        priceSpan.textContent = formatCurrency(workforcePrice);
        td.appendChild(priceSpan);
        const inputContainer = document.createElement("div");
        inputContainer.className = "workforce-salary-input";
        const input = document.createElement("input");
        input.type = "number";
        input.className = "salary-input";
        input.min = minSalary > 0 ? minSalary.toString() : "0";
        input.max = "250";
        input.step = "1";
        input.value = salaryPercent.toString();
        input.setAttribute("value", salaryPercent.toString());
        const percentLabel = document.createElement("span");
        percentLabel.className = "percent-label";
        percentLabel.textContent = "%";
        const handleChange = () => {
          let newVal = parseFloat(input.value);
          const floor = minSalary > 0 ? minSalary : 0;
          if (isNaN(newVal)) newVal = floor;
          if (newVal < floor) newVal = floor;
          if (newVal > 250) newVal = 250;
          if (newVal !== parseFloat(input.value)) {
            input.value = newVal.toString();
          }
          if (onPropertyChange) {
            onPropertyChange(`Salaries${i}`, newVal);
          }
        };
        input.addEventListener("change", handleChange);
        input.addEventListener("blur", handleChange);
        inputContainer.appendChild(input);
        inputContainer.appendChild(percentLabel);
        td.appendChild(inputContainer);
      }
      salariesRow.appendChild(td);
    }
    tbody.appendChild(salariesRow);
    const hasMinSalaries = [0, 1, 2].some((i) => getNumValue(`MinSalaries${i}`) > 0);
    if (hasMinSalaries) {
      const minSalaryRow = document.createElement("tr");
      minSalaryRow.innerHTML = `<td class="workforce-label">Min Salary</td>`;
      for (let i = 0; i < 3; i++) {
        const minSal = getNumValue(`MinSalaries${i}`);
        const td = document.createElement("td");
        td.className = "workforce-value";
        if (!isClassActive(i)) {
          td.textContent = "";
        } else {
          td.textContent = minSal > 0 ? `${minSal}%` : "-";
        }
        minSalaryRow.appendChild(td);
      }
      tbody.appendChild(minSalaryRow);
    }
    table.appendChild(tbody);
    return table;
  }
  function formatCellValue(value, colType) {
    const num = parseFloat(value);
    switch (colType) {
      case "CURRENCY" /* CURRENCY */:
        return formatCurrency(num);
      case "PERCENTAGE" /* PERCENTAGE */:
        return formatPercentage(num);
      case "NUMBER" /* NUMBER */:
        return isNaN(num) ? value : formatNumber(num);
      case "BOOLEAN" /* BOOLEAN */: {
        const isTrue = value === "1" || value.toLowerCase() === "yes" || value.toLowerCase() === "true";
        return isTrue ? "Yes" : "No";
      }
      default:
        return value || "-";
    }
  }
  function renderDataTable(def, properties, valueMap, onPropertyChange) {
    const container = document.createElement("div");
    container.className = "data-table-container";
    if (!def.columns || def.columns.length === 0) {
      container.textContent = "No columns defined";
      return container;
    }
    const suffix = def.indexSuffix || "";
    let rowCount = 0;
    for (const prop of properties) {
      if (prop.index !== void 0 && prop.index >= rowCount) {
        rowCount = prop.index + 1;
      }
    }
    if (rowCount === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "data-table-empty";
      emptyMsg.textContent = "No data available";
      container.appendChild(emptyMsg);
      return container;
    }
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const col of def.columns) {
      const th = document.createElement("th");
      th.textContent = col.label;
      if (col.width) th.style.width = col.width;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (let idx = 0; idx < rowCount; idx++) {
      const tr = document.createElement("tr");
      for (const col of def.columns) {
        const td = document.createElement("td");
        const colName = `${col.rdoSuffix}${idx}${col.columnSuffix || ""}${suffix}`;
        const value = valueMap.get(colName) || "";
        if (col.editable && col.type === "SLIDER" /* SLIDER */ && onPropertyChange) {
          const num = parseFloat(value) || 0;
          const input = document.createElement("input");
          input.type = "range";
          input.className = "table-cell-slider";
          input.min = (col.min ?? 0).toString();
          input.max = (col.max ?? 300).toString();
          input.step = (col.step ?? 5).toString();
          input.value = num.toString();
          const valSpan = document.createElement("span");
          valSpan.className = "table-cell-slider-value";
          valSpan.textContent = num.toString();
          input.oninput = () => {
            valSpan.textContent = input.value;
          };
          input.onchange = () => {
            onPropertyChange(colName, parseFloat(input.value));
          };
          td.appendChild(input);
          td.appendChild(valSpan);
        } else {
          td.textContent = formatCellValue(value, col.type);
        }
        td.className = `data-cell data-cell-${col.type.toLowerCase()}`;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);
    return container;
  }
  function renderPropertyGroup(properties, definitions, onPropertyChange, onActionButton) {
    const container = document.createElement("div");
    container.className = "property-group";
    const valueMap = /* @__PURE__ */ new Map();
    for (const prop of properties) {
      valueMap.set(prop.name, prop.value);
    }
    const renderedProperties = /* @__PURE__ */ new Set();
    for (const def of definitions) {
      if (def.type === "WORKFORCE_TABLE" /* WORKFORCE_TABLE */) {
        const workforceTable = renderWorkforceTable(properties, onPropertyChange);
        container.appendChild(workforceTable);
        for (let i = 0; i < 3; i++) {
          renderedProperties.add(`Workers${i}`);
          renderedProperties.add(`WorkersMax${i}`);
          renderedProperties.add(`WorkersK${i}`);
          renderedProperties.add(`Salaries${i}`);
          renderedProperties.add(`WorkForcePrice${i}`);
        }
        continue;
      }
      if (def.type === "UPGRADE_ACTIONS" /* UPGRADE_ACTIONS */) {
        const actionsElement = renderUpgradeActions(properties);
        container.appendChild(actionsElement);
        renderedProperties.add("UpgradeLevel");
        renderedProperties.add("MaxUpgrade");
        renderedProperties.add("NextUpgCost");
        renderedProperties.add("Upgrading");
        renderedProperties.add("Pending");
        renderedProperties.add("UpgradeActions");
        continue;
      }
      if (def.type === "ACTION_BUTTON" /* ACTION_BUTTON */) {
        const btnContainer = document.createElement("div");
        btnContainer.className = "property-action-button-container";
        btnContainer.style.cssText = "padding: 12px 0; text-align: center;";
        const btn = document.createElement("button");
        btn.className = "property-action-button";
        btn.textContent = def.buttonLabel || def.displayName;
        btn.style.cssText = [
          "padding: 8px 20px",
          "cursor: pointer",
          "background: rgba(52, 89, 80, 0.8)",
          "color: #ffffcc",
          "border: 1px solid #4a7a6a",
          "border-radius: 4px",
          "font-family: Tahoma, Verdana, Arial, sans-serif",
          "font-size: 12px",
          "transition: background 0.2s, border-color 0.2s"
        ].join("; ");
        btn.onmouseenter = () => {
          btn.style.background = "rgba(74, 122, 106, 0.9)";
          btn.style.borderColor = "#ffffcc";
        };
        btn.onmouseleave = () => {
          btn.style.background = "rgba(52, 89, 80, 0.8)";
          btn.style.borderColor = "#4a7a6a";
        };
        if (onActionButton && def.actionId) {
          btn.onclick = () => onActionButton(def.actionId);
        }
        btnContainer.appendChild(btn);
        container.appendChild(btnContainer);
        renderedProperties.add(def.rdoName);
        continue;
      }
      if (def.type === "TABLE" /* TABLE */ && def.columns) {
        const tableEl = renderDataTable(def, properties, valueMap, onPropertyChange);
        container.appendChild(tableEl);
        for (const prop of properties) {
          if (prop.index !== void 0) {
            const suffix2 = def.indexSuffix || "";
            for (const col of def.columns) {
              const colName = `${col.rdoSuffix}${prop.index}${col.columnSuffix || ""}${suffix2}`;
              renderedProperties.add(colName);
            }
          }
        }
        continue;
      }
      const suffix = def.indexSuffix || "";
      if (def.indexed && def.countProperty) {
        const indexedValues = [];
        for (const prop of properties) {
          const escapedSuffix = suffix.replace(/\./g, "\\.");
          const regex = new RegExp(`^${def.rdoName}(\\d+)${escapedSuffix}$`);
          const match = prop.name.match(regex);
          if (match) {
            indexedValues.push(prop);
            renderedProperties.add(prop.name);
          }
        }
        if (indexedValues.length > 0) {
          if (indexedValues.length === 1) {
            for (const indexedValue of indexedValues) {
              const itemDef = {
                ...def,
                displayName: `${def.displayName}`,
                indexed: false
              };
              let maxValue;
              if (def.type === "RATIO" /* RATIO */ && def.maxProperty) {
                const maxPropName = `${def.maxProperty}${indexedValue.index ?? 0}${suffix}`;
                maxValue = valueMap.get(maxPropName);
                if (maxValue) {
                  renderedProperties.add(maxPropName);
                }
              }
              const row = renderPropertyRow(
                itemDef,
                indexedValue,
                maxValue,
                onPropertyChange ? (val) => onPropertyChange(indexedValue.name, val) : void 0
              );
              container.appendChild(row);
            }
          } else {
            const groupContainer = document.createElement("div");
            groupContainer.className = "indexed-property-group";
            const groupLabel = document.createElement("div");
            groupLabel.className = "property-group-label";
            groupLabel.textContent = def.displayName;
            groupContainer.appendChild(groupLabel);
            const itemsContainer = document.createElement("div");
            itemsContainer.className = "indexed-items-list";
            for (const indexedValue of indexedValues) {
              const itemDef = {
                ...def,
                displayName: `${def.displayName} ${indexedValue.index ?? ""}`,
                indexed: false
              };
              let maxValue;
              if (def.type === "RATIO" /* RATIO */ && def.maxProperty) {
                const maxPropName = `${def.maxProperty}${indexedValue.index ?? 0}${suffix}`;
                maxValue = valueMap.get(maxPropName);
                if (maxValue) {
                  renderedProperties.add(maxPropName);
                }
              }
              const row = renderPropertyRow(
                itemDef,
                indexedValue,
                maxValue,
                onPropertyChange ? (val) => onPropertyChange(indexedValue.name, val) : void 0
              );
              itemsContainer.appendChild(row);
            }
            groupContainer.appendChild(itemsContainer);
            container.appendChild(groupContainer);
          }
        }
      } else if (def.indexed && !def.countProperty) {
        const indexedValues = [];
        for (let i = 0; i <= (def.indexMax || 9); i++) {
          const propName = `${def.rdoName}${i}${suffix}`;
          const value = valueMap.get(propName);
          if (value) {
            indexedValues.push({ name: propName, value, index: i });
            renderedProperties.add(propName);
          }
        }
        if (indexedValues.length > 0) {
          for (const indexedValue of indexedValues) {
            const itemDef = {
              ...def,
              displayName: `${def.displayName} ${indexedValue.index ?? ""}`,
              indexed: false
            };
            let maxValue;
            if (def.type === "RATIO" /* RATIO */ && def.maxProperty) {
              const maxPropName = `${def.maxProperty}${indexedValue.index ?? 0}${suffix}`;
              maxValue = valueMap.get(maxPropName);
              if (maxValue) {
                renderedProperties.add(maxPropName);
              }
            }
            const row = renderPropertyRow(
              itemDef,
              indexedValue,
              maxValue,
              onPropertyChange ? (val) => onPropertyChange(indexedValue.name, val) : void 0
            );
            container.appendChild(row);
          }
        }
      } else {
        const value = valueMap.get(def.rdoName);
        if (value !== void 0) {
          const isUpgradeProperty = ["UpgradeLevel", "MaxUpgrade", "NextUpgCost", "Upgrading", "Pending"].includes(def.rdoName);
          if (def.hideEmpty && !isUpgradeProperty && (!value || value.trim() === "" || value === "0")) {
            continue;
          }
          if (isUpgradeProperty) {
            renderedProperties.add(def.rdoName);
            continue;
          }
          renderedProperties.add(def.rdoName);
          const propValue = {
            name: def.rdoName,
            value
          };
          let maxValue;
          if (def.type === "RATIO" /* RATIO */ && def.maxProperty) {
            maxValue = valueMap.get(def.maxProperty);
            if (maxValue) {
              renderedProperties.add(def.maxProperty);
            }
          }
          const row = renderPropertyRow(
            def,
            propValue,
            maxValue,
            onPropertyChange ? (val) => onPropertyChange(def.rdoName, val) : void 0
          );
          container.appendChild(row);
        }
      }
    }
    for (const prop of properties) {
      if (!renderedProperties.has(prop.name)) {
        if (prop.name.startsWith("_") || prop.name === "ObjectId" || prop.name === "SecurityId") {
          continue;
        }
        const fallbackDef = {
          rdoName: prop.name,
          displayName: prop.name,
          type: "TEXT" /* TEXT */
        };
        const row = renderPropertyRow(fallbackDef, prop);
        container.appendChild(row);
      }
    }
    return container;
  }
  function renderUpgradeActions(properties, onAction) {
    const container = document.createElement("div");
    container.className = "upgrade-actions-container";
    const valueMap = /* @__PURE__ */ new Map();
    for (const prop of properties) {
      valueMap.set(prop.name, prop.value);
    }
    const isUpgrading = valueMap.get("Upgrading") === "1" || valueMap.get("Upgrading")?.toLowerCase() === "yes";
    const currentLevel = parseInt(valueMap.get("UpgradeLevel") || "0");
    const maxLevel = parseInt(valueMap.get("MaxUpgrade") || "0");
    const pending = parseInt(valueMap.get("Pending") || "0");
    const levelText = document.createElement("div");
    levelText.className = "upgrade-level-text";
    if (isUpgrading && pending > 0) {
      levelText.innerHTML = `Level ${currentLevel}<span class="upgrade-pending">(+${pending})</span>/${maxLevel}`;
    } else {
      levelText.textContent = `Level ${currentLevel}/${maxLevel}`;
    }
    container.appendChild(levelText);
    if (isUpgrading && pending > 0) {
      const stopBtn = document.createElement("button");
      stopBtn.className = "upgrade-stop-btn";
      stopBtn.textContent = "STOP";
      stopBtn.onclick = () => {
        if (onAction) {
          onAction("STOP_UPGRADE");
        }
      };
      container.appendChild(stopBtn);
    } else {
      const upgradeRow = document.createElement("div");
      upgradeRow.className = "upgrade-row";
      const upgradeLabel = document.createElement("span");
      upgradeLabel.className = "upgrade-label";
      upgradeLabel.textContent = "Upgrade";
      const decrementBtn = document.createElement("button");
      decrementBtn.className = "upgrade-decrement-btn";
      decrementBtn.textContent = "-";
      decrementBtn.disabled = currentLevel >= maxLevel;
      decrementBtn.onclick = () => {
        const current = parseInt(qtyInput.value) || 1;
        if (current > 1) {
          qtyInput.value = (current - 1).toString();
        }
      };
      const qtyInput = document.createElement("input");
      qtyInput.type = "number";
      qtyInput.className = "upgrade-qty-input";
      qtyInput.min = "1";
      qtyInput.max = Math.max(1, maxLevel - currentLevel).toString();
      qtyInput.value = "1";
      qtyInput.disabled = currentLevel >= maxLevel;
      const incrementBtn = document.createElement("button");
      incrementBtn.className = "upgrade-increment-btn";
      incrementBtn.textContent = "+";
      incrementBtn.disabled = currentLevel >= maxLevel;
      incrementBtn.onclick = () => {
        const current = parseInt(qtyInput.value) || 1;
        const max = parseInt(qtyInput.max);
        if (current < max) {
          qtyInput.value = (current + 1).toString();
        }
      };
      const validateBtn = document.createElement("button");
      validateBtn.className = "upgrade-validate-btn";
      validateBtn.textContent = "OK";
      validateBtn.disabled = currentLevel >= maxLevel;
      validateBtn.onclick = () => {
        const count = parseInt(qtyInput.value) || 1;
        if (onAction && count > 0 && currentLevel < maxLevel) {
          onAction("START_UPGRADE", count);
        }
      };
      upgradeRow.appendChild(upgradeLabel);
      upgradeRow.appendChild(decrementBtn);
      upgradeRow.appendChild(qtyInput);
      upgradeRow.appendChild(incrementBtn);
      upgradeRow.appendChild(validateBtn);
      container.appendChild(upgradeRow);
    }
    const downgradeBtn = document.createElement("button");
    downgradeBtn.className = "downgrade-btn";
    downgradeBtn.textContent = "Downgrade";
    downgradeBtn.disabled = currentLevel <= 0;
    downgradeBtn.onclick = () => {
      if (onAction && currentLevel > 0) {
        onAction("DOWNGRADE");
      }
    };
    container.appendChild(downgradeBtn);
    return container;
  }

  // src/client/ui/building-details/property-table.ts
  function renderConnectionsTable(supply, onConnectionClick, onDisconnect, onSearchConnection) {
    const container = document.createElement("div");
    container.className = "property-table-container";
    const header = document.createElement("div");
    header.className = "supply-header";
    header.innerHTML = `
    <div class="supply-name">${escapeHtml(supply.name)}</div>
    <div class="supply-info">
      <span class="supply-fluid">${escapeHtml(supply.metaFluid)}</span>
      <span class="supply-value">${escapeHtml(supply.fluidValue)}</span>
      <span class="supply-count">${supply.connectionCount} connection${supply.connectionCount !== 1 ? "s" : ""}</span>
    </div>
  `;
    if (onSearchConnection) {
      const connectBtn = document.createElement("button");
      connectBtn.className = "search-connection-btn";
      connectBtn.textContent = "Find Suppliers";
      connectBtn.title = "Search for suppliers to connect";
      connectBtn.onclick = (e) => {
        e.stopPropagation();
        onSearchConnection(supply.metaFluid, supply.name, "input");
      };
      header.appendChild(connectBtn);
    }
    container.appendChild(header);
    if (supply.connections.length === 0) {
      const empty = document.createElement("div");
      empty.className = "table-empty";
      empty.textContent = "No connections";
      container.appendChild(empty);
      return container;
    }
    const table = document.createElement("table");
    table.className = "property-table";
    const thead = document.createElement("thead");
    thead.innerHTML = `
    <tr>
      <th>Facility</th>
      <th>Company</th>
      <th>Price</th>
      <th>Quality</th>
      <th>Last</th>
      <th>Status</th>
    </tr>
  `;
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const conn of supply.connections) {
      const disconnectHandler = onDisconnect ? () => onDisconnect(supply.metaFluid, conn.x, conn.y) : void 0;
      const row = createConnectionRow(conn, onConnectionClick, disconnectHandler);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    container.appendChild(table);
    return container;
  }
  function createConnectionRow(conn, onConnectionClick, onDisconnect) {
    const tr = document.createElement("tr");
    tr.className = conn.connected ? "connection-active" : "connection-inactive";
    const tdFacility = document.createElement("td");
    tdFacility.className = "cell-facility";
    if (conn.x > 0 && conn.y > 0 && onConnectionClick) {
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = conn.facilityName || "Unknown";
      link.onclick = (e) => {
        e.preventDefault();
        onConnectionClick(conn.x, conn.y);
      };
      tdFacility.appendChild(link);
    } else {
      tdFacility.textContent = conn.facilityName || "Unknown";
    }
    tr.appendChild(tdFacility);
    const tdCompany = document.createElement("td");
    tdCompany.className = "cell-company";
    tdCompany.textContent = conn.companyName || "-";
    tr.appendChild(tdCompany);
    const tdPrice = document.createElement("td");
    tdPrice.className = "cell-price";
    const price = parseFloat(conn.price);
    tdPrice.textContent = isNaN(price) ? conn.price : formatCurrency(price);
    tr.appendChild(tdPrice);
    const tdQuality = document.createElement("td");
    tdQuality.className = "cell-quality";
    tdQuality.textContent = conn.quality || "-";
    tr.appendChild(tdQuality);
    const tdLast = document.createElement("td");
    tdLast.className = "cell-last";
    tdLast.textContent = conn.lastValue || "-";
    tr.appendChild(tdLast);
    const tdStatus = document.createElement("td");
    tdStatus.className = "cell-status";
    const statusSpan = document.createElement("span");
    statusSpan.className = conn.connected ? "status-connected" : "status-disconnected";
    statusSpan.textContent = conn.connected ? "Active" : "Off";
    tdStatus.appendChild(statusSpan);
    if (onDisconnect && conn.x > 0 && conn.y > 0) {
      const disconnectBtn = document.createElement("button");
      disconnectBtn.className = "disconnect-btn";
      disconnectBtn.textContent = "X";
      disconnectBtn.title = "Disconnect";
      disconnectBtn.onclick = (e) => {
        e.stopPropagation();
        onDisconnect();
      };
      tdStatus.appendChild(disconnectBtn);
    }
    tr.appendChild(tdStatus);
    return tr;
  }
  function renderSuppliesWithTabs(supplies, onConnectionClick, onDisconnect, onSearchConnection) {
    const container = document.createElement("div");
    container.className = "supplies-container";
    if (supplies.length === 0) {
      const empty = document.createElement("div");
      empty.className = "supplies-empty";
      empty.textContent = "No supplies configured";
      container.appendChild(empty);
      return container;
    }
    if (supplies.length === 1) {
      container.appendChild(renderConnectionsTable(supplies[0], onConnectionClick, onDisconnect, onSearchConnection));
      return container;
    }
    const tabsNav = document.createElement("div");
    tabsNav.className = "nested-tabs-nav";
    const tabsContent = document.createElement("div");
    tabsContent.className = "nested-tabs-content";
    supplies.forEach((supply, index) => {
      const tabBtn = document.createElement("button");
      tabBtn.className = "nested-tab-btn" + (index === 0 ? " active" : "");
      tabBtn.textContent = supply.name || `Supply ${index + 1}`;
      tabBtn.dataset.index = index.toString();
      const tabPane = document.createElement("div");
      tabPane.className = "nested-tab-pane" + (index === 0 ? " active" : "");
      tabPane.dataset.index = index.toString();
      tabPane.appendChild(renderConnectionsTable(supply, onConnectionClick, onDisconnect, onSearchConnection));
      tabBtn.onclick = () => {
        tabsNav.querySelectorAll(".nested-tab-btn").forEach((btn) => btn.classList.remove("active"));
        tabsContent.querySelectorAll(".nested-tab-pane").forEach((pane) => pane.classList.remove("active"));
        tabBtn.classList.add("active");
        tabPane.classList.add("active");
      };
      tabsNav.appendChild(tabBtn);
      tabsContent.appendChild(tabPane);
    });
    container.appendChild(tabsNav);
    container.appendChild(tabsContent);
    return container;
  }
  function renderProductGateTable(product, onConnectionClick, onPriceChange, onDisconnect, onSearchConnection) {
    const container = document.createElement("div");
    container.className = "property-table-container";
    const header = document.createElement("div");
    header.className = "supply-header";
    const marketPrice = parseFloat(product.marketPrice);
    const pricePc = parseInt(product.pricePc, 10);
    const priceDisplay = !isNaN(marketPrice) && !isNaN(pricePc) ? formatCurrency(marketPrice * pricePc / 100) + ` (${pricePc}%)` : product.pricePc ? `${product.pricePc}%` : "-";
    header.innerHTML = `
    <div class="supply-name">${escapeHtml(product.name)}</div>
    <div class="supply-info">
      <span class="product-stat"><b>Produced:</b> ${escapeHtml(product.lastFluid || "-")}</span>
      <span class="product-stat"><b>Quality:</b> ${escapeHtml(product.quality ? product.quality + "%" : "-")}</span>
      <span class="product-stat"><b>Price:</b> ${priceDisplay}</span>
      <span class="product-stat"><b>Avg:</b> ${escapeHtml(product.avgPrice ? product.avgPrice + "%" : "-")}</span>
      <span class="supply-count">${product.connectionCount} client${product.connectionCount !== 1 ? "s" : ""}</span>
    </div>
  `;
    if (onSearchConnection) {
      const connectBtn = document.createElement("button");
      connectBtn.className = "search-connection-btn";
      connectBtn.textContent = "Find Clients";
      connectBtn.title = "Search for clients to connect";
      connectBtn.onclick = (e) => {
        e.stopPropagation();
        onSearchConnection(product.metaFluid, product.name, "output");
      };
      header.appendChild(connectBtn);
    }
    container.appendChild(header);
    if (onPriceChange) {
      const sliderContainer = document.createElement("div");
      sliderContainer.className = "product-price-slider";
      const label = document.createElement("label");
      label.textContent = "Sell Price: ";
      label.className = "slider-label";
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = "300";
      slider.step = "5";
      slider.value = isNaN(pricePc) ? "100" : pricePc.toString();
      slider.className = "property-slider";
      const valueDisplay = document.createElement("span");
      valueDisplay.className = "slider-value";
      valueDisplay.textContent = `${slider.value}%`;
      slider.oninput = () => {
        valueDisplay.textContent = `${slider.value}%`;
      };
      let debounceTimer = null;
      slider.onchange = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          onPriceChange("RDOSetOutputPrice", slider.value, { fluidId: product.metaFluid });
        }, 300);
      };
      sliderContainer.appendChild(label);
      sliderContainer.appendChild(slider);
      sliderContainer.appendChild(valueDisplay);
      container.appendChild(sliderContainer);
    }
    if (product.connections.length === 0) {
      const empty = document.createElement("div");
      empty.className = "table-empty";
      empty.textContent = "No clients connected";
      container.appendChild(empty);
      return container;
    }
    const table = document.createElement("table");
    table.className = "property-table";
    const thead = document.createElement("thead");
    thead.innerHTML = `
    <tr>
      <th>Facility</th>
      <th>Company</th>
      <th>Last Value</th>
      <th>Cost</th>
      <th>Status</th>
    </tr>
  `;
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const conn of product.connections) {
      const disconnectHandler = onDisconnect ? () => onDisconnect(product.metaFluid, conn.x, conn.y) : void 0;
      const row = createConnectionRow(conn, onConnectionClick, disconnectHandler);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    container.appendChild(table);
    return container;
  }
  function renderProductsWithTabs(products, onConnectionClick, onPriceChange, onDisconnect, onSearchConnection) {
    const container = document.createElement("div");
    container.className = "supplies-container";
    if (products.length === 0) {
      const empty = document.createElement("div");
      empty.className = "supplies-empty";
      empty.textContent = "No products configured";
      container.appendChild(empty);
      return container;
    }
    if (products.length === 1) {
      container.appendChild(renderProductGateTable(products[0], onConnectionClick, onPriceChange, onDisconnect, onSearchConnection));
      return container;
    }
    const tabsNav = document.createElement("div");
    tabsNav.className = "nested-tabs-nav";
    const tabsContent = document.createElement("div");
    tabsContent.className = "nested-tabs-content";
    products.forEach((product, index) => {
      const tabBtn = document.createElement("button");
      tabBtn.className = "nested-tab-btn" + (index === 0 ? " active" : "");
      tabBtn.textContent = product.name || `Product ${index + 1}`;
      tabBtn.dataset.index = index.toString();
      const tabPane = document.createElement("div");
      tabPane.className = "nested-tab-pane" + (index === 0 ? " active" : "");
      tabPane.dataset.index = index.toString();
      tabPane.appendChild(renderProductGateTable(product, onConnectionClick, onPriceChange, onDisconnect, onSearchConnection));
      tabBtn.onclick = () => {
        tabsNav.querySelectorAll(".nested-tab-btn").forEach((btn) => btn.classList.remove("active"));
        tabsContent.querySelectorAll(".nested-tab-pane").forEach((pane) => pane.classList.remove("active"));
        tabBtn.classList.add("active");
        tabPane.classList.add("active");
      };
      tabsNav.appendChild(tabBtn);
      tabsContent.appendChild(tabPane);
    });
    container.appendChild(tabsNav);
    container.appendChild(tabsContent);
    return container;
  }
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // src/client/ui/building-details/property-graph.ts
  var DEFAULT_OPTIONS = {
    width: 280,
    height: 60,
    lineColor: "#4a90e2",
    fillColor: "rgba(74, 144, 226, 0.2)",
    showLabels: true,
    showGrid: false
  };
  function renderSparklineGraph(values, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const container = document.createElement("div");
    container.className = "property-graph";
    if (values.length < 2) {
      container.innerHTML = '<div class="graph-empty">No data</div>';
      return container;
    }
    const canvas = document.createElement("canvas");
    canvas.className = "graph-canvas";
    canvas.width = opts.width;
    canvas.height = opts.height;
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      container.innerHTML = '<div class="graph-error">Canvas not supported</div>';
      return container;
    }
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;
    const padding = { top: 5, right: 5, bottom: 5, left: 5 };
    const graphWidth = canvas.width - padding.left - padding.right;
    const graphHeight = canvas.height - padding.top - padding.bottom;
    const points = [];
    const stepX = graphWidth / (values.length - 1);
    for (let i = 0; i < values.length; i++) {
      const x = padding.left + i * stepX;
      const normalizedY = (values[i] - minVal) / range;
      const y = padding.top + graphHeight - normalizedY * graphHeight;
      points.push({ x, y });
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, canvas.height - padding.bottom);
    for (const point of points) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.lineTo(points[points.length - 1].x, canvas.height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = opts.fillColor;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = opts.lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = opts.lineColor;
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(points[points.length - 1].x, points[points.length - 1].y, 3, 0, Math.PI * 2);
    ctx.fill();
    if (opts.showLabels) {
      const labelsContainer = document.createElement("div");
      labelsContainer.className = "graph-labels";
      const minLabel = document.createElement("span");
      minLabel.className = "graph-label graph-label-min";
      minLabel.textContent = formatGraphValue(minVal);
      const maxLabel = document.createElement("span");
      maxLabel.className = "graph-label graph-label-max";
      maxLabel.textContent = formatGraphValue(maxVal);
      const currentLabel = document.createElement("span");
      currentLabel.className = "graph-label graph-label-current";
      const current = values[values.length - 1];
      currentLabel.textContent = `Current: ${formatGraphValue(current)}`;
      const trend = current - values[0];
      const trendSpan = document.createElement("span");
      trendSpan.className = "graph-trend";
      if (trend > 0) {
        trendSpan.classList.add("trend-up");
        trendSpan.textContent = ` (+${formatGraphValue(trend)})`;
      } else if (trend < 0) {
        trendSpan.classList.add("trend-down");
        trendSpan.textContent = ` (${formatGraphValue(trend)})`;
      }
      currentLabel.appendChild(trendSpan);
      labelsContainer.appendChild(minLabel);
      labelsContainer.appendChild(maxLabel);
      labelsContainer.appendChild(currentLabel);
      container.appendChild(labelsContainer);
    }
    return container;
  }
  function formatGraphValue(value) {
    const absVal = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (absVal >= 1e9) {
      return `${sign}$${(absVal / 1e9).toFixed(1)}B`;
    } else if (absVal >= 1e6) {
      return `${sign}$${(absVal / 1e6).toFixed(1)}M`;
    } else if (absVal >= 1e3) {
      return `${sign}$${(absVal / 1e3).toFixed(1)}K`;
    }
    return `${sign}$${absVal.toFixed(0)}`;
  }

  // src/client/ui/building-details/building-details-panel.ts
  var BuildingDetailsPanel = class _BuildingDetailsPanel {
    constructor(container, options = {}) {
      this.modal = null;
      this.header = null;
      this.tabsNav = null;
      this.contentContainer = null;
      this.currentDetails = null;
      this.currentTab = "overview";
      this.isDragging = false;
      this.dragOffsetX = 0;
      this.dragOffsetY = 0;
      this.posX = 0;
      this.posY = 0;
      // Track focused/editing elements to avoid disrupting user input
      this.activeFocusedElement = null;
      // Rename mode state
      this.isRenameMode = false;
      // Auto-refresh timer (20s interval while panel is open)
      this.refreshInterval = null;
      this.container = container;
      this.options = options;
      this.init();
    }
    static {
      this.REFRESH_INTERVAL_MS = 2e4;
    }
    /**
     * Whether the current player owns the currently displayed building.
     * When false, edit controls (rename, delete, sliders, upgrade) are hidden.
     */
    get isOwner() {
      if (!this.currentDetails || !this.options.currentCompanyName) {
        console.debug(`[BuildingDetails] isOwner=false: details=${!!this.currentDetails}, companyName="${this.options.currentCompanyName || ""}"`);
        return false;
      }
      const match = this.currentDetails.ownerName === this.options.currentCompanyName;
      if (!match) {
        console.debug(`[BuildingDetails] isOwner=false: owner="${this.currentDetails.ownerName}" vs company="${this.options.currentCompanyName}"`);
      }
      return match;
    }
    /**
     * Update panel callback options
     */
    updateOptions(opts) {
      Object.assign(this.options, opts);
    }
    /**
     * Initialize the panel DOM
     */
    init() {
      this.modal = document.createElement("div");
      this.modal.id = "building-details-panel";
      this.modal.className = "building-details-panel";
      this.modal.style.display = "none";
      this.header = this.createHeader();
      this.modal.appendChild(this.header);
      this.tabsNav = document.createElement("div");
      this.tabsNav.className = "building-details-tabs";
      this.modal.appendChild(this.tabsNav);
      this.contentContainer = document.createElement("div");
      this.contentContainer.className = "building-details-content";
      this.modal.appendChild(this.contentContainer);
      const footer = this.createFooter();
      this.modal.appendChild(footer);
      this.container.appendChild(this.modal);
      this.setupFocusTracking();
    }
    /**
     * Setup focus tracking to prevent refresh interference with user input
     */
    setupFocusTracking() {
      if (!this.modal) return;
      this.modal.addEventListener("focusin", (e) => {
        const target = e.target;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
          this.activeFocusedElement = target;
        }
      });
      this.modal.addEventListener("focusout", (e) => {
        const target = e.target;
        if (target === this.activeFocusedElement) {
          this.activeFocusedElement = null;
        }
      });
    }
    /**
     * Create the panel header
     */
    createHeader() {
      const header = document.createElement("div");
      header.className = "building-details-header";
      const titleContainer = document.createElement("div");
      titleContainer.className = "header-title-container";
      titleContainer.innerHTML = `
      <div class="header-icon">B</div>
      <div class="header-info">
        <div class="header-title-wrapper">
          <div class="header-title" id="bd-building-name">Building</div>
          <button class="rename-btn" id="bd-rename-btn" title="Rename building">\u270E</button>
        </div>
        <div class="header-subtitle" id="bd-template-name">Loading...</div>
      </div>
    `;
      const buttonContainer = document.createElement("div");
      buttonContainer.className = "header-buttons";
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "header-delete-btn";
      deleteBtn.innerHTML = "\u{1F5D1}\uFE0F";
      deleteBtn.title = "Delete building";
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        this.showDeleteConfirmation();
      };
      const refreshBtn = document.createElement("button");
      refreshBtn.className = "header-refresh-btn";
      refreshBtn.innerHTML = "\u21BB";
      refreshBtn.title = "Refresh current tab";
      refreshBtn.onclick = async (e) => {
        e.stopPropagation();
        await this.handleManualRefresh();
      };
      const closeBtn = document.createElement("button");
      closeBtn.className = "header-close-btn";
      closeBtn.innerHTML = "X";
      closeBtn.title = "Close";
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.hide();
        if (this.options.onClose) {
          this.options.onClose();
        }
      };
      buttonContainer.appendChild(deleteBtn);
      buttonContainer.appendChild(refreshBtn);
      buttonContainer.appendChild(closeBtn);
      header.appendChild(titleContainer);
      header.appendChild(buttonContainer);
      header.onmousedown = (e) => {
        const target = e.target;
        if (!target.closest("button") && !target.closest("input")) {
          this.startDrag(e);
        }
      };
      return header;
    }
    /**
     * Create the panel footer
     */
    createFooter() {
      const footer = document.createElement("div");
      footer.className = "building-details-footer";
      footer.innerHTML = `
      <div class="footer-coords" id="bd-coords">(0, 0)</div>
      <div class="footer-visual-class" id="bd-visual-class">VC: --</div>
      <div class="footer-timestamp" id="bd-timestamp">--:--:--</div>
    `;
      return footer;
    }
    /**
     * Show the panel with building details
     */
    show(details) {
      this.currentDetails = details;
      if (this.posX === 0 && this.posY === 0) {
        const rect = this.container.getBoundingClientRect();
        this.posX = (rect.width - 650) / 2;
        this.posY = 80;
      }
      this.updatePosition();
      this.renderContent();
      if (this.modal) {
        this.modal.style.display = "flex";
        this.modal.style.animation = "scaleIn 0.2s ease-out";
      }
      this.startAutoRefresh();
    }
    /**
     * Hide the panel
     */
    hide() {
      this.stopAutoRefresh();
      if (this.modal) {
        this.modal.style.animation = "fadeOut 0.2s ease-out";
        setTimeout(() => {
          if (this.modal) {
            this.modal.style.display = "none";
          }
        }, 200);
      }
    }
    /**
     * Start periodic auto-refresh (every 20s)
     * Skips refresh if user is actively editing an input
     */
    startAutoRefresh() {
      this.stopAutoRefresh();
      this.refreshInterval = setInterval(async () => {
        if (!this.activeFocusedElement && this.options.onRefresh) {
          await this.options.onRefresh();
        }
      }, _BuildingDetailsPanel.REFRESH_INTERVAL_MS);
    }
    /**
     * Stop the auto-refresh timer
     */
    stopAutoRefresh() {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
    }
    /**
     * Check if panel is visible
     */
    isVisible() {
      return this.modal?.style.display !== "none";
    }
    /**
     * Update the panel with new details
     * Uses smart refresh to avoid disrupting user input
     */
    update(details) {
      this.currentDetails = details;
      if (this.activeFocusedElement) {
        this.renderContentSmart();
      } else {
        this.renderContent();
      }
    }
    /**
     * Handle manual refresh button click
     * Triggers refresh callback provided by parent
     */
    async handleManualRefresh() {
      if (this.options.onRefresh) {
        const refreshBtn = this.header?.querySelector(".header-refresh-btn");
        if (refreshBtn) {
          refreshBtn.disabled = true;
          refreshBtn.style.opacity = "0.5";
        }
        try {
          await this.options.onRefresh();
        } finally {
          if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.style.opacity = "1";
          }
        }
      }
    }
    /**
     * Setup rename button functionality
     */
    setupRenameButton() {
      const renameBtn = document.getElementById("bd-rename-btn");
      if (!renameBtn) return;
      renameBtn.onclick = (e) => {
        e.stopPropagation();
        this.enterRenameMode();
      };
    }
    /**
     * Enter rename mode - replace title with input field
     */
    enterRenameMode() {
      if (this.isRenameMode || !this.currentDetails) return;
      this.isRenameMode = true;
      const nameEl = document.getElementById("bd-building-name");
      const renameBtn = document.getElementById("bd-rename-btn");
      if (!nameEl) return;
      const currentName = nameEl.textContent || "";
      const wrapper = nameEl.parentElement;
      if (!wrapper) return;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "rename-input";
      input.value = currentName;
      input.id = "bd-rename-input";
      const confirmBtn = document.createElement("button");
      confirmBtn.className = "rename-confirm-btn";
      confirmBtn.innerHTML = "\u2713";
      confirmBtn.title = "Confirm rename";
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "rename-cancel-btn";
      cancelBtn.innerHTML = "\u2715";
      cancelBtn.title = "Cancel rename";
      nameEl.style.display = "none";
      if (renameBtn) renameBtn.style.display = "none";
      wrapper.appendChild(input);
      wrapper.appendChild(confirmBtn);
      wrapper.appendChild(cancelBtn);
      input.focus();
      input.select();
      const confirmRename = async () => {
        const newName = input.value.trim();
        if (newName && newName !== currentName && this.options.onRename) {
          try {
            await this.options.onRename(newName);
            if (this.currentDetails) {
              this.currentDetails.buildingName = newName;
            }
          } catch (err) {
            console.error("[BuildingDetails] Failed to rename:", err);
          }
        }
        this.exitRenameMode();
      };
      const cancelRename = () => {
        this.exitRenameMode();
      };
      confirmBtn.onclick = (e) => {
        e.stopPropagation();
        confirmRename();
      };
      cancelBtn.onclick = (e) => {
        e.stopPropagation();
        cancelRename();
      };
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmRename();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelRename();
        }
      };
    }
    /**
     * Exit rename mode - restore title display
     */
    exitRenameMode() {
      if (!this.isRenameMode) return;
      this.isRenameMode = false;
      const nameEl = document.getElementById("bd-building-name");
      const renameBtn = document.getElementById("bd-rename-btn");
      const input = document.getElementById("bd-rename-input");
      const confirmBtn = document.querySelector(".rename-confirm-btn");
      const cancelBtn = document.querySelector(".rename-cancel-btn");
      if (nameEl) nameEl.style.display = "";
      if (renameBtn) renameBtn.style.display = "";
      if (input) input.remove();
      if (confirmBtn) confirmBtn.remove();
      if (cancelBtn) cancelBtn.remove();
    }
    /**
     * Show delete confirmation popup
     */
    showDeleteConfirmation() {
      if (!this.currentDetails) return;
      const backdrop = document.createElement("div");
      backdrop.className = "delete-confirmation-backdrop";
      const dialog = document.createElement("div");
      dialog.className = "delete-confirmation-dialog";
      const title = document.createElement("h3");
      title.textContent = "Delete Building";
      const message = document.createElement("p");
      message.textContent = `Are you sure you want to delete "${this.currentDetails.buildingName || "this building"}"? This action cannot be undone.`;
      const buttonContainer = document.createElement("div");
      buttonContainer.className = "delete-confirmation-buttons";
      const confirmBtn = document.createElement("button");
      confirmBtn.className = "delete-confirm-btn";
      confirmBtn.textContent = "Confirm";
      confirmBtn.onclick = async () => {
        backdrop.remove();
        await this.handleDelete();
      };
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "delete-cancel-btn";
      cancelBtn.textContent = "Cancel";
      cancelBtn.onclick = () => {
        backdrop.remove();
      };
      buttonContainer.appendChild(cancelBtn);
      buttonContainer.appendChild(confirmBtn);
      dialog.appendChild(title);
      dialog.appendChild(message);
      dialog.appendChild(buttonContainer);
      backdrop.appendChild(dialog);
      this.container.appendChild(backdrop);
      backdrop.onclick = (e) => {
        if (e.target === backdrop) {
          backdrop.remove();
        }
      };
    }
    /**
     * Handle delete action
     */
    async handleDelete() {
      if (!this.currentDetails || !this.options.onDelete) return;
      try {
        await this.options.onDelete();
        this.hide();
        if (this.options.onClose) {
          this.options.onClose();
        }
      } catch (error) {
        console.error("Failed to delete building:", error);
      }
    }
    /**
     * Render the full content
     */
    renderContent() {
      if (!this.currentDetails) return;
      const details = this.currentDetails;
      const nameEl = document.getElementById("bd-building-name");
      const templateEl = document.getElementById("bd-template-name");
      const coordsEl = document.getElementById("bd-coords");
      const visualClassEl = document.getElementById("bd-visual-class");
      const timestampEl = document.getElementById("bd-timestamp");
      const nameValue = details.buildingName || details.templateName || "Building";
      if (nameEl) nameEl.textContent = nameValue;
      if (templateEl) templateEl.textContent = details.templateName || "";
      if (coordsEl) coordsEl.textContent = `(${details.x}, ${details.y})`;
      if (visualClassEl) visualClassEl.textContent = `VC: ${details.visualClass}`;
      if (timestampEl) {
        const date = new Date(details.timestamp);
        timestampEl.textContent = date.toLocaleTimeString();
      }
      this.setupRenameButton();
      const renameBtn = document.getElementById("bd-rename-btn");
      const deleteBtn = this.modal?.querySelector(".header-delete-btn");
      if (renameBtn) renameBtn.style.display = this.isOwner ? "" : "none";
      if (deleteBtn) deleteBtn.style.display = this.isOwner ? "" : "none";
      this.renderTabs(details.tabs);
      this.renderTabContent();
    }
    /**
     * Smart refresh: Update only non-editable elements while user is editing
     * This prevents disrupting user input during automatic refreshes
     */
    renderContentSmart() {
      if (!this.currentDetails || !this.contentContainer) return;
      const details = this.currentDetails;
      const nameEl = document.getElementById("bd-building-name");
      const templateEl = document.getElementById("bd-template-name");
      const coordsEl = document.getElementById("bd-coords");
      const visualClassEl = document.getElementById("bd-visual-class");
      const timestampEl = document.getElementById("bd-timestamp");
      const nameValue = details.buildingName || details.templateName || "Building";
      if (nameEl) nameEl.textContent = nameValue;
      if (templateEl) templateEl.textContent = details.templateName || "";
      if (coordsEl) coordsEl.textContent = `(${details.x}, ${details.y})`;
      if (visualClassEl) visualClassEl.textContent = `VC: ${details.visualClass}`;
      if (timestampEl) {
        const date = new Date(details.timestamp);
        timestampEl.textContent = date.toLocaleTimeString();
      }
      this.updateReadOnlyValues();
    }
    /**
     * Update only read-only (non-input) values in the current view
     * Preserves all input elements to avoid disrupting user editing
     */
    updateReadOnlyValues() {
      if (!this.currentDetails || !this.contentContainer) return;
      const details = this.currentDetails;
      const tab = details.tabs?.find((t) => t.id === this.currentTab);
      if (!tab) return;
      const group = getGroupById(tab.id);
      if (!group) return;
      const textElements = this.contentContainer.querySelectorAll(".property-value:not(.property-slider-container)");
      textElements.forEach((el) => {
        const row = el.closest(".property-row");
        if (!row) return;
        if (row.contains(this.activeFocusedElement)) return;
        const label = row.querySelector(".property-label");
        if (!label) return;
        const propertyName = label.textContent?.trim();
        if (!propertyName) return;
        const propDef = group.properties.find((p) => p.displayName === propertyName);
        if (!propDef) return;
        const groupData = details.groups[group.id];
        if (!groupData) return;
        const propValue = groupData.find((p) => p.name === propDef.rdoName);
        if (!propValue) return;
        if (el.classList.contains("property-text")) {
          el.textContent = propValue.value || "-";
        } else if (el.classList.contains("property-currency")) {
          const num = parseFloat(propValue.value);
          el.textContent = `$${num.toLocaleString()}`;
        } else if (el.classList.contains("property-percentage")) {
          const num = parseFloat(propValue.value);
          el.textContent = `${num}%`;
        } else if (el.classList.contains("property-number")) {
          el.textContent = propValue.value;
        }
      });
    }
    /**
     * Render tab navigation
     */
    renderTabs(tabs) {
      if (!this.tabsNav || !tabs?.length) return;
      this.tabsNav.innerHTML = "";
      const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);
      const tabExists = sortedTabs.some((t) => t.id === this.currentTab);
      if (!tabExists && sortedTabs.length > 0) {
        this.currentTab = sortedTabs[0].id;
      }
      for (const tab of sortedTabs) {
        const hasData = (this.currentDetails?.groups[tab.id]?.length ?? 0) > 0 || tab.special === "supplies" && (this.currentDetails?.supplies?.length ?? 0) > 0 || tab.special === "products" && (this.currentDetails?.products?.length ?? 0) > 0 || tab.special === "finances" && (this.currentDetails?.moneyGraph?.length ?? 0) > 0;
        const btn = document.createElement("button");
        btn.className = "tab-btn" + (this.currentTab === tab.id ? " active" : "");
        if (!hasData) btn.classList.add("tab-empty");
        btn.innerHTML = `<span class="tab-icon">${tab.icon || ""}</span><span class="tab-label">${tab.name}</span>`;
        btn.onclick = async () => {
          const previousTab = this.currentTab;
          this.currentTab = tab.id;
          this.renderTabs(sortedTabs);
          this.renderTabContent();
          if (previousTab !== tab.id && this.options.onRefresh) {
            await this.options.onRefresh();
          }
        };
        this.tabsNav.appendChild(btn);
      }
    }
    renderTabContent() {
      if (!this.contentContainer || !this.currentDetails) return;
      this.contentContainer.innerHTML = "";
      const details = this.currentDetails;
      const tab = details.tabs?.find((t) => t.id === this.currentTab);
      if (!tab) {
        this.contentContainer.innerHTML = "<p>No data available</p>";
        return;
      }
      const group = getGroupById(tab.id);
      const changeCallback = this.isOwner ? this.handlePropertyChange.bind(this) : void 0;
      const isSupplies = tab.special === "supplies";
      const isProducts = tab.special === "products";
      const isFinances = tab.special === "finances" || tab.id === "finances";
      const isUpgrade = tab.id === "upgrade" || tab.handlerName === "facManagement";
      if (isSupplies && details.supplies?.length) {
        const supplyDisconnect = this.isOwner ? async (fluidId, x, y) => {
          if (this.options.onPropertyChange) {
            await this.options.onPropertyChange("RDODisconnectInput", "0", {
              fluidId,
              connectionList: `${x},${y}`
            });
            if (this.options.onRefresh) await this.options.onRefresh();
          }
        } : void 0;
        const supplySearch = this.isOwner ? (fluidId, fluidName, direction) => {
          this.options.onSearchConnections?.(fluidId, fluidName, direction);
        } : void 0;
        const suppliesEl = renderSuppliesWithTabs(
          details.supplies,
          this.options.onNavigateToBuilding,
          supplyDisconnect,
          supplySearch
        );
        this.contentContainer.appendChild(suppliesEl);
        return;
      }
      if (isProducts && details.products?.length) {
        const productPriceChange = this.isOwner ? async (propertyName, value, additionalParams) => {
          if (this.options.onPropertyChange) {
            await this.options.onPropertyChange(propertyName, value, additionalParams);
            if (this.options.onRefresh) await this.options.onRefresh();
          }
        } : void 0;
        const productDisconnect = this.isOwner ? async (fluidId, x, y) => {
          if (this.options.onPropertyChange) {
            await this.options.onPropertyChange("RDODisconnectOutput", "0", {
              fluidId,
              connectionList: `${x},${y}`
            });
            if (this.options.onRefresh) await this.options.onRefresh();
          }
        } : void 0;
        const productSearch = this.isOwner ? (fluidId, fluidName, direction) => {
          this.options.onSearchConnections?.(fluidId, fluidName, direction);
        } : void 0;
        const productsEl = renderProductsWithTabs(
          details.products,
          this.options.onNavigateToBuilding,
          productPriceChange,
          productDisconnect,
          productSearch
        );
        this.contentContainer.appendChild(productsEl);
        return;
      }
      if (isFinances && details.moneyGraph?.length) {
        const graphEl = renderSparklineGraph(details.moneyGraph, {
          width: 440,
          height: 100,
          showLabels: true
        });
        this.contentContainer.appendChild(graphEl);
        const financeProps = details.groups[tab.id];
        if (financeProps?.length && group) {
          const propsEl2 = renderPropertyGroup(
            financeProps,
            group.properties,
            changeCallback,
            this.handleActionButton.bind(this)
          );
          this.contentContainer.appendChild(propsEl2);
        }
        return;
      }
      const groupData = details.groups[tab.id];
      if (!groupData || groupData.length === 0) {
        const placeholder = document.createElement("div");
        placeholder.className = "tab-placeholder";
        placeholder.innerHTML = `<p class="tab-placeholder-text">No data available for this section</p>`;
        this.contentContainer.appendChild(placeholder);
        return;
      }
      const properties = group?.properties || [];
      const propsEl = renderPropertyGroup(
        groupData,
        properties,
        changeCallback,
        this.handleActionButton.bind(this)
      );
      this.contentContainer.appendChild(propsEl);
      if (isUpgrade && this.isOwner) {
        this.wireUpgradeActions();
      }
    }
    /**
     * Handle property change from slider
     * Converts RDO property name to RDO command with appropriate parameters
     * Automatically refreshes data after successful update
     */
    async handlePropertyChange(propertyName, value, additionalParams) {
      if (!this.options.onPropertyChange) return;
      const { rdoCommand, params } = this.mapPropertyToRdoCommand(propertyName, value);
      const finalParams = { ...params, ...additionalParams };
      await this.options.onPropertyChange(rdoCommand, value.toString(), finalParams);
      if (this.options.onRefresh) {
        await this.options.onRefresh();
      }
    }
    /**
     * Handle action button click from property renderers
     */
    handleActionButton(actionId) {
      if (this.options.onActionButton && this.currentDetails) {
        this.options.onActionButton(actionId, this.currentDetails);
      }
    }
    /**
     * Map RDO property name to RDO command with parameters
     *
     * Examples:
     * - srvPrices0 → { rdoCommand: 'RDOSetPrice', params: { index: '0' } }
     * - Salaries0 → { rdoCommand: 'RDOSetSalaries', params: { salary0: '100', salary1: '100', salary2: '150' } }
     * - MaxPrice → { rdoCommand: 'RDOSetInputMaxPrice', params: { metaFluid: '?' } }
     */
    mapPropertyToRdoCommand(propertyName, value) {
      const group = getGroupById(this.currentTab);
      if (group?.rdoCommands) {
        const mapping = group.rdoCommands[propertyName];
        if (mapping) {
          if (mapping.allSalaries) {
            const salaryParams = this.getSalaryParams(0, value);
            return { rdoCommand: mapping.command, params: salaryParams };
          }
          if (mapping.command === "property") {
            return { rdoCommand: "property", params: { propertyName } };
          }
          return { rdoCommand: mapping.command, params: mapping.params ? { ...mapping.params } : {} };
        }
        const indexMatch2 = propertyName.match(/^(\w+?)(\d+)(.*)$/);
        if (indexMatch2) {
          const baseName = indexMatch2[1];
          const index = indexMatch2[2];
          const baseMapping = group.rdoCommands[baseName];
          if (baseMapping?.indexed) {
            return { rdoCommand: baseMapping.command, params: { index } };
          }
          const suffixName = baseName + indexMatch2[3];
          const suffixMapping = group.rdoCommands[suffixName];
          if (suffixMapping?.indexed) {
            return { rdoCommand: suffixMapping.command, params: { index } };
          }
        }
      }
      const indexMatch = propertyName.match(/^(\w+?)(\d+)$/);
      if (indexMatch) {
        const baseName = indexMatch[1];
        const index = indexMatch[2];
        switch (baseName) {
          case "srvPrices":
            return { rdoCommand: "RDOSetPrice", params: { index } };
          case "Salaries": {
            const salaryParams = this.getSalaryParams(parseInt(index), value);
            return { rdoCommand: "RDOSetSalaries", params: salaryParams };
          }
          case "cInputDem":
            return { rdoCommand: "RDOSetCompanyInputDemand", params: { index } };
          default:
            console.warn(`[BuildingDetails] Unknown indexed property: ${propertyName}`);
            return { rdoCommand: propertyName, params: {} };
        }
      }
      switch (propertyName) {
        case "MaxPrice":
          return { rdoCommand: "RDOSetInputMaxPrice", params: {} };
        case "minK":
          return { rdoCommand: "RDOSetInputMinK", params: {} };
        case "PricePc":
          return { rdoCommand: "RDOSetOutputPrice", params: {} };
        case "Stopped":
          return { rdoCommand: "property", params: { propertyName: "Stopped" } };
        default:
          console.warn(`[BuildingDetails] Unknown property: ${propertyName}`);
          return { rdoCommand: propertyName, params: {} };
      }
    }
    /**
     * Get all 3 salary values for RDOSetSalaries command
     * When one salary is changed, we need to send all 3 values
     * Format: { salary0: '100', salary1: '100', salary2: '150' }
     */
    getSalaryParams(changedIndex, newValue) {
      const params = {};
      const workforceGroup = this.currentDetails?.groups["workforce"];
      if (workforceGroup) {
        for (let i = 0; i < 3; i++) {
          const propName = `Salaries${i}`;
          const prop = workforceGroup.find((p) => p.name === propName);
          const currentValue = prop ? parseInt(prop.value) : 100;
          params[`salary${i}`] = i === changedIndex ? newValue.toString() : currentValue.toString();
        }
      } else {
        for (let i = 0; i < 3; i++) {
          params[`salary${i}`] = i === changedIndex ? newValue.toString() : "100";
        }
      }
      return params;
    }
    /**
     * Wire up upgrade action button handlers
     * Interface: OK button, STOP button (when pending), Downgrade button
     */
    wireUpgradeActions() {
      if (!this.contentContainer || !this.currentDetails) return;
      const validateBtn = this.contentContainer.querySelector(".upgrade-validate-btn");
      const stopBtn = this.contentContainer.querySelector(".upgrade-stop-btn");
      const downgradeBtn = this.contentContainer.querySelector(".downgrade-btn");
      const qtyInput = this.contentContainer.querySelector(".upgrade-qty-input");
      if (validateBtn && qtyInput) {
        validateBtn.onclick = async () => {
          const count = parseInt(qtyInput.value) || 1;
          if (this.options.onUpgradeAction && count > 0) {
            await this.options.onUpgradeAction("START_UPGRADE", count);
            if (this.options.onRefresh) {
              setTimeout(async () => {
                if (this.options.onRefresh) {
                  await this.options.onRefresh();
                }
              }, 1e3);
            }
          }
        };
      }
      if (stopBtn) {
        stopBtn.onclick = async () => {
          if (this.options.onUpgradeAction) {
            await this.options.onUpgradeAction("STOP_UPGRADE");
            if (this.options.onRefresh) {
              setTimeout(async () => {
                if (this.options.onRefresh) {
                  await this.options.onRefresh();
                }
              }, 1e3);
            }
          }
        };
      }
      if (downgradeBtn) {
        downgradeBtn.onclick = async () => {
          if (this.options.onUpgradeAction) {
            await this.options.onUpgradeAction("DOWNGRADE");
            if (this.options.onRefresh) {
              setTimeout(async () => {
                if (this.options.onRefresh) {
                  await this.options.onRefresh();
                }
              }, 1e3);
            }
          }
        };
      }
    }
    /**
     * Start dragging
     */
    startDrag(e) {
      if (!this.modal) return;
      this.isDragging = true;
      this.dragOffsetX = e.clientX - this.posX;
      this.dragOffsetY = e.clientY - this.posY;
      document.onmousemove = (ev) => this.onDrag(ev);
      document.onmouseup = () => this.stopDrag();
      if (this.header) {
        this.header.style.cursor = "grabbing";
      }
    }
    /**
     * During drag
     */
    onDrag(e) {
      if (!this.isDragging) return;
      this.posX = e.clientX - this.dragOffsetX;
      this.posY = e.clientY - this.dragOffsetY;
      this.updatePosition();
    }
    /**
     * Stop dragging
     */
    stopDrag() {
      this.isDragging = false;
      document.onmousemove = null;
      document.onmouseup = null;
      if (this.header) {
        this.header.style.cursor = "move";
      }
    }
    /**
     * Update modal position
     */
    updatePosition() {
      if (!this.modal) return;
      this.modal.style.left = `${this.posX}px`;
      this.modal.style.top = `${this.posY}px`;
    }
  };

  // src/client/ui/building-details/connection-picker-dialog.ts
  var ROLE_PRODUCER = 1;
  var ROLE_DISTRIBUTER = 2;
  var ROLE_BUYER = 4;
  var ROLE_EXPORTER = 8;
  var ROLE_IMPORTER = 16;
  var ConnectionPickerDialog = class {
    constructor(container, options) {
      this.results = [];
      this.selectedIndices = /* @__PURE__ */ new Set();
      this.options = options;
      this.backdrop = document.createElement("div");
      this.backdrop.className = "connection-picker-backdrop";
      this.backdrop.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.5); z-index: 1100;
      display: flex; align-items: center; justify-content: center;
    `;
      this.backdrop.onclick = (e) => {
        if (e.target === this.backdrop) this.close();
      };
      this.dialog = document.createElement("div");
      this.dialog.className = "connection-picker-dialog";
      this.dialog.style.cssText = `
      width: 520px; max-height: 70vh;
      background: linear-gradient(135deg, rgba(20, 40, 50, 0.97), rgba(30, 50, 60, 0.97));
      border: 1px solid rgba(74, 122, 106, 0.4);
      border-radius: 8px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(10px);
      display: flex; flex-direction: column; overflow: hidden;
      font-family: Tahoma, Verdana, Arial, sans-serif;
    `;
      const dirLabel = options.direction === "input" ? "Find Suppliers" : "Find Clients";
      const header = document.createElement("div");
      header.style.cssText = `
      padding: 10px 16px; background: linear-gradient(135deg, #1a3a4f, #2d5b6a);
      border-bottom: 1px solid rgba(74, 122, 106, 0.4);
      display: flex; justify-content: space-between; align-items: center;
    `;
      header.innerHTML = `
      <span style="color: #ffffcc; font-weight: 600; font-size: 13px;">${dirLabel} for: ${this.escapeHtml(options.fluidName)}</span>
      <button class="cpd-close" style="background: rgba(255,255,255,0.1); border: none; color: #ffffcc; font-size: 16px; cursor: pointer; padding: 2px 6px; border-radius: 3px;">&times;</button>
    `;
      header.querySelector(".cpd-close").addEventListener("click", () => this.close());
      const filters = document.createElement("div");
      filters.style.cssText = "padding: 10px 16px; border-bottom: 1px solid rgba(74, 122, 106, 0.3);";
      filters.innerHTML = `
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <label style="color: #88aa99; font-size: 11px; flex: 1;">
          Company<br>
          <input type="text" class="cpd-company" style="width: 100%; padding: 4px; background: rgba(0,0,0,0.3); border: 1px solid rgba(74,122,106,0.3); color: #ddd; border-radius: 3px; font-size: 11px;">
        </label>
        <label style="color: #88aa99; font-size: 11px; flex: 1;">
          Town<br>
          <input type="text" class="cpd-town" style="width: 100%; padding: 4px; background: rgba(0,0,0,0.3); border: 1px solid rgba(74,122,106,0.3); color: #ddd; border-radius: 3px; font-size: 11px;">
        </label>
        <label style="color: #88aa99; font-size: 11px; width: 50px;">
          Max<br>
          <input type="number" class="cpd-max" value="20" min="1" max="100" style="width: 100%; padding: 4px; background: rgba(0,0,0,0.3); border: 1px solid rgba(74,122,106,0.3); color: #ddd; border-radius: 3px; font-size: 11px;">
        </label>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <label style="color: #88aa99; font-size: 11px; display: flex; align-items: center; gap: 3px;">
          <input type="checkbox" class="cpd-role" data-role="${ROLE_PRODUCER}" checked> Factories
        </label>
        <label style="color: #88aa99; font-size: 11px; display: flex; align-items: center; gap: 3px;">
          <input type="checkbox" class="cpd-role" data-role="${ROLE_DISTRIBUTER}" checked> Warehouses
        </label>
        <label style="color: #88aa99; font-size: 11px; display: flex; align-items: center; gap: 3px;">
          <input type="checkbox" class="cpd-role" data-role="${ROLE_IMPORTER}" checked> Trade Centers
        </label>
        ${options.direction === "output" ? `
        <label style="color: #88aa99; font-size: 11px; display: flex; align-items: center; gap: 3px;">
          <input type="checkbox" class="cpd-role" data-role="${ROLE_BUYER}" checked> Stores
        </label>` : `
        <label style="color: #88aa99; font-size: 11px; display: flex; align-items: center; gap: 3px;">
          <input type="checkbox" class="cpd-role" data-role="${ROLE_EXPORTER}" checked> Exporters
        </label>`}
        <button class="cpd-search" style="margin-left: auto; padding: 4px 16px; background: rgba(52, 89, 80, 0.8); color: #ffffcc; border: 1px solid #4a7a6a; border-radius: 3px; cursor: pointer; font-size: 11px;">Search</button>
      </div>
    `;
      filters.querySelector(".cpd-search").addEventListener("click", () => this.performSearch());
      this.resultsList = document.createElement("div");
      this.resultsList.style.cssText = "flex: 1; overflow-y: auto; padding: 8px 16px; min-height: 150px; max-height: 300px;";
      this.resultsList.innerHTML = '<div style="color: #88aa99; font-size: 12px; text-align: center; padding: 40px;">Click Search to find available connections</div>';
      const footer = document.createElement("div");
      footer.style.cssText = "padding: 8px 16px; border-top: 1px solid rgba(74, 122, 106, 0.3); display: flex; gap: 8px; justify-content: flex-end;";
      footer.innerHTML = `
      <button class="cpd-select-all" style="padding: 4px 12px; background: rgba(40, 60, 70, 0.8); color: #88aa99; border: 1px solid rgba(74,122,106,0.3); border-radius: 3px; cursor: pointer; font-size: 11px;">Select All</button>
      <button class="cpd-clear" style="padding: 4px 12px; background: rgba(40, 60, 70, 0.8); color: #88aa99; border: 1px solid rgba(74,122,106,0.3); border-radius: 3px; cursor: pointer; font-size: 11px;">Clear</button>
      <button class="cpd-connect" style="padding: 4px 16px; background: rgba(52, 89, 80, 0.8); color: #ffffcc; border: 1px solid #4a7a6a; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: 600;">Connect Selected</button>
    `;
      footer.querySelector(".cpd-select-all").addEventListener("click", () => this.selectAll());
      footer.querySelector(".cpd-clear").addEventListener("click", () => this.clearSelection());
      footer.querySelector(".cpd-connect").addEventListener("click", () => this.connectSelected());
      this.dialog.appendChild(header);
      this.dialog.appendChild(filters);
      this.dialog.appendChild(this.resultsList);
      this.dialog.appendChild(footer);
      this.backdrop.appendChild(this.dialog);
      container.appendChild(this.backdrop);
    }
    updateResults(results) {
      this.results = results;
      this.selectedIndices.clear();
      this.renderResults();
    }
    close() {
      this.backdrop.remove();
      this.options.onClose();
    }
    performSearch() {
      const companyInput = this.dialog.querySelector(".cpd-company");
      const townInput = this.dialog.querySelector(".cpd-town");
      const maxInput = this.dialog.querySelector(".cpd-max");
      const roleCheckboxes = this.dialog.querySelectorAll(".cpd-role");
      let rolesMask = 0;
      roleCheckboxes.forEach((cb) => {
        if (cb.checked) rolesMask |= parseInt(cb.dataset.role || "0");
      });
      this.resultsList.innerHTML = '<div style="color: #88aa99; font-size: 12px; text-align: center; padding: 40px;">Searching...</div>';
      this.options.onSearch(this.options.fluidId, this.options.direction, {
        company: companyInput.value || void 0,
        town: townInput.value || void 0,
        maxResults: parseInt(maxInput.value) || 20,
        roles: rolesMask || 255
      });
    }
    renderResults() {
      this.resultsList.innerHTML = "";
      if (this.results.length === 0) {
        this.resultsList.innerHTML = '<div style="color: #88aa99; font-size: 12px; text-align: center; padding: 40px;">No facilities found</div>';
        return;
      }
      for (let i = 0; i < this.results.length; i++) {
        const r = this.results[i];
        const row = document.createElement("div");
        row.style.cssText = `
        display: flex; align-items: center; gap: 8px; padding: 6px 4px;
        border-bottom: 1px solid rgba(74, 122, 106, 0.15); cursor: pointer;
      `;
        row.dataset.index = String(i);
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = this.selectedIndices.has(i);
        checkbox.onchange = () => {
          if (checkbox.checked) {
            this.selectedIndices.add(i);
          } else {
            this.selectedIndices.delete(i);
          }
        };
        const info = document.createElement("div");
        info.style.cssText = "flex: 1;";
        info.innerHTML = `
        <div style="color: #ddd; font-size: 12px;">${this.escapeHtml(r.facilityName)}</div>
        <div style="color: #88aa99; font-size: 10px;">${this.escapeHtml(r.companyName)}${r.price ? ` - $${r.price}` : ""}</div>
      `;
        row.appendChild(checkbox);
        row.appendChild(info);
        row.onclick = (e) => {
          if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.onchange?.(new Event("change"));
          }
        };
        this.resultsList.appendChild(row);
      }
    }
    selectAll() {
      for (let i = 0; i < this.results.length; i++) {
        this.selectedIndices.add(i);
      }
      this.renderResults();
    }
    clearSelection() {
      this.selectedIndices.clear();
      this.renderResults();
    }
    connectSelected() {
      const selected = Array.from(this.selectedIndices).map((i) => this.results[i]).filter(Boolean);
      if (selected.length === 0) return;
      const coords = selected.map((r) => ({ x: r.x, y: r.y }));
      this.options.onConnect(this.options.fluidId, this.options.direction, coords);
      this.close();
    }
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
  };

  // src/client/ui/search-menu/search-menu-panel.ts
  var SearchMenuPanel = class {
    constructor(sendMessage) {
      this.currentPage = "home";
      this.pageHistory = [];
      // Dragging state
      this.isDragging = false;
      this.dragOffsetX = 0;
      this.dragOffsetY = 0;
      this.sendMessage = sendMessage;
      this.panel = this.createPanel();
      this.titleElement = this.panel.querySelector(".search-menu-title");
      this.contentElement = this.panel.querySelector(".search-menu-content");
      this.backButton = this.panel.querySelector(".search-menu-back-btn");
      this.closeButton = this.panel.querySelector(".search-menu-close-btn");
      this.setupEventListeners();
    }
    createPanel() {
      const panel = document.createElement("div");
      panel.className = "search-menu-panel";
      panel.style.display = "none";
      panel.innerHTML = `
      <div class="search-menu-header">
        <button class="search-menu-back-btn" title="Back" style="display: none;">\u2190</button>
        <div class="search-menu-title">Search</div>
        <button class="search-menu-close-btn" title="Close">\u2715</button>
      </div>
      <div class="search-menu-content"></div>
    `;
      document.body.appendChild(panel);
      return panel;
    }
    setupEventListeners() {
      this.closeButton.addEventListener("click", () => this.close());
      this.backButton.addEventListener("click", () => this.goBack());
      const header = this.panel.querySelector(".search-menu-header");
      header.addEventListener("mousedown", (e) => this.onMouseDown(e));
      document.addEventListener("mousemove", (e) => this.onMouseMove(e));
      document.addEventListener("mouseup", () => this.onMouseUp());
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.panel.style.display !== "none") {
          this.close();
        }
      });
    }
    onMouseDown(e) {
      if (e.target.classList.contains("search-menu-close-btn") || e.target.classList.contains("search-menu-back-btn")) {
        return;
      }
      this.isDragging = true;
      const rect = this.panel.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;
    }
    onMouseMove(e) {
      if (!this.isDragging) return;
      const x = e.clientX - this.dragOffsetX;
      const y = e.clientY - this.dragOffsetY;
      this.panel.style.left = `${x}px`;
      this.panel.style.top = `${y}px`;
    }
    onMouseUp() {
      this.isDragging = false;
    }
    /**
     * Show the panel and load home page
     */
    show() {
      this.panel.style.display = "block";
      if (!this.panel.style.left) {
        const rect = this.panel.getBoundingClientRect();
        this.panel.style.left = `${(window.innerWidth - rect.width) / 2}px`;
        this.panel.style.top = `${(window.innerHeight - rect.height) / 2}px`;
      }
      this.loadHomePage();
    }
    /**
     * Close the panel
     */
    close() {
      this.panel.style.display = "none";
      this.pageHistory = [];
      this.currentPage = "home";
      this.updateBackButton();
    }
    /**
     * Go back to previous page
     */
    goBack() {
      if (this.pageHistory.length === 0) return;
      const previousPage = this.pageHistory.pop();
      this.currentPage = previousPage;
      this.updateBackButton();
      switch (previousPage) {
        case "home":
          this.loadHomePage();
          break;
        case "towns":
          this.loadTownsPage();
          break;
        case "people":
          this.loadPeoplePage();
          break;
        case "rankings":
          this.loadRankingsPage();
          break;
        case "banks":
          this.loadBanksPage();
          break;
      }
    }
    updateBackButton() {
      this.backButton.style.display = this.pageHistory.length > 0 ? "block" : "none";
    }
    navigateTo(page) {
      this.pageHistory.push(this.currentPage);
      this.currentPage = page;
      this.updateBackButton();
    }
    /**
     * Load home page with category grid
     */
    loadHomePage() {
      this.titleElement.textContent = "Search";
      this.contentElement.innerHTML = '<div class="loading">Loading...</div>';
      const request = {
        type: "REQ_SEARCH_MENU_HOME" /* REQ_SEARCH_MENU_HOME */
      };
      this.sendMessage(request);
    }
    /**
     * Render home page categories
     */
    renderHomePage(data) {
      const categories = data.categories;
      let html = '<div class="search-menu-grid">';
      categories.forEach((cat) => {
        const disabled = cat.enabled ? "" : "disabled";
        const icon = cat.iconUrl || "";
        html += `
        <div class="search-menu-category ${disabled}" data-id="${cat.id}">
          ${icon ? `<img src="${icon}" alt="${cat.label}" class="category-icon">` : ""}
          <div class="category-label">${cat.label}</div>
        </div>
      `;
      });
      html += "</div>";
      this.contentElement.innerHTML = html;
      this.contentElement.querySelectorAll(".search-menu-category:not(.disabled)").forEach((el) => {
        el.addEventListener("click", () => {
          const id = el.dataset.id;
          this.onCategoryClick(id);
        });
      });
    }
    onCategoryClick(categoryId) {
      switch (categoryId) {
        case "Towns":
          this.navigateTo("towns");
          this.loadTownsPage();
          break;
        case "RenderTycoon":
          this.navigateTo("profile");
          this.loadTycoonProfile("YOU");
          break;
        case "Tycoons":
          this.navigateTo("people");
          this.loadPeoplePage();
          break;
        case "Rankings":
          this.navigateTo("rankings");
          this.loadRankingsPage();
          break;
        case "Banks":
          this.navigateTo("banks");
          this.loadBanksPage();
          break;
        default:
          console.warn("[SearchMenuPanel] Unknown category:", categoryId);
      }
    }
    /**
     * Load towns list page
     */
    loadTownsPage() {
      this.titleElement.textContent = "Towns";
      this.contentElement.innerHTML = '<div class="loading">Loading...</div>';
      const request = {
        type: "REQ_SEARCH_MENU_TOWNS" /* REQ_SEARCH_MENU_TOWNS */
      };
      this.sendMessage(request);
    }
    /**
     * Render towns list
     */
    renderTownsPage(data) {
      const towns = data.towns;
      let html = '<div class="search-menu-list">';
      towns.forEach((town) => {
        html += `
        <div class="town-item">
          <img src="${town.iconUrl}" alt="${town.name}" class="town-icon">
          <div class="town-info">
            <div class="town-name">${town.name}</div>
            <div class="town-stats">
              <div>Mayor: ${town.mayor || '<span style="color: red">none</span>'}</div>
              <div>${town.population.toLocaleString()} inhabitants (${town.unemploymentPercent}% UE)</div>
              <div>QoL: ${town.qualityOfLife}%</div>
              <div><a href="#" class="show-in-map" data-x="${town.x}" data-y="${town.y}">Show in map</a></div>
            </div>
          </div>
        </div>
      `;
      });
      html += "</div>";
      this.contentElement.innerHTML = html;
      this.contentElement.querySelectorAll(".show-in-map").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          const x = parseInt(el.dataset.x);
          const y = parseInt(el.dataset.y);
          this.onShowInMap(x, y);
        });
      });
    }
    /**
     * Load tycoon profile page
     */
    loadTycoonProfile(tycoonName) {
      this.titleElement.textContent = "Profile";
      this.contentElement.innerHTML = '<div class="loading">Loading...</div>';
      const request = {
        type: "REQ_SEARCH_MENU_TYCOON_PROFILE" /* REQ_SEARCH_MENU_TYCOON_PROFILE */,
        tycoonName
      };
      this.sendMessage(request);
    }
    /**
     * Render tycoon profile
     */
    renderTycoonProfile(data) {
      const profile = data.profile;
      const html = `
      <div class="tycoon-profile">
        <h2>${profile.name}</h2>
        <img src="${profile.photoUrl}" alt="${profile.name}" class="tycoon-photo">
        <div class="tycoon-stats">
          <div><strong>Fortune:</strong> $${profile.fortune.toLocaleString()}</div>
          <div><strong>This year:</strong> $${profile.thisYearProfit.toLocaleString()}</div>
          <div><strong>NTA Ranking:</strong> ${profile.ntaRanking}</div>
          <div><strong>Level:</strong> ${profile.level}</div>
          <div><strong>Prestige:</strong> ${profile.prestige} points</div>
        </div>
      </div>
    `;
      this.contentElement.innerHTML = html;
    }
    /**
     * Load people search page
     */
    loadPeoplePage() {
      this.titleElement.textContent = "People";
      const html = `
      <div class="people-search">
        <h3>Search</h3>
        <div class="search-form">
          <input type="text" class="search-input" placeholder="Enter name...">
          <button class="search-btn">Search</button>
        </div>
        <h3>Index</h3>
        <div class="alphabet-index">
          ${Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ").map(
        (letter) => `<a href="#" class="letter-link" data-letter="${letter}">${letter}</a>`
      ).join(" ")}
        </div>
        <div class="search-results"></div>
      </div>
    `;
      this.contentElement.innerHTML = html;
      const searchInput = this.contentElement.querySelector(".search-input");
      const searchBtn = this.contentElement.querySelector(".search-btn");
      const resultsContainer = this.contentElement.querySelector(".search-results");
      const performSearch = () => {
        const query = searchInput.value.trim();
        if (!query) return;
        resultsContainer.innerHTML = '<div class="loading">Searching...</div>';
        const request = {
          type: "REQ_SEARCH_MENU_PEOPLE_SEARCH" /* REQ_SEARCH_MENU_PEOPLE_SEARCH */,
          searchStr: query
        };
        this.sendMessage(request);
      };
      searchBtn.addEventListener("click", performSearch);
      searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") performSearch();
      });
      this.contentElement.querySelectorAll(".letter-link").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          const letter = el.dataset.letter;
          searchInput.value = letter;
          performSearch();
        });
      });
    }
    /**
     * Render people search results
     */
    renderPeopleSearchResults(data) {
      const results = data.results;
      const resultsContainer = this.contentElement.querySelector(".search-results");
      if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results">No results found</div>';
        return;
      }
      let html = '<div class="search-menu-list">';
      results.forEach((name) => {
        html += `
        <div class="person-item">
          <a href="#" class="person-name" data-name="${name}">${name}</a>
        </div>
      `;
      });
      html += "</div>";
      resultsContainer.innerHTML = html;
      resultsContainer.querySelectorAll(".person-name").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          const name = el.dataset.name;
          this.navigateTo("profile");
          this.loadTycoonProfile(name);
        });
      });
    }
    /**
     * Load rankings page
     */
    loadRankingsPage() {
      this.titleElement.textContent = "Rankings";
      this.contentElement.innerHTML = '<div class="loading">Loading...</div>';
      const request = {
        type: "REQ_SEARCH_MENU_RANKINGS" /* REQ_SEARCH_MENU_RANKINGS */
      };
      this.sendMessage(request);
    }
    /**
     * Render rankings tree
     */
    renderRankingsPage(data) {
      const categories = data.categories;
      const renderCategory = (cat, level = 0) => {
        const hasChildren = cat.children && cat.children.length > 0;
        const leafClass = hasChildren ? "" : "leaf";
        const expandedClass = level === 0 ? "expanded" : "";
        let html2 = `
        <div class="ranking-category level-${level} ${leafClass} ${expandedClass}" data-url="${cat.url}">
          <div class="ranking-category-header">
            <span class="ranking-expand-icon">\u25B6</span>
            <a href="#" class="ranking-link" data-url="${cat.url}">${cat.label}</a>
          </div>
      `;
        if (hasChildren) {
          html2 += '<div class="ranking-children">';
          cat.children.forEach((child) => {
            html2 += renderCategory(child, level + 1);
          });
          html2 += "</div>";
        }
        html2 += "</div>";
        return html2;
      };
      let html = '<div class="rankings-tree">';
      categories.forEach((cat) => {
        html += renderCategory(cat);
      });
      html += "</div>";
      this.contentElement.innerHTML = html;
      this.contentElement.querySelectorAll(".ranking-category-header").forEach((header) => {
        header.addEventListener("click", (e) => {
          const target = e.target;
          if (target.classList.contains("ranking-link")) {
            e.preventDefault();
            const url = target.dataset.url;
            this.loadRankingDetail(url);
            return;
          }
          const categoryDiv = header.parentElement;
          if (!categoryDiv.classList.contains("leaf")) {
            e.preventDefault();
            categoryDiv.classList.toggle("expanded");
          }
        });
      });
    }
    /**
     * Load ranking detail page
     */
    loadRankingDetail(rankingPath) {
      this.navigateTo("ranking-detail");
      this.titleElement.textContent = "Ranking";
      this.contentElement.innerHTML = '<div class="loading">Loading...</div>';
      const request = {
        type: "REQ_SEARCH_MENU_RANKING_DETAIL" /* REQ_SEARCH_MENU_RANKING_DETAIL */,
        rankingPath
      };
      this.sendMessage(request);
    }
    /**
     * Render ranking detail
     */
    renderRankingDetail(data) {
      this.titleElement.textContent = data.title;
      const entries = data.entries;
      let html = '<div class="ranking-detail">';
      const top3 = entries.filter((e) => e.photoUrl).slice(0, 3);
      if (top3.length > 0) {
        html += '<div class="top-three">';
        top3.forEach((entry) => {
          html += `
          <div class="top-entry">
            <img src="${entry.photoUrl}" alt="${entry.name}" class="top-photo">
            <div class="top-rank">${entry.rank}. ${entry.name}</div>
            <div class="top-value">${entry.value.toLocaleString()}</div>
          </div>
        `;
        });
        html += "</div>";
      }
      const remaining = entries.filter((e) => !e.photoUrl || entries.indexOf(e) >= 3);
      if (remaining.length > 0) {
        html += '<div class="ranking-list">';
        remaining.forEach((entry) => {
          html += `
          <div class="ranking-entry">
            <span class="rank">${entry.rank}</span>
            <span class="name">${entry.name}</span>
            <span class="value">${entry.value.toLocaleString()}</span>
          </div>
        `;
        });
        html += "</div>";
      }
      html += "</div>";
      this.contentElement.innerHTML = html;
    }
    /**
     * Load banks page
     */
    loadBanksPage() {
      this.titleElement.textContent = "Banks";
      this.contentElement.innerHTML = '<div class="loading">Loading...</div>';
      const request = {
        type: "REQ_SEARCH_MENU_BANKS" /* REQ_SEARCH_MENU_BANKS */
      };
      this.sendMessage(request);
    }
    /**
     * Render banks page
     */
    renderBanksPage(data) {
      if (data.banks.length === 0) {
        this.contentElement.innerHTML = '<div class="no-results">No banks available</div>';
      } else {
        this.contentElement.innerHTML = '<div class="no-results">Banks feature coming soon</div>';
      }
    }
    /**
     * Show an error message in the content area
     */
    showError(message) {
      if (this.panel.style.display === "none") return;
      this.contentElement.innerHTML = `<div class="no-results" style="color: #ff6b6b;">${message}</div>`;
    }
    /**
     * Handle "Show in map" clicks
     */
    onShowInMap(x, y) {
      this.close();
      window.dispatchEvent(new CustomEvent("navigate-to-map", {
        detail: { x, y }
      }));
    }
  };

  // src/client/ui/mail-panel.ts
  var MailPanel = class {
    constructor(callbacks) {
      this.state = "folder-list";
      this.currentFolder = "Inbox";
      this.currentMessages = [];
      this.currentMessage = null;
      this.unreadCount = 0;
      this.composeMode = "new";
      this.composeOriginalMessage = null;
      // Drag state
      this.isDragging = false;
      this.dragOffsetX = 0;
      this.dragOffsetY = 0;
      this.callbacks = callbacks;
      this.panel = this.createPanel();
      this.headerTitle = this.panel.querySelector(".mail-title");
      this.contentElement = this.panel.querySelector(".mail-content");
      document.body.appendChild(this.panel);
    }
    createPanel() {
      const panel = document.createElement("div");
      panel.className = "mail-panel";
      panel.style.cssText = `
      position: fixed;
      width: 550px;
      max-height: 80vh;
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(51, 65, 85, 0.95));
      border: 1px solid var(--glass-border, rgba(148, 163, 184, 0.2));
      backdrop-filter: blur(20px);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
      panel.innerHTML = `
      <div class="mail-header" style="
        padding: 12px 16px;
        background: linear-gradient(135deg, #1e3a5f, #2563eb);
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="mail-back-btn" style="
            display: none;
            background: rgba(255,255,255,0.1);
            border: none;
            color: white;
            font-size: 16px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
          ">&larr;</button>
          <span class="mail-title" style="color: white; font-weight: 600; font-size: 14px;">Mail - Inbox</span>
        </div>
        <button class="mail-close-btn" style="
          background: rgba(255,255,255,0.1);
          border: none;
          color: white;
          font-size: 16px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
        ">&times;</button>
      </div>
      <div class="mail-tabs" style="
        display: flex;
        gap: 0;
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        background: rgba(15, 23, 42, 0.5);
      "></div>
      <div class="mail-content" style="
        flex: 1;
        overflow-y: auto;
        max-height: calc(80vh - 120px);
        color: #e2e8f0;
        font-size: 13px;
      "></div>
    `;
      const header = panel.querySelector(".mail-header");
      header.addEventListener("mousedown", (e) => {
        const target = e.target;
        if (!target.closest("button")) {
          this.startDrag(e);
        }
      });
      const closeBtn = panel.querySelector(".mail-close-btn");
      closeBtn.addEventListener("click", () => this.hide());
      const backBtn = panel.querySelector(".mail-back-btn");
      backBtn.addEventListener("click", () => this.goBack());
      this.renderTabs(panel.querySelector(".mail-tabs"));
      return panel;
    }
    renderTabs(container) {
      const folders = ["Inbox", "Sent", "Draft"];
      container.innerHTML = "";
      for (const folder of folders) {
        const tab = document.createElement("button");
        const isActive = folder === this.currentFolder;
        const badge = folder === "Inbox" && this.unreadCount > 0 ? ` <span style="
            background: #ef4444;
            color: white;
            font-size: 10px;
            padding: 1px 5px;
            border-radius: 8px;
            margin-left: 4px;
          ">${this.unreadCount}</span>` : "";
        tab.innerHTML = `${folder}${badge}`;
        tab.style.cssText = `
        flex: 1;
        padding: 10px 16px;
        background: ${isActive ? "rgba(37, 99, 235, 0.3)" : "transparent"};
        border: none;
        border-bottom: 2px solid ${isActive ? "#3b82f6" : "transparent"};
        color: ${isActive ? "#93c5fd" : "#94a3b8"};
        font-size: 13px;
        font-weight: ${isActive ? "600" : "400"};
        cursor: pointer;
        transition: all 0.15s;
      `;
        tab.addEventListener("mouseenter", () => {
          if (!isActive) tab.style.background = "rgba(37, 99, 235, 0.15)";
        });
        tab.addEventListener("mouseleave", () => {
          if (!isActive) tab.style.background = "transparent";
        });
        tab.addEventListener("click", () => {
          this.currentFolder = folder;
          this.state = "folder-list";
          this.renderTabs(this.panel.querySelector(".mail-tabs"));
          this.updateTitle();
          this.updateBackButton();
          this.callbacks.getMailFolder(folder);
          this.renderLoading();
        });
        container.appendChild(tab);
      }
      const composeBtn = document.createElement("button");
      composeBtn.textContent = "+ New";
      composeBtn.style.cssText = `
      padding: 10px 16px;
      background: transparent;
      border: none;
      color: #3b82f6;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    `;
      composeBtn.addEventListener("mouseenter", () => {
        composeBtn.style.background = "rgba(37, 99, 235, 0.15)";
      });
      composeBtn.addEventListener("mouseleave", () => {
        composeBtn.style.background = "transparent";
      });
      composeBtn.addEventListener("click", () => {
        this.showCompose();
      });
      container.appendChild(composeBtn);
    }
    // ==========================================================================
    // PUBLIC API
    // ==========================================================================
    show() {
      this.panel.style.display = "flex";
      if (!this.panel.dataset.positioned) {
        const rect = this.panel.getBoundingClientRect();
        this.panel.style.left = `${(window.innerWidth - rect.width) / 2}px`;
        this.panel.style.top = `${(window.innerHeight - rect.height) / 2}px`;
        this.panel.dataset.positioned = "1";
      }
      this.state = "folder-list";
      this.updateTitle();
      this.updateBackButton();
      this.callbacks.getMailFolder(this.currentFolder);
      this.renderLoading();
    }
    hide() {
      this.panel.style.display = "none";
    }
    isVisible() {
      return this.panel.style.display !== "none";
    }
    setUnreadCount(count) {
      this.unreadCount = count;
      this.renderTabs(this.panel.querySelector(".mail-tabs"));
    }
    handleResponse(msg) {
      switch (msg.type) {
        case "RESP_MAIL_FOLDER" /* RESP_MAIL_FOLDER */: {
          const resp = msg;
          this.currentMessages = resp.messages;
          this.renderFolderList();
          break;
        }
        case "RESP_MAIL_MESSAGE" /* RESP_MAIL_MESSAGE */: {
          const resp = msg;
          this.currentMessage = resp.message;
          this.state = "message-view";
          this.updateTitle();
          this.updateBackButton();
          this.renderMessageView();
          break;
        }
        case "RESP_MAIL_SENT" /* RESP_MAIL_SENT */: {
          const resp = msg;
          if (resp.success) {
            this.state = "folder-list";
            this.updateTitle();
            this.updateBackButton();
            this.callbacks.getMailFolder(this.currentFolder);
            this.renderLoading();
          } else {
            this.renderError(resp.message || "Failed to send message");
          }
          break;
        }
        case "RESP_MAIL_DELETED" /* RESP_MAIL_DELETED */: {
          this.callbacks.getMailFolder(this.currentFolder);
          this.state = "folder-list";
          this.updateTitle();
          this.updateBackButton();
          this.renderLoading();
          break;
        }
        case "RESP_MAIL_DRAFT_SAVED" /* RESP_MAIL_DRAFT_SAVED */: {
          const resp = msg;
          if (resp.success) {
            this.currentFolder = "Draft";
            this.state = "folder-list";
            this.updateTitle();
            this.updateBackButton();
            this.renderTabs(this.panel.querySelector(".mail-tabs"));
            this.callbacks.getMailFolder("Draft");
            this.renderLoading();
          } else {
            this.renderError(resp.message || "Failed to save draft");
          }
          break;
        }
        case "RESP_MAIL_UNREAD_COUNT" /* RESP_MAIL_UNREAD_COUNT */: {
          const resp = msg;
          this.setUnreadCount(resp.count);
          break;
        }
      }
    }
    // ==========================================================================
    // RENDERING
    // ==========================================================================
    renderLoading() {
      this.contentElement.innerHTML = `
      <div style="padding: 32px; text-align: center; color: #94a3b8;">
        Loading...
      </div>
    `;
    }
    renderError(message) {
      this.contentElement.innerHTML = `
      <div style="padding: 24px; text-align: center; color: #f87171;">
        ${this.escapeHtml(message)}
      </div>
    `;
    }
    renderFolderList() {
      if (this.currentMessages.length === 0) {
        this.contentElement.innerHTML = `
        <div style="padding: 32px; text-align: center; color: #64748b;">
          No messages in ${this.currentFolder}
        </div>
      `;
        return;
      }
      let html = "";
      for (const msg of this.currentMessages) {
        const unreadDot = !msg.read ? '<span style="width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; flex-shrink: 0;"></span>' : '<span style="width: 8px; flex-shrink: 0;"></span>';
        const fontWeight = msg.read ? "400" : "600";
        const textColor = msg.read ? "#94a3b8" : "#e2e8f0";
        html += `
        <div class="mail-row" data-msg-id="${this.escapeHtml(msg.messageId)}" style="
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          cursor: pointer;
          transition: background 0.15s;
        "
        onmouseenter="this.style.background='rgba(37, 99, 235, 0.1)'"
        onmouseleave="this.style.background='transparent'"
        >
          ${unreadDot}
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; gap: 8px;">
              <span style="font-weight: ${fontWeight}; color: ${textColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${this.escapeHtml(this.currentFolder === "Sent" ? msg.to : msg.from)}
              </span>
              <span style="color: #64748b; font-size: 11px; flex-shrink: 0;">
                ${this.escapeHtml(msg.dateFmt)}
              </span>
            </div>
            <div style="color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;">
              ${this.escapeHtml(msg.subject)}
            </div>
          </div>
        </div>
      `;
      }
      this.contentElement.innerHTML = html;
      this.contentElement.querySelectorAll(".mail-row").forEach((row) => {
        row.addEventListener("click", () => {
          const msgId = row.dataset.msgId;
          this.callbacks.readMailMessage(this.currentFolder, msgId);
          this.renderLoading();
        });
      });
    }
    renderMessageView() {
      if (!this.currentMessage) return;
      const msg = this.currentMessage;
      const isNoReply = msg.noReply;
      const attachHtml = msg.attachments.length > 0 ? `<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(148, 163, 184, 0.2);">
           <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px;">Attachments (${msg.attachments.length})</div>
           ${msg.attachments.map((a) => `
             <div style="background: rgba(15, 23, 42, 0.5); padding: 8px 12px; border-radius: 6px; margin-bottom: 4px; font-size: 12px;">
               <span style="color: #93c5fd;">${this.escapeHtml(a.class)}</span>
               ${Object.entries(a.properties).map(([k, v]) => `<span style="color: #64748b; margin-left: 8px;">${this.escapeHtml(k)}: ${this.escapeHtml(v)}</span>`).join("")}
             </div>
           `).join("")}
         </div>` : "";
      this.contentElement.innerHTML = `
      <div style="padding: 16px;">
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-weight: 600; color: #e2e8f0;">${this.escapeHtml(msg.from)}</span>
            <span style="color: #64748b; font-size: 12px;">${this.escapeHtml(msg.dateFmt)}</span>
          </div>
          <div style="color: #94a3b8; font-size: 12px;">To: ${this.escapeHtml(msg.to)}</div>
          <div style="color: #e2e8f0; font-size: 15px; font-weight: 600; margin-top: 8px;">
            ${this.escapeHtml(msg.subject)}
          </div>
        </div>
        <div style="
          background: rgba(15, 23, 42, 0.4);
          padding: 12px 16px;
          border-radius: 8px;
          line-height: 1.6;
          white-space: pre-wrap;
          min-height: 100px;
        ">${this.escapeHtml(msg.body.join("\n"))}</div>
        ${attachHtml}
        <div style="display: flex; gap: 8px; margin-top: 16px;">
          ${!isNoReply ? `<button class="mail-reply-btn" style="
            padding: 8px 16px;
            background: #2563eb;
            border: none;
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">Reply</button>` : ""}
          <button class="mail-forward-btn" style="
            padding: 8px 16px;
            background: rgba(37, 99, 235, 0.2);
            border: 1px solid rgba(37, 99, 235, 0.4);
            color: #93c5fd;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">Forward</button>
          <button class="mail-delete-btn" style="
            padding: 8px 16px;
            background: rgba(239, 68, 68, 0.2);
            border: 1px solid rgba(239, 68, 68, 0.4);
            color: #f87171;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">Delete</button>
        </div>
      </div>
    `;
      const replyBtn = this.contentElement.querySelector(".mail-reply-btn");
      if (replyBtn) {
        replyBtn.addEventListener("click", () => {
          this.showCompose("reply", msg);
        });
      }
      const forwardBtn = this.contentElement.querySelector(".mail-forward-btn");
      if (forwardBtn) {
        forwardBtn.addEventListener("click", () => {
          this.showCompose("forward", msg);
        });
      }
      const deleteBtn = this.contentElement.querySelector(".mail-delete-btn");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", () => {
          if (confirm("Delete this message?")) {
            this.callbacks.deleteMailMessage(this.currentFolder, msg.messageId);
          }
        });
      }
    }
    showCompose(mode = "new", originalMessage) {
      this.state = "compose";
      this.composeMode = mode;
      this.composeOriginalMessage = originalMessage || null;
      this.updateTitle();
      this.updateBackButton();
      let toValue = "";
      let subjectValue = "";
      let bodyValue = "";
      if (originalMessage) {
        if (mode === "reply") {
          toValue = originalMessage.fromAddr;
          subjectValue = originalMessage.subject.startsWith("RE: ") ? originalMessage.subject : `RE: ${originalMessage.subject}`;
          const quotedLines = originalMessage.body.map((line) => `> ${line}`);
          bodyValue = `

--- Original Message ---
${quotedLines.join("\n")}`;
        } else if (mode === "forward") {
          toValue = "";
          subjectValue = originalMessage.subject.startsWith("FW: ") ? originalMessage.subject : `FW: ${originalMessage.subject}`;
          const quotedLines = originalMessage.body.map((line) => `> ${line}`);
          bodyValue = `

--- Forwarded Message ---
From: ${originalMessage.from}
Subject: ${originalMessage.subject}

${quotedLines.join("\n")}`;
        }
      }
      this.contentElement.innerHTML = `
      <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
        <div>
          <label style="display: block; color: #94a3b8; font-size: 11px; margin-bottom: 4px;">To</label>
          <input class="mail-compose-to" type="text" value="${this.escapeHtml(toValue)}" style="
            width: 100%;
            padding: 8px 12px;
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 6px;
            color: #e2e8f0;
            font-size: 13px;
            outline: none;
            box-sizing: border-box;
          " placeholder="recipient@world.net">
        </div>
        <div>
          <label style="display: block; color: #94a3b8; font-size: 11px; margin-bottom: 4px;">Subject</label>
          <input class="mail-compose-subject" type="text" value="${this.escapeHtml(subjectValue)}" style="
            width: 100%;
            padding: 8px 12px;
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 6px;
            color: #e2e8f0;
            font-size: 13px;
            outline: none;
            box-sizing: border-box;
          " placeholder="Subject">
        </div>
        <div>
          <label style="display: block; color: #94a3b8; font-size: 11px; margin-bottom: 4px;">Message</label>
          <textarea class="mail-compose-body" rows="8" style="
            width: 100%;
            padding: 8px 12px;
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 6px;
            color: #e2e8f0;
            font-size: 13px;
            outline: none;
            resize: vertical;
            font-family: inherit;
            box-sizing: border-box;
          " placeholder="Write your message...">${this.escapeHtml(bodyValue)}</textarea>
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button class="mail-compose-cancel" style="
            padding: 8px 16px;
            background: rgba(148, 163, 184, 0.2);
            border: none;
            color: #94a3b8;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">Cancel</button>
          <button class="mail-compose-save-draft" style="
            padding: 8px 16px;
            background: rgba(148, 163, 184, 0.2);
            border: 1px solid rgba(148, 163, 184, 0.3);
            color: #e2e8f0;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
          ">Save Draft</button>
          <button class="mail-compose-send" style="
            padding: 8px 24px;
            background: #2563eb;
            border: none;
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
          ">Send</button>
        </div>
      </div>
    `;
      this.contentElement.querySelector(".mail-compose-cancel").addEventListener("click", () => {
        this.goBack();
      });
      this.contentElement.querySelector(".mail-compose-save-draft").addEventListener("click", () => {
        const to = this.contentElement.querySelector(".mail-compose-to").value.trim();
        const subject = this.contentElement.querySelector(".mail-compose-subject").value.trim();
        const body = this.contentElement.querySelector(".mail-compose-body").value;
        const bodyLines = body.split("\n");
        this.callbacks.saveDraft(to, subject, bodyLines);
        this.renderLoading();
      });
      this.contentElement.querySelector(".mail-compose-send").addEventListener("click", () => {
        const to = this.contentElement.querySelector(".mail-compose-to").value.trim();
        const subject = this.contentElement.querySelector(".mail-compose-subject").value.trim();
        const body = this.contentElement.querySelector(".mail-compose-body").value;
        if (!to) {
          alert("Please enter a recipient address.");
          return;
        }
        if (!subject) {
          alert("Please enter a subject.");
          return;
        }
        const bodyLines = body.split("\n");
        this.callbacks.composeMail(to, subject, bodyLines);
        this.renderLoading();
      });
      const toInput = this.contentElement.querySelector(".mail-compose-to");
      if (mode === "reply") {
        this.contentElement.querySelector(".mail-compose-body").focus();
      } else if (mode === "forward") {
        toInput.focus();
      } else if (toInput.value) {
        this.contentElement.querySelector(".mail-compose-body").focus();
      } else {
        toInput.focus();
      }
    }
    // ==========================================================================
    // NAVIGATION
    // ==========================================================================
    goBack() {
      this.state = "folder-list";
      this.currentMessage = null;
      this.updateTitle();
      this.updateBackButton();
      this.renderFolderList();
    }
    updateTitle() {
      switch (this.state) {
        case "folder-list":
          this.headerTitle.textContent = `Mail - ${this.currentFolder}`;
          break;
        case "message-view":
          this.headerTitle.textContent = this.currentMessage?.subject || "Message";
          break;
        case "compose":
          if (this.composeMode === "reply") {
            this.headerTitle.textContent = "Reply";
          } else if (this.composeMode === "forward") {
            this.headerTitle.textContent = "Forward";
          } else {
            this.headerTitle.textContent = "New Message";
          }
          break;
      }
    }
    updateBackButton() {
      const btn = this.panel.querySelector(".mail-back-btn");
      btn.style.display = this.state !== "folder-list" ? "block" : "none";
    }
    // ==========================================================================
    // DRAG
    // ==========================================================================
    startDrag(e) {
      this.isDragging = true;
      const rect = this.panel.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;
      const onMouseMove = (ev) => {
        if (!this.isDragging) return;
        this.panel.style.left = `${ev.clientX - this.dragOffsetX}px`;
        this.panel.style.top = `${ev.clientY - this.dragOffsetY}px`;
      };
      const onMouseUp = () => {
        this.isDragging = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }
    // ==========================================================================
    // UTILITIES
    // ==========================================================================
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
  };

  // src/client/ui/profile-panel.ts
  var TYCOON_LEVELS = [
    { name: "Apprentice", facLimit: 50 },
    { name: "Entrepreneur", facLimit: 150, fee: 1e8, profitPerHour: 1e3 },
    { name: "Tycoon", facLimit: 400, fee: 5e8, profitPerHour: 5e3 },
    { name: "Master", facLimit: 800, fee: 2e9, profitPerHour: 5e4, prestige: 2500 },
    { name: "Paradigm", facLimit: 1e3, fee: 2e10, profitPerHour: 1e5, prestige: 5e3 },
    { name: "Legend", facLimit: 1e4, fee: 4e10, profitPerHour: 5e5, prestige: 15e3 }
  ];
  var POLICY_LABELS = ["Ally", "Neutral", "Enemy"];
  var POLICY_COLORS = ["#ADFF2F", "#BDB76B", "#FF0000"];
  var ProfilePanel = class {
    constructor(callbacks) {
      this.currentTab = "curriculum";
      this.tycoonName = "";
      this.ranking = 0;
      this.worldName = "";
      // Cached tab data
      this.curriculumData = null;
      this.bankData = null;
      this.profitLossData = null;
      this.companiesData = null;
      this.autoConnectionsData = null;
      this.policyData = null;
      // Drag state
      this.isDragging = false;
      this.dragOffsetX = 0;
      this.dragOffsetY = 0;
      this.callbacks = callbacks;
      this.panel = this.createPanel();
      this.sidebarContent = this.panel.querySelector(".profile-sidebar-content");
      this.contentArea = this.panel.querySelector(".profile-content");
      document.body.appendChild(this.panel);
    }
    // ===========================================================================
    // PANEL CREATION
    // ===========================================================================
    createPanel() {
      const panel = document.createElement("div");
      panel.className = "profile-panel";
      panel.style.cssText = `
      position: fixed;
      width: 820px;
      max-height: 85vh;
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(51, 65, 85, 0.95));
      border: 1px solid rgba(148, 163, 184, 0.2);
      backdrop-filter: blur(20px);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
      panel.innerHTML = `
      <div class="profile-header" style="
        padding: 12px 16px;
        background: linear-gradient(135deg, #1e3a5f, #2563eb);
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
      ">
        <span class="profile-title" style="color: white; font-weight: 600; font-size: 14px;">Tycoon Profile</span>
        <button class="profile-close-btn" style="
          background: rgba(255,255,255,0.1);
          border: none;
          color: white;
          font-size: 16px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
        ">&times;</button>
      </div>
      <div class="profile-body" style="
        display: flex;
        flex: 1;
        overflow: hidden;
        max-height: calc(85vh - 48px);
      ">
        <div class="profile-sidebar" style="
          width: 180px;
          min-width: 180px;
          border-right: 1px solid rgba(148, 163, 184, 0.2);
          overflow-y: auto;
          background: rgba(15, 23, 42, 0.3);
        ">
          <div class="profile-sidebar-content" style="padding: 12px;"></div>
        </div>
        <div class="profile-content" style="
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          color: #e2e8f0;
          font-size: 13px;
        "></div>
      </div>
    `;
      const header = panel.querySelector(".profile-header");
      header.addEventListener("mousedown", (e) => {
        const target = e.target;
        if (!target.closest("button")) this.startDrag(e);
      });
      panel.querySelector(".profile-close-btn").addEventListener("click", () => this.hide());
      return panel;
    }
    buildSidebar() {
      const c = this.sidebarContent;
      c.innerHTML = "";
      const infoDiv = document.createElement("div");
      infoDiv.style.cssText = "text-align: center; margin-bottom: 16px;";
      infoDiv.innerHTML = `
      <div style="
        width: 100px; height: 130px;
        background: rgba(20, 57, 48, 0.6);
        border: 2px solid rgba(52, 89, 80, 0.8);
        border-radius: 8px;
        margin: 0 auto 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #64748b;
        font-size: 11px;
      ">No Photo</div>
      <div style="color: white; font-weight: 700; font-size: 15px;">${this.escapeHtml(this.tycoonName)}</div>
      <div style="color: #94a3b8; font-size: 11px; margin-top: 2px;">
        ${this.ranking > 0 ? `#${this.ranking} in the NTA ranking.` : ""}
      </div>
    `;
      c.appendChild(infoDiv);
      const tabs = [
        { id: "curriculum", label: "Curriculum" },
        { id: "bank", label: "Bank Account" },
        { id: "profitloss", label: "Profit & Loss" },
        { id: "suppliers", label: "Initial Suppliers" },
        { id: "companies", label: "Companies" },
        { id: "strategy", label: "Strategy" }
      ];
      for (const tab of tabs) {
        const btn = document.createElement("button");
        const isActive = tab.id === this.currentTab;
        btn.textContent = tab.label;
        btn.style.cssText = `
        display: block;
        width: 100%;
        padding: 8px 12px;
        margin-bottom: 2px;
        background: ${isActive ? "rgba(37, 99, 235, 0.3)" : "transparent"};
        border: none;
        border-left: 3px solid ${isActive ? "#3b82f6" : "transparent"};
        color: ${isActive ? "#93c5fd" : "#94a3b8"};
        font-size: 12px;
        font-weight: ${isActive ? "600" : "400"};
        text-align: left;
        cursor: pointer;
        transition: all 0.15s;
        border-radius: 0 4px 4px 0;
      `;
        btn.addEventListener("mouseenter", () => {
          if (tab.id !== this.currentTab) btn.style.background = "rgba(37, 99, 235, 0.15)";
        });
        btn.addEventListener("mouseleave", () => {
          if (tab.id !== this.currentTab) btn.style.background = "transparent";
        });
        btn.addEventListener("click", () => this.switchTab(tab.id));
        c.appendChild(btn);
      }
    }
    // ===========================================================================
    // PUBLIC API
    // ===========================================================================
    show(tab) {
      this.panel.style.display = "flex";
      if (!this.panel.dataset.positioned) {
        const rect = this.panel.getBoundingClientRect();
        this.panel.style.left = `${(window.innerWidth - rect.width) / 2}px`;
        this.panel.style.top = `${(window.innerHeight - rect.height) / 2}px`;
        this.panel.dataset.positioned = "1";
      }
      this.buildSidebar();
      if (tab) this.currentTab = tab;
      this.switchTab(this.currentTab);
    }
    hide() {
      this.panel.style.display = "none";
    }
    isVisible() {
      return this.panel.style.display !== "none";
    }
    setTycoonInfo(name, ranking, worldName) {
      this.tycoonName = name;
      this.ranking = ranking;
      this.worldName = worldName;
    }
    setOnSwitchCompany(callback) {
      this.callbacks.onSwitchCompany = callback;
    }
    handleResponse(msg) {
      switch (msg.type) {
        case "RESP_PROFILE_CURRICULUM" /* RESP_PROFILE_CURRICULUM */:
          this.curriculumData = msg.data;
          if (this.currentTab === "curriculum") this.renderCurriculum();
          break;
        case "RESP_PROFILE_BANK" /* RESP_PROFILE_BANK */:
          this.bankData = msg.data;
          if (this.currentTab === "bank") this.renderBankAccount();
          break;
        case "RESP_PROFILE_BANK_ACTION" /* RESP_PROFILE_BANK_ACTION */:
          this.handleBankActionResponse(msg);
          break;
        case "RESP_PROFILE_PROFITLOSS" /* RESP_PROFILE_PROFITLOSS */:
          this.profitLossData = msg.data;
          if (this.currentTab === "profitloss") this.renderProfitLoss();
          break;
        case "RESP_PROFILE_COMPANIES" /* RESP_PROFILE_COMPANIES */:
          this.companiesData = msg.data;
          if (this.currentTab === "companies") this.renderCompanies();
          break;
        case "RESP_PROFILE_AUTOCONNECTIONS" /* RESP_PROFILE_AUTOCONNECTIONS */:
          this.autoConnectionsData = msg.data;
          if (this.currentTab === "suppliers") this.renderAutoConnections();
          break;
        case "RESP_PROFILE_AUTOCONNECTION_ACTION" /* RESP_PROFILE_AUTOCONNECTION_ACTION */: {
          const acResp = msg;
          if (!acResp.success) this.showStatusMessage(acResp.message || "Action failed", true);
          this.callbacks.sendMessage({ type: "REQ_PROFILE_AUTOCONNECTIONS" /* REQ_PROFILE_AUTOCONNECTIONS */ });
          break;
        }
        case "RESP_PROFILE_POLICY" /* RESP_PROFILE_POLICY */:
          this.policyData = msg.data;
          if (this.currentTab === "strategy") this.renderPolicy();
          break;
        case "RESP_PROFILE_POLICY_SET" /* RESP_PROFILE_POLICY_SET */: {
          const polResp = msg;
          if (!polResp.success) this.showStatusMessage(polResp.message || "Policy update failed", true);
          this.callbacks.sendMessage({ type: "REQ_PROFILE_POLICY" /* REQ_PROFILE_POLICY */ });
          break;
        }
      }
    }
    // ===========================================================================
    // TAB SWITCHING
    // ===========================================================================
    switchTab(tab) {
      this.currentTab = tab;
      this.buildSidebar();
      this.renderLoading();
      switch (tab) {
        case "curriculum":
          this.callbacks.sendMessage({ type: "REQ_PROFILE_CURRICULUM" /* REQ_PROFILE_CURRICULUM */ });
          break;
        case "bank":
          this.callbacks.sendMessage({ type: "REQ_PROFILE_BANK" /* REQ_PROFILE_BANK */ });
          break;
        case "profitloss":
          this.callbacks.sendMessage({ type: "REQ_PROFILE_PROFITLOSS" /* REQ_PROFILE_PROFITLOSS */ });
          break;
        case "suppliers":
          this.callbacks.sendMessage({ type: "REQ_PROFILE_AUTOCONNECTIONS" /* REQ_PROFILE_AUTOCONNECTIONS */ });
          break;
        case "companies":
          this.callbacks.sendMessage({ type: "REQ_PROFILE_COMPANIES" /* REQ_PROFILE_COMPANIES */ });
          break;
        case "strategy":
          this.callbacks.sendMessage({ type: "REQ_PROFILE_POLICY" /* REQ_PROFILE_POLICY */ });
          break;
      }
    }
    renderLoading() {
      this.contentArea.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 200px; color: #94a3b8;">
        <div style="text-align: center;">
          <div style="font-size: 24px; margin-bottom: 8px;">...</div>
          <div>Loading...</div>
        </div>
      </div>
    `;
    }
    // ===========================================================================
    // TAB: CURRICULUM
    // ===========================================================================
    renderCurriculum() {
      const data = this.curriculumData;
      if (!data) return;
      const c = this.contentArea;
      c.innerHTML = "";
      c.appendChild(this.createSectionHeader("Curriculum"));
      const currentLevel = TYCOON_LEVELS[Math.min(data.currentLevel, TYCOON_LEVELS.length - 1)];
      const levelCard = document.createElement("div");
      levelCard.style.cssText = `
      background: rgba(20, 57, 48, 0.4);
      border: 1px solid rgba(52, 89, 80, 0.6);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    `;
      levelCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div>
          <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase;">Current Level</div>
          <div style="color: #22d3ee; font-size: 22px; font-weight: 700;">${this.escapeHtml(data.currentLevelName)}</div>
        </div>
        <div style="text-align: right;">
          <div style="color: #94a3b8; font-size: 11px;">Ranking</div>
          <div style="color: white; font-size: 18px; font-weight: 600;">#${data.ranking}</div>
        </div>
      </div>
    `;
      c.appendChild(levelCard);
      c.appendChild(this.createSectionHeader("Level Progression"));
      const progressDiv = document.createElement("div");
      progressDiv.style.cssText = "display: flex; gap: 4px; margin-bottom: 20px; align-items: flex-end;";
      for (let i = 0; i < TYCOON_LEVELS.length; i++) {
        const lvl = TYCOON_LEVELS[i];
        const isActive = i === data.currentLevel;
        const isPast = i < data.currentLevel;
        const block = document.createElement("div");
        block.style.cssText = `
        flex: 1;
        padding: 8px 4px;
        text-align: center;
        border-radius: 4px;
        font-size: 10px;
        font-weight: ${isActive ? "700" : "400"};
        color: ${isActive ? "#22d3ee" : isPast ? "#4ade80" : "#64748b"};
        background: ${isActive ? "rgba(34, 211, 238, 0.15)" : isPast ? "rgba(74, 222, 128, 0.1)" : "rgba(30, 41, 59, 0.5)"};
        border: 1px solid ${isActive ? "rgba(34, 211, 238, 0.4)" : isPast ? "rgba(74, 222, 128, 0.3)" : "rgba(100, 116, 139, 0.3)"};
      `;
        block.innerHTML = `
        <div>${lvl.name}</div>
        <div style="font-size: 9px; margin-top: 2px;">${lvl.facLimit} bldgs</div>
      `;
        progressDiv.appendChild(block);
      }
      c.appendChild(progressDiv);
      c.appendChild(this.createSectionHeader("Statistics"));
      const statsGrid = document.createElement("div");
      statsGrid.style.cssText = "display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px;";
      const stats = [
        ["Budget", this.formatMoney(data.budget)],
        ["Buildings", `${data.facCount} / ${data.facMax}`],
        ["Prestige", String(Math.round(data.prestige))],
        ["Facility Prestige", String(Math.round(data.facPrestige))],
        ["Research Prestige", String(Math.round(data.researchPrestige))],
        ["Land Area", `${data.area} tiles`],
        ["Nobility Points", String(data.nobPoints)],
        ["Ranking", `#${data.ranking}`]
      ];
      for (const [label, value] of stats) {
        const statEl = document.createElement("div");
        statEl.style.cssText = `
        background: rgba(15, 23, 42, 0.4);
        border: 1px solid rgba(148, 163, 184, 0.1);
        border-radius: 6px;
        padding: 10px 12px;
      `;
        statEl.innerHTML = `
        <div style="color: #94a3b8; font-size: 10px; text-transform: uppercase;">${label}</div>
        <div style="color: white; font-size: 14px; font-weight: 600; margin-top: 2px;">${value}</div>
      `;
        statsGrid.appendChild(statEl);
      }
      c.appendChild(statsGrid);
      if (data.currentLevel < TYCOON_LEVELS.length - 1) {
        const nextLevel = TYCOON_LEVELS[data.currentLevel + 1];
        c.appendChild(this.createSectionHeader(`Requirements for ${nextLevel.name}`));
        const reqDiv = document.createElement("div");
        reqDiv.style.cssText = `
        background: rgba(30, 58, 95, 0.3);
        border: 1px solid rgba(37, 99, 235, 0.3);
        border-radius: 8px;
        padding: 12px;
      `;
        let reqHtml = '<table style="width: 100%; border-collapse: collapse;">';
        if (nextLevel.fee) {
          reqHtml += this.requirementRow("Fee", this.formatMoney(String(nextLevel.fee)));
        }
        if (nextLevel.profitPerHour) {
          reqHtml += this.requirementRow("Profit/Hour", this.formatMoney(String(nextLevel.profitPerHour)));
        }
        if (nextLevel.prestige) {
          reqHtml += this.requirementRow("Prestige", String(nextLevel.prestige));
        }
        reqHtml += this.requirementRow("Max Buildings", String(nextLevel.facLimit));
        reqHtml += "</table>";
        reqDiv.innerHTML = reqHtml;
        c.appendChild(reqDiv);
      }
    }
    requirementRow(label, value) {
      return `
      <tr>
        <td style="padding: 4px 0; color: #94a3b8; font-size: 12px;">${label}</td>
        <td style="padding: 4px 0; color: white; font-size: 12px; text-align: right; font-weight: 600;">${value}</td>
      </tr>
    `;
    }
    // ===========================================================================
    // TAB: BANK ACCOUNT
    // ===========================================================================
    renderBankAccount() {
      const data = this.bankData;
      if (!data) return;
      const c = this.contentArea;
      c.innerHTML = "";
      c.appendChild(this.createSectionHeader("Bank Account"));
      const balanceDiv = document.createElement("div");
      balanceDiv.style.cssText = "margin-left: 20px; margin-bottom: 24px;";
      balanceDiv.innerHTML = `
      <span style="color: #94a3b8; font-size: 13px;">Current Balance:</span>
      <span style="color: white; font-size: 16px; font-weight: 700; margin-left: 8px;">${this.formatMoney(data.balance)}</span>
    `;
      c.appendChild(balanceDiv);
      const cols = document.createElement("div");
      cols.style.cssText = "display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;";
      const borrowDiv = document.createElement("div");
      borrowDiv.innerHTML = `
      ${this.sectionGradientHeader("Borrow: Bank of IFEL")}
      <div style="padding: 12px;">
        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 4px;">Amount:</div>
        <input class="bank-loan-amount" value="${this.escapeHtml(data.maxLoan)}" style="
          width: 100%;
          padding: 6px 10px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 4px;
          color: white;
          font-size: 13px;
          box-sizing: border-box;
        " />
        <div style="margin-top: 8px;">
          <span style="color: #94a3b8; font-size: 11px;">Interest Rate: </span>
          <span class="bank-interest" style="color: white; font-size: 12px;">${data.defaultInterest}%</span><br>
          <span style="color: #94a3b8; font-size: 11px;">Term: </span>
          <span class="bank-term" style="color: white; font-size: 12px;">${data.defaultTerm}</span>
          <span style="color: #94a3b8; font-size: 11px;"> years</span>
        </div>
        <button class="bank-borrow-btn" style="${this.actionBtnStyle()}">Borrow</button>
      </div>
    `;
      cols.appendChild(borrowDiv);
      const sendDiv = document.createElement("div");
      sendDiv.innerHTML = `
      ${this.sectionGradientHeader("Send money")}
      <div style="padding: 12px;">
        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 4px;">Send to:</div>
        <input class="bank-send-to" placeholder="Tycoon name" style="
          width: 100%;
          padding: 6px 10px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 4px;
          color: white;
          font-size: 13px;
          margin-bottom: 8px;
          box-sizing: border-box;
        " />
        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 4px;">Amount:</div>
        <input class="bank-send-amount" placeholder="0" style="
          width: 100%;
          padding: 6px 10px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 4px;
          color: white;
          font-size: 13px;
          box-sizing: border-box;
        " />
        <div style="font-size: 10px; color: #64748b; margin-top: 4px;">
          You can transfer up to ${this.formatMoney(data.balance)}.
        </div>
        <button class="bank-send-btn" style="${this.actionBtnStyle()}">Send</button>
      </div>
    `;
      cols.appendChild(sendDiv);
      c.appendChild(cols);
      c.innerHTML += this.sectionGradientHeader("Loans");
      const loansDiv = document.createElement("div");
      loansDiv.style.cssText = "padding: 12px;";
      if (data.loans.length === 0) {
        loansDiv.innerHTML = `
        <div style="color: #94a3b8; font-size: 12px;">
          You don't owe money to any bank. If you want to borrow money from the IFEL's bank,
          enter the amount you want on the input box above and click <b style="color: white;">Borrow</b>.
        </div>
      `;
      } else {
        let tableHtml = `
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <tr style="border-bottom: 1px solid rgba(148, 163, 184, 0.2);">
            <th style="padding: 6px; color: #94a3b8; text-align: left;">Bank</th>
            <th style="padding: 6px; color: #94a3b8; text-align: left;">Date</th>
            <th style="padding: 6px; color: #94a3b8; text-align: right;">Amount</th>
            <th style="padding: 6px; color: #94a3b8; text-align: right;">Interest</th>
            <th style="padding: 6px; color: #94a3b8; text-align: right;">Term</th>
            <th style="padding: 6px; color: #94a3b8; text-align: right;">Payment</th>
            <th style="padding: 6px;"></th>
          </tr>
      `;
        for (const loan of data.loans) {
          tableHtml += `
          <tr style="border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
            <td style="padding: 6px; color: white;">${this.escapeHtml(loan.bank)}</td>
            <td style="padding: 6px; color: #94a3b8;">${this.escapeHtml(loan.date)}</td>
            <td style="padding: 6px; color: white; text-align: right;">${this.formatMoney(loan.amount)}</td>
            <td style="padding: 6px; color: #94a3b8; text-align: right;">${loan.interest}%</td>
            <td style="padding: 6px; color: #94a3b8; text-align: right;">${loan.term}yr</td>
            <td style="padding: 6px; color: white; text-align: right;">${this.formatMoney(loan.slice)}</td>
            <td style="padding: 6px;">
              <button class="bank-payoff-btn" data-loan-index="${loan.loanIndex}" style="
                padding: 2px 8px;
                background: rgba(239, 68, 68, 0.2);
                border: 1px solid rgba(239, 68, 68, 0.4);
                border-radius: 4px;
                color: #fca5a5;
                font-size: 11px;
                cursor: pointer;
              ">Pay Off</button>
            </td>
          </tr>
        `;
        }
        tableHtml += "</table>";
        loansDiv.innerHTML = tableHtml;
      }
      c.appendChild(loansDiv);
      this.wireBankActions();
    }
    wireBankActions() {
      const loanInput = this.contentArea.querySelector(".bank-loan-amount");
      const interestEl = this.contentArea.querySelector(".bank-interest");
      const termEl = this.contentArea.querySelector(".bank-term");
      if (loanInput && interestEl && termEl) {
        loanInput.addEventListener("keyup", () => {
          const val = parseFloat(loanInput.value.replace(/,/g, "")) || 0;
          const existingLoans = 0;
          const interest = Math.round((existingLoans + val) / 1e8);
          let term = 200 - Math.round((existingLoans + val) / 1e7);
          if (term < 5) term = 5;
          interestEl.textContent = `${interest}%`;
          termEl.textContent = String(term);
        });
      }
      const borrowBtn = this.contentArea.querySelector(".bank-borrow-btn");
      if (borrowBtn && loanInput) {
        borrowBtn.addEventListener("click", () => {
          const amount = loanInput.value.replace(/,/g, "");
          this.callbacks.sendMessage({
            type: "REQ_PROFILE_BANK_ACTION" /* REQ_PROFILE_BANK_ACTION */,
            action: "borrow",
            amount
          });
        });
      }
      const sendBtn = this.contentArea.querySelector(".bank-send-btn");
      const sendTo = this.contentArea.querySelector(".bank-send-to");
      const sendAmount = this.contentArea.querySelector(".bank-send-amount");
      if (sendBtn && sendTo && sendAmount) {
        sendBtn.addEventListener("click", () => {
          this.callbacks.sendMessage({
            type: "REQ_PROFILE_BANK_ACTION" /* REQ_PROFILE_BANK_ACTION */,
            action: "send",
            toTycoon: sendTo.value,
            amount: sendAmount.value.replace(/,/g, "")
          });
        });
      }
      const payoffBtns = this.contentArea.querySelectorAll(".bank-payoff-btn");
      payoffBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const loanIndex = parseInt(btn.dataset.loanIndex || "-1", 10);
          if (loanIndex >= 0) {
            this.callbacks.sendMessage({
              type: "REQ_PROFILE_BANK_ACTION" /* REQ_PROFILE_BANK_ACTION */,
              action: "payoff",
              loanIndex
            });
          }
        });
      });
    }
    handleBankActionResponse(resp) {
      if (resp.result.success) {
        this.showStatusMessage(resp.result.message || "Action completed");
        this.callbacks.sendMessage({ type: "REQ_PROFILE_BANK" /* REQ_PROFILE_BANK */ });
      } else {
        this.showStatusMessage(resp.result.message || "Action failed", true);
      }
    }
    // ===========================================================================
    // TAB: PROFIT & LOSS
    // ===========================================================================
    renderProfitLoss() {
      const data = this.profitLossData;
      if (!data) return;
      const c = this.contentArea;
      c.innerHTML = "";
      c.appendChild(this.createSectionHeader("Profit & Loss"));
      const table = document.createElement("table");
      table.style.cssText = "width: 100%; border-collapse: collapse; margin-left: 20px;";
      this.renderProfitLossNode(table, data.root);
      c.appendChild(table);
    }
    renderProfitLossNode(table, node) {
      const tr = document.createElement("tr");
      const labelTd = document.createElement("td");
      const indent = node.level * 30;
      const levelClass = `labelAccountLevel${node.level}`;
      const isNegative = node.amount.startsWith("-");
      if (node.isHeader) {
        labelTd.style.cssText = `padding: 8px 0 2px ${indent}px;`;
        labelTd.innerHTML = `<div style="color: #64748b; font-size: 10px; text-transform: uppercase; margin-top: 8px;">${this.escapeHtml(node.label)}</div>`;
        tr.appendChild(labelTd);
        table.appendChild(tr);
      } else {
        const fontSize = node.level === 0 ? "14px" : node.level === 1 ? "13px" : "12px";
        const fontWeight = node.level <= 1 ? "600" : "400";
        const color = node.level === 0 ? "white" : node.level === 1 ? "#e2e8f0" : "#cbd5e1";
        const hasBorder = node.level === 1;
        labelTd.style.cssText = `
        padding: 4px 0 4px ${indent}px;
        ${hasBorder ? "border-bottom: 1px solid rgba(52, 89, 80, 0.6);" : ""}
      `;
        labelTd.innerHTML = `<div style="color: ${color}; font-size: ${fontSize}; font-weight: ${fontWeight};">${this.escapeHtml(node.label)}</div>`;
        const amountTd = document.createElement("td");
        amountTd.style.cssText = `
        padding: 4px 8px;
        text-align: right;
        ${hasBorder ? "border-bottom: 1px solid rgba(52, 89, 80, 0.6);" : ""}
      `;
        const amountColor = isNegative ? "#fca5a5" : color;
        amountTd.innerHTML = `
        <div style="color: ${amountColor}; font-size: ${fontSize}; font-weight: ${fontWeight};">
          ${this.formatMoney(node.amount)}
        </div>
      `;
        tr.appendChild(labelTd);
        tr.appendChild(amountTd);
        table.appendChild(tr);
      }
      if (node.children) {
        for (const child of node.children) {
          this.renderProfitLossNode(table, child);
        }
      }
    }
    // ===========================================================================
    // TAB: COMPANIES
    // ===========================================================================
    renderCompanies() {
      const data = this.companiesData;
      if (!data) return;
      const c = this.contentArea;
      c.innerHTML = "";
      c.appendChild(this.createSectionHeader("Companies"));
      const infoDiv = document.createElement("div");
      infoDiv.style.cssText = "color: #94a3b8; font-size: 12px; margin: 0 0 16px 20px;";
      infoDiv.textContent = `You have registered the following companies in ${this.escapeHtml(this.worldName)}. Choose one from the list or create a new one.`;
      c.appendChild(infoDiv);
      const grid = document.createElement("div");
      grid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px;";
      for (const company of data.companies) {
        const isActive = company.name === data.currentCompany;
        const card = document.createElement("div");
        card.style.cssText = `
        background: ${isActive ? "rgba(37, 99, 235, 0.2)" : "rgba(20, 57, 48, 0.3)"};
        border: 2px solid ${isActive ? "#3b82f6" : "rgba(52, 89, 80, 0.6)"};
        border-radius: 8px;
        padding: 12px;
        text-align: center;
        cursor: pointer;
        transition: all 0.15s;
      `;
        card.innerHTML = `
        <div style="
          width: 48px; height: 48px;
          background: rgba(52, 89, 80, 0.4);
          border-radius: 8px;
          margin: 0 auto 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        ">${this.clusterEmoji(company.cluster)}</div>
        <div style="color: white; font-size: 12px; font-weight: 600; margin-bottom: 4px;">${this.escapeHtml(company.name)}</div>
        <div style="color: #94a3b8; font-size: 10px;">${this.escapeHtml(company.companyType)}</div>
        <div style="color: #94a3b8; font-size: 10px;">${company.facilityCount} Facilities</div>
        ${isActive ? '<div style="color: #3b82f6; font-size: 10px; font-weight: 600; margin-top: 4px;">ACTIVE</div>' : ""}
      `;
        card.addEventListener("mouseenter", () => {
          if (!isActive) card.style.borderColor = "#3b82f6";
        });
        card.addEventListener("mouseleave", () => {
          if (!isActive) card.style.borderColor = "rgba(52, 89, 80, 0.6)";
        });
        card.addEventListener("click", () => {
          if (!isActive && this.callbacks.onSwitchCompany) {
            this.callbacks.onSwitchCompany(company.name, company.companyId);
          }
        });
        grid.appendChild(card);
      }
      c.appendChild(grid);
    }
    clusterEmoji(cluster) {
      switch (cluster.toLowerCase()) {
        case "dissidents":
          return "&#x1f7e2;";
        // green circle
        case "pgi":
          return "&#x1f7e1;";
        // yellow circle
        case "mariko":
          return "&#x1f535;";
        // blue circle
        case "moab":
          return "&#x26ab;";
        // black circle
        case "magna":
          return "&#x26aa;";
        // white circle
        default:
          return "&#x1f3e2;";
      }
    }
    // ===========================================================================
    // TAB: AUTO CONNECTIONS (INITIAL SUPPLIERS)
    // ===========================================================================
    renderAutoConnections() {
      const data = this.autoConnectionsData;
      if (!data) return;
      const c = this.contentArea;
      c.innerHTML = "";
      c.appendChild(this.createSectionHeader("Initial Suppliers"));
      if (data.fluids.length === 0) {
        c.innerHTML += '<div style="color: #94a3b8; padding: 20px;">No auto-connections configured.</div>';
        return;
      }
      for (const fluid of data.fluids) {
        this.renderFluidSection(c, fluid);
      }
    }
    renderFluidSection(container, fluid) {
      const section = document.createElement("div");
      section.style.cssText = "margin-bottom: 16px;";
      section.innerHTML = this.sectionGradientHeader(this.escapeHtml(fluid.fluidName));
      const content = document.createElement("div");
      content.style.cssText = "padding: 8px 12px;";
      if (fluid.suppliers.length === 0) {
        content.innerHTML += '<div style="color: #64748b; font-size: 11px; padding: 4px 0;">No suppliers assigned.</div>';
      } else {
        let html = '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
        for (const sup of fluid.suppliers) {
          html += `
          <tr style="border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
            <td style="padding: 4px 0; color: white;">${this.escapeHtml(sup.facilityName)}</td>
            <td style="padding: 4px 0; color: #94a3b8;">${this.escapeHtml(sup.companyName)}</td>
            <td style="padding: 4px 0; text-align: right;">
              <button class="ac-delete-btn" data-fluid-id="${this.escapeHtml(fluid.fluidId)}" data-supplier-id="${this.escapeHtml(sup.facilityId)}" style="
                padding: 1px 6px;
                background: rgba(239, 68, 68, 0.15);
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 3px;
                color: #fca5a5;
                font-size: 10px;
                cursor: pointer;
              ">Del</button>
            </td>
          </tr>
        `;
        }
        html += "</table>";
        content.innerHTML += html;
      }
      const optionsHtml = `
      <div style="margin-top: 8px; display: flex; gap: 12px;">
        <label style="color: #94a3b8; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
          <input type="checkbox" class="ac-trade-center" data-fluid-id="${this.escapeHtml(fluid.fluidId)}" ${fluid.hireTradeCenter ? "checked" : ""} />
          Hire Trade Center
        </label>
        <label style="color: #94a3b8; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
          <input type="checkbox" class="ac-warehouses-only" data-fluid-id="${this.escapeHtml(fluid.fluidId)}" ${fluid.onlyWarehouses ? "checked" : ""} />
          Warehouses only
        </label>
      </div>
    `;
      content.innerHTML += optionsHtml;
      section.appendChild(content);
      container.appendChild(section);
      section.querySelectorAll(".ac-delete-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const el = btn;
          this.callbacks.sendMessage({
            type: "REQ_PROFILE_AUTOCONNECTION_ACTION" /* REQ_PROFILE_AUTOCONNECTION_ACTION */,
            action: "delete",
            fluidId: el.dataset.fluidId || "",
            suppliers: el.dataset.supplierId || ""
          });
        });
      });
      const tcCheck = section.querySelector(".ac-trade-center");
      if (tcCheck) {
        tcCheck.addEventListener("change", () => {
          this.callbacks.sendMessage({
            type: "REQ_PROFILE_AUTOCONNECTION_ACTION" /* REQ_PROFILE_AUTOCONNECTION_ACTION */,
            action: tcCheck.checked ? "hireTradeCenter" : "dontHireTradeCenter",
            fluidId: fluid.fluidId
          });
        });
      }
      const whCheck = section.querySelector(".ac-warehouses-only");
      if (whCheck) {
        whCheck.addEventListener("change", () => {
          this.callbacks.sendMessage({
            type: "REQ_PROFILE_AUTOCONNECTION_ACTION" /* REQ_PROFILE_AUTOCONNECTION_ACTION */,
            action: whCheck.checked ? "onlyWarehouses" : "dontOnlyWarehouses",
            fluidId: fluid.fluidId
          });
        });
      }
    }
    // ===========================================================================
    // TAB: POLICY (STRATEGY)
    // ===========================================================================
    renderPolicy() {
      const data = this.policyData;
      if (!data) return;
      const c = this.contentArea;
      c.innerHTML = "";
      c.appendChild(this.createSectionHeader("Strategy"));
      if (data.policies.length === 0) {
        c.innerHTML += '<div style="color: #94a3b8; padding: 20px;">No diplomatic relationships established.</div>';
        return;
      }
      let html = `
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px;">
        <tr style="border-bottom: 1px solid rgba(148, 163, 184, 0.2);">
          <th style="padding: 8px; color: #94a3b8; text-align: left;">Tycoon</th>
          <th style="padding: 8px; color: #94a3b8; text-align: center;">Your Policy</th>
          <th style="padding: 8px; color: #94a3b8; text-align: center;">Their Policy</th>
        </tr>
    `;
      for (const entry of data.policies) {
        const yourLabel = POLICY_LABELS[entry.yourPolicy] || "Neutral";
        const yourColor = POLICY_COLORS[entry.yourPolicy] || "#BDB76B";
        const theirLabel = POLICY_LABELS[entry.theirPolicy] || "Neutral";
        const theirColor = POLICY_COLORS[entry.theirPolicy] || "#BDB76B";
        html += `
        <tr style="border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
          <td style="padding: 8px; color: white; font-weight: 500;">${this.escapeHtml(entry.tycoonName)}</td>
          <td style="padding: 8px; text-align: center;">
            <select class="policy-select" data-tycoon="${this.escapeHtml(entry.tycoonName)}" style="
              padding: 4px 8px;
              background: rgba(15, 23, 42, 0.6);
              border: 1px solid rgba(148, 163, 184, 0.3);
              border-radius: 4px;
              color: ${yourColor};
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
            ">
              <option value="0" ${entry.yourPolicy === 0 ? "selected" : ""} style="color: #ADFF2F;">Ally</option>
              <option value="1" ${entry.yourPolicy === 1 ? "selected" : ""} style="color: #BDB76B;">Neutral</option>
              <option value="2" ${entry.yourPolicy === 2 ? "selected" : ""} style="color: #FF0000;">Enemy</option>
            </select>
          </td>
          <td style="padding: 8px; text-align: center;">
            <span style="color: ${theirColor}; font-weight: 600;">${theirLabel}</span>
          </td>
        </tr>
      `;
      }
      html += "</table>";
      const tableDiv = document.createElement("div");
      tableDiv.innerHTML = html;
      c.appendChild(tableDiv);
      tableDiv.querySelectorAll(".policy-select").forEach((select) => {
        select.addEventListener("change", () => {
          const el = select;
          const tycoonName = el.dataset.tycoon || "";
          const status = parseInt(el.value, 10);
          this.callbacks.sendMessage({
            type: "REQ_PROFILE_POLICY_SET" /* REQ_PROFILE_POLICY_SET */,
            tycoonName,
            status
          });
        });
      });
    }
    // ===========================================================================
    // HELPERS
    // ===========================================================================
    createSectionHeader(text) {
      const h = document.createElement("div");
      h.style.cssText = "color: #e2e8f0; font-size: 16px; font-weight: 700; margin-bottom: 12px;";
      h.textContent = text;
      return h;
    }
    sectionGradientHeader(text) {
      return `
      <div style="
        padding: 8px 12px;
        background: linear-gradient(90deg, rgba(52, 89, 80, 0.6), transparent);
        border-bottom: 1px solid rgba(52, 89, 80, 0.4);
        border-radius: 4px 4px 0 0;
      ">
        <div style="color: white; font-size: 13px; font-weight: 600;">${text}</div>
      </div>
    `;
    }
    actionBtnStyle() {
      return `
      margin-top: 8px;
      padding: 6px 16px;
      background: rgba(52, 89, 80, 0.4);
      border: 1px solid rgba(52, 89, 80, 0.8);
      border-radius: 4px;
      color: white;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    `;
    }
    formatMoney(value) {
      const cleaned = value.replace(/[$\s]/g, "");
      const isNegative = cleaned.startsWith("-");
      const absValue = isNegative ? cleaned.substring(1) : cleaned;
      const parts = absValue.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      const formatted = parts.join(".");
      return `${isNegative ? "-" : ""}$${formatted}`;
    }
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
    showStatusMessage(message, isError = false) {
      const existing = this.contentArea.querySelector(".profile-status-msg");
      if (existing) existing.remove();
      const msgEl = document.createElement("div");
      msgEl.className = "profile-status-msg";
      msgEl.style.cssText = `
      padding: 8px 12px;
      margin-bottom: 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      background: ${isError ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)"};
      border: 1px solid ${isError ? "rgba(239, 68, 68, 0.3)" : "rgba(34, 197, 94, 0.3)"};
      color: ${isError ? "#fca5a5" : "#86efac"};
    `;
      msgEl.textContent = message;
      this.contentArea.insertBefore(msgEl, this.contentArea.firstChild);
      setTimeout(() => msgEl.remove(), 5e3);
    }
    // ===========================================================================
    // DRAG
    // ===========================================================================
    startDrag(e) {
      this.isDragging = true;
      const rect = this.panel.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;
      const onMouseMove = (ev) => {
        if (!this.isDragging) return;
        this.panel.style.left = `${ev.clientX - this.dragOffsetX}px`;
        this.panel.style.top = `${ev.clientY - this.dragOffsetY}px`;
      };
      const onMouseUp = () => {
        this.isDragging = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }
  };

  // src/client/ui/politics-panel.ts
  var PoliticsPanel = class {
    constructor(callbacks) {
      this.currentRatingTab = "popular";
      this.politicsData = null;
      this.townName = "";
      this.buildingX = 0;
      this.buildingY = 0;
      // Drag state
      this.isDragging = false;
      this.dragOffsetX = 0;
      this.dragOffsetY = 0;
      this.callbacks = callbacks;
      this.panel = this.createPanel();
      this.contentArea = this.panel.querySelector(".politics-content");
      document.body.appendChild(this.panel);
    }
    // ===========================================================================
    // PANEL CREATION
    // ===========================================================================
    createPanel() {
      const panel = document.createElement("div");
      panel.className = "politics-panel";
      panel.style.cssText = `
      position: fixed;
      width: 740px;
      max-height: 80vh;
      background: linear-gradient(135deg, rgba(20, 56, 51, 0.97), rgba(30, 70, 60, 0.97));
      border: 1px solid rgba(74, 122, 106, 0.4);
      backdrop-filter: blur(20px);
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
      z-index: 1001;
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: Tahoma, Verdana, Arial, sans-serif;
    `;
      panel.innerHTML = `
      <div class="politics-header" style="
        padding: 10px 16px;
        background: linear-gradient(135deg, #1a4a3f, #2d6b5a);
        border-bottom: 1px solid rgba(74, 122, 106, 0.4);
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
      ">
        <span class="politics-title" style="color: #ffffcc; font-weight: 600; font-size: 14px;">Politics</span>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="politics-elections-info" style="color: #aac; font-size: 11px;"></span>
          <button class="politics-close-btn" style="
            background: rgba(255,255,255,0.1);
            border: none;
            color: #ffffcc;
            font-size: 16px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
          ">&times;</button>
        </div>
      </div>
      <div class="politics-content" style="
        display: flex;
        flex: 1;
        overflow: hidden;
        max-height: calc(80vh - 44px);
      ">
      </div>
    `;
      const header = panel.querySelector(".politics-header");
      header.addEventListener("mousedown", (e) => {
        const target = e.target;
        if (!target.closest("button")) this.startDrag(e);
      });
      panel.querySelector(".politics-close-btn").addEventListener("click", () => this.hide());
      return panel;
    }
    // ===========================================================================
    // SHOW / HIDE / RESPONSE
    // ===========================================================================
    show(townName, buildingX, buildingY) {
      this.townName = townName;
      this.buildingX = buildingX;
      this.buildingY = buildingY;
      this.politicsData = null;
      this.currentRatingTab = "popular";
      const title = this.panel.querySelector(".politics-title");
      title.textContent = `Politics - ${townName || "Town"}`;
      this.panel.style.display = "flex";
      this.panel.style.left = `${Math.max(50, (window.innerWidth - 740) / 2)}px`;
      this.panel.style.top = `${Math.max(50, (window.innerHeight - 500) / 2)}px`;
      this.contentArea.innerHTML = `
      <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #aac; padding: 40px;">
        Loading politics data...
      </div>
    `;
      this.callbacks.sendMessage({
        type: "REQ_POLITICS_DATA" /* REQ_POLITICS_DATA */,
        townName,
        buildingX,
        buildingY
      });
    }
    hide() {
      this.panel.style.display = "none";
      this.politicsData = null;
    }
    isVisible() {
      return this.panel.style.display !== "none";
    }
    handleResponse(msg) {
      if (msg.type === "RESP_POLITICS_DATA" /* RESP_POLITICS_DATA */) {
        const resp = msg;
        this.politicsData = resp.data;
        const electionsInfo = this.panel.querySelector(".politics-elections-info");
        electionsInfo.textContent = `${resp.data.yearsToElections} years to elections`;
        this.renderContent();
      } else if (msg.type === "RESP_POLITICS_VOTE" /* RESP_POLITICS_VOTE */ || msg.type === "RESP_POLITICS_LAUNCH_CAMPAIGN" /* RESP_POLITICS_LAUNCH_CAMPAIGN */) {
        this.callbacks.sendMessage({
          type: "REQ_POLITICS_DATA" /* REQ_POLITICS_DATA */,
          townName: this.townName,
          buildingX: this.buildingX,
          buildingY: this.buildingY
        });
      }
    }
    // ===========================================================================
    // CONTENT RENDERING
    // ===========================================================================
    renderContent() {
      if (!this.politicsData) return;
      const d = this.politicsData;
      this.contentArea.innerHTML = "";
      const leftCol = document.createElement("div");
      leftCol.style.cssText = "flex: 1; overflow-y: auto; border-right: 1px solid rgba(74, 122, 106, 0.3);";
      const mayorCard = document.createElement("div");
      mayorCard.style.cssText = "padding: 16px; border-bottom: 1px solid rgba(74, 122, 106, 0.3);";
      mayorCard.innerHTML = `
      <div style="font-size: 11px; color: #88aa99; text-transform: uppercase; margin-bottom: 8px;">The Mayor</div>
      <div style="color: #ffffcc; font-size: 15px; font-weight: 600; margin-bottom: 8px;">${this.escapeHtml(d.mayorName || "None")}</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px;">
        <div><span style="color: #88aa99;">Prestige:</span> <span style="color: #ddd;">${d.mayorPrestige}</span></div>
        <div><span style="color: #88aa99;">Mandate:</span> <span style="color: #ddd;">${d.campaignCount}</span></div>
        <div><span style="color: #88aa99;">Popular:</span> <span style="color: #ddd;">${d.mayorRating}%</span></div>
        <div><span style="color: #88aa99;">Tycoons:</span> <span style="color: #ddd;">${d.tycoonsRating}%</span></div>
      </div>
    `;
      leftCol.appendChild(mayorCard);
      const tabBar = document.createElement("div");
      tabBar.style.cssText = "display: flex; border-bottom: 1px solid rgba(74, 122, 106, 0.3);";
      const tabs = [
        { label: "POPULAR\nRATING", id: "popular" },
        { label: "TYCOONS'\nRATINGS", id: "tycoons" },
        { label: "IFEL's\nRATING", id: "ifel" },
        { label: "PUBLICITY", id: "publicity" }
      ];
      for (const tab of tabs) {
        const tabBtn = document.createElement("div");
        const isActive = tab.id === this.currentRatingTab;
        tabBtn.style.cssText = `
        flex: 1;
        padding: 8px 4px;
        text-align: center;
        font-size: 10px;
        color: ${isActive ? "#ffffcc" : "#88aa99"};
        background: ${isActive ? "rgba(74, 122, 106, 0.3)" : "transparent"};
        cursor: pointer;
        white-space: pre-line;
        line-height: 1.3;
        border-right: 1px solid rgba(74, 122, 106, 0.2);
        user-select: none;
      `;
        tabBtn.textContent = tab.label;
        tabBtn.addEventListener("click", () => {
          this.currentRatingTab = tab.id;
          this.renderContent();
        });
        tabBar.appendChild(tabBtn);
      }
      leftCol.appendChild(tabBar);
      const ratingData = this.getRatingDataForTab(this.currentRatingTab);
      const ratingContent = document.createElement("div");
      ratingContent.style.cssText = "padding: 8px 16px; overflow-y: auto;";
      ratingContent.appendChild(this.renderRatingsTable(ratingData));
      leftCol.appendChild(ratingContent);
      const rightCol = document.createElement("div");
      rightCol.style.cssText = "flex: 1; overflow-y: auto; display: flex; flex-direction: column;";
      const oppositionSection = document.createElement("div");
      oppositionSection.style.cssText = "padding: 16px; border-bottom: 1px solid rgba(74, 122, 106, 0.3); min-height: 120px;";
      oppositionSection.innerHTML = `
      <div style="font-size: 11px; color: #88aa99; text-transform: uppercase; margin-bottom: 8px;">The Opposition</div>
    `;
      if (d.campaigns.length > 0) {
        const candidateList = document.createElement("div");
        for (const c of d.campaigns) {
          const row = document.createElement("div");
          row.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 4px 0; color: #ddd; font-size: 12px; border-bottom: 1px solid rgba(74, 122, 106, 0.15);";
          const nameSpan = document.createElement("span");
          nameSpan.textContent = c.candidateName;
          const rightSide = document.createElement("div");
          rightSide.style.cssText = "display: flex; align-items: center; gap: 8px;";
          const ratingSpan = document.createElement("span");
          ratingSpan.style.color = "#88aa99";
          ratingSpan.textContent = `${c.rating}%`;
          const voteBtn = document.createElement("button");
          voteBtn.style.cssText = "padding: 2px 8px; background: rgba(52, 89, 80, 0.8); color: #ffffcc; border: 1px solid #4a7a6a; border-radius: 3px; cursor: pointer; font-size: 10px;";
          voteBtn.textContent = "Vote";
          voteBtn.onclick = () => {
            this.callbacks.sendMessage({
              type: "REQ_POLITICS_VOTE" /* REQ_POLITICS_VOTE */,
              buildingX: this.buildingX,
              buildingY: this.buildingY,
              candidateName: c.candidateName
            });
          };
          rightSide.appendChild(ratingSpan);
          rightSide.appendChild(voteBtn);
          row.appendChild(nameSpan);
          row.appendChild(rightSide);
          candidateList.appendChild(row);
        }
        oppositionSection.appendChild(candidateList);
      } else {
        const noData = document.createElement("div");
        noData.style.cssText = "color: white; font-size: 16px; text-align: center; margin-top: 30px;";
        noData.textContent = "No candidates";
        oppositionSection.appendChild(noData);
      }
      rightCol.appendChild(oppositionSection);
      const campaignSection = document.createElement("div");
      campaignSection.style.cssText = "padding: 16px; flex: 1;";
      campaignSection.innerHTML = `
      <div style="font-size: 11px; color: #88aa99; text-transform: uppercase; margin-bottom: 12px;">Your Campaign</div>
    `;
      if (d.campaignMessage) {
        const msg = document.createElement("div");
        msg.style.cssText = "color: #ddd; font-size: 12px; text-align: center; margin: 20px 0; line-height: 1.5;";
        msg.textContent = d.campaignMessage;
        campaignSection.appendChild(msg);
      }
      if (d.canLaunchCampaign) {
        const launchBtn = document.createElement("button");
        launchBtn.style.cssText = `
        display: block;
        margin: 20px auto;
        padding: 8px 24px;
        background: rgba(52, 89, 80, 0.8);
        color: #ffffcc;
        border: 1px solid #4a7a6a;
        border-radius: 4px;
        cursor: pointer;
        font-family: Tahoma, Verdana, Arial, sans-serif;
        font-size: 12px;
      `;
        launchBtn.textContent = "Launch Campaign";
        launchBtn.onmouseenter = () => {
          launchBtn.style.background = "rgba(74, 122, 106, 0.9)";
          launchBtn.style.borderColor = "#ffffcc";
        };
        launchBtn.onmouseleave = () => {
          launchBtn.style.background = "rgba(52, 89, 80, 0.8)";
          launchBtn.style.borderColor = "#4a7a6a";
        };
        launchBtn.onclick = () => {
          this.callbacks.sendMessage({
            type: "REQ_POLITICS_LAUNCH_CAMPAIGN" /* REQ_POLITICS_LAUNCH_CAMPAIGN */,
            buildingX: this.buildingX,
            buildingY: this.buildingY
          });
        };
        campaignSection.appendChild(launchBtn);
      }
      rightCol.appendChild(campaignSection);
      this.contentArea.appendChild(leftCol);
      this.contentArea.appendChild(rightCol);
    }
    getRatingDataForTab(tab) {
      if (!this.politicsData) return [];
      switch (tab) {
        case "popular":
          return this.politicsData.popularRatings;
        case "tycoons":
          return [];
        // Tycoons' ratings not yet implemented
        case "ifel":
          return this.politicsData.ifelRatings;
        case "publicity":
          return [];
        // Publicity not yet implemented
        default:
          return [];
      }
    }
    renderRatingsTable(ratings) {
      const table = document.createElement("div");
      if (ratings.length === 0) {
        table.innerHTML = '<div style="color: #88aa99; font-size: 12px; text-align: center; padding: 20px;">No data available</div>';
        return table;
      }
      for (const entry of ratings) {
        const row = document.createElement("div");
        row.style.cssText = "display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(36, 72, 67, 0.6);";
        const nameSpan = document.createElement("span");
        nameSpan.style.cssText = "color: #ddd; font-size: 12px;";
        nameSpan.textContent = entry.name;
        const valueSpan = document.createElement("span");
        valueSpan.style.cssText = `color: ${this.getRatingColor(entry.value)}; font-size: 12px; font-weight: 600;`;
        valueSpan.textContent = `${entry.value}%`;
        row.appendChild(nameSpan);
        row.appendChild(valueSpan);
        table.appendChild(row);
      }
      return table;
    }
    getRatingColor(value) {
      if (value >= 100) return "#66ff66";
      if (value >= 60) return "#ffffcc";
      if (value >= 30) return "#ffaa44";
      return "#ff6644";
    }
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
    // ===========================================================================
    // DRAG BEHAVIOR
    // ===========================================================================
    startDrag(e) {
      this.isDragging = true;
      const rect = this.panel.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;
      const onMove = (ev) => {
        if (!this.isDragging) return;
        this.panel.style.left = `${ev.clientX - this.dragOffsetX}px`;
        this.panel.style.top = `${ev.clientY - this.dragOffsetY}px`;
      };
      const onUp = () => {
        this.isDragging = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }
  };

  // src/client/ui/ui-manager.ts
  var UIManager = class {
    constructor() {
      this.chatUI = null;
      this.mapNavigationUI = null;
      this.toolbarUI = null;
      this.tycoonStatsUI = null;
      this.buildMenuUI = null;
      this.zoneOverlayUI = null;
      this.buildingDetailsPanel = null;
      this.searchMenuPanel = null;
      this.mailPanel = null;
      this.profilePanel = null;
      this.politicsPanel = null;
      this.uiConsole = document.getElementById("console-output");
      this.loginUI = new LoginUI();
    }
    /**
     * Initialize game components (called after successful connection)
     */
    initGameUI(gamePanel, sendMessage) {
      this.mapNavigationUI = new MapNavigationUI(gamePanel);
      this.mapNavigationUI.init();
      this.chatUI = new ChatUI();
      this.toolbarUI = new ToolbarUI();
      this.toolbarUI.init();
      this.tycoonStatsUI = new TycoonStatsUI();
      this.buildMenuUI = new BuildMenuUI();
      this.zoneOverlayUI = new ZoneOverlayUI();
      this.buildingDetailsPanel = new BuildingDetailsPanel(gamePanel, {
        onPropertyChange: void 0,
        // Will be set when showing the panel
        onClose: void 0,
        onNavigateToBuilding: void 0
      });
      if (sendMessage) {
        this.searchMenuPanel = new SearchMenuPanel(sendMessage);
      }
      if (sendMessage) {
        this.mailPanel = new MailPanel({
          getMailFolder: (folder) => {
            sendMessage({ type: "REQ_MAIL_GET_FOLDER" /* REQ_MAIL_GET_FOLDER */, folder });
          },
          readMailMessage: (folder, messageId) => {
            sendMessage({ type: "REQ_MAIL_READ_MESSAGE" /* REQ_MAIL_READ_MESSAGE */, folder, messageId });
          },
          composeMail: (to, subject, body, headers) => {
            sendMessage({ type: "REQ_MAIL_COMPOSE" /* REQ_MAIL_COMPOSE */, to, subject, body, headers });
          },
          saveDraft: (to, subject, body, headers, existingDraftId) => {
            sendMessage({ type: "REQ_MAIL_SAVE_DRAFT" /* REQ_MAIL_SAVE_DRAFT */, to, subject, body, headers, existingDraftId });
          },
          deleteMailMessage: (folder, messageId) => {
            sendMessage({ type: "REQ_MAIL_DELETE" /* REQ_MAIL_DELETE */, folder, messageId });
          }
        });
      }
      if (sendMessage) {
        this.profilePanel = new ProfilePanel({
          sendMessage
        });
      }
      if (sendMessage) {
        this.politicsPanel = new PoliticsPanel({
          sendMessage
        });
      }
    }
    /**
     * Show the search menu
     */
    showSearchMenu() {
      if (this.searchMenuPanel) {
        this.searchMenuPanel.show();
      }
    }
    /**
     * Display a message in the console
     */
    log(source, message) {
      const line = document.createElement("div");
      line.textContent = `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] [${source}] ${message}`;
      this.uiConsole.appendChild(line);
      this.uiConsole.scrollTop = this.uiConsole.scrollHeight;
    }
    /**
     * Display a chat message
     */
    renderChatMessage(from, message, isSystem = false) {
      if (this.chatUI) {
        this.chatUI.renderMessage(from, message, isSystem);
      }
    }
    /**
     * Update map data
     */
    updateMapData(mapData) {
      if (this.mapNavigationUI) {
        const renderer = this.mapNavigationUI.getRenderer();
        if (renderer) {
          renderer.updateMapData(mapData);
        }
      }
    }
    initTycoonStats(username) {
      if (this.tycoonStatsUI) {
        this.tycoonStatsUI.init(username);
      }
    }
    /**
     * Update tycoon financial stats
     */
    updateTycoonStats(stats) {
      if (this.tycoonStatsUI) {
        this.tycoonStatsUI.updateStats(stats);
      }
    }
    /**
     * Show the building details panel with full property data
     */
    showBuildingDetailsPanel(details, onPropertyChange, onNavigateToBuilding, onUpgradeAction, onRefresh, onRename, onDelete, onActionButton, currentCompanyName, onSearchConnections) {
      if (this.buildingDetailsPanel) {
        this.buildingDetailsPanel.updateOptions({
          onPropertyChange,
          onNavigateToBuilding,
          onUpgradeAction,
          onRefresh,
          onRename,
          onDelete,
          onActionButton,
          onSearchConnections,
          currentCompanyName
        });
        this.buildingDetailsPanel.show(details);
      }
    }
    /**
     * Update the building details panel with new data
     */
    updateBuildingDetailsPanel(details) {
      if (this.buildingDetailsPanel) {
        this.buildingDetailsPanel.update(details);
      }
    }
    /**
     * Hide the building details panel
     */
    hideBuildingDetailsPanel() {
      if (this.buildingDetailsPanel) {
        this.buildingDetailsPanel.hide();
      }
    }
    /**
     * Check if building details panel is visible
     */
    isBuildingDetailsPanelVisible() {
      return this.buildingDetailsPanel?.isVisible() ?? false;
    }
    // ===========================================================================
    // MAIL PANEL METHODS
    // ===========================================================================
    /**
     * Show the mail panel
     */
    showMailPanel() {
      if (this.mailPanel) {
        this.mailPanel.show();
      }
    }
    /**
     * Handle mail responses and route to mail panel
     */
    handleMailResponse(msg) {
      if (!this.mailPanel) {
        console.error("[UIManager] mailPanel is null!");
        return;
      }
      this.mailPanel.handleResponse(msg);
    }
    // ===========================================================================
    // SEARCH MENU METHODS
    // ===========================================================================
    /**
     * Handle search menu responses and render appropriate page
     */
    handleSearchMenuResponse(msg) {
      if (!this.searchMenuPanel) {
        console.error("[UIManager] searchMenuPanel is null!");
        return;
      }
      switch (msg.type) {
        case "RESP_SEARCH_MENU_HOME" /* RESP_SEARCH_MENU_HOME */:
          this.searchMenuPanel.renderHomePage(msg);
          break;
        case "RESP_SEARCH_MENU_TOWNS" /* RESP_SEARCH_MENU_TOWNS */:
          this.searchMenuPanel.renderTownsPage(msg);
          break;
        case "RESP_SEARCH_MENU_TYCOON_PROFILE" /* RESP_SEARCH_MENU_TYCOON_PROFILE */:
          this.searchMenuPanel.renderTycoonProfile(msg);
          break;
        case "RESP_SEARCH_MENU_PEOPLE" /* RESP_SEARCH_MENU_PEOPLE */:
          break;
        case "RESP_SEARCH_MENU_PEOPLE_SEARCH" /* RESP_SEARCH_MENU_PEOPLE_SEARCH */:
          this.searchMenuPanel.renderPeopleSearchResults(msg);
          break;
        case "RESP_SEARCH_MENU_RANKINGS" /* RESP_SEARCH_MENU_RANKINGS */:
          this.searchMenuPanel.renderRankingsPage(msg);
          break;
        case "RESP_SEARCH_MENU_RANKING_DETAIL" /* RESP_SEARCH_MENU_RANKING_DETAIL */:
          this.searchMenuPanel.renderRankingDetail(msg);
          break;
        case "RESP_SEARCH_MENU_BANKS" /* RESP_SEARCH_MENU_BANKS */:
          this.searchMenuPanel.renderBanksPage(msg);
          break;
      }
    }
    /**
     * Show an error in the search menu panel (for fire-and-forget error responses)
     */
    handleSearchMenuError(errorMessage) {
      if (this.searchMenuPanel) {
        this.searchMenuPanel.showError(errorMessage);
      }
    }
    // ===========================================================================
    // PROFILE PANEL METHODS
    // ===========================================================================
    /**
     * Show the profile panel (optionally opening a specific tab)
     */
    showProfilePanel(tab) {
      if (this.profilePanel) {
        this.profilePanel.show(tab);
      }
    }
    /**
     * Handle profile tab responses and route to profile panel
     */
    handleProfileResponse(msg) {
      if (!this.profilePanel) {
        console.error("[UIManager] profilePanel is null!");
        return;
      }
      this.profilePanel.handleResponse(msg);
    }
    // ===========================================================================
    // POLITICS PANEL METHODS
    // ===========================================================================
    showPoliticsPanel(townName, buildingX, buildingY) {
      if (this.politicsPanel) {
        this.politicsPanel.show(townName, buildingX, buildingY);
      }
    }
    handlePoliticsResponse(msg) {
      if (this.politicsPanel) {
        this.politicsPanel.handleResponse(msg);
      }
    }
  };

  // src/client/client.ts
  var StarpeaceClient = class {
    constructor() {
      this.ws = null;
      this.isConnected = false;
      this.pendingRequests = /* @__PURE__ */ new Map();
      // Session state
      this.storedUsername = "";
      this.storedPassword = "";
      this.availableCompanies = [];
      this.currentCompanyName = "";
      this.currentWorldName = "";
      this.worldXSize = null;
      this.worldYSize = null;
      this.worldSeason = null;
      // Building focus state
      this.currentFocusedBuilding = null;
      this.currentFocusedVisualClass = null;
      // Building construction state
      this.buildingCategories = [];
      this.currentBuildingToPlace = null;
      // Double-click prevention flags
      this.isFocusingBuilding = false;
      this.isSendingChatMessage = false;
      this.isJoiningChannel = false;
      this.isSelectingCompany = false;
      // Clone facility state
      this.isCloneMode = false;
      this.cloneSourceBuilding = null;
      // Connection picker dialog state
      this.connectionPickerDialog = null;
      // Road building state
      this.isRoadBuildingMode = false;
      this.isBuildingRoad = false;
      // Logout state
      this.isLoggingOut = false;
      this.currentTycoonData = null;
      this.uiGamePanel = document.getElementById("game-panel");
      this.uiStatus = document.getElementById("status-indicator");
      this.ui = new UIManager();
      this.setupUICallbacks();
      this.init();
    }
    /**
     * Configure les callbacks des composants UI
     */
    setupUICallbacks() {
      this.ui.loginUI.setOnDirectoryConnect((username, password, zonePath) => {
        this.performDirectoryLogin(username, password, zonePath);
      });
      this.ui.loginUI.setOnWorldSelect((worldName) => {
        this.login(worldName);
      });
      this.ui.loginUI.setOnCompanySelect((companyId) => {
        this.selectCompanyAndStart(companyId);
      });
    }
    /**
     * Configure les callbacks des composants Game UI
     */
    setupGameUICallbacks() {
      if (this.ui.chatUI) {
        this.ui.chatUI.setOnSendMessage((message) => {
          this.sendChatMessage(message);
        });
        this.ui.chatUI.setOnJoinChannel((channel) => {
          this.joinChannel(channel);
        });
        this.ui.chatUI.setOnGetUsers(() => {
          this.requestUserList();
        });
        this.ui.chatUI.setOnGetChannels(() => {
          this.requestChannelList();
        });
        this.ui.chatUI.setOnTypingStatus((isTyping) => {
          this.sendTypingStatus(isTyping);
        });
      }
      if (this.ui.mapNavigationUI) {
        this.ui.mapNavigationUI.setOnLoadZone((x, y, w, h) => {
          this.ui.log("Map", `Requesting zone (${x}, ${y}) ${w}x${h}`);
          this.loadMapArea(x, y, w, h);
        });
        this.ui.mapNavigationUI.setOnBuildingClick((x, y, visualClass) => {
          this.handleMapClick(x, y, visualClass);
        });
        this.ui.mapNavigationUI.setOnFetchFacilityDimensions(async (visualClass) => {
          return await this.getFacilityDimensions(visualClass);
        });
      }
      if (this.ui.toolbarUI) {
        this.ui.toolbarUI.setOnBuildMenu(() => {
          this.openBuildMenu();
        });
        this.ui.toolbarUI.setOnBuildRoad(() => {
          this.toggleRoadBuildingMode();
        });
        this.ui.toolbarUI.setOnSearch(() => {
          this.ui.showSearchMenu();
        });
        this.ui.toolbarUI.setOnCompanyMenu(() => {
          this.ui.showProfilePanel("companies");
        });
        this.ui.toolbarUI.setOnMail(() => {
          this.ui.showMailPanel();
        });
        this.ui.toolbarUI.setOnLogout(() => {
          this.logout();
        });
        this.ui.toolbarUI.setOnRefresh(() => {
          this.refreshMapData();
        });
      }
      if (this.ui.buildMenuUI) {
        this.ui.buildMenuUI.setOnCategorySelected((category) => {
          this.loadBuildingFacilities(category);
        });
        this.ui.buildMenuUI.setOnBuildingSelected((building) => {
          this.startBuildingPlacement(building);
        });
        this.ui.buildMenuUI.setOnClose(() => {
          this.cancelBuildingPlacement();
        });
      }
      if (this.ui.zoneOverlayUI) {
        this.ui.zoneOverlayUI.setOnToggle((enabled, type) => {
          this.toggleZoneOverlay(enabled, type);
        });
      }
    }
    init() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws`;
      this.ui.log("System", `Connecting to Gateway at ${url}...`);
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.isConnected = true;
        this.uiStatus.textContent = "\u25CF Online";
        this.uiStatus.style.color = "#0f0";
        this.ui.log("System", "Gateway Connected.");
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (e) {
          console.error("Failed to parse WS message", e);
        }
      };
      this.ws.onclose = () => {
        this.isConnected = false;
        this.uiStatus.textContent = "\u25CF Offline";
        this.uiStatus.style.color = "#f00";
        this.ui.log("System", "Gateway Disconnected.");
      };
      window.addEventListener("beforeunload", () => {
        this.sendLogoutBeacon();
      });
    }
    sendRequest(msg) {
      return new Promise((resolve, reject) => {
        if (!this.ws || !this.isConnected) return reject(new Error("WebSocket not connected"));
        const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        msg.wsRequestId = requestId;
        this.pendingRequests.set(requestId, { resolve, reject });
        this.ws.send(JSON.stringify(msg));
        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            reject(new Error("Request Timeout"));
          }
        }, 15e3);
      });
    }
    /**
     * Send message without Promise (for event-based responses like search menu)
     */
    sendMessage(msg) {
      if (!this.ws || !this.isConnected) {
        console.error("[Client] Cannot send message: WebSocket not connected");
        return;
      }
      this.ws.send(JSON.stringify(msg));
    }
    handleMessage(msg) {
      if (msg.wsRequestId && this.pendingRequests.has(msg.wsRequestId)) {
        const { resolve, reject } = this.pendingRequests.get(msg.wsRequestId);
        this.pendingRequests.delete(msg.wsRequestId);
        if (msg.type === "RESP_ERROR" /* RESP_ERROR */) {
          const errorResp = msg;
          const localizedMessage = getErrorMessage(errorResp.code);
          reject(new Error(localizedMessage));
        } else {
          resolve(msg);
        }
        return;
      }
      switch (msg.type) {
        case "EVENT_CHAT_MSG" /* EVENT_CHAT_MSG */:
          const chat = msg;
          const isSystem = chat.from === "SYSTEM";
          this.ui.renderChatMessage(chat.from, chat.message, isSystem);
          this.ui.log("Chat", `[${chat.channel}] ${chat.from}: ${chat.message}`);
          break;
        case "EVENT_CHAT_USER_TYPING" /* EVENT_CHAT_USER_TYPING */:
          const typing = msg;
          if (this.ui.chatUI) {
            this.ui.chatUI.updateUserTypingStatus(typing.username, typing.isTyping);
          }
          break;
        case "EVENT_CHAT_CHANNEL_CHANGE" /* EVENT_CHAT_CHANNEL_CHANGE */:
          const channelChange = msg;
          if (this.ui.chatUI) {
            this.ui.chatUI.setCurrentChannel(channelChange.channelName);
          }
          this.requestUserList();
          break;
        case "EVENT_CHAT_USER_LIST_CHANGE" /* EVENT_CHAT_USER_LIST_CHANGE */:
          const userChange = msg;
          break;
        case "EVENT_MAP_DATA" /* EVENT_MAP_DATA */:
        case "RESP_MAP_DATA" /* RESP_MAP_DATA */:
          const mapMsg = msg;
          this.ui.log("Map", `Received area (${mapMsg.data.x}, ${mapMsg.data.y}): ${mapMsg.data.buildings.length} buildings, ${mapMsg.data.segments.length} segments`);
          this.ui.updateMapData(mapMsg.data);
          break;
        case "EVENT_BUILDING_REFRESH" /* EVENT_BUILDING_REFRESH */: {
          const refreshEvt = msg;
          if (this.currentFocusedBuilding && this.currentFocusedBuilding.buildingId === refreshEvt.building.buildingId) {
            this.requestBuildingDetails(
              this.currentFocusedBuilding.x,
              this.currentFocusedBuilding.y,
              this.currentFocusedVisualClass || "0"
            ).then((refreshedDetails) => {
              if (refreshedDetails) {
                this.ui.updateBuildingDetailsPanel(refreshedDetails);
              }
            }).catch((err) => {
              this.ui.log("Error", `Failed to refresh building: ${toErrorMessage(err)}`);
            });
          }
          break;
        }
        case "EVENT_TYCOON_UPDATE" /* EVENT_TYCOON_UPDATE */:
          const tycoonUpdate = msg;
          this.currentTycoonData = {
            cash: tycoonUpdate.cash,
            incomePerHour: tycoonUpdate.incomePerHour,
            ranking: tycoonUpdate.ranking,
            buildingCount: tycoonUpdate.buildingCount,
            maxBuildings: tycoonUpdate.maxBuildings
          };
          this.ui.log("Tycoon", `Cash: ${tycoonUpdate.cash} | Income/h: ${tycoonUpdate.incomePerHour} | Rank: ${tycoonUpdate.ranking} | Buildings: ${tycoonUpdate.buildingCount}/${tycoonUpdate.maxBuildings}`);
          this.ui.updateTycoonStats({
            username: this.storedUsername,
            ...this.currentTycoonData
          });
          break;
        case "EVENT_RDO_PUSH" /* EVENT_RDO_PUSH */:
          const pushData = msg.rawPacket || msg;
          this.ui.log("Push", `Received: ${JSON.stringify(pushData).substring(0, 100)}...`);
          break;
        // Mail Events
        case "EVENT_NEW_MAIL" /* EVENT_NEW_MAIL */: {
          const newMail = msg;
          this.ui.log("Mail", `New mail! ${newMail.unreadCount} unread message(s)`);
          if (this.ui.toolbarUI) {
            this.ui.toolbarUI.setMailBadge(newMail.unreadCount);
          }
          if (this.ui.mailPanel) {
            this.ui.mailPanel.setUnreadCount(newMail.unreadCount);
          }
          break;
        }
        // Mail Responses (delegated to mail panel)
        case "RESP_MAIL_CONNECTED" /* RESP_MAIL_CONNECTED */: {
          const mailConn = msg;
          this.ui.log("Mail", `Mail service connected. ${mailConn.unreadCount} unread.`);
          if (this.ui.toolbarUI) {
            this.ui.toolbarUI.setMailBadge(mailConn.unreadCount);
          }
          break;
        }
        case "RESP_MAIL_FOLDER" /* RESP_MAIL_FOLDER */:
        case "RESP_MAIL_MESSAGE" /* RESP_MAIL_MESSAGE */:
        case "RESP_MAIL_SENT" /* RESP_MAIL_SENT */:
        case "RESP_MAIL_DELETED" /* RESP_MAIL_DELETED */:
        case "RESP_MAIL_UNREAD_COUNT" /* RESP_MAIL_UNREAD_COUNT */:
        case "RESP_MAIL_DRAFT_SAVED" /* RESP_MAIL_DRAFT_SAVED */:
          this.ui.handleMailResponse(msg);
          break;
        // Search Menu Responses
        case "RESP_SEARCH_MENU_HOME" /* RESP_SEARCH_MENU_HOME */:
        case "RESP_SEARCH_MENU_TOWNS" /* RESP_SEARCH_MENU_TOWNS */:
        case "RESP_SEARCH_MENU_TYCOON_PROFILE" /* RESP_SEARCH_MENU_TYCOON_PROFILE */:
        case "RESP_SEARCH_MENU_PEOPLE" /* RESP_SEARCH_MENU_PEOPLE */:
        case "RESP_SEARCH_MENU_PEOPLE_SEARCH" /* RESP_SEARCH_MENU_PEOPLE_SEARCH */:
        case "RESP_SEARCH_MENU_RANKINGS" /* RESP_SEARCH_MENU_RANKINGS */:
        case "RESP_SEARCH_MENU_RANKING_DETAIL" /* RESP_SEARCH_MENU_RANKING_DETAIL */:
        case "RESP_SEARCH_MENU_BANKS" /* RESP_SEARCH_MENU_BANKS */:
          this.ui.handleSearchMenuResponse(msg);
          break;
        // Profile Tab Responses (delegated to profile panel)
        case "RESP_PROFILE_CURRICULUM" /* RESP_PROFILE_CURRICULUM */:
        case "RESP_PROFILE_BANK" /* RESP_PROFILE_BANK */:
        case "RESP_PROFILE_BANK_ACTION" /* RESP_PROFILE_BANK_ACTION */:
        case "RESP_PROFILE_PROFITLOSS" /* RESP_PROFILE_PROFITLOSS */:
        case "RESP_PROFILE_COMPANIES" /* RESP_PROFILE_COMPANIES */:
        case "RESP_PROFILE_AUTOCONNECTIONS" /* RESP_PROFILE_AUTOCONNECTIONS */:
        case "RESP_PROFILE_AUTOCONNECTION_ACTION" /* RESP_PROFILE_AUTOCONNECTION_ACTION */:
        case "RESP_PROFILE_POLICY" /* RESP_PROFILE_POLICY */:
        case "RESP_PROFILE_POLICY_SET" /* RESP_PROFILE_POLICY_SET */:
          this.ui.handleProfileResponse(msg);
          break;
        // Politics Response
        case "RESP_POLITICS_DATA" /* RESP_POLITICS_DATA */:
          this.ui.handlePoliticsResponse(msg);
          break;
        // Connection Search Response
        case "RESP_SEARCH_CONNECTIONS" /* RESP_SEARCH_CONNECTIONS */: {
          const searchResp = msg;
          if (this.connectionPickerDialog) {
            this.connectionPickerDialog.updateResults(searchResp.results);
          }
          break;
        }
        // Profile Response
        case "RESP_GET_PROFILE" /* RESP_GET_PROFILE */: {
          const profile = msg.profile;
          this.ui.log("Profile", `Profile loaded: ${profile.name} (${profile.levelName})`);
          const baseStats = this.currentTycoonData ?? {
            cash: profile.budget,
            incomePerHour: "0",
            ranking: profile.ranking,
            buildingCount: profile.facCount,
            maxBuildings: profile.facMax
          };
          this.ui.updateTycoonStats({
            username: this.storedUsername,
            ...baseStats,
            prestige: profile.prestige,
            levelName: profile.levelName,
            levelTier: profile.levelTier,
            area: profile.area
          });
          if (this.ui.profilePanel) {
            this.ui.profilePanel.setTycoonInfo(profile.name, profile.ranking, this.currentWorldName);
          }
          break;
        }
        // Error responses without wsRequestId (from fire-and-forget messages like search menu)
        case "RESP_ERROR" /* RESP_ERROR */: {
          const errorResp = msg;
          this.ui.log("Error", errorResp.errorMessage || "Unknown error");
          if (this.ui.searchMenuPanel) {
            this.ui.handleSearchMenuError(errorResp.errorMessage || "Request failed");
          }
          break;
        }
      }
    }
    // --- Actions ---
    async performDirectoryLogin(username, password, zonePath) {
      this.storedUsername = username;
      this.storedPassword = password;
      const zoneDisplay = zonePath?.split("/").pop() || "BETA";
      this.ui.log("Directory", `Authenticating for ${zoneDisplay}...`);
      try {
        const req = {
          type: "REQ_CONNECT_DIRECTORY" /* REQ_CONNECT_DIRECTORY */,
          username,
          password,
          zonePath
        };
        const resp = await this.sendRequest(req);
        this.ui.log("Directory", `Authentication Success. Found ${resp.worlds.length} world(s) in ${zoneDisplay}.`);
        this.ui.loginUI.renderWorldList(resp.worlds);
        this.ui.loginUI.hideConnectButton();
      } catch (err) {
        this.ui.log("Error", `Directory Auth Failed: ${toErrorMessage(err)}`);
        alert("Login Failed: " + toErrorMessage(err));
      }
    }
    async login(worldName) {
      if (!this.storedUsername || !this.storedPassword) {
        alert("Session lost, please reconnect");
        return;
      }
      this.ui.log("Login", `Joining world ${worldName}...`);
      this.ui.loginUI.showWorldListLoading(`Connecting to ${worldName}...`);
      this.currentWorldName = worldName;
      try {
        const req = {
          type: "REQ_LOGIN_WORLD" /* REQ_LOGIN_WORLD */,
          username: this.storedUsername,
          password: this.storedPassword,
          worldName
        };
        const resp = await this.sendRequest(req);
        this.ui.log("Login", `Success! Tycoon: ${resp.tycoonId}`);
        if (resp.worldXSize !== void 0) this.worldXSize = resp.worldXSize;
        if (resp.worldYSize !== void 0) this.worldYSize = resp.worldYSize;
        if (resp.worldSeason !== void 0) this.worldSeason = resp.worldSeason;
        if (resp.companies && resp.companies.length > 0) {
          this.availableCompanies = resp.companies;
          this.ui.log("Login", `Found ${resp.companies.length} compan${resp.companies.length > 1 ? "ies" : "y"}`);
          this.ui.loginUI.showCompanyListLoading("Loading companies...");
          setTimeout(() => {
            this.ui.loginUI.renderCompanySelection(resp.companies || []);
          }, 300);
        } else {
          this.ui.log("Error", "No companies found - cannot proceed");
          this.showNotification("No companies available for this account", "error");
        }
      } catch (err) {
        this.ui.log("Error", `Login failed: ${toErrorMessage(err)}`);
        this.ui.loginUI.showWorldListLoading("Connection failed. Please try again.");
        this.showNotification(`World login failed: ${toErrorMessage(err)}`, "error");
      }
    }
    async selectCompanyAndStart(companyId) {
      if (this.isSelectingCompany) {
        return;
      }
      this.isSelectingCompany = true;
      this.ui.log("Company", `Selecting company ID: ${companyId}...`);
      this.ui.loginUI.showCompanyListLoading("Loading world...");
      try {
        const company = this.availableCompanies.find((c) => c.id === companyId);
        if (!company) {
          throw new Error("Company not found");
        }
        const needsSwitch = company.ownerRole && company.ownerRole !== this.storedUsername;
        if (needsSwitch) {
          this.ui.log("Company", `Switching to role-based company: ${company.name} (${company.ownerRole})...`);
          const req = {
            type: "REQ_SWITCH_COMPANY" /* REQ_SWITCH_COMPANY */,
            company
          };
          await this.sendRequest(req);
          this.ui.log("Company", "Company switch successful");
        } else {
          const req = {
            type: "REQ_SELECT_COMPANY" /* REQ_SELECT_COMPANY */,
            companyId
          };
          await this.sendRequest(req);
          this.ui.log("Company", "Company selected successfully");
        }
        this.currentCompanyName = company.name;
        await this.preloadFacilityDimensions();
        this.switchToGameView();
        if (this.worldSeason !== null) {
          const renderer = this.ui.mapNavigationUI?.getRenderer();
          if (renderer) {
            renderer.setSeason(this.worldSeason);
          }
        }
        this.connectMailService().catch((err) => {
          this.ui.log("Mail", `Mail service connection failed: ${toErrorMessage(err)}`);
        });
        this.getProfile().catch((err) => {
          this.ui.log("Profile", `Profile fetch failed: ${toErrorMessage(err)}`);
        });
      } catch (err) {
        this.ui.log("Error", `Company selection failed: ${toErrorMessage(err)}`);
        this.ui.loginUI.showCompanyListLoading("Failed to load world. Please try again.");
        this.showNotification(`Company selection failed: ${toErrorMessage(err)}`, "error");
      } finally {
        this.isSelectingCompany = false;
      }
    }
    loadMapArea(x, y, w = 64, h = 64) {
      const coords = x !== void 0 && y !== void 0 ? ` at (${x}, ${y})` : " at player position";
      this.ui.log("Map", `Loading area${coords} ${w}x${h}...`);
      const req = {
        type: "REQ_MAP_LOAD" /* REQ_MAP_LOAD */,
        x: x !== void 0 ? x : 0,
        y: y !== void 0 ? y : 0,
        width: w,
        height: h
      };
      this.ws?.send(JSON.stringify(req));
    }
    switchToGameView() {
      this.ui.loginUI.hide();
      this.uiGamePanel.style.display = "flex";
      this.uiGamePanel.style.flexDirection = "column";
      this.ui.initGameUI(this.uiGamePanel, (msg) => this.sendMessage(msg));
      this.setupGameUICallbacks();
      this.ui.initTycoonStats(this.storedUsername);
      if (this.ui.profilePanel) {
        this.ui.profilePanel.setOnSwitchCompany((companyName, _companyId) => {
          const company = this.availableCompanies.find((c) => c.name === companyName);
          if (company) {
            this.ui.log("Profile", `Switching to company: ${companyName}`);
            this.selectCompanyAndStart(company.id);
          }
        });
      }
      this.ui.log("Renderer", "Game view initialized");
    }
    // --- Chat Functions ---
    async sendChatMessage(message) {
      if (this.isSendingChatMessage) {
        return;
      }
      this.isSendingChatMessage = true;
      try {
        const req = {
          type: "REQ_CHAT_SEND_MESSAGE" /* REQ_CHAT_SEND_MESSAGE */,
          message
        };
        await this.sendRequest(req);
      } catch (err) {
        this.ui.log("Error", `Failed to send message: ${toErrorMessage(err)}`);
      } finally {
        this.isSendingChatMessage = false;
      }
    }
    sendTypingStatus(isTyping) {
      const req = {
        type: "REQ_CHAT_TYPING_STATUS" /* REQ_CHAT_TYPING_STATUS */,
        isTyping
      };
      this.ws?.send(JSON.stringify(req));
    }
    async requestUserList() {
      try {
        const req = {
          type: "REQ_CHAT_GET_USERS" /* REQ_CHAT_GET_USERS */
        };
        const resp = await this.sendRequest(req);
        if (this.ui.chatUI) {
          this.ui.chatUI.updateUserList(resp.users);
        }
      } catch (err) {
        this.ui.log("Error", `Failed to get user list: ${toErrorMessage(err)}`);
      }
    }
    async requestChannelList() {
      try {
        const req = {
          type: "REQ_CHAT_GET_CHANNELS" /* REQ_CHAT_GET_CHANNELS */
        };
        const resp = await this.sendRequest(req);
        if (this.ui.chatUI) {
          this.ui.chatUI.updateChannelList(resp.channels);
        }
      } catch (err) {
        this.ui.log("Error", `Failed to get channel list: ${toErrorMessage(err)}`);
      }
    }
    async joinChannel(channelName) {
      if (this.isJoiningChannel) {
        return;
      }
      this.isJoiningChannel = true;
      try {
        this.ui.log("Chat", `Joining channel: ${channelName || "Lobby"}`);
        const req = {
          type: "REQ_CHAT_JOIN_CHANNEL" /* REQ_CHAT_JOIN_CHANNEL */,
          channelName
        };
        await this.sendRequest(req);
        if (this.ui.chatUI) {
          this.ui.chatUI.clearMessages();
          this.ui.chatUI.hideChannelList();
        }
      } catch (err) {
        this.ui.log("Error", `Failed to join channel: ${toErrorMessage(err)}`);
      } finally {
        this.isJoiningChannel = false;
      }
    }
    // --- Building Focus Functions ---
    /**
     * Handle map clicks - delegates to placement or focus based on mode
     */
    handleMapClick(x, y, visualClass) {
      if (this.currentBuildingToPlace) {
        this.placeBuilding(x, y);
      } else if (this.isCloneMode) {
        this.executeCloneFacility(x, y);
      } else {
        this.focusBuilding(x, y, visualClass);
      }
    }
    async focusBuilding(x, y, visualClass) {
      if (this.isFocusingBuilding) {
        return;
      }
      this.isFocusingBuilding = true;
      this.ui.log("Building", `Requesting focus at (${x}, ${y})`);
      try {
        if (this.currentFocusedBuilding) {
          await this.unfocusBuilding();
        }
        const req = {
          type: "REQ_BUILDING_FOCUS" /* REQ_BUILDING_FOCUS */,
          x,
          y
        };
        const response = await this.sendRequest(req);
        this.currentFocusedBuilding = response.building;
        this.currentFocusedVisualClass = visualClass || null;
        const details = await this.requestBuildingDetails(x, y, visualClass || "0");
        if (details) {
          this.ui.showBuildingDetailsPanel(
            details,
            async (propertyName, value, additionalParams) => {
              await this.setBuildingProperty(x, y, propertyName, value, additionalParams);
            },
            (targetX, targetY) => {
              this.focusBuilding(targetX, targetY);
            },
            async (action, count) => {
              await this.upgradeBuildingAction(x, y, action, count);
            },
            async () => {
              const refreshedDetails = await this.requestBuildingDetails(x, y, visualClass || "0");
              if (refreshedDetails) {
                this.ui.updateBuildingDetailsPanel(refreshedDetails);
              }
            },
            async (newName) => {
              await this.renameFacility(x, y, newName);
            },
            async () => {
              await this.deleteFacility(x, y);
            },
            (actionId, buildingDetails) => {
              this.handleBuildingAction(actionId, buildingDetails);
            },
            this.currentCompanyName,
            (fluidId, fluidName, direction) => {
              this.openConnectionPicker(x, y, fluidId, fluidName, direction);
            }
          );
        } else {
          const fallbackDetails = {
            buildingId: response.building.buildingId || "",
            buildingName: response.building.buildingName || "Building",
            ownerName: response.building.ownerName || "Unknown",
            x,
            y,
            visualClass: visualClass || "0",
            templateName: "Building",
            securityId: "",
            groups: {
              generic: [
                { name: "Name", value: response.building.buildingName },
                { name: "Owner", value: response.building.ownerName },
                { name: "Revenue", value: response.building.revenue }
              ]
            },
            timestamp: Date.now()
          };
          this.ui.showBuildingDetailsPanel(
            fallbackDetails,
            async (propertyName, value, additionalParams) => {
              await this.setBuildingProperty(x, y, propertyName, value, additionalParams);
            },
            (targetX, targetY) => {
              this.focusBuilding(targetX, targetY);
            },
            async (action, count) => {
              await this.upgradeBuildingAction(x, y, action, count);
            },
            async () => {
              const refreshedDetails = await this.requestBuildingDetails(x, y, visualClass || "0");
              if (refreshedDetails) {
                this.ui.updateBuildingDetailsPanel(refreshedDetails);
              }
            },
            async (newName) => {
              await this.renameFacility(x, y, newName);
            },
            async () => {
              await this.deleteFacility(x, y);
            },
            (actionId, buildingDetails) => {
              this.handleBuildingAction(actionId, buildingDetails);
            },
            this.currentCompanyName,
            (fluidId, fluidName, direction) => {
              this.openConnectionPicker(x, y, fluidId, fluidName, direction);
            }
          );
        }
        this.ui.log("Building", `Focused: ${response.building.buildingName}`);
      } catch (err) {
        this.ui.log("Error", `Failed to focus building: ${toErrorMessage(err)}`);
      } finally {
        this.isFocusingBuilding = false;
      }
    }
    async unfocusBuilding() {
      if (!this.currentFocusedBuilding) return;
      this.ui.log("Building", "Unfocusing building");
      try {
        const req = {
          type: "REQ_BUILDING_UNFOCUS" /* REQ_BUILDING_UNFOCUS */
        };
        this.ws?.send(JSON.stringify(req));
        this.ui.hideBuildingDetailsPanel();
        this.currentFocusedBuilding = null;
        this.currentFocusedVisualClass = null;
      } catch (err) {
        this.ui.log("Error", `Failed to unfocus building: ${toErrorMessage(err)}`);
      }
    }
    // =========================================================================
    // BUILDING DETAILS METHODS
    // =========================================================================
    /**
     * Request detailed building information
     */
    async requestBuildingDetails(x, y, visualClass) {
      this.ui.log("Building", `Requesting details at (${x}, ${y})`);
      try {
        const req = {
          type: "REQ_BUILDING_DETAILS" /* REQ_BUILDING_DETAILS */,
          x,
          y,
          visualClass
        };
        const response = await this.sendRequest(req);
        this.ui.log("Building", `Got details: ${response.details.templateName}`);
        return response.details;
      } catch (err) {
        this.ui.log("Error", `Failed to get building details: ${toErrorMessage(err)}`);
        return null;
      }
    }
    /**
     * Re-fetch building details and update the panel in-place
     */
    async refreshBuildingDetails(x, y) {
      const details = await this.requestBuildingDetails(x, y, "0");
      if (details) {
        this.ui.updateBuildingDetailsPanel(details);
      }
    }
    /**
     * Set a building property value for editable properties
     * propertyName is now the RDO command name (e.g., 'RDOSetPrice', 'RDOSetSalaries')
     */
    async setBuildingProperty(x, y, propertyName, value, additionalParams) {
      this.ui.log("Building", `Setting ${propertyName}=${value} at (${x}, ${y})`);
      try {
        const req = {
          type: "REQ_BUILDING_SET_PROPERTY" /* REQ_BUILDING_SET_PROPERTY */,
          x,
          y,
          propertyName,
          // This is now the RDO command name
          value,
          additionalParams
        };
        const response = await this.sendRequest(req);
        if (response.success) {
          this.ui.log("Building", `Property ${propertyName} updated to ${response.newValue}`);
          return true;
        } else {
          this.ui.log("Error", `Failed to set ${propertyName}`);
          return false;
        }
      } catch (err) {
        this.ui.log("Error", `Failed to set property: ${toErrorMessage(err)}`);
        return false;
      }
    }
    /**
     * Upgrade or downgrade a building
     */
    async upgradeBuildingAction(x, y, action, count) {
      const actionName = action === "DOWNGRADE" ? "Downgrading" : action === "START_UPGRADE" ? `Starting ${count} upgrade(s)` : "Stopping upgrade";
      this.ui.log("Building", `${actionName} at (${x}, ${y})`);
      try {
        const req = {
          type: "REQ_BUILDING_UPGRADE" /* REQ_BUILDING_UPGRADE */,
          x,
          y,
          action,
          count
        };
        const response = await this.sendRequest(req);
        if (response.success) {
          this.ui.log("Building", response.message || "Upgrade action completed");
          return true;
        } else {
          this.ui.log("Error", response.message || "Failed to perform upgrade action");
          return false;
        }
      } catch (err) {
        this.ui.log("Error", `Failed to perform upgrade action: ${toErrorMessage(err)}`);
        return false;
      }
    }
    /**
     * Rename a facility (building)
     */
    async renameFacility(x, y, newName) {
      this.ui.log("Building", `Renaming building at (${x}, ${y}) to "${newName}"`);
      try {
        const req = {
          type: "REQ_RENAME_FACILITY" /* REQ_RENAME_FACILITY */,
          x,
          y,
          newName
        };
        const response = await this.sendRequest(req);
        if (response.success) {
          this.ui.log("Building", `Building renamed to "${response.newName}"`);
          return true;
        } else {
          this.ui.log("Error", response.message || "Failed to rename building");
          return false;
        }
      } catch (err) {
        this.ui.log("Error", `Failed to rename building: ${toErrorMessage(err)}`);
        return false;
      }
    }
    /**
     * Delete a facility (building)
     */
    async deleteFacility(x, y) {
      this.ui.log("Building", `Deleting building at (${x}, ${y})`);
      try {
        const req = {
          type: "REQ_DELETE_FACILITY" /* REQ_DELETE_FACILITY */,
          x,
          y
        };
        const response = await this.sendRequest(req);
        if (response.success) {
          this.ui.log("Building", "Building deleted successfully");
          this.loadMapArea(x, y);
          return true;
        } else {
          this.ui.log("Error", response.message || "Failed to delete building");
          return false;
        }
      } catch (err) {
        this.ui.log("Error", `Failed to delete building: ${toErrorMessage(err)}`);
        return false;
      }
    }
    // =========================================================================
    // BUILDING ACTION BUTTON HANDLERS
    // =========================================================================
    handleBuildingAction(actionId, buildingDetails) {
      if (actionId === "visitPolitics") {
        const townName = buildingDetails.groups["townGeneral"]?.find((p) => p.name === "Town")?.value || "";
        this.ui.showPoliticsPanel(townName, buildingDetails.x, buildingDetails.y);
      } else if (actionId === "clone") {
        this.startCloneFacility(buildingDetails);
      } else if (actionId === "launchMovie") {
        this.launchMovie(buildingDetails);
      } else if (actionId === "cancelMovie") {
        this.cancelMovie(buildingDetails);
      } else if (actionId === "releaseMovie") {
        this.releaseMovie(buildingDetails);
      } else if (actionId === "vote") {
        this.voteForCandidate(buildingDetails);
      } else if (actionId === "banMinister") {
        this.banMinister(buildingDetails);
      } else if (actionId === "sitMinister") {
        this.sitMinister(buildingDetails);
      }
    }
    // =========================================================================
    // CLONE FACILITY
    // =========================================================================
    async startCloneFacility(buildingDetails) {
      this.isCloneMode = true;
      this.cloneSourceBuilding = buildingDetails;
      let xsize = 1;
      let ysize = 1;
      try {
        const dimensions = await this.getFacilityDimensions(buildingDetails.visualClass);
        if (dimensions) {
          xsize = dimensions.xsize;
          ysize = dimensions.ysize;
        }
      } catch (err) {
        console.error("Failed to fetch facility dimensions for clone:", err);
      }
      const renderer = this.ui.mapNavigationUI?.getRenderer();
      if (renderer) {
        renderer.setPlacementMode(true, `Clone: ${buildingDetails.buildingName}`, 0, 0, "", xsize, ysize);
      }
      this.setupCloneKeyboardHandler();
      this.showNotification(`Click on map to clone ${buildingDetails.buildingName}. Press ESC to cancel.`, "info");
    }
    setupCloneKeyboardHandler() {
      const handler = (e) => {
        if (e.key === "Escape" && this.isCloneMode) {
          this.cancelCloneMode();
          document.removeEventListener("keydown", handler);
        }
      };
      document.addEventListener("keydown", handler);
    }
    cancelCloneMode() {
      this.isCloneMode = false;
      this.cloneSourceBuilding = null;
      const renderer = this.ui.mapNavigationUI?.getRenderer();
      if (renderer) {
        renderer.setPlacementMode(false);
      }
    }
    async executeCloneFacility(targetX, targetY) {
      if (!this.cloneSourceBuilding) return;
      const source = this.cloneSourceBuilding;
      this.ui.log("Clone", `Cloning ${source.buildingName} to (${targetX}, ${targetY})...`);
      try {
        await this.setBuildingProperty(source.x, source.y, "CloneFacility", "0", {
          x: String(targetX),
          y: String(targetY),
          tycoonId: "0",
          limitToTown: "0",
          limitToCompany: "0"
        });
        this.showNotification(`${source.buildingName} cloned successfully!`, "success");
      } catch (err) {
        this.ui.log("Error", `Failed to clone facility: ${toErrorMessage(err)}`);
        this.showNotification("Failed to clone facility", "error");
      } finally {
        this.cancelCloneMode();
      }
    }
    // =========================================================================
    // FILM ACTIONS (Launch / Cancel / Release Movie)
    // =========================================================================
    async launchMovie(buildingDetails) {
      const filmName = prompt("Movie name:");
      if (!filmName) return;
      const budgetStr = prompt("Budget ($):", "1000000");
      if (!budgetStr) return;
      const monthsStr = prompt("Production months:", "12");
      if (!monthsStr) return;
      const filmsGroup = buildingDetails.groups["films"] || [];
      const autoRel = filmsGroup.find((p) => p.name === "AutoRel")?.value || "0";
      const autoProd = filmsGroup.find((p) => p.name === "AutoProd")?.value || "0";
      try {
        await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, "RDOLaunchMovie", "0", {
          filmName,
          budget: budgetStr,
          months: monthsStr,
          autoRel,
          autoProd
        });
        this.showNotification(`Launching movie: ${filmName}`, "success");
        this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
      } catch (err) {
        this.showNotification(`Failed to launch movie: ${toErrorMessage(err)}`, "error");
      }
    }
    async cancelMovie(buildingDetails) {
      if (!confirm("Cancel current movie production?")) return;
      try {
        await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, "RDOCancelMovie", "0");
        this.showNotification("Movie production cancelled", "success");
        this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
      } catch (err) {
        this.showNotification(`Failed to cancel movie: ${toErrorMessage(err)}`, "error");
      }
    }
    async releaseMovie(buildingDetails) {
      try {
        await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, "RDOReleaseMovie", "0");
        this.showNotification("Movie released!", "success");
        this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
      } catch (err) {
        this.showNotification(`Failed to release movie: ${toErrorMessage(err)}`, "error");
      }
    }
    // =========================================================================
    // VOTE FOR CANDIDATE
    // =========================================================================
    async voteForCandidate(buildingDetails) {
      const votesData = buildingDetails.groups["votes"];
      if (!votesData) {
        this.showNotification("No voting data available", "error");
        return;
      }
      const candidateNames = [];
      for (const prop of votesData) {
        if (prop.name.startsWith("Candidate") && !prop.name.includes("Count")) {
          const match = prop.name.match(/^Candidate(\d+)$/);
          if (match && prop.value) {
            candidateNames.push(prop.value);
          }
        }
      }
      if (candidateNames.length === 0) {
        this.showNotification("No candidates available", "error");
        return;
      }
      const candidateChoice = prompt(
        `Vote for a candidate:
${candidateNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Enter candidate number:`
      );
      if (!candidateChoice) return;
      const idx = parseInt(candidateChoice, 10) - 1;
      if (idx < 0 || idx >= candidateNames.length) {
        this.showNotification("Invalid candidate number", "error");
        return;
      }
      const candidateName = candidateNames[idx];
      this.ws?.send(JSON.stringify({
        type: "REQ_POLITICS_VOTE" /* REQ_POLITICS_VOTE */,
        buildingX: buildingDetails.x,
        buildingY: buildingDetails.y,
        candidateName
      }));
      this.showNotification(`Voted for ${candidateName}`, "success");
    }
    // =========================================================================
    // MINISTRY ACTIONS (Ban / Sit Minister)
    // =========================================================================
    async banMinister(buildingDetails) {
      const ministryIdStr = prompt("Ministry ID to depose minister from:");
      if (!ministryIdStr) return;
      try {
        await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, "RDOBanMinister", "0", {
          ministryId: ministryIdStr
        });
        this.showNotification("Minister deposed", "success");
        this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
      } catch (err) {
        this.showNotification(`Failed to depose minister: ${toErrorMessage(err)}`, "error");
      }
    }
    async sitMinister(buildingDetails) {
      const ministryIdStr = prompt("Ministry ID to appoint minister for:");
      if (!ministryIdStr) return;
      const ministerName = prompt("Minister name to appoint:");
      if (!ministerName) return;
      try {
        await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, "RDOSitMinister", "0", {
          ministryId: ministryIdStr,
          ministerName
        });
        this.showNotification(`${ministerName} appointed as minister`, "success");
        this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
      } catch (err) {
        this.showNotification(`Failed to appoint minister: ${toErrorMessage(err)}`, "error");
      }
    }
    // =========================================================================
    // CONNECTION PICKER (Find Suppliers / Find Clients)
    // =========================================================================
    openConnectionPicker(buildingX, buildingY, fluidId, fluidName, direction) {
      if (this.connectionPickerDialog) {
        this.connectionPickerDialog.close();
        this.connectionPickerDialog = null;
      }
      this.connectionPickerDialog = new ConnectionPickerDialog(
        document.body,
        {
          fluidName,
          fluidId,
          direction,
          buildingX,
          buildingY,
          onSearch: (searchFluidId, searchDirection, filters) => {
            this.searchConnections(buildingX, buildingY, searchFluidId, searchDirection, filters);
          },
          onConnect: async (connectFluidId, connectDirection, selectedCoords) => {
            await this.connectFacilities(buildingX, buildingY, connectFluidId, connectDirection, selectedCoords);
          },
          onClose: () => {
            this.connectionPickerDialog = null;
          }
        }
      );
    }
    searchConnections(buildingX, buildingY, fluidId, direction, filters) {
      const req = {
        type: "REQ_SEARCH_CONNECTIONS" /* REQ_SEARCH_CONNECTIONS */,
        buildingX,
        buildingY,
        fluidId,
        direction,
        filters
      };
      this.ws?.send(JSON.stringify(req));
    }
    async connectFacilities(buildingX, buildingY, fluidId, direction, selectedCoords) {
      if (selectedCoords.length === 0) return;
      const connectionList = selectedCoords.map((c) => `${c.x},${c.y}`).join(",");
      const rdoCommand = direction === "input" ? "RDOConnectInput" : "RDOConnectOutput";
      try {
        await this.setBuildingProperty(buildingX, buildingY, rdoCommand, "0", {
          fluidId,
          connectionList
        });
        this.showNotification(
          `Connected ${selectedCoords.length} ${direction === "input" ? "supplier" : "client"}${selectedCoords.length !== 1 ? "s" : ""}`,
          "success"
        );
        const visualClass = this.currentFocusedVisualClass || "0";
        const refreshedDetails = await this.requestBuildingDetails(buildingX, buildingY, visualClass);
        if (refreshedDetails) {
          this.ui.updateBuildingDetailsPanel(refreshedDetails);
        }
      } catch (err) {
        this.ui.log("Error", `Failed to connect: ${toErrorMessage(err)}`);
        this.showNotification("Failed to connect facilities", "error");
      }
    }
    // =========================================================================
    // ROAD BUILDING METHODS
    // =========================================================================
    /**
     * Toggle road building mode
     */
    toggleRoadBuildingMode() {
      this.isRoadBuildingMode = !this.isRoadBuildingMode;
      const renderer = this.ui.mapNavigationUI?.getRenderer();
      if (renderer) {
        renderer.setRoadDrawingMode(this.isRoadBuildingMode);
        if (this.isRoadBuildingMode) {
          if (this.currentBuildingToPlace) {
            this.cancelBuildingPlacement();
          }
          renderer.setRoadSegmentCompleteCallback((x1, y1, x2, y2) => {
            this.buildRoadSegment(x1, y1, x2, y2);
          });
          renderer.setCancelRoadDrawingCallback(() => {
            this.cancelRoadBuildingMode();
          });
          this.setupRoadBuildingKeyboardHandler();
          this.ui.log("Road", "Road building mode enabled. Click and drag to draw roads. Right-click or press ESC to cancel.");
        } else {
          this.ui.log("Road", "Road building mode disabled");
        }
      }
      if (this.ui.toolbarUI) {
        this.ui.toolbarUI.setRoadBuildingActive(this.isRoadBuildingMode);
      }
    }
    /**
     * Cancel road building mode
     */
    cancelRoadBuildingMode() {
      this.isRoadBuildingMode = false;
      const renderer = this.ui.mapNavigationUI?.getRenderer();
      if (renderer) {
        renderer.setRoadDrawingMode(false);
      }
      if (this.ui.toolbarUI) {
        this.ui.toolbarUI.setRoadBuildingActive(false);
      }
      this.ui.log("Road", "Road building mode cancelled");
    }
    /**
     * Build a road segment between two points
     */
    async buildRoadSegment(x1, y1, x2, y2) {
      if (this.isBuildingRoad) {
        return;
      }
      const renderer = this.ui.mapNavigationUI?.getRenderer();
      if (renderer) {
        const validation = renderer.validateRoadPath(x1, y1, x2, y2);
        if (!validation.valid) {
          this.ui.log("Road", `Cannot build road: ${validation.error}`);
          this.showNotification(validation.error || "Invalid road placement", "error");
          return;
        }
      }
      this.isBuildingRoad = true;
      this.ui.log("Road", `Building road from (${x1}, ${y1}) to (${x2}, ${y2})...`);
      try {
        const req = {
          type: "REQ_BUILD_ROAD" /* REQ_BUILD_ROAD */,
          x1,
          y1,
          x2,
          y2
        };
        const response = await this.sendRequest(req);
        if (response.success) {
          this.ui.log("Road", `Road built: ${response.tileCount} tiles, cost $${response.cost}`);
          this.loadMapArea(x1, y1);
        } else {
          this.ui.log("Error", response.message || "Failed to build road");
        }
      } catch (err) {
        this.ui.log("Error", `Failed to build road: ${toErrorMessage(err)}`);
      } finally {
        this.isBuildingRoad = false;
      }
    }
    /**
     * Check if road building mode is active
     */
    isRoadModeActive() {
      return this.isRoadBuildingMode;
    }
    // =========================================================================
    // BUILDING CONSTRUCTION METHODS
    // =========================================================================
    /**
     * Open the build menu and fetch building categories
     */
    async openBuildMenu() {
      if (!this.currentCompanyName) {
        this.ui.log("Error", "No company selected");
        return;
      }
      this.ui.log("Build", "Opening build menu...");
      try {
        const req = {
          type: "REQ_GET_BUILDING_CATEGORIES" /* REQ_GET_BUILDING_CATEGORIES */,
          companyName: this.currentCompanyName
        };
        const response = await this.sendRequest(req);
        this.buildingCategories = response.categories;
        if (this.ui.buildMenuUI) {
          this.ui.buildMenuUI.show(response.categories);
        }
        this.ui.log("Build", `Loaded ${response.categories.length} building categories`);
      } catch (err) {
        this.ui.log("Error", `Failed to load building categories: ${toErrorMessage(err)}`);
      }
    }
    /**
     * Load facilities for a specific category
     */
    async loadBuildingFacilities(category) {
      this.ui.log("Build", `Loading facilities for ${category.kindName}...`);
      try {
        const req = {
          type: "REQ_GET_BUILDING_FACILITIES" /* REQ_GET_BUILDING_FACILITIES */,
          companyName: this.currentCompanyName,
          cluster: category.cluster,
          kind: category.kind,
          kindName: category.kindName,
          folder: category.folder,
          tycoonLevel: category.tycoonLevel
        };
        const response = await this.sendRequest(req);
        if (this.ui.buildMenuUI) {
          this.ui.buildMenuUI.showFacilities(category, response.facilities);
        }
        this.ui.log("Build", `Loaded ${response.facilities.length} facilities`);
      } catch (err) {
        this.ui.log("Error", `Failed to load facilities: ${toErrorMessage(err)}`);
      }
    }
    /**
     * Preload all facility dimensions (called once on startup)
     */
    async preloadFacilityDimensions() {
      this.ui.log("Cache", "Preloading facility dimensions...");
      try {
        const req = {
          type: "REQ_GET_ALL_FACILITY_DIMENSIONS" /* REQ_GET_ALL_FACILITY_DIMENSIONS */
        };
        const response = await this.sendRequest(req);
        const cache = getFacilityDimensionsCache();
        cache.initialize(response.dimensions);
        this.ui.log("Cache", `Loaded ${cache.getSize()} facility dimensions`);
      } catch (err) {
        console.error("[Client] Failed to preload facility dimensions:", err);
        this.ui.log("Error", "Failed to load facility dimensions. Building placement may not work correctly.");
      }
    }
    /**
     * Get facility dimensions from local cache (instant lookup, no network request)
     */
    async getFacilityDimensions(visualClass) {
      const cache = getFacilityDimensionsCache();
      if (!cache.isInitialized()) {
        console.warn("[Client] Facility cache not initialized yet");
        return null;
      }
      return cache.getFacility(visualClass) || null;
    }
    /**
     * Start building placement mode
     */
    async startBuildingPlacement(building) {
      this.currentBuildingToPlace = building;
      this.ui.log("Build", `Placing ${building.name}. Click on map to build.`);
      let xsize = 1;
      let ysize = 1;
      try {
        const dimensions = await this.getFacilityDimensions(building.visualClassId);
        if (dimensions) {
          xsize = dimensions.xsize;
          ysize = dimensions.ysize;
        }
      } catch (err) {
        console.error("Failed to fetch facility dimensions:", err);
      }
      this.showNotification(`${building.name} placement mode - Click map to place, ESC to cancel`, "info");
      const renderer = this.ui.mapNavigationUI?.getRenderer();
      if (renderer) {
        renderer.setPlacementMode(
          true,
          building.name,
          building.cost,
          building.area,
          building.zoneRequirement,
          xsize,
          ysize
        );
      }
      const cancelRenderer = this.ui.mapNavigationUI?.getRenderer();
      if (cancelRenderer) {
        cancelRenderer.setCancelPlacementCallback(() => {
          this.cancelBuildingPlacement();
        });
      }
      this.setupPlacementKeyboardHandler();
    }
    /**
     * Setup keyboard handler for placement mode
     */
    setupPlacementKeyboardHandler() {
      const handler = (e) => {
        if (e.key === "Escape") {
          if (this.currentBuildingToPlace) {
            this.cancelBuildingPlacement();
            document.removeEventListener("keydown", handler);
          } else if (this.isRoadBuildingMode) {
            this.cancelRoadBuildingMode();
            document.removeEventListener("keydown", handler);
          }
        }
      };
      document.addEventListener("keydown", handler);
    }
    /**
     * Setup global ESC handler for road building mode
     * Called when entering road building mode
     */
    setupRoadBuildingKeyboardHandler() {
      const handler = (e) => {
        if (e.key === "Escape" && this.isRoadBuildingMode) {
          this.cancelRoadBuildingMode();
          document.removeEventListener("keydown", handler);
        }
      };
      document.addEventListener("keydown", handler);
    }
    /**
     * Place a building at coordinates
     */
    async placeBuilding(x, y) {
      if (!this.currentBuildingToPlace) return;
      const building = this.currentBuildingToPlace;
      this.ui.log("Build", `Placing ${building.name} at (${x}, ${y})...`);
      try {
        const req = {
          type: "REQ_PLACE_BUILDING" /* REQ_PLACE_BUILDING */,
          facilityClass: building.facilityClass,
          x,
          y
        };
        await this.sendRequest(req);
        this.ui.log("Build", `\u2713 Successfully placed ${building.name}!`);
        this.showNotification(`${building.name} built successfully!`, "success");
        this.loadMapArea(x, y);
        this.cancelBuildingPlacement();
      } catch (err) {
        const errorMsg = toErrorMessage(err);
        this.ui.log("Error", `\u2717 Failed to place ${building.name}: ${errorMsg}`);
        this.showNotification(`Failed to place building: ${errorMsg}`, "error");
      }
    }
    /**
     * Cancel building placement mode
     */
    cancelBuildingPlacement() {
      this.currentBuildingToPlace = null;
      const notification = document.getElementById("placement-notification");
      if (notification) {
        notification.remove();
      }
      const renderer = this.ui.mapNavigationUI?.getRenderer();
      if (renderer) {
        renderer.setPlacementMode(false);
      }
    }
    /**
     * Show a temporary notification to the user
     */
    showNotification(message, type = "info") {
      const notification = document.createElement("div");
      notification.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: ${type === "success" ? "#4ade80" : type === "error" ? "#ff6b6b" : "#4dabf7"};
      color: white;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      animation: slideDown 0.3s ease-out;
    `;
      notification.textContent = message;
      document.body.appendChild(notification);
      setTimeout(() => {
        notification.style.animation = "slideUp 0.3s ease-out";
        setTimeout(() => notification.remove(), 300);
      }, 3e3);
    }
    /**
     * Toggle zone overlay
     */
    async toggleZoneOverlay(enabled, type) {
      this.ui.log("Zones", enabled ? `Enabling ${type} overlay` : "Disabling overlay");
      const renderer = this.ui.mapNavigationUI?.getRenderer();
      if (!renderer) return;
      if (!enabled) {
        renderer.setZoneOverlay(false);
        return;
      }
      try {
        const cameraPos = renderer.getCameraPosition();
        const cameraX = Math.floor(cameraPos.x);
        const cameraY = Math.floor(cameraPos.y);
        const x1 = cameraX - 32;
        const y1 = cameraY - 32;
        const x2 = cameraX + 32;
        const y2 = cameraY + 32;
        const req = {
          type: "REQ_GET_SURFACE" /* REQ_GET_SURFACE */,
          surfaceType: type,
          x1,
          y1,
          x2,
          y2
        };
        const response = await this.sendRequest(req);
        renderer.setZoneOverlay(true, response.data, x1, y1);
        this.ui.log("Zones", `Loaded ${type} overlay data`);
      } catch (err) {
        this.ui.log("Error", `Failed to load zone overlay: ${toErrorMessage(err)}`);
        renderer.setZoneOverlay(false);
        if (this.ui.zoneOverlayUI) {
          this.ui.zoneOverlayUI.setEnabled(false);
        }
      }
    }
    // =========================================================================
    // MAP REFRESH METHODS
    // =========================================================================
    /**
     * Refresh map data - re-request segments and objects in area
     * Called when user clicks the refresh button
     */
    refreshMapData() {
      this.ui.log("Map", "Refreshing map data...");
      const renderer = this.ui.mapNavigationUI?.getRenderer();
      if (!renderer || !renderer.getCameraPosition) {
        this.ui.log("Error", "Cannot refresh: renderer not available");
        return;
      }
      const cameraPos = renderer.getCameraPosition();
      const x = Math.floor(cameraPos.x);
      const y = Math.floor(cameraPos.y);
      renderer.invalidateArea(x - 64, y - 64, x + 64, y + 64);
      renderer.triggerZoneCheck();
      this.showNotification("Map refreshed", "info");
    }
    // =========================================================================
    // LOGOUT METHODS
    // =========================================================================
    /**
     * Logout from the game - sends Logoff to server
     * Called when user clicks logout button
     */
    // =========================================================================
    // MAIL SERVICE
    // =========================================================================
    async connectMailService() {
      const req = { type: "REQ_MAIL_CONNECT" /* REQ_MAIL_CONNECT */ };
      this.sendMessage(req);
    }
    async getMailFolder(folder) {
      const req = { type: "REQ_MAIL_GET_FOLDER" /* REQ_MAIL_GET_FOLDER */, folder };
      this.sendMessage(req);
    }
    async readMailMessage(folder, messageId) {
      const req = { type: "REQ_MAIL_READ_MESSAGE" /* REQ_MAIL_READ_MESSAGE */, folder, messageId };
      this.sendMessage(req);
    }
    async composeMail(to, subject, body, headers) {
      const req = { type: "REQ_MAIL_COMPOSE" /* REQ_MAIL_COMPOSE */, to, subject, body, headers };
      this.sendMessage(req);
    }
    async saveDraft(to, subject, body, headers, existingDraftId) {
      const req = { type: "REQ_MAIL_SAVE_DRAFT" /* REQ_MAIL_SAVE_DRAFT */, to, subject, body, headers, existingDraftId };
      this.sendMessage(req);
    }
    async deleteMailMessage(folder, messageId) {
      const req = { type: "REQ_MAIL_DELETE" /* REQ_MAIL_DELETE */, folder, messageId };
      this.sendMessage(req);
    }
    async getMailUnreadCount() {
      const req = { type: "REQ_MAIL_GET_UNREAD_COUNT" /* REQ_MAIL_GET_UNREAD_COUNT */ };
      this.sendMessage(req);
    }
    // =========================================================================
    // PROFILE
    // =========================================================================
    async getProfile() {
      const req = { type: "REQ_GET_PROFILE" /* REQ_GET_PROFILE */ };
      this.sendMessage(req);
    }
    async logout() {
      if (this.isLoggingOut) {
        return;
      }
      this.isLoggingOut = true;
      this.ui.log("System", "Logging out...");
      try {
        const req = {
          type: "REQ_LOGOUT" /* REQ_LOGOUT */
        };
        const response = await this.sendRequest(req);
        if (response.success) {
          this.ui.log("System", "Logged out successfully");
        } else {
          this.ui.log("Error", response.message || "Logout failed");
        }
      } catch (err) {
        this.ui.log("Error", `Logout error: ${toErrorMessage(err)}`);
        this.ws?.close();
      } finally {
        this.isLoggingOut = false;
      }
    }
    /**
     * Send logout request as a beacon when page is closing
     * Uses sendBeacon for reliable delivery during page unload
     */
    sendLogoutBeacon() {
      if (!this.isConnected || !this.ws) {
        return;
      }
      try {
        const req = {
          type: "REQ_LOGOUT" /* REQ_LOGOUT */
        };
        this.ws.send(JSON.stringify(req));
      } catch (err) {
      }
    }
  };
  window.addEventListener("DOMContentLoaded", () => {
    new StarpeaceClient();
  });
})();
