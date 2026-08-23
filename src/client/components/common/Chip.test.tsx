import { describe, it, expect, jest } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { Chip } from './Chip';

describe('Chip', () => {
  it('renders a span when there is no onClick', () => {
    renderWithProviders(<Chip>All</Chip>);
    const el = screen.getByText('All');
    expect(el.tagName).toBe('SPAN');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a type="button" and fires onClick when given one', () => {
    const onClick = jest.fn();
    renderWithProviders(<Chip onClick={onClick}>Attention</Chip>);
    const btn = screen.getByRole('button', { name: 'Attention' }) as HTMLButtonElement;
    expect(btn.type).toBe('button');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('filter chips carry aria-pressed and the active class', () => {
    const { rerender } = renderWithProviders(<Chip variant="filter" onClick={() => {}}>Supplies</Chip>);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.className).not.toContain('active');
    rerender(<Chip variant="filter" active onClick={() => {}}>Supplies</Chip>);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.className).toContain('active');
  });

  it('an active stack chip is aria-current, an inactive one is not', () => {
    renderWithProviders(
      <>
        <Chip variant="stack" onClick={() => {}}>Textile mill</Chip>
        <Chip variant="stack" active>Supplies</Chip>
      </>,
    );
    const crumb = screen.getByRole('button', { name: 'Textile mill' });
    expect(crumb.getAttribute('aria-current')).toBeNull();
    expect(crumb.getAttribute('aria-pressed')).toBeNull();
    expect(screen.getByText('Supplies').getAttribute('aria-current')).toBe('true');
  });

  it('shows the count in a mono span after the label', () => {
    renderWithProviders(<Chip count={47}>All</Chip>);
    const count = screen.getByText('47');
    expect(count.tagName).toBe('SPAN');
    expect(count.className).toContain('count');
    expect(screen.getByText('All').lastElementChild).toBe(count);
  });

  it('status chips render an aria-hidden dot and the tone class', () => {
    renderWithProviders(<Chip variant="status" tone="error">Stopped</Chip>);
    const chip = screen.getByText('Stopped');
    expect(chip.className).toContain('status');
    expect(chip.className).toContain('error');
    const dot = chip.querySelector('[aria-hidden="true"]');
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('dot');
  });

  it('tone is ignored outside the status variant', () => {
    renderWithProviders(<Chip variant="filter" tone="error">Filter</Chip>);
    const chip = screen.getByText('Filter');
    expect(chip.className).not.toContain('error');
    expect(chip.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('applies size, title and className', () => {
    renderWithProviders(<Chip size="lg" title="Touch" className="extra">Big</Chip>);
    const chip = screen.getByTitle('Touch');
    expect(chip.className).toContain('lg');
    expect(chip.className).toContain('extra');
  });

  it('disabled blocks the click', () => {
    const onClick = jest.fn();
    renderWithProviders(<Chip onClick={onClick} disabled>Nope</Chip>);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('size sm renders the 24 px status tag class', () => {
    renderWithProviders(<Chip variant="status" tone="error" size="sm">Stopped</Chip>);
    expect(screen.getByText('Stopped').closest('span,button')?.className).toContain('sm');
  });
});
