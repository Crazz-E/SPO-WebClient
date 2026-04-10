/**
 * KeyBindingRegistry — Centralized keyboard shortcut management
 *
 * Stores default and custom key bindings, persists overrides to localStorage,
 * and dispatches actions from a single keydown handler.
 */

const STORAGE_KEY = 'spo_keybindings';

export const KeyAction = {
  ROTATE_CCW: 'rotate_ccw',
  ROTATE_CW: 'rotate_cw',
  TOGGLE_DEBUG: 'toggle_debug',
  DEBUG_TILE_INFO: 'debug_tile_info',
  DEBUG_BUILDING_INFO: 'debug_building_info',
  DEBUG_CONCRETE_INFO: 'debug_concrete_info',
  DEBUG_WATER_GRID: 'debug_water_grid',
  DEBUG_ROAD_INFO: 'debug_road_info',
  TOGGLE_MINIMAP: 'toggle_minimap',
  TOGGLE_TEXTURES: 'toggle_textures',
  TOGGLE_CHUNKS: 'toggle_chunks',
  CYCLE_SEASON: 'cycle_season',
} as const;

export type KeyActionId = typeof KeyAction[keyof typeof KeyAction];

interface KeyBindingDef {
  action: KeyActionId;
  defaultKey: string;
  label: string;
  category: string;
  /** Only fire when debug mode is active */
  requiresDebug?: boolean;
}

const BINDING_DEFS: KeyBindingDef[] = [
  { action: KeyAction.ROTATE_CCW, defaultKey: 'q', label: 'Rotate Counter-clockwise', category: 'Map' },
  { action: KeyAction.ROTATE_CW, defaultKey: 'e', label: 'Rotate Clockwise', category: 'Map' },
  { action: KeyAction.TOGGLE_MINIMAP, defaultKey: 'm', label: 'Toggle Minimap', category: 'UI' },
  { action: KeyAction.TOGGLE_DEBUG, defaultKey: 'd', label: 'Toggle Debug Overlay', category: 'Debug' },
  { action: KeyAction.TOGGLE_TEXTURES, defaultKey: 't', label: 'Toggle Textures', category: 'Debug' },
  { action: KeyAction.TOGGLE_CHUNKS, defaultKey: 'c', label: 'Toggle Chunks', category: 'Debug' },
  { action: KeyAction.CYCLE_SEASON, defaultKey: 's', label: 'Cycle Season', category: 'Debug' },
  { action: KeyAction.DEBUG_TILE_INFO, defaultKey: '1', label: 'Debug: Tile Info', category: 'Debug', requiresDebug: true },
  { action: KeyAction.DEBUG_BUILDING_INFO, defaultKey: '2', label: 'Debug: Building Info', category: 'Debug', requiresDebug: true },
  { action: KeyAction.DEBUG_CONCRETE_INFO, defaultKey: '3', label: 'Debug: Concrete Info', category: 'Debug', requiresDebug: true },
  { action: KeyAction.DEBUG_WATER_GRID, defaultKey: '4', label: 'Debug: Water Grid', category: 'Debug', requiresDebug: true },
  { action: KeyAction.DEBUG_ROAD_INFO, defaultKey: '5', label: 'Debug: Road Info', category: 'Debug', requiresDebug: true },
];

export class KeyBindingRegistry {
  /** action → current key */
  private bindings: Map<KeyActionId, string> = new Map();
  /** action → callback */
  private callbacks: Map<KeyActionId, () => void> = new Map();
  /** Returns true when debug mode is active */
  private debugModeGetter: (() => boolean) | null = null;

  constructor() {
    this.loadDefaults();
    this.loadOverrides();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Register a callback for an action */
  on(action: KeyActionId, callback: () => void): void {
    this.callbacks.set(action, callback);
  }

  /** Set the debug mode getter (used to gate debug-only bindings) */
  setDebugModeGetter(getter: () => boolean): void {
    this.debugModeGetter = getter;
  }

  /** Central keydown handler — install once on document */
  handleKeyDown(e: KeyboardEvent): void {
    // Skip when typing in form fields
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const pressedKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    for (const [action, boundKey] of this.bindings) {
      if (boundKey !== pressedKey) continue;

      const def = BINDING_DEFS.find(d => d.action === action);
      if (def?.requiresDebug && !(this.debugModeGetter?.() ?? false)) continue;

      const callback = this.callbacks.get(action);
      if (callback) {
        callback();
        return; // First match wins
      }
    }
  }

  /** Rebind an action to a new key. Returns the action that was previously on that key, or null. */
  rebind(action: KeyActionId, newKey: string): KeyActionId | null {
    const normalizedKey = newKey.length === 1 ? newKey.toLowerCase() : newKey;
    let displaced: KeyActionId | null = null;

    // Check for conflict — unbind the other action
    for (const [existingAction, existingKey] of this.bindings) {
      if (existingKey === normalizedKey && existingAction !== action) {
        displaced = existingAction;
        this.bindings.delete(existingAction);
        break;
      }
    }

    this.bindings.set(action, normalizedKey);
    this.saveOverrides();
    return displaced;
  }

  /** Get current key for an action */
  getKey(action: KeyActionId): string | undefined {
    return this.bindings.get(action);
  }

  /** Get all binding definitions with current keys */
  getAllBindings(): Array<KeyBindingDef & { currentKey: string | undefined }> {
    return BINDING_DEFS.map(def => ({
      ...def,
      currentKey: this.bindings.get(def.action),
    }));
  }

  /** Reset all bindings to defaults and clear saved overrides */
  resetToDefaults(): void {
    this.loadDefaults();
    this.clearSaved();
  }

  private loadDefaults(): void {
    this.bindings.clear();
    for (const def of BINDING_DEFS) {
      this.bindings.set(def.action, def.defaultKey);
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private loadOverrides(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const overrides = JSON.parse(stored) as Record<string, string>;
        for (const [action, key] of Object.entries(overrides)) {
          if (this.bindings.has(action as KeyActionId)) {
            this.bindings.set(action as KeyActionId, key);
          }
        }
      }
    } catch {
      // Ignore parse errors — use defaults
    }
  }

  private saveOverrides(): void {
    try {
      const overrides: Record<string, string> = {};
      for (const def of BINDING_DEFS) {
        const current = this.bindings.get(def.action);
        if (current && current !== def.defaultKey) {
          overrides[def.action] = current;
        }
      }
      if (Object.keys(overrides).length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }

  private clearSaved(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}
