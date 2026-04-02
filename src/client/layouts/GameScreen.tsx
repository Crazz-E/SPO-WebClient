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

import { lazy, Suspense } from 'react';
import { useUiStore } from '../store';
import { InfoWidget, LeftRail, RightRail, VersionBadge } from '../components/hud';
import { RightPanel, LeftPanel } from '../components/panels';
import { ChatStrip } from '../components/chat';
import { BuildingInspector, StatusOverlay } from '../components/building';
import { ProfilePanel, EmpireOverview } from '../components/empire';
import { MailPanel } from '../components/mail';
import { SearchPanel } from '../components/search';
import { TransportPanel } from '../components/transport';
import { OverlayMenu } from '../components/hud/OverlayMenu';
import { ServerSwitchOverlay, ZoneTypePicker } from '../components/modals';
import { useChangelogCheck } from '../hooks/useChangelogCheck';
import { CommandPalette } from '../components/command-palette';
import { MobileShell } from '../components/mobile';
import { ErrorBoundary, ConfirmDialog, PromptDialog, ReconnectingOverlay } from '../components/common';
import { User, Heart, Layers } from 'lucide-react';
import type { ReactNode } from 'react';

// Lazy-loaded modals — not needed on initial render
const BuildMenu = lazy(() => import('../components/modals/BuildMenu').then(m => ({ default: m.BuildMenu })));
const BuildingInspectorModal = lazy(() => import('../components/modals/BuildingInspectorModal').then(m => ({ default: m.BuildingInspectorModal })));
const ChangelogModal = lazy(() => import('../components/modals/ChangelogModal').then(m => ({ default: m.ChangelogModal })));
const ConnectionPickerModal = lazy(() => import('../components/modals/ConnectionPickerModal').then(m => ({ default: m.ConnectionPickerModal })));
const SettingsDialog = lazy(() => import('../components/modals/SettingsDialog').then(m => ({ default: m.SettingsDialog })));
const SupplierSearchModal = lazy(() => import('../components/modals/SupplierSearchModal').then(m => ({ default: m.SupplierSearchModal })));

/** Config for each left panel type */
const LEFT_PANEL_CONFIG: Record<string, { title: string; icon: ReactNode }> = {
  empire: { title: 'Profile', icon: <User size={18} /> },
  facilities: { title: 'My Facilities', icon: <Heart size={18} /> },
  overlays: { title: 'Map Overlays', icon: <Layers size={18} /> },
};
import styles from './GameScreen.module.css';

/** Title labels for each right panel type */
const RIGHT_PANEL_TITLES: Record<string, string> = {
  building: 'Building Inspector',
  mail: 'Mail',
  search: 'Search',
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
    case 'transport':
      return <TransportPanel />;
    default:
      return null;
  }
}

export function GameScreen() {
  const rightPanel = useUiStore((s) => s.rightPanel);
  const leftPanel = useUiStore((s) => s.leftPanel);
  const modal = useUiStore((s) => s.modal);
  const confirmPayload = useUiStore((s) => s.confirmPayload);
  const promptPayload = useUiStore((s) => s.promptPayload);
  const closeModal = useUiStore((s) => s.closeModal);
  const closeRightPanel = useUiStore((s) => s.closeRightPanel);
  const closeLeftPanel = useUiStore((s) => s.closeLeftPanel);

  useChangelogCheck();

  return (
    <div className={styles.screen}>
      {/* Canvas fills viewport — managed by client.ts outside React */}

      {/* StatusOverlay — floating building preview (z-250, between map and panels) */}
      <StatusOverlay />


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
        hideHeader={rightPanel === 'building'}
        noScrim={rightPanel === 'building'}
      >
        <ErrorBoundary>
          <RightPanelContent type={rightPanel} />
        </ErrorBoundary>
      </RightPanel>

      {/* Left Panel — Profile / Facilities */}
      <LeftPanel
        open={leftPanel !== null}
        onClose={closeLeftPanel}
        title={leftPanel ? LEFT_PANEL_CONFIG[leftPanel]?.title ?? '' : ''}
        icon={leftPanel ? LEFT_PANEL_CONFIG[leftPanel]?.icon : undefined}
      >
        <ErrorBoundary>
          {leftPanel === 'empire' && <ProfilePanel />}
          {leftPanel === 'facilities' && <EmpireOverview />}
          {leftPanel === 'overlays' && <OverlayMenu />}
        </ErrorBoundary>
      </LeftPanel>

      {/* Modals — z-400 (lazy-loaded, not needed on initial render) */}
      <Suspense fallback={null}>
        <BuildingInspectorModal />
        <BuildMenu />
        <ConnectionPickerModal />
        <SupplierSearchModal />
        <SettingsDialog />
        <ChangelogModal />
      </Suspense>
      <ZoneTypePicker />

      {/* Confirm Dialog — z-400 */}
      {modal === 'confirm' && confirmPayload && (
        <ConfirmDialog
          title={confirmPayload.title}
          message={confirmPayload.message}
          onConfirm={() => { confirmPayload.onConfirm(); closeModal(); }}
          onCancel={closeModal}
        />
      )}

      {/* Prompt Dialog — z-400 */}
      {modal === 'prompt' && promptPayload && (
        <PromptDialog
          title={promptPayload.title}
          message={promptPayload.message}
          placeholder={promptPayload.placeholder}
          defaultValue={promptPayload.defaultValue}
          onSubmit={(value) => { promptPayload.onSubmit(value); closeModal(); }}
          onCancel={closeModal}
        />
      )}

      {/* Server Switch Overlay — z-450, between modals and command palette */}
      <ServerSwitchOverlay />

      {/* Version badge — bottom-right, desktop only */}
      <VersionBadge />

      {/* Mobile shell — only renders on < 768px */}
      <MobileShell />

      {/* Command Palette — z-500 */}
      <CommandPalette />

      {/* Reconnecting overlay — z-600, shown when WebSocket drops unexpectedly */}
      <ReconnectingOverlay />
    </div>
  );
}
