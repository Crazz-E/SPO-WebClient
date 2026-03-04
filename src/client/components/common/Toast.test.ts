/**
 * Toast — unit tests for notification logic.
 * Tests the module-level state management (no DOM/React rendering).
 */

import {
  showToast,
  getVisibleToasts,
  dismissToast,
  resetToasts,
  subscribeToasts,
  AUTO_DISMISS_MS,
  MAX_VISIBLE,
} from './Toast';

beforeEach(() => {
  jest.useFakeTimers();
  resetToasts();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('showToast', () => {
  it('adds a toast and notifies listeners', () => {
    const listener = jest.fn();
    subscribeToasts(listener);

    showToast('Hello', 'info');

    expect(listener).toHaveBeenCalledTimes(1);
    const toasts = listener.mock.calls[0][0];
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ message: 'Hello', variant: 'info' });
  });

  it('accumulates multiple toasts', () => {
    const listener = jest.fn();
    subscribeToasts(listener);

    showToast('One', 'info');
    showToast('Two', 'success');
    showToast('Three', 'warning');
    showToast('Four', 'error');
    showToast('Five', 'info');

    const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(lastCall).toHaveLength(5);
  });

  it('assigns unique ascending ids', () => {
    const listener = jest.fn();
    subscribeToasts(listener);

    showToast('A', 'info');
    showToast('B', 'info');

    const toasts = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(Number(toasts[1].id)).toBeGreaterThan(Number(toasts[0].id));
  });

  it('sets createdAt to a recent timestamp', () => {
    const before = Date.now();
    const listener = jest.fn();
    subscribeToasts(listener);

    showToast('Timed', 'info');

    const toast = listener.mock.calls[0][0][0];
    expect(toast.createdAt).toBeGreaterThanOrEqual(before);
    expect(toast.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it('works with 1 argument (message only)', () => {
    const listener = jest.fn();
    subscribeToasts(listener);

    showToast('Just a message');

    const toast = listener.mock.calls[0][0][0];
    expect(toast.variant).toBe('info');
    expect(toast.icon).toBeUndefined();
  });

  it('works with 2 arguments (message + variant)', () => {
    const listener = jest.fn();
    subscribeToasts(listener);

    showToast('Warning!', 'warning');

    const toast = listener.mock.calls[0][0][0];
    expect(toast.variant).toBe('warning');
  });

  it('works with 3 arguments (message + variant + icon)', () => {
    const listener = jest.fn();
    subscribeToasts(listener);

    const icon = 'star-icon';
    showToast('With icon', 'success', icon);

    const toast = listener.mock.calls[0][0][0];
    expect(toast.icon).toBe(icon);
  });
});

describe('auto-dismiss', () => {
  it('removes toast after AUTO_DISMISS_MS', () => {
    const listener = jest.fn();
    subscribeToasts(listener);

    showToast('Temporary', 'info');
    expect(listener.mock.calls[listener.mock.calls.length - 1][0]).toHaveLength(1);

    jest.advanceTimersByTime(AUTO_DISMISS_MS);

    const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(lastCall).toHaveLength(0);
  });

  it('does not remove toast before AUTO_DISMISS_MS', () => {
    const listener = jest.fn();
    subscribeToasts(listener);

    showToast('Still here', 'info');
    jest.advanceTimersByTime(AUTO_DISMISS_MS - 1);

    const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(lastCall).toHaveLength(1);
  });

  it('only removes the expired toast, not others', () => {
    const listener = jest.fn();
    subscribeToasts(listener);

    showToast('First', 'info');
    jest.advanceTimersByTime(5000);
    showToast('Second', 'success');

    // First should auto-dismiss at 15000, second at 20000
    jest.advanceTimersByTime(10000); // total 15000

    const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(lastCall).toHaveLength(1);
    expect(lastCall[0].message).toBe('Second');
  });
});

describe('dismissToast', () => {
  it('removes specific toast by id', () => {
    const listener = jest.fn();
    subscribeToasts(listener);

    showToast('Keep', 'info');
    showToast('Remove', 'error');

    const toasts = listener.mock.calls[listener.mock.calls.length - 1][0];
    const removeId = toasts.find((t: { message: string }) => t.message === 'Remove').id;

    dismissToast(removeId);

    const after = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(after).toHaveLength(1);
    expect(after[0].message).toBe('Keep');
  });

  it('does nothing for unknown id', () => {
    const listener = jest.fn();
    subscribeToasts(listener);

    showToast('Only', 'info');
    dismissToast('nonexistent');

    const after = listener.mock.calls[listener.mock.calls.length - 1][0];
    expect(after).toHaveLength(1);
  });
});

describe('subscribeToasts', () => {
  it('returns unsubscribe function', () => {
    const listener = jest.fn();
    const unsub = subscribeToasts(listener);

    showToast('Before unsub', 'info');
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    showToast('After unsub', 'info');
    expect(listener).toHaveBeenCalledTimes(1); // not called again
  });
});

describe('getVisibleToasts', () => {
  it('returns empty for no toasts', () => {
    const result = getVisibleToasts([]);
    expect(result.visible).toHaveLength(0);
    expect(result.hiddenCount).toBe(0);
  });

  it('returns all toasts when count <= MAX_VISIBLE', () => {
    const toasts = Array.from({ length: MAX_VISIBLE }, (_, i) => ({
      id: String(i),
      message: `Toast ${i}`,
      variant: 'info' as const,
      createdAt: Date.now(),
    }));

    const result = getVisibleToasts(toasts);
    expect(result.visible).toHaveLength(MAX_VISIBLE);
    expect(result.hiddenCount).toBe(0);
  });

  it('limits visible to MAX_VISIBLE and counts hidden', () => {
    const toasts = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      message: `Toast ${i}`,
      variant: 'info' as const,
      createdAt: Date.now(),
    }));

    const result = getVisibleToasts(toasts);
    expect(result.visible).toHaveLength(MAX_VISIBLE);
    expect(result.hiddenCount).toBe(2);
  });

  it('shows newest first (reversed order)', () => {
    const toasts = [
      { id: '1', message: 'Oldest', variant: 'info' as const, createdAt: 1000 },
      { id: '2', message: 'Middle', variant: 'info' as const, createdAt: 2000 },
      { id: '3', message: 'Newest', variant: 'info' as const, createdAt: 3000 },
    ];

    const result = getVisibleToasts(toasts);
    expect(result.visible[0].message).toBe('Newest');
    expect(result.visible[2].message).toBe('Oldest');
  });

  it('handles single toast', () => {
    const toasts = [
      { id: '1', message: 'Solo', variant: 'success' as const, createdAt: Date.now() },
    ];

    const result = getVisibleToasts(toasts);
    expect(result.visible).toHaveLength(1);
    expect(result.hiddenCount).toBe(0);
  });
});
