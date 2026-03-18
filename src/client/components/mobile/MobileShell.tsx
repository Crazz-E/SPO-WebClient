/**
 * MobileShell — Map-first mobile layout.
 *
 * The canvas map is ALWAYS visible at 100% viewport.
 * All UI floats on top: MobileInfoBar (top), BottomSheet (content), BottomNav (bottom).
 * Tab content is routed into the BottomSheet — no opaque content layer.
 */

import { useUiStore, type MobileTab } from '../../store/ui-store';
import { useResponsive } from '../../hooks/useResponsive';
import { EmpireOverview } from '../empire';
import { MailPanel } from '../mail';
import { BuildingInspector } from '../building';
import { ChatStrip } from '../chat';
import { SearchPanel } from '../search';
import { TransportPanel } from '../transport';
import { useChatStore } from '../../store/chat-store';
import { BottomNav } from './BottomNav';
import { BottomSheet } from './BottomSheet';
import { ChatBanner } from './ChatBanner';
import { MobileBuildContent } from './MobileBuildContent';
import { MobileInfoBar } from './MobileInfoBar';
import { MobileMenu } from './MobileMenu';
import styles from './MobileShell.module.css';

/** Map mobileTab → sheet title */
const SHEET_TITLES: Record<MobileTab, string> = {
  map: '',
  chat: 'Chat',
  build: 'Build',
  favorites: 'My Facilities',
  more: 'Menu',
};

/** Right panel override titles */
const PANEL_TITLES: Record<string, string> = {
  building: 'Building Inspector',
  mail: 'Mail',
  search: 'Search',
  transport: 'Transport',
  politics: 'Capitol',
};

/** Content rendered inside the BottomSheet based on active tab or right panel */
function SheetContent() {
  const mobileTab = useUiStore((s) => s.mobileTab);
  const rightPanel = useUiStore((s) => s.rightPanel);
  const resetUnreadChat = useChatStore((s) => s.resetUnreadChat);

  // Reset unread chat count when chat tab is active
  if (mobileTab === 'chat' && !rightPanel) {
    resetUnreadChat();
  }

  // Right panel overrides take priority
  if (rightPanel === 'building') return <BuildingInspector />;
  if (rightPanel === 'mail') return <MailPanel />;
  if (rightPanel === 'search') return <SearchPanel />;
  if (rightPanel === 'transport') return <TransportPanel />;

  switch (mobileTab) {
    case 'chat':
      return <ChatStrip mode="embedded" />;
    case 'build':
      return <MobileBuildContent />;
    case 'favorites':
      return <EmpireOverview />;
    case 'more':
      return <MobileMenu />;
    default:
      return null;
  }
}

export function MobileShell() {
  const { isMobile } = useResponsive();
  const mobileTab = useUiStore((s) => s.mobileTab);
  const rightPanel = useUiStore((s) => s.rightPanel);
  const closeRightPanel = useUiStore((s) => s.closeRightPanel);
  const setMobileTab = useUiStore((s) => s.setMobileTab);

  if (!isMobile) return null;

  // Determine if the BottomSheet should be open
  const hasRightPanel = rightPanel != null;
  const sheetOpen = mobileTab !== 'map' || hasRightPanel;

  // Sheet title from right panel override or active tab
  const sheetTitle = hasRightPanel
    ? (PANEL_TITLES[rightPanel] ?? '')
    : SHEET_TITLES[mobileTab];

  const handleSheetClose = () => {
    if (hasRightPanel) {
      closeRightPanel();
    } else {
      setMobileTab('map');
    }
  };

  return (
    <div className={styles.shell}>
      {/* Compact info bar at top */}
      <MobileInfoBar />

      {/* Chat banner — only visible on map tab */}
      {mobileTab === 'map' && !hasRightPanel && <ChatBanner />}

      {/* Universal BottomSheet — all non-map content goes here */}
      <BottomSheet
        open={sheetOpen}
        onClose={handleSheetClose}
        title={sheetTitle}
      >
        <SheetContent />
      </BottomSheet>

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
