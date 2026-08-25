import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen, act } from '@testing-library/react';
import {
  ReportFab, clampToViewport, FAB_POSITION_KEY, FAB_SIZE_PX, TAP_SLOP_PX,
} from './ReportFab';

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

/** jsdom has no pointer capture; the component calls it optionally, so a stub keeps it honest. */
function pointer(type: string, x: number, y: number): PointerEvent {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }) as unknown as PointerEvent;
  (event as unknown as { pointerId: number }).pointerId = 1;
  return event;
}

function fab(): HTMLElement {
  return screen.getByTestId('report-fab');
}

/** Where the button starts with an empty localStorage, in a 390×844 viewport. */
const DEFAULT_X = 390 - FAB_SIZE_PX - 12;
const DEFAULT_Y = 844 - FAB_SIZE_PX - 56 - 24;

function drag(from: [number, number], to: [number, number]): void {
  const el = fab();
  act(() => {
    el.dispatchEvent(pointer('pointerdown', ...from));
    el.dispatchEvent(pointer('pointermove', ...to));
    el.dispatchEvent(pointer('pointerup', ...to));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  setViewport(390, 844);
  document.documentElement.style.setProperty('--sai-top', '47px');
  document.documentElement.style.setProperty('--sai-bottom', '34px');
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('style');
});

describe('clampToViewport', () => {
  const insets = { top: 47, right: 0, bottom: 34, left: 0 };

  it('keeps a position that is already inside', () => {
    expect(clampToViewport({ x: 100, y: 300 }, { width: 390, height: 844 }, insets))
      .toEqual({ x: 100, y: 300 });
  });

  it('pulls a position back inside the viewport, clear of the insets', () => {
    expect(clampToViewport({ x: 9999, y: 9999 }, { width: 390, height: 844 }, insets))
      .toEqual({ x: 390 - FAB_SIZE_PX, y: 844 - 34 - FAB_SIZE_PX });
    expect(clampToViewport({ x: -50, y: -50 }, { width: 390, height: 844 }, insets))
      .toEqual({ x: 0, y: 47 });
  });

  it('does not invert on a viewport smaller than the button', () => {
    const clamped = clampToViewport({ x: 10, y: 10 }, { width: 20, height: 20 }, insets);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
  });
});

describe('ReportFab', () => {
  it('is at least 44 px on both axes — the threshold it exists to measure', () => {
    render(<ReportFab armed={false} onToggleArmed={() => {}} />);
    // jsdom reports no layout, so assert on the declared size instead.
    expect(FAB_SIZE_PX).toBeGreaterThanOrEqual(44);
    expect(fab()).toBeTruthy();
  });

  it('starts near the bottom right, above where BottomNav sits', () => {
    render(<ReportFab armed={false} onToggleArmed={() => {}} />);
    expect(fab().style.left).toBe(`${DEFAULT_X}px`);
    expect(Number.parseFloat(fab().style.top)).toBeLessThan(844 - FAB_SIZE_PX);
  });

  it('announces whether report mode is armed', () => {
    const { rerender } = render(<ReportFab armed={false} onToggleArmed={() => {}} />);
    expect(fab().getAttribute('aria-pressed')).toBe('false');
    expect(fab().getAttribute('aria-label')).toBe('Report a bug');

    rerender(<ReportFab armed onToggleArmed={() => {}} />);
    expect(fab().getAttribute('aria-pressed')).toBe('true');
    expect(fab().getAttribute('aria-label')).toBe('Cancel report mode');
  });
});

describe('ReportFab — tap versus drag', () => {
  it('treats movement under the slop as a tap and arms report mode', () => {
    const onToggleArmed = jest.fn();
    render(<ReportFab armed={false} onToggleArmed={onToggleArmed} />);
    const before = fab().style.left;

    drag([200, 400], [200 + TAP_SLOP_PX - 1, 400]);

    expect(onToggleArmed).toHaveBeenCalledTimes(1);
    expect(fab().style.left).toBe(before);
    expect(window.localStorage.getItem(FAB_POSITION_KEY)).toBeNull();
  });

  it('treats a real drag as a move, and does not arm', () => {
    const onToggleArmed = jest.fn();
    render(<ReportFab armed={false} onToggleArmed={onToggleArmed} />);

    // The button moves by the pointer's delta, not to the pointer: grabbing it off-centre
    // must not teleport it under the finger.
    drag([300, 700], [100, 300]);

    expect(onToggleArmed).not.toHaveBeenCalled();
    expect(fab().style.left).toBe(`${DEFAULT_X - 200}px`);
    expect(fab().style.top).toBe(`${DEFAULT_Y - 400}px`);
  });

  it('persists the position it was dragged to', () => {
    render(<ReportFab armed={false} onToggleArmed={() => {}} />);
    drag([300, 700], [120, 320]);

    expect(JSON.parse(window.localStorage.getItem(FAB_POSITION_KEY) as string))
      .toEqual({ x: DEFAULT_X - 180, y: DEFAULT_Y - 380 });
  });

  it('restores the saved position on mount', () => {
    window.localStorage.setItem(FAB_POSITION_KEY, JSON.stringify({ x: 40, y: 200 }));
    render(<ReportFab armed={false} onToggleArmed={() => {}} />);

    expect(fab().style.left).toBe('40px');
    expect(fab().style.top).toBe('200px');
  });

  it('clamps a saved position that no longer fits the viewport', () => {
    window.localStorage.setItem(FAB_POSITION_KEY, JSON.stringify({ x: 5000, y: 5000 }));
    render(<ReportFab armed={false} onToggleArmed={() => {}} />);

    expect(Number.parseFloat(fab().style.left)).toBeLessThanOrEqual(390 - FAB_SIZE_PX);
    expect(Number.parseFloat(fab().style.top)).toBeLessThanOrEqual(844 - FAB_SIZE_PX);
  });

  it('ignores a corrupt saved position rather than losing the button', () => {
    window.localStorage.setItem(FAB_POSITION_KEY, '{not json');
    expect(() => render(<ReportFab armed={false} onToggleArmed={() => {}} />)).not.toThrow();
    expect(fab()).toBeTruthy();
  });

  it('ignores a saved value of the wrong shape', () => {
    window.localStorage.setItem(FAB_POSITION_KEY, JSON.stringify({ x: 'left', y: null }));
    render(<ReportFab armed={false} onToggleArmed={() => {}} />);
    expect(fab().style.left).toBe(`${DEFAULT_X}px`);
  });

  it('ignores pointer events from a second finger mid-drag', () => {
    const onToggleArmed = jest.fn();
    render(<ReportFab armed={false} onToggleArmed={onToggleArmed} />);
    const el = fab();
    const other = pointer('pointerup', 0, 0);
    (other as unknown as { pointerId: number }).pointerId = 99;

    act(() => {
      el.dispatchEvent(pointer('pointerdown', 200, 400));
      el.dispatchEvent(other);
    });

    expect(onToggleArmed).not.toHaveBeenCalled();
  });

  it('does nothing on a pointerup that never had a pointerdown', () => {
    const onToggleArmed = jest.fn();
    render(<ReportFab armed={false} onToggleArmed={onToggleArmed} />);
    act(() => { fab().dispatchEvent(pointer('pointerup', 10, 10)); });
    expect(onToggleArmed).not.toHaveBeenCalled();
  });
});

describe('ReportFab — the viewport moving under it', () => {
  it('pulls itself back inside when the window shrinks', () => {
    render(<ReportFab armed={false} onToggleArmed={() => {}} />);
    setViewport(200, 400);
    act(() => { window.dispatchEvent(new Event('resize')); });

    expect(Number.parseFloat(fab().style.left)).toBeLessThanOrEqual(200 - FAB_SIZE_PX);
  });
});
