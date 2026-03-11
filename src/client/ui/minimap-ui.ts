/**
 * MinimapUI - Small top-down overview map with viewport indicator and click-to-navigate.
 *
 * Renders terrain background (colored by land class), buildings as colored dots,
 * road segments as lines, and the current viewport as a translucent rectangle.
 * The minimap rotates to match the main map's current rotation.
 * Click (or tap on mobile) anywhere on the minimap to re-center the main camera.
 *
 * A horizontal controls pill sits below the diamond:
 *   [↺ Rotate CCW]  [− Zoom Out]  [+ Zoom In]  [↻ Rotate CW]
 * Drag the pill vertically (not on a button) to resize the minimap.
 *
 * Desktop: top-left, shifts right when the left panel is open.
 * Mobile (< 640px): bottom-left, above the BottomNav safe area.
 */

import { MapBuilding, MapSegment } from '../../shared/types';
import { useUiStore } from '../store/ui-store';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** Renderer interface — only the subset MinimapUI needs. */
export interface MinimapRendererAPI {
  getCameraPosition(): { x: number; y: number };
  centerOn(x: number, y: number): void;
  getAllBuildings(): MapBuilding[];
  getAllSegments(): MapSegment[];
  getMapDimensions(): { width: number; height: number };
  getVisibleTileBounds(): { minI: number; maxI: number; minJ: number; maxJ: number };
  getZoom(): number;
  getRotation(): number; // 0=NORTH, 1=EAST, 2=SOUTH, 3=WEST
  getTerrainPixelData(): { pixelData: Uint8Array; width: number; height: number } | null;
}

/** Optional action callbacks wired by the host (client.ts). */
export interface MinimapActions {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onRotateCW?: () => void;
  onRotateCCW?: () => void;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const DESKTOP_PAD = 12;      // px — screen edge gap (desktop)
const MOBILE_PAD  = 8;       // px — screen edge gap (mobile)
const DESKTOP_SIZE = 200;    // px — initial diamond size (desktop)
const MOBILE_SIZE  = 140;    // px — initial diamond size (mobile)
const MIN_SIZE = 100;        // px — minimum diamond size
const MAX_SIZE = 500;        // px — maximum diamond size
const UPDATE_INTERVAL_MS = 500;

// Controls pill
const PILL_BTN  = 32;        // px — each button's width & height
const PILL_PAD  = 4;         // px — pill inner padding
const PILL_GAP  = 8;         // px — gap between diamond bottom-vertex and pill top
const PILL_BTN_GAP = 4;      // px — gap between buttons inside pill
const PILL_H    = PILL_BTN + PILL_PAD * 2; // 40 px — total pill height

// Mobile viewport breakpoint
const MOBILE_BP = 640;

// ---------------------------------------------------------------------------
// Rendering constants
// ---------------------------------------------------------------------------

/** Base canvas rotation to match isometric NW-at-top orientation. */
const ISO_BASE_ANGLE = -Math.PI / 4;
/** Scale factor to fit 45°-rotated square inside canvas (1/√2). */
const ISO_SCALE = Math.SQRT1_2;

/** RGB colors per LandClass (bits 7-6 of landId): Grass, MidGrass, DryGround, Water */
const LAND_CLASS_COLORS: readonly [number, number, number][] = [
  [74,  116, 50 ],   // ZoneA (0) — Grass
  [110, 140, 70 ],   // ZoneB (1) — MidGrass
  [160, 130, 80 ],   // ZoneC (2) — DryGround
  [40,  90,  160],   // ZoneD (3) — Water
];

// ---------------------------------------------------------------------------
// MinimapUI class
// ---------------------------------------------------------------------------

export class MinimapUI {
  /** Outer wrapper — fixed position, overflow:visible, taller than diamond to hold pill. */
  private wrapper: HTMLElement | null = null;
  /** Inner diamond container — clip-path + overflow:hidden. */
  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private renderer: MinimapRendererAPI | null = null;

  private visible = false;
  private updateTimer: ReturnType<typeof setInterval> | null = null;

  /** Current diamond size (width = height, always square). */
  private currentSize: number = DESKTOP_SIZE;

  private unsubPanel: (() => void) | null = null;
  private terrainCanvas: HTMLCanvasElement | null = null;
  private terrainCacheKey = '';

  constructor(private readonly actions: MinimapActions = {}) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  public setRenderer(renderer: MinimapRendererAPI): void {
    this.renderer = renderer;
    this.show();
  }

