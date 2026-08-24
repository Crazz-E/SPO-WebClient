import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ClientContext } from '../context/ClientContext';
import { createSpiedCallbacks } from '../__tests__/setup/render-helpers';
import { validateBugReport } from '../../shared/bug-report-schema';
import { reportJournal } from './journal';
import { BugReportRoot } from './BugReportRoot';

let posted: string[] = [];
const originalFetch = (globalThis as unknown as { fetch?: unknown }).fetch;

function mockFetch(response: { ok: boolean; body: unknown } = { ok: true, body: { ok: true, file: 'r.json' } }): void {
  (globalThis as unknown as { fetch: unknown }).fetch = ((_url: string, init: { body: string }) => {
    posted.push(init.body);
    return Promise.resolve({ ok: response.ok, status: response.ok ? 200 : 400, json: () => Promise.resolve(response.body) });
  }) as unknown as typeof fetch;
}

function stubElementFromPoint(element: Element | null): void {
  (document as unknown as { elementFromPoint: unknown }).elementFromPoint = () => element;
}

function renderRoot(overrides: Record<string, (...args: unknown[]) => unknown> = {}) {
  const callbacks = createSpiedCallbacks({
    onGetUsername: () => 'SPO_test3',
    onGetWorld: () => 'planitia',
    ...overrides,
  });
  return render(
    <ClientContext.Provider value={callbacks}>
      <BugReportRoot />
    </ClientContext.Provider>
  );
}

function pressF8(): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true }));
  });
}

function clickAt(x = 50, y = 20): void {
  act(() => {
    window.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
  });
}

let target: HTMLButtonElement;

beforeEach(() => {
  posted = [];
  mockFetch();
  document.body.innerHTML = '';
  target = document.createElement('button');
  target.textContent = '  12 %  ';
  document.body.appendChild(target);
  target.getBoundingClientRect = () => ({ top: 0, left: 0, width: 10, height: 10, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  stubElementFromPoint(target);
  reportJournal.disarm();
  reportJournal.reset();
});

afterEach(() => {
  (globalThis as unknown as { fetch?: unknown }).fetch = originalFetch;
  delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
  reportJournal.disarm();
  reportJournal.reset();
});

describe('BugReportRoot — arming', () => {
  it('renders nothing until F8', () => {
    renderRoot();
    expect(screen.queryByTestId('report-mode-overlay')).toBeNull();
    expect(screen.queryByTestId('report-modal')).toBeNull();
  });

  it('F8 arms report mode, and F8 again disarms it', () => {
    renderRoot();
    pressF8();
    expect(screen.getByTestId('report-mode-overlay')).toBeTruthy();
    pressF8();
    expect(screen.queryByTestId('report-mode-overlay')).toBeNull();
  });

  it('arms the journal on mount, so the 60 s before F8 are already recorded', () => {
    renderRoot();
    expect(reportJournal.isArmed).toBe(true);
  });

  it('disarms the journal on unmount', () => {
    const { unmount } = renderRoot();
    unmount();
    expect(reportJournal.isArmed).toBe(false);
  });
});

describe('BugReportRoot — capturing a DOM element', () => {
  it('opens the modal with observed pre-filled from the element text', () => {
    renderRoot();
    pressF8();
    clickAt();

    expect(screen.getByTestId('report-modal')).toBeTruthy();
    expect((screen.getByLabelText('Observed') as HTMLInputElement).value).toBe('12 %');
    // The overlay steps aside once something is captured.
    expect(screen.queryByTestId('report-mode-overlay')).toBeNull();
  });

  it('POSTs a report the gateway validator accepts', async () => {
    renderRoot();
    pressF8();
    clickAt();
    fireEvent.change(screen.getByLabelText('Expected'), { target: { value: '15 %' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    const report = JSON.parse(posted[0]) as Record<string, unknown>;

    expect(validateBugReport(report).ok).toBe(true);
    expect(report).toMatchObject({
      profile: 'desktop', kind: 'wrong-data', username: 'SPO_test3', world: 'planitia',
      observed: '12 %', expected: '15 %',
    });
    expect((report.anchor as { kind: string }).kind).toBe('dom');
    await waitFor(() => expect(screen.queryByTestId('report-modal')).toBeNull());
  });

  it('closes the modal on a refusal too, rather than trapping the human', async () => {
    mockFetch({ ok: false, body: { error: 'nope' } });
    renderRoot();
    pressF8();
    clickAt();
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() => expect(screen.queryByTestId('report-modal')).toBeNull());
  });

  it('cancelling the modal sends nothing', () => {
    renderRoot();
    pressF8();
    clickAt();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('report-modal')).toBeNull();
    expect(posted).toEqual([]);
  });

  it('Escape while armed cancels without opening the modal', () => {
    renderRoot();
    pressF8();
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(screen.queryByTestId('report-mode-overlay')).toBeNull();
    expect(screen.queryByTestId('report-modal')).toBeNull();
  });
});

describe('BugReportRoot — capturing the map canvas', () => {
  function makeCanvas(): HTMLElement {
    const canvas = document.createElement('canvas');
    canvas.id = 'game-canvas';
    document.body.appendChild(canvas);
    canvas.getBoundingClientRect = () => ({ top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    stubElementFromPoint(canvas);
    return canvas;
  }

  it('routes to the renderer probe rather than the DOM walk', async () => {
    makeCanvas();
    renderRoot({
      onGetCanvasAnchor: () => ({ tileX: 412, tileY: 88, layer: 'building', visualClass: 'FarmClass' }),
      onGetCanvasScreenshot: () => 'data:image/jpeg;base64,AAA',
    });
    pressF8();
    clickAt(400, 300);

    expect(screen.getByText('map tile 412,88 (building · FarmClass)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    const report = JSON.parse(posted[0]) as { anchor: Record<string, unknown> };
    expect(report.anchor).toMatchObject({
      kind: 'canvas', tileX: 412, tileY: 88, layer: 'building',
      screenshotDataUrl: 'data:image/jpeg;base64,AAA',
    });
    expect(validateBugReport(report).ok).toBe(true);
  });

  it('omits the screenshot when the canvas cannot produce one', async () => {
    makeCanvas();
    renderRoot({
      onGetCanvasAnchor: () => ({ tileX: 1, tileY: 2, layer: 'terrain' }),
      onGetCanvasScreenshot: () => null,
    });
    pressF8();
    clickAt(400, 300);
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    const report = JSON.parse(posted[0]) as { anchor: Record<string, unknown> };
    expect(report.anchor).not.toHaveProperty('screenshotDataUrl');
  });

  it('refuses to anchor on a map that is not up yet', () => {
    makeCanvas();
    renderRoot({ onGetCanvasAnchor: () => null });
    pressF8();
    clickAt(400, 300);

    expect(screen.queryByTestId('report-modal')).toBeNull();
    expect(posted).toEqual([]);
  });
});

describe('BugReportRoot — the keys it does not claim', () => {
  it('leaves every other key alone', () => {
    const seen = jest.fn();
    window.addEventListener('keydown', seen);
    renderRoot();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }));
    });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('report-mode-overlay')).toBeNull();
    window.removeEventListener('keydown', seen);
  });
});
