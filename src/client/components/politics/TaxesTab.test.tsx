/**
 * TaxesTab component tests.
 *
 * The table itself, the ownership gate, and the one thing the tab must NOT do:
 * report a tax write as confirmed. `RDOSetTaxValue` answers nothing and its
 * read-back reads a cache the server never invalidates for this object, so the
 * editor shows a sentence where every other editor shows a tick.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { act, screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { useBuildingStore } from '../../store/building-store';
import { TaxesTab } from './TaxesTab';
import type { BuildingPropertyValue } from '@/shared/types';

const TAXES: BuildingPropertyValue[] = [
  { name: 'TaxCount', value: '2' },
  { name: 'Tax0Id', value: '100' },
  { name: 'Tax0Name0', value: 'Farms' },
  { name: 'Tax0Kind', value: '0' },
  { name: 'Tax0Percent', value: '12' },
  { name: 'Tax0LastYear', value: '$1,200' },
  { name: 'Tax1Id', value: '520' },
  { name: 'Tax1Name0', value: 'CD Stores' },
  { name: 'Tax1Kind', value: '0' },
  { name: 'Tax1Percent', value: '-10' },
  { name: 'Tax1LastYear', value: '$0' },
];

/** The pendingKey TaxesTab builds for a row — mirrors setBuildingProperty. */
const cdStoresKey = 'RDOSetTaxValue:{"index":"1"}';

function selectCdStores(): void {
  fireEvent.click(screen.getByText('CD Stores'));
}

describe('TaxesTab', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useBuildingStore.setState({
      pendingUpdates: new Map(),
      confirmedUpdates: new Map(),
      failedUpdates: new Map(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('says so when the town levies nothing', () => {
    renderWithProviders(<TaxesTab properties={[]} buildingX={1} buildingY={2} canGovern />);
    expect(screen.getByText('No taxes are levied here.')).toBeTruthy();
  });

  it('renders one row per tax, marking a negative rate as subsidised', () => {
    renderWithProviders(<TaxesTab properties={TAXES} buildingX={1} buildingY={2} canGovern />);
    expect(screen.getByText('12%')).toBeTruthy();
    expect(screen.getByText('Subsidized')).toBeTruthy();
  });

  it('hides the editor from anyone who does not govern the town', () => {
    renderWithProviders(
      <TaxesTab properties={TAXES} buildingX={1} buildingY={2} canGovern={false} />,
    );
    fireEvent.click(screen.getByText('CD Stores'));
    expect(screen.queryByText('Select a tax to set its rate or subsidise it.')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('opens the editor only for the row in hand', () => {
    renderWithProviders(<TaxesTab properties={TAXES} buildingX={1} buildingY={2} canGovern />);
    expect(screen.getByText('Select a tax to set its rate or subsidise it.')).toBeTruthy();

    selectCdStores();
    expect(screen.getByRole('radiogroup', { name: 'Tax mode' })).toBeTruthy();
  });

  it('shows the effective-date notice instead of a confirmation tick', () => {
    const { container } = renderWithProviders(
      <TaxesTab properties={TAXES} buildingX={1} buildingY={2} canGovern />,
    );
    selectCdStores();

    act(() => useBuildingStore.getState().confirmPending(cdStoresKey));

    expect(screen.getByRole('status').textContent)
      .toBe('The new tax rate will take effect tomorrow.');
    expect(container.querySelector('.checkmark')).toBeNull();
  });

  it('still shows a failure as a failure', () => {
    renderWithProviders(<TaxesTab properties={TAXES} buildingX={1} buildingY={2} canGovern />);
    selectCdStores();

    act(() => useBuildingStore.getState().failPending(cdStoresKey, '-10', 'rejected'));

    expect(screen.getByTitle('rejected').textContent).toContain('Failed');
  });
});
