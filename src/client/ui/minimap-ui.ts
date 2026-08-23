/**
 * MinimapUI — Top-down terrain colormap minimap with diamond frame.
 *
 * Uses terrain pixel data from the renderer to build a client-side colormap.
 * The terrain grid is drawn rotated 45° to match the isometric view orientation:
 *   - Top vertex    = tile (maxI, maxJ)
 *   - Right vertex  = tile (0, maxJ)
 *   - Bottom vertex = tile (0, 0)
 *   - Left vertex   = tile (maxI, 0)
 *
 * Interaction:
 *  - Click/tap inside → re-center main camera on that map position
 *
 * Layout:
 *  Desktop (≥ 768 px): docked top-left, shifts right when the left panel is open
 *  Mobile  (< 768 px): never docked — a floating diamond would sit on the
 *                      BottomSheet / BottomNav. The only mobile form is the
 *                      fullscreen overlay opened from MinimapToggleButton, and
 *                      it closes itself as soon as any menu opens.
 *
 * Size is controlled via Settings (Small / Medium / Large preset).
 */

import { useUiStore } from '../store/ui-store';
import type { MinimapSize } from '../store/game-store';
import { buildTerrainColormap, sampleAtlasColors, type MinimapRendererAPI, type RGB } from './minimap-colormap';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** Renderer interface — only the subset MinimapUI needs. */
export type { MinimapRendererAPI } from './minimap-colormap';

// ---------------------------------------------------------------------------
// Layout & interaction constants
// ---------------------------------------------------------------------------

const DESKTOP_PAD   = 12;   // px — screen-edge gap (desktop)
const MOBILE_SIZE   = 140;  // px — fixed diamond size (mobile)
const MIN_SIZE      = 120;  // px — minimum size
const MAX_SIZE      = 500;  // px — maximum size
/**
 * px — viewport width breakpoint. Must stay equal to `useResponsive`'s `tablet`
 * breakpoint and to the `max-width: 767px` guard every mobile stylesheet uses:
 * a lower value here left a band of widths (landscape phones, small tablets)
 * where the mobile shell was on screen *and* the docked minimap was floating
 * over it.
 */
const MOBILE_BP     = 768;
const UPDATE_MS     = 500;  // ms — render interval

/** Fullscreen scrim stacking level — above the mobile sheet, below any modal. */
const FULLSCREEN_Z  = 'calc(var(--z-modal) - 1)';

/** Pixel sizes for each preset. */
const SIZE_MAP: Record<MinimapSize, number> = {
  small:  160,
  medium: 220,
  large:  320,
};

// CSS filter strings for the container's drop-shadow glow
const FILTER_BASE = 'drop-shadow(0 0 10px rgba(56,189,248,0.28)) drop-shadow(0 0 2px rgba(148,163,184,0.5)) drop-shadow(0 4px 12px rgba(0,0,0,0.70))';

/** Fraction of diamond size reserved as padding on each side. */
const DIAMOND_PAD = 0.06;

const COS45 = Math.SQRT2 / 2;

// ---------------------------------------------------------------------------
// MinimapUI class
// ---------------------------------------------------------------------------

export class MinimapUI {
  private wrapper: HTMLElement | null   = null;
  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private renderer: MinimapRendererAPI | null = null;

  private visible = false;
  private fullscreen = false;
  private updateTimer: ReturnType<typeof setInterval> | null = null;

  /** Current diamond bounding-box side (always square). */
  private currentSize: number = SIZE_MAP.medium;

  /** Preset side chosen in Settings — restored when the viewport grows back. */
  private desktopSize: number = SIZE_MAP.medium;

  /** Layout the DOM currently reflects — `null` until the DOM exists. */
  private mobileLayout: boolean | null = null;

  /** Bound resize/orientation handler, kept so destroy() can detach it. */
  private onViewportChange: (() => void) | null = null;

  private unsubPanel: (() => void) | null = null;
  private unsubFullscreen: (() => void) | null = null;

  /** Cached downsampled terrain colormap canvas. */
  private terrainCanvas: HTMLCanvasElement | null = null;
  private terrainCacheKey = '';

