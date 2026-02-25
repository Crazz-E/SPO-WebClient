/**
 * Tests for TycoonStatsUI — Phase 1.4 bankruptcy display
 *
 * Environment: node (no jsdom) — DOM elements mocked as plain objects.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { TycoonStats } from './tycoon-stats-ui';

// ---------------------------------------------------------------------------
// DOM mock infrastructure
// ---------------------------------------------------------------------------

interface MockElement {
  id: string;
  className: string;
  style: Record<string, string>;
  textContent: string;
  innerHTML: string;
  dataset: Record<string, string>;
  children: MockElement[];
  parentElement: MockElement | null;
  appendChild: jest.Mock;
  querySelector: jest.Mock;
  onmouseenter: (() => void) | null;
  onmouseleave: (() => void) | null;
  insertAdjacentElement: jest.Mock;
}

function createMockElement(id = ''): MockElement {
  const el: MockElement = {
    id,
    className: '',
    style: {},
    textContent: '',
    innerHTML: '',
    dataset: {},
    children: [],
    parentElement: null,
    appendChild: jest.fn(function (this: MockElement, child: MockElement) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    }),
    querySelector: jest.fn(function (this: MockElement, selector: string): MockElement | null {
      // Simple selector matching: [data-type="X"] and .stat-value
      for (const child of this.children) {
        if (selector.startsWith('[data-type="')) {
          const type = selector.match(/data-type="([^"]+)"/)?.[1];
          if (type && child.dataset.type === type) return child;
        }
        if (selector === '.stat-value' && child.className === 'stat-value') return child;
        // Recurse
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    }),
    onmouseenter: null,
    onmouseleave: null,
    insertAdjacentElement: jest.fn(),
  };
  return el;
}

// Track all created elements
let allElements: MockElement[];

beforeEach(() => {
  allElements = [];

  const headerEl = createMockElement();
  const toolbarEl = createMockElement('toolbar-container');
  toolbarEl.insertAdjacentElement = jest.fn();
  headerEl.children.push(toolbarEl);

  (globalThis as Record<string, unknown>).document = {
    getElementById: jest.fn((id: string) => {
      if (id === 'tycoon-stats-container') return null; // force dynamic creation
      if (id === 'toolbar-container') return toolbarEl;
      return null;
    }),
    querySelector: jest.fn((sel: string) => {
      if (sel === 'header') return headerEl;
      return null;
    }),
    createElement: jest.fn((_tag: string) => {
      const el = createMockElement();
      allElements.push(el);
      return el;
    }),
  };
});

const { TycoonStatsUI } = require('./tycoon-stats-ui') as typeof import('./tycoon-stats-ui');

describe('TycoonStatsUI', () => {
  function createAndInit(): InstanceType<typeof TycoonStatsUI> {
    const ui = new TycoonStatsUI();
    ui.init('TestPlayer');
    return ui;
  }

  function makeStats(overrides: Partial<TycoonStats> = {}): TycoonStats {
    return {
      username: 'TestPlayer',
      cash: '1000000',
      incomePerHour: '5000',
      ranking: 1,
      buildingCount: 10,
      maxBuildings: 100,
      ...overrides,
    };
  }

  describe('init', () => {
    it('should create debt indicator element (hidden by default)', () => {
      const ui = createAndInit();
      // Find the debt element in created elements by dataset
      const debtEl = allElements.find(el => el.dataset.type === 'debt');
      expect(debtEl).toBeDefined();
      expect(debtEl!.style.display).toBe('none');
    });
  });

  describe('failureLevel display', () => {
    it('should show "In Debt" warning when failureLevel is 1', () => {
      const ui = createAndInit();
      ui.updateStats(makeStats({ failureLevel: 1 }));

      const debtEl = allElements.find(el => el.dataset.type === 'debt');
      expect(debtEl).toBeDefined();
      expect(debtEl!.style.display).toBe('flex');

      // Find the stat-value child
      const valueEl = debtEl!.children.find(c => c.className === 'stat-value');
      expect(valueEl).toBeDefined();
      expect(valueEl!.textContent).toBe('In Debt');
    });

    it('should show "BANKRUPTCY" alert when failureLevel is 2', () => {
      const ui = createAndInit();
      ui.updateStats(makeStats({ failureLevel: 2 }));

      const debtEl = allElements.find(el => el.dataset.type === 'debt');
      const valueEl = debtEl!.children.find(c => c.className === 'stat-value');
      expect(valueEl!.textContent).toBe('BANKRUPTCY');
    });

    it('should hide debt indicator when failureLevel is 0', () => {
      const ui = createAndInit();
      // First show it
      ui.updateStats(makeStats({ failureLevel: 1 }));
      // Then clear it
      ui.updateStats(makeStats({ failureLevel: 0 }));

      const debtEl = allElements.find(el => el.dataset.type === 'debt');
      expect(debtEl!.style.display).toBe('none');
    });

    it('should hide debt indicator when failureLevel is undefined', () => {
      const ui = createAndInit();
      ui.updateStats(makeStats({ failureLevel: 1 }));
      ui.updateStats(makeStats()); // no failureLevel

      const debtEl = allElements.find(el => el.dataset.type === 'debt');
      expect(debtEl!.style.display).toBe('none');
    });
  });
});
