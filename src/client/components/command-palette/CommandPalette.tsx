/**
 * CommandPalette — Floating command search overlay.
 *
 * Triggered by Cmd+K. Fuzzy-searches over all registered commands.
 * Center-top floating, 560px wide, z-500.
 */

import { useEffect, useRef, useMemo, useCallback } from 'react';
import { useUiStore } from '../../store/ui-store';
import { useCommandPalette, type Command } from '../../hooks/useCommandPalette';
import styles from './CommandPalette.module.css';

const CATEGORY_LABELS: Record<string, string> = {
  navigation: 'Navigation',
  search: 'Search',
  action: 'Actions',
};

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const close = useUiStore((s) => s.closeCommandPalette);
  const openModal = useUiStore((s) => s.openModal);
  const toggleLeftPanel = useUiStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);

  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef(0);

  // Register all commands
  const commands: Command[] = useMemo(
    () => [
      {
        id: 'build',
        label: 'Open Build Menu',
        shortcut: 'B',
        category: 'navigation',
        execute: () => openModal('buildMenu'),
      },
      {
        id: 'empire',
        label: 'Open Empire Overview',
        shortcut: 'E',
        category: 'navigation',
        execute: () => toggleLeftPanel('empire'),
      },
      {
        id: 'mail',
        label: 'Open Mail',
        shortcut: 'M',
        category: 'navigation',
        execute: () => toggleRightPanel('mail'),
      },
      {
        id: 'search',
        label: 'Open Search',
        category: 'navigation',
        execute: () => toggleRightPanel('search'),
      },
      {
        id: 'politics',
        label: 'Open Politics',
        category: 'navigation',
        execute: () => toggleRightPanel('politics'),
      },
      {
        id: 'transport',
        label: 'Open Transport',
        category: 'navigation',
        execute: () => toggleRightPanel('transport'),
      },
      {
        id: 'settings',
        label: 'Open Settings',
        shortcut: 'Cmd+,',
        category: 'navigation',
        execute: () => openModal('settings'),
      },
      {
        id: 'find-building',
        label: 'Find Building by Name',
        category: 'search',
        execute: () => toggleRightPanel('search'),
      },
      {
        id: 'find-player',
        label: 'Find Player',
        category: 'search',
        execute: () => toggleRightPanel('search'),
      },
      {
        id: 'refresh',
        label: 'Refresh Map',
        shortcut: 'R',
        category: 'action',
        execute: () => {
          const bridge = (window.__spoReactCallbacks ?? {}) as Record<
            string,
            (...args: unknown[]) => void
          >;
          bridge.onRefreshMap?.();
        },
      },
    ],
    [openModal, toggleLeftPanel, toggleRightPanel],
  );

  const { query, setQuery, filteredCommands, groupedCommands, resetQuery } =
    useCommandPalette(commands);

  // Focus input on open
  useEffect(() => {
    if (open) {
      resetQuery();
      selectedRef.current = 0;
      // Small delay for animation
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, resetQuery]);

  const executeCommand = useCallback(
    (cmd: Command) => {
      close();
      cmd.execute();
    },
    [close],
  );

  // Arrow key navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedRef.current = Math.min(selectedRef.current + 1, filteredCommands.length - 1);
        // Force re-render via query trick is avoided — use data attribute
        const items = document.querySelectorAll(`[data-palette-item]`);
        items.forEach((el, i) => {
          (el as HTMLElement).dataset.selected = i === selectedRef.current ? 'true' : 'false';
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedRef.current = Math.max(selectedRef.current - 1, 0);
        const items = document.querySelectorAll(`[data-palette-item]`);
        items.forEach((el, i) => {
          (el as HTMLElement).dataset.selected = i === selectedRef.current ? 'true' : 'false';
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredCommands[selectedRef.current];
        if (cmd) executeCommand(cmd);
      }
    },
    [filteredCommands, executeCommand],
  );

  if (!open) return null;

  let itemIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={close} aria-hidden="true" />

      <div className={styles.palette} role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder="Type a command or search..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            selectedRef.current = 0;
          }}
          onKeyDown={handleKeyDown}
        />

        <div className={styles.results}>
          {Object.entries(groupedCommands).map(([category, cmds]) => (
            <div key={category} className={styles.group}>
              <div className={styles.groupLabel}>
                {CATEGORY_LABELS[category] ?? category}
              </div>
              {cmds.map((cmd) => {
                const idx = itemIndex++;
                return (
                  <button
                    key={cmd.id}
                    className={styles.item}
                    data-palette-item=""
                    data-selected={idx === 0 ? 'true' : 'false'}
                    onClick={() => executeCommand(cmd)}
                  >
                    <span className={styles.itemLabel}>{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className={styles.shortcut}>{cmd.shortcut}</kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {filteredCommands.length === 0 && (
            <div className={styles.empty}>No commands found</div>
          )}
        </div>
      </div>
    </>
  );
}
