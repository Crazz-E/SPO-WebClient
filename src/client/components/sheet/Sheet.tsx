/**
 * Sheet — the universal surface of the design (doc/ux/handoff/00-socle.md §3).
 *
 * One sheet renders the TOP of `ui-store.stack`; the chips above the content are the stack
 * itself, so whatever the player opened from here is one click back. There is no scrim:
 * the map stays clickable, and clicking another building replaces the root surface unless
 * the sheet is pinned. This component replaces RightPanel + LeftPanel on desktop; the mobile
 * shell routes the same stack into its BottomSheet.
 *
 * Geometry is the historical right panel's (full height, `--panel-width-desktop`) so the
 * HUD elements that shift when a panel is open keep working until socle-4 replaces them.
 */

import { Suspense, type ReactNode } from 'react';
import { ChevronRight, Pin, PinOff, X, Building2, Mail, Search, Truck, Landmark, User, Heart, Layers } from 'lucide-react';
import { useUiStore, type SurfaceKind } from '../../store/ui-store';
import { usePanel } from '../../hooks/usePanel';
import { Chip, IconButton, ErrorBoundary } from '../common';
import { BuildingSurface } from './BuildingSurface';
import { MailPanel } from '../mail';
import { SearchPanel } from '../search';
import { TransportPanel } from '../transport';
import { ProfilePanel, EmpireOverview } from '../empire';
import { OverlayMenu } from '../hud/OverlayMenu';
import { PoliticsHome } from '../politics/PoliticsHome';
import styles from './Sheet.module.css';

export const SURFACE_TITLES: Record<SurfaceKind, string> = {
  building: 'Building Inspector',
  mail: 'Mail',
  search: 'Search',
  transport: 'Transport',
  politics: 'Government',
  empire: 'Profile',
  facilities: 'My Facilities',
  overlays: 'Map Overlays',
};

const SURFACE_ICONS: Record<SurfaceKind, ReactNode> = {
  building: <Building2 size={16} />,
  mail: <Mail size={16} />,
  search: <Search size={16} />,
  transport: <Truck size={16} />,
  politics: <Landmark size={16} />,
  empire: <User size={16} />,
  facilities: <Heart size={16} />,
  overlays: <Layers size={16} />,
};

/** Contents that draw their own header (name, status, refresh…). */
const OWN_HEADER: ReadonlySet<SurfaceKind> = new Set<SurfaceKind>(['building']);

export function SurfaceContent({ kind }: { kind: SurfaceKind }) {
  switch (kind) {
    case 'building':
      return <BuildingSurface />;
    case 'mail':
      return <MailPanel />;
    case 'search':
      return <SearchPanel />;
    case 'transport':
      return <TransportPanel />;
    case 'politics':
      return <PoliticsHome />;
    case 'empire':
      return <ProfilePanel />;
    case 'facilities':
      return <EmpireOverview />;
    case 'overlays':
      return <OverlayMenu />;
    default:
      return null;
  }
}

export function Sheet() {
  const stack = useUiStore((s) => s.stack);
  const pinned = useUiStore((s) => s.pinned);
  const setPinned = useUiStore((s) => s.setPinned);
  const popToSurface = useUiStore((s) => s.popToSurface);
  const clearSurfaces = useUiStore((s) => s.clearSurfaces);
  const open = stack.length > 0;
  const { visible, animating } = usePanel(open);

  if (!visible) return null;

  const top = stack[stack.length - 1];
  const kind = top?.kind ?? 'building';
  const title = SURFACE_TITLES[kind];

  return (
    <aside
      className={`${styles.sheet} ${animating ? styles.open : styles.closed}`}
      role="region"
      aria-label={title}
    >
      <div className={styles.stackRow}>
        <nav className={styles.chips} aria-label="Open surfaces">
          {stack.map((surface, i) => {
            const isTop = i === stack.length - 1;
            const label = SURFACE_TITLES[surface.kind];
            const collapsed = stack.length > 3 && i > 0 && i < stack.length - 1;
            return (
              <span key={`${surface.kind}-${i}`} className={styles.chipWrap}>
                {i > 0 && <ChevronRight size={12} className={styles.sep} aria-hidden="true" />}
                {isTop ? (
                  <Chip variant="stack" active title={label}>{label}</Chip>
                ) : (
                  <Chip variant="stack" onClick={() => popToSurface(i)} title={collapsed ? label : undefined}>
                    {collapsed ? '…' : label}
                  </Chip>
                )}
              </span>
            );
          })}
        </nav>
        <div className={styles.stackActions}>
          <IconButton
            icon={pinned ? <PinOff size={16} /> : <Pin size={16} />}
            label={pinned ? 'Unpin sheet — map clicks replace this content' : 'Pin sheet — keep it open while clicking the map'}
            size="sm"
            active={pinned}
            onClick={() => setPinned(!pinned)}
          />
          <IconButton icon={<X size={18} />} label="Close" size="sm" onClick={clearSurfaces} />
        </div>
      </div>

      {!OWN_HEADER.has(kind) && (
        <div className={styles.header}>
          <span className={styles.icon} aria-hidden="true">{SURFACE_ICONS[kind]}</span>
          <h2 className={styles.title} tabIndex={-1}>{title}</h2>
        </div>
      )}

      <div className={styles.content}>
        <ErrorBoundary>
          <Suspense fallback={null}>
            <SurfaceContent kind={kind} />
          </Suspense>
        </ErrorBoundary>
      </div>
    </aside>
  );
}
