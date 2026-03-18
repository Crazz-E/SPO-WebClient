/**
 * TouchHandler2D
 *
 * Touch gesture handling for the Canvas2D isometric renderer.
 * Supports:
 * - 1-finger: pan (drag)
 * - 2-finger: pinch zoom + rotation snap (90° threshold)
 * - Double-tap: center on tapped location
 */

export interface TouchCallbacks {
  onPan: (dx: number, dy: number) => void;
  onPanEnd?: () => void; // Optional: called when pan gesture ends
  onZoom: (delta: number) => void;
  onRotate: (direction: 'cw' | 'ccw') => void;
  onDoubleTap: (x: number, y: number) => void;
  onSingleTap?: (x: number, y: number) => void; // Building selection / placement confirm
}

// Minimum angle change (radians) to trigger a 90° rotation snap
const ROTATION_THRESHOLD = Math.PI / 4; // 45° threshold

// Max time between taps for double-tap (ms)
const DOUBLE_TAP_DELAY = 300;

// Max distance between taps for double-tap (px)
const DOUBLE_TAP_DISTANCE = 30;

export class TouchHandler2D {
  private canvas: HTMLCanvasElement;
  private callbacks: TouchCallbacks;

  // Touch state
  private activeTouches: Map<number, { x: number; y: number }> = new Map();

  // Pan state (1-finger)
  private isPanning = false;

  // Pinch/rotate state (2-finger)
  private initialPinchDistance = 0;
  private initialPinchAngle = 0;
  private accumulatedAngle = 0;

  // Double-tap detection
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;

  // Single-tap detection
  private touchStartTime = 0;
  private touchStartX = 0;
  private touchStartY = 0;
  private singleTapTimer: ReturnType<typeof setTimeout> | null = null;

  // Bound handlers (for cleanup)
  private boundHandlers: {
    touchstart: (e: TouchEvent) => void;
    touchmove: (e: TouchEvent) => void;
    touchend: (e: TouchEvent) => void;
    touchcancel: (e: TouchEvent) => void;
  };

  constructor(canvas: HTMLCanvasElement, callbacks: TouchCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.boundHandlers = {
      touchstart: (e) => this.onTouchStart(e),
      touchmove: (e) => this.onTouchMove(e),
      touchend: (e) => this.onTouchEnd(e),
      touchcancel: (e) => this.onTouchEnd(e),
    };

    canvas.addEventListener('touchstart', this.boundHandlers.touchstart, { passive: false });
    canvas.addEventListener('touchmove', this.boundHandlers.touchmove, { passive: false });
    canvas.addEventListener('touchend', this.boundHandlers.touchend, { passive: false });
    canvas.addEventListener('touchcancel', this.boundHandlers.touchcancel, { passive: false });
  }

  private onTouchStart(e: TouchEvent): void {
    e.preventDefault();

    // Update active touches
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      this.activeTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
    }

    if (this.activeTouches.size === 1) {
      this.isPanning = true;
      // Record start position/time for tap detection
      this.touchStartTime = Date.now();
      const t = e.changedTouches[0];
      this.touchStartX = t.clientX;
      this.touchStartY = t.clientY;
    } else if (this.activeTouches.size === 2) {
      // Switch to pinch/rotate mode
      this.isPanning = false;
      this.initPinchRotate();
    }
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();

    // Update positions
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const prev = this.activeTouches.get(touch.identifier);
      if (!prev) continue;

      if (this.activeTouches.size === 1 && this.isPanning) {
        // 1-finger pan
        const dx = touch.clientX - prev.x;
        const dy = touch.clientY - prev.y;
        this.callbacks.onPan(dx, dy);
      }

