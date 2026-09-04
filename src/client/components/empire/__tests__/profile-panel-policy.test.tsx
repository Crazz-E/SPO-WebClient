/**
 * ProfilePanel — Strategy tab (policy).
 *
 * On a world whose policy page comments out the Ally option (`alliesAllowed: false`),
 * neither the per-row Ally button nor the set-by-name Ally option may be offered.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../../__tests__/setup/render-helpers';
import { useProfileStore } from '../../../store/profile-store';
import { ProfilePanel } from '../ProfilePanel';
import type { PolicyData } from '@/shared/types';

function clickSection(label: string): void {
  fireEvent.click(within(screen.getByLabelText('Profile sections')).getByText(label));
}

const ROWS: PolicyData['policies'] = [
  { tycoonName: 'Alice', yourPolicy: 1, theirPolicy: 1 },
  { tycoonName: 'Bob', yourPolicy: 0, theirPolicy: 2 },
];

describe('ProfilePanel — Strategy tab (Ally visibility)', () => {
  beforeEach(() => {
    useProfileStore.getState().reset();
  });

  it('hides the Ally button and option when the world disallows allies, but still shows an existing Ally stance', () => {
    const onProfilePolicySet = jest.fn();
    renderWithProviders(<ProfilePanel />, { clientCallbacks: createSpiedCallbacks({ onProfilePolicySet }) });

    clickSection('Strategy');
    act(() => {
      useProfileStore.getState().setPolicy({ policies: ROWS, alliesAllowed: false });
    });

    expect(screen.queryByRole('button', { name: 'Ally' })).toBeNull();

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(within(select).getAllByRole('option')).toHaveLength(2);
    expect(within(select).queryByText('Ally')).toBeNull();

    const bobRow = screen.getByText('Bob').closest('tr');
    expect(bobRow).not.toBeNull();
    expect(within(bobRow as HTMLElement).getByText('Ally')).toBeTruthy();

    const aliceRow = screen.getByText('Alice').closest('tr');
    expect(aliceRow).not.toBeNull();
    expect(within(aliceRow as HTMLElement).queryByText('Ally')).toBeNull();

    fireEvent.click(within(aliceRow as HTMLElement).getByRole('button', { name: 'Enemy' }));
    expect(onProfilePolicySet).toHaveBeenCalledWith('Alice', 2);
  });

  it('offers all three stances when the world allows allies', () => {
    const onProfilePolicySet = jest.fn();
    renderWithProviders(<ProfilePanel />, { clientCallbacks: createSpiedCallbacks({ onProfilePolicySet }) });

    clickSection('Strategy');
    act(() => {
      useProfileStore.getState().setPolicy({ policies: ROWS, alliesAllowed: true });
    });

    const aliceRow = screen.getByText('Alice').closest('tr') as HTMLElement;
    expect(within(aliceRow).getAllByRole('button')).toHaveLength(3);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(within(select).getAllByRole('option')).toHaveLength(3);

    fireEvent.click(within(aliceRow).getByRole('button', { name: 'Ally' }));
    expect(onProfilePolicySet).toHaveBeenCalledWith('Alice', 0);
  });

  it('offers all three stances when no policy data has landed yet', () => {
    renderWithProviders(<ProfilePanel />);

    clickSection('Strategy');
    act(() => {
      useProfileStore.getState().setLoading(false);
    });

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(within(select).getAllByRole('option')).toHaveLength(3);
  });
});
