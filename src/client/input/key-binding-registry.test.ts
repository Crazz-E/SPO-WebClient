/**
 * Tests for KeyBindingRegistry
 * Node test environment — localStorage mocked.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { KeyActionId } from './key-binding-registry';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------
const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: jest.fn((key: string) => storageMap.get(key) ?? null),
  setItem: jest.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: jest.fn((key: string) => storageMap.delete(key)),
  clear: jest.fn(() => storageMap.clear()),
};

beforeEach(() => {
  storageMap.clear();
  jest.clearAllMocks();
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
});

const { KeyBindingRegistry, KeyAction } = require('./key-binding-registry') as typeof import('./key-binding-registry');

describe('KeyBindingRegistry', () => {
  describe('defaults', () => {
    it('should have default bindings for all actions', () => {
      const registry = new KeyBindingRegistry();
      expect(registry.getKey(KeyAction.ROTATE_CCW)).toBe('q');
      expect(registry.getKey(KeyAction.ROTATE_CW)).toBe('e');
      expect(registry.getKey(KeyAction.TOGGLE_DEBUG)).toBe('d');
      expect(registry.getKey(KeyAction.TOGGLE_MINIMAP)).toBe('m');
      expect(registry.getKey(KeyAction.DEBUG_TILE_INFO)).toBe('1');
    });

    it('should return all binding definitions', () => {
      const registry = new KeyBindingRegistry();
      const all = registry.getAllBindings();
      expect(all.length).toBeGreaterThanOrEqual(12);
      expect(all.every(b => b.currentKey !== undefined)).toBe(true);
    });
  });

  describe('rebind', () => {
    it('should rebind an action to a new key', () => {
      const registry = new KeyBindingRegistry();
      registry.rebind(KeyAction.ROTATE_CCW, 'z');
      expect(registry.getKey(KeyAction.ROTATE_CCW)).toBe('z');
    });

    it('should normalize single-letter keys to lowercase', () => {
      const registry = new KeyBindingRegistry();
      registry.rebind(KeyAction.ROTATE_CCW, 'Z');
      expect(registry.getKey(KeyAction.ROTATE_CCW)).toBe('z');
    });

    it('should preserve special keys as-is', () => {
      const registry = new KeyBindingRegistry();
      registry.rebind(KeyAction.TOGGLE_MINIMAP, 'F5');
      expect(registry.getKey(KeyAction.TOGGLE_MINIMAP)).toBe('F5');
    });

    it('should displace conflicting action and return it', () => {
      const registry = new KeyBindingRegistry();
      // 'e' is bound to ROTATE_CW by default
      const displaced = registry.rebind(KeyAction.ROTATE_CCW, 'e');
      expect(displaced).toBe(KeyAction.ROTATE_CW);
      expect(registry.getKey(KeyAction.ROTATE_CCW)).toBe('e');
      expect(registry.getKey(KeyAction.ROTATE_CW)).toBeUndefined();
    });

    it('should return null when no conflict', () => {
      const registry = new KeyBindingRegistry();
      const displaced = registry.rebind(KeyAction.ROTATE_CCW, 'z');
      expect(displaced).toBeNull();
    });
  });

  describe('persistence', () => {
    it('should save overrides to localStorage', () => {
      const registry = new KeyBindingRegistry();
      registry.rebind(KeyAction.ROTATE_CCW, 'z');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'spo_keybindings',
        expect.stringContaining('"rotate_ccw":"z"')
      );
    });

    it('should load overrides from localStorage', () => {
      storageMap.set('spo_keybindings', JSON.stringify({ rotate_ccw: 'z' }));
      const registry = new KeyBindingRegistry();
      expect(registry.getKey(KeyAction.ROTATE_CCW)).toBe('z');
    });

    it('should not save unchanged bindings', () => {
      const registry = new KeyBindingRegistry();
      // No rebinds — should remove the key if it was there
      registry.resetToDefaults();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('spo_keybindings');
    });

    it('should handle corrupted localStorage gracefully', () => {
      storageMap.set('spo_keybindings', 'not-valid-json{{{');
      const registry = new KeyBindingRegistry();
      // Should fall back to defaults
      expect(registry.getKey(KeyAction.ROTATE_CCW)).toBe('q');
    });

    it('should ignore unknown actions in localStorage', () => {
      storageMap.set('spo_keybindings', JSON.stringify({ unknown_action: 'z' }));
      const registry = new KeyBindingRegistry();
      expect(registry.getKey(KeyAction.ROTATE_CCW)).toBe('q');
    });
  });

  describe('resetToDefaults', () => {
    it('should restore all defaults after rebinding', () => {
      const registry = new KeyBindingRegistry();
      registry.rebind(KeyAction.ROTATE_CCW, 'z');
      registry.rebind(KeyAction.TOGGLE_MINIMAP, 'n');
      registry.resetToDefaults();
      expect(registry.getKey(KeyAction.ROTATE_CCW)).toBe('q');
      expect(registry.getKey(KeyAction.TOGGLE_MINIMAP)).toBe('m');
    });
  });

  describe('handleKeyDown', () => {
    it('should fire callback for matching key', () => {
      const registry = new KeyBindingRegistry();
      const callback = jest.fn();
      registry.on(KeyAction.ROTATE_CCW, callback);

      registry.handleKeyDown({ key: 'q', target: { tagName: 'CANVAS' } } as unknown as KeyboardEvent);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should be case-insensitive for single letters', () => {
      const registry = new KeyBindingRegistry();
      const callback = jest.fn();
      registry.on(KeyAction.ROTATE_CCW, callback);

      registry.handleKeyDown({ key: 'Q', target: { tagName: 'CANVAS' } } as unknown as KeyboardEvent);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should skip events from INPUT elements', () => {
      const registry = new KeyBindingRegistry();
      const callback = jest.fn();
      registry.on(KeyAction.ROTATE_CCW, callback);

      registry.handleKeyDown({ key: 'q', target: { tagName: 'INPUT' } } as unknown as KeyboardEvent);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should skip events from TEXTAREA elements', () => {
      const registry = new KeyBindingRegistry();
      const callback = jest.fn();
      registry.on(KeyAction.ROTATE_CCW, callback);

      registry.handleKeyDown({ key: 'q', target: { tagName: 'TEXTAREA' } } as unknown as KeyboardEvent);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should skip events from SELECT elements', () => {
      const registry = new KeyBindingRegistry();
      const callback = jest.fn();
      registry.on(KeyAction.ROTATE_CCW, callback);

      registry.handleKeyDown({ key: 'q', target: { tagName: 'SELECT' } } as unknown as KeyboardEvent);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should not fire callback for unbound keys', () => {
      const registry = new KeyBindingRegistry();
      const callback = jest.fn();
      registry.on(KeyAction.ROTATE_CCW, callback);

      registry.handleKeyDown({ key: 'z', target: { tagName: 'CANVAS' } } as unknown as KeyboardEvent);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should respect rebindings', () => {
      const registry = new KeyBindingRegistry();
      const callback = jest.fn();
      registry.on(KeyAction.ROTATE_CCW, callback);
      registry.rebind(KeyAction.ROTATE_CCW, 'z');

      registry.handleKeyDown({ key: 'z', target: { tagName: 'CANVAS' } } as unknown as KeyboardEvent);
      expect(callback).toHaveBeenCalledTimes(1);

      // Old key should no longer fire
      registry.handleKeyDown({ key: 'q', target: { tagName: 'CANVAS' } } as unknown as KeyboardEvent);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should gate debug-only bindings on debug mode getter', () => {
      const registry = new KeyBindingRegistry();
      const callback = jest.fn();
      registry.on(KeyAction.DEBUG_TILE_INFO, callback);

      // No debug getter → should not fire
      registry.handleKeyDown({ key: '1', target: { tagName: 'CANVAS' } } as unknown as KeyboardEvent);
      expect(callback).not.toHaveBeenCalled();

      // Set debug mode ON
      registry.setDebugModeGetter(() => true);
      registry.handleKeyDown({ key: '1', target: { tagName: 'CANVAS' } } as unknown as KeyboardEvent);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should not fire debug bindings when debug mode is off', () => {
      const registry = new KeyBindingRegistry();
      const callback = jest.fn();
      registry.on(KeyAction.DEBUG_TILE_INFO, callback);
      registry.setDebugModeGetter(() => false);

      registry.handleKeyDown({ key: '1', target: { tagName: 'CANVAS' } } as unknown as KeyboardEvent);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should fire non-debug bindings regardless of debug mode', () => {
      const registry = new KeyBindingRegistry();
      const callback = jest.fn();
      registry.on(KeyAction.ROTATE_CCW, callback);
      registry.setDebugModeGetter(() => false);

      registry.handleKeyDown({ key: 'q', target: { tagName: 'CANVAS' } } as unknown as KeyboardEvent);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
