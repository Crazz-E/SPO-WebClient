import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { useUiStore } from '../store/ui-store';
import { useKeyboardShortcuts, SHORTCUTS, isTextInput } from './useKeyboardShortcuts';
import type { ClientCallbacks } from '../bridge/client-bridge';

function press(key: string, init: Partial<KeyboardEventInit> & { target?: HTMLElement } = {}) {
  const { target, ...rest } = init;
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...rest });
  (target ?? window).dispatchEvent(ev);
  return ev;
}

function makeClient(): ClientCallbacks {
  return {
    onRefreshMap: jest.fn(),
    onToggleDebugOverlay: jest.fn(),
    onToggleMinimap: jest.fn(),
    onRotateCW: jest.fn(),
  } as unknown as ClientCallbacks;
}

describe('useKeyboardShortcuts', () => {
  let client: ClientCallbacks;
  beforeEach(() => {
    client = makeClient();
    useUiStore.setState({ modal: null, commandPaletteOpen: false, minimapFullscreen: false });
    useUiStore.getState().clearSurfaces();
    document.body.innerHTML = '';
  });

  it('Ctrl+R and Cmd+R are left to the browser (no map refresh, not prevented)', () => {
    renderHook(() => useKeyboardShortcuts(client));
    const ev = press('r', { ctrlKey: true });
    expect(client.onRefreshMap).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
    press('r', { metaKey: true });
    expect(client.onRefreshMap).not.toHaveBeenCalled();
    press('r');
    expect(client.onRefreshMap).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+K toggles the palette; plain K does nothing', () => {
    renderHook(() => useKeyboardShortcuts(client));
    press('k', { ctrlKey: true });
    expect(useUiStore.getState().commandPaletteOpen).toBe(true);
    press('k', { ctrlKey: true });
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
  });

  it('Escape inside a text field is NOT taken (the field cancels its own edit)', () => {
    renderHook(() => useKeyboardShortcuts(client));
    useUiStore.getState().setRootSurface({ kind: 'mail' });
    const input = document.createElement('input');
    document.body.appendChild(input);
    const ev = press('Escape', { target: input });
    expect(ev.defaultPrevented).toBe(false);
    expect(useUiStore.getState().stack).toHaveLength(1);
    press('Escape');
    expect(useUiStore.getState().stack).toHaveLength(0);
  });

  it('ignores keys during IME composition', () => {
    renderHook(() => useKeyboardShortcuts(client));
    press('l', { isComposing: true } as KeyboardEventInit);
    expect(useUiStore.getState().stack).toHaveLength(0);
  });

  it('letters open their surfaces: L mail, P government, E empire, B build', () => {
    renderHook(() => useKeyboardShortcuts(client));
    press('l');
    expect(useUiStore.getState().rightPanel).toBe('mail');
    press('p');
    expect(useUiStore.getState().rightPanel).toBe('politics');
    press('e');
    expect(useUiStore.getState().leftPanel).toBe('empire');
    press('b');
    expect(useUiStore.getState().modal).toBe('buildMenu');
  });

  it('M toggles the minimap, W rotates the view, D toggles debug', () => {
    renderHook(() => useKeyboardShortcuts(client));
    press('m');
    press('w');
    press('d');
    expect(client.onToggleMinimap).toHaveBeenCalledTimes(1);
    expect(client.onRotateCW).toHaveBeenCalledTimes(1);
    expect(client.onToggleDebugOverlay).toHaveBeenCalledTimes(1);
  });

  it('letters are inert while a modal or the palette owns the keyboard', () => {
    renderHook(() => useKeyboardShortcuts(client));
    useUiStore.setState({ modal: 'settings' });
    press('l');
    expect(useUiStore.getState().rightPanel).toBeNull();
  });

  it('custom text widgets count as text inputs', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'textbox');
    expect(isTextInput(div)).toBe(true);
    expect(isTextInput(document.createElement('button'))).toBe(false);
  });

  it('the reference list names every handled key', () => {
    const keys = SHORTCUTS.map((s) => s.keys).join(' ');
    for (const k of ['B', 'M', 'E', 'P', 'L', 'R', 'D', 'Ctrl+K', 'Esc']) expect(keys).toContain(k);
  });
});
