/**
 * SaveIndicator component tests.
 *
 * The states the indicator can be in, and the one distinction that carries
 * meaning: a checkmark asserts the server holds the value, "Sent" does not.
 * Which of the two appears is decided by the VERDICT the gateway returned
 * (OB-1) — not by the call site, which used to be able to pass a
 * `confirmedMessage` and get the excuse even on a genuinely confirmed write,
 * and got the green tick whenever it passed nothing.
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
    act(() => useBuildingStore.getState().confirmPending(KEY, 'confirmed'));
    const { container } = renderWithProviders(<SaveIndicator propertyKey={KEY} />);
    expect(container.querySelector('.checkmark')).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ignores the message on a confirmed write — a verified write needs no excuse', () => {
    act(() => useBuildingStore.getState().confirmPending(KEY, 'confirmed'));
    const { container } = renderWithProviders(
      <SaveIndicator propertyKey={KEY} confirmedMessage={NOTICE} />,
    );
    expect(container.querySelector('.checkmark')).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  // OB-1. This is the whole point of the change: a write the gateway could not
  // vouch for must not borrow the vocabulary of one it could.
  it('says "Sent", not "Saved", when the write came back unconfirmed', () => {
    act(() => useBuildingStore.getState().confirmPending(KEY, 'unconfirmed'));
    const { container } = renderWithProviders(<SaveIndicator propertyKey={KEY} />);
    expect(container.querySelector('.checkmark')).toBeNull();
    expect(container.textContent).toContain('Sent');
    expect(container.textContent).not.toContain('Saved');
    expect(screen.getByRole('status').textContent)
      .toContain('Sent to the server, which did not confirm it');
  });

  it('prefers the call site\'s sentence to the bare "Sent" when the write is unconfirmed', () => {
    act(() => useBuildingStore.getState().confirmPending(KEY, 'unconfirmed'));
    const { container } = renderWithProviders(
      <SaveIndicator propertyKey={KEY} confirmedMessage={NOTICE} />,
    );
    expect(container.querySelector('.checkmark')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(NOTICE);
  });

  it('clears the checkmark after its 1.5s dwell', () => {
    act(() => useBuildingStore.getState().confirmPending(KEY, 'confirmed'));
    renderWithProviders(<SaveIndicator propertyKey={KEY} />);

    advance(1500);
    expect(useBuildingStore.getState().confirmedUpdates.has(KEY)).toBe(false);
  });

  it('holds an unconfirmed write longer than the checkmark — it is read, not glanced', () => {
    act(() => useBuildingStore.getState().confirmPending(KEY, 'unconfirmed'));
    renderWithProviders(<SaveIndicator propertyKey={KEY} confirmedMessage={NOTICE} />);

    advance(1500);
    expect(useBuildingStore.getState().confirmedUpdates.has(KEY)).toBe(true);

    advance(3500);
    expect(useBuildingStore.getState().confirmedUpdates.has(KEY)).toBe(false);
  });

  // The dwell follows the verdict, not the prop: a call site that supplies a
  // sentence for its unconfirmed case must still get the quick tick when the
  // write is confirmed.
  it('clears a confirmed write after 1.5s even when a message was supplied', () => {
    act(() => useBuildingStore.getState().confirmPending(KEY, 'confirmed'));
    renderWithProviders(<SaveIndicator propertyKey={KEY} confirmedMessage={NOTICE} />);

    advance(1500);
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
