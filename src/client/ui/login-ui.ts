/**
 * LoginUI - Gère l'interface de connexion et sélection de monde/compagnie
 * Refonte avec nouveau design glassmorphism
 */

import { WorldInfo, CompanyInfo, WORLD_ZONES } from '../../shared/types';

export class LoginUI {
  private uiLoginPanel: HTMLElement;
  private uiWorldList: HTMLElement;
  private uiCompanySection: HTMLElement;
  private uiCompanyList: HTMLElement;
  private uiStatus: HTMLElement;
  private currentZonePath: string = WORLD_ZONES[0].path; // Default to BETA

  // Callbacks
  private onDirectoryConnect: ((username: string, password: string, zonePath?: string) => void) | null = null;
  private onWorldSelect: ((worldName: string) => void) | null = null;
  private onCompanySelect: ((companyId: string) => void) | null = null;
  private onCreateCompany: (() => void) | null = null;

  constructor() {
    this.uiLoginPanel = document.getElementById('login-panel')!;
    this.uiWorldList = document.getElementById('world-list')!;
    this.uiCompanySection = document.getElementById('company-section')!;
    this.uiCompanyList = document.getElementById('company-list')!;
    this.uiStatus = document.getElementById('status-indicator')!;

    this.renderLoginForm();
  }

  /**
   * Définit le callback pour la connexion au Directory
   */
  public setOnDirectoryConnect(callback: (username: string, password: string, zonePath?: string) => void) {
    this.onDirectoryConnect = callback;
  }

  /**
   * Définit le callback pour la sélection de monde
   */
  public setOnWorldSelect(callback: (worldName: string) => void) {
    this.onWorldSelect = callback;
  }

  /**
   * Définit le callback pour la sélection de compagnie
   */
  public setOnCompanySelect(callback: (companyId: string) => void) {
    this.onCompanySelect = callback;
  }

  public setOnCreateCompany(callback: () => void) {
    this.onCreateCompany = callback;
  }

  /**
   * Display the login form
   */
  private renderLoginForm() {
    // Le bouton est maintenant dans le HTML (btn-connect)
    const btn = document.getElementById('btn-connect');
    if (btn) {
      btn.onclick = () => this.performDirectoryLogin();
    }

    // Support Enter key pour submit
    const inputs = [
      document.getElementById('inp-username'),
      document.getElementById('inp-password')
    ];
    inputs.forEach(input => {
      if (input) {
        input.addEventListener('keypress', (e: Event) => {
          if ((e as KeyboardEvent).key === 'Enter') {
            this.performDirectoryLogin();
          }
        });
      }
    });
  }

  /**
   * Déclenche la connexion au Directory
   */
  private performDirectoryLogin() {
    const username = (document.getElementById('inp-username') as HTMLInputElement).value;
    const password = (document.getElementById('inp-password') as HTMLInputElement).value;

    if (!username || !password) {
      this.showNotification('Please enter username and password', 'error');
      return;
    }

    // Show loading state in world list
    this.showWorldListLoading('Connecting to directory...');

    if (this.onDirectoryConnect) {
      this.onDirectoryConnect(username, password, this.currentZonePath);
    }
  }

