import { describe, it, expect } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { Field } from './Field';

describe('Field', () => {
  it('binds the label to the control (render-prop form)', () => {
    renderWithProviders(
      <Field label="Company name">{(a11y) => <input {...a11y} defaultValue="SPO_test3 - Green" />}</Field>,
    );
    const input = screen.getByLabelText('Company name') as HTMLInputElement;
    expect(input.value).toBe('SPO_test3 - Green');
  });

  it('binds the label to the control (element child form)', () => {
    renderWithProviders(
      <Field label="Town">
        <select>
          <option>Helartia</option>
        </select>
      </Field>,
    );
    expect(screen.getByLabelText('Town').tagName).toBe('SELECT');
  });

  it('wires help text through aria-describedby', () => {
    renderWithProviders(
      <Field label="Name" help="Visible to other players.">{(a11y) => <input {...a11y} />}</Field>,
    );
    const input = screen.getByLabelText('Name');
    const helpId = input.getAttribute('aria-describedby');
    expect(helpId && document.getElementById(helpId)?.textContent).toBe('Visible to other players.');
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('an error replaces the help, is announced, and marks the control invalid', () => {
    renderWithProviders(
      <Field label="Budget" help="hidden when an error shows" error="Exceeds the town budget.">
        {(a11y) => <input {...a11y} />}
      </Field>,
    );
    const input = screen.getByLabelText('Budget');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Exceeds the town budget.');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
    expect(screen.queryByText('hidden when an error shows')).toBeNull();
  });

  it('required sets aria-required and the native attribute, with a decorative asterisk', () => {
    renderWithProviders(<Field label="Password" required>{(a11y) => <input {...a11y} type="password" />}</Field>);
    const input = screen.getByLabelText(/Password/) as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true');
  });

  it('hideLabel keeps the label for assistive tech', () => {
    renderWithProviders(<Field label="Search" hideLabel>{(a11y) => <input {...a11y} />}</Field>);
    const input = screen.getByLabelText('Search');
    expect(input).toBeTruthy();
    const label = document.querySelector('label') as HTMLLabelElement;
    expect(label.className).toContain('srOnly');
  });
});
