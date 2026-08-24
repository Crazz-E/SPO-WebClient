/**
 * The "remember username" control only exists in single-user mode.
 *
 * The gateway announces that mode to the browser through `window.__SPO_SINGLE_USER__`
 * (`/spo-runtime-config.js`), and AuthStage reads it per render — so each case sets the
 * flag on `window` before mounting.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { AuthStage } from './AuthStage';

function setSingleUserMode(on: boolean): void {
  const w = window as unknown as Record<string, unknown>;
  if (on) {
    w.__SPO_SINGLE_USER__ = true;
  } else {
    delete w.__SPO_SINGLE_USER__;
  }
}

const props = { onConnect: () => {}, isLoading: false, status: 'idle' };

describe('AuthStage in single-user mode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__SPO_SINGLE_USER__;
    localStorage.clear();
  });

  it('offers the checkbox, and pre-fills the username it saved last time', () => {
    localStorage.setItem('spo_last_username', 'SPO_test3');
    setSingleUserMode(true);
    renderWithProviders(<AuthStage {...props} />);

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect((screen.getByPlaceholderText('Username') as HTMLInputElement).value).toBe('SPO_test3');
  });

  it('saves the username on connect when the box is ticked', () => {
    setSingleUserMode(true);
    const connected: string[] = [];
    renderWithProviders(<AuthStage {...props} onConnect={(u) => connected.push(u)} />);

    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'SPO_test3' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'test3' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Enter the World'));

    expect(connected).toEqual(['SPO_test3']);
    expect(localStorage.getItem('spo_last_username')).toBe('SPO_test3');
  });

  it('forgets a previously saved username when the box is cleared', () => {
    localStorage.setItem('spo_last_username', 'SPO_test3');
    setSingleUserMode(true);
    renderWithProviders(<AuthStage {...props} />);

    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'test3' } });
    fireEvent.click(screen.getByRole('checkbox')); // untick
    fireEvent.click(screen.getByText('Enter the World'));

    expect(localStorage.getItem('spo_last_username')).toBeNull();
  });

  it('does not offer the control, or touch storage, in the shared deployment', () => {
    setSingleUserMode(false);
    renderWithProviders(<AuthStage {...props} />);

    expect(screen.queryByRole('checkbox')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'SPO_test3' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'test3' } });
    fireEvent.click(screen.getByText('Enter the World'));

    expect(localStorage.getItem('spo_last_username')).toBeNull();
  });
});
