import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { useUiStore } from '../../store/ui-store';
import { CommandPalette } from './CommandPalette';

describe('CommandPalette', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useUiStore.getState().clearSurfaces();
    useUiStore.setState({ commandPaletteOpen: true });
  });

  it('offers a Government command that opens the politics surface', () => {
    renderWithProviders(<CommandPalette />);
    act(() => {
      jest.advanceTimersByTime(60);
    });
    const cmd = screen.getByText(/Open Government/);
    fireEvent.click(cmd);
    expect(useUiStore.getState().stack.map((s) => s.kind)).toEqual(['politics']);
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
    jest.useRealTimers();
  });
});
