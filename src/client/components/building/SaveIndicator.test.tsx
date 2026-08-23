/**
 * SaveIndicator component tests.
 *
 * The four states the indicator can be in, and the one distinction that
 * carries meaning: a checkmark asserts the server holds the value, a
 * `confirmedMessage` does not. Members whose write cannot be read back — the
 * tax family — pass a message so the UI stops claiming a confirmation it
 * never received.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { useBuildingStore } from '../../store/building-store';
import { SaveIndicator } from './SaveIndicator';

const KEY = 'RDOSetTaxValue:{"index":"3"}';
const NOTICE = 'The new tax rate will take effect tomorrow.';

/** Drain a timer without leaving React state updates outside act(). */
function advance(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

describe('SaveIndicator', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useBuildingStore.setState({
      pendingUpdates: new Map(),
      confirmedUpdates: new Map(),
      failedUpdates: new Map(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when the key has no state', () => {
    const { container } = renderWithProviders(<SaveIndicator propertyKey={KEY} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows a pulsing dot while the write is in flight, with a spoken label', () => {
    act(() => useBuildingStore.getState().setPending(KEY, '37'));
    const { container } = renderWithProviders(<SaveIndicator propertyKey={KEY} />);
    expect(container.querySelector('.pendingDot')).not.toBeNull();
    expect(container.textContent).toContain('Saving');
  });

  it('shows a checkmark when no message is supplied', () => {
    act(() => useBuildingStore.getState().confirmPending(KEY));
    const { container } = renderWithProviders(<SaveIndicator propertyKey={KEY} />);
    expect(container.querySelector('.checkmark')).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the message instead of the checkmark when one is supplied', () => {
    act(() => useBuildingStore.getState().confirmPending(KEY));
    const { container } = renderWithProviders(
      <SaveIndicator propertyKey={KEY} confirmedMessage={NOTICE} />,
    );
    expect(container.querySelector('.checkmark')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(NOTICE);
  });

  it('clears the checkmark after its 1.5s dwell', () => {
    act(() => useBuildingStore.getState().confirmPending(KEY));
    renderWithProviders(<SaveIndicator propertyKey={KEY} />);

    advance(1500);
    expect(useBuildingStore.getState().confirmedUpdates.has(KEY)).toBe(false);
  });

  it('holds the message longer than the checkmark, because a sentence is read not glanced', () => {
    act(() => useBuildingStore.getState().confirmPending(KEY));
    renderWithProviders(<SaveIndicator propertyKey={KEY} confirmedMessage={NOTICE} />);

    advance(1500);
    expect(useBuildingStore.getState().confirmedUpdates.has(KEY)).toBe(true);

    advance(3500);
    expect(useBuildingStore.getState().confirmedUpdates.has(KEY)).toBe(false);
  });

  it('shows the failure and clears it after 4s', () => {
    act(() => useBuildingStore.getState().failPending(KEY, '12', 'Server rejected the change'));
    const { container } = renderWithProviders(<SaveIndicator propertyKey={KEY} />);
    expect(container.textContent).toContain('Failed');
    // the reason is visible text and the failure is announced, not hidden in a tooltip
    expect(screen.getByRole('alert').textContent).toContain('Server rejected the change');

    advance(4000);
    expect(useBuildingStore.getState().failedUpdates.has(KEY)).toBe(false);
  });
});
