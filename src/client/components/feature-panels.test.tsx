/**
 * Smoke tests for feature panel components.
 *
 * Each panel uses stores + useClient(). These tests verify they
 * render without crashing in their default/empty state.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithProviders, resetStores } from '../__tests__/setup/render-helpers';
import { MailPanel } from './mail/MailPanel';
import { ChatStrip } from './chat/ChatStrip';

// ---------------------------------------------------------------------------
// MailPanel
// ---------------------------------------------------------------------------

describe('MailPanel', () => {
  beforeEach(resetStores);

  it('renders folder tabs', () => {
    renderWithProviders(<MailPanel />);
    expect(screen.getByText('Inbox')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
    expect(screen.getByText('Drafts')).toBeTruthy();
  });

  it('renders compose button', () => {
    renderWithProviders(<MailPanel />);
    expect(screen.getByText('Compose')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ChatStrip
// ---------------------------------------------------------------------------

describe('ChatStrip', () => {
  beforeEach(resetStores);

  it('renders without crashing', () => {
    const { container } = renderWithProviders(<ChatStrip />);
    expect(container).toBeTruthy();
  });
});

// PoliticsPanel has been merged into BuildingInspector (civic tab overrides).
// See __tests__/capitol-panel.test.tsx for comprehensive civic building tab tests.