      this.activeTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
    }

    if (this.activeTouches.size === 2) {
      this.handlePinchRotate();
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    e.preventDefault();

    // Tap detection (single finger, quick release with minimal movement)
    if (e.changedTouches.length === 1 && this.activeTouches.size === 1) {
      const touch = e.changedTouches[0];
      const now = Date.now();
      const elapsed = now - this.touchStartTime;
      const moveDx = touch.clientX - this.touchStartX;
      const moveDy = touch.clientY - this.touchStartY;
      const moved = Math.sqrt(moveDx * moveDx + moveDy * moveDy);
      const isTap = elapsed < 200 && moved < 12;

      const dx = touch.clientX - this.lastTapX;
      const dy = touch.clientY - this.lastTapY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (isTap && now - this.lastTapTime < DOUBLE_TAP_DELAY && dist < DOUBLE_TAP_DISTANCE) {
        // Double-tap — cancel any pending single-tap
        if (this.singleTapTimer !== null) {
          clearTimeout(this.singleTapTimer);
          this.singleTapTimer = null;
        }
        const rect = this.canvas.getBoundingClientRect();
        this.callbacks.onDoubleTap(touch.clientX - rect.left, touch.clientY - rect.top);
        this.lastTapTime = 0; // Reset to prevent triple-tap
      } else if (isTap) {
        // Potential single-tap — wait for double-tap window before firing
        this.lastTapTime = now;
        this.lastTapX = touch.clientX;
        this.lastTapY = touch.clientY;
        if (this.callbacks.onSingleTap) {
          const rect = this.canvas.getBoundingClientRect();
          const tx = touch.clientX - rect.left;
          const ty = touch.clientY - rect.top;
          this.singleTapTimer = setTimeout(() => {
            this.singleTapTimer = null;
            this.callbacks.onSingleTap!(tx, ty);
          }, DOUBLE_TAP_DELAY);
        }
      }
      // else: drag ended — not a tap, ignore for click purposes
    }

    // Remove ended touches
    for (let i = 0; i < e.changedTouches.length; i++) {
      this.activeTouches.delete(e.changedTouches[i].identifier);
    }

    // Reset state
    if (this.activeTouches.size < 2) {
      this.accumulatedAngle = 0;
    }
    if (this.activeTouches.size === 0) {
      this.isPanning = false;

      // Notify that pan gesture has ended
      if (this.callbacks.onPanEnd) {
        this.callbacks.onPanEnd();
      }
    } else if (this.activeTouches.size === 1) {
      // One finger lifted - switch back to pan mode
      this.isPanning = true;
    }
  }

  private initPinchRotate(): void {
    const touches = Array.from(this.activeTouches.values());
    if (touches.length < 2) return;

    const dx = touches[1].x - touches[0].x;
    const dy = touches[1].y - touches[0].y;

    this.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
    this.initialPinchAngle = Math.atan2(dy, dx);
    this.accumulatedAngle = 0;
  }

  private handlePinchRotate(): void {
    const touches = Array.from(this.activeTouches.values());
    if (touches.length < 2) return;

    const dx = touches[1].x - touches[0].x;
    const dy = touches[1].y - touches[0].y;
    const currentDistance = Math.sqrt(dx * dx + dy * dy);
    const currentAngle = Math.atan2(dy, dx);

    // Pinch zoom: detect distance change
    if (this.initialPinchDistance > 0) {
      const scale = currentDistance / this.initialPinchDistance;
      if (scale > 1.3) {
        this.callbacks.onZoom(1); // Zoom in
        this.initialPinchDistance = currentDistance;
      } else if (scale < 0.7) {
        this.callbacks.onZoom(-1); // Zoom out
        this.initialPinchDistance = currentDistance;
      }
    }

    // Rotation snap: detect cumulative angle change
    let angleDelta = currentAngle - this.initialPinchAngle;

    // Normalize to [-PI, PI]
    while (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
    while (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

    this.accumulatedAngle += angleDelta;
    this.initialPinchAngle = currentAngle;

    if (this.accumulatedAngle > ROTATION_THRESHOLD) {
      this.callbacks.onRotate('ccw');
      this.accumulatedAngle = 0;
    } else if (this.accumulatedAngle < -ROTATION_THRESHOLD) {
      this.callbacks.onRotate('cw');
      this.accumulatedAngle = 0;
    }
  }

  /**
   * Remove all event listeners and cancel pending timers
   */
  destroy(): void {
    this.canvas.removeEventListener('touchstart', this.boundHandlers.touchstart);
    this.canvas.removeEventListener('touchmove', this.boundHandlers.touchmove);
    this.canvas.removeEventListener('touchend', this.boundHandlers.touchend);
    this.canvas.removeEventListener('touchcancel', this.boundHandlers.touchcancel);
    if (this.singleTapTimer !== null) {
      clearTimeout(this.singleTapTimer);
      this.singleTapTimer = null;
    }
    this.activeTouches.clear();
  }
}
