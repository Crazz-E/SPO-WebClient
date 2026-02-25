/**
 * Tests for property-renderers — Phase 1.1 WordBool fix
 *
 * Environment: node (no jsdom) — DOM elements mocked as plain objects.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Minimal DOM mocks
// ---------------------------------------------------------------------------
interface MockInputElement {
  type: string;
  className: string;
  checked: boolean;
  onchange: (() => void) | null;
}

interface MockSpanElement {
  className: string;
  textContent: string;
  classList: { add: jest.Mock };
}

let lastCreatedElement: MockInputElement | MockSpanElement;

beforeEach(() => {
  (globalThis as Record<string, unknown>).document = {
    createElement: jest.fn((tag: string) => {
      if (tag === 'input') {
        const el: MockInputElement = {
          type: '',
          className: '',
          checked: false,
          onchange: null,
        };
        lastCreatedElement = el;
        return el;
      }
      const el: MockSpanElement = {
        className: '',
        textContent: '',
        classList: { add: jest.fn() },
      };
      lastCreatedElement = el;
      return el;
    }),
  };
});

// Import after DOM mock is set up
const { renderBooleanProperty } = require('./property-renderers') as typeof import('./property-renderers');

describe('renderBooleanProperty — WordBool encoding', () => {
  describe('display (isTrue detection)', () => {
    it('should recognize "-1" (Delphi WordBool true) as true', () => {
      renderBooleanProperty('-1');
      const span = lastCreatedElement as MockSpanElement;
      expect(span.textContent).toBe('Yes');
    });

    it('should recognize "1" as true', () => {
      renderBooleanProperty('1');
      const span = lastCreatedElement as MockSpanElement;
      expect(span.textContent).toBe('Yes');
    });

    it('should recognize "0" as false', () => {
      renderBooleanProperty('0');
      const span = lastCreatedElement as MockSpanElement;
      expect(span.textContent).toBe('No');
    });

    it('should recognize "yes" as true (case-insensitive)', () => {
      renderBooleanProperty('YES');
      const span = lastCreatedElement as MockSpanElement;
      expect(span.textContent).toBe('Yes');
    });

    it('should recognize "true" as true (case-insensitive)', () => {
      renderBooleanProperty('True');
      const span = lastCreatedElement as MockSpanElement;
      expect(span.textContent).toBe('Yes');
    });
  });

  describe('editable checkbox — WordBool output', () => {
    it('should output -1 when checkbox is checked (WordBool true)', () => {
      let capturedValue: number | null = null;
      const onChange = (val: number) => { capturedValue = val; };

      renderBooleanProperty('0', true, onChange);
      const checkbox = lastCreatedElement as MockInputElement;

      // Simulate checking the box
      checkbox.checked = true;
      checkbox.onchange!();

      expect(capturedValue).toBe(-1);
    });

    it('should output 0 when checkbox is unchecked (WordBool false)', () => {
      let capturedValue: number | null = null;
      const onChange = (val: number) => { capturedValue = val; };

      renderBooleanProperty('-1', true, onChange);
      const checkbox = lastCreatedElement as MockInputElement;

      // Simulate unchecking the box
      checkbox.checked = false;
      checkbox.onchange!();

      expect(capturedValue).toBe(0);
    });

    it('should start checked when value is "-1"', () => {
      renderBooleanProperty('-1', true, jest.fn());
      const checkbox = lastCreatedElement as MockInputElement;
      expect(checkbox.checked).toBe(true);
    });

    it('should start unchecked when value is "0"', () => {
      renderBooleanProperty('0', true, jest.fn());
      const checkbox = lastCreatedElement as MockInputElement;
      expect(checkbox.checked).toBe(false);
    });
  });
});
