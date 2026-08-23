import { describe, it, expect, jest } from '@jest/globals';
import { createRef, useState } from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { Switch, Checkbox, Radio } from './Toggle';

describe('Switch', () => {
  it('renders a native checkbox with role="switch", named by its label', () => {
    renderWithProviders(<Switch label="Interface sounds" />);
    const input = screen.getByRole('switch', { name: 'Interface sounds' }) as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('checkbox');
  });

  it('clicking the label text toggles and fires onChange', () => {
    const onChange = jest.fn();
    renderWithProviders(<Switch label="Minimap at start" onChange={onChange} />);
    fireEvent.click(screen.getByText('Minimap at start'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(true);
  });

  it('reflects a controlled checked value and exposes aria-checked', () => {
    function Host() {
      const [on, setOn] = useState(false);
      return <Switch label="Sounds" checked={on} onChange={(e) => setOn(e.target.checked)} />;
    }
    renderWithProviders(<Host />);
    const input = screen.getByRole('switch') as HTMLInputElement;
    expect(input.checked).toBe(false);
    expect(input.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(input);
    expect(input.checked).toBe(true);
    expect(input.getAttribute('aria-checked')).toBe('true');
  });

  it('leaves aria-checked to the native state when uncontrolled', () => {
    renderWithProviders(<Switch label="Sounds" defaultChecked />);
    const input = screen.getByRole('switch') as HTMLInputElement;
    expect(input.checked).toBe(true);
    expect(input.hasAttribute('aria-checked')).toBe(false);
  });

  it('disabled does not fire onChange', () => {
    const onChange = jest.fn();
    renderWithProviders(<Switch label="Sounds" disabled onChange={onChange} />);
    fireEvent.click(screen.getByText('Sounds'));
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true);
  });

  it('renders the description, the size class and the label position', () => {
    const { container, rerender } = renderWithProviders(
      <Switch label="Sounds" description="Clicks and alerts" size="lg" />,
    );
    expect(screen.getByText('Clicks and alerts')).toBeTruthy();
    expect(container.querySelector('[class*="switchLg"]')).not.toBeNull();
    const row = container.querySelector('label') as HTMLLabelElement;
    expect(row.className).toContain('labelStart');
    expect(row.firstElementChild?.textContent).toContain('Sounds');

    rerender(<Switch label="Sounds" labelPosition="end" />);
    const row2 = container.querySelector('label') as HTMLLabelElement;
    expect(row2.className).not.toContain('labelStart');
    expect(row2.lastElementChild?.textContent).toContain('Sounds');
  });

  it('forwards the ref to the input and passes through name/value/id', () => {
    const ref = createRef<HTMLInputElement>();
    renderWithProviders(<Switch ref={ref} label="Sounds" name="sounds" value="on" id="snd" />);
    expect(ref.current).toBe(screen.getByRole('switch'));
    expect(ref.current?.name).toBe('sounds');
    expect(ref.current?.value).toBe('on');
    expect(ref.current?.id).toBe('snd');
  });
});

describe('Checkbox', () => {
  it('renders a native checkbox named by its label and toggles from the label text', () => {
    const onChange = jest.fn();
    renderWithProviders(<Checkbox label="Southern Cotton" onChange={onChange} />);
    const input = screen.getByRole('checkbox', { name: 'Southern Cotton' }) as HTMLInputElement;
    expect(input.type).toBe('checkbox');
    fireEvent.click(screen.getByText('Southern Cotton'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input.checked).toBe(true);
  });

  it('controlled checked is reflected', () => {
    const { rerender } = renderWithProviders(<Checkbox label="A" checked={false} onChange={() => {}} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    rerender(<Checkbox label="A" checked onChange={() => {}} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('indeterminate sets the DOM property and follows updates', () => {
    const { rerender } = renderWithProviders(<Checkbox label="Some" indeterminate />);
    const input = screen.getByRole('checkbox') as HTMLInputElement;
    expect(input.indeterminate).toBe(true);
    rerender(<Checkbox label="Some" indeterminate={false} />);
    expect(input.indeterminate).toBe(false);
  });

  it('disabled does not fire onChange', () => {
    const onChange = jest.fn();
    renderWithProviders(<Checkbox label="Nope" disabled onChange={onChange} />);
    fireEvent.click(screen.getByText('Nope'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('forwards the ref to the input, hides the drawn check from AT, shows the description', () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = renderWithProviders(
      <Checkbox ref={ref} label="Helartia Fibres" description="2 warehouses" />,
    );
    expect(ref.current).toBe(screen.getByRole('checkbox'));
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('2 warehouses')).toBeTruthy();
  });
});

describe('Radio', () => {
  it('renders native radios sharing a name; clicking a label selects that one', () => {
    const onChange = jest.fn();
    renderWithProviders(
      <>
        <Radio name="policy" value="tax" label="Tax" onChange={onChange} />
        <Radio name="policy" value="subsidize" label="Subsidize" onChange={onChange} />
      </>,
    );
    const tax = screen.getByRole('radio', { name: 'Tax' }) as HTMLInputElement;
    const sub = screen.getByRole('radio', { name: 'Subsidize' }) as HTMLInputElement;
    expect(tax.type).toBe('radio');
    fireEvent.click(screen.getByText('Subsidize'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(sub.checked).toBe(true);
    expect(tax.checked).toBe(false);
  });

  it('controlled checked is reflected and disabled does not fire', () => {
    const onChange = jest.fn();
    renderWithProviders(<Radio label="Tax" checked onChange={onChange} disabled />);
    const input = screen.getByRole('radio') as HTMLInputElement;
    expect(input.checked).toBe(true);
    fireEvent.click(screen.getByText('Tax'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('forwards the ref and renders the description', () => {
    const ref = createRef<HTMLInputElement>();
    renderWithProviders(<Radio ref={ref} label="Tax" description="Raises revenue" />);
    expect(ref.current).toBe(screen.getByRole('radio'));
    expect(screen.getByText('Raises revenue')).toBeTruthy();
  });
});
