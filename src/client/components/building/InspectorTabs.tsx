/**
 * InspectorTabs — Pill grid tab selector driven by server-sent BuildingDetailsTab config.
 * Vertical pill layout, sized for narrow side panels.
 */

import type { BuildingDetailsTab } from '@/shared/types';
import styles from './BuildingInspector.module.css';

interface InspectorTabsProps {
  tabs: BuildingDetailsTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function InspectorTabs({ tabs, activeTab, onTabChange }: InspectorTabsProps) {
  const sorted = [...tabs].sort((a, b) => a.order - b.order);

  return (
    <div className={styles.pillGrid} role="tablist">
      {sorted.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTab}
          className={`${styles.pill} ${tab.id === activeTab ? styles.pillActive : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className={styles.pillIcon}>{tab.icon || tab.name.charAt(0)}</span>
          <span className={styles.pillLabel}>{tab.name}</span>
        </button>
      ))}
    </div>
  );
}
