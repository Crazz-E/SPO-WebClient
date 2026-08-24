/// <reference path="../../server/__tests__/matchers/rdo-matchers.d.ts" />
/**
 * The civic write path, checked against the two authorities it answers to:
 * the RDO catalogue (kind and arity) and the property templates (which members
 * a civic tab can actually ask for).
 *
 * What these tests are for: before this scenario existed, nothing in the L1
 * substrate ever saw a civic mutation. A wrong separator on one of these eleven
 * members freezes the model server; a wrong argument count writes through a
 * register nobody set. Both are catalogue questions, and both are now asked
 * here rather than on the wire.
 */

import { RdoProtocol } from '@/server/rdo';
import { RDO_MEMBERS } from '@/shared/rdo-members';
import {
  VOTES_GROUP,
  CAPITOL_TOWNS_GROUP,
  MINISTERIES_GROUP,
  TOWN_JOBS_GROUP,
  TOWN_TAXES_GROUP,
} from '@/shared/building-details/template-groups';
import {
  parsePoliticsRatings,
  parsePublicityRows,
  parsePublicityAds,
  parseCampaignProjects,
  parseCampaignPromise,
  parseCampaignState,
} from '@/server/session/politics-handler';
import { RdoMock } from '../rdo-mock';
import { HttpMock } from '../http-mock';
import {
  createCivicMutationsScenario,
  CIVIC_MUTATIONS,
  CIVIC_MUTATION_MEMBERS,
  CIVIC_TARGETS,
  POLITICS_PATH,
} from './civic-mutations-scenario';

const { rdo, http } = createCivicMutationsScenario();

/** Every `rdoCommands` entry the civic template groups declare. */
const TEMPLATE_CIVIC_COMMANDS = Array.from(new Set(
  [VOTES_GROUP, CAPITOL_TOWNS_GROUP, MINISTERIES_GROUP, TOWN_JOBS_GROUP, TOWN_TAXES_GROUP]
    .flatMap(g => Object.values(g.rdoCommands ?? {}).map(c => c.command)),
));

describe('civic-mutations scenario — the catalogue', () => {
  it('passes strict RDO validation', () => {
    expect(rdo).toPassStrictRdoValidation();
  });

  it('every civic mutation is a procedure, so every frame carries "*"', () => {
    for (const m of CIVIC_MUTATIONS) {
      expect(RDO_MEMBERS[m.member].kind).toBe('procedure');
    }
    for (const ex of rdo.exchanges) {
      if (ex.matchKeys?.member === 'GetPropertyList') continue;
      // `"^"` on a procedure leaves a result pointer nobody pops — the freeze.
      expect(ex.request).toContain('"*"');
      expect(ex.request).not.toContain('"^"');
    }
  });

  it('every civic mutation carries the argument count the catalogue declares', () => {
    for (const m of CIVIC_MUTATIONS) {
      expect(RDO_MEMBERS[m.member]).toHaveProperty('arity', m.args.length);
    }
  });

  it('a procedure answers nothing, so no mutation exchange carries a response', () => {
    // Not an omission: this is OB-28 stated as a fixture. "Confirmed" can never
    // come from the reply of a member that has none.
    const mutations = rdo.exchanges.filter(ex => ex.matchKeys?.member !== 'GetPropertyList');
    expect(mutations).not.toHaveLength(0);
    for (const ex of mutations) {
      expect(ex.response).toBe('');
    }
  });

  it('covers every mutation the civic templates can ask for', () => {
    // The divergence this guards: a template offering a control whose command
    // the substrate has never seen emitted.
    for (const command of TEMPLATE_CIVIC_COMMANDS) {
      expect(CIVIC_MUTATION_MEMBERS).toContain(command);
    }
  });

  it('covers the three politics procedures the templates do not name', () => {
    // These reach the wire from politics-handler, not from the property path,
    // so no `rdoCommands` entry mentions them.
    for (const member of ['RDOSetRatingFrom', 'RDOSetPublicity', 'RDOSetProjectData']) {
      expect(CIVIC_MUTATION_MEMBERS).toContain(member);
    }
  });

  it('binds the three politics procedures to the political entity, not the block', () => {
    // `TownHallId` and `CurrBlock` differ on a Capitol; binding a rating to the
    // facility would address an object that has no such member.
    const politics = CIVIC_MUTATIONS.filter(m =>
      ['RDOSetRatingFrom', 'RDOSetPublicity', 'RDOSetProjectData'].includes(m.member));
    expect(politics).toHaveLength(3);
    for (const m of politics) {
      expect(m.targetId).toBe(CIVIC_TARGETS.townHallId);
    }
  });

  it('the tax write takes the account id, never the row index', () => {
    // building-property-handler.ts:141-153 resolves `Tax0Id` first; 100 is what
    // MOCK_TOWN_HALL serves there and 0 is the row it sits on.
    const tax = CIVIC_MUTATIONS.find(m => m.slug === 'set-tax-value')!;
    expect(tax.args[0].format()).toBe('"#100"');
  });

  it('a subsidy travels as the literal -10, sign included', () => {
    const subsidy = CIVIC_MUTATIONS.find(m => m.slug === 'set-tax-value-subsidy')!;
    expect(subsidy.args[1].format()).toBe('"%-10"');
  });
});

