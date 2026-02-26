/**
 * InspectorTabs — Tab navigation driven by server-sent BuildingDetailsTab config.
 */

import { TabBar } from '../common';
import type { BuildingDetailsTab } from '@/shared/types';

interface InspectorTabsProps {
  tabs: BuildingDetailsTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function InspectorTabs({ tabs, activeTab, onTabChange }: InspectorTabsProps) {
  const sorted = [...tabs].sort((a, b) => a.order - b.order);

  const tabItems = sorted.map((tab) => ({
    id: tab.id,
    label: tab.name,
  }));

  return (
    <TabBar
      tabs={tabItems}
      activeTab={activeTab}
      onTabChange={onTabChange}
    />
  );
}
