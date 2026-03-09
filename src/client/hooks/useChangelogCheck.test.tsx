/**
 * Tests for the useChangelogCheck hook.
 *
 * Verifies that the changelog modal auto-opens when the user hasn't seen the
 * current version, and stays closed when the version matches.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ClientContext } from '../context/ClientContext';
import { createMockClientCallbacks } from '../__tests__/setup/render-helpers';
import { useUiStore } from '../store/ui-store';
import { APP_VERSION } from '../version';
import { useChangelogCheck } from './useChangelogCheck';

const mockCallbacks = createMockClientCallbacks();

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ClientContext.Provider value={mockCallbacks}>
      {children}
    </ClientContext.Provider>
  );
}

beforeEach(() => {
  useUiStore.getState().closeModal();
  localStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useChangelogCheck', () => {
  it('opens changelog modal when version has not been seen', () => {
    renderHook(() => useChangelogCheck(), { wrapper });
    expect(useUiStore.getState().modal).toBeNull();

    act(() => { jest.advanceTimersByTime(500); });
    expect(useUiStore.getState().modal).toBe('changelog');
  });

  it('does not open modal when version matches localStorage', () => {
    localStorage.setItem('spo-last-seen-version', APP_VERSION);
    renderHook(() => useChangelogCheck(), { wrapper });

    act(() => { jest.advanceTimersByTime(1000); });
    expect(useUiStore.getState().modal).toBeNull();
  });

  it('opens modal when stored version differs from current', () => {
    localStorage.setItem('spo-last-seen-version', '0.0.1');
    renderHook(() => useChangelogCheck(), { wrapper });

    act(() => { jest.advanceTimersByTime(500); });
    expect(useUiStore.getState().modal).toBe('changelog');
  });
});
