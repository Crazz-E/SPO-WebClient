/**
 * Smoke tests for panel and layout components.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithProviders, resetStores } from '../../__tests__/setup/render-helpers';
import { RightPanel } from './RightPanel';
import { LeftPanel } from './LeftPanel';

describe('RightPanel', () => {
  beforeEach(resetStores);

  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(
      <RightPanel open={false} onClose={() => {}} title="Test">Content</RightPanel>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('mounts DOM when open', () => {
    const { container } = renderWithProviders(
      <RightPanel open={true} onClose={() => {}} title="Building">
        <p>Panel content</p>
      </RightPanel>,
    );
    // usePanel sets visible=true when open=true, DOM should be mounted
    expect(container.querySelector('[role="complementary"]')).toBeTruthy();
  });

  it('renders scrim by default when open', () => {
    const { container } = renderWithProviders(
      <RightPanel open={true} onClose={() => {}} title="Mail">
        <p>Mail content</p>
      </RightPanel>,
    );
    // Scrim is a div sibling rendered before the aside panel
    const aside = container.querySelector('[role="complementary"]');
    expect(aside?.previousElementSibling).toBeTruthy();
  });

  it('does not render scrim when noScrim is true', () => {
    const { container } = renderWithProviders(
      <RightPanel open={true} onClose={() => {}} title="Building" noScrim>
        <p>Inspector content</p>
      </RightPanel>,
    );
    // With noScrim, the aside should be the first (and only) top-level element
    const aside = container.querySelector('[role="complementary"]');
    expect(aside?.previousElementSibling).toBeNull();
  });
});

describe('LeftPanel', () => {
  beforeEach(resetStores);

  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(
      <LeftPanel open={false} onClose={() => {}} title="Empire">Content</LeftPanel>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('mounts DOM when open', () => {
    const { container } = renderWithProviders(
      <LeftPanel open={true} onClose={() => {}} title="Empire Overview">
        <p>Empire content</p>
      </LeftPanel>,
    );
    expect(container.querySelector('[role="complementary"]')).toBeTruthy();
  });
});
