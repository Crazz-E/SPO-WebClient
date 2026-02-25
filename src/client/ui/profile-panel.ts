/**
 * ProfilePanel - Tycoon profile pages following Voyager's original ASP layout.
 * Two-panel design: left sidebar (tycoon info + nav) + right content area (selected tab).
 * Glassmorphic draggable panel matching MailPanel pattern.
 */
import type {
  WsMessage,
  WsRespProfileCurriculum,
  WsRespProfileBank,
  WsRespProfileBankAction,
  WsRespProfileProfitLoss,
  WsRespProfileCompanies,
  WsRespProfileAutoConnections,
  WsRespProfileAutoConnectionAction,
  WsRespProfilePolicy,
  WsRespProfilePolicySet,
  CurriculumData,
  BankAccountData,
  BankActionType,
  ProfitLossData,
  ProfitLossNode,
  CompaniesData,
  AutoConnectionsData,
  AutoConnectionFluid,
  PolicyData,
} from '../../shared/types';
import { WsMessageType } from '../../shared/types';

// =============================================================================
// LEVEL PROGRESSION CONSTANTS (from TycoonLevels.pas)
// =============================================================================

interface LevelInfo {
  name: string;
  facLimit: number;
  fee?: number;
  profitPerHour?: number;
  prestige?: number;
}

const TYCOON_LEVELS: LevelInfo[] = [
  { name: 'Apprentice', facLimit: 50 },
  { name: 'Entrepreneur', facLimit: 150, fee: 100_000_000, profitPerHour: 1_000 },
  { name: 'Tycoon', facLimit: 400, fee: 500_000_000, profitPerHour: 5_000 },
  { name: 'Master', facLimit: 800, fee: 2_000_000_000, profitPerHour: 50_000, prestige: 2_500 },
  { name: 'Paradigm', facLimit: 1_000, fee: 20_000_000_000, profitPerHour: 100_000, prestige: 5_000 },
  { name: 'Legend', facLimit: 10_000, fee: 40_000_000_000, profitPerHour: 500_000, prestige: 15_000 },
];

const POLICY_LABELS = ['Ally', 'Neutral', 'Enemy'] as const;
const POLICY_COLORS = ['#ADFF2F', '#BDB76B', '#FF0000'] as const;

type ProfileTab = 'curriculum' | 'bank' | 'profitloss' | 'suppliers' | 'companies' | 'strategy';

interface ProfilePanelCallbacks {
  sendMessage: (msg: WsMessage) => void;
  onSwitchCompany?: (companyName: string, companyId: number) => void;
}

export class ProfilePanel {
  private panel: HTMLElement;
  private sidebarContent: HTMLElement;
  private contentArea: HTMLElement;
  private callbacks: ProfilePanelCallbacks;

  private currentTab: ProfileTab = 'curriculum';
  private tycoonName = '';
  private ranking = 0;
  private worldName = '';
  private photoUrl = '';

  // Cached tab data
  private curriculumData: CurriculumData | null = null;
  private bankData: BankAccountData | null = null;
  private profitLossData: ProfitLossData | null = null;
  private companiesData: CompaniesData | null = null;
  private autoConnectionsData: AutoConnectionsData | null = null;
  private policyData: PolicyData | null = null;

  // Drag state
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(callbacks: ProfilePanelCallbacks) {
    this.callbacks = callbacks;
    this.panel = this.createPanel();
    this.sidebarContent = this.panel.querySelector('.profile-sidebar-content')!;
    this.contentArea = this.panel.querySelector('.profile-content')!;
    document.body.appendChild(this.panel);
  }

  // ===========================================================================
  // PANEL CREATION
  // ===========================================================================

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'profile-panel';
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