  public show(): void {
    if (this.visible) return;
    this.visible = true;
    this.ensureDOM();
    if (this.wrapper) this.wrapper.style.display = 'block';
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

  public destroy(): void {
    this.visible = false;
    this.stopUpdating();
    if (this.unsubPanel) {
      this.unsubPanel();
      this.unsubPanel = null;
    }
    if (this.wrapper?.parentElement) {
      this.wrapper.parentElement.removeChild(this.wrapper);
    }
    this.wrapper = null;
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.terrainCanvas = null;
    this.terrainCacheKey = '';
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** True when the viewport is narrower than MOBILE_BP (640 px). */
  private isMobile(): boolean {
    return typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth < MOBILE_BP;
  }

  /** Total wrapper height = diamond + gap + pill. */
  private wrapperHeight(size: number): number {
    return size + PILL_GAP + PILL_H;
  }

  // ---------------------------------------------------------------------------
  // Positioning
  // ---------------------------------------------------------------------------

  /**
   * Set wrapper position.
   * Desktop: top-left, shifted right when left panel is open.
   * Mobile: bottom-left, above the BottomNav safe area.
   */
  private applyPositioning(): void {
    if (!this.wrapper) return;
    if (this.isMobile()) {
      this.wrapper.style.top    = '';
      this.wrapper.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + 56px + ${MOBILE_PAD}px)`;
      this.wrapper.style.left   = `${MOBILE_PAD}px`;
    } else {
      this.wrapper.style.bottom = '';
      this.wrapper.style.top    = `${DESKTOP_PAD}px`;
      const panelOpen = useUiStore.getState().leftPanel !== null;
      if (panelOpen) {
        const panelWidth =
          getComputedStyle(document.documentElement)
            .getPropertyValue('--panel-width-desktop')
            .trim() || '420px';
        this.wrapper.style.left = `calc(${panelWidth} + ${DESKTOP_PAD}px)`;
      } else {
        this.wrapper.style.left = `${DESKTOP_PAD}px`;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // DOM setup
  // ---------------------------------------------------------------------------

  private ensureDOM(): void {
    if (this.canvas) return;

    // Pick size based on viewport
    if (this.isMobile()) this.currentSize = MOBILE_SIZE;

    // ── Outer wrapper ──────────────────────────────────────────────────────────
    this.wrapper = document.createElement('div');
    this.wrapper.id = 'minimap-wrapper';
    this.wrapper.style.cssText = `
      position: fixed;
      top: ${DESKTOP_PAD}px;
      left: ${DESKTOP_PAD}px;
      width: ${this.currentSize}px;
      height: ${this.wrapperHeight(this.currentSize)}px;
      overflow: visible;
      z-index: 100;
      pointer-events: none;
      transition: left 250ms cubic-bezier(0.16, 1, 0.3, 1),
                  bottom 250ms cubic-bezier(0.16, 1, 0.3, 1);
    `;

    // ── Inner diamond container ────────────────────────────────────────────────
    this.container = document.createElement('div');
    this.container.id = 'minimap-container';
    this.container.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: ${this.currentSize}px;
      height: ${this.currentSize}px;
      overflow: hidden;
      cursor: crosshair;
      background: #0f172a;
      clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
      filter:
        drop-shadow(0 0 10px rgba(56, 189, 248, 0.30))
        drop-shadow(0 0 2px rgba(148, 163, 184, 0.55))
        drop-shadow(0 4px 12px rgba(0, 0, 0, 0.70));
      pointer-events: auto;
    `;

    // Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width  = this.currentSize;
    this.canvas.height = this.currentSize;
    this.canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
    this.ctx = this.canvas.getContext('2d');

    // Click-to-navigate (mouse)
    this.canvas.onmousedown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleClick(e.offsetX, e.offsetY);
    };

    // Click-to-navigate (touch)
    this.canvas.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.changedTouches.length === 0) return;
      const touch = e.changedTouches[0];
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect?.();
      const offsetX = rect ? touch.clientX - rect.left : touch.clientX;
      const offsetY = rect ? touch.clientY - rect.top  : touch.clientY;
      this.handleClick(offsetX, offsetY);
    }, { passive: false });

    this.container.appendChild(this.canvas);
    this.wrapper.appendChild(this.container);

    // ── Controls pill ─────────────────────────────────────────────────────────
    const pill = this.createControlsPill();
    this.wrapper.appendChild(pill);
    this.attachPillResizeListeners(pill);

    // Initial positioning + subscribe to panel changes
    this.applyPositioning();
    this.unsubPanel = useUiStore.subscribe(() => {
      this.applyPositioning();
    });

