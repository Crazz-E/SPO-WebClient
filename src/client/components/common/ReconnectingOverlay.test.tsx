import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../__tests__/setup/render-helpers';
import { useGameStore } from '../../store/game-store';
import { ReconnectingOverlay } from './ReconnectingOverlay';

beforeEach(() => {
  useGameStore.setState({ status: 'disconnected', reconnectAttempt: 0 });
});

describe('ReconnectingOverlay', () => {
  it('renders nothing when status is connected', () => {
    useGameStore.setState({ status: 'connected' });
    const { container } = renderWithProviders(<ReconnectingOverlay />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when status is disconnected', () => {
    useGameStore.setState({ status: 'disconnected' });
    const { container } = renderWithProviders(<ReconnectingOverlay />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when status is connecting', () => {
    useGameStore.setState({ status: 'connecting' });
    const { container } = renderWithProviders(<ReconnectingOverlay />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the overlay when status is reconnecting', () => {
    useGameStore.setState({ status: 'reconnecting', reconnectAttempt: 1 });
    renderWithProviders(<ReconnectingOverlay />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Connection lost')).toBeTruthy();
  });

  it('shows attempt counter "attempt 1 of 5"', () => {
    useGameStore.setState({ status: 'reconnecting', reconnectAttempt: 1 });
    renderWithProviders(<ReconnectingOverlay />);
    expect(screen.getByText(/attempt 1 of 5/i)).toBeTruthy();
  });

  it('shows attempt counter "attempt 3 of 5"', () => {
    useGameStore.setState({ status: 'reconnecting', reconnectAttempt: 3 });
    renderWithProviders(<ReconnectingOverlay />);
    expect(screen.getByText(/attempt 3 of 5/i)).toBeTruthy();
  });

  it('shows attempt counter "attempt 5 of 5"', () => {
    useGameStore.setState({ status: 'reconnecting', reconnectAttempt: 5 });
    renderWithProviders(<ReconnectingOverlay />);
    expect(screen.getByText(/attempt 5 of 5/i)).toBeTruthy();
  });

  it('has aria-live="polite" for accessibility', () => {
    useGameStore.setState({ status: 'reconnecting', reconnectAttempt: 1 });
    renderWithProviders(<ReconnectingOverlay />);
    const el = screen.getByRole('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
  });

  it('"Try now" button calls onTriggerReconnect', () => {
    useGameStore.setState({ status: 'reconnecting', reconnectAttempt: 2 });
    const onTriggerReconnect = jest.fn();
    const callbacks = createSpiedCallbacks({ onTriggerReconnect });
    renderWithProviders(<ReconnectingOverlay />, { clientCallbacks: callbacks });

    fireEvent.click(screen.getByRole('button', { name: /try now/i }));
    expect(onTriggerReconnect).toHaveBeenCalledTimes(1);
  });
});
