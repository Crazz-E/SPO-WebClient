/**
 * Tests for CompanyCreationDialog
 * Node test environment — DOM mocked as plain objects
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { CompanyCreationCallbacks } from './company-creation-dialog';

// ---------------------------------------------------------------------------
// DOM mock
// ---------------------------------------------------------------------------

interface MockElement {
  id: string;
  style: Record<string, string>;
  textContent: string;
  type: string;
  value: string;
  maxLength: number;
  placeholder: string;
  disabled: boolean;
  innerHTML: string;
  className: string;
  children: MockElement[];
  parentElement: MockElement | null;
  appendChild: jest.Mock;
  removeChild: jest.Mock;
  focus: jest.Mock;
  onmousedown: ((e: unknown) => void) | null;
  onkeydown: ((e: unknown) => void) | null;
  onclick: (() => void) | null;
}

function createMockElement(): MockElement {
  const el: MockElement = {
    id: '',
    style: {},
    textContent: '',
    type: '',
    value: '',
    maxLength: -1,
    placeholder: '',
    disabled: false,
    innerHTML: '',
    className: '',
    children: [],
    parentElement: null,
    appendChild: jest.fn(function (this: MockElement, child: MockElement) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    }),
    removeChild: jest.fn(function (this: MockElement, child: MockElement) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) this.children.splice(idx, 1);
      child.parentElement = null;
      return child;
    }),
    focus: jest.fn(),
    onmousedown: null,
    onkeydown: null,
    onclick: null,
  };
  return el;
}

let mockCallbacks: CompanyCreationCallbacks & { onCreateCompany: jest.Mock; onCancel: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();

  const bodyEl = createMockElement();

  (globalThis as Record<string, unknown>).document = {
    createElement: jest.fn(() => createMockElement()),
    body: bodyEl,
  };

  mockCallbacks = {
    onCreateCompany: jest.fn().mockResolvedValue(undefined),
    onCancel: jest.fn(),
  };
});

const { CompanyCreationDialog } = require('./company-creation-dialog') as typeof import('./company-creation-dialog');

describe('CompanyCreationDialog', () => {
  it('should start hidden', () => {
    const dialog = new CompanyCreationDialog(mockCallbacks);
    expect(dialog.isVisible()).toBe(false);
  });

  it('should show dialog', () => {
    const dialog = new CompanyCreationDialog(mockCallbacks);
    dialog.show(['PGI', 'Moab']);
    expect(dialog.isVisible()).toBe(true);
  });

  it('should hide dialog', () => {
    const dialog = new CompanyCreationDialog(mockCallbacks);
    dialog.show(['PGI', 'Moab']);
    dialog.hide();
    expect(dialog.isVisible()).toBe(false);
  });

  it('should not show twice', () => {
    const dialog = new CompanyCreationDialog(mockCallbacks);
    dialog.show(['PGI']);
    dialog.show(['PGI']);
    expect(dialog.isVisible()).toBe(true);
  });

  it('should show and clear error messages', () => {
    const dialog = new CompanyCreationDialog(mockCallbacks);
    dialog.show(['PGI']);
    dialog.showError('Name taken');
    dialog.clearError();
    // No error thrown — methods work without DOM issues
    expect(dialog.isVisible()).toBe(true);
  });

  it('should set loading state', () => {
    const dialog = new CompanyCreationDialog(mockCallbacks);
    dialog.show(['PGI']);
    dialog.setLoading(true);
    dialog.setLoading(false);
    expect(dialog.isVisible()).toBe(true);
  });

  it('should destroy and clean up', () => {
    const dialog = new CompanyCreationDialog(mockCallbacks);
    dialog.show(['PGI']);
    dialog.destroy();
    expect(dialog.isVisible()).toBe(false);
  });

  it('should handle destroy before show', () => {
    const dialog = new CompanyCreationDialog(mockCallbacks);
    expect(() => dialog.destroy()).not.toThrow();
  });

  it('should recreate DOM on show with new clusters', () => {
    const dialog = new CompanyCreationDialog(mockCallbacks);
    dialog.show(['PGI']);
    dialog.hide();
    dialog.show(['Moab', 'Magna']);
    expect(dialog.isVisible()).toBe(true);
  });
});
