/**
 * ProfilePanel — identity header (portrait, name, rank).
 *
 * The header reads whatever the auth flow already put in the profile store,
 * so it renders with no section open and survives section switches.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../../__tests__/setup/render-helpers';
import { useProfileStore } from '../../../store/profile-store';
import { ProfilePanel } from '../ProfilePanel';
import type { TycoonProfileFull } from '@/shared/types';

function makeProfile(overrides: Partial<TycoonProfileFull> = {}): TycoonProfileFull {
  return {
    name: 'Crazz',
    realName: 'Crazz',
    ranking: 1,
    budget: '0',
    prestige: 0,
    facPrestige: 0,
    researchPrestige: 0,
    facCount: 0,
    facMax: 0,
    area: 0,
    nobPoints: 0,
    licenceLevel: 0,
    failureLevel: 0,
    levelName: 'Novice',
    levelTier: 0,
    ...overrides,
  };
}

function clickSection(label: string): void {
  fireEvent.click(within(screen.getByLabelText('Profile sections')).getByText(label));
}

describe('ProfilePanel — identity header', () => {
  beforeEach(() => {
    useProfileStore.getState().reset();
  });

  it('shows portrait, name and rank with no section open', () => {
    act(() => {
      useProfileStore.getState().setProfile(makeProfile({ name: 'Crazz', ranking: 12, photoUrl: 'http://x/p.jpg' }));
    });

    const { container } = renderWithProviders(<ProfilePanel />);

    expect(screen.getByText('Crazz')).toBeTruthy();
    expect(screen.getByText('#12')).toBeTruthy();
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('http://x/p.jpg');
    expect(useProfileStore.getState().currentTab).toBeNull();
  });

  it('renders no header and no img when profile is null', () => {
    const { container } = renderWithProviders(<ProfilePanel />);

    expect(screen.queryByText('Crazz')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders a placeholder, not an img, when photoUrl is absent', () => {
    act(() => {
      useProfileStore.getState().setProfile(makeProfile({ name: 'Nophoto', ranking: 3 }));
    });

    const { container } = renderWithProviders(<ProfilePanel />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[class*="identityPhotoPlaceholder"]')).toBeTruthy();
  });

  it('falls back to a placeholder when the photo 404s', () => {
    act(() => {
      useProfileStore.getState().setProfile(makeProfile({ name: 'Broken', ranking: 5, photoUrl: 'http://x/missing.jpg' }));
    });

    const { container } = renderWithProviders(<ProfilePanel />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();

    fireEvent.error(img as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[class*="identityPhotoPlaceholder"]')).toBeTruthy();
  });

  it('survives opening a section and switching sections', () => {
    act(() => {
      useProfileStore.getState().setProfile(makeProfile({ name: 'Crazz', ranking: 12 }));
    });

    renderWithProviders(<ProfilePanel />);

    expect(screen.getByText('Crazz')).toBeTruthy();

    clickSection('Bank Account');
    expect(screen.getByText('Crazz')).toBeTruthy();

    clickSection('Curriculum');
    expect(screen.getByText('Crazz')).toBeTruthy();
  });
});
