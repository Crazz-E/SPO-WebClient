/**
 * ProfilePanel — Initial Suppliers tab (only-warehouses visibility).
 *
 * A fluid the ASP page never offered a `<fluid>HireWH` checkbox for (`storable: false`)
 * must not show the "Auto-include only warehouses" switch — there is no control that
 * can fire `onlyWarehouses` for it.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../../__tests__/setup/render-helpers';
import { useProfileStore } from '../../../store/profile-store';
import { ProfilePanel } from '../ProfilePanel';
import type { AutoConnectionFluid } from '@/shared/types';

function clickSection(label: string): void {
  fireEvent.click(within(screen.getByLabelText('Profile sections')).getByText(label));
}

const FLUIDS: AutoConnectionFluid[] = [
  { fluidName: 'Chemicals', fluidId: 'Chemicals', suppliers: [], hireTradeCenter: true, onlyWarehouses: true, storable: true },
  { fluidName: 'Electricity', fluidId: 'Electricity', suppliers: [], hireTradeCenter: false, onlyWarehouses: false, storable: false },
];

describe('ProfilePanel — Initial Suppliers tab (only-warehouses visibility)', () => {
  beforeEach(() => {
    useProfileStore.getState().reset();
  });

  it('shows both switches for a storable fluid, reflecting current state', () => {
    renderWithProviders(<ProfilePanel />);
    clickSection('Initial Suppliers');
    act(() => {
      useProfileStore.getState().setAutoConnections({ fluids: FLUIDS });
    });

    const chemicalsSection = screen.getByText('Chemicals').closest('div') as HTMLElement;
    expect(within(chemicalsSection).getByRole('switch', { name: 'Also hire a Trade Center' })).toBeTruthy();
    const warehouseSwitch = within(chemicalsSection).getByRole('switch', { name: 'Auto-include only warehouses' }) as HTMLInputElement;
    expect(warehouseSwitch.checked).toBe(true);
  });

  it('hides the only-warehouses switch for a non-storable fluid', () => {
    renderWithProviders(<ProfilePanel />);
    clickSection('Initial Suppliers');
    act(() => {
      useProfileStore.getState().setAutoConnections({ fluids: FLUIDS });
    });

    const electricitySection = screen.getByText('Electricity').closest('div') as HTMLElement;
    expect(within(electricitySection).getByRole('switch', { name: 'Also hire a Trade Center' })).toBeTruthy();
    expect(within(electricitySection).queryByRole('switch', { name: 'Auto-include only warehouses' })).toBeNull();
    expect(within(electricitySection).getAllByRole('switch')).toHaveLength(1);
    expect(screen.getAllByRole('switch', { name: 'Auto-include only warehouses' })).toHaveLength(1);
  });

  it('fires the off action when the storable fluid warehouse switch is toggled', () => {
    const onProfileAutoConnectionAction = jest.fn();
    renderWithProviders(<ProfilePanel />, { clientCallbacks: createSpiedCallbacks({ onProfileAutoConnectionAction }) });
    clickSection('Initial Suppliers');
    act(() => {
      useProfileStore.getState().setAutoConnections({ fluids: FLUIDS });
    });

    const chemicalsSection = screen.getByText('Chemicals').closest('div') as HTMLElement;
    fireEvent.click(within(chemicalsSection).getByRole('switch', { name: 'Auto-include only warehouses' }));

    expect(onProfileAutoConnectionAction).toHaveBeenCalledWith('dontOnlyWarehouses', 'Chemicals');
  });
});
