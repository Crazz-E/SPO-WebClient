/**
 * PoliticsSection — Voyager's `politics.asp` inside the civic modal.
 *
 * Covers the three things the page is: the lazy read that fills it, the ratings
 * rail (including the two that mutate), and the campaign panel's four states.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent, within } from '@testing-library/react';
import {
  renderWithProviders,
  resetStores,
  createSpiedCallbacks,
} from '../../../__tests__/setup/render-helpers';
import { usePoliticsStore } from '../../../store/politics-store';
import { useGameStore } from '../../../store/game-store';
import { PoliticsSection } from '../PoliticsSection';
import { CampaignPanel } from '../CampaignPanel';
import type { PoliticsData } from '@/shared/types';

/**
 * Match a number however the runtime locale groups it.
 *
 * The whole politics UI formats through `toLocaleString()` (`capitol-utils.ts`
 * does too), so the thousands separator is the reader's, not ours — a test that
 * pinned "2,000" would pass in CI and fail on a French machine.
 */
function grouped(n: number, suffix = ''): RegExp {
  const separator = String.raw`[\s,\u00a0\u202f]?`;
  const digits = String(n).split('').join(separator);
  return new RegExp(digits + (suffix ? String.raw`\s*` + suffix : ''));
}

const BASE: PoliticsData = {
  townName: 'Helartia',
  isCapitol: false,
  hasRuler: true,
  yearsToElections: 16,
  mayorName: 'SPO_test3',
  mayorPrestige: 588,
  mayorRating: 83,
  tycoonsRating: 83,
  ifelRating: 83,
  mandateNo: 1,
  rulerPhotoUrl: '',
  popularRatings: [{ name: 'Colleges', value: 100 }],
  ifelRatings: [{ name: 'Taxes', value: 98 }],
  tycoonsRatings: [{ name: 'Jails', value: 92, id: '4711' }],
  publicity: [{ id: '4711', name: 'Jails', level: 50 }],
  publicityAds: 'Currently purchasing 0 hits/hour of publicity.',
  campaignCount: 0,
  campaigns: [],
  campaignState: 'available',
  campaignMessage: '',
  canLaunchCampaign: true,
  prestigeThreshold: 200,
  projects: [],
  promise: '',
  townHallId: 90210,
  isRuler: false,
};

/**
 * Seed the politics store.
 *
 * `username` no longer decides who holds the office — the gateway does, and
 * ships the verdict as `PoliticsData.isRuler` (OB-31). Pass it through `data`.
 */
function seed(data: Partial<PoliticsData> = {}, username = 'Someone'): void {
  usePoliticsStore.setState({
    data: { ...BASE, ...data },
    loadState: 'loaded',
    townName: 'Helartia',
    buildingX: 118,
    buildingY: 226,
    isCapitol: data.isCapitol ?? false,
    activeRatingRail: 'popular',
    activeCampaignRail: 'mine',
    pendingRatings: new Map(),
    pendingPublicity: new Map(),
    pendingProjects: new Map(),
  });
  useGameStore.setState({ username });
}

beforeEach(() => {
  resetStores();
  usePoliticsStore.getState().reset();
});