describe('civic-mutations scenario — matching', () => {
  it('matches each mutation frame back to its own exchange', () => {
    const mock = new RdoMock();
    mock.addScenario(rdo);
    for (const ex of rdo.exchanges) {
      const result = mock.match(ex.request);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe(ex.id);
    }
  });

  it('tells the two RDOSetTaxValue writes apart by their arguments', () => {
    const mock = new RdoMock();
    mock.addScenario(rdo);
    const subsidy = rdo.exchanges.find(e => e.id === 'civic-rdo-set-tax-value-subsidy')!;
    expect(mock.match(subsidy.request)!.exchange.id).toBe(subsidy.id);
  });

  it('serves the id lookup a tax write depends on', () => {
    const mock = new RdoMock();
    mock.addScenario(rdo);
    const lookup = rdo.exchanges.find(e => e.id === 'civic-rdo-lookup-tax-id')!;
    expect(mock.match(lookup.request)!.response).toBe('A0 res="%100"');
  });

  it('every request parses as a well-formed sel/call frame', () => {
    for (const ex of rdo.exchanges) {
      const parsed = RdoProtocol.parse(ex.request);
      expect(parsed.verb).toBe('sel');
      expect(parsed.action).toBe('call');
      expect(parsed.member).toBe(ex.matchKeys!.member);
    }
  });
});

describe('civic-mutations scenario — the Politics ASP pages', () => {
  const mock = new HttpMock();
  mock.addScenario(http);

  const fetchPage = (name: string): string => {
    const result = mock.match('GET', `${POLITICS_PATH}/${name}?WorldName=Shamba&TownName=Shamba`);
    expect(result).not.toBeNull();
    return result!.body;
  };

  it('serves the five pages getPoliticsData fetches', () => {
    for (const name of [
      'popularratings.asp', 'ifelratings.asp', 'tycoonratings.asp',
      'mayorpub.asp', 'tycooncampaign.asp',
    ]) {
      expect(mock.match('GET', `${POLITICS_PATH}/${name}?WorldName=Shamba`)).not.toBeNull();
    }
  });

  it('popularratings.asp parses to its rows, separators dropped', () => {
    expect(parsePoliticsRatings(fetchPage('popularratings.asp'))).toEqual([
      { name: 'Unemployment', value: 85 },
      { name: 'Public Services', value: 62 },
      { name: 'Housing', value: 47 },
    ]);
  });

  it('ifelratings.asp parses through the same reader', () => {
    expect(parsePoliticsRatings(fetchPage('ifelratings.asp'))).toEqual([
      { name: 'IFEL Rating', value: 40 },
      { name: 'Commerce', value: 58 },
    ]);
  });

  it('tycoonratings.asp yields the cache id every rating write needs', () => {
    // The id is the `RatingId` argument of RDOSetRatingFrom; a row without one
    // cannot be rated at all.
    expect(parsePoliticsRatings(fetchPage('tycoonratings.asp'))).toEqual([
      { name: 'Taxation', value: 75, id: '41123456' },
      { name: 'Public Works', value: 30, id: '41123457' },
    ]);
  });

  it('the rating value comes from the span, not from the opinion dropdown', () => {
    // Every option in that select is a percentage too; reading the cell text
    // whole reported 100 for every row.
    const rows = parsePoliticsRatings(fetchPage('tycoonratings.asp'));
    expect(rows.map(r => r.value)).toEqual([75, 30]);
  });

  it('mayorpub.asp yields the level off the selected option, not the label', () => {
    expect(parsePublicityRows(fetchPage('mayorpub.asp'))).toEqual([
      { id: '41123456', name: 'Taxation', level: 75 },
      { id: '41123457', name: 'Public Works', level: 0 },
    ]);
  });

  it('mayorpub.asp publishes its hits-per-hour sentence', () => {
    expect(parsePublicityAds(fetchPage('mayorpub.asp')))
      .toBe('Your publicity reaches 12500 hits per hour.');
  });

  it('tycooncampaign.asp parses both project row shapes, in page order', () => {
    expect(parseCampaignProjects(fetchPage('tycooncampaign.asp'))).toEqual([
      { id: '42007700', name: 'Minister of Health', kind: 'minister', ministerName: 'SPO_test3', proposalState: 3 },
      { id: '42007701', name: 'Minister of Education', kind: 'minister', ministerName: 'None', proposalState: 1 },
      { id: '42007702', name: 'Unemployment', kind: 'goal', comparator: 'less than', value: 12 },
    ]);
  });

  it('tycooncampaign.asp yields the promise', () => {
    expect(parseCampaignPromise(fetchPage('tycooncampaign.asp')))
      .toBe('Lower the taxes, raise the schools.');
  });

  it('the Withdraw button is what says the campaign is running', () => {
    expect(parseCampaignState(fetchPage('tycooncampaign.asp'), false))
      .toEqual({ state: 'running', message: '' });
  });
});
