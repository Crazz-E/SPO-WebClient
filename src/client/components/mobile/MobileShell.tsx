/**
 * MobileShell — Map-first mobile layout.
 *
 * The canvas map is ALWAYS visible at 100% viewport.
 * All UI floats on top: MobileInfoBar (top), BottomSheet (content), BottomNav (bottom).
 * Tab content is routed into the BottomSheet — no opaque content layer.
 */

import { useEffect } from 'react';
import { useUiStore, type MobileTab } from '../../store/ui-store';
import { useResponsive } from '../../hooks/useResponsive';
import { useClient } from '../../context';
import { EmpireOverview } from '../empire';
import { ChatStrip } from '../chat';
import { ErrorBoundary } from '../common';
import { SurfaceContent, SURFACE_TITLES } from '../sheet';
import { useChatStore } from '../../store/chat-store';
import { BottomNav } from './BottomNav';
import { BottomSheet } from './BottomSheet';
import { ChatBanner } from './ChatBanner';
import { MobileBuildContent } from './MobileBuildContent';
import { MobileInfoBar } from './MobileInfoBar';
import { MinimapToggleButton } from './MinimapToggleButton';
import { MobileMenu } from './MobileMenu';
import { PlacementHUD } from './PlacementHUD';
import styles from './MobileShell.module.css';

/** Map mobileTab → sheet title */
const SHEET_TITLES: Record<MobileTab, string> = {
  map: '',
  chat: 'Chat',
  build: 'Build',
  favorites: 'My Facilities',
  more: 'Menu',
};

/** Content rendered inside the BottomSheet: the top of the surface stack wins, then the tab */
function SheetContent() {
  const mobileTab = useUiStore((s) => s.mobileTab);
  const top = useUiStore((s) => s.stack[s.stack.length - 1]);
  const resetUnreadChat = useChatStore((s) => s.resetUnreadChat);

  // Reset unread chat count when the chat tab is shown (after render, not during it)
  useEffect(() => {
    if (mobileTab === 'chat' && !top) resetUnreadChat();
  }, [mobileTab, top, resetUnreadChat]);

  // The surface stack takes priority — every desktop surface (politics and profile included) is reachable here
  if (top) return <SurfaceContent kind={top.kind} />;

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
  const top = useUiStore((s) => s.stack[s.stack.length - 1]);
  const stackDepth = useUiStore((s) => s.stack.length);
  const popSurface = useUiStore((s) => s.popSurface);
  const setMobileTab = useUiStore((s) => s.setMobileTab);
  const isPlacingBuilding = useUiStore((s) => s.isPlacingBuilding);
  const placementValid = useUiStore((s) => s.placementValid);
  const client = useClient();

  if (!isMobile) return null;

  // Determine if the BottomSheet should be open
  const hasRightPanel = top != null;
  const sheetOpen = mobileTab !== 'map' || hasRightPanel;

  // Sheet title from the top surface or the active tab
  const sheetTitle = top ? SURFACE_TITLES[top.kind] : SHEET_TITLES[mobileTab];

  // Closing unstacks one surface (a supplier search returns to its building); the tab closes last.
  const handleSheetClose = () => {
    if (stackDepth > 0) {
      popSurface();
    } else {
      setMobileTab('map');
    }
  };

  return (
    <div className={styles.shell} style={{ pointerEvents: 'none' }}>
      {/* Compact info bar at top */}
      <MobileInfoBar />

      {/* Minimap trigger — top-right triangle, only on map tab */}
      {mobileTab === 'map' && !hasRightPanel && !isPlacingBuilding && (
        <MinimapToggleButton />
      )}

      {/* Chat banner — only visible on map tab */}
      {mobileTab === 'map' && !hasRightPanel && <ChatBanner />}

      {/* Universal BottomSheet — all non-map content goes here */}
      <BottomSheet
        open={sheetOpen}
        onClose={handleSheetClose}
        title={sheetTitle}
      >
        <ErrorBoundary>
          <SheetContent />
        </ErrorBoundary>
      </BottomSheet>

      {/* Bottom navigation — replaced by PlacementHUD during building placement */}
      {isPlacingBuilding ? (
        <PlacementHUD
          onCancel={() => client.onCancelBuildingPlacement()}
          onRotate={() => client.onRotateCW()}
          onConfirm={() => client.onConfirmBuildingPlacement()}
          canConfirm={placementValid}
        />
      ) : (
        <BottomNav />
      )}
    </div>
  );
}
