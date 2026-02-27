/**
 * MapNavigationUI - Handles map display and interactions
 *
 * Uses Canvas 2D isometric renderer with:
 * - Vegetation→flat texture mapping near dynamic content
 * - 90° snap rotation (Q/E keys, 2-finger gesture)
 * - Mobile touch support (pan, pinch zoom, rotation, double-tap)
 */

import { IsometricMapRenderer } from '../renderer/isometric-map-renderer';
import { FacilityDimensions } from '../../shared/types';

export class MapNavigationUI {
  private canvas: HTMLCanvasElement | null = null;
  private renderer: IsometricMapRenderer | null = null;

  // Callbacks
  private onLoadZone: ((x: number, y: number, w: number, h: number) => void) | null = null;
  private onBuildingClick: ((x: number, y: number, visualClass?: string) => void) | null = null;
  private onFetchFacilityDimensions: ((visualClass: string) => Promise<FacilityDimensions | null>) | null = null;

  constructor(private gamePanel: HTMLElement, private worldName: string = 'Shamba') {}

  /**
   * Set callback for loading new zones
   */
  public setOnLoadZone(callback: (x: number, y: number, w: number, h: number) => void) {
    this.onLoadZone = callback;
    console.log('[MapNavigationUI] onLoadZone callback set');

    // Trigger initial zone loading now that callback is set
    if (this.renderer) {
      console.log('[MapNavigationUI] Triggering initial zone load');
      setTimeout(() => {
        this.renderer?.triggerZoneCheck();
      }, 100);
    }
  }

  /**
   * Set callback for building clicks
   */
  public setOnBuildingClick(callback: (x: number, y: number, visualClass?: string) => void) {
    this.onBuildingClick = callback;
  }

  /**
   * Set callback for fetching facility dimensions
   */
  public setOnFetchFacilityDimensions(callback: (visualClass: string) => Promise<FacilityDimensions | null>) {
    this.onFetchFacilityDimensions = callback;
  }

  /**
   * Initialize the canvas and renderer
   */
  public init() {
    // Remove placeholder
    const placeholder = this.gamePanel.querySelector('div');
    if (placeholder) {
      placeholder.remove();
    }

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game-canvas';
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.backgroundColor = '#111';
    this.gamePanel.appendChild(this.canvas);

    // Initialize Canvas 2D isometric renderer
    console.log('[MapNavigationUI] Initializing Canvas 2D isometric renderer');

    this.renderer = new IsometricMapRenderer('game-canvas');
    this.setupRendererCallbacks();

    // Create vegetation control UI
    this.createVegetationControls();

    // Load map
    this.renderer.loadMap(this.worldName).then(() => {
      console.log('[MapNavigationUI] Terrain loaded successfully');
    }).catch((err) => {
      console.error('[MapNavigationUI] Failed to load terrain:', err);
    });
  }

  /**
   * Setup renderer callbacks
   */
  private setupRendererCallbacks() {
    if (!this.renderer) return;

    this.renderer.setLoadZoneCallback((x, y, w, h) => {
      console.log(`[MapNavigationUI] Zone callback triggered: (${x}, ${y}) ${w}x${h}, onLoadZone=${!!this.onLoadZone}`);
      if (this.onLoadZone) {
        this.onLoadZone(x, y, w, h);
      } else {
        console.warn('[MapNavigationUI] onLoadZone callback not set yet!');
      }
    });

    this.renderer.setBuildingClickCallback((x, y, visualClass) => {
      if (this.onBuildingClick) this.onBuildingClick(x, y, visualClass);
    });

    this.renderer.setFetchFacilityDimensionsCallback(async (visualClass) => {
      if (this.onFetchFacilityDimensions) {
        return await this.onFetchFacilityDimensions(visualClass);
      }
      return null;
    });
  }

  /**
   * Get the renderer (for map data operations)
   */
  public getRenderer(): IsometricMapRenderer | null {
    return this.renderer;
  }

  /**
   * Create vegetation display controls
   */
  private createVegetationControls(): void {
    if (!this.renderer) return;

    const panel = document.createElement('div');
    panel.id = 'vegetation-controls';
    panel.style.cssText = 'position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.7);padding:8px 12px;border-radius:6px;color:#fff;font:12px monospace;z-index:10;display:flex;flex-direction:column;gap:4px;';

    // Checkbox: hide vegetation on camera move
    const moveLabel = document.createElement('label');
    moveLabel.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;';
    const moveCheckbox = document.createElement('input');
    moveCheckbox.type = 'checkbox';
    moveCheckbox.checked = false;
    moveCheckbox.addEventListener('change', () => {
      this.renderer?.setHideVegetationOnMove(moveCheckbox.checked);
    });
    moveLabel.appendChild(moveCheckbox);
    moveLabel.appendChild(document.createTextNode('Hide vegetation on move'));
    panel.appendChild(moveLabel);

    this.gamePanel.appendChild(panel);
  }

  /**
   * Destroy renderer and cleanup
   */
  public destroy() {
    this.renderer?.destroy();
    this.renderer = null;
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
  }
}
