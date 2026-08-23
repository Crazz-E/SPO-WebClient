/**
 * Overlay handling shared by the map MODES (building placement, zone painting) — T8.
 *
 * Both modes need the Zones overlay visible to make sense. Until now placement remembered
 * what was shown before and put it back on exit, while zone painting switched Zones off on
 * exit even when the player had it on before (audit, "Overlays" asymmetry). One pair of
 * functions now serves both, and what was remembered is published to the game store so the
 * mode bar can say what happened to the overlay.
 */

import { OVERLAY_LIST, SurfaceType } from '@/shared/types';
import type { ClientHandlerContext } from './client-context';
import { useGameStore } from '../store/game-store';

export type OverlayBeforeMode = { type: 'zones' | 'overlay' | 'none'; overlay?: SurfaceType };

/** Show the Zones overlay for a mode, remembering what was shown before. */
export function enterZonesOverlayForMode(ctx: ClientHandlerContext): void {
  let before: OverlayBeforeMode;
  if (ctx.isCityZonesEnabled) {
    before = { type: 'zones' };
  } else if (ctx.activeOverlayType !== null) {
    before = { type: 'overlay', overlay: ctx.activeOverlayType };
    ctx.toggleZoneOverlay(false, ctx.activeOverlayType);
    ctx.activeOverlayType = null;
  } else {
    before = { type: 'none' };
  }
  ctx.overlayBeforePlacement = before;
  useGameStore.getState().setOverlayBeforeMode(before);

  if (!ctx.isCityZonesEnabled) {
    ctx.isCityZonesEnabled = true;
    ctx.toggleZoneOverlay(true, SurfaceType.ZONES);
  }
}

/** Leave a mode: put back whatever was shown before it (Zones stays if it was already on). */
export function leaveZonesOverlayAfterMode(ctx: ClientHandlerContext): void {
  const prev = ctx.overlayBeforePlacement;
  ctx.overlayBeforePlacement = { type: 'none' };
  useGameStore.getState().setOverlayBeforeMode(null);

  if (prev.type === 'zones') return;

  ctx.isCityZonesEnabled = false;
  ctx.toggleZoneOverlay(false, SurfaceType.ZONES);

  if (prev.type === 'overlay' && prev.overlay) {
    ctx.activeOverlayType = prev.overlay;
    ctx.toggleZoneOverlay(true, prev.overlay);
  }
}

/** The sentence the mode bar shows about the overlay, or null when nothing changed. */
export function overlayModeNote(before: OverlayBeforeMode | null): string | null {
  if (!before || before.type === 'zones') return null;
  if (before.type === 'overlay' && before.overlay) {
    const label = OVERLAY_LIST.find((o) => o.type === before.overlay)?.label ?? before.overlay;
    return `Zones overlay shown — ${label} comes back when done`;
  }
  return 'Zones overlay shown for this mode';
}
