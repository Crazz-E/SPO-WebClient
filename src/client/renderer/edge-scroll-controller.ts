/**
 * EdgeScrollController
 *
 * Scrolls the map when the mouse cursor is near the screen edges.
 * Speed ramps linearly from baseSpeed at the inner edge of the zone
 * to maxSpeed at the very screen boundary. Frame-rate independent
 * via deltaTime.
 */

export interface EdgeScrollCallbacks {
  /** Called each frame with screen-pixel deltas while scrolling */
  onPan: (screenDx: number, screenDy: number) => void;
  /** Fired once when edge-scrolling begins */
  onScrollStart: () => void;
  /** Fired once when edge-scrolling ends */
  onScrollStop: () => void;
}

export interface EdgeScrollConfig {
  /** Pixels from edge to trigger scrolling (default 30) */
  edgeSize: number;
  /** Pixels/second at inner edge of zone */
  baseSpeed: number;
  /** Pixels/second at very screen boundary */
  maxSpeed: number;
}

const DEFAULT_CONFIG: EdgeScrollConfig = {
  edgeSize: 30,
  baseSpeed: 300,
  maxSpeed: 800,
};

export class EdgeScrollController {
  private config: EdgeScrollConfig;
  private callbacks: EdgeScrollCallbacks;
  private enabled = true;

  // Mouse position relative to canvas
  private mouseX = -1;
  private mouseY = -1;
  private canvasWidth = 0;
  private canvasHeight = 0;

  // Scroll state
  private scrolling = false;
  private dirX = 0;
  private dirY = 0;
  private lastFrameTime = 0;
  private animFrameId = 0;

  constructor(callbacks: EdgeScrollCallbacks, config?: Partial<EdgeScrollConfig>) {
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update mouse position (call from canvas mousemove).
   * Coordinates are relative to the canvas top-left.
   */
  updateMousePosition(canvasX: number, canvasY: number, canvasWidth: number, canvasHeight: number): void {
    this.mouseX = canvasX;
    this.mouseY = canvasY;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.evaluate();
  }

  /** Stop scrolling (call on mouseleave or when drag starts) */
  stop(): void {
    if (this.scrolling) {
      this.scrolling = false;
      this.dirX = 0;
      this.dirY = 0;
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = 0;
      }
      this.callbacks.onScrollStop();
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  isScrolling(): boolean {
    return this.scrolling;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  destroy(): void {
    this.stop();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private evaluate(): void {
    if (!this.enabled || this.canvasWidth === 0 || this.canvasHeight === 0) return;

    const { edgeSize } = this.config;
    let dx = 0;
    let dy = 0;

    // Horizontal: negative = scroll left (pan right), positive = scroll right (pan left)
    if (this.mouseX >= 0 && this.mouseX < edgeSize) {
      dx = -(1 - this.mouseX / edgeSize);
    } else if (this.mouseX > this.canvasWidth - edgeSize) {
      dx = (this.mouseX - (this.canvasWidth - edgeSize)) / edgeSize;
    }

    // Vertical: negative = scroll up (pan down), positive = scroll down (pan up)
    if (this.mouseY >= 0 && this.mouseY < edgeSize) {
      dy = -(1 - this.mouseY / edgeSize);
    } else if (this.mouseY > this.canvasHeight - edgeSize) {
      dy = (this.mouseY - (this.canvasHeight - edgeSize)) / edgeSize;
    }

    // Clamp to [-1, 1]
    dx = Math.max(-1, Math.min(1, dx));
    dy = Math.max(-1, Math.min(1, dy));

    if (dx !== 0 || dy !== 0) {
      this.dirX = dx;
      this.dirY = dy;
      if (!this.scrolling) {
        this.scrolling = true;
        this.lastFrameTime = performance.now();
        this.callbacks.onScrollStart();
        this.tick();
      }
    } else {
      if (this.scrolling) {
        this.stop();
      }
    }
  }

  private tick(): void {
    if (!this.scrolling) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.1); // cap at 100ms
    this.lastFrameTime = now;

    const magnitude = Math.sqrt(this.dirX * this.dirX + this.dirY * this.dirY);
    const speed = this.config.baseSpeed +
      (this.config.maxSpeed - this.config.baseSpeed) * Math.min(magnitude, 1);

    // Normalize direction so diagonal speed equals edge speed
    const norm = magnitude > 0 ? magnitude : 1;
    const screenDx = (this.dirX / norm) * speed * dt;
    const screenDy = (this.dirY / norm) * speed * dt;

    this.callbacks.onPan(screenDx, screenDy);

    this.animFrameId = requestAnimationFrame(() => this.tick());
  }
}
