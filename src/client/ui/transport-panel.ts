/**
 * TransportPanel - Train route management panel
 *
 * Displays railroad infrastructure and train information.
 * Phase A: read-only overview of railroad segments and placeholder train list.
 * Phase B (future): train route editing, map integration.
 */

import type { WsMessage, TransportData, TrainInfo } from '../../shared/types';
import { WsMessageType } from '../../shared/types';

// =============================================================================
// TYPES
// =============================================================================

interface TransportPanelCallbacks {
  sendMessage: (msg: WsMessage) => void;
}

type TransportView = 'overview' | 'trainDetail';

// =============================================================================
// TRANSPORT PANEL
// =============================================================================

export class TransportPanel {
  private panel: HTMLElement;
  private contentArea: HTMLElement;
  private callbacks: TransportPanelCallbacks;

  private currentView: TransportView = 'overview';
  private data: TransportData | null = null;
  private selectedTrain: TrainInfo | null = null;

  // Drag state
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(callbacks: TransportPanelCallbacks) {
    this.callbacks = callbacks;
    this.panel = this.createPanel();
    this.contentArea = this.panel.querySelector('.transport-content')!;
    document.body.appendChild(this.panel);
  }

  // ===========================================================================
  // PANEL CREATION
  // ===========================================================================

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'transport-panel';
    panel.style.cssText = `
      position: fixed;
      width: 560px;
      max-height: 70vh;
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(51, 65, 85, 0.95));
      border: 1px solid rgba(148, 163, 184, 0.2);
      backdrop-filter: blur(20px);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: none;
      flex-direction: column;
      font-family: var(--font-primary, system-ui);
      color: var(--text-primary, #f1f5f9);
    `;

