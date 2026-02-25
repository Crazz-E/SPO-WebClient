/**
 * ToolbarUI - Barre d'outils avec boutons vers les fonctionnalités
 * Refonte avec icons et design glassmorphism
 */

export class ToolbarUI {
  private toolbar: HTMLElement | null = null;
  private container: HTMLElement | null = null;

  // Callbacks for unimplemented buttons
  private onBuildMenu: (() => void) | null = null;
  private onBuildRoad: (() => void) | null = null;
  private onDemolishRoad: (() => void) | null = null;
  private onSearch: (() => void) | null = null;
  private onCompanyMenu: (() => void) | null = null;
  private onMail: (() => void) | null = null;
  private onSettings: (() => void) | null = null;
  private onRefresh: (() => void) | null = null;
  private onTransport: (() => void) | null = null;
  private onLogout: (() => void) | null = null;

  // Button references for state updates
  private roadBuildingBtn: HTMLElement | null = null;
  private roadDemolishBtn: HTMLElement | null = null;
  private mailBtn: HTMLElement | null = null;
  private mailBadge: HTMLElement | null = null;

  constructor() {
    // Check if toolbar container exists in header
    this.container = document.getElementById('toolbar-container');
    if (!this.container) {
      console.warn('Toolbar container not found in header, toolbar will not be displayed');
    }
  }

  /**
   * Initialize toolbar - should be called when game starts
   */
  public init() {
    if (!this.container) return;
    this.createToolbar();
  }

  /**
   * Définit le callback pour le menu Build
   */
  public setOnBuildMenu(callback: () => void) {
    this.onBuildMenu = callback;
  }

  /**
   * Définit le callback pour Build Road
   */
  public setOnBuildRoad(callback: () => void) {
    this.onBuildRoad = callback;
  }

  public setOnDemolishRoad(callback: () => void) {
    this.onDemolishRoad = callback;
  }

  /**
   * Définit le callback pour Search
   */
  public setOnSearch(callback: () => void) {
    this.onSearch = callback;
  }

  /**
   * Définit le callback pour le menu Company
   */
  public setOnCompanyMenu(callback: () => void) {
    this.onCompanyMenu = callback;
  }

  /**
   * Définit le callback pour Mail
   */
  public setOnMail(callback: () => void) {
    this.onMail = callback;
  }

  /**
   * Définit le callback pour Settings
   */
  public setOnSettings(callback: () => void) {
    this.onSettings = callback;
  }

  /**
   * Définit le callback pour Refresh Map
   */
  public setOnRefresh(callback: () => void) {
    this.onRefresh = callback;
  }

  public setOnTransport(callback: () => void) {
    this.onTransport = callback;
  }

  /**
   * Définit le callback pour Logout
   */
  public setOnLogout(callback: () => void) {
    this.onLogout = callback;
  }

  /**
   * Creates the toolbar
   */
  private createToolbar() {
    this.toolbar = document.createElement('div');
    this.toolbar.id = 'toolbar';
    this.toolbar.style.cssText = `
      display: flex;
      gap: var(--space-2);
      background: rgba(51, 65, 85, 0.3);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-2xl);
      padding: var(--space-2);
    `;

    // Boutons avec icons
    const buttons = [
      {
        icon: '🔨',
        label: 'Build',
        tooltip: 'Construction Menu',
        callback: () => this.onBuildMenu?.()
      },
      {
        icon: '🛤️',
        label: 'Road',
        tooltip: 'Build Roads',
        callback: () => this.onBuildRoad?.(),
        isRoadButton: true
      },
      {
        icon: '🚧',
        label: 'Demolish',
        tooltip: 'Demolish Roads',
        callback: () => this.onDemolishRoad?.(),
        isDemolishButton: true
      },
      {
        icon: '🔍',
        label: 'Search',
        tooltip: 'Search Buildings',
        callback: () => this.onSearch?.()
      },
      {
        icon: '🏢',
        label: 'Company',
        tooltip: 'Company Overview',
        callback: () => this.onCompanyMenu?.()
      },
      {
        icon: '✉️',
        label: 'Mail',
        tooltip: 'Messages',
        callback: () => this.onMail?.(),
        isMailButton: true
      },
      {
        icon: '🚂',
        label: 'Transport',
        tooltip: 'Train Routes',
        callback: () => this.onTransport?.()
      },
      {
        icon: '⚙️',
        label: 'Settings',
        tooltip: 'Game Settings',
        callback: () => this.onSettings?.()
      },
      {
        icon: '🔄',
        label: 'Refresh',
        tooltip: 'Refresh Map',
        callback: () => this.onRefresh?.()
      },
      {
        icon: '🚪',
        label: 'Logout',
        tooltip: 'Logout',
        callback: () => this.onLogout?.(),
        isLogoutButton: true
      }
    ];

    buttons.forEach((btnConfig) => {
      const btn = this.createToolbarButton(btnConfig.icon, btnConfig.label, btnConfig.tooltip, btnConfig.callback);
      // Store reference to road button for state updates
      if ('isRoadButton' in btnConfig && btnConfig.isRoadButton) {
        this.roadBuildingBtn = btn;
      }
      if ('isDemolishButton' in btnConfig && btnConfig.isDemolishButton) {
        this.roadDemolishBtn = btn;
      }
      // Store reference to mail button for badge updates
      if ('isMailButton' in btnConfig && btnConfig.isMailButton) {
        this.mailBtn = btn;
      }
      // Add logout button styling class
      if ('isLogoutButton' in btnConfig && btnConfig.isLogoutButton) {
        btn.classList.add('logout-btn');
      }
      this.toolbar!.appendChild(btn);
    });

    this.container!.appendChild(this.toolbar);
  }