    document.body.appendChild(this.wrapper);
  }

  // ---------------------------------------------------------------------------
  // Controls pill
  // ---------------------------------------------------------------------------

  /**
   * Horizontal pill with four buttons: [↺][−][+][↻].
   * Sits at the bottom of the outer wrapper (below the diamond).
   * Dragging the pill background (not a button) resizes the minimap.
   */
  private createControlsPill(): HTMLElement {
    const pill = document.createElement('div');
    pill.id = 'minimap-controls';

    const pillWidth = PILL_BTN * 4 + PILL_BTN_GAP * 3 + PILL_PAD * 2;
    pill.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: ${pillWidth}px;
      height: ${PILL_H}px;
      padding: ${PILL_PAD}px;
      border-radius: ${PILL_H / 2}px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.22);
      display: flex;
      align-items: center;
      gap: ${PILL_BTN_GAP}px;
      cursor: ns-resize;
      pointer-events: auto;
      z-index: 1;
      backdrop-filter: blur(6px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      transition: background 130ms, border-color 130ms;
      touch-action: none;
      user-select: none;
    `;

    pill.addEventListener('mouseenter', () => {
      pill.style.borderColor = 'rgba(56, 189, 248, 0.35)';
    });
    pill.addEventListener('mouseleave', () => {
      pill.style.borderColor = 'rgba(148, 163, 184, 0.22)';
    });

    const defs: Array<{ sym: string; title: string; cb: () => void }> = [
      { sym: '↺', title: 'Rotate Counter-clockwise', cb: () => this.actions.onRotateCCW?.() },
      { sym: '−', title: 'Zoom Out',                 cb: () => this.actions.onZoomOut?.() },
      { sym: '+', title: 'Zoom In',                  cb: () => this.actions.onZoomIn?.() },
      { sym: '↻', title: 'Rotate Clockwise',         cb: () => this.actions.onRotateCW?.() },
    ];

    for (const { sym, title, cb } of defs) {
      pill.appendChild(this.createPillButton(sym, title, cb));
    }

    return pill;
  }

  private createPillButton(symbol: string, title: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.title = title;
    btn.textContent = symbol;
    btn.style.cssText = `
      width: ${PILL_BTN}px;
      height: ${PILL_BTN}px;
      border-radius: 50%;
      background: transparent;
      border: 1px solid transparent;
      color: rgba(203, 213, 225, 0.85);
      cursor: pointer;
      font-size: 15px;
      line-height: ${PILL_BTN}px;
      text-align: center;
      user-select: none;
      pointer-events: auto;
      padding: 0;
      transition: background 120ms, border-color 120ms, color 120ms;
      touch-action: manipulation;
      flex-shrink: 0;
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.background   = 'rgba(56, 189, 248, 0.18)';
      btn.style.borderColor  = 'rgba(56, 189, 248, 0.45)';
      btn.style.color        = 'rgba(56, 189, 248, 1)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background   = 'transparent';
      btn.style.borderColor  = 'transparent';
      btn.style.color        = 'rgba(203, 213, 225, 0.85)';
    });
    btn.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    btn.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    }, { passive: false });

    return btn;
  }

  // ---------------------------------------------------------------------------
  // Resize via pill drag
  // ---------------------------------------------------------------------------

  /**
   * Attaches mouse and touch resize listeners to the pill.
   * Dragging the pill background (not a button) resizes the minimap.
   * Drag UP to grow, drag DOWN to shrink (delta is inverted).
   */
  private attachPillResizeListeners(pill: HTMLElement): void {
    let startY    = 0;
    let startSize = 0;
    let active    = false;

    const applySize = (newSize: number): void => {
      const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, newSize));
      this.currentSize = clamped;
      if (this.wrapper) {
        this.wrapper.style.width  = `${clamped}px`;
        this.wrapper.style.height = `${this.wrapperHeight(clamped)}px`;
      }
      if (this.container) {
        this.container.style.width  = `${clamped}px`;
        this.container.style.height = `${clamped}px`;
      }
      if (this.canvas) {
        this.canvas.width  = clamped;
        this.canvas.height = clamped;
      }
      this.terrainCanvas = null; // Invalidate terrain cache
      this.render();
    };

    // ── Mouse ──
    const onMouseMove = (e: MouseEvent) => {
      if (!active) return;
      // Drag up (negative delta) = grow; drag down = shrink
      const delta = e.clientY - startY;
      applySize(startSize - delta);
    };
    const onMouseUp = () => {
      active = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    pill.addEventListener('mousedown', (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      e.preventDefault();
      e.stopPropagation();
      active    = true;
      startY    = e.clientY;
      startSize = this.currentSize;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // ── Touch ──
    const onTouchMove = (e: TouchEvent) => {
      if (!active || e.touches.length === 0) return;
      e.preventDefault();
      const delta = e.touches[0].clientY - startY;
      applySize(startSize - delta);
    };
    const onTouchEnd = () => {
      active = false;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    pill.addEventListener('touchstart', (e: TouchEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      if (e.touches.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      active    = true;
      startY    = e.touches[0].clientY;
      startSize = this.currentSize;
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    }, { passive: false });
  }

  // ---------------------------------------------------------------------------
  // Periodic rendering
  // ---------------------------------------------------------------------------

  private startUpdating(): void {
    this.stopUpdating();
    this.render();
    this.updateTimer = setInterval(() => this.render(), UPDATE_INTERVAL_MS);
  }

  private stopUpdating(): void {
    if (this.updateTimer !== null) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  private render(): void {
    if (!this.ctx || !this.renderer) return;

    const ctx  = this.ctx;
    const dims = this.renderer.getMapDimensions();
    if (dims.width === 0 || dims.height === 0) return;

    const rotation = this.renderer.getRotation();
    const angle    = (rotation * Math.PI) / 2;

    // Scale: map coords → minimap pixels
    const scaleX = this.currentSize / dims.width;
    const scaleY = this.currentSize / dims.height;

    // Clear
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.currentSize, this.currentSize);

    // Isometric rotation transform
    ctx.save();
    ctx.translate(this.currentSize / 2, this.currentSize / 2);
    ctx.rotate(ISO_BASE_ANGLE + angle);
    ctx.scale(ISO_SCALE, ISO_SCALE);
    ctx.translate(-this.currentSize / 2, -this.currentSize / 2);

    // Flip Y so north is visually correct
    ctx.translate(0, this.currentSize);
    ctx.scale(1, -1);

    this.drawTerrainBackground(ctx);
    this.drawRoads(ctx, scaleX, scaleY);
    this.drawBuildings(ctx, scaleX, scaleY);
    this.drawViewport(ctx, scaleX, scaleY);
    this.drawCameraMarker(ctx, scaleX, scaleY);

    ctx.restore();

    // Screen-space overlay: thin gradient diamond border
    this.drawDiamondBorder(ctx);
  }

  // ---------------------------------------------------------------------------
  // Draw helpers
  // ---------------------------------------------------------------------------

  private drawTerrainBackground(ctx: CanvasRenderingContext2D): void {
    const terrain = this.renderer!.getTerrainPixelData();
    if (!terrain) return;

    const key = `${terrain.width}x${terrain.height}`;
    if (!this.terrainCanvas || this.terrainCacheKey !== key) {
      this.terrainCanvas = this.buildTerrainCanvas(terrain.pixelData, terrain.width, terrain.height);
      this.terrainCacheKey = key;
    }

    ctx.drawImage(this.terrainCanvas, 0, 0);
  }

  private buildTerrainCanvas(
    pixelData: Uint8Array,
    mapWidth: number,
    mapHeight: number,
  ): HTMLCanvasElement {
    const outW = this.currentSize;
    const outH = this.currentSize;

    const canvas = document.createElement('canvas');
    canvas.width  = outW;
    canvas.height = outH;
    const tCtx = canvas.getContext('2d')!;
    const imageData = tCtx.createImageData(outW, outH);
    const data = imageData.data;

    for (let py = 0; py < outH; py++) {
      for (let px = 0; px < outW; px++) {
        const mapX  = Math.floor((px / outW) * mapWidth);
        const mapY  = Math.floor((py / outH) * mapHeight);
        const landId = pixelData[mapY * mapWidth + mapX];
        const lc    = (landId >> 6) & 0x03;
        const [r, g, b] = LAND_CLASS_COLORS[lc];
        const idx   = (py * outW + px) * 4;
        data[idx]     = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    tCtx.putImageData(imageData, 0, 0);
    return canvas;
  }

  private drawRoads(ctx: CanvasRenderingContext2D, scaleX: number, scaleY: number): void {
    const segments = this.renderer!.getAllSegments();
    if (segments.length === 0) return;

    ctx.strokeStyle = 'rgba(203, 213, 225, 0.5)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    for (const seg of segments) {
      ctx.moveTo(seg.x1 * scaleX, seg.y1 * scaleY);
      ctx.lineTo(seg.x2 * scaleX, seg.y2 * scaleY);
    }
    ctx.stroke();
  }

  private drawBuildings(ctx: CanvasRenderingContext2D, scaleX: number, scaleY: number): void {
    const buildings = this.renderer!.getAllBuildings();
    if (buildings.length === 0) return;

    const dotSize = Math.max(2, Math.min(scaleX, scaleY) * 2);

    for (const b of buildings) {
      const px = b.x * scaleX;
      const py = b.y * scaleY;
      // Alert = red-400, normal = green-400
      ctx.fillStyle = b.alert ? '#f87171' : '#4ade80';
      ctx.fillRect(px - dotSize / 2, py - dotSize / 2, dotSize, dotSize);
    }
  }

  private drawViewport(ctx: CanvasRenderingContext2D, scaleX: number, scaleY: number): void {
    const bounds = this.renderer!.getVisibleTileBounds();

    // bounds is in i,j (row,col) — convert to x,y (col,row) for minimap
    const x1 = bounds.minJ * scaleX;
    const y1 = bounds.minI * scaleY;
    const x2 = bounds.maxJ * scaleX;
    const y2 = bounds.maxI * scaleY;
    const w  = x2 - x1;
    const h  = y2 - y1;

    // Semi-transparent fill
    ctx.fillStyle = 'rgba(56, 189, 248, 0.10)';
    ctx.fillRect(x1, y1, w, h);

    // Bright border
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(x1, y1, w, h);

    // Corner tick marks
    const tick = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(x1,        y1 + tick); ctx.lineTo(x1,        y1); ctx.lineTo(x1 + tick, y1);
    ctx.moveTo(x2 - tick, y1);        ctx.lineTo(x2,        y1); ctx.lineTo(x2,        y1 + tick);
    ctx.moveTo(x2,        y2 - tick); ctx.lineTo(x2,        y2); ctx.lineTo(x2 - tick, y2);
    ctx.moveTo(x1 + tick, y2);        ctx.lineTo(x1,        y2); ctx.lineTo(x1,        y2 - tick);
    ctx.stroke();
  }

  /** Amber crosshair at the current camera position (drawn in rotated map space). */
  private drawCameraMarker(ctx: CanvasRenderingContext2D, scaleX: number, scaleY: number): void {
    const cam  = this.renderer!.getCameraPosition();
    const px   = cam.x * scaleX;
    const py   = cam.y * scaleY;
    const size = 5;

    ctx.save();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(px - size, py);
    ctx.lineTo(px + size, py);
    ctx.moveTo(px, py - size);
    ctx.lineTo(px, py + size);
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Thin gradient diamond border drawn in screen space (outside the rotation transform). */
  private drawDiamondBorder(ctx: CanvasRenderingContext2D): void {
    const cx = this.currentSize / 2;
    const cy = this.currentSize / 2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx,                  1);
    ctx.lineTo(this.currentSize - 1, cy);
    ctx.lineTo(cx,                  this.currentSize - 1);
    ctx.lineTo(1,                   cy);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, this.currentSize, this.currentSize);
    grad.addColorStop(0,   'rgba(56, 189, 248, 0.65)');
    grad.addColorStop(0.5, 'rgba(148, 163, 184, 0.30)');
    grad.addColorStop(1,   'rgba(56, 189, 248, 0.65)');
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Click → navigate
  // ---------------------------------------------------------------------------

  private handleClick(pixelX: number, pixelY: number): void {
    if (!this.renderer) return;

    const dims = this.renderer.getMapDimensions();
    if (dims.width === 0 || dims.height === 0) return;

    const rotation   = this.renderer.getRotation();
    const totalAngle = ISO_BASE_ANGLE + (rotation * Math.PI) / 2;

    // Inverse the canvas transform: T(center) · R(angle) · S(scale) · T(-center)
    const cx   = this.currentSize / 2;
    const cy   = this.currentSize / 2;
    const dx   = pixelX - cx;
    const dy   = pixelY - cy;

    const invAngle = -totalAngle;
    const cos = Math.cos(invAngle);
    const sin = Math.sin(invAngle);
    const rdx = dx * cos - dy * sin;
    const rdy = dx * sin + dy * cos;
    const rx  = cx + rdx / ISO_SCALE;
    const ry  = cy + rdy / ISO_SCALE;

    const mapX = Math.max(0, Math.min(dims.width  - 1,
      Math.round((rx / this.currentSize) * dims.width)));
    const mapY = Math.max(0, Math.min(dims.height - 1,
      Math.round(((this.currentSize - ry) / this.currentSize) * dims.height)));

    this.renderer.centerOn(mapX, mapY);
  }
}
