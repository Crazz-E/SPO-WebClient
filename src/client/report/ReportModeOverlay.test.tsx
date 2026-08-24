import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen, act } from '@testing-library/react';
import { ReportModeOverlay } from './ReportModeOverlay';

/** jsdom implements neither elementFromPoint nor layout; both are stubbed per test. */
function stubElementFromPoint(element: Element | null): void {
  (document as unknown as { elementFromPoint: unknown }).elementFromPoint = () => element;
}

function stubRect(element: Element, rect: { top: number; left: number; width: number; height: number }): void {
  element.getBoundingClientRect = () => ({
    ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top,
    toJSON: () => ({}),
  }) as DOMRect;
}

let target: HTMLButtonElement;

beforeEach(() => {
  document.body.innerHTML = '';
  target = document.createElement('button');
  target.textContent = 'Set tax';
  document.body.appendChild(target);
  stubRect(target, { top: 10, left: 20, width: 100, height: 30 });
  stubElementFromPoint(target);
});

afterEach(() => {
  delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
});

describe('ReportModeOverlay', () => {
  it('renders a hint and nothing to intercept the pointer', () => {
    render(<ReportModeOverlay onCapture={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('report-mode-overlay')).toBeTruthy();
    expect(screen.queryByTestId('report-highlight')).toBeNull();
  });

  it('follows the pointer, highlighting the element underneath', () => {
    render(<ReportModeOverlay onCapture={() => {}} onCancel={() => {}} />);

    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 20, bubbles: true }));
    });

    const highlight = screen.getByTestId('report-highlight');
    expect(highlight.style.top).toBe('10px');
    expect(highlight.style.left).toBe('20px');
    expect(highlight.style.width).toBe('100px');
    expect(highlight.style.height).toBe('30px');
  });

  it('clears the highlight when nothing is under the pointer', () => {
    render(<ReportModeOverlay onCapture={() => {}} onCancel={() => {}} />);
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 20, bubbles: true }));
    });
    stubElementFromPoint(null);
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 900, clientY: 900, bubbles: true }));
    });
    expect(screen.queryByTestId('report-highlight')).toBeNull();
  });

  it('captures the click and hands over the element and the point', () => {
    const captured: Array<[Element, number, number]> = [];
    render(<ReportModeOverlay onCapture={(el, x, y) => captured.push([el, x, y])} onCancel={() => {}} />);

    act(() => {
      window.dispatchEvent(new MouseEvent('click', { clientX: 50, clientY: 20, bubbles: true, cancelable: true }));
    });

    expect(captured).toHaveLength(1);
    expect(captured[0][0]).toBe(target);
    expect(captured[0].slice(1)).toEqual([50, 20]);
  });

  it('never lets the flagged control fire — the human is reporting it, not using it', () => {
    const clicked = jest.fn();
    target.addEventListener('click', clicked);
    render(<ReportModeOverlay onCapture={() => {}} onCancel={() => {}} />);

    const event = new MouseEvent('click', { clientX: 50, clientY: 20, bubbles: true, cancelable: true });
    act(() => { target.dispatchEvent(event); });

    expect(clicked).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('cancels on Escape without letting the global handler unstack a surface', () => {
    const onCancel = jest.fn();
    const bubbleListener = jest.fn();
    window.addEventListener('keydown', bubbleListener);
    render(<ReportModeOverlay onCapture={() => {}} onCancel={onCancel} />);

    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(bubbleListener).not.toHaveBeenCalled();
    window.removeEventListener('keydown', bubbleListener);
  });

  it('ignores keys that are not Escape', () => {
    const onCancel = jest.fn();
    render(<ReportModeOverlay onCapture={() => {}} onCancel={onCancel} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does nothing on a click when nothing resolves under the pointer', () => {
    const onCapture = jest.fn();
    stubElementFromPoint(null);
    render(<ReportModeOverlay onCapture={onCapture} onCancel={() => {}} />);
    act(() => {
      window.dispatchEvent(new MouseEvent('click', { clientX: 5, clientY: 5, bubbles: true, cancelable: true }));
    });
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('survives a browser with no elementFromPoint at all', () => {
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    const onCapture = jest.fn();
    render(<ReportModeOverlay onCapture={onCapture} onCancel={() => {}} />);
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 5, clientY: 5, bubbles: true }));
      window.dispatchEvent(new MouseEvent('click', { clientX: 5, clientY: 5, bubbles: true, cancelable: true }));
    });
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('removes its listeners on unmount', () => {
    const onCapture = jest.fn();
    const { unmount } = render(<ReportModeOverlay onCapture={onCapture} onCancel={() => {}} />);
    unmount();
    act(() => {
      window.dispatchEvent(new MouseEvent('click', { clientX: 50, clientY: 20, bubbles: true, cancelable: true }));
    });
    expect(onCapture).not.toHaveBeenCalled();
  });
});
