/**
 * ProfilePanel — section list / drawer behaviour.
 *
 * The panel opens on the list alone: no section is selected, so no profile
 * request goes out until the user picks one.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, createSpiedCallbacks } from '../../../__tests__/setup/render-helpers';
import { useProfileStore } from '../../../store/profile-store';
import { ProfilePanel } from '../ProfilePanel';

const SECTION_LABELS = [
  'Curriculum',
  'Bank Account',
  'Profit & Loss',
  'Companies',
  'Initial Suppliers',
  'Strategy',
];

/** The drawer header repeats the section label, so always click the list entry. */
function clickSection(label: string): void {
  fireEvent.click(within(screen.getByLabelText('Profile sections')).getByText(label));
}

describe('ProfilePanel — sections', () => {
  beforeEach(() => {
    useProfileStore.getState().reset();
  });

  it('lists every section and opens none by default', () => {
    const onProfileCurriculum = jest.fn();
    renderWithProviders(<ProfilePanel />, {
      clientCallbacks: createSpiedCallbacks({ onProfileCurriculum }),
    });

    for (const label of SECTION_LABELS) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(useProfileStore.getState().currentTab).toBeNull();
    expect(onProfileCurriculum).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Close section')).toBeNull();
  });

  it('requests a section only when it is clicked', () => {
    const onProfileBank = jest.fn();
    renderWithProviders(<ProfilePanel />, {
      clientCallbacks: createSpiedCallbacks({ onProfileBank }),
    });

    clickSection('Bank Account');

    expect(useProfileStore.getState().currentTab).toBe('bank');
    expect(onProfileBank).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Close section')).toBeTruthy();
  });

  it('collapses the drawer when the open section is clicked again', () => {
    renderWithProviders(<ProfilePanel />);

    clickSection('Strategy');
    expect(useProfileStore.getState().currentTab).toBe('policy');

    clickSection('Strategy');
    expect(useProfileStore.getState().currentTab).toBeNull();
    expect(screen.queryByLabelText('Close section')).toBeNull();
  });

  it('switches sections without closing the drawer', () => {
    const onProfileCompanies = jest.fn();
    renderWithProviders(<ProfilePanel />, {
      clientCallbacks: createSpiedCallbacks({ onProfileCompanies }),
    });

    clickSection('Curriculum');
    clickSection('Companies');

    expect(useProfileStore.getState().currentTab).toBe('companies');
    expect(onProfileCompanies).toHaveBeenCalledTimes(1);
  });

  it('closes the drawer from the header buttons', () => {
    renderWithProviders(<ProfilePanel />);

    clickSection('Profit & Loss');
    fireEvent.click(screen.getByLabelText('Close section'));
    expect(useProfileStore.getState().currentTab).toBeNull();

    clickSection('Profit & Loss');
    fireEvent.click(screen.getByLabelText('Back to sections'));
    expect(useProfileStore.getState().currentTab).toBeNull();
  });

  it('shows the loading skeleton while a section is in flight', () => {
    const { container } = renderWithProviders(<ProfilePanel />);

    clickSection('Initial Suppliers');

    // requestTabData() flips isLoading before the response lands
    expect(useProfileStore.getState().isLoading).toBe(true);
    expect(container.querySelector('[class*="loading"]')).toBeTruthy();
  });

  it('renders the section body once its data lands', () => {
    renderWithProviders(<ProfilePanel />);

    clickSection('Companies');
    act(() => {
      useProfileStore.getState().setCompanies({
        companies: [
          { name: 'Green Co', companyId: 7, ownerRole: 'Tycoon', cluster: 'A', facilityCount: 3, companyType: 'Industry' },
        ],
        currentCompany: 'Green Co',
        worldName: 'planitia',
      });
    });

    expect(useProfileStore.getState().isLoading).toBe(false);
    expect(screen.getByText('Green Co')).toBeTruthy();
  });

  it('forgets the open section when the panel unmounts', () => {
    const { unmount } = renderWithProviders(<ProfilePanel />);

    clickSection('Curriculum');
    expect(useProfileStore.getState().currentTab).toBe('curriculum');

    unmount();
    expect(useProfileStore.getState().currentTab).toBeNull();
  });
});
