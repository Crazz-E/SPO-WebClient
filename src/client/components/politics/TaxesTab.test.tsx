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
import { createSpiedCallbacks, renderWithProviders } from '../../__tests__/setup/render-helpers';
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

  describe('what actually reaches the wire', () => {
    /** Every SET the tab emits, in order. */
    function renderWithSpy(): Array<[number, string, Record<string, string>]> {
      const sent: Array<[number, string, Record<string, string>]> = [];
      const callbacks = createSpiedCallbacks({
        onSetBuildingProperty: (...args: unknown[]) => {
          sent.push([
            args[4] as never,
            args[3] as string,
            args[5] as Record<string, string>,
          ]);
        },
      });
      renderWithProviders(
        <TaxesTab properties={TAXES} buildingX={1} buildingY={2} canGovern />,
        { clientCallbacks: callbacks },
      );
      return sent;
    }

    it('emits one frame per gesture, not one per event that ends it', () => {
      const sent = renderWithSpy();
      fireEvent.click(screen.getByText('Farms'));
      const slider = screen.getByLabelText(/^Tax: /);

      fireEvent.change(slider, { target: { value: '37' } });
      // One drag, three endings — Voyager emits once (`PercentEdit.pas:357-362`).
      fireEvent.keyUp(slider);
      fireEvent.blur(slider);

      expect(sent.map((s) => s[1])).toEqual(['37']);
    });

    it('does not write back a rate the town already holds', () => {
      const sent = renderWithSpy();
      fireEvent.click(screen.getByText('Farms'));
      const slider = screen.getByLabelText(/^Tax: /);

      // Selecting a row and clicking away is not an edit. The live run of
      // 2026-08-20 wrote `520, 12` onto a row already standing at 12.
      fireEvent.blur(slider);

      expect(sent).toEqual([]);
    });

    it('emits again once the drag lands somewhere new', () => {
      const sent = renderWithSpy();
      fireEvent.click(screen.getByText('Farms'));
      const slider = screen.getByLabelText(/^Tax: /);

      fireEvent.change(slider, { target: { value: '37' } });
      fireEvent.blur(slider);
      fireEvent.change(slider, { target: { value: '41' } });
      fireEvent.blur(slider);

      expect(sent.map((s) => s[1])).toEqual(['37', '41']);
    });

    it('sends the subsidy as the literal string, never a rendered number', () => {
      const sent = renderWithSpy();
      fireEvent.click(screen.getByText('Farms'));

      fireEvent.click(screen.getByLabelText('Subsidize'));

      expect(sent.map((s) => s[1])).toEqual(['-10']);
    });

    it('leaves a subsidised row alone when Subsidize is picked again', () => {
      const sent = renderWithSpy();
      // CD Stores is already at -10.
      selectCdStores();

      fireEvent.click(screen.getByLabelText('Subsidize'));

      expect(sent).toEqual([]);
    });

    it('restores the rate when the mayor switches back to Tax', () => {
      const sent = renderWithSpy();
      selectCdStores();

      fireEvent.click(screen.getByLabelText('Tax'));

      // abs(-10) — Voyager's `Data.Perc := abs(perc)`, and NOT a no-op just
      // because the digits match: the sign is the mode.
      expect(sent.map((s) => s[1])).toEqual(['10']);
    });
  });

  it('a mayor reaches each row from the keyboard (the name is a button, pressed when selected); a visitor reads plain text', () => {
    const { unmount } = renderWithProviders(<TaxesTab properties={TAXES} buildingX={1} buildingY={2} canGovern />);
    const farms = screen.getByRole('button', { name: 'Farms' });
    expect(farms.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(farms);
    expect(farms.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'CD Stores' }).getAttribute('aria-pressed')).toBe('false');
    unmount();
    renderWithProviders(<TaxesTab properties={TAXES} buildingX={1} buildingY={2} canGovern={false} />);
    expect(screen.queryByRole('button', { name: 'Farms' })).toBeNull();
    expect(screen.getByText('Farms')).toBeTruthy();
  });
});
