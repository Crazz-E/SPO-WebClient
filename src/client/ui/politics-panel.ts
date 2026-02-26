/**
 * PoliticsPanel - Town Hall politics page following Voyager's Politics/politics.asp layout.
 * Two-column design: left (mayor + ratings) + right (opposition + campaigns).
 * Glassmorphic draggable panel matching ProfilePanel pattern.
 */
import type {
  WsMessage,
  WsRespPoliticsData,
  PoliticsData,
  PoliticsRatingEntry,
} from '../../shared/types';
import { WsMessageType } from '../../shared/types';

type RatingTab = 'popular' | 'tycoons' | 'ifel' | 'publicity';

interface PoliticsPanelCallbacks {
  sendMessage: (msg: WsMessage) => void;
}

export class PoliticsPanel {
  private panel: HTMLElement;
  private contentArea: HTMLElement;
  private callbacks: PoliticsPanelCallbacks;

  private currentRatingTab: RatingTab = 'popular';
  private politicsData: PoliticsData | null = null;
  private townName = '';
  private buildingX = 0;
  private buildingY = 0;

  // Drag state
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(callbacks: PoliticsPanelCallbacks) {
    this.callbacks = callbacks;
    this.panel = this.createPanel();
    this.contentArea = this.panel.querySelector('.politics-content')!;
    document.body.appendChild(this.panel);
  }

  // ===========================================================================
  // PANEL CREATION
  // ===========================================================================

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'politics-panel';
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

