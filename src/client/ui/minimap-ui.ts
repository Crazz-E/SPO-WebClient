/**
 * MinimapUI - Small top-down overview map with viewport indicator and click-to-navigate
 *
 * Renders buildings as colored dots, road segments as lines, and the current
 * viewport as a translucent rectangle. Click anywhere on the minimap to
 * re-center the main camera.
 *
 * Toggle visibility with the 'M' key.
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
}

const DEFAULT_SIZE = 200;
const MIN_SIZE = 120;
const MAX_SIZE = 500;
const MINIMAP_PADDING = 12;
const UPDATE_INTERVAL_MS = 500;

export class MinimapUI {
  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private renderer: MinimapRendererAPI | null = null;
  private visible = false;
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private currentWidth = DEFAULT_SIZE;
  private currentHeight = DEFAULT_SIZE;
  private unsubPanel: (() => void) | null = null;

  constructor() {
    // Minimap is always visible once renderer is attached — no toggle needed.
  }

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
    if (this.container) {
      this.container.style.display = 'block';
    }
    this.startUpdating();
  }

  /**
   * Hide the minimap and stop periodic rendering.
   */
  public hide(): void {
    if (!this.visible) return;
    this.visible = false;
    if (this.container) {
      this.container.style.display = 'none';
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
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
    this.container = null;
    this.canvas = null;
    this.ctx = null;
  }

  /**
   * Shift the minimap container to avoid an open left panel.
   */
  private applyPanelOffset(panelOpen: boolean): void {
    if (!this.container) return;
    if (panelOpen) {
      // Read the CSS custom property so we stay in sync with the design tokens
      const panelWidth =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--panel-width-desktop')
          .trim() || '420px';
      this.container.style.left = `calc(${panelWidth} + ${MINIMAP_PADDING}px)`;
    } else {
      this.container.style.left = `${MINIMAP_PADDING}px`;
    }
  }

  // ---------------------------------------------------------------------------
  // DOM setup
  // ---------------------------------------------------------------------------

  private ensureDOM(): void {
    if (this.canvas) return;

    // Container — positioned top-left of the viewport
    this.container = document.createElement('div');
    this.container.id = 'minimap-container';
    this.container.style.cssText = `
      position: fixed;
      top: ${MINIMAP_PADDING}px;
      left: ${MINIMAP_PADDING}px;
      width: ${this.currentWidth}px;
      height: ${this.currentHeight}px;
      border: 2px solid rgba(148, 163, 184, 0.6);
      border-radius: 8px;
      overflow: hidden;
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      cursor: crosshair;
      background: #0f172a;
      transition: left 250ms cubic-bezier(0.16, 1, 0.3, 1);
    `;

    // Shift minimap when left panel opens (matches LeftRail behavior)
    this.applyPanelOffset(useUiStore.getState().leftPanel !== null);
    this.unsubPanel = useUiStore.subscribe(
      (state) => {
        this.applyPanelOffset(state.leftPanel !== null);
      },
    );

    // Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.currentWidth;
    this.canvas.height = this.currentHeight;
    this.canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
    this.ctx = this.canvas.getContext('2d');

    this.container.appendChild(this.canvas);

    // Resize handle — bottom-right corner (SE)
    const handle = document.createElement('div');
    handle.style.cssText = `
      position: absolute;
      bottom: 0;
      right: 0;
      width: 14px;
      height: 14px;
      cursor: se-resize;
      z-index: 1;
    `;
    this.container.appendChild(handle);
    this.attachResizeListeners(handle);

    document.body.appendChild(this.container);

    // Click-to-navigate
    this.canvas.onmousedown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleClick(e.offsetX, e.offsetY);
    };
  }

  private attachResizeListeners(handle: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    let startW = 0;

    const onMouseMove = (e: MouseEvent) => {
      // Dragging SE handle: moving right/down = bigger, left/up = smaller
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const delta = Math.max(dx, dy);
      const newSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, startW + delta));
      this.currentWidth = newSize;
      this.currentHeight = newSize;
      if (this.container) {
        this.container.style.width = `${newSize}px`;
        this.container.style.height = `${newSize}px`;
      }
      if (this.canvas) {
        this.canvas.width = newSize;
        this.canvas.height = newSize;
      }
      this.render();
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
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

    // Scale factor: map coordinates → minimap pixels
    const scaleX = this.currentWidth / dims.width;
    const scaleY = this.currentHeight / dims.height;

    // Clear
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.currentWidth, this.currentHeight);

    // Draw road segments
    this.drawRoads(ctx, scaleX, scaleY);

    // Draw buildings
    this.drawBuildings(ctx, scaleX, scaleY);

    // Draw viewport rectangle
    this.drawViewport(ctx, scaleX, scaleY);
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
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.fillRect(x1, y1, w, h);

    // Border
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x1, y1, w, h);
  }

  // ---------------------------------------------------------------------------
  // Click → navigate
  // ---------------------------------------------------------------------------

  private handleClick(pixelX: number, pixelY: number): void {
    if (!this.renderer) return;

    const dims = this.renderer.getMapDimensions();
    if (dims.width === 0 || dims.height === 0) return;

    // Convert minimap pixel → map coordinates (x=col, y=row)
    const mapX = Math.round((pixelX / this.currentWidth) * dims.width);
    const mapY = Math.round((pixelY / this.currentHeight) * dims.height);

    this.renderer.centerOn(mapX, mapY);
  }
}
