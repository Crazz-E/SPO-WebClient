/**
 * ProfilePanel — P&L tab inline history series.
 *
 * Rows whose node carries `chartData` (>= 2 points) show an inline sparkline;
 * rows without it render exactly the two spans they do today.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../../__tests__/setup/render-helpers';
import { useProfileStore } from '../../../store/profile-store';
import { ProfilePanel } from '../ProfilePanel';
import type { ProfitLossData } from '@/shared/types';

function clickSection(label: string): void {
  fireEvent.click(within(screen.getByLabelText('Profile sections')).getByText(label));
}

const TREE: ProfitLossData = {
  root: {
    label: 'Net Profit',
    level: 0,
    amount: '1000',
    chartData: [10, -20, 30],
    children: [
      {
        label: 'RESIDENTIALS',
        level: 2,
        amount: '500',
        isHeader: true,
        children: [{ label: 'Rent', level: 3, amount: '500' }],
      },
    ],
  },
};

const TREE_ONE_POINT: ProfitLossData = {
  root: { label: 'Net Profit', level: 0, amount: '1000', chartData: [5] },
};

const TAX_TREE: ProfitLossData = {
  root: {
    label: 'Net Profit',
    level: 0,
    amount: '1000',
    children: [
      {
        label: 'TAXES',
        level: 2,
        amount: '300000',
        isHeader: true,
        isTax: true,
        children: [
          { label: 'Income tax', level: 3, amount: '300000', secAmount: '100000', isTax: true },
          { label: 'Rent', level: 3, amount: '500' },
        ],
      },
    ],
  },
};

describe('ProfilePanel — Profit & Loss history series', () => {
  beforeEach(() => {
    useProfileStore.getState().reset();
  });

  it('shows the series only on the row with chartData, and keeps amounts trailing', () => {
    const { container } = renderWithProviders(<ProfilePanel />);

    clickSection('Profit & Loss');
    act(() => {
      useProfileStore.getState().setProfitLoss(TREE);
    });

    const tabBody = container.querySelector('[class*="tabBody"]') as HTMLElement;
    expect(tabBody).toBeTruthy();

    const charts = tabBody.querySelectorAll('[class*="plChart"]');
    const svgs = tabBody.querySelectorAll('svg');
    expect(charts.length).toBe(1);
    expect(svgs.length).toBe(1);

    const rows = tabBody.querySelectorAll('[class*="plRow"]');
    expect(rows.length).toBe(3);

    const netProfitRow = Array.from(rows).find((r) => r.textContent?.startsWith('Net Profit'));
    expect(netProfitRow).toBeTruthy();
    expect(netProfitRow?.querySelector('[class*="plChart"]')).toBeTruthy();
    expect(netProfitRow?.querySelector('svg')).toBeTruthy();

    const residentialsRow = Array.from(rows).find((r) => r.textContent?.startsWith('RESIDENTIALS'));
    const rentRow = Array.from(rows).find((r) => r.textContent?.startsWith('Rent'));
    for (const row of [residentialsRow, rentRow]) {
      expect(row).toBeTruthy();
      expect(row?.querySelector('[class*="plChart"]')).toBeFalsy();
      expect(row?.querySelector('svg')).toBeFalsy();
      expect(row?.children.length).toBe(2);
    }

    const chart = charts[0] as HTMLElement;
    expect(chart.title).toContain('Latest $30');
    expect(chart.title).toContain('High $30');
    expect(chart.title).toContain('Low -$20');

    Array.from(rows).forEach((row) => {
      const last = row.lastElementChild;
      expect(last?.className).toContain('plAmount');
    });
    const netAmount = netProfitRow?.lastElementChild;
    expect(netAmount?.textContent).toBe('1000');
    const residentialsAmount = residentialsRow?.lastElementChild;
    expect(residentialsAmount?.textContent).toBe('500');
    const rentAmount = rentRow?.lastElementChild;
    expect(rentAmount?.textContent).toBe('500');
  });

  it('renders no series for a single-point history', () => {
    const { container } = renderWithProviders(<ProfilePanel />);

    clickSection('Profit & Loss');
    act(() => {
      useProfileStore.getState().setProfitLoss(TREE_ONE_POINT);
    });

    const tabBody = container.querySelector('[class*="tabBody"]') as HTMLElement;
    expect(tabBody).toBeTruthy();
    expect(tabBody.querySelectorAll('[class*="plChart"]').length).toBe(0);
    expect(tabBody.querySelectorAll('svg').length).toBe(0);
  });

  it('a tax section shows Town/IFEL captions on its header and the split on each row beneath, without disturbing plain rows', () => {
    const { container } = renderWithProviders(<ProfilePanel />);

    clickSection('Profit & Loss');
    act(() => {
      useProfileStore.getState().setProfitLoss(TAX_TREE);
    });

    const tabBody = container.querySelector('[class*="tabBody"]') as HTMLElement;
    const rows = tabBody.querySelectorAll('[class*="plRow"]');

    const taxesRow = Array.from(rows).find((r) => r.textContent?.startsWith('TAXES'));
    expect(taxesRow).toBeTruthy();
    expect(taxesRow!.children.length).toBe(4);
    expect(taxesRow!.children[2].textContent).toBe('Town');
    expect(taxesRow!.children[3].textContent).toBe('IFEL');
    expect((taxesRow as HTMLElement).style.paddingLeft).toBe(`${2 * 12 + 12}px`);

    const incomeTaxRow = Array.from(rows).find((r) => r.textContent?.startsWith('Income tax'));
    expect(incomeTaxRow).toBeTruthy();
    expect(incomeTaxRow!.children.length).toBe(4);
    const town = incomeTaxRow!.children[2].textContent;
    const ifel = incomeTaxRow!.children[3].textContent;
    expect(town).toBe('200000');
    expect(ifel).toBe('100000');
    expect(Number(town) + Number(ifel)).toBe(300000);
    expect((incomeTaxRow as HTMLElement).style.paddingLeft).toBe(`${3 * 12 + 12}px`);

    const rentRow = Array.from(rows).find((r) => r.textContent?.startsWith('Rent'));
    expect(rentRow).toBeTruthy();
    expect(rentRow!.children.length).toBe(2);
    expect(rentRow!.lastElementChild?.className).toContain('plAmount');
  });
});
