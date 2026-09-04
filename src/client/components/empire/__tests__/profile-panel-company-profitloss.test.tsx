/**
 * ProfilePanel — Companies tab drill-down into one company's own P&L.
 *
 * Opening it never switches the active company: the row's click-to-switch
 * handler and the new P&L button are two separate affordances.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../../__tests__/setup/render-helpers';
import { useProfileStore } from '../../../store/profile-store';
import { ProfilePanel } from '../ProfilePanel';
import type { ProfitLossData } from '@/shared/types';

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
        children: [
          {
            label: 'RESIDENTIALS',
            level: 2,
            amount: '2000000',
            isHeader: true,
            children: [
              { label: 'Houses', level: 3, amount: '500000', children: [] },
            ],
          },
        ],
      },
      { label: 'Expenses', level: 1, amount: '-750000', children: [] },
    ],
  },
};

function clickSection(label: string): void {
  fireEvent.click(within(screen.getByLabelText('Profile sections')).getByText(label));
}

function openCompaniesWithTwo() {
  clickSection('Companies');
  act(() => {
    useProfileStore.getState().setCompanies({
      companies: [
        { name: 'Green Co', companyId: 7, ownerRole: 'Tycoon', cluster: 'A', facilityCount: 3, companyType: 'Industry' },
        { name: 'Blue Co', companyId: 8, ownerRole: 'Tycoon', cluster: 'B', facilityCount: 1, companyType: 'Trade' },
      ],
      currentCompany: 'Blue Co',
      worldName: 'planitia',
    });
  });
}

describe('ProfilePanel — company Profit & Loss drill-down', () => {
  beforeEach(() => {
    useProfileStore.getState().reset();
  });

  it('opening a company P&L requests it, opens a loading view, and never switches the company', () => {
    const onProfileCompanyProfitLoss = jest.fn();
    const onProfileSwitchCompany = jest.fn();
    renderWithProviders(<ProfilePanel />, {
      clientCallbacks: createSpiedCallbacks({ onProfileCompanyProfitLoss, onProfileSwitchCompany }),
    });
    openCompaniesWithTwo();

    fireEvent.click(screen.getByLabelText('Open Profit & Loss of Green Co'));

    expect(onProfileCompanyProfitLoss).toHaveBeenCalledWith('Green Co', 'A');
    expect(onProfileSwitchCompany).not.toHaveBeenCalled();
    expect(useProfileStore.getState().companyProfitLoss).toMatchObject({ companyName: 'Green Co', status: 'loading' });
    expect(screen.queryByText('Blue Co')).toBeNull();
  });

  it('renders the tree once it loads, with the tycoon-wide hierarchy, indentation and negative styling', () => {
    renderWithProviders(<ProfilePanel />);
    openCompaniesWithTwo();
    fireEvent.click(screen.getByLabelText('Open Profit & Loss of Green Co'));

    act(() => {
      useProfileStore.getState().setCompanyProfitLoss('Green Co', TREE);
    });

    const rows = document.querySelectorAll('[class*="plRow"]');
    expect(rows.length).toBeGreaterThan(0);
    const housesRow = screen.getByText('Houses').closest('[class*="plRow"]') as HTMLElement;
    expect(housesRow.style.paddingLeft).toBe('48px');

    const positiveAmount = screen.getByText('Income').closest('[class*="plRow"]')!.querySelector('[class*="plAmount"]')!;
    expect(positiveAmount.className).not.toContain('negativeValue');
    const negativeAmount = screen.getByText('-750000');
    expect(negativeAmount.className).toContain('negativeValue');
  });

  it('shows a failure state naming the company and the reason, not an empty tree', () => {
    renderWithProviders(<ProfilePanel />);
    openCompaniesWithTwo();
    fireEvent.click(screen.getByLabelText('Open Profit & Loss of Green Co'));

    act(() => {
      useProfileStore.getState().setCompanyProfitLoss('Green Co', null, 'boom');
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Green Co');
    expect(alert.textContent).toContain('boom');
    expect(document.querySelectorAll('[class*="plRow"]').length).toBe(0);
  });

  it('Retry re-requests the same company; Back to companies restores the list', () => {
    const onProfileCompanyProfitLoss = jest.fn();
    renderWithProviders(<ProfilePanel />, {
      clientCallbacks: createSpiedCallbacks({ onProfileCompanyProfitLoss }),
    });
    openCompaniesWithTwo();
    fireEvent.click(screen.getByLabelText('Open Profit & Loss of Green Co'));
    act(() => {
      useProfileStore.getState().setCompanyProfitLoss('Green Co', null, 'boom');
    });
    onProfileCompanyProfitLoss.mockClear();

    fireEvent.click(screen.getByText('Retry'));
    expect(onProfileCompanyProfitLoss).toHaveBeenCalledWith('Green Co', 'A');
    expect(useProfileStore.getState().companyProfitLoss).toMatchObject({ companyName: 'Green Co', status: 'loading' });

    fireEvent.click(screen.getByLabelText('Back to companies'));
    expect(useProfileStore.getState().companyProfitLoss).toBeNull();
    expect(screen.getByText('Green Co')).toBeTruthy();
    expect(screen.getByText('Blue Co')).toBeTruthy();
  });

  it('clicking the row itself still switches the active company — the switch path is untouched', () => {
    const onProfileSwitchCompany = jest.fn();
    renderWithProviders(<ProfilePanel />, {
      clientCallbacks: createSpiedCallbacks({ onProfileSwitchCompany }),
    });
    openCompaniesWithTwo();

    fireEvent.click(screen.getByText('Green Co'));

    expect(onProfileSwitchCompany).toHaveBeenCalledWith(7, 'Green Co', 'Tycoon');
    expect(useProfileStore.getState().companyProfitLoss).toBeNull();
  });
});
