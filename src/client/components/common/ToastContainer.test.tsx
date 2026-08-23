import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { ToastContainer, showToast, resetToasts, AUTO_DISMISS_MS } from './Toast';

describe('ToastContainer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetToasts();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('mounts both live regions even when there is nothing to say', () => {
    renderWithProviders(<ToastContainer />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('says the severity in words and routes errors to the assertive region', () => {
    renderWithProviders(<ToastContainer />);
    act(() => {
      showToast('Textile Mill placed in Helartia.', 'success');
      showToast('Message not sent. Draft kept.', 'error');
    });
    expect(screen.getByRole('status').textContent).toContain('Done');
    expect(screen.getByRole('status').textContent).toContain('Textile Mill placed');
    expect(screen.getByRole('alert').textContent).toContain('Failed');
    expect(screen.getByRole('alert').textContent).toContain('Draft kept');
  });

  it('a custom title replaces the default word', () => {
    renderWithProviders(<ToastContainer />);
    act(() => {
      showToast('Cotton from Coton du Sud.', 'success', { title: 'Connected' });
    });
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
  });

  it('errors do not auto-dismiss, other variants do', () => {
    renderWithProviders(<ToastContainer />);
    act(() => {
      showToast('gone soon', 'info');
      showToast('stays', 'error');
    });
    act(() => {
      jest.advanceTimersByTime(AUTO_DISMISS_MS + 1);
    });
    expect(screen.queryByText('gone soon')).toBeNull();
    expect(screen.getByText('stays')).toBeTruthy();
  });

  it('an action button runs its handler and dismisses the toast', () => {
    const onClick = jest.fn();
    renderWithProviders(<ToastContainer />);
    act(() => {
      showToast('Textile Mill placed.', 'success', { action: { label: 'View', onClick } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Textile Mill placed.')).toBeNull();
  });

  it('the dismiss button removes its toast', () => {
    renderWithProviders(<ToastContainer />);
    act(() => {
      showToast('careful', 'warning');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('careful')).toBeNull();
  });

  it('keeps the legacy (message, variant, icon) call shape', () => {
    renderWithProviders(<ToastContainer />);
    act(() => {
      showToast('with icon', 'info', <svg data-testid="custom-icon" />);
    });
    expect(screen.getByTestId('custom-icon')).toBeTruthy();
  });
});
