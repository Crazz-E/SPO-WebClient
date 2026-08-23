import { describe, it, expect, beforeEach } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { useUiStore } from '../../store/ui-store';
import { MobileMenu } from './MobileMenu';

describe('MobileMenu', () => {
  beforeEach(() => {
    useUiStore.getState().clearSurfaces();
    useUiStore.setState({ commandPaletteOpen: false, mobileTab: 'more' });
  });

  it('Profile opens the empire surface on mobile (was unreachable)', () => {
    renderWithProviders(<MobileMenu />);
    fireEvent.click(screen.getByRole('button', { name: /Profile/ }));
    expect(useUiStore.getState().leftPanel).toBe('empire');
    expect(useUiStore.getState().mobileTab).toBe('map');
  });

  it('Government opens the politics surface', () => {
    renderWithProviders(<MobileMenu />);
    fireEvent.click(screen.getByRole('button', { name: /Government/ }));
    expect(useUiStore.getState().rightPanel).toBe('politics');
  });

  it('Command palette is reachable by touch', () => {
    renderWithProviders(<MobileMenu />);
    fireEvent.click(screen.getByRole('button', { name: /Command palette/ }));
    expect(useUiStore.getState().commandPaletteOpen).toBe(true);
  });

  it('My facilities opens the facilities surface (the former Fav tab)', () => {
    renderWithProviders(<MobileMenu />);
    fireEvent.click(screen.getByRole('button', { name: /My facilities/ }));
    expect(useUiStore.getState().stack.map((s) => s.kind)).toEqual(['facilities']);
  });
});
