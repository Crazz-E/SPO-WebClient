import { describe, it, expect, jest } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { Button } from './Button';

describe('Button', () => {
  it('renders its label and fires onClick', () => {
    const onClick = jest.fn();
    renderWithProviders(<Button onClick={onClick}>Connect</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    renderWithProviders(<Button>Go</Button>);
    expect((screen.getByRole('button') as HTMLButtonElement).type).toBe('button');
  });

  it('applies variant and size classes', () => {
    renderWithProviders(<Button variant="primary" size="lg">Place</Button>);
    const el = screen.getByRole('button');
    expect(el.className).toContain('primary');
    expect(el.className).toContain('lg');
  });

  it('loading disables the button, sets aria-busy and shows the spinner instead of the left icon', () => {
    renderWithProviders(<Button loading iconLeft={<svg data-testid="icon" />}>Saving</Button>);
    const el = screen.getByRole('button') as HTMLButtonElement;
    expect(el.disabled).toBe(true);
    expect(el.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('icon')).toBeNull();
    expect(el.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders icons and a decorative kbd hint', () => {
    renderWithProviders(<Button iconLeft={<svg data-testid="l" />} iconRight={<svg data-testid="r" />} kbd="R">Rotate view</Button>);
    expect(screen.getByTestId('l')).toBeTruthy();
    expect(screen.getByTestId('r')).toBeTruthy();
    const kbd = screen.getByText('R');
    expect(kbd.tagName).toBe('KBD');
    expect(kbd.getAttribute('aria-hidden')).toBe('true');
  });

  it('disabled stays disabled', () => {
    renderWithProviders(<Button disabled>Nope</Button>);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
