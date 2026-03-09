/**
 * Tests for the ChangelogModal component.
 *
 * Verifies visibility toggling via ui-store and localStorage version tracking.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, resetStores } from '../../__tests__/setup/render-helpers';
import { useUiStore } from '../../store/ui-store';
import { APP_VERSION } from '../../version';
import { ChangelogModal } from './ChangelogModal';

beforeEach(() => {
  resetStores();
  localStorage.clear();
});

describe('ChangelogModal', () => {
  it('renders nothing when modal is not changelog', () => {
    const { container } = renderWithProviders(<ChangelogModal />);
    expect(container.innerHTML).toBe('');
  });

  it('renders when changelog modal is open', () => {
    useUiStore.getState().openModal('changelog');
    renderWithProviders(<ChangelogModal />);
    expect(screen.getByText("What's New")).toBeTruthy();
  });

  it('displays version entries from changelog data', () => {
    useUiStore.getState().openModal('changelog');
    renderWithProviders(<ChangelogModal />);
    // The changelog-data.json has a v1.0.0 release
    expect(screen.getByText('v1.0.0')).toBeTruthy();
  });

  it('sets localStorage version on close via X button', () => {
    useUiStore.getState().openModal('changelog');
    renderWithProviders(<ChangelogModal />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(localStorage.getItem('spo-last-seen-version')).toBe(APP_VERSION);
    expect(useUiStore.getState().modal).toBeNull();
  });

  it('sets localStorage version on close via backdrop click', () => {
    useUiStore.getState().openModal('changelog');
    renderWithProviders(<ChangelogModal />);
    // The backdrop is the first child element with the click handler
    const backdrop = screen.getByRole('dialog').previousElementSibling;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(localStorage.getItem('spo-last-seen-version')).toBe(APP_VERSION);
  });
});