    // Event handlers
    const header = panel.querySelector('.profile-header') as HTMLElement;
    header.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('button')) this.startDrag(e);
    });

    panel.querySelector('.profile-close-btn')!
      .addEventListener('click', () => this.hide());

    return panel;
  }

  private buildSidebar(): void {
    const c = this.sidebarContent;
    c.innerHTML = '';

    // Tycoon info section
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'text-align: center; margin-bottom: 16px;';
    const photoHtml = this.photoUrl
      ? `<img src="${this.escapeHtml(this.photoUrl)}" alt="${this.escapeHtml(this.tycoonName)}" style="
          width: 100px; height: 130px;
          border: 2px solid rgba(52, 89, 80, 0.8);
          border-radius: 8px;
          margin: 0 auto 8px;
          object-fit: cover;
          display: block;
        " onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
        <div style="
          width: 100px; height: 130px;
          background: rgba(20, 57, 48, 0.6);
          border: 2px solid rgba(52, 89, 80, 0.8);
          border-radius: 8px;
          margin: 0 auto 8px;
          display: none;
          align-items: center;
          justify-content: center;
          color: #64748b;
          font-size: 11px;
        ">No Photo</div>`
      : `<div style="
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
        ">No Photo</div>`;
    infoDiv.innerHTML = `
      ${photoHtml}
      <div style="color: white; font-weight: 700; font-size: 15px;">${this.escapeHtml(this.tycoonName)}</div>
      <div style="color: #94a3b8; font-size: 11px; margin-top: 2px;">
        ${this.ranking > 0 ? `#${this.ranking} in the NTA ranking.` : ''}
      </div>
    `;
    c.appendChild(infoDiv);

    // Navigation buttons
    const tabs: Array<{ id: ProfileTab; label: string }> = [
      { id: 'curriculum', label: 'Curriculum' },
      { id: 'bank', label: 'Bank Account' },
      { id: 'profitloss', label: 'Profit & Loss' },
      { id: 'suppliers', label: 'Initial Suppliers' },
      { id: 'companies', label: 'Companies' },
      { id: 'strategy', label: 'Strategy' },
    ];

    for (const tab of tabs) {
      const btn = document.createElement('button');
      const isActive = tab.id === this.currentTab;
      btn.textContent = tab.label;
      btn.style.cssText = `
        display: block;
        width: 100%;
        padding: 8px 12px;
        margin-bottom: 2px;
        background: ${isActive ? 'rgba(37, 99, 235, 0.3)' : 'transparent'};
        border: none;
        border-left: 3px solid ${isActive ? '#3b82f6' : 'transparent'};
        color: ${isActive ? '#93c5fd' : '#94a3b8'};
        font-size: 12px;
        font-weight: ${isActive ? '600' : '400'};
        text-align: left;
        cursor: pointer;
        transition: all 0.15s;
        border-radius: 0 4px 4px 0;
      `;
      btn.addEventListener('mouseenter', () => {
        if (tab.id !== this.currentTab) btn.style.background = 'rgba(37, 99, 235, 0.15)';
      });
      btn.addEventListener('mouseleave', () => {
        if (tab.id !== this.currentTab) btn.style.background = 'transparent';
      });
      btn.addEventListener('click', () => this.switchTab(tab.id));
      c.appendChild(btn);
    }
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  public show(tab?: ProfileTab): void {
    this.panel.style.display = 'flex';

    if (!this.panel.dataset.positioned) {
      const rect = this.panel.getBoundingClientRect();
      this.panel.style.left = `${(window.innerWidth - rect.width) / 2}px`;
      this.panel.style.top = `${(window.innerHeight - rect.height) / 2}px`;
      this.panel.dataset.positioned = '1';
    }

    this.buildSidebar();
    if (tab) this.currentTab = tab;
    this.switchTab(this.currentTab);
  }

  public hide(): void {
    this.panel.style.display = 'none';
  }

  public isVisible(): boolean {
    return this.panel.style.display !== 'none';
  }

  public setTycoonInfo(name: string, ranking: number, worldName: string, photoUrl?: string): void {
    this.tycoonName = name;
    this.ranking = ranking;
    this.worldName = worldName;
    this.photoUrl = photoUrl || '';
  }

  public setOnSwitchCompany(callback: (companyName: string, companyId: number) => void): void {
    this.callbacks.onSwitchCompany = callback;
  }

  public handleResponse(msg: WsMessage): void {
    switch (msg.type) {
      case WsMessageType.RESP_PROFILE_CURRICULUM:
        this.curriculumData = (msg as WsRespProfileCurriculum).data;
        if (this.currentTab === 'curriculum') this.renderCurriculum();
        break;
      case WsMessageType.RESP_PROFILE_BANK:
        this.bankData = (msg as WsRespProfileBank).data;
        if (this.currentTab === 'bank') this.renderBankAccount();
        break;
      case WsMessageType.RESP_PROFILE_BANK_ACTION:
        this.handleBankActionResponse(msg as WsRespProfileBankAction);
        break;
      case WsMessageType.RESP_PROFILE_PROFITLOSS:
        this.profitLossData = (msg as WsRespProfileProfitLoss).data;
        if (this.currentTab === 'profitloss') this.renderProfitLoss();
        break;
      case WsMessageType.RESP_PROFILE_COMPANIES:
        this.companiesData = (msg as WsRespProfileCompanies).data;
        if (this.currentTab === 'companies') this.renderCompanies();
        break;
      case WsMessageType.RESP_PROFILE_AUTOCONNECTIONS:
        this.autoConnectionsData = (msg as WsRespProfileAutoConnections).data;
        if (this.currentTab === 'suppliers') this.renderAutoConnections();
        break;
      case WsMessageType.RESP_PROFILE_AUTOCONNECTION_ACTION: {
        const acResp = msg as WsRespProfileAutoConnectionAction;
        if (!acResp.success) this.showStatusMessage(acResp.message || 'Action failed', true);
        // Refresh auto connections
        this.callbacks.sendMessage({ type: WsMessageType.REQ_PROFILE_AUTOCONNECTIONS });
        break;
      }
      case WsMessageType.RESP_PROFILE_POLICY:
        this.policyData = (msg as WsRespProfilePolicy).data;
        if (this.currentTab === 'strategy') this.renderPolicy();
        break;
      case WsMessageType.RESP_PROFILE_POLICY_SET: {
        const polResp = msg as WsRespProfilePolicySet;
        if (!polResp.success) this.showStatusMessage(polResp.message || 'Policy update failed', true);
        // Refresh policies
        this.callbacks.sendMessage({ type: WsMessageType.REQ_PROFILE_POLICY });
        break;
      }
    }
  }

  // ===========================================================================
  // TAB SWITCHING
  // ===========================================================================

  private switchTab(tab: ProfileTab): void {
    this.currentTab = tab;
    this.buildSidebar();
    this.renderLoading();

    switch (tab) {
      case 'curriculum':
        this.callbacks.sendMessage({ type: WsMessageType.REQ_PROFILE_CURRICULUM });
        break;
      case 'bank':
        this.callbacks.sendMessage({ type: WsMessageType.REQ_PROFILE_BANK });
        break;
      case 'profitloss':
        this.callbacks.sendMessage({ type: WsMessageType.REQ_PROFILE_PROFITLOSS });
        break;
      case 'suppliers':
        this.callbacks.sendMessage({ type: WsMessageType.REQ_PROFILE_AUTOCONNECTIONS });
        break;
      case 'companies':
        this.callbacks.sendMessage({ type: WsMessageType.REQ_PROFILE_COMPANIES });
        break;
      case 'strategy':
        this.callbacks.sendMessage({ type: WsMessageType.REQ_PROFILE_POLICY });
        break;
    }
  }

  private renderLoading(): void {
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

  private renderCurriculum(): void {
    const data = this.curriculumData;
    if (!data) return;

    const c = this.contentArea;
    c.innerHTML = '';

    // Header
    c.appendChild(this.createSectionHeader('Curriculum'));

    // Current level display
    const currentLevel = TYCOON_LEVELS[Math.min(data.currentLevel, TYCOON_LEVELS.length - 1)];
    const levelCard = document.createElement('div');
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

    // Level progression
    c.appendChild(this.createSectionHeader('Level Progression'));
    const progressDiv = document.createElement('div');
    progressDiv.style.cssText = 'display: flex; gap: 4px; margin-bottom: 20px; align-items: flex-end;';

    for (let i = 0; i < TYCOON_LEVELS.length; i++) {
      const lvl = TYCOON_LEVELS[i];
      const isActive = i === data.currentLevel;
      const isPast = i < data.currentLevel;
      const block = document.createElement('div');
      block.style.cssText = `
        flex: 1;
        padding: 8px 4px;
        text-align: center;
        border-radius: 4px;
        font-size: 10px;
        font-weight: ${isActive ? '700' : '400'};
        color: ${isActive ? '#22d3ee' : isPast ? '#4ade80' : '#64748b'};
        background: ${isActive ? 'rgba(34, 211, 238, 0.15)' : isPast ? 'rgba(74, 222, 128, 0.1)' : 'rgba(30, 41, 59, 0.5)'};
        border: 1px solid ${isActive ? 'rgba(34, 211, 238, 0.4)' : isPast ? 'rgba(74, 222, 128, 0.3)' : 'rgba(100, 116, 139, 0.3)'};
      `;
      block.innerHTML = `
        <div>${lvl.name}</div>
        <div style="font-size: 9px; margin-top: 2px;">${lvl.facLimit} bldgs</div>
      `;
      progressDiv.appendChild(block);
    }
    c.appendChild(progressDiv);

    // Stats grid
    c.appendChild(this.createSectionHeader('Statistics'));
    const statsGrid = document.createElement('div');
    statsGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px;';

    const stats = [
      ['Budget', this.formatMoney(data.budget)],
      ['Buildings', `${data.facCount} / ${data.facMax}`],
      ['Prestige', String(Math.round(data.prestige))],
      ['Facility Prestige', String(Math.round(data.facPrestige))],
      ['Research Prestige', String(Math.round(data.researchPrestige))],
      ['Land Area', `${data.area} tiles`],
      ['Nobility Points', String(data.nobPoints)],
      ['Ranking', `#${data.ranking}`],
    ];

    for (const [label, value] of stats) {
      const statEl = document.createElement('div');
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

    // Next level requirements
    if (data.currentLevel < TYCOON_LEVELS.length - 1) {
      const nextLevel = TYCOON_LEVELS[data.currentLevel + 1];
      c.appendChild(this.createSectionHeader(`Requirements for ${nextLevel.name}`));
      const reqDiv = document.createElement('div');
      reqDiv.style.cssText = `
        background: rgba(30, 58, 95, 0.3);
        border: 1px solid rgba(37, 99, 235, 0.3);
        border-radius: 8px;
        padding: 12px;
      `;
      let reqHtml = '<table style="width: 100%; border-collapse: collapse;">';
      if (nextLevel.fee) {
        reqHtml += this.requirementRow('Fee', this.formatMoney(String(nextLevel.fee)));
      }
      if (nextLevel.profitPerHour) {
        reqHtml += this.requirementRow('Profit/Hour', this.formatMoney(String(nextLevel.profitPerHour)));
      }
      if (nextLevel.prestige) {
        reqHtml += this.requirementRow('Prestige', String(nextLevel.prestige));
      }
      reqHtml += this.requirementRow('Max Buildings', String(nextLevel.facLimit));
      reqHtml += '</table>';
      reqDiv.innerHTML = reqHtml;
      c.appendChild(reqDiv);
    }
  }

  private requirementRow(label: string, value: string): string {
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

  private renderBankAccount(): void {
    const data = this.bankData;
    if (!data) return;

    const c = this.contentArea;
    c.innerHTML = '';

    // Header
    c.appendChild(this.createSectionHeader('Bank Account'));

    // Balance
    const balanceDiv = document.createElement('div');
    balanceDiv.style.cssText = 'margin-left: 20px; margin-bottom: 24px;';
    balanceDiv.innerHTML = `
      <span style="color: #94a3b8; font-size: 13px;">Current Balance:</span>
      <span style="color: white; font-size: 16px; font-weight: 700; margin-left: 8px;">${this.formatMoney(data.balance)}</span>
    `;
    c.appendChild(balanceDiv);

    // Two-column layout for Borrow and Send
    const cols = document.createElement('div');
    cols.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;';

    // Borrow section
    const borrowDiv = document.createElement('div');
    borrowDiv.innerHTML = `
      ${this.sectionGradientHeader('Borrow: Bank of IFEL')}
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

    // Send money section
    const sendDiv = document.createElement('div');
    sendDiv.innerHTML = `
      ${this.sectionGradientHeader('Send money')}
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

    // Loans section
    c.innerHTML += this.sectionGradientHeader('Loans');
    const loansDiv = document.createElement('div');
    loansDiv.style.cssText = 'padding: 12px;';

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
      tableHtml += '</table>';
      loansDiv.innerHTML = tableHtml;
    }
    c.appendChild(loansDiv);

    // Wire up bank actions
    this.wireBankActions();
  }

  private wireBankActions(): void {
    const loanInput = this.contentArea.querySelector('.bank-loan-amount') as HTMLInputElement | null;
    const interestEl = this.contentArea.querySelector('.bank-interest');
    const termEl = this.contentArea.querySelector('.bank-term');

    // Loan calculator (matches ASP formula from TycoonBankAccount.asp)
    if (loanInput && interestEl && termEl) {
      loanInput.addEventListener('keyup', () => {
        const val = parseFloat(loanInput.value.replace(/,/g, '')) || 0;
        const existingLoans = 0; // TODO: sum from this.bankData.loans
        const interest = Math.round((existingLoans + val) / 100_000_000);
        let term = 200 - Math.round((existingLoans + val) / 10_000_000);
        if (term < 5) term = 5;
        interestEl.textContent = `${interest}%`;
        termEl.textContent = String(term);
      });
    }

    // Borrow button
    const borrowBtn = this.contentArea.querySelector('.bank-borrow-btn');
    if (borrowBtn && loanInput) {
      borrowBtn.addEventListener('click', () => {
        const amount = loanInput.value.replace(/,/g, '');
        this.callbacks.sendMessage({
          type: WsMessageType.REQ_PROFILE_BANK_ACTION,
          action: 'borrow' as BankActionType,
          amount,
        });
      });
    }

    // Send button
    const sendBtn = this.contentArea.querySelector('.bank-send-btn');
    const sendTo = this.contentArea.querySelector('.bank-send-to') as HTMLInputElement | null;
    const sendAmount = this.contentArea.querySelector('.bank-send-amount') as HTMLInputElement | null;
    if (sendBtn && sendTo && sendAmount) {
      sendBtn.addEventListener('click', () => {
        this.callbacks.sendMessage({
          type: WsMessageType.REQ_PROFILE_BANK_ACTION,
          action: 'send' as BankActionType,
          toTycoon: sendTo.value,
          amount: sendAmount.value.replace(/,/g, ''),
        });
      });
    }

    // Pay off buttons
    const payoffBtns = this.contentArea.querySelectorAll('.bank-payoff-btn');
    payoffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const loanIndex = parseInt((btn as HTMLElement).dataset.loanIndex || '-1', 10);
        if (loanIndex >= 0) {
          this.callbacks.sendMessage({
            type: WsMessageType.REQ_PROFILE_BANK_ACTION,
            action: 'payoff' as BankActionType,
            loanIndex,
          });
        }
      });
    });
  }

  private handleBankActionResponse(resp: WsRespProfileBankAction): void {
    if (resp.result.success) {
      this.showStatusMessage(resp.result.message || 'Action completed');
      // Refresh bank data
      this.callbacks.sendMessage({ type: WsMessageType.REQ_PROFILE_BANK });
    } else {
      this.showStatusMessage(resp.result.message || 'Action failed', true);
    }
  }

  // ===========================================================================
  // TAB: PROFIT & LOSS
  // ===========================================================================

  private renderProfitLoss(): void {
    const data = this.profitLossData;
    if (!data) return;

    const c = this.contentArea;
    c.innerHTML = '';

    c.appendChild(this.createSectionHeader('Profit & Loss'));

    const table = document.createElement('table');
    table.style.cssText = 'width: 100%; border-collapse: collapse; margin-left: 20px;';
    this.renderProfitLossNode(table, data.root);
    c.appendChild(table);
  }

  private renderProfitLossNode(table: HTMLTableElement, node: ProfitLossNode): void {
    const tr = document.createElement('tr');

    // Label cell
    const labelTd = document.createElement('td');
    const indent = node.level * 30;
    const levelClass = `labelAccountLevel${node.level}`;
    const isNegative = node.amount.startsWith('-');

    if (node.isHeader) {
      // Category headers (RESIDENTIALS, CARS, etc.)
      labelTd.style.cssText = `padding: 8px 0 2px ${indent}px;`;
      labelTd.innerHTML = `<div style="color: #64748b; font-size: 10px; text-transform: uppercase; margin-top: 8px;">${this.escapeHtml(node.label)}</div>`;
      tr.appendChild(labelTd);
      table.appendChild(tr);
    } else {
      // Regular row with amount
      const fontSize = node.level === 0 ? '14px' : node.level === 1 ? '13px' : '12px';
      const fontWeight = node.level <= 1 ? '600' : '400';
      const color = node.level === 0 ? 'white' : node.level === 1 ? '#e2e8f0' : '#cbd5e1';
      const hasBorder = node.level === 1;

      labelTd.style.cssText = `
        padding: 4px 0 4px ${indent}px;
        ${hasBorder ? 'border-bottom: 1px solid rgba(52, 89, 80, 0.6);' : ''}
      `;
      labelTd.innerHTML = `<div style="color: ${color}; font-size: ${fontSize}; font-weight: ${fontWeight};">${this.escapeHtml(node.label)}</div>`;

      const amountTd = document.createElement('td');
      amountTd.style.cssText = `
        padding: 4px 8px;
        text-align: right;
        ${hasBorder ? 'border-bottom: 1px solid rgba(52, 89, 80, 0.6);' : ''}
      `;
      const amountColor = isNegative ? '#fca5a5' : color;
      amountTd.innerHTML = `
        <div style="color: ${amountColor}; font-size: ${fontSize}; font-weight: ${fontWeight};">
          ${this.formatMoney(node.amount)}
        </div>
      `;

      tr.appendChild(labelTd);
      tr.appendChild(amountTd);
      table.appendChild(tr);
    }

    // Render children
    if (node.children) {
      for (const child of node.children) {
        this.renderProfitLossNode(table, child);
      }
    }
  }

  // ===========================================================================
  // TAB: COMPANIES
  // ===========================================================================

  private renderCompanies(): void {
    const data = this.companiesData;
    if (!data) return;

    const c = this.contentArea;
    c.innerHTML = '';

    c.appendChild(this.createSectionHeader('Companies'));

    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'color: #94a3b8; font-size: 12px; margin: 0 0 16px 20px;';
    infoDiv.textContent = `You have registered the following companies in ${this.escapeHtml(this.worldName)}. Choose one from the list or create a new one.`;
    c.appendChild(infoDiv);

    // Company grid
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px;';

    for (const company of data.companies) {
      const isActive = company.name === data.currentCompany;
      const card = document.createElement('div');
      card.style.cssText = `
        background: ${isActive ? 'rgba(37, 99, 235, 0.2)' : 'rgba(20, 57, 48, 0.3)'};
        border: 2px solid ${isActive ? '#3b82f6' : 'rgba(52, 89, 80, 0.6)'};
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
        ${isActive ? '<div style="color: #3b82f6; font-size: 10px; font-weight: 600; margin-top: 4px;">ACTIVE</div>' : ''}
      `;

      card.addEventListener('mouseenter', () => {
        if (!isActive) card.style.borderColor = '#3b82f6';
      });
      card.addEventListener('mouseleave', () => {
        if (!isActive) card.style.borderColor = 'rgba(52, 89, 80, 0.6)';
      });
      card.addEventListener('click', () => {
        if (!isActive && this.callbacks.onSwitchCompany) {
          this.callbacks.onSwitchCompany(company.name, company.companyId);
        }
      });

      grid.appendChild(card);
    }
    c.appendChild(grid);
  }

  private clusterEmoji(cluster: string): string {
    switch (cluster.toLowerCase()) {
      case 'dissidents': return '&#x1f7e2;'; // green circle
      case 'pgi': return '&#x1f7e1;'; // yellow circle
      case 'mariko': return '&#x1f535;'; // blue circle
      case 'moab': return '&#x26ab;'; // black circle
      case 'magna': return '&#x26aa;'; // white circle
      default: return '&#x1f3e2;'; // office building
    }
  }

  // ===========================================================================
  // TAB: AUTO CONNECTIONS (INITIAL SUPPLIERS)
  // ===========================================================================

  private renderAutoConnections(): void {
    const data = this.autoConnectionsData;
    if (!data) return;

    const c = this.contentArea;
    c.innerHTML = '';

    c.appendChild(this.createSectionHeader('Initial Suppliers'));

    if (data.fluids.length === 0) {
      c.innerHTML += '<div style="color: #94a3b8; padding: 20px;">No auto-connections configured.</div>';
      return;
    }

    for (const fluid of data.fluids) {
      this.renderFluidSection(c, fluid);
    }
  }

  private renderFluidSection(container: HTMLElement, fluid: AutoConnectionFluid): void {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom: 16px;';

    // Fluid header
    section.innerHTML = this.sectionGradientHeader(this.escapeHtml(fluid.fluidName));

    const content = document.createElement('div');
    content.style.cssText = 'padding: 8px 12px;';

    // Supplier list
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
      html += '</table>';
      content.innerHTML += html;
    }

    // Options
    const optionsHtml = `
      <div style="margin-top: 8px; display: flex; gap: 12px;">
        <label style="color: #94a3b8; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
          <input type="checkbox" class="ac-trade-center" data-fluid-id="${this.escapeHtml(fluid.fluidId)}" ${fluid.hireTradeCenter ? 'checked' : ''} />
          Hire Trade Center
        </label>
        <label style="color: #94a3b8; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
          <input type="checkbox" class="ac-warehouses-only" data-fluid-id="${this.escapeHtml(fluid.fluidId)}" ${fluid.onlyWarehouses ? 'checked' : ''} />
          Warehouses only
        </label>
      </div>
    `;
    content.innerHTML += optionsHtml;

    section.appendChild(content);
    container.appendChild(section);

    // Wire delete buttons
    section.querySelectorAll('.ac-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const el = btn as HTMLElement;
        this.callbacks.sendMessage({
          type: WsMessageType.REQ_PROFILE_AUTOCONNECTION_ACTION,
          action: 'delete',
          fluidId: el.dataset.fluidId || '',
          suppliers: el.dataset.supplierId || '',
        });
      });
    });

    // Wire checkboxes
    const tcCheck = section.querySelector('.ac-trade-center') as HTMLInputElement | null;
    if (tcCheck) {
      tcCheck.addEventListener('change', () => {
        this.callbacks.sendMessage({
          type: WsMessageType.REQ_PROFILE_AUTOCONNECTION_ACTION,
          action: tcCheck.checked ? 'hireTradeCenter' : 'dontHireTradeCenter',
          fluidId: fluid.fluidId,
        });
      });
    }

    const whCheck = section.querySelector('.ac-warehouses-only') as HTMLInputElement | null;
    if (whCheck) {
      whCheck.addEventListener('change', () => {
        this.callbacks.sendMessage({
          type: WsMessageType.REQ_PROFILE_AUTOCONNECTION_ACTION,
          action: whCheck.checked ? 'onlyWarehouses' : 'dontOnlyWarehouses',
          fluidId: fluid.fluidId,
        });
      });
    }
  }

  // ===========================================================================
  // TAB: POLICY (STRATEGY)
  // ===========================================================================

  private renderPolicy(): void {
    const data = this.policyData;
    if (!data) return;

    const c = this.contentArea;
    c.innerHTML = '';

    c.appendChild(this.createSectionHeader('Strategy'));

    if (data.policies.length === 0) {
      c.innerHTML += '<div style="color: #94a3b8; padding: 20px;">No diplomatic relationships established.</div>';
      return;
    }

    // Policy table
    let html = `
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px;">
        <tr style="border-bottom: 1px solid rgba(148, 163, 184, 0.2);">
          <th style="padding: 8px; color: #94a3b8; text-align: left;">Tycoon</th>
          <th style="padding: 8px; color: #94a3b8; text-align: center;">Your Policy</th>
          <th style="padding: 8px; color: #94a3b8; text-align: center;">Their Policy</th>
        </tr>
    `;

    for (const entry of data.policies) {
      const yourLabel = POLICY_LABELS[entry.yourPolicy] || 'Neutral';
      const yourColor = POLICY_COLORS[entry.yourPolicy] || '#BDB76B';
      const theirLabel = POLICY_LABELS[entry.theirPolicy] || 'Neutral';
      const theirColor = POLICY_COLORS[entry.theirPolicy] || '#BDB76B';

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
              <option value="0" ${entry.yourPolicy === 0 ? 'selected' : ''} style="color: #ADFF2F;">Ally</option>
              <option value="1" ${entry.yourPolicy === 1 ? 'selected' : ''} style="color: #BDB76B;">Neutral</option>
              <option value="2" ${entry.yourPolicy === 2 ? 'selected' : ''} style="color: #FF0000;">Enemy</option>
            </select>
          </td>
          <td style="padding: 8px; text-align: center;">
            <span style="color: ${theirColor}; font-weight: 600;">${theirLabel}</span>
          </td>
        </tr>
      `;
    }
    html += '</table>';

    const tableDiv = document.createElement('div');
    tableDiv.innerHTML = html;
    c.appendChild(tableDiv);

    // Wire policy selects
    tableDiv.querySelectorAll('.policy-select').forEach(select => {
      select.addEventListener('change', () => {
        const el = select as HTMLSelectElement;
        const tycoonName = el.dataset.tycoon || '';
        const status = parseInt(el.value, 10);
        this.callbacks.sendMessage({
          type: WsMessageType.REQ_PROFILE_POLICY_SET,
          tycoonName,
          status,
        });
      });
    });
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private createSectionHeader(text: string): HTMLElement {
    const h = document.createElement('div');
    h.style.cssText = 'color: #e2e8f0; font-size: 16px; font-weight: 700; margin-bottom: 12px;';
    h.textContent = text;
    return h;
  }

  private sectionGradientHeader(text: string): string {
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

  private actionBtnStyle(): string {
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

  private formatMoney(value: string): string {
    const cleaned = value.replace(/[$\s]/g, '');
    const isNegative = cleaned.startsWith('-');
    const absValue = isNegative ? cleaned.substring(1) : cleaned;

    // Add commas
    const parts = absValue.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = parts.join('.');

    return `${isNegative ? '-' : ''}$${formatted}`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private showStatusMessage(message: string, isError = false): void {
    // Insert status message at top of content area
    const existing = this.contentArea.querySelector('.profile-status-msg');
    if (existing) existing.remove();

    const msgEl = document.createElement('div');
    msgEl.className = 'profile-status-msg';
    msgEl.style.cssText = `
      padding: 8px 12px;
      margin-bottom: 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      background: ${isError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)'};
      border: 1px solid ${isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'};
      color: ${isError ? '#fca5a5' : '#86efac'};
    `;
    msgEl.textContent = message;
    this.contentArea.insertBefore(msgEl, this.contentArea.firstChild);

    setTimeout(() => msgEl.remove(), 5000);
  }

  // ===========================================================================
  // DRAG
  // ===========================================================================

  private startDrag(e: MouseEvent): void {
    this.isDragging = true;
    const rect = this.panel.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;

    const onMouseMove = (ev: MouseEvent) => {
      if (!this.isDragging) return;
      this.panel.style.left = `${ev.clientX - this.dragOffsetX}px`;
      this.panel.style.top = `${ev.clientY - this.dragOffsetY}px`;
    };

    const onMouseUp = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
}
