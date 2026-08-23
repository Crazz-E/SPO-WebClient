/**
 * Tabs — the accessible tab strip of the design system (doc/ux/handoff/00-socle.md §2.5).
 *
 * Full WAI-ARIA tabs pattern with automatic activation: one `tablist`, one `tab` per item,
 * a single tab in the tab order (roving tabindex), ArrowLeft / ArrowRight move focus AND
 * activate (wrapping), Home / End jump to the ends, disabled tabs are skipped. `TabPanel` is the
 * companion that wires `aria-controls` / `aria-labelledby` through the shared `tabIds` helper.
 *
 * Supersedes `TabBar` (kept untouched — flows migrate one at a time). Two variants:
 *  - `underline` — section navigation, 40 px, 2 px gold bottom border on the active tab;
 *  - `segmented` — at most three choices, 32 px, `--radius-md`, active background `--bg-elevated`.
 */

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: ReactNode;
  badge?: number;
  disabled?: boolean;
}

export type TabsVariant = 'underline' | 'segmented';

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  variant?: TabsVariant;
  /** Required: names the tablist for assistive technology. */
  'aria-label': string;
  /** Id prefix for tab / panel ids; defaults to a `useId` value. Pass it to `TabPanel` as `tabsId`. */
  idBase?: string;
  className?: string;
}

/** The ids a tab and its panel share — so `Tabs` and `TabPanel` always agree. */
export function tabIds(base: string, tabId: string): { tab: string; panel: string } {
  return { tab: `${base}-tab-${tabId}`, panel: `${base}-panel-${tabId}` };
}

/** Next enabled index from `from` in `step` direction, wrapping. Returns `from` when nothing else is enabled. */
function nextEnabled(tabs: TabItem[], from: number, step: 1 | -1): number {
  const n = tabs.length;
  for (let k = 1; k < n; k++) {
    const i = (((from + step * k) % n) + n) % n;
    if (!tabs[i].disabled) return i;
  }
  return from;
}

function edgeEnabled(tabs: TabItem[], fromStart: boolean): number {
  const n = tabs.length;
  for (let k = 0; k < n; k++) {
    const i = fromStart ? k : n - 1 - k;
    if (!tabs[i].disabled) return i;
  }
  return -1;
}

export function Tabs({
  tabs,
  activeId,
  onChange,
  variant = 'underline',
  'aria-label': ariaLabel,
  idBase,
  className,
}: TabsProps) {
  const generated = useId();
  const base = idBase ?? generated;
  const listRef = useRef<HTMLDivElement>(null);

  const activate = (index: number) => {
    const tab = tabs[index];
    if (!tab || tab.disabled) return;
    if (tab.id !== activeId) onChange(tab.id);
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-index="${index}"]`);
    el?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let target: number;
    switch (event.key) {
      case 'ArrowRight':
        target = nextEnabled(tabs, index, 1);
        break;
      case 'ArrowLeft':
        target = nextEnabled(tabs, index, -1);
        break;
      case 'Home':
        target = edgeEnabled(tabs, true);
        break;
      case 'End':
        target = edgeEnabled(tabs, false);
        break;
      case ' ':
      case 'Enter':
        target = index;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (target >= 0) activate(target);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`${styles.tablist} ${styles[variant]} ${className ?? ''}`}
    >
      {tabs.map((tab, index) => {
        const ids = tabIds(base, tab.id);
        const selected = tab.id === activeId;
        const badge = tab.badge ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={ids.tab}
            data-tab-index={index}
            aria-selected={selected}
            aria-controls={ids.panel}
            aria-disabled={tab.disabled || undefined}
            tabIndex={selected ? 0 : -1}
            className={`${styles.tab} ${selected ? styles.active : ''} ${tab.disabled ? styles.disabled : ''}`}
            onClick={() => activate(index)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {tab.label}
            {badge > 0 && (
              <span className={styles.badge} aria-label={`${badge} new`}>
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  /** The `idBase` given to `Tabs` (or the value `Tabs` derived — pass an explicit `idBase` to share it). */
  tabsId: string;
  tabId: string;
  children: ReactNode;
  className?: string;
}

/** A panel bound to one tab: `role="tabpanel"`, labelled by its tab, focusable so the content is reachable. */
export function TabPanel({ tabsId, tabId, children, className }: TabPanelProps) {
  const ids = tabIds(tabsId, tabId);
  return (
    <div
      role="tabpanel"
      id={ids.panel}
      aria-labelledby={ids.tab}
      tabIndex={0}
      className={`${styles.panel} ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