  /** Atlas-sampled per-landId RGB colors (season-aware). */
  private atlasColorMap: Map<number, RGB> | null = null;
  private atlasColorKey = '';

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  public setRenderer(renderer: MinimapRendererAPI): void {
    this.renderer = renderer;
    this.show();
  }

  public show(): void {
    // On mobile, DOM is created but hidden — fullscreen store state controls visibility
    if (this.isMobile()) {
      this.ensureDOM();
      this.enterMobileLayout();
      return;
    }

    if (this.visible) return;
    this.visible = true;
    this.ensureDOM();
    // Re-apply the docked style rather than just flipping `display`: a previous
    // fullscreen session replaced the wrapper's whole style block, and showing
    // that again would put a full-viewport scrim over the UI.
    this.applyDockedStyle('block');
    this.startUpdating();
  }

  public hide(): void {
    if (!this.visible) return;
    this.visible = false;
    if (this.wrapper) this.wrapper.style.display = 'none';
    this.stopUpdating();
  }

  public toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  public isVisible(): boolean {
    return this.visible;
  }

  /** Apply a size preset from Settings. Mobile has no docked minimap to size. */
  public setSize(preset: MinimapSize): void {
    const px = SIZE_MAP[preset] ?? SIZE_MAP.medium;
    this.desktopSize = px;
    if (this.isMobile()) return;
    this.applySize(px);
  }

  public destroy(): void {
    this.visible = false;
    this.fullscreen = false;
    this.stopUpdating();
    if (this.unsubPanel) { this.unsubPanel(); this.unsubPanel = null; }
    if (this.unsubFullscreen) { this.unsubFullscreen(); this.unsubFullscreen = null; }
    this.detachViewportListener();
    this.mobileLayout = null;
    if (this.wrapper?.parentElement) {
      this.wrapper.parentElement.removeChild(this.wrapper);
    }
    this.wrapper = null;
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.terrainCanvas = null;
    this.terrainCacheKey = '';
    this.atlasColorMap = null;
    this.atlasColorKey = '';
  }

  // ---------------------------------------------------------------------------
  // Viewport helpers
  // ---------------------------------------------------------------------------

  private isMobile(): boolean {
    return typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth < MOBILE_BP;
  }

  // ---------------------------------------------------------------------------
  // Positioning
  // ---------------------------------------------------------------------------

  private applyPositioning(): void {
    if (!this.wrapper) return;
    // Docked minimap is desktop-only, so there is a single anchor: top-left,
    // pushed right by an open left panel.
    this.wrapper.style.bottom = '';
    this.wrapper.style.top    = `${DESKTOP_PAD}px`;
    const panelOpen = useUiStore.getState().leftPanel !== null;
    if (panelOpen) {
      const w = getComputedStyle(document.documentElement)
        .getPropertyValue('--panel-width-desktop').trim() || '420px';
      this.wrapper.style.left = `calc(${w} + ${DESKTOP_PAD}px)`;
    } else {
      this.wrapper.style.left = `${DESKTOP_PAD}px`;
    }
  }

  /**
   * Write the docked wrapper/container style from scratch.
   *
   * Both fullscreen entry and exit rewrite these elements wholesale, so every
   * path back to the docked form goes through here — that is what guarantees a
   * later `show()` can never resurrect the fullscreen scrim.
   */
  private applyDockedStyle(display: 'block' | 'none'): void {
    if (!this.wrapper || !this.container) return;

    this.wrapper.onclick = null;
    this.wrapper.style.cssText = `
      position: fixed;
      top: ${DESKTOP_PAD}px;
      left: ${DESKTOP_PAD}px;
      width: ${this.currentSize}px;
      height: ${this.currentSize}px;
      overflow: visible;
      z-index: var(--z-dropdown, 100);
      pointer-events: none;
      display: ${display};
      transition: left 250ms cubic-bezier(0.16,1,0.3,1),
                  bottom 250ms cubic-bezier(0.16,1,0.3,1);
    `;

    this.container.style.position  = 'absolute';
    this.container.style.inset     = '0';
    this.container.style.width     = '';
    this.container.style.height    = '';
    this.container.style.top       = '';
    this.container.style.left      = '';
    this.container.style.transform = '';

    this.applyPositioning();
  }