// =============================================================================
// The lazy read
// =============================================================================
describe('PoliticsSection — loading', () => {
  // Five HTTP round-trips per open; nothing is requested until the tab mounts.
  it('requests the data on mount when nothing has been read', () => {
    const spy = jest.fn();
    usePoliticsStore.setState({
      loadState: 'idle', townName: 'Helartia', buildingX: 118, buildingY: 226, isCapitol: false,
    });
    renderWithProviders(
      <PoliticsSection buildingX={118} buildingY={226} />,
      { clientCallbacks: createSpiedCallbacks({ onRequestPoliticsData: spy }) },
    );
    expect(spy).toHaveBeenCalledWith('Helartia', 118, 226, false);
  });

  it('does not re-request while a read is in flight', () => {
    const spy = jest.fn();
    usePoliticsStore.setState({ loadState: 'loading' });
    renderWithProviders(
      <PoliticsSection buildingX={1} buildingY={2} />,
      { clientCallbacks: createSpiedCallbacks({ onRequestPoliticsData: spy }) },
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('says so when the read came back with nothing', () => {
    usePoliticsStore.setState({ loadState: 'loaded', data: null });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText('Politics data is not available.')).toBeTruthy();
  });

  it('the refresh control puts the tab back in the read path', () => {
    seed();
    renderWithProviders(<PoliticsSection buildingX={118} buildingY={226} />);
    fireEvent.click(screen.getByLabelText('Refresh politics data'));
    expect(usePoliticsStore.getState().loadState).toBe('idle');
  });
});

// =============================================================================
// The ruler card and the header
// =============================================================================
describe('PoliticsSection — the ruler', () => {
  it('prints the place and the countdown', () => {
    seed();
    renderWithProviders(<PoliticsSection buildingX={118} buildingY={226} />);
    expect(screen.getByText('Helartia')).toBeTruthy();
    expect(screen.getByText('16 years to elections')).toBeTruthy();
  });

  it('says "year" in the singular the year before an election', () => {
    seed({ yearsToElections: 1 });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText('1 year to elections')).toBeTruthy();
  });

  it('shows the six figures of mayordata.asp', () => {
    seed();
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText('The Mayor')).toBeTruthy();
    expect(screen.getByText('588 points')).toBeTruthy();
    expect(screen.getByText("IFEL's Rating")).toBeTruthy();
    expect(screen.getByText('Mandate No')).toBeTruthy();
  });

  it('titles the Capitol card after the President', () => {
    seed({ isCapitol: true, townName: '' });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText('The President')).toBeTruthy();
    expect(screen.getByText('Capitol')).toBeTruthy();
  });

  // `mayordata.asp:102-110` — the vacant-seat placeholder.
  it('shows the vacancy placeholder when nobody holds the office', () => {
    seed({ hasRuler: false, mayorName: '' });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText('No Mayor')).toBeTruthy();
  });

  it('shows "No President" for a vacant Capitol', () => {
    seed({ isCapitol: true, hasRuler: false, mayorName: '' });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText('No President')).toBeTruthy();
  });
});

// =============================================================================
// The ratings rail
// =============================================================================
describe('PoliticsSection — ratings rail', () => {
  it('opens on the popular ratings', () => {
    seed();
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText('Colleges')).toBeTruthy();
  });

  // `ratingtabs.asp:75` / `:118` — three of the four rails need a ruler.
  it('offers only the IFEL rail when the seat is vacant', () => {
    seed({ hasRuler: false, mayorName: '' });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    const rail = screen.getByRole('tablist', { name: 'Ratings' });
    expect(within(rail).getAllByRole('tab').map((t) => t.textContent)).toEqual(["IFEL's"]);
  });

  it('switches to the tycoons rail and offers a rating per criterion', () => {
    seed();
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    fireEvent.click(screen.getByText("Tycoons'"));
    expect(screen.getByLabelText('Your rating for Jails')).toBeTruthy();
  });

  it('sends the rating with its cache id', () => {
    const spy = jest.fn();
    seed();
    renderWithProviders(
      <PoliticsSection buildingX={1} buildingY={2} />,
      { clientCallbacks: createSpiedCallbacks({ onSetPoliticsRating: spy }) },
    );
    fireEvent.click(screen.getByText("Tycoons'"));
    fireEvent.change(screen.getByLabelText('Your rating for Jails'), { target: { value: '70' } });
    expect(spy).toHaveBeenCalledWith('4711', 70);
  });

  // Only `tycoonratings.asp` carries the row ids; a row without one has no
  // `RatingId` to send and must not offer a dead control.
  it('offers no control for a criterion with no cache id', () => {
    seed({ tycoonsRatings: [{ name: 'Jails', value: 92 }] });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    fireEvent.click(screen.getByText("Tycoons'"));
    expect(screen.queryByLabelText('Your rating for Jails')).toBeNull();
  });

  it('marks the published figure once you have sent your own', () => {
    seed();
    usePoliticsStore.getState().setPendingRating('4711', 70);
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    fireEvent.click(screen.getByText("Tycoons'"));
    expect((screen.getByLabelText('Your rating for Jails') as HTMLSelectElement).value).toBe('70');
  });

  it('shows the publicity total and its priorities', () => {
    seed();
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    fireEvent.click(screen.getByText('Publicity'));
    expect(screen.getByText('Currently purchasing 0 hits/hour of publicity.')).toBeTruthy();
    expect(screen.getByText('Normal')).toBeTruthy();
  });

  // `mayorpub.asp:52` — only the office holder may move a priority.
  it('lets the office holder change a publicity priority', () => {
    const spy = jest.fn();
    seed({ isRuler: true });
    renderWithProviders(
      <PoliticsSection buildingX={1} buildingY={2} />,
      { clientCallbacks: createSpiedCallbacks({ onSetPoliticsPublicity: spy }) },
    );
    fireEvent.click(screen.getByText('Publicity'));
    fireEvent.change(screen.getByLabelText('Publicity priority for Jails'), { target: { value: '100' } });
    expect(spy).toHaveBeenCalledWith('4711', 100);
  });

  it('shows a bystander the priority without a control', () => {
    seed({ isRuler: false });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    fireEvent.click(screen.getByText('Publicity'));
    expect(screen.queryByLabelText('Publicity priority for Jails')).toBeNull();
    expect(screen.getByText('Normal')).toBeTruthy();
  });

  it('says so when a rail has nothing to show', () => {
    seed({ popularRatings: [] });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText('No ratings published for this office.')).toBeTruthy();
  });
});

