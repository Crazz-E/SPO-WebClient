/**
 * Tests for data visualization components.
 * Sparkline, TrendIndicator, DataTable, MiniBar, StatCard.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { Sparkline } from './Sparkline';
import { TrendIndicator } from './TrendIndicator';
import { DataTable } from './DataTable';
import { MiniBar } from './MiniBar';
import { StatCard } from './StatCard';

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

describe('Sparkline', () => {
  it('renders SVG with valid data', () => {
    const { container } = renderWithProviders(
      <Sparkline data={[10, 20, 15, 25]} />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('polyline')).toBeTruthy();
  });

  it('returns null for fewer than 2 data points', () => {
    const { container } = renderWithProviders(<Sparkline data={[5]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders end dot by default', () => {
    const { container } = renderWithProviders(
      <Sparkline data={[1, 2, 3]} />,
    );
    expect(container.querySelector('circle')).toBeTruthy();
  });

  it('hides end dot when showDot is false', () => {
    const { container } = renderWithProviders(
      <Sparkline data={[1, 2, 3]} showDot={false} />,
    );
    expect(container.querySelector('circle')).toBeNull();
  });

  it('auto-detects positive color', () => {
    const { container } = renderWithProviders(
      <Sparkline data={[1, 5]} />,
    );
    expect(container.querySelector('[class*="positive"]')).toBeTruthy();
  });

  it('auto-detects negative color', () => {
    const { container } = renderWithProviders(
      <Sparkline data={[5, 1]} />,
    );
    expect(container.querySelector('[class*="negative"]')).toBeTruthy();
  });

  it('applies explicit color variant', () => {
    const { container } = renderWithProviders(
      <Sparkline data={[1, 2, 3]} color="gold" />,
    );
    expect(container.querySelector('[class*="gold"]')).toBeTruthy();
  });

  it('respects custom width and height', () => {
    const { container } = renderWithProviders(
      <Sparkline data={[1, 2, 3]} width={80} height={32} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('80');
    expect(svg?.getAttribute('height')).toBe('32');
  });
});

// ---------------------------------------------------------------------------
// TrendIndicator
// ---------------------------------------------------------------------------

describe('TrendIndicator', () => {
  it('renders positive trend with arrow and value', () => {
    renderWithProviders(<TrendIndicator value={12.5} />);
    expect(screen.getByText('+12.5%')).toBeTruthy();
    expect(screen.getByText('\u25B2')).toBeTruthy();
  });

  it('renders negative trend', () => {
    renderWithProviders(<TrendIndicator value={-3.2} />);
    expect(screen.getByText('-3.2%')).toBeTruthy();
    expect(screen.getByText('\u25BC')).toBeTruthy();
  });

  it('renders zero as neutral', () => {
    const { container } = renderWithProviders(<TrendIndicator value={0} />);
    expect(screen.getByText('0%')).toBeTruthy();
    expect(container.querySelector('[class*="neutral"]')).toBeTruthy();
  });

  it('hides arrow when showArrow is false', () => {
    const { container } = renderWithProviders(
      <TrendIndicator value={5} showArrow={false} />,
    );
    expect(container.textContent).toBe('+5.0%');
  });

  it('hides value when showValue is false', () => {
    const { container } = renderWithProviders(
      <TrendIndicator value={5} showValue={false} />,
    );
    expect(container.textContent).toBe('\u25B2');
  });

  it('applies positive class', () => {
    const { container } = renderWithProviders(<TrendIndicator value={1} />);
    expect(container.querySelector('[class*="positive"]')).toBeTruthy();
  });

  it('applies negative class', () => {
    const { container } = renderWithProviders(<TrendIndicator value={-1} />);
    expect(container.querySelector('[class*="negative"]')).toBeTruthy();
  });

  it('applies size variant', () => {
    const { container } = renderWithProviders(
      <TrendIndicator value={1} size="md" />,
    );
    expect(container.querySelector('[class*="md"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

describe('DataTable', () => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'price', label: 'Price', align: 'right' as const },
  ];
  const rows = [
    { id: '1', name: 'Steel', price: 120 },
    { id: '2', name: 'Food', price: 85 },
  ];

  it('renders headers', () => {
    renderWithProviders(
      <DataTable columns={columns} rows={rows} keyField="id" />,
    );
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Price')).toBeTruthy();
  });

  it('renders row data', () => {
    renderWithProviders(
      <DataTable columns={columns} rows={rows} keyField="id" />,
    );
    expect(screen.getByText('Steel')).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
  });

  it('shows empty state', () => {
    renderWithProviders(
      <DataTable columns={columns} rows={[]} keyField="id" />,
    );
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('applies striped class to odd rows', () => {
    const { container } = renderWithProviders(
      <DataTable columns={columns} rows={rows} keyField="id" striped />,
    );
    const trs = container.querySelectorAll('tbody tr');
    expect(trs[1]?.className).toContain('striped');
  });

  it('calls onRowClick when row is clicked', () => {
    const onClick = jest.fn();
    renderWithProviders(
      <DataTable columns={columns} rows={rows} keyField="id" onRowClick={onClick} />,
    );
    fireEvent.click(screen.getByText('Steel'));
    expect(onClick).toHaveBeenCalledWith(rows[0]);
  });

  it('renders custom column via render prop', () => {
    const customColumns = [
      ...columns,
      { key: 'custom', label: 'Custom', render: () => <span>CUSTOM</span> },
    ];
    renderWithProviders(
      <DataTable columns={customColumns} rows={rows} keyField="id" />,
    );
    expect(screen.getAllByText('CUSTOM')).toHaveLength(2);
  });

  it('sorts by column when sortable', () => {
    const sortColumns = [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'price', label: 'Price' },
    ];
    renderWithProviders(
      <DataTable columns={sortColumns} rows={rows} keyField="id" />,
    );
    fireEvent.click(screen.getByText('Name'));
    const cells = screen.getAllByRole('cell');
    expect(cells[0].textContent).toBe('Food');
  });
});

// ---------------------------------------------------------------------------
// MiniBar
// ---------------------------------------------------------------------------

describe('MiniBar', () => {
  it('renders with value', () => {
    const { container } = renderWithProviders(<MiniBar value={0.72} />);
    expect(container.querySelector('[class*="fill"]')).toBeTruthy();
    expect(screen.getByText('72%')).toBeTruthy();
  });

  it('clamps value to 0-1 range', () => {
    const { container } = renderWithProviders(<MiniBar value={1.5} />);
    const fill = container.querySelector('[class*="fill"]') as HTMLElement;
    expect(fill?.style.width).toBe('100%');
  });

  it('renders custom label', () => {
    renderWithProviders(<MiniBar value={0.5} label="50/100" />);
    expect(screen.getByText('50/100')).toBeTruthy();
  });

  it('hides label when showLabel is false', () => {
    const { container } = renderWithProviders(
      <MiniBar value={0.5} showLabel={false} />,
    );
    expect(container.querySelector('[class*="label"]')).toBeNull();
  });

  it('applies variant class', () => {
    const { container } = renderWithProviders(
      <MiniBar value={0.5} variant="gold" />,
    );
    expect(container.querySelector('[class*="gold"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

describe('StatCard', () => {
  it('renders label and value', () => {
    renderWithProviders(<StatCard label="Revenue" value="$42,100" />);
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('$42,100')).toBeTruthy();
  });

  it('renders trend indicator when provided', () => {
    renderWithProviders(<StatCard label="Rev" value="$100" trend={5.2} />);
    expect(screen.getByText('+5.2%')).toBeTruthy();
  });

  it('renders sparkline when data provided', () => {
    const { container } = renderWithProviders(
      <StatCard label="Cash" value="$1M" sparklineData={[1, 2, 3, 4]} />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('does not render sparkline with insufficient data', () => {
    const { container } = renderWithProviders(
      <StatCard label="Cash" value="$1M" sparklineData={[1]} />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('applies gold variant', () => {
    const { container } = renderWithProviders(
      <StatCard label="Cash" value="$1M" variant="gold" />,
    );
    expect(container.querySelector('[class*="Gold"]')).toBeTruthy();
  });

  it('applies profit variant', () => {
    const { container } = renderWithProviders(
      <StatCard label="Profit" value="+$500" variant="profit" />,
    );
    expect(container.querySelector('[class*="Profit"]')).toBeTruthy();
  });

  it('applies compact class', () => {
    const { container } = renderWithProviders(
      <StatCard label="X" value="1" compact />,
    );
    expect(container.querySelector('[class*="compact"]')).toBeTruthy();
  });
});
