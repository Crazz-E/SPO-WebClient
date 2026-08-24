/**
 * Lot g — the 768-1023 tablet band joined the mobile model: the shell mounts
 * for every non-desktop tier, and only for those.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { screen } from '@testing-library/react';

const responsive = { device: 'tablet', isMobile: false, isDesktop: false };
jest.mock('../../hooks/useResponsive', () => ({
  useResponsive: () => responsive,
}));
jest.mock('../sheet', () => ({
  SurfaceContent: () => null,
  SURFACE_TITLES: {},
}));
jest.mock('./MobileInfoBar', () => ({ MobileInfoBar: () => <div>INFOBAR</div> }));
jest.mock('./ChatBanner', () => ({ ChatBanner: () => null }));
jest.mock('./BottomNav', () => ({ BottomNav: () => <nav>NAV</nav> }));
jest.mock('./PlacementHUD', () => ({ PlacementHUD: () => <div>PLACEMENT</div> }));
jest.mock('../chat', () => ({ ChatStrip: () => <div>CHAT</div> }));

import { MobileShell } from './MobileShell';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';

describe('MobileShell on a tablet (lot g)', () => {
  it('mounts the full mobile shell on the tablet tier', () => {
    renderWithProviders(<MobileShell />);
    expect(screen.getByText('NAV')).toBeTruthy();
    expect(screen.getByText('INFOBAR')).toBeTruthy();
  });

  it('stays absent on desktop', () => {
    responsive.device = 'desktop';
    responsive.isDesktop = true;
    const { container } = renderWithProviders(<MobileShell />);
    expect(container.innerHTML).toBe('');
    responsive.device = 'tablet';
    responsive.isDesktop = false;
  });
});