    // Event handlers
    const header = panel.querySelector('.politics-header') as HTMLElement;
    header.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('button')) this.startDrag(e);
    });

    panel.querySelector('.politics-close-btn')!
      .addEventListener('click', () => this.hide());

    return panel;
  }

  // ===========================================================================
  // SHOW / HIDE / RESPONSE
  // ===========================================================================

  public show(townName: string, buildingX: number, buildingY: number): void {
    this.townName = townName;
    this.buildingX = buildingX;
    this.buildingY = buildingY;
    this.politicsData = null;
    this.currentRatingTab = 'popular';

    // Update header
    const title = this.panel.querySelector('.politics-title') as HTMLElement;
    title.textContent = `Politics - ${townName || 'Town'}`;

    // Show panel centered
    this.panel.style.display = 'flex';
    this.panel.style.left = `${Math.max(50, (window.innerWidth - 740) / 2)}px`;
    this.panel.style.top = `${Math.max(50, (window.innerHeight - 500) / 2)}px`;

    // Show loading state
    this.contentArea.innerHTML = `
      <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #aac; padding: 40px;">
        Loading politics data...
      </div>
    `;

    // Request data
    this.callbacks.sendMessage({
      type: WsMessageType.REQ_POLITICS_DATA,
      townName,
      buildingX,
      buildingY,
    } as WsMessage);
  }

  public hide(): void {
    this.panel.style.display = 'none';
    this.politicsData = null;
  }

  public isVisible(): boolean {
    return this.panel.style.display !== 'none';
  }

  public handleResponse(msg: WsMessage): void {
    if (msg.type === WsMessageType.RESP_POLITICS_DATA) {
      const resp = msg as WsRespPoliticsData;
      this.politicsData = resp.data;

      // Update elections info
      const electionsInfo = this.panel.querySelector('.politics-elections-info') as HTMLElement;
      electionsInfo.textContent = `${resp.data.yearsToElections} years to elections`;

      this.renderContent();
    } else if (msg.type === WsMessageType.RESP_POLITICS_VOTE || msg.type === WsMessageType.RESP_POLITICS_LAUNCH_CAMPAIGN) {
      // Refresh politics data after vote/campaign action
      this.callbacks.sendMessage({
        type: WsMessageType.REQ_POLITICS_DATA,
        townName: this.townName,
        buildingX: this.buildingX,
        buildingY: this.buildingY,
      } as WsMessage);
    }
  }

  // ===========================================================================
  // CONTENT RENDERING
  // ===========================================================================

  private renderContent(): void {
    if (!this.politicsData) return;
    const d = this.politicsData;

    this.contentArea.innerHTML = '';

    // Left column: Mayor + Ratings
    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'flex: 1; overflow-y: auto; border-right: 1px solid rgba(74, 122, 106, 0.3);';

    // Mayor card
    const mayorCard = document.createElement('div');
    mayorCard.style.cssText = 'padding: 16px; border-bottom: 1px solid rgba(74, 122, 106, 0.3);';
    mayorCard.innerHTML = `
      <div style="font-size: 11px; color: #88aa99; text-transform: uppercase; margin-bottom: 8px;">The Mayor</div>
      <div style="color: #ffffcc; font-size: 15px; font-weight: 600; margin-bottom: 8px;">${this.escapeHtml(d.mayorName || 'None')}</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px;">
        <div><span style="color: #88aa99;">Prestige:</span> <span style="color: #ddd;">${d.mayorPrestige}</span></div>
        <div><span style="color: #88aa99;">Mandate:</span> <span style="color: #ddd;">${d.campaignCount}</span></div>
        <div><span style="color: #88aa99;">Popular:</span> <span style="color: #ddd;">${d.mayorRating}%</span></div>
        <div><span style="color: #88aa99;">Tycoons:</span> <span style="color: #ddd;">${d.tycoonsRating}%</span></div>
      </div>
    `;
    leftCol.appendChild(mayorCard);

    // Rating tabs
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display: flex; border-bottom: 1px solid rgba(74, 122, 106, 0.3);';
    const tabs: { label: string; id: RatingTab }[] = [
      { label: 'POPULAR\nRATING', id: 'popular' },
      { label: "TYCOONS'\nRATINGS", id: 'tycoons' },
      { label: "IFEL's\nRATING", id: 'ifel' },
      { label: 'PUBLICITY', id: 'publicity' },
    ];
    for (const tab of tabs) {
      const tabBtn = document.createElement('div');
      const isActive = tab.id === this.currentRatingTab;
      tabBtn.style.cssText = `
        flex: 1;
        padding: 8px 4px;
        text-align: center;
        font-size: 10px;
        color: ${isActive ? '#ffffcc' : '#88aa99'};
        background: ${isActive ? 'rgba(74, 122, 106, 0.3)' : 'transparent'};
        cursor: pointer;
        white-space: pre-line;
        line-height: 1.3;
        border-right: 1px solid rgba(74, 122, 106, 0.2);
        user-select: none;
      `;
      tabBtn.textContent = tab.label;
      tabBtn.addEventListener('click', () => {
        this.currentRatingTab = tab.id;
        this.renderContent();
      });
      tabBar.appendChild(tabBtn);
    }
    leftCol.appendChild(tabBar);

    // Rating content
    const ratingData = this.getRatingDataForTab(this.currentRatingTab);
    const ratingContent = document.createElement('div');
    ratingContent.style.cssText = 'padding: 8px 16px; overflow-y: auto;';
    ratingContent.appendChild(this.renderRatingsTable(ratingData));
    leftCol.appendChild(ratingContent);

    // Right column: Opposition + Campaign
    const rightCol = document.createElement('div');
    rightCol.style.cssText = 'flex: 1; overflow-y: auto; display: flex; flex-direction: column;';

    // Opposition section
    const oppositionSection = document.createElement('div');
    oppositionSection.style.cssText = 'padding: 16px; border-bottom: 1px solid rgba(74, 122, 106, 0.3); min-height: 120px;';
    oppositionSection.innerHTML = `
      <div style="font-size: 11px; color: #88aa99; text-transform: uppercase; margin-bottom: 8px;">The Opposition</div>
    `;
    if (d.campaigns.length > 0) {
      const candidateList = document.createElement('div');
      for (const c of d.campaigns) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 0; color: #ddd; font-size: 12px; border-bottom: 1px solid rgba(74, 122, 106, 0.15);';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = c.candidateName;

        const rightSide = document.createElement('div');
        rightSide.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const ratingSpan = document.createElement('span');
        ratingSpan.style.color = '#88aa99';
        ratingSpan.textContent = `${c.rating}%`;

        const voteBtn = document.createElement('button');
        voteBtn.style.cssText = 'padding: 2px 8px; background: rgba(52, 89, 80, 0.8); color: #ffffcc; border: 1px solid #4a7a6a; border-radius: 3px; cursor: pointer; font-size: 10px;';
        voteBtn.textContent = 'Vote';
        voteBtn.onclick = () => {
          this.callbacks.sendMessage({
            type: WsMessageType.REQ_POLITICS_VOTE,
            buildingX: this.buildingX,
            buildingY: this.buildingY,
            candidateName: c.candidateName,
          } as WsMessage);
        };

        rightSide.appendChild(ratingSpan);
        rightSide.appendChild(voteBtn);
        row.appendChild(nameSpan);
        row.appendChild(rightSide);
        candidateList.appendChild(row);
      }
      oppositionSection.appendChild(candidateList);
    } else {
      const noData = document.createElement('div');
      noData.style.cssText = 'color: white; font-size: 16px; text-align: center; margin-top: 30px;';
      noData.textContent = 'No candidates';
      oppositionSection.appendChild(noData);
    }
    rightCol.appendChild(oppositionSection);

    // Campaign section
    const campaignSection = document.createElement('div');
    campaignSection.style.cssText = 'padding: 16px; flex: 1;';
    campaignSection.innerHTML = `
      <div style="font-size: 11px; color: #88aa99; text-transform: uppercase; margin-bottom: 12px;">Your Campaign</div>
    `;
    if (d.campaignMessage) {
      const msg = document.createElement('div');
      msg.style.cssText = 'color: #ddd; font-size: 12px; text-align: center; margin: 20px 0; line-height: 1.5;';
      msg.textContent = d.campaignMessage;
      campaignSection.appendChild(msg);
    }
    if (d.canLaunchCampaign) {
      const launchBtn = document.createElement('button');
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
      launchBtn.textContent = 'Launch Campaign';
      launchBtn.onmouseenter = () => {
        launchBtn.style.background = 'rgba(74, 122, 106, 0.9)';
        launchBtn.style.borderColor = '#ffffcc';
      };
      launchBtn.onmouseleave = () => {
        launchBtn.style.background = 'rgba(52, 89, 80, 0.8)';
        launchBtn.style.borderColor = '#4a7a6a';
      };
      launchBtn.onclick = () => {
        this.callbacks.sendMessage({
          type: WsMessageType.REQ_POLITICS_LAUNCH_CAMPAIGN,
          buildingX: this.buildingX,
          buildingY: this.buildingY,
        } as WsMessage);
      };
      campaignSection.appendChild(launchBtn);
    }
    rightCol.appendChild(campaignSection);

    this.contentArea.appendChild(leftCol);
    this.contentArea.appendChild(rightCol);
  }

  private getRatingDataForTab(tab: RatingTab): PoliticsRatingEntry[] | null {
    if (!this.politicsData) return [];
    switch (tab) {
      case 'popular': return this.politicsData.popularRatings;
      case 'tycoons': return this.politicsData.tycoonsRatings || [];
      case 'ifel': return this.politicsData.ifelRatings;
      case 'publicity': return null; // Publicity page not available on this server version
      default: return [];
    }
  }

  private renderRatingsTable(ratings: PoliticsRatingEntry[] | null): HTMLElement {
    const table = document.createElement('div');

    if (ratings === null) {
      table.innerHTML = '<div style="color: #6b8f80; font-size: 12px; text-align: center; padding: 20px; font-style: italic;">Not yet available</div>';
      return table;
    }

    if (ratings.length === 0) {
      table.innerHTML = '<div style="color: #88aa99; font-size: 12px; text-align: center; padding: 20px;">No data available</div>';
      return table;
    }

    for (const entry of ratings) {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(36, 72, 67, 0.6);';

      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'color: #ddd; font-size: 12px;';
      nameSpan.textContent = entry.name;

      const valueSpan = document.createElement('span');
      valueSpan.style.cssText = `color: ${this.getRatingColor(entry.value)}; font-size: 12px; font-weight: 600;`;
      valueSpan.textContent = `${entry.value}%`;

      row.appendChild(nameSpan);
      row.appendChild(valueSpan);
      table.appendChild(row);
    }

    return table;
  }

  private getRatingColor(value: number): string {
    if (value >= 100) return '#66ff66';
    if (value >= 60) return '#ffffcc';
    if (value >= 30) return '#ffaa44';
    return '#ff6644';
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ===========================================================================
  // DRAG BEHAVIOR
  // ===========================================================================

  private startDrag(e: MouseEvent): void {
    this.isDragging = true;
    const rect = this.panel.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;

    const onMove = (ev: MouseEvent) => {
      if (!this.isDragging) return;
      this.panel.style.left = `${ev.clientX - this.dragOffsetX}px`;
      this.panel.style.top = `${ev.clientY - this.dragOffsetY}px`;
    };

    const onUp = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}
