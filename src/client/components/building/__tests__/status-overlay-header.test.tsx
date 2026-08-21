/**
 * StatusOverlay — the map preview's header after the redesign.
 *
 * The preview and the inspector now open with the same identity block: the
 * name and level, then the society, then the revenue. What the preview does
 * NOT show is the tycoon behind the society and the ROI — both are property
 * reads, and the preview is the view that must cost nothing.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, resetStores } from '../../../__tests__/setup/render-helpers';
import { useBuildingStore } from '../../../store/building-store';
import { StatusOverlay } from '../StatusOverlay';
import type { BuildingFocusInfo } from '@/shared/types';

jest.mock('../../../bridge/client-bridge', () => ({
  ...jest.requireActual('../../../bridge/client-bridge'),
  worldToScreenCentered: () => ({ x: 400, y: 300, textureHeight: 64 }),
}));

const focus: BuildingFocusInfo = {
  buildingId: '12345',
  buildingName: 'Drug Store',
  ownerName: 'SPO_test3 - Green',
  salesInfo: 'Pharmaceutics sales at 80%',
  revenue: '$1,200/h',
  detailsText: 'Upgrade Level: 4  Items Sold: 900',
  hintsText: 'Consider raising prices',
  x: 100, y: 200, xsize: 2, ysize: 2,
  visualClass: '300',
};

function showPreview(over: Partial<BuildingFocusInfo> = {}): void {
  useBuildingStore.setState({
    focusedBuilding: { ...focus, ...over },
    isOverlayMode: true,
  });
}

describe('StatusOverlay header', () => {
  beforeEach(resetStores);

  it('states the name, the level, the society and the revenue', async () => {
    showPreview();
    renderWithProviders(<StatusOverlay />);
    await screen.findByTestId('status-overlay');

    expect(screen.getByText('Drug Store')).toBeTruthy();
    expect(screen.getByText('Lvl 4')).toBeTruthy();
    expect(screen.getByText('SPO_test3 - Green')).toBeTruthy();
    expect(screen.getByText(/\$1,200\/h/)).toBeTruthy();
  });

  it('keeps the society and the revenue inside the header block', async () => {
    showPreview();
    const { container } = renderWithProviders(<StatusOverlay />);
    await screen.findByTestId('status-overlay');

    const header = container.querySelector('[class*="header"]');
    expect(header?.textContent).toContain('Drug Store');
    expect(header?.textContent).toContain('SPO_test3 - Green');
    expect(header?.textContent).toContain('$1,200/h');
  });

  it('omits the society line when the focus carried none', async () => {
    showPreview({ ownerName: '' });
    renderWithProviders(<StatusOverlay />);
    await screen.findByTestId('status-overlay');

    expect(screen.getByText('Drug Store')).toBeTruthy();
    expect(screen.queryByText('SPO_test3 - Green')).toBeNull();
  });

  it('omits the revenue when the focus carried none', async () => {
    showPreview({ revenue: '' });
    renderWithProviders(<StatusOverlay />);
    await screen.findByTestId('status-overlay');

    expect(screen.queryByText(/\/h/)).toBeNull();
  });

  it('still offers the INSPECT action under the details and the sales', async () => {
    showPreview();
    renderWithProviders(<StatusOverlay />);
    await screen.findByTestId('status-overlay');

    expect(screen.getByTestId('inspect-button').textContent).toBe('INSPECT');
  });

  it('renders nothing when no building is focused', async () => {
    renderWithProviders(<StatusOverlay />);
    await waitFor(() => expect(screen.queryByTestId('status-overlay')).toBeNull());
  });
});
