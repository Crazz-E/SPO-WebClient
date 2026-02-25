/**
 * SettingsPanel - Game settings dialog with localStorage persistence
 *
 * Settings:
 * - Vegetation: hide on camera move
 * - Vehicle animation on/off
 * - Sound on/off (placeholder for Phase 3)
 * - Debug overlay on/off
 */

const STORAGE_KEY = 'spo_settings';

export interface GameSettings {
  hideVegetationOnMove: boolean;
  vehicleAnimations: boolean;
  soundEnabled: boolean;
  debugOverlay: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  hideVegetationOnMove: true,
  vehicleAnimations: true,
  soundEnabled: true,
  debugOverlay: false,
};

/** Callback interface — only the renderer methods SettingsPanel needs */
export interface SettingsRendererAPI {
  setHideVegetationOnMove(enabled: boolean): void;
  setDebugMode(enabled: boolean): void;
}

export class SettingsPanel {
  private overlay: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private visible = false;
  private settings: GameSettings;
  private renderer: SettingsRendererAPI | null = null;
  private onSettingsChange: ((settings: GameSettings) => void) | null = null;

  constructor() {
    this.settings = this.loadSettings();
  }

  /**
   * Attach the renderer for live setting updates.
   */
  public setRenderer(renderer: SettingsRendererAPI): void {
    this.renderer = renderer;
    // Apply saved settings immediately
    this.applySettings();
  }

  /**
   * Set callback for settings changes (e.g., to update other UI components)
   */
  public setOnSettingsChange(callback: (settings: GameSettings) => void): void {
    this.onSettingsChange = callback;
  }

  /**
   * Get current settings.
   */
  public getSettings(): GameSettings {
    return { ...this.settings };
  }

  /**
   * Show the settings panel.
   */
  public show(): void {
    if (this.visible) return;
    this.visible = true;
    this.ensureDOM();
    if (this.overlay) {
      this.overlay.style.display = 'flex';
    }
  }

  /**
   * Hide the settings panel.
   */
  public hide(): void {
    if (!this.visible) return;
    this.visible = false;
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
  }

  /**
   * Toggle visibility.
   */
  public toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  public isVisible(): boolean {
    return this.visible;
  }

  /**
   * Clean up DOM.
   */
  public destroy(): void {
    if (this.overlay && this.overlay.parentElement) {
      this.overlay.parentElement.removeChild(this.overlay);
    }
    this.overlay = null;
    this.panel = null;
  }

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  private ensureDOM(): void {
    if (this.panel) return;

    // Overlay backdrop
    this.overlay = document.createElement('div');
    this.overlay.id = 'settings-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 200;
    `;
    this.overlay.onmousedown = (e: MouseEvent) => {
      if (e.target === this.overlay) this.hide();
    };

    // Panel
    this.panel = document.createElement('div');
    this.panel.id = 'settings-panel';
    this.panel.style.cssText = `
      background: var(--bg-primary, #1e293b);
      border: 1px solid var(--glass-border, rgba(148,163,184,0.2));
      border-radius: 12px;
      padding: 24px;
      min-width: 320px;
      max-width: 420px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      color: var(--text-primary, #f1f5f9);
      font-family: var(--font-primary, system-ui);
    `;

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Settings';
    title.style.cssText = 'margin: 0 0 16px 0; font-size: 18px; font-weight: 700;';
    this.panel.appendChild(title);

    // Settings rows
    this.addToggle('hideVegetationOnMove', 'Hide Vegetation on Move', 'Hide tree/plant textures while panning for better performance');
    this.addToggle('vehicleAnimations', 'Vehicle Animations', 'Show animated vehicles on roads');
    this.addToggle('soundEnabled', 'Sound', 'Enable game sounds (placeholder)');
    this.addToggle('debugOverlay', 'Debug Overlay', 'Show debug information overlay on the map');

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
      display: block;
      margin: 20px auto 0;
      padding: 8px 24px;
      background: rgba(51, 65, 85, 0.5);
      border: 1px solid var(--glass-border, rgba(148,163,184,0.2));
      border-radius: 8px;
      color: var(--text-primary, #f1f5f9);
      font-size: 14px;
      cursor: pointer;
    `;
    closeBtn.onmousedown = () => this.hide();
    this.panel.appendChild(closeBtn);

    this.overlay.appendChild(this.panel);
    document.body.appendChild(this.overlay);
  }

  private addToggle(key: keyof GameSettings, label: string, description: string): void {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid rgba(148,163,184,0.1);
    `;

    const labelDiv = document.createElement('div');
    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 14px; font-weight: 600;';
    const descEl = document.createElement('div');
    descEl.textContent = description;
    descEl.style.cssText = 'font-size: 12px; color: var(--text-secondary, #94a3b8); margin-top: 2px;';
    labelDiv.appendChild(labelEl);
    labelDiv.appendChild(descEl);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.settings[key] as boolean;
    checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer; accent-color: #3b82f6;';
    checkbox.onchange = () => {
      (this.settings as unknown as Record<string, boolean>)[key] = checkbox.checked;
      this.saveSettings();
      this.applySettings();
      if (this.onSettingsChange) {
        this.onSettingsChange(this.getSettings());
      }
    };

    row.appendChild(labelDiv);
    row.appendChild(checkbox);
    this.panel!.appendChild(row);
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private loadSettings(): GameSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      // Ignore parse errors
    }
    return { ...DEFAULT_SETTINGS };
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage errors
    }
  }

  private applySettings(): void {
    if (this.renderer) {
      this.renderer.setHideVegetationOnMove(this.settings.hideVegetationOnMove);
      this.renderer.setDebugMode(this.settings.debugOverlay);
    }
  }
}