    // Header with drag handle
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.15);
      cursor: move;
      user-select: none;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Transport';
    title.style.cssText = 'margin: 0; font-size: 16px; font-weight: 700;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00D7';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 22px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    `;
    closeBtn.addEventListener('click', () => this.hide());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Drag behavior
    header.addEventListener('mousedown', (e: MouseEvent) => {
      this.isDragging = true;
      this.dragOffsetX = e.clientX - panel.offsetLeft;
      this.dragOffsetY = e.clientY - panel.offsetTop;
    });
    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isDragging) return;
      panel.style.left = `${e.clientX - this.dragOffsetX}px`;
      panel.style.top = `${e.clientY - this.dragOffsetY}px`;
    });
    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Content area
    const content = document.createElement('div');
    content.className = 'transport-content';
    content.style.cssText = `
      padding: 16px 20px;
      overflow-y: auto;
      max-height: calc(70vh - 60px);
    `;

    panel.appendChild(header);
    panel.appendChild(content);

    return panel;
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  public show(): void {
    this.panel.style.display = 'flex';

    if (!this.panel.dataset.positioned) {
      const rect = this.panel.getBoundingClientRect();
      this.panel.style.left = `${(window.innerWidth - rect.width) / 2}px`;
      this.panel.style.top = `${(window.innerHeight - rect.height) / 2}px`;
      this.panel.dataset.positioned = '1';
    }

    this.requestData();
    this.render();
  }

  public hide(): void {
    this.panel.style.display = 'none';
  }

  public isVisible(): boolean {
    return this.panel.style.display !== 'none';
  }

  public toggle(): void {
    if (this.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  public handleMessage(msg: WsMessage): void {
    if (msg.type === WsMessageType.RESP_TRANSPORT_DATA) {
      const resp = msg as { data: TransportData };
      this.data = resp.data;
      this.render();
    }
  }

  public destroy(): void {
    if (this.panel.parentElement) {
      this.panel.parentElement.removeChild(this.panel);
    }
  }

  // ===========================================================================
  // DATA
  // ===========================================================================

  private requestData(): void {
    this.callbacks.sendMessage({
      type: WsMessageType.REQ_TRANSPORT_DATA,
    });
  }

  // ===========================================================================
  // RENDERING
  // ===========================================================================

  private render(): void {
    switch (this.currentView) {
      case 'overview':
        this.renderOverview();
        break;
      case 'trainDetail':
        this.renderTrainDetail();
        break;
    }
  }

  private renderOverview(): void {
    const c = this.contentArea;
    c.innerHTML = '';

    // Stats section
    const statsDiv = document.createElement('div');
    statsDiv.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 20px;
    `;

    const railCount = this.data?.railSegmentCount ?? 0;
    const trainCount = this.data?.trains.length ?? 0;

    statsDiv.appendChild(this.createStatCard('Rail Segments', String(railCount)));
    statsDiv.appendChild(this.createStatCard('Trains', String(trainCount)));
    c.appendChild(statsDiv);

    // Train list
    const listHeader = document.createElement('h3');
    listHeader.textContent = 'Trains';
    listHeader.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #94a3b8;';
    c.appendChild(listHeader);

    if (!this.data || this.data.trains.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = `
        text-align: center;
        padding: 32px 16px;
        color: #64748b;
        font-size: 13px;
        background: rgba(15, 23, 42, 0.3);
        border-radius: 8px;
        border: 1px dashed rgba(148, 163, 184, 0.15);
      `;
      empty.textContent = this.data
        ? 'No trains found. Build railroad segments to enable train routes.'
        : 'Loading transport data...';
      c.appendChild(empty);
      return;
    }

    for (const train of this.data.trains) {
      c.appendChild(this.createTrainRow(train));
    }
  }

  private renderTrainDetail(): void {
    const c = this.contentArea;
    c.innerHTML = '';

    if (!this.selectedTrain) {
      this.currentView = 'overview';
      this.renderOverview();
      return;
    }

    // Back button
    const backBtn = document.createElement('button');
    backBtn.textContent = '\u2190 Back';
    backBtn.style.cssText = `
      background: none;
      border: none;
      color: #93c5fd;
      font-size: 13px;
      cursor: pointer;
      padding: 0;
      margin-bottom: 16px;
    `;
    backBtn.addEventListener('click', () => {
      this.currentView = 'overview';
      this.selectedTrain = null;
      this.render();
    });
    c.appendChild(backBtn);

    const train = this.selectedTrain;

    // Train header
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom: 16px;';
    header.innerHTML = `
      <div style="font-size: 16px; font-weight: 700;">${this.escapeHtml(train.name)}</div>
      <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">
        Owner: ${this.escapeHtml(train.ownerName)} &middot; Status: ${this.escapeHtml(train.status)}
      </div>
    `;
    c.appendChild(header);

    // Route stops
    const routeHeader = document.createElement('h3');
    routeHeader.textContent = 'Route Stops';
    routeHeader.style.cssText = 'margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #94a3b8;';
    c.appendChild(routeHeader);

    if (train.routeStops.length === 0) {
      const noRoute = document.createElement('div');
      noRoute.textContent = 'No route configured.';
      noRoute.style.cssText = 'color: #64748b; font-size: 13px; padding: 12px;';
      c.appendChild(noRoute);
    } else {
      for (const stop of train.routeStops) {
        const row = document.createElement('div');
        row.style.cssText = `
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          font-size: 13px;
        `;
        row.innerHTML = `
          <span style="
            width: 24px; height: 24px;
            background: rgba(59, 130, 246, 0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            color: #93c5fd;
          ">${stop.stopOrder}</span>
          <span>${this.escapeHtml(stop.stationName)}</span>
          <span style="color: #64748b; margin-left: auto;">(${stop.x}, ${stop.y})</span>
        `;
        c.appendChild(row);
      }
    }
  }

  // ===========================================================================
  // UI HELPERS
  // ===========================================================================

  private createStatCard(label: string, value: string): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = `
      background: rgba(15, 23, 42, 0.4);
      border: 1px solid rgba(148, 163, 184, 0.1);
      border-radius: 8px;
      padding: 12px;
      text-align: center;
    `;
    card.innerHTML = `
      <div style="font-size: 22px; font-weight: 700; color: #f1f5f9;">${this.escapeHtml(value)}</div>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">${this.escapeHtml(label)}</div>
    `;
    return card;
  }

  private createTrainRow(train: TrainInfo): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      margin-bottom: 4px;
      background: rgba(15, 23, 42, 0.3);
      border: 1px solid rgba(148, 163, 184, 0.1);
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
    `;
    row.addEventListener('mouseenter', () => {
      row.style.background = 'rgba(37, 99, 235, 0.15)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'rgba(15, 23, 42, 0.3)';
    });
    row.addEventListener('click', () => {
      this.selectedTrain = train;
      this.currentView = 'trainDetail';
      this.render();
    });

    const statusColors: Record<string, string> = {
      idle: '#94a3b8',
      moving: '#22c55e',
      loading: '#f59e0b',
      unloading: '#3b82f6',
    };

    row.innerHTML = `
      <div>
        <div style="font-size: 13px; font-weight: 600;">${this.escapeHtml(train.name)}</div>
        <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
          ${train.routeStops.length} stop${train.routeStops.length !== 1 ? 's' : ''}
          &middot; Owner: ${this.escapeHtml(train.ownerName)}
        </div>
      </div>
      <span style="
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 10px;
        background: ${statusColors[train.status] || '#94a3b8'}20;
        color: ${statusColors[train.status] || '#94a3b8'};
        font-weight: 600;
      ">${this.escapeHtml(train.status)}</span>
    `;
    return row;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
