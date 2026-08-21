/**
 * RatingsRail component tests.
 *
 * The one rule worth pinning: the office holder gets no rating control.
 * `RDOSetRatingFrom` drops a self-rating in silence (`Kernel/TownPolitics.pas:195`),
 * so a live `<select>` there is a dead control — the UI has to refuse the
 * gesture, because there is no failure coming back to report.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { useGameStore } from '../../store/game-store';
import { usePoliticsStore } from '../../store/politics-store';
import { RatingsRail } from './RatingsRail';
import type { PoliticsData } from '@/shared/types';

const DATA: PoliticsData = {
  townName: 'Helartia',
  isCapitol: false,
  hasRuler: true,
  yearsToElections: 2,
  mayorName: 'SPO_test3',
  mayorPrestige: 240,
  mayorRating: 55,
  tycoonsRating: 48,
  ifelRating: 61,
  mandateNo: 1,
  rulerPhotoUrl: '',
  popularRatings: [{ name: 'Housing', value: 55 }],
  ifelRatings: [{ name: 'Economy', value: 61 }],
  tycoonsRatings: [
    { name: 'College', value: 48, id: 'College' },
    // No cache id — read-only even for a visitor.
    { name: 'Roads', value: 30 },
  ],
  publicity: [],
  publicityAds: '',
  campaignCount: 0,
  campaigns: [],
  campaignState: 'ruler',
  campaignMessage: '',
  canLaunchCampaign: false,
  prestigeThreshold: 200,
  projects: [],
  promise: '',
  townHallId: 1234,
};

function showTycoonsRailAs(username: string): void {
  act(() => {
    useGameStore.getState().setCredentials(username);
    usePoliticsStore.getState().setActiveRatingRail('tycoons');
  });
}

describe('RatingsRail — tycoons rail', () => {
  beforeEach(() => {
    act(() => {
      usePoliticsStore.getState().setActiveRatingRail('popular');
      useGameStore.getState().setCredentials('');
    });
  });

  it('lets a visitor rate a criterion that carries a cache id', () => {
    showTycoonsRailAs('gatorlor');
    renderWithProviders(<RatingsRail data={DATA} />);

    expect(screen.getByLabelText('Your rating for College')).toBeTruthy();
  });

  it('leaves a criterion without a cache id unrateable', () => {
    showTycoonsRailAs('gatorlor');
    renderWithProviders(<RatingsRail data={DATA} />);

    expect(screen.queryByLabelText('Your rating for Roads')).toBeNull();
  });

  it('gives the office holder no control at all — nobody rates themselves', () => {
    showTycoonsRailAs('SPO_test3');
    renderWithProviders(<RatingsRail data={DATA} />);

    expect(screen.queryByLabelText('Your rating for College')).toBeNull();
    expect(screen.getByText(/You cannot rate your own term in office/)).toBeTruthy();
  });

  it('matches the holder regardless of case', () => {
    showTycoonsRailAs('spo_TEST3');
    renderWithProviders(<RatingsRail data={DATA} />);

    expect(screen.queryByLabelText('Your rating for College')).toBeNull();
  });

  it('keeps the prestige-weighting note for everyone else', () => {
    showTycoonsRailAs('gatorlor');
    renderWithProviders(<RatingsRail data={DATA} />);

    expect(screen.getByText(/weighted by personal prestige/)).toBeTruthy();
    expect(screen.queryByText(/You cannot rate your own term/)).toBeNull();
  });
});
