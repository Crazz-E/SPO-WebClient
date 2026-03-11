/**
 * MinimapUI - Small top-down overview map with viewport indicator and click-to-navigate
 *
 * Renders terrain background (colored by land class), buildings as colored dots,
 * road segments as lines, and the current viewport as a translucent rectangle.
 * The minimap rotates to match the main map's current rotation.
 * Click anywhere on the minimap to re-center the main camera.
 *
 * Control buttons (zoom in/out, rotate CW/CCW) float around the diamond.
 * Drag the grip handle at the bottom vertex to resize.
 * Toggle visibility with the minimap button in the RightRail.
 */

import { MapBuilding, MapSegment } from '../../shared/types';
import { useUiStore } from '../store/ui-store';

/** Renderer interface — only the subset MinimapUI needs */
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

const DEFAULT_SIZE = 200;
const MIN_SIZE = 120;
const MAX_SIZE = 500;
const MINIMAP_PADDING = 12;
const UPDATE_INTERVAL_MS = 500;

/** Base rotation to match isometric map orientation (NW at top) */
const ISO_BASE_ANGLE = -Math.PI / 4;
/** Scale factor to fit 45°-rotated square inside canvas (1/√2) */
const ISO_SCALE = Math.SQRT1_2; // ~0.707

/** RGB colors for each LandClass (bits 7-6 of landId): Grass, MidGrass, DryGround, Water */
const LAND_CLASS_COLORS: readonly [number, number, number][] = [
  [74, 116, 50],    // ZoneA (0) — Grass: medium green
  [110, 140, 70],   // ZoneB (1) — MidGrass: lighter green
  [160, 130, 80],   // ZoneC (2) — DryGround: sandy brown
  [40, 90, 160],    // ZoneD (3) — Water: blue
];

/** Shared base style for all floating control buttons. */
const BTN_BASE = `
  position: absolute;
  width: 24px; height: 24px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.22);
  color: rgba(203, 213, 225, 0.9);
  cursor: pointer;
  font-size: 15px;
  line-height: 24px;
  text-align: center;
  user-select: none;
  pointer-events: auto;
  padding: 0;
  backdrop-filter: blur(4px);
  transition: background 130ms, border-color 130ms;
`;

export class MinimapUI {
  /** Outer wrapper — fixed positioning + panel offset. overflow:visible so buttons show outside diamond. */
  private wrapper: HTMLElement | null = null;
  /** Inner diamond container — clip-path + overflow:hidden. */
  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private renderer: MinimapRendererAPI | null = null;
  private visible = false;
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private currentWidth = DEFAULT_SIZE;
  private currentHeight = DEFAULT_SIZE;
  private unsubPanel: (() => void) | null = null;
  private terrainCanvas: HTMLCanvasElement | null = null;
  private terrainCacheKey: string = '';

  constructor(private readonly actions: MinimapActions = {}) {}

  /**
   * Attach the renderer that provides map data and camera info.
   */
  public setRenderer(renderer: MinimapRendererAPI): void {
    this.renderer = renderer;
    this.show();
  }

  /**
   * Show the minimap and start periodic rendering.
   */
  public show(): void {
    if (this.visible) return;
    this.visible = true;
    this.ensureDOM();
    if (this.wrapper) {
      this.wrapper.style.display = 'block';
    }
    this.startUpdating();
  }

  /**
   * Hide the minimap and stop periodic rendering.
   */
  public hide(): void {
    if (!this.visible) return;
    this.visible = false;
    if (this.wrapper) {
      this.wrapper.style.display = 'none';
    }
    this.stopUpdating();
  }

  /**
   * Toggle minimap visibility.
   */
  public toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Whether the minimap is currently visible.
   */
  public isVisible(): boolean {
    return this.visible;
  }

  /**
   * Clean up DOM and listeners.
   */
  public destroy(): void {
    this.visible = false;
    this.stopUpdating();
    if (this.unsubPanel) {
      this.unsubPanel();
      this.unsubPanel = null;
    }
    if (this.wrapper && this.wrapper.parentElement) {
      this.wrapper.parentElement.removeChild(this.wrapper);
    }
    this.wrapper = null;
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.terrainCanvas = null;
    this.terrainCacheKey = '';
  }

