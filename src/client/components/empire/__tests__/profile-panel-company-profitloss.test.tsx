/**
 * ProfilePanel — Companies tab drill-down into one company's own Profit & Loss.
 *
 * Opening a company's P&L must never switch the active company: the row's
 * click-to-switch handler and the new P&L button are two separate affordances.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../../__tests__/setup/render-helpers';
import { useProfileStore } from '../../../store/profile-store';
import { ProfilePanel } from '../ProfilePanel';
import type { ProfitLossData } from '@/shared/types';

function clickSection(label: string): void {
  fireEvent.click(within(screen.getByLabelText('Profile sections')).getByText(label));
}

const TREE: ProfitLossData = {
  root: {
    label: 'Net Profit (losses)',
    level: 0,
    amount: '1250000',
    children: [
      {
        label: 'Income',
        level: 1,
        amount: '2000000',
        isHeader: false,
        children: [
          {
            label: 'RESIDENTIALS',
            level: 2,
            amount: '2000000',
            isHeader: true,
            children: [
              { label: 'Houses', level: 3, amount: '500000', isHeader: false, children: [] },
              { label: 'Flats', level: 3, amount: '-1500000', isHeader: false, children: [] },
            ],
          },
        ],
      },
    ],
  },
};

function openCompanies() {
  renderWithProviders(<ProfilePanel />, {
    clientCallbacks: createSpiedCallbacks({}),
  });
  clickSection('Companies');
  act(() => {
    useProfileStore.getState().setCompanies({
      companies: [
        { name: 'Green Co', companyId: 7, ownerRole: 'Tycoon', cluster: 'A', facilityCount: 3, companyType: 'Industry' },
        { name: 'Active Co', companyId: 8, ownerRole: 'Tycoon', cluster: 'B', facilityCount: 1, companyType: 'Industry' },
      ],
      currentCompany: 'Active Co',
      worldName: 'planitia',
    });
  });
}

describe('ProfilePanel — Companies tab, company P&L drill-down', () => {
  beforeEach(() => {
    useProfileStore.getState().reset();
  });

  it('opens the drill-down without switching the active company', () => {
    const onProfileCompanyProfitLoss = jest.fn();
    const onProfileSwitchCompany = jest.fn();
    renderWithProviders(<ProfilePanel />, {
      clientCallbacks: createSpiedCallbacks({ onProfileCompanyProfitLoss, onProfileSwitchCompany }),
    });
    clickSection('Companies');
    act(() => {
      useProfileStore.getState().setCompanies({
        companies: [
          { name: 'Green Co', companyId: 7, ownerRole: 'Tycoon', cluster: 'A', facilityCount: 3, companyType: 'Industry' },
          { name: 'Active Co', companyId: 8, ownerRole: 'Tycoon', cluster: 'B', facilityCount: 1, companyType: 'Industry' },
        ],
        currentCompany: 'Active Co',
        worldName: 'planitia',
      });
    });

    fireEvent.click(screen.getByLabelText('Open Profit & Loss of Green Co'));

    expect(onProfileCompanyProfitLoss).toHaveBeenCalledTimes(1);
    expect(onProfileCompanyProfitLoss).toHaveBeenCalledWith('Green Co', 'A');
    expect(onProfileSwitchCompany).not.toHaveBeenCalled();
    expect(useProfileStore.getState().companyProfitLoss).toMatchObject({ companyName: 'Green Co', status: 'loading' });
    expect(screen.queryByText('Active Co')).toBeNull();
  });

  it('renders the loaded tree with the same shape, indentation and negative styling as the tycoon P&L', () => {
    openCompanies();
    fireEvent.click(screen.getByLabelText('Open Profit & Loss of Green Co'));
    act(() => {
      useProfileStore.getState().setCompanyProfitLoss('Green Co', TREE);
    });

    const rows = screen.getAllByText(/Net Profit|Income|RESIDENTIALS|Houses|Flats/).map((el) => el.closest('[class*="plRow"]'));
    const flatsRow = screen.getByText('Flats').closest('[class*="plRow"]') as HTMLElement;
    expect(flatsRow.style.paddingLeft).toBe('48px'); // level 3 * 12 + 12, the tycoon formula

    const flatsAmount = flatsRow.querySelector('[class*="plAmount"]') as HTMLElement;
    expect(flatsAmount.className).toContain('negativeValue');

    const housesRow = screen.getByText('Houses').closest('[class*="plRow"]') as HTMLElement;
    const housesAmount = housesRow.querySelector('[class*="plAmount"]') as HTMLElement;
    expect(housesAmount.className).not.toContain('negativeValue');

    expect(rows.every(Boolean)).toBe(true);
  });

  it('shows an alert with a Retry on a failed fetch, not an empty tree', () => {
    const onProfileCompanyProfitLoss = jest.fn();
    renderWithProviders(<ProfilePanel />, {
      clientCallbacks: createSpiedCallbacks({ onProfileCompanyProfitLoss }),
    });
    clickSection('Companies');
    act(() => {
      useProfileStore.getState().setCompanies({
        companies: [
          { name: 'Green Co', companyId: 7, ownerRole: 'Tycoon', cluster: 'A', facilityCount: 3, companyType: 'Industry' },
        ],
        currentCompany: 'Green Co',
        worldName: 'planitia',
      });
    });
    fireEvent.click(screen.getByLabelText('Open Profit & Loss of Green Co'));
    act(() => {
      useProfileStore.getState().setCompanyProfitLoss('Green Co', null, 'boom');
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Green Co');
    expect(alert.textContent).toContain('boom');
    expect(document.querySelectorAll('[class*="plRow"]').length).toBe(0);

    fireEvent.click(screen.getByText('Retry'));

    expect(onProfileCompanyProfitLoss).toHaveBeenCalledTimes(2);
    expect(onProfileCompanyProfitLoss).toHaveBeenLastCalledWith('Green Co', 'A');
    expect(useProfileStore.getState().companyProfitLoss?.status).toBe('loading');
  });

  it('restores the list from "Back to companies"', () => {
    openCompanies();
    fireEvent.click(screen.getByLabelText('Open Profit & Loss of Green Co'));
    expect(screen.queryByText('Active Co')).toBeNull();

    fireEvent.click(screen.getByLabelText('Back to companies'));

    expect(useProfileStore.getState().companyProfitLoss).toBeNull();
    expect(screen.getByText('Active Co')).toBeTruthy();
  });

  it('the row itself still switches the active company — the switch path is untouched', () => {
    const onProfileSwitchCompany = jest.fn();
    renderWithProviders(<ProfilePanel />, {
      clientCallbacks: createSpiedCallbacks({ onProfileSwitchCompany }),
    });
    clickSection('Companies');
    act(() => {
      useProfileStore.getState().setCompanies({
        companies: [
          { name: 'Green Co', companyId: 7, ownerRole: 'Tycoon', cluster: 'A', facilityCount: 3, companyType: 'Industry' },
          { name: 'Active Co', companyId: 8, ownerRole: 'Tycoon', cluster: 'B', facilityCount: 1, companyType: 'Industry' },
        ],
        currentCompany: 'Active Co',
        worldName: 'planitia',
      });
    });

    fireEvent.click(screen.getByText('Green Co'));

    expect(onProfileSwitchCompany).toHaveBeenCalledWith(7, 'Green Co', 'Tycoon');
  });
});