// =============================================================================
// The campaign panel
// =============================================================================
describe('PoliticsSection — campaign panel', () => {
  it('shows "No candidates" when nobody is running', () => {
    seed();
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText('No candidates')).toBeTruthy();
  });

  // `opositiondata.asp:46` — `Tycoon0`, the head of the list.
  it('shows the strongest candidate with prestige and rating', () => {
    seed({ campaigns: [{ candidateName: 'Alice', rating: 61, prestige: 2000, photoUrl: '' }], campaignCount: 1 });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Strongest candidate')).toBeTruthy();
    expect(screen.getByText(grouped(2000, 'points'))).toBeTruthy();
  });

  // `opositiondata.asp:53-56` — the strongest candidate's portrait, same shape
  // as the ruler's on `mayordata.asp`.
  it("shows the strongest candidate's portrait when the gateway resolved one", () => {
    seed();
    const { container } = renderWithProviders(
      <CampaignPanel
        data={{
          ...BASE,
          campaignCount: 1,
          campaigns: [{
            candidateName: 'Alice', rating: 61, prestige: 2000,
            photoUrl: 'http://host/fivedata/userinfo/Planitia/Alice/largephoto.jpg',
          }],
        }}
        buildingX={1}
        buildingY={2}
      />,
    );
    expect(container.querySelector('img')!.getAttribute('src')).toMatch(/\/Alice\/largephoto\.jpg$/);
  });

  it("falls back to the initial when the strongest candidate's portrait 404s", () => {
    seed();
    const { container } = renderWithProviders(
      <CampaignPanel
        data={{
          ...BASE,
          campaignCount: 1,
          campaigns: [{
            candidateName: 'Alice', rating: 61, prestige: 2000,
            photoUrl: 'http://host/fivedata/userinfo/Planitia/Alice/largephoto.jpg',
          }],
        }}
        buildingX={1}
        buildingY={2}
      />,
    );
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('renders no img when the strongest candidate has an empty photoUrl', () => {
    seed();
    const { container } = renderWithProviders(
      <CampaignPanel
        data={{
          ...BASE,
          campaignCount: 1,
          campaigns: [{ candidateName: 'Alice', rating: 61, prestige: 2000, photoUrl: '' }],
        }}
        buildingX={1}
        buildingY={2}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('offers the launch button with the town threshold', () => {
    const spy = jest.fn();
    seed();
    renderWithProviders(
      <PoliticsSection buildingX={118} buildingY={226} />,
      { clientCallbacks: createSpiedCallbacks({ onLaunchCampaign: spy }) },
    );
    expect(screen.getByText(grouped(200, 'points'))).toBeTruthy();
    fireEvent.click(screen.getByText('Launch Campaign'));
    expect(spy).toHaveBeenCalledWith(118, 226);
  });

  it('offers the launch button with the presidential threshold at the Capitol', () => {
    seed({ isCapitol: true, prestigeThreshold: 1000 });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText(grouped(1000, 'points'))).toBeTruthy();
  });

  it('tells the office holder he cannot run', () => {
    seed({ campaignState: 'ruler', canLaunchCampaign: false });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText('You are the Mayor. You cannot have a campaign.')).toBeTruthy();
    expect(screen.queryByText('Launch Campaign')).toBeNull();
  });

  it('publishes the refusal the server gave', () => {
    seed({
      campaignState: 'refused',
      canLaunchCampaign: false,
      campaignMessage: 'It is too late to launch a campaign.',
    });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText('It is too late to launch a campaign.')).toBeTruthy();
  });

  it('offers withdrawal and the programme while a campaign runs', () => {
    const spy = jest.fn();
    seed({
      campaignState: 'running',
      canLaunchCampaign: false,
      projects: [
        { id: '11', name: 'Minister of Health', kind: 'minister', ministerName: 'Bob', proposalState: 3 },
        { id: '12', name: 'Unemployment', kind: 'goal', comparator: 'Less than', value: 7 },
      ],
      promise: 'Roads for everyone.',
    });
    renderWithProviders(
      <PoliticsSection buildingX={5} buildingY={6} />,
      { clientCallbacks: createSpiedCallbacks({ onCancelCampaign: spy }) },
    );
    fireEvent.click(screen.getByText('Withdraw Campaign'));
    expect(spy).toHaveBeenCalledWith(5, 6);
    expect(screen.getByText('This proposal is OK')).toBeTruthy();
    expect(screen.getByText('Less than')).toBeTruthy();
    expect(screen.getByText('Roads for everyone.')).toBeTruthy();
  });

  it('sends a minister name when the field loses focus', () => {
    const spy = jest.fn();
    seed({
      campaignState: 'running',
      projects: [{ id: '11', name: 'Minister of Health', kind: 'minister', ministerName: 'Bob' }],
    });
    renderWithProviders(
      <PoliticsSection buildingX={1} buildingY={2} />,
      { clientCallbacks: createSpiedCallbacks({ onSetCampaignProject: spy }) },
    );
    const input = screen.getByLabelText('Minister of Health');
    fireEvent.change(input, { target: { value: 'Zoe' } });
    fireEvent.blur(input);
    expect(spy).toHaveBeenCalledWith('11', 'Zoe');
  });

  it('sends nothing when a minister field is blurred unchanged', () => {
    const spy = jest.fn();
    seed({
      campaignState: 'running',
      projects: [{ id: '11', name: 'Minister of Health', kind: 'minister', ministerName: 'Bob' }],
    });
    renderWithProviders(
      <PoliticsSection buildingX={1} buildingY={2} />,
      { clientCallbacks: createSpiedCallbacks({ onSetCampaignProject: spy }) },
    );
    fireEvent.blur(screen.getByLabelText('Minister of Health'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends a goal as the widestring the ASP sends', () => {
    const spy = jest.fn();
    seed({
      campaignState: 'running',
      projects: [{ id: '12', name: 'Unemployment', kind: 'goal', comparator: 'Less than', value: 7 }],
    });
    renderWithProviders(
      <PoliticsSection buildingX={1} buildingY={2} />,
      { clientCallbacks: createSpiedCallbacks({ onSetCampaignProject: spy }) },
    );
    fireEvent.change(screen.getByLabelText('Unemployment'), { target: { value: '40' } });
    expect(spy).toHaveBeenCalledWith('12', '40');
  });

  // `campaigntabs.asp:104` — the second rail exists only when someone is running.
  it('hides the All campaigns rail when nobody is running', () => {
    seed();
    const rail = screen.queryByRole('tablist', { name: 'Campaigns' });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(rail).toBeNull();
    expect(screen.queryByText('All campaigns')).toBeNull();
  });

  it('ranks every campaign on the All campaigns rail', () => {
    seed({
      campaignCount: 2,
      campaigns: [
        { candidateName: 'Alice', rating: 61, prestige: 2000, photoUrl: '' },
        { candidateName: 'Carol', rating: 12, prestige: 300, photoUrl: '' },
      ],
    });
    const { container } = renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    fireEvent.click(screen.getByText('All campaigns'));
    const rows = Array.from(container.querySelectorAll('tbody tr'))
      .map((r) => Array.from(r.querySelectorAll('td')).map((c) => c.textContent));
    expect(rows).toEqual([['1', 'Alice', '61%'], ['2', 'Carol', '12%']]);
  });
});

// =============================================================================
// Details the panels get right only at the edges
// =============================================================================
describe('PoliticsSection — edges', () => {
  // `mayordata.asp:39-44` composes the portrait path behind an `if true then`
  // where a FileExists check used to be, so most rulers have none on disk.
  it('shows the portrait the gateway resolved', () => {
    seed({ rulerPhotoUrl: 'http://host/fivedata/userinfo/Planitia/SPO_test3/largephoto.jpg' });
    const { container } = renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('largephoto.jpg');
  });

  it('falls back to the initial when the portrait 404s', () => {
    seed({ rulerPhotoUrl: 'http://host/missing.jpg' });
    const { container } = renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getAllByText('S').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the initial when there is no portrait at all', () => {
    seed();
    const { container } = renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('Enter commits a minister name without waiting for a blur', () => {
    const spy = jest.fn();
    seed({
      campaignState: 'running',
      projects: [{ id: '11', name: 'Minister of Health', kind: 'minister', ministerName: '' }],
    });
    renderWithProviders(
      <PoliticsSection buildingX={1} buildingY={2} />,
      { clientCallbacks: createSpiedCallbacks({ onSetCampaignProject: spy }) },
    );
    const input = screen.getByLabelText('Minister of Health');
    // jsdom only fires `blur` on the focused element, and Enter commits by
    // blurring rather than by submitting — there is no form here.
    input.focus();
    fireEvent.change(input, { target: { value: 'Zoe' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(spy).toHaveBeenCalledWith('11', 'Zoe');
  });

  // `tycooncampaign.asp:346` links back to itself with `Recache=YES` and nothing
  // else — the re-read IS the validation.
  it('"Check Minister Names" re-reads the panel', () => {
    seed({
      campaignState: 'running',
      projects: [{ id: '11', name: 'Minister of Health', kind: 'minister', ministerName: 'Bob' }],
    });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    fireEvent.click(screen.getByText('Check Minister Names'));
    expect(usePoliticsStore.getState().loadState).toBe('idle');
  });

  it('hides the proposal verdict while an unsent edit is on screen', () => {
    seed({
      campaignState: 'running',
      projects: [{ id: '11', name: 'Minister of Health', kind: 'minister', ministerName: 'Bob', proposalState: 2 }],
    });
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    expect(screen.getByText('This tycoon cannot act as a Minister')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Minister of Health'), { target: { value: 'Zoe' } });
    expect(screen.queryByText('This tycoon cannot act as a Minister')).toBeNull();
  });

  it('leaves the Your campaign rail selected when there is no second rail', () => {
    seed();
    usePoliticsStore.getState().setActiveCampaignRail('all');
    renderWithProviders(<PoliticsSection buildingX={1} buildingY={2} />);
    // No candidates, so `campaigntabs.asp:104` renders no All rail and the
    // panel must fall back rather than show an empty table.
    expect(screen.getByText('Launch Campaign')).toBeTruthy();
  });
});