  /**
   * Shift the minimap wrapper to avoid an open left panel.
   */
  private applyPanelOffset(panelOpen: boolean): void {
    if (!this.wrapper) return;
    if (panelOpen) {
      const panelWidth =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--panel-width-desktop')
          .trim() || '420px';
      this.wrapper.style.left = `calc(${panelWidth} + ${MINIMAP_PADDING}px)`;
    } else {
      this.wrapper.style.left = `${MINIMAP_PADDING}px`;
    }
  }

  // ---------------------------------------------------------------------------
  // DOM setup
  // ---------------------------------------------------------------------------

  private ensureDOM(): void {
    if (this.canvas) return;

    // ── Outer wrapper: fixed position, overflow:visible so buttons extend outside ──
    this.wrapper = document.createElement('div');
    this.wrapper.id = 'minimap-wrapper';
    this.wrapper.style.cssText = `
      position: fixed;
      top: ${MINIMAP_PADDING}px;
      left: ${MINIMAP_PADDING}px;
      width: ${this.currentWidth}px;
      height: ${this.currentHeight}px;
      overflow: visible;
      z-index: 100;
      pointer-events: none;
      transition: left 250ms cubic-bezier(0.16, 1, 0.3, 1);
    `;

    // ── Inner diamond container: clipped, interactive ──
    this.container = document.createElement('div');
    this.container.id = 'minimap-container';
    this.container.style.cssText = `
      position: absolute;
      inset: 0;
      overflow: hidden;
      cursor: crosshair;
      background: #0f172a;
      clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
      filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.35)) drop-shadow(0 0 2px rgba(148, 163, 184, 0.6)) drop-shadow(0 2px 8px rgba(0, 0, 0, 0.65));
      pointer-events: auto;
    `;

    // Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.currentWidth;
    this.canvas.height = this.currentHeight;
    this.canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
    this.ctx = this.canvas.getContext('2d');

    this.container.appendChild(this.canvas);
    this.wrapper.appendChild(this.container);

    // ── Rotate buttons — left vertex ──
    this.wrapper.appendChild(this.createButton('↺', 'Rotate Counter-clockwise',
      'left: -30px; top: calc(50% - 27px);',
      () => this.actions.onRotateCCW?.()));
    this.wrapper.appendChild(this.createButton('↻', 'Rotate Clockwise',
      'left: -30px; top: calc(50% + 3px);',
      () => this.actions.onRotateCW?.()));

    // ── Zoom buttons — right vertex ──
    this.wrapper.appendChild(this.createButton('+', 'Zoom In',
      'right: -30px; top: calc(50% - 27px);',
      () => this.actions.onZoomIn?.()));
    this.wrapper.appendChild(this.createButton('−', 'Zoom Out',
      'right: -30px; top: calc(50% + 3px);',
      () => this.actions.onZoomOut?.()));

    // ── Resize grip — bottom vertex ──
    const handle = this.createResizeHandle();
    this.wrapper.appendChild(handle);
    this.attachResizeListeners(handle);

    // Shift minimap when left panel opens
    this.applyPanelOffset(useUiStore.getState().leftPanel !== null);
    this.unsubPanel = useUiStore.subscribe((state) => {
      this.applyPanelOffset(state.leftPanel !== null);
    });

    document.body.appendChild(this.wrapper);

    // Click-to-navigate
    this.canvas.onmousedown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleClick(e.offsetX, e.offsetY);
    };
  }

  /** Small glass-style button with a Unicode symbol, positioned absolutely on the wrapper. */
  private createButton(
    symbol: string,
    title: string,
    positionStyle: string,
    onClick: () => void,
  ): HTMLElement {
    const btn = document.createElement('button');
    btn.style.cssText = BTN_BASE + positionStyle;
    btn.title = title;
    btn.textContent = symbol;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(56, 189, 248, 0.18)';
      btn.style.borderColor = 'rgba(56, 189, 248, 0.5)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(15, 23, 42, 0.82)';
      btn.style.borderColor = 'rgba(148, 163, 184, 0.22)';
    });
    btn.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  /** Pill-shaped grip handle at the bottom diamond vertex — clearly grabbable. */
  private createResizeHandle(): HTMLElement {
    const handle = document.createElement('div');
    handle.id = 'minimap-resize-handle';
    handle.style.cssText = `
      position: absolute;
      bottom: -11px;
      left: 50%;
      transform: translateX(-50%);
      width: 56px;
      height: 18px;
      cursor: ns-resize;
      border-radius: 9px;
      background: rgba(15, 23, 42, 0.82);
      border: 1px solid rgba(148, 163, 184, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      pointer-events: auto;
      z-index: 1;
      transition: background 130ms, border-color 130ms;
    `;
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.style.cssText = `
        width: 3px; height: 3px;
        border-radius: 50%;
        background: rgba(148, 163, 184, 0.6);
        pointer-events: none;
      `;
      handle.appendChild(dot);
    }
    handle.addEventListener('mouseenter', () => {
      handle.style.background = 'rgba(56, 189, 248, 0.15)';
      handle.style.borderColor = 'rgba(56, 189, 248, 0.4)';
    });
    handle.addEventListener('mouseleave', () => {
      handle.style.background = 'rgba(15, 23, 42, 0.82)';
      handle.style.borderColor = 'rgba(148, 163, 184, 0.25)';
    });
    return handle;
  }

  private attachResizeListeners(handle: HTMLElement): void {
    let startY = 0;
    let startW = 0;

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientY - startY;
      const newSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, startW + delta));
      this.currentWidth = newSize;
      this.currentHeight = newSize;
      if (this.wrapper) {
        this.wrapper.style.width = `${newSize}px`;
        this.wrapper.style.height = `${newSize}px`;
      }
      if (this.canvas) {
        this.canvas.width = newSize;
        this.canvas.height = newSize;
      }
      this.terrainCanvas = null; // Invalidate terrain cache — new size
      this.render();
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startY = e.clientY;
      startW = this.currentWidth;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
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

    const ctx = this.ctx;
    const dims = this.renderer.getMapDimensions();
    if (dims.width === 0 || dims.height === 0) return;

    const rotation = this.renderer.getRotation(); // 0|1|2|3
    const angle = (rotation * Math.PI) / 2;

    // Scale factor: map coordinates → minimap pixels
    const scaleX = this.currentWidth / dims.width;
    const scaleY = this.currentHeight / dims.height;

    // Clear entire canvas (outside rotation transform)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.currentWidth, this.currentHeight);

    // Apply isometric base rotation (45°) + cardinal rotation around canvas center
    ctx.save();
    ctx.translate(this.currentWidth / 2, this.currentHeight / 2);
    ctx.rotate(ISO_BASE_ANGLE + angle);
    ctx.scale(ISO_SCALE, ISO_SCALE);
    ctx.translate(-this.currentWidth / 2, -this.currentHeight / 2);

    // Flip Y axis to correct north/south orientation
    ctx.translate(0, this.currentHeight);
    ctx.scale(1, -1);

    // Draw terrain background
    this.drawTerrainBackground(ctx);

    // Draw road segments
    this.drawRoads(ctx, scaleX, scaleY);

    // Draw buildings
    this.drawBuildings(ctx, scaleX, scaleY);

    // Draw viewport rectangle
    this.drawViewport(ctx, scaleX, scaleY);

    // Draw camera position crosshair (on top of viewport rect)
    this.drawCameraMarker(ctx, scaleX, scaleY);

    ctx.restore();

    // Screen-space overlay: thin gradient diamond border
    this.drawDiamondBorder(ctx);
  }

  private drawTerrainBackground(ctx: CanvasRenderingContext2D): void {
    const terrain = this.renderer!.getTerrainPixelData();
    if (!terrain) return;

    const key = `${terrain.width}x${terrain.height}`;
    if (!this.terrainCanvas || this.terrainCacheKey !== key) {
      this.terrainCanvas = this.buildTerrainCanvas(
        terrain.pixelData,
        terrain.width,
        terrain.height
      );
      this.terrainCacheKey = key;
    }

    ctx.drawImage(this.terrainCanvas, 0, 0);
  }

  private buildTerrainCanvas(
    pixelData: Uint8Array,
    mapWidth: number,
    mapHeight: number
  ): HTMLCanvasElement {
    const outW = this.currentWidth;
    const outH = this.currentHeight;

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const tCtx = canvas.getContext('2d')!;
    const imageData = tCtx.createImageData(outW, outH);
    const data = imageData.data;

    for (let py = 0; py < outH; py++) {
      for (let px = 0; px < outW; px++) {
        const mapX = Math.floor((px / outW) * mapWidth);
        const mapY = Math.floor((py / outH) * mapHeight);
        const landId = pixelData[mapY * mapWidth + mapX];
        const lc = (landId >> 6) & 0x03; // LandClass = bits 7-6
        const [r, g, b] = LAND_CLASS_COLORS[lc];
        const idx = (py * outW + px) * 4;
        data[idx] = r;
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

    ctx.strokeStyle = 'rgba(100, 116, 139, 0.7)';
    ctx.lineWidth = 1;
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

    for (const b of buildings) {
      // Color by alert state: alert=red, normal=green
      ctx.fillStyle = b.alert ? '#ef4444' : '#22c55e';
      const px = b.x * scaleX;
      const py = b.y * scaleY;
      const size = Math.max(2, Math.min(scaleX, scaleY) * 2);
      ctx.fillRect(px - size / 2, py - size / 2, size, size);
    }
  }

  private drawViewport(ctx: CanvasRenderingContext2D, scaleX: number, scaleY: number): void {
    const bounds = this.renderer!.getVisibleTileBounds();

    // bounds is in i,j (row,col) — convert to x,y (col,row) for minimap
    const x1 = bounds.minJ * scaleX;
    const y1 = bounds.minI * scaleY;
    const x2 = bounds.maxJ * scaleX;
    const y2 = bounds.maxI * scaleY;

    const w = x2 - x1;
    const h = y2 - y1;

    // Semi-transparent fill
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.fillRect(x1, y1, w, h);

    // Main border
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x1, y1, w, h);

    // Corner tick marks for clarity
    const tick = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Top-left
    ctx.moveTo(x1, y1 + tick); ctx.lineTo(x1, y1); ctx.lineTo(x1 + tick, y1);
    // Top-right
    ctx.moveTo(x2 - tick, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + tick);
    // Bottom-right
    ctx.moveTo(x2, y2 - tick); ctx.lineTo(x2, y2); ctx.lineTo(x2 - tick, y2);
    // Bottom-left
    ctx.moveTo(x1 + tick, y2); ctx.lineTo(x1, y2); ctx.lineTo(x1, y2 - tick);
    ctx.stroke();
  }

  /** Crosshair at the current camera position (drawn in rotated map space). */
  private drawCameraMarker(ctx: CanvasRenderingContext2D, scaleX: number, scaleY: number): void {
    const cam = this.renderer!.getCameraPosition();
    const px = cam.x * scaleX;
    const py = cam.y * scaleY;
    const size = 5;

    ctx.save();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
    ctx.lineWidth = 1.5;
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

  /** Thin gradient diamond border drawn in screen space (after ctx.restore). */
  private drawDiamondBorder(ctx: CanvasRenderingContext2D): void {
    const cx = this.currentWidth / 2;
    const cy = this.currentHeight / 2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, 1);
    ctx.lineTo(this.currentWidth - 1, cy);
    ctx.lineTo(cx, this.currentHeight - 1);
    ctx.lineTo(1, cy);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, this.currentWidth, this.currentHeight);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.6)');
    grad.addColorStop(0.5, 'rgba(148, 163, 184, 0.35)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.6)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
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

    const rotation = this.renderer.getRotation();
    const totalAngle = ISO_BASE_ANGLE + (rotation * Math.PI) / 2;

    // Inverse the canvas transform: T(center) · R(angle) · S(scale) · T(-center)
    // Inverse is: T(center) · S(1/scale) · R(-angle) · T(-center)
    const cx = this.currentWidth / 2;
    const cy = this.currentHeight / 2;
    const dx = pixelX - cx;
    const dy = pixelY - cy;

    // Inverse rotate, then inverse scale
    const invAngle = -totalAngle;
    const cos = Math.cos(invAngle);
    const sin = Math.sin(invAngle);
    const rdx = dx * cos - dy * sin;
    const rdy = dx * sin + dy * cos;
    const rx = cx + rdx / ISO_SCALE;
    const ry = cy + rdy / ISO_SCALE;

    // Convert minimap pixel → map coordinates, clamped to valid bounds
    const mapX = Math.max(0, Math.min(dims.width - 1,
      Math.round((rx / this.currentWidth) * dims.width)));
    const mapY = Math.max(0, Math.min(dims.height - 1,
      Math.round(((this.currentHeight - ry) / this.currentHeight) * dims.height)));

    this.renderer.centerOn(mapX, mapY);
  }
}
