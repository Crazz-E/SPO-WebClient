/**
 * GameScreen — Map-first HUD overlay system.
 *
 * The canvas fills 100% of the viewport (managed by client.ts).
 * All UI is absolutely positioned overlays:
 * - InfoWidget (z-300): top-right stats card
 * - LeftRail (z-200): action buttons
 * - RightRail (z-200): map controls
 * - ChatStrip (z-150): bottom-edge persistent chat
 * - RightPanel (z-350): slide-in from right (building inspector, mail, search, etc.)
 * - LeftPanel (z-350): slide-in from left (empire overview)
 * - Modals (z-400): build menu, settings
 * - CommandPalette (z-500)
 */

import { useUiStore } from '../store';
import { InfoWidget, LeftRail, RightRail } from '../components/hud';
import { RightPanel, LeftPanel } from '../components/panels';
import { ChatStrip } from '../components/chat';
import { BuildingInspector } from '../components/building';
import { ProfilePanel, EmpireOverview } from '../components/empire';
import { MailPanel } from '../components/mail';
import { SearchPanel } from '../components/search';
import { PoliticsPanel } from '../components/politics';
import { TransportPanel } from '../components/transport';
import { BuildMenu, CompanyCreationModal, ConnectionPickerModal, SettingsDialog } from '../components/modals';
import { CommandPalette } from '../components/command-palette';
import { MobileShell } from '../components/mobile';
import { User, Heart } from 'lucide-react';
import type { ReactNode } from 'react';

/** Config for each left panel type */
const LEFT_PANEL_CONFIG: Record<string, { title: string; icon: ReactNode }> = {
  empire: { title: 'Profile', icon: <User size={18} /> },
  facilities: { title: 'My Facilities', icon: <Heart size={18} /> },
};
import styles from './GameScreen.module.css';

/** Title labels for each right panel type */
const RIGHT_PANEL_TITLES: Record<string, string> = {
  building: 'Building Inspector',
  mail: 'Mail',
  search: 'Search',
  politics: 'Politics',
  transport: 'Transport',
};

/** Renders the correct content component for the active right panel type */
function RightPanelContent({ type }: { type: string | null }) {
  switch (type) {
    case 'building':
      return <BuildingInspector />;
    case 'mail':
      return <MailPanel />;
    case 'search':
      return <SearchPanel />;
    case 'politics':
      return <PoliticsPanel />;
    case 'transport':
      return <TransportPanel />;
    default:
      return null;
  }
}

export function GameScreen() {
  const rightPanel = useUiStore((s) => s.rightPanel);
  const leftPanel = useUiStore((s) => s.leftPanel);
  const closeRightPanel = useUiStore((s) => s.closeRightPanel);
  const closeLeftPanel = useUiStore((s) => s.closeLeftPanel);

  return (
    <div className={styles.screen}>
      {/* Canvas fills viewport — managed by client.ts outside React */}

      {/* InfoWidget — top-right stats card */}
      <InfoWidget />

      {/* LeftRail — action buttons */}
      <LeftRail />

      {/* RightRail — map controls */}
      <RightRail />

      {/* ChatStrip — bottom-edge persistent chat */}
      <ChatStrip />

      {/* Right Panel — building inspector, mail, search, politics, transport */}
      <RightPanel
        open={rightPanel !== null}
        onClose={closeRightPanel}
        title={rightPanel ? RIGHT_PANEL_TITLES[rightPanel] ?? rightPanel : ''}
      >
        <RightPanelContent type={rightPanel} />
      </RightPanel>

      {/* Left Panel — Profile / Facilities */}
      <LeftPanel
        open={leftPanel !== null}
        onClose={closeLeftPanel}
        title={leftPanel ? LEFT_PANEL_CONFIG[leftPanel]?.title ?? '' : ''}
        icon={leftPanel ? LEFT_PANEL_CONFIG[leftPanel]?.icon : undefined}
      >
        {leftPanel === 'empire' && <ProfilePanel />}
        {leftPanel === 'facilities' && <EmpireOverview />}
      </LeftPanel>

      {/* Modals — z-400 */}
      <BuildMenu />
      <CompanyCreationModal />
      <ConnectionPickerModal />
      <SettingsDialog />

      {/* Mobile shell — only renders on < 768px */}
      <MobileShell />

      {/* Command Palette — z-500 */}
      <CommandPalette />
    </div>
  );
}
