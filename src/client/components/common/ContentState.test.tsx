import { describe, it, expect, jest } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { EmptyState, ErrorState } from './ContentState';

describe('EmptyState', () => {
  it('renders icon, title, description and fires the action', () => {
    const onClick = jest.fn();
    renderWithProviders(
      <EmptyState
        icon={<svg data-testid="icon" />}
        title="No messages"
        description="Mail from other players will arrive here."
        action={{ label: 'Write a message', onClick }}
      />,
    );
    expect(screen.getByText('No messages')).toBeTruthy();
    expect(screen.getByText('Mail from other players will arrive here.')).toBeTruthy();
    const icon = screen.getByTestId('icon');
    expect(icon.parentElement?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Write a message' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders the title alone without icon, description or button', () => {
    const { container } = renderWithProviders(<EmptyState title="Nothing here" className="extra" />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(container.firstElementChild?.className).toContain('extra');
    expect(container.firstElementChild?.getAttribute('role')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('is an alert with the default title and no button when there is no onRetry', () => {
    renderWithProviders(<ErrorState />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Could not load this section');
    expect(alert.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a default Retry button that calls onRetry', () => {
    const onRetry = jest.fn();
    renderWithProviders(<ErrorState description="The server did not answer in time." onRetry={onRetry} />);
    expect(screen.getByText('The server did not answer in time.')).toBeTruthy();
    const btn = screen.getByRole('button', { name: 'Retry' });
    expect(btn.className).toContain('primary');
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom title, retry label and className', () => {
    renderWithProviders(
      <ErrorState title="Supplies unavailable" retryLabel="Try again" onRetry={() => {}} className="extra" />,
    );
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('extra');
    expect(screen.getByText('Supplies unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