  // ---------------------------------------------------------------------------
  // Layout mode — the docked minimap exists on desktop only
  // ---------------------------------------------------------------------------

  /** Tear the docked minimap down: hidden, idle, and never over the mobile UI. */
  private enterMobileLayout(): void {
    this.visible = false;
    this.stopUpdating();
    if (useUiStore.getState().minimapFullscreen) {
      useUiStore.getState().setMinimapFullscreen(false);
    }
    this.fullscreen = false;
    this.currentSize = MOBILE_SIZE;
    this.applyDockedStyle('none');
    this.subscribeFullscreen();
  }

  /** Bring the docked minimap back at its Settings size. */
  private leaveMobileLayout(): void {
    if (useUiStore.getState().minimapFullscreen) {
      useUiStore.getState().setMinimapFullscreen(false);
    }
    this.fullscreen = false;
    this.visible = true;
    this.applySize(this.desktopSize);
    this.applyDockedStyle('block');
    this.startUpdating();
  }

  private attachViewportListener(): void {
    if (this.onViewportChange) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    this.onViewportChange = () => this.handleViewportChange();
    window.addEventListener('resize', this.onViewportChange);
    window.addEventListener('orientationchange', this.onViewportChange);
  }

  private detachViewportListener(): void {
    if (!this.onViewportChange) return;
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('resize', this.onViewportChange);
      window.removeEventListener('orientationchange', this.onViewportChange);
    }
    this.onViewportChange = null;
  }

  /**
   * A rotation crosses the breakpoint far more often than a window drag does —
   * without this the minimap kept whichever layout it was built with, which is
   * how a desktop-sized diamond ended up floating over the mobile shell.
   */
  private handleViewportChange(): void {
    if (!this.wrapper) return;
    const mobile = this.isMobile();

    if (mobile !== this.mobileLayout) {
      this.mobileLayout = mobile;
      mobile ? this.enterMobileLayout() : this.leaveMobileLayout();
      return;
    }

    // Same layout — a fullscreen diamond still has to follow the new viewport.
    if (this.fullscreen) this.enterFullscreen();
  }

  /**
   * Any surface the fullscreen minimap must not sit on top of. The scrim covers
   * the whole viewport, so leaving it up over a menu blocks every control
   * underneath it.
   */
  private isMenuOpen(): boolean {
    const s = useUiStore.getState();
    return s.modal !== null
      || s.commandPaletteOpen
      || s.rightPanel !== null
      || s.leftPanel !== null
      || s.mobileTab !== 'map'
      || s.isPlacingBuilding;
  }

  /** Re-anchor on panel changes, and never let the scrim outlive a menu opening. */
  private onUiStateChange(): void {
    this.applyPositioning();
    if (useUiStore.getState().minimapFullscreen && this.isMenuOpen()) {
      useUiStore.getState().setMinimapFullscreen(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Fullscreen mode (mobile)
  // ---------------------------------------------------------------------------

  private subscribeFullscreen(): void {
    if (this.unsubFullscreen) return;
    let prev = useUiStore.getState().minimapFullscreen;
    this.unsubFullscreen = useUiStore.subscribe(() => {
      const next = useUiStore.getState().minimapFullscreen;
      if (next !== prev) {
        prev = next;
        next ? this.enterFullscreen() : this.exitFullscreen();
      }
    });
  }

  private enterFullscreen(): void {
    if (!this.wrapper || !this.container || !this.canvas) return;
    this.fullscreen = true;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fsSize = Math.min(vw, vh);
    this.currentSize = fsSize;

    // Wrapper: fill viewport as scrim
    this.wrapper.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: ${FULLSCREEN_Z};
      pointer-events: auto;
      background: rgba(0,0,0,0.6);
    `;

    // Scrim tap → close (diamond stopPropagation prevents conflict)
    this.wrapper.onclick = () => {
      useUiStore.getState().setMinimapFullscreen(false);
    };

    // Container: centered diamond
    this.container.style.position = 'absolute';
    this.container.style.inset = '';
    this.container.style.width = `${fsSize}px`;
    this.container.style.height = `${fsSize}px`;
    this.container.style.top = '50%';
    this.container.style.left = '50%';
    this.container.style.transform = 'translate(-50%, -50%)';

    // Canvas
    this.canvas.width = fsSize;
    this.canvas.height = fsSize;

    this.wrapper.style.display = 'block';
    this.startUpdating();
  }

  private exitFullscreen(): void {
    this.fullscreen = false;
    if (!this.wrapper || !this.container) return;

    this.stopUpdating();

    // Back to the docked geometry — on mobile that means hidden, on desktop the
    // Settings preset. Leaving the fullscreen style behind is what used to make
    // the minimap reappear as a viewport-wide scrim over the menus.
    this.currentSize = this.isMobile() ? MOBILE_SIZE : this.desktopSize;
    if (this.canvas) {
      this.canvas.width  = this.currentSize;
      this.canvas.height = this.currentSize;
    }
    this.applyDockedStyle(this.visible ? 'block' : 'none');
  }

  // ---------------------------------------------------------------------------
  // DOM setup
  // ---------------------------------------------------------------------------

  private ensureDOM(): void {
    if (this.canvas) return;

    if (this.isMobile()) this.currentSize = MOBILE_SIZE;

    // ── Outer wrapper ─────────────────────────────────────────────────────────
    this.wrapper = document.createElement('div');
    this.wrapper.id = 'minimap-wrapper';

    // ── Inner diamond container ────────────────────────────────────────────────
    this.container = document.createElement('div');
    this.container.id = 'minimap-container';
    this.container.style.cssText = `
      position: absolute;
      inset: 0;
      overflow: hidden;
      cursor: crosshair;
      background: #0f172a;
      clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
      filter: ${FILTER_BASE};
      pointer-events: auto;
      transition: filter 200ms;
    `;

    // Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width  = this.currentSize;
    this.canvas.height = this.currentSize;
    this.canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
    this.ctx = this.canvas.getContext('2d');

    this.container.appendChild(this.canvas);
    this.wrapper.appendChild(this.container);

    // ── Interaction: click-to-navigate ───────────────────────────────────────
    this.attachInteractionListeners();

    // ── Style + position + subscriptions ─────────────────────────────────────
    this.applyDockedStyle('none');
    this.unsubPanel = useUiStore.subscribe(() => this.onUiStateChange());
    this.mobileLayout = this.isMobile();
    this.attachViewportListener();

    document.body.appendChild(this.wrapper);
  }

  // ---------------------------------------------------------------------------
  // Interaction: click navigate
  // ---------------------------------------------------------------------------

  private attachInteractionListeners(): void {
    if (!this.container) return;

    // ── Mouse: click → navigate ─────────────────────────────────────────────
    this.container.onmousedown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleClick(e.offsetX, e.offsetY);
    };

    // ── Touch: tap → navigate ───────────────────────────────────────────────
    this.container.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.changedTouches.length === 0) return;
      const touch = e.changedTouches[0];
      const rect = (this.container as HTMLElement & { getBoundingClientRect?(): DOMRect }).getBoundingClientRect?.();
      const ox = rect ? touch.clientX - rect.left : touch.clientX;
      const oy = rect ? touch.clientY - rect.top  : touch.clientY;
      this.handleClick(ox, oy);
    }, { passive: false });
  }

  // ---------------------------------------------------------------------------
  // Size helpers
  // ---------------------------------------------------------------------------

  private applySize(newSize: number): void {
    const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, newSize));
    this.currentSize = clamped;
    if (this.wrapper) {
      this.wrapper.style.width  = `${clamped}px`;
      this.wrapper.style.height = `${clamped}px`;
    }
    if (this.container) {
      this.container.style.width  = `${clamped}px`;
      this.container.style.height = `${clamped}px`;
    }
    if (this.canvas) {
      this.canvas.width  = clamped;
      this.canvas.height = clamped;
    }
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Periodic rendering
  // ---------------------------------------------------------------------------

  private startUpdating(): void {
    this.stopUpdating();
    this.render();
    this.updateTimer = setInterval(() => this.render(), UPDATE_MS);
  }

  private stopUpdating(): void {
    if (this.updateTimer !== null) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Terrain colormap — built from pixel data, cached until map changes
  // ---------------------------------------------------------------------------

  /** Sample atlas colors once per terrain/season (null → land-class fallbacks). */
  private buildAtlasColorMap(): void {
    if (!this.renderer?.getAtlasData) return;
    const atlasData = this.renderer.getAtlasData();
    if (!atlasData) return;
    const key = `${this.renderer.getTerrainType()}:${this.renderer.getSeason()}`;
    if (this.atlasColorKey === key && this.atlasColorMap && this.atlasColorMap.size > 0) return;
    this.atlasColorMap = sampleAtlasColors(atlasData.atlas, atlasData.manifest);
    this.atlasColorKey = key;
  }

  private buildTerrainColormap(): void {
    if (!this.renderer) return;
    const data = this.renderer.getTerrainPixelData();
    if (!data) return;

    const { pixelData, width, height } = data;
    const key = `${this.renderer.getMapName()}:${this.renderer.getTerrainType()}:${this.renderer.getSeason()}:${width}:${height}`;
    if (this.terrainCacheKey === key && this.terrainCanvas) return;

    this.buildAtlasColorMap();
    const cm = buildTerrainColormap(pixelData, width, height, this.atlasColorMap);
    if (!cm) return;
    this.terrainCanvas = cm.canvas;
    this.terrainCacheKey = key;
  }

  // ---------------------------------------------------------------------------
  // Transform helpers
  // ---------------------------------------------------------------------------

  /** Scale factor for terrain canvas → minimap canvas (with rotation and padding). */
  private getTerrainScale(): number {
    if (!this.terrainCanvas) return 1;
    const tW = this.terrainCanvas.width;
    const tH = this.terrainCanvas.height;
    const diagonal = Math.sqrt(tW * tW + tH * tH);
    const padPx = this.currentSize * DIAMOND_PAD;
    return (this.currentSize - 2 * padPx) / diagonal;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  private render(): void {
    if (!this.ctx || !this.renderer) return;

    const mapName = this.renderer.getMapName();
    if (!mapName) return;

    // Build terrain colormap (rebuilds on map/season/terrain changes via cache key)
    this.buildTerrainColormap();

    const ctx = this.ctx;
    const s = this.currentSize;

    // Clear
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, s, s);

    if (this.terrainCanvas) {
      const tW = this.terrainCanvas.width;
      const tH = this.terrainCanvas.height;
      const scale = this.getTerrainScale();

      // Draw terrain rotated 45° so the grid diamond aligns with the clip-path diamond
      ctx.save();
      ctx.translate(s / 2, s / 2);
      ctx.rotate(Math.PI / 4);
      ctx.scale(scale, scale);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.terrainCanvas, -tW / 2, -tH / 2);

      // Viewport indicator — drawn in the same rotated/scaled terrain space
      this.drawViewportInGrid(ctx, scale);

      ctx.restore();
    }

    // Screen-space diamond border (drawn after restore, in screen coords)
    this.drawDiamondBorder(ctx);
  }

  // ---------------------------------------------------------------------------
  // Draw helpers
  // ---------------------------------------------------------------------------

  /**
   * Draw the viewport indicator rectangle in terrain grid space.
   * Since the context is already transformed (translate + rotate + scale),
   * we can draw in terrain-canvas coordinates directly.
   */
  private drawViewportInGrid(ctx: CanvasRenderingContext2D, scale: number): void {
    if (!this.renderer || !this.terrainCanvas) return;
    const dims = this.renderer.getMapDimensions();
    if (dims.width === 0 || dims.height === 0) return;

    const bounds = this.renderer.getVisibleTileBounds();
    const tW = this.terrainCanvas.width;
    const tH = this.terrainCanvas.height;

    // Map tile bounds → colormap coordinates (centered at origin since canvas is shifted by -tW/2,-tH/2)
    // Colormap axes are swapped+flipped: dx → i (flipped), dy → j (flipped)
    // So tile i maps to colormap x = (maxI - i) * scaleI, tile j maps to colormap y = (maxJ - j) * scaleJ
    const scaleI = tW / dims.height;
    const scaleJ = tH / dims.width;

    const x1 = (dims.height - bounds.maxI) * scaleI - tW / 2;
    const y1 = (dims.width - bounds.maxJ) * scaleJ - tH / 2;
    const w  = (bounds.maxI - bounds.minI) * scaleI;
    const h  = (bounds.maxJ - bounds.minJ) * scaleJ;

    ctx.fillStyle = 'rgba(245,158,11,0.12)';
    ctx.fillRect(x1, y1, w, h);

    // Adjust lineWidth for current scale so it appears ~1.5px on screen
    ctx.strokeStyle = 'rgba(245,158,11,0.85)';
    ctx.lineWidth = 1.5 / scale;
    ctx.strokeRect(x1, y1, w, h);
  }

  /**
   * Diamond border drawn in screen space.
   *
   * Two layers for visual polish:
   *  1. Outer glow  — wide soft stroke in sky-blue
   *  2. Main edge   — crisp 2 px gradient stroke
   */
  private drawDiamondBorder(ctx: CanvasRenderingContext2D): void {
    const s  = this.currentSize;
    const cx = s / 2;
    const cy = s / 2;

    ctx.save();

    // Diamond path (inset 1 px so stroke doesn't clip)
    const drawPath = () => {
      ctx.beginPath();
      ctx.moveTo(cx,     1);
      ctx.lineTo(s - 1,  cy);
      ctx.lineTo(cx,     s - 1);
      ctx.lineTo(1,      cy);
      ctx.closePath();
    };

    // Layer 1: outer glow
    drawPath();
    ctx.strokeStyle = 'rgba(56,189,248,0.20)';
    ctx.lineWidth   = 8;
    ctx.lineJoin    = 'miter';
    ctx.stroke();

    // Layer 2: crisp gradient edge
    drawPath();
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0,   'rgba(56,189,248,0.80)');
    grad.addColorStop(0.5, 'rgba(148,163,184,0.45)');
    grad.addColorStop(1,   'rgba(56,189,248,0.80)');
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Click → navigate
  // ---------------------------------------------------------------------------

  private handleClick(pixelX: number, pixelY: number): void {
    // Read the size first, then close: closing resets currentSize, and the
    // reverse transform below needs the size the tap was made against.
    const s = this.currentSize;

    // Close before the guards — a tap must never leave the scrim over the UI,
    // not even when the colormap is not ready and navigation is impossible.
    if (this.fullscreen) {
      useUiStore.getState().setMinimapFullscreen(false);
    }

    if (!this.renderer || !this.terrainCanvas) return;
    const dims = this.renderer.getMapDimensions();
    if (dims.width === 0 || dims.height === 0) return;
    const tW = this.terrainCanvas.width;
    const tH = this.terrainCanvas.height;
    const scale = this.getTerrainScale();

    // Reverse transform: minimap pixel → terrain grid coordinate
    // 1. Undo translate (center of canvas)
    const dx = pixelX - s / 2;
    const dy = pixelY - s / 2;

    // 2. Undo rotate (-45°): cos(-45°) = cos45, sin(-45°) = -cos45
    const rx =  dx * COS45 + dy * COS45;
    const ry = -dx * COS45 + dy * COS45;

    // 3. Undo scale + centering offset
    const terrainX = rx / scale + tW / 2;
    const terrainY = ry / scale + tH / 2;

    // 4. Scale from colormap coords to tile coords (axes are swapped+flipped)
    // Colormap x → i (flipped): tileI = maxI - (terrainX / tW) * maxI = maxI * (1 - terrainX/tW)
    // Colormap y → j (flipped): tileJ = maxJ - (terrainY / tH) * maxJ = maxJ * (1 - terrainY/tH)
    const tileI = (1 - terrainX / tW) * dims.height;
    const tileJ = (1 - terrainY / tH) * dims.width;

    this.renderer.centerOn(
      Math.max(0, Math.min(dims.width  - 1, Math.round(tileJ))),
      Math.max(0, Math.min(dims.height - 1, Math.round(tileI))),
    );
  }
}
