/**
 * SettingsPanel - Game settings dialog with localStorage persistence
 *
 * Settings:
 * - Vegetation: hide on camera move
 * - Vehicle animation on/off
 * - Sound on/off (placeholder for Phase 3)
 * - Debug overlay on/off
 */

import type { KeyBindingRegistry, KeyActionId } from '../input/key-binding-registry';

const STORAGE_KEY = 'spo_settings';

export interface GameSettings {
  hideVegetationOnMove: boolean;
  vehicleAnimations: boolean;
  edgeScrollEnabled: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  debugOverlay: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  hideVegetationOnMove: true,
  vehicleAnimations: true,
  edgeScrollEnabled: false,
  soundEnabled: true,
  soundVolume: 0.8,
  debugOverlay: false,
};

/** Callback interface — only the renderer methods SettingsPanel needs */
export interface SettingsRendererAPI {
  setHideVegetationOnMove(enabled: boolean): void;
  setDebugMode(enabled: boolean): void;
  setVehicleAnimationsEnabled(enabled: boolean): void;
  setEdgeScrollEnabled(enabled: boolean): void;
}

export class SettingsPanel {
  private overlay: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private visible = false;
  private settings: GameSettings;
  private renderer: SettingsRendererAPI | null = null;
  private onSettingsChange: ((settings: GameSettings) => void) | null = null;
  private keyBindingRegistry: KeyBindingRegistry | null = null;

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
   * Attach key binding registry for the keyboard shortcuts section.
   */
  public setKeyBindingRegistry(registry: KeyBindingRegistry): void {
    this.keyBindingRegistry = registry;
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
    this.addToggle('edgeScrollEnabled', 'Edge Scrolling', 'Scroll the map when mouse reaches screen edges');
    this.addToggle('soundEnabled', 'Sound', 'Enable game sounds');
    this.addSlider('soundVolume', 'Volume', 'Master volume level', 0, 1, 0.05);
    this.addToggle('debugOverlay', 'Debug Overlay', 'Show debug information overlay on the map');

    // Keyboard shortcuts section
    if (this.keyBindingRegistry) {
      this.addKeybindingSection();
    }

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

  private addSlider(key: keyof GameSettings, label: string, description: string, min: number, max: number, step: number): void {
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

    const controlDiv = document.createElement('div');
    controlDiv.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(this.settings[key] as number);
    slider.style.cssText = 'width: 100px; cursor: pointer; accent-color: #3b82f6;';

    const valueLabel = document.createElement('span');
    valueLabel.textContent = `${Math.round((this.settings[key] as number) * 100)}%`;
    valueLabel.style.cssText = 'font-size: 12px; min-width: 32px; text-align: right; color: var(--text-secondary, #94a3b8);';

    slider.oninput = () => {
      const val = parseFloat(slider.value);
      (this.settings as unknown as Record<string, number>)[key] = val;
      valueLabel.textContent = `${Math.round(val * 100)}%`;
      this.saveSettings();
      this.applySettings();
      if (this.onSettingsChange) {
        this.onSettingsChange(this.getSettings());
      }
    };

    controlDiv.appendChild(slider);
    controlDiv.appendChild(valueLabel);

    row.appendChild(labelDiv);
    row.appendChild(controlDiv);
    this.panel!.appendChild(row);
  }

  private addKeybindingSection(): void {
    if (!this.keyBindingRegistry || !this.panel) return;

    const header = document.createElement('h3');
    header.textContent = 'Keyboard Shortcuts';
    header.style.cssText = 'margin: 16px 0 8px 0; font-size: 15px; font-weight: 700; border-top: 1px solid rgba(148,163,184,0.2); padding-top: 16px;';
    this.panel.appendChild(header);

    const bindings = this.keyBindingRegistry.getAllBindings();

    for (const binding of bindings) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 0;
        border-bottom: 1px solid rgba(148,163,184,0.05);
      `;

      const labelEl = document.createElement('div');
      labelEl.textContent = binding.label;
      labelEl.style.cssText = 'font-size: 13px;';

      const keyBtn = document.createElement('button');
      keyBtn.textContent = this.formatKeyName(binding.currentKey ?? '—');
      keyBtn.style.cssText = `
        min-width: 48px;
        padding: 4px 10px;
        background: rgba(51, 65, 85, 0.5);
        border: 1px solid var(--glass-border, rgba(148,163,184,0.2));
        border-radius: 6px;
        color: var(--text-primary, #f1f5f9);
        font-size: 13px;
        font-family: var(--font-mono, monospace);
        cursor: pointer;
        text-align: center;
      `;

      let listening = false;
      const captureHandler = (ev: KeyboardEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        listening = false;
        document.removeEventListener('keydown', captureHandler, true);

        const newKey = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
        this.keyBindingRegistry!.rebind(binding.action as KeyActionId, newKey);
        keyBtn.textContent = this.formatKeyName(newKey);
        keyBtn.style.borderColor = 'var(--glass-border, rgba(148,163,184,0.2))';
      };

      keyBtn.onmousedown = () => {
        if (listening) return;
        listening = true;
        keyBtn.textContent = '...';
        keyBtn.style.borderColor = '#3b82f6';
        document.addEventListener('keydown', captureHandler, true);
      };

      row.appendChild(labelEl);
      row.appendChild(keyBtn);
      this.panel.appendChild(row);
    }

    // Reset defaults button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset Keys to Defaults';
    resetBtn.style.cssText = `
      display: block;
      margin: 12px auto 0;
      padding: 6px 16px;
      background: rgba(51, 65, 85, 0.3);
      border: 1px solid var(--glass-border, rgba(148,163,184,0.2));
      border-radius: 6px;
      color: var(--text-secondary, #94a3b8);
      font-size: 12px;
      cursor: pointer;
    `;
    resetBtn.onmousedown = () => {
      this.keyBindingRegistry!.resetToDefaults();
      // Rebuild the panel to reflect reset bindings
      if (this.panel && this.panel.parentElement) {
        this.panel.parentElement.removeChild(this.panel);
      }
      this.panel = null;
      this.ensureDOM();
      if (this.overlay) {
        this.overlay.style.display = 'flex';
      }
    };
    this.panel.appendChild(resetBtn);
  }

  private formatKeyName(key: string): string {
    if (key.length === 1) return key.toUpperCase();
    return key;
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
      this.renderer.setVehicleAnimationsEnabled(this.settings.vehicleAnimations);
      this.renderer.setEdgeScrollEnabled(this.settings.edgeScrollEnabled);
    }
  }
}
