/**
 * MobileShell — Mobile-only layout wrapper.
 *
 * Replaces the desktop HUD on small screens (< 768px).
 * Shows TopBar (slim) at top, active tab content in middle, BottomNav at bottom.
 * The MobileShell is rendered alongside desktop HUD — CSS handles visibility.
 */

import { useUiStore } from '../../store/ui-store';
import { useResponsive } from '../../hooks/useResponsive';
import { EmpireOverview } from '../empire';
import { MailPanel } from '../mail';
import { BuildingInspector } from '../building';
import { BuildMenu } from '../modals';
import { ChatStrip } from '../chat';
import { SearchPanel } from '../search';
import { PoliticsPanel } from '../politics';
import { TransportPanel } from '../transport';
import { BottomNav } from './BottomNav';
import { BottomSheet } from './BottomSheet';
import styles from './MobileShell.module.css';

/** "More" sub-menu items */
function MoreMenu() {
  const openRightPanel = useUiStore((s) => s.openRightPanel);

  return (
    <div className={styles.moreMenu}>
      <button className={styles.moreItem} onClick={() => openRightPanel('search')}>
        Search
      </button>
      <button className={styles.moreItem} onClick={() => openRightPanel('politics')}>
        Politics
      </button>
      <button className={styles.moreItem} onClick={() => openRightPanel('transport')}>
        Transport
      </button>
    </div>
  );
}

/** Content for the active tab on mobile */
function MobileTabContent() {
  const mobileTab = useUiStore((s) => s.mobileTab);
  const rightPanel = useUiStore((s) => s.rightPanel);

  // If a right panel is explicitly open (e.g. from More menu), show it
  if (rightPanel === 'search') return <SearchPanel />;
  if (rightPanel === 'politics') return <PoliticsPanel />;
  if (rightPanel === 'transport') return <TransportPanel />;

  switch (mobileTab) {
    case 'map':
      return <div className={styles.mapTab}>Map view active</div>;
    case 'empire':
      return <EmpireOverview />;
    case 'build':
      return <BuildMenu />;
    case 'mail':
      return <MailPanel />;
    case 'more':
      return <MoreMenu />;
    default:
      return null;
  }
}

export function MobileShell() {
  const { isMobile } = useResponsive();
  const rightPanel = useUiStore((s) => s.rightPanel);
  const closeRightPanel = useUiStore((s) => s.closeRightPanel);

  // Only render on mobile
  if (!isMobile) return null;

  return (
    <div className={styles.shell}>
      {/* Main content area between TopBar and BottomNav */}
      <div className={styles.content}>
        <MobileTabContent />
      </div>

      {/* Bottom navigation */}
      <BottomNav />

      {/* Bottom sheet for building inspector on mobile */}
      <BottomSheet
        open={rightPanel === 'building'}
        onClose={closeRightPanel}
        title="Building Inspector"
      >
        <BuildingInspector />
      </BottomSheet>

      {/* Chat: hidden strip on mobile, accessible via expanded more menu later */}
      <ChatStrip />
    </div>
  );
}
