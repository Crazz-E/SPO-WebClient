/**
 * Smoke tests for mobile components (BottomNav, BottomSheet).
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithProviders, resetStores } from '../../__tests__/setup/render-helpers';
import { BottomNav } from './BottomNav';
import { BottomSheet } from './BottomSheet';

describe('BottomNav', () => {
  beforeEach(resetStores);

  it('renders all 5 tabs', () => {
    renderWithProviders(<BottomNav />);
    expect(screen.getByLabelText('Map')).toBeTruthy();
    expect(screen.getByLabelText('Chat')).toBeTruthy();
    expect(screen.getByLabelText('Build')).toBeTruthy();
    expect(screen.getByLabelText('Fav')).toBeTruthy();
    expect(screen.getByLabelText('More')).toBeTruthy();
  });

  it('renders tablist role', () => {
    renderWithProviders(<BottomNav />);
    expect(screen.getByRole('tablist')).toBeTruthy();
  });
});

describe('BottomSheet', () => {
  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(
      <BottomSheet open={false} onClose={() => {}} title="Test">Content</BottomSheet>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders dialog when open', () => {
    renderWithProviders(
      <BottomSheet open={true} onClose={() => {}} title="Building Inspector">
        <p>Sheet content</p>
      </BottomSheet>,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
