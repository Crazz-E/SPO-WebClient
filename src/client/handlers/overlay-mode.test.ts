import { SurfaceType } from '@/shared/types';
import { useGameStore } from '../store/game-store';
import { enterZonesOverlayForMode, leaveZonesOverlayAfterMode, overlayModeNote } from './overlay-mode';
import type { ClientHandlerContext } from './client-context';

function makeCtx(zones: boolean, overlay: SurfaceType | null) {
  const ctx = {
    isCityZonesEnabled: zones,
    activeOverlayType: overlay,
    overlayBeforePlacement: { type: 'none' },
    toggleZoneOverlay: jest.fn(),
  } as unknown as ClientHandlerContext;
  return ctx;
}

describe('overlay handling shared by the map modes', () => {
  beforeEach(() => useGameStore.setState({ overlayBeforeMode: null }));

  it('nothing shown before: Zones is switched on for the mode and off after it', () => {
    const ctx = makeCtx(false, null);
    enterZonesOverlayForMode(ctx);
    expect(ctx.isCityZonesEnabled).toBe(true);
    expect(ctx.toggleZoneOverlay).toHaveBeenCalledWith(true, SurfaceType.ZONES);
    expect(useGameStore.getState().overlayBeforeMode).toEqual({ type: 'none' });
    leaveZonesOverlayAfterMode(ctx);
    expect(ctx.isCityZonesEnabled).toBe(false);
    expect(ctx.toggleZoneOverlay).toHaveBeenLastCalledWith(false, SurfaceType.ZONES);
    expect(useGameStore.getState().overlayBeforeMode).toBeNull();
  });

  it('another overlay before: hidden for the mode, restored after it', () => {
    const ctx = makeCtx(false, SurfaceType.CRIME);
    enterZonesOverlayForMode(ctx);
    expect(ctx.activeOverlayType).toBeNull();
    expect(ctx.toggleZoneOverlay).toHaveBeenCalledWith(false, SurfaceType.CRIME);
    expect(useGameStore.getState().overlayBeforeMode).toEqual({ type: 'overlay', overlay: SurfaceType.CRIME });
    leaveZonesOverlayAfterMode(ctx);
    expect(ctx.activeOverlayType).toBe(SurfaceType.CRIME);
    expect(ctx.toggleZoneOverlay).toHaveBeenLastCalledWith(true, SurfaceType.CRIME);
  });

  it('Zones already on: untouched on enter, still on after leaving', () => {
    const ctx = makeCtx(true, null);
    enterZonesOverlayForMode(ctx);
    expect(ctx.toggleZoneOverlay).not.toHaveBeenCalled();
    leaveZonesOverlayAfterMode(ctx);
    expect(ctx.isCityZonesEnabled).toBe(true);
    expect(ctx.toggleZoneOverlay).not.toHaveBeenCalled();
  });

  it('words the note for the mode bar', () => {
    expect(overlayModeNote(null)).toBeNull();
    expect(overlayModeNote({ type: 'zones' })).toBeNull();
    expect(overlayModeNote({ type: 'none' })).toBe('Zones overlay shown for this mode');
    expect(overlayModeNote({ type: 'overlay', overlay: SurfaceType.CRIME })).toBe('Zones overlay shown — Crime comes back when done');
    expect(overlayModeNote({ type: 'overlay', overlay: 'weird' as SurfaceType })).toBe('Zones overlay shown — weird comes back when done');
  });
});
