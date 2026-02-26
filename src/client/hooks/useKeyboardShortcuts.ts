/**
 * useKeyboardShortcuts — Global keyboard shortcut handler.
 * Registers game-wide shortcuts (B=Build, E=Empire, M=Mail, Escape, Cmd+K, etc.)
 * Ignores shortcuts when focus is in a text input or textarea.
 */

import { useEffect } from 'react';
import { useUiStore } from '../store/ui-store';

function isTextInput(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const store = useUiStore.getState();

      // Cmd+K / Ctrl+K — Command Palette (always active)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        store.toggleCommandPalette();
        return;
      }

      // Escape — dismiss topmost (always active)
      if (e.key === 'Escape') {
        e.preventDefault();
        store.dismissTopmost();
        return;
      }

      // Don't handle shortcuts while typing in inputs
      if (isTextInput(e.target)) return;

      // Don't handle shortcuts while modal or command palette is open
      if (store.modal || store.commandPaletteOpen) return;

      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          store.openModal('buildMenu');
          break;
        case 'e':
          e.preventDefault();
          store.toggleLeftPanel('empire');
          break;
        case 'm':
          e.preventDefault();
          store.toggleRightPanel('mail');
          break;
        case 'r':
          // Refresh map — handled by bridge callback, not store
          break;
        case 'd':
          // Debug overlay — handled by game settings
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