  /**
   * Crée un bouton de toolbar avec tooltip
   */
  private createToolbarButton(
    icon: string,
    label: string,
    tooltip: string,
    callback: () => void
  ): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'toolbar-btn';
    btn.title = tooltip;
    btn.setAttribute('aria-label', tooltip);

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

    // Icon
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    iconSpan.style.fontSize = '20px';
    iconSpan.style.lineHeight = '1';
    btn.appendChild(iconSpan);

    // Tooltip custom (meilleur que le title natif)
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'toolbar-tooltip';
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

    // Hover effects
    btn.onmouseenter = () => {
      btn.style.background = 'rgba(51, 65, 85, 0.6)';
      btn.style.borderColor = 'var(--primary-blue)';
      btn.style.color = 'var(--primary-blue-light)';
      btn.style.transform = 'translateY(-2px)';
      tooltipEl.style.opacity = '1';
    };

    btn.onmouseleave = () => {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'transparent';
      btn.style.color = 'var(--text-secondary)';
      btn.style.transform = 'translateY(0)';
      tooltipEl.style.opacity = '0';
    };

    // Active state (click)
    btn.onmousedown = () => {
      btn.style.transform = 'translateY(0) scale(0.95)';
    };

    btn.onmouseup = () => {
      btn.style.transform = 'translateY(-2px) scale(1)';
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
  private showButtonFeedback(btn: HTMLElement) {
    // Ripple effect
    const ripple = document.createElement('span');
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

    // Inject ripple animation if not exists
    if (!document.querySelector('#ripple-keyframes')) {
      const style = document.createElement('style');
      style.id = 'ripple-keyframes';
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
  public highlightButton(buttonLabel: 'Build' | 'Search' | 'Company' | 'Mail' | 'Settings') {
    if (!this.toolbar) return;

    const buttons = this.toolbar.querySelectorAll('.toolbar-btn');
    buttons.forEach((btn, index) => {
      const labels = ['Build', 'Search', 'Company', 'Mail', 'Settings'];
      if (labels[index] === buttonLabel) {
        (btn as HTMLElement).style.background = 'rgba(14, 165, 233, 0.2)';
        (btn as HTMLElement).style.borderColor = 'var(--primary-blue)';
      } else {
        (btn as HTMLElement).style.background = 'transparent';
        (btn as HTMLElement).style.borderColor = 'transparent';
      }
    });
  }

  /**
   * Réinitialise tous les boutons
   */
  public clearHighlights() {
    if (!this.toolbar) return;

    const buttons = this.toolbar.querySelectorAll('.toolbar-btn');
    buttons.forEach(btn => {
      (btn as HTMLElement).style.background = 'transparent';
      (btn as HTMLElement).style.borderColor = 'transparent';
    });
  }

  /**
   * Show/hide the toolbar
   */
  public setVisible(visible: boolean) {
    if (this.toolbar) {
      this.toolbar.style.display = visible ? 'flex' : 'none';
    }
  }

  /**
   * Détruit la toolbar
   */
  public destroy() {
    if (this.toolbar && this.toolbar.parentElement) {
      this.toolbar.parentElement.removeChild(this.toolbar);
      this.toolbar = null;
    }
  }

  /**
   * Set unread mail badge count on the mail button
   */
  public setMailBadge(count: number) {
    if (!this.mailBtn) return;

    // Remove existing badge
    if (this.mailBadge) {
      this.mailBadge.remove();
      this.mailBadge = null;
    }

    if (count <= 0) return;

    // Create badge
    this.mailBadge = document.createElement('span');
    this.mailBadge.textContent = count > 99 ? '99+' : String(count);
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
  public setRoadBuildingActive(active: boolean) {
    if (!this.roadBuildingBtn) return;

    if (active) {
      this.roadBuildingBtn.style.background = 'rgba(234, 88, 12, 0.3)'; // Orange tint
      this.roadBuildingBtn.style.borderColor = '#ea580c'; // Orange border
      this.roadBuildingBtn.style.color = '#fb923c'; // Orange text
      this.roadBuildingBtn.classList.add('road-active');
    } else {
      this.roadBuildingBtn.style.background = 'transparent';
      this.roadBuildingBtn.style.borderColor = 'transparent';
      this.roadBuildingBtn.style.color = 'var(--text-secondary)';
      this.roadBuildingBtn.classList.remove('road-active');
    }
  }

  public setRoadDemolishActive(active: boolean) {
    if (!this.roadDemolishBtn) return;

    if (active) {
      this.roadDemolishBtn.style.background = 'rgba(239, 68, 68, 0.3)'; // Red tint
      this.roadDemolishBtn.style.borderColor = '#ef4444'; // Red border
      this.roadDemolishBtn.style.color = '#f87171'; // Red text
      this.roadDemolishBtn.classList.add('demolish-active');
    } else {
      this.roadDemolishBtn.style.background = 'transparent';
      this.roadDemolishBtn.style.borderColor = 'transparent';
      this.roadDemolishBtn.style.color = 'var(--text-secondary)';
      this.roadDemolishBtn.classList.remove('demolish-active');
    }
  }
}
