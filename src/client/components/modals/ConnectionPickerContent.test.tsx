import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../__tests__/setup/render-helpers';
import { useUiStore, DEFAULT_CONNECTION_FILTERS } from '../../store/ui-store';
import { useBuildingStore } from '../../store/building-store';
import { ConnectionPickerContent } from './ConnectionPickerModal';
import { ClientBridge } from '../../bridge/client-bridge';

function openPicker() {
  useBuildingStore.getState().setConnectionPicker({ fluidName: 'Cotton', fluidId: 'Cotton', direction: 'input', buildingX: 100, buildingY: 100 });
}

describe('ConnectionPickerContent (T3)', () => {
  beforeEach(() => {
    useUiStore.getState().clearSurfaces();
    useUiStore.setState({ connectionFilters: DEFAULT_CONNECTION_FILTERS, modal: null });
    useBuildingStore.getState().clearConnectionPicker();
  });

  it('Enter in a filter field runs the search and remembers the filters', () => {
    openPicker();
    const onConnectionSearch = jest.fn();
    renderWithProviders(<ConnectionPickerContent onClose={() => {}} />, { clientCallbacks: createSpiedCallbacks({ onConnectionSearch }) });
    const company = screen.getByLabelText('Company') as HTMLInputElement;
    fireEvent.change(company, { target: { value: 'Crazz' } });
    fireEvent.keyDown(company, { key: 'Enter' });
    expect(onConnectionSearch).toHaveBeenCalledTimes(1);
    expect(onConnectionSearch.mock.calls[0][4]).toMatchObject({ company: 'Crazz' });
    expect(useUiStore.getState().connectionFilters.company).toBe('Crazz');
  });

  it('a new picker starts from the remembered filters', () => {
    useUiStore.setState({ connectionFilters: { ...DEFAULT_CONNECTION_FILTERS, town: 'Helartia' } });
    openPicker();
    renderWithProviders(<ConnectionPickerContent onClose={() => {}} />);
    expect((screen.getByLabelText('Town') as HTMLInputElement).value).toBe('Helartia');
  });

  it('sorts results by distance from the building and shows it', () => {
    openPicker();
    renderWithProviders(<ConnectionPickerContent onClose={() => {}} />);
    act(() => {
      useBuildingStore.getState().setConnectionResults([
        { facilityName: 'Far Farm', companyName: 'A', x: 100, y: 400, town: 'Nova Roma' },
        { facilityName: 'Near Farm', companyName: 'B', x: 103, y: 104 },
      ]);
    });
    const rows = screen.getAllByText(/tiles/);
    expect(rows[0].textContent).toContain('5 tiles');
    expect(rows[1].textContent).toContain('300 tiles');
    expect(screen.getByText(/Nova Roma/)).toBeTruthy();
  });

  it('connect sends the selected coordinates and closes', () => {
    openPicker();
    const onConnectionConnect = jest.fn();
    const onClose = jest.fn();
    renderWithProviders(<ConnectionPickerContent onClose={onClose} />, { clientCallbacks: createSpiedCallbacks({ onConnectionConnect }) });
    act(() => {
      useBuildingStore.getState().setConnectionResults([{ facilityName: 'Near Farm', companyName: 'B', x: 103, y: 104 }]);
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Near Farm' }));
    fireEvent.click(screen.getByRole('button', { name: /Connect Selected/ }));
    expect(onConnectionConnect).toHaveBeenCalledWith('Cotton', 'input', [{ x: 103, y: 104 }]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Pick on map enters the connect mode without closing the picker (N10)', () => {
    openPicker();
    const onConnectionPickOnMap = jest.fn();
    const onClose = jest.fn();
    renderWithProviders(<ConnectionPickerContent onClose={onClose} />, { clientCallbacks: createSpiedCallbacks({ onConnectionPickOnMap }) });
    fireEvent.click(screen.getByRole('button', { name: 'Pick on map' }));
    expect(onConnectionPickOnMap).toHaveBeenCalledTimes(1);
    // The surface is hidden by the mode, never popped — its context survives
    expect(onClose).not.toHaveBeenCalled();
    expect(useBuildingStore.getState().connectionPicker?.fluidName).toBe('Cotton');
  });

  it('the bridge stacks the picker on the building surface and closing pops it', () => {
    useUiStore.getState().setRootSurface({ kind: 'building' });
    ClientBridge.showConnectionPicker({ fluidName: 'Cotton', fluidId: 'Cotton', direction: 'input', buildingX: 1, buildingY: 2 });
    expect(useUiStore.getState().stack.map((s) => s.kind)).toEqual(['building', 'supplierSearch']);
    ClientBridge.closeConnectionPicker();
    expect(useUiStore.getState().stack.map((s) => s.kind)).toEqual(['building']);
    expect(useBuildingStore.getState().connectionPicker).toBeNull();
  });
});