  /**
   * Change la zone et recharge la liste des serveurs
   */
  private changeZone(zonePath: string) {
    this.currentZonePath = zonePath;

    // Update active tab styling
    document.querySelectorAll('.zone-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.getAttribute('data-zone-path') === zonePath) {
        tab.classList.add('active');
      }
    });

    // Reload world list for this zone
    const username = (document.getElementById('inp-username') as HTMLInputElement)?.value;
    const password = (document.getElementById('inp-password') as HTMLInputElement)?.value;

    if (username && password && this.onDirectoryConnect) {
      this.showWorldListLoading('Loading worlds...');
      this.onDirectoryConnect(username, password, zonePath);
    }
  }

  /**
   * Display the available worlds list
   */
  public renderWorldList(worlds: WorldInfo[]) {
    this.uiWorldList.innerHTML = '';

    // Hide authentication block after successful connection
    const authSection = document.querySelector('.login-section:has(.credentials-card)') as HTMLElement;
    if (authSection) {
      authSection.style.display = 'none';
    }

    // Create zone tabs
    const zoneTabs = document.createElement('div');
    zoneTabs.className = 'zone-tabs';

    WORLD_ZONES.forEach(zone => {
      const tab = document.createElement('button');
      tab.className = 'zone-tab';
      tab.textContent = zone.name;
      tab.setAttribute('data-zone-path', zone.path);

      if (zone.path === this.currentZonePath) {
        tab.classList.add('active');
      }

      tab.onclick = () => this.changeZone(zone.path);
      zoneTabs.appendChild(tab);
    });

    this.uiWorldList.appendChild(zoneTabs);

    if (worlds.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'padding: var(--space-6); text-align: center; color: var(--text-muted); font-style: italic;';
      emptyMsg.textContent = 'No worlds available';
      this.uiWorldList.appendChild(emptyMsg);
      return;
    }

    // Separate online and offline worlds
    const onlineWorlds = worlds.filter(w => w.running3 === true);
    const offlineWorlds = worlds.filter(w => w.running3 !== true);

    // Render online worlds first
    if (onlineWorlds.length > 0) {
      onlineWorlds.forEach(w => {
        const card = document.createElement('div');
        card.className = 'world-card';
        card.innerHTML = `
          <div class="world-header">
            <div class="world-name">${w.name}</div>
            ${this.getWorldStatusBadge(w)}
          </div>
          <div class="world-stats">
            <span>📅 ${w.date || 'N/A'}</span>
            <span>👥 ${w.investors || 0} investors</span>
            <span>🟢 ${w.online || w.players || 0} online</span>
            <span>🌍 ${w.population || 0} population</span>
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

    // Render offline worlds
    if (offlineWorlds.length > 0) {
      offlineWorlds.forEach(w => {
        const card = document.createElement('div');
        card.className = 'world-card world-card-offline';
        card.innerHTML = `
          <div class="world-header">
            <div class="world-name">${w.name}</div>
            <span class="badge badge-error">Offline</span>
          </div>
        `;
        // No onclick for offline worlds - they cannot be selected
        this.uiWorldList.appendChild(card);
      });
    }
  }

  /**
   * Génère un badge de statut pour le monde
   */
  private getWorldStatusBadge(world: WorldInfo): string {
    const players = world.players || 0;
    let badgeClass = 'badge-success';
    let status = 'Online';

    if (players > 100) {
      badgeClass = 'badge-error';
      status = 'Full';
    } else if (players > 50) {
      badgeClass = 'badge-warning';
      status = 'Busy';
    }

    return `<span class="badge ${badgeClass}">${status}</span>`;
  }


  /**
   * Display company selection (grouped by role)
   */
  public renderCompanySelection(companies: CompanyInfo[]) {
    // Hide world list section
    const worldSection = this.uiWorldList.parentElement;
    if (worldSection) {
      worldSection.style.display = 'none';
    }

    // Show and populate company section
    this.uiCompanySection.classList.remove('hidden');
    this.uiCompanyList.innerHTML = '';

    if (companies.length === 0) {
      this.uiCompanyList.innerHTML = '<div style="padding: var(--space-4); text-align: center; color: var(--text-muted); font-style: italic;">No companies available</div>';
      return;
    }

    // Group companies by ownerRole
    const groupedCompanies = new Map<string, CompanyInfo[]>();
    companies.forEach(company => {
      const role = company.ownerRole || 'Player';
      if (!groupedCompanies.has(role)) {
        groupedCompanies.set(role, []);
      }
      groupedCompanies.get(role)!.push(company);
    });

    // Render groups
    groupedCompanies.forEach((companyList, role) => {
      // Role header
      const roleHeader = document.createElement('div');
      roleHeader.className = 'company-role-header';

      // Determine icon and label based on role
      let icon = '🏢';
      let label = 'Companies';

      if (role.toLowerCase().includes('maire') || role.toLowerCase().includes('mayor')) {
        icon = '🏛️';
        label = `Maire - ${role}`;
      } else if (role.toLowerCase().includes('ministre') || role.toLowerCase().includes('minister')) {
        icon = '⚖️';
        label = `Ministre - ${role}`;
      } else if (role.toLowerCase().includes('président') || role.toLowerCase().includes('president')) {
        icon = '🎖️';
        label = `Président - ${role}`;
      } else if (role !== 'Player') {
        icon = '👤';
        label = role;
      }

      roleHeader.innerHTML = `
        <div style="padding: var(--space-3); font-weight: 600; color: var(--text-primary); border-bottom: 1px solid var(--border-color);">
          ${icon} ${label}
        </div>
      `;
      this.uiCompanyList.appendChild(roleHeader);

      // Render companies in this group
      companyList.forEach(company => {
        const card = document.createElement('div');
        card.className = 'company-card';
        card.innerHTML = `
          <div class="company-name">🏢 ${company.name}</div>
        `;
        card.onclick = () => {
          if (this.onCompanySelect) {
            this.onCompanySelect(company.id);
          }
        };
        this.uiCompanyList.appendChild(card);
      });
    });

    // "Create New Company" button
    const createBtn = document.createElement('div');
    createBtn.className = 'company-card';
    createBtn.innerHTML = `<div class="company-name" style="text-align: center; color: var(--primary-blue, #3b82f6);">+ Create New Company</div>`;
    createBtn.style.cssText = 'border: 2px dashed var(--primary-blue, #3b82f6); cursor: pointer; opacity: 0.8; margin-top: 8px;';
    createBtn.onclick = () => {
      if (this.onCreateCompany) {
        this.onCreateCompany();
      }
    };
    this.uiCompanyList.appendChild(createBtn);
  }


  /**
   * Display a notification (simple toast)
   */
  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
    // TODO: integrate with global notification system
    const colors = {
      success: 'var(--success)',
      error: 'var(--error)',
      info: 'var(--info)'
    };

    const toast = document.createElement('div');
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
      toast.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Cache le bouton de connexion au Directory (deprecated)
   */
  public hideConnectButton() {
    // No longer needed with the new design
  }

  /**
   * Cache le panel de login
   */
  public hide() {
    this.uiLoginPanel.style.display = 'none';
  }

  /**
   * Update the connection status
   */
  public setStatus(text: string, color: string) {
    const statusText = this.uiStatus.querySelector('span:last-child');
    const statusDot = this.uiStatus.querySelector('.status-dot') as HTMLElement;

    if (statusText) {
      statusText.textContent = text;
    }

    if (statusDot) {
      // Map colors to CSS variables
      const colorMap: Record<string, string> = {
        '#0f0': 'var(--success)',
        'green': 'var(--success)',
        '#f00': 'var(--error)',
        'red': 'var(--error)',
        '#ff0': 'var(--warning)',
        'yellow': 'var(--warning)'
      };
      statusDot.style.background = colorMap[color] || color;
    }
  }

  /**
   * Shows loading state in world list
   */
  public showWorldListLoading(message: string) {
    // Save existing zone tabs if they exist
    const existingTabs = this.uiWorldList.querySelector('.zone-tabs');

    this.uiWorldList.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; padding: var(--space-6); color: var(--text-muted); font-style: italic;">
        <span class="spinner"></span>
        ${message}
      </div>
    `;

    // Restore tabs at the top if they existed
    if (existingTabs) {
      this.uiWorldList.insertBefore(existingTabs, this.uiWorldList.firstChild);
    }
  }

  /**
   * Shows loading state in company list
   */
  public showCompanyListLoading(message: string) {
    this.uiCompanyList.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; padding: var(--space-4); color: var(--text-muted); font-style: italic;">
        <span class="spinner"></span>
        ${message}
      </div>
    `;
  }
}
