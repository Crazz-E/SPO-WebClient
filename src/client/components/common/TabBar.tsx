/**
 * TabBar — Horizontal scrollable tab bar with gold underline indicator.
 * Used in building inspector, mail folders, zone tabs, etc.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import styles from './TabBar.module.css';

interface Tab {
  id: string;
  label: string;
  badge?: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function TabBar({ tabs, activeTab, onTabChange, className }: TabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);

  const updateIndicator = useCallback(() => {
    if (!containerRef.current) return;
    const activeButton = containerRef.current.querySelector(`[data-tab-id="${activeTab}"]`) as HTMLElement | null;
    if (activeButton) {
      setIndicatorStyle({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      });
    }
  }, [activeTab]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator, tabs]);

  return (
    <div className={`${styles.container} ${className ?? ''}`} ref={containerRef} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-tab-id={tab.id}
          role="tab"
          aria-selected={tab.id === activeTab}
          className={`${styles.tab} ${tab.id === activeTab ? styles.active : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className={styles.badge}>{tab.badge > 99 ? '99+' : tab.badge}</span>
          )}
        </button>
      ))}
      {indicatorStyle && (
        <div
          className={styles.indicator}
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
          }}
        />
      )}
    </div>
  );
}
