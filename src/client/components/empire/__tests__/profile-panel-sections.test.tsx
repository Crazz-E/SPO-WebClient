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
import type { BankAccountData, CurriculumData } from '@/shared/types';

const CURRICULUM_BASE: CurriculumData = {
  tycoonName: 'SPO_test3',
  currentLevel: 4,
  currentLevelName: 'Paradigm',
  currentLevelDescription: 'You are a paradigm of industry.',
  nextLevelName: 'Legend',
  nextLevelDescription: 'Legends shape worlds.',
  nextLevelRequirements: 'Prestige 5000 and 50 facilities',
  canUpgrade: true,
  isUpgradeRequested: false,
  fortune: '$1,234,567',
  averageProfit: '$88,000/h',
  prestige: 1234,
  facPrestige: 0,
  researchPrestige: 0,
  budget: '1234567',
  ranking: 42,
  facCount: 13,
  facMax: 100,
  area: 0,
  nobPoints: 2500,
  tournamentOn: false,
  abilityTotal: 0,
  abilityRankingPoints: 0,
  abilityLevelPoints: 0,
  abilityLoanPoints: 0,
  rankings: [],
  curriculumItems: [],
};

/** A page with no send panel at all: neither the pill nor a reason (:320). */
const BANK_BASE: BankAccountData = {
  balance: '123456789',
  maxLoan: '2000000000',
  totalLoans: '0',
  totalNextPayment: '0',
  loans: [],
  defaultInterest: 25,
  defaultTerm: 5,
  canSendMoney: false,
};

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

  it('shows the Ability card and its components on a tournament world', () => {
    renderWithProviders(<ProfilePanel />);

    clickSection('Curriculum');
    act(() => {
      useProfileStore.getState().setCurriculum({
        ...CURRICULUM_BASE,
        tournamentOn: true,
        abilityTotal: 15,
        abilityRankingPoints: 10,
        abilityLevelPoints: 0,
        abilityLoanPoints: 5,
      });
    });

    expect(screen.getByText('Ability')).toBeTruthy();
    expect(screen.getByText('15 points')).toBeTruthy();
    expect(screen.getByText(/from the rankings/)).toBeTruthy();
  });

  it('shows no Ability card on a non-tournament world', () => {
    renderWithProviders(<ProfilePanel />);

    clickSection('Curriculum');
    act(() => {
      useProfileStore.getState().setCurriculum({ ...CURRICULUM_BASE });
    });

    expect(screen.queryByText('Ability')).toBeNull();
    expect(screen.queryByText(/from the rankings/)).toBeNull();
  });

  // The send panel mirrors TycoonBankAccount.asp :424-509 — the page decides
  // whether the form is offered, and which text stands in its place.
  function openBank(data: BankAccountData): void {
    renderWithProviders(<ProfilePanel />);
    clickSection('Bank Account');
    act(() => {
      useProfileStore.getState().setBankAccount(data);
    });
  }

  it('offers Send Money with the page cap note when transfers are allowed (:427-439)', () => {
    openBank({ ...BANK_BASE, canSendMoney: true, maxTransfer: '12345678' });

    fireEvent.click(screen.getByText('Send Money'));

    expect(screen.getByText('You can transfer up to $12,345,678')).toBeTruthy();
    expect(screen.queryByText(/Money transfers are not allowed/)).toBeNull();
    expect(screen.queryByText(/DEMO account/)).toBeNull();
  });

  it('offers no Send Money on a tournament planet, and says why (:506)', () => {
    openBank({ ...BANK_BASE, sendMoneyBlock: 'tournament' });

    expect(screen.queryByText('Send Money')).toBeNull();
    expect(screen.getByText('Money transfers are not allowed in Tournament planets')).toBeTruthy();
    expect(screen.queryByText(/transfer up to/)).toBeNull();
  });

  it('offers no Send Money on a Demo account, and shows the Demo notice (:467)', () => {
    openBank({ ...BANK_BASE, sendMoneyBlock: 'demo', maxTransfer: '12345678' });

    expect(screen.queryByText('Send Money')).toBeNull();
    expect(screen.getByText(/Since this is a DEMO account/)).toBeTruthy();
    expect(screen.queryByText(/transfer up to/)).toBeNull();
  });

  it('offers no Send Money on a zero cap with a positive budget (:476)', () => {
    openBank({ ...BANK_BASE, sendMoneyBlock: 'loansOrVisa' });

    expect(screen.queryByText('Send Money')).toBeNull();
    expect(screen.getByText(/received with loans or as part of your Investor Visa/)).toBeTruthy();
    expect(screen.queryByText(/transfer up to/)).toBeNull();
  });

  it('offers no Send Money on a zero cap with a zero budget (:478)', () => {
    openBank({ ...BANK_BASE, sendMoneyBlock: 'noMoney', balance: '0' });

    expect(screen.queryByText('Send Money')).toBeNull();
    expect(screen.getByText('You have no money to send')).toBeTruthy();
    expect(screen.queryByText(/transfer up to/)).toBeNull();
  });

  it('shows neither the pill nor a reason when the page carries no send panel (:320)', () => {
    openBank(BANK_BASE);

    expect(screen.queryByText('Send Money')).toBeNull();
    expect(screen.queryByText(/transfer up to/)).toBeNull();
    expect(screen.getByText('Request Loan')).toBeTruthy();
  });
});
