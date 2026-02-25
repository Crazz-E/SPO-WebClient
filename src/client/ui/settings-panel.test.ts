/**
 * Tests for SettingsPanel — Phase 2.4 settings dialog
 *
 * Environment: node (no jsdom) — DOM elements mocked as plain objects.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { SettingsRendererAPI, GameSettings } from './settings-panel';

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

// ---------------------------------------------------------------------------
// DOM mock
// ---------------------------------------------------------------------------

interface MockElement {
  id: string;
  style: Record<string, string>;
  textContent: string;
  type: string;
  checked: boolean;
  children: MockElement[];
  parentElement: MockElement | null;
  appendChild: jest.Mock;
  onmousedown: ((e: unknown) => void) | null;
  onchange: (() => void) | null;
}

function createMockElement(): MockElement {
  const el: MockElement = {
    id: '',
    style: {},
    textContent: '',
    type: '',
    checked: false,
    children: [],
    parentElement: null,
    appendChild: jest.fn(function (this: MockElement, child: MockElement) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    }),
    onmousedown: null,
    onchange: null,
  };
  return el;
}

function createMockRenderer(): SettingsRendererAPI & { setHideVegetationOnMove: jest.Mock; setDebugMode: jest.Mock } {
  return {
    setHideVegetationOnMove: jest.fn(),
    setDebugMode: jest.fn(),
  };
}

beforeEach(() => {
  storageMap.clear();
  jest.clearAllMocks();

  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

  const bodyEl = createMockElement();

  (globalThis as Record<string, unknown>).document = {
    createElement: jest.fn(() => createMockElement()),
    body: bodyEl,
  };
});

const { SettingsPanel } = require('./settings-panel') as typeof import('./settings-panel');

describe('SettingsPanel', () => {
  it('should return default settings when no localStorage data', () => {
    const panel = new SettingsPanel();
    const settings = panel.getSettings();

    expect(settings.hideVegetationOnMove).toBe(true);
    expect(settings.vehicleAnimations).toBe(true);
    expect(settings.soundEnabled).toBe(true);
    expect(settings.debugOverlay).toBe(false);
  });

  it('should load saved settings from localStorage', () => {
    const saved: GameSettings = {
      hideVegetationOnMove: false,
      vehicleAnimations: false,
      soundEnabled: false,
      debugOverlay: true,
    };
    storageMap.set('spo_settings', JSON.stringify(saved));

    const panel = new SettingsPanel();
    const settings = panel.getSettings();

    expect(settings.hideVegetationOnMove).toBe(false);
    expect(settings.vehicleAnimations).toBe(false);
    expect(settings.debugOverlay).toBe(true);
  });

  it('should merge partial saved settings with defaults', () => {
    storageMap.set('spo_settings', JSON.stringify({ debugOverlay: true }));

    const panel = new SettingsPanel();
    const settings = panel.getSettings();

    expect(settings.hideVegetationOnMove).toBe(true); // default
    expect(settings.debugOverlay).toBe(true); // overridden
  });

  it('should apply settings to renderer when setRenderer is called', () => {
    const renderer = createMockRenderer();
    const panel = new SettingsPanel();
    panel.setRenderer(renderer);

    expect(renderer.setHideVegetationOnMove).toHaveBeenCalledWith(true);
    expect(renderer.setDebugMode).toHaveBeenCalledWith(false);
  });

  it('should start hidden', () => {
    const panel = new SettingsPanel();
    expect(panel.isVisible()).toBe(false);
  });

  it('should toggle visibility', () => {
    const panel = new SettingsPanel();

    panel.toggle();
    expect(panel.isVisible()).toBe(true);

    panel.toggle();
    expect(panel.isVisible()).toBe(false);
  });

  it('should handle corrupted localStorage gracefully', () => {
    storageMap.set('spo_settings', 'not-valid-json{{{');

    const panel = new SettingsPanel();
    const settings = panel.getSettings();

    // Should fall back to defaults
    expect(settings.hideVegetationOnMove).toBe(true);
    expect(settings.vehicleAnimations).toBe(true);
  });
});
