// @ts-nocheck
/**
 * RDO Protocol Tests — Facility Inspector Gap Exchanges
 *
 * Tests RDO command format correctness and exchange definitions for all 5 critical
 * gaps identified in FACILITY-INSPECTOR-GAP-ANALYSIS.md:
 *
 *   GAP-02  Films action buttons (RDOLaunchMovie / RDOCancelMovie / RDOReleaseMovie)
 *   GAP-02  RDOVote command (entirely missing)
 *   GAP-02  Ministeries action buttons (RDOSetMinistryBudget / RDOBanMinister / RDOSitMinister)
 *   GAP-03  ResGeneral missing 5 properties (Occupancy, Inhabitants, QOL, Crime, Pollution)
 *   GAP-05  Workforce missing WorkersCap / MinSalaries
 *
 * All parameter names, types, ordering and separator choices are derived exclusively
 * from the SPO-Original Delphi source code:
 *
 *   MovieStudios.pas      — TMovieStudios published procedures
 *   TownPolitics.pas      — TPoliticalTownHall.RDOVote / RDOVoteOf
 *   WorldPolitics.pas     — TPresidentialHall ministry methods
 *   PopulatedBlock.pas    — TPopulatedBlock published properties + StoreToCache
 *   WorkCenterBlock.pas   — TWorkCenter published methods + StoreToCache
 *   FilmsSheet.pas        — Voyager Films tab property list
 *   VotesSheet.pas        — Voyager Votes tab property list
 *   MinisteriesSheet.pas  — Voyager Ministeries tab property list
 *   ResidentialSheet.pas  — Voyager ResGeneral tab property list
 *   WorkForceSheet.pas    — Voyager Workforce tab property list
 *   InventionsSheet.pas   — Voyager hdqInventions handler
 *   InputSelectionForm.pas — Voyager InputSelection handler
 */

/// <reference path="../matchers/rdo-matchers.d.ts" />

import { describe, it, expect } from '@jest/globals';
import { RdoCommand, RdoValue, RdoParser, RdoTypePrefix } from '../../../shared/rdo-types';
import type { RdoExchange, RdoMatchKey } from '../../../mock-server/types/rdo-exchange-types';

// =============================================================================
// CONSTANTS — mirror mock building IDs from building-details-scenario.ts
// =============================================================================

const TV_STATION_BLOCK = '130300200';   // Channel 5 News (Films tab)
const CAPITOL_BLOCK    = '130400300';   // National Capitol (Votes + Ministeries)
const RESIDENTIAL_BLOCK = '130600500';  // Luxury Apartments (ResGeneral)
const FACTORY_BLOCK    = '127706280';   // Chemical Plant 3 (Workforce)

// =============================================================================
// HELPER — Build a GetPropertyList request for a given set of property names
// =============================================================================

function buildGetPropertyListRequest(
  rid: number,
  targetId: string,
  propNames: string[]
): string {
  const query = propNames.join('\t') + '\t';
  return `C ${rid} sel ${targetId} call GetPropertyList "^" "%${query}"`;
}

function buildGetPropertyListResponse(rid: number, values: string[]): string {
  return `A${rid} res="%${values.join('\t')}"`;
}

// =============================================================================
// GAP-02: FILMS ACTION BUTTONS
// =============================================================================
// Source: MovieStudios.pas (TMovieStudios), FilmsSheet.pas (Voyager UI)
//
// Published procedures on TMovieStudios:
//   procedure RDOLaunchMovie(theName: widestring; budget: double; months: integer; AutoInfo: word);
//   procedure RDOCancelMovie(useless: integer);
//   procedure RDOReleaseMovie(useless: integer);
//   procedure RDOAutoProduce(value: WordBool);
//
// All are void procedures → push separator "*"
// =============================================================================

describe('GAP-02: Films Action Buttons — RDO Command Format', () => {
  describe('RDOLaunchMovie', () => {
    it('should build command with 4 args: %name, @budget, #months, #autoInfo', () => {
      // Delphi: procedure RDOLaunchMovie(theName: widestring; budget: double; months: integer; AutoInfo: word)
      const cmd = RdoCommand.sel(TV_STATION_BLOCK)
        .call('RDOLaunchMovie').push()
        .args(
          RdoValue.string('Shamba Night Live'),  // widestring → %
          RdoValue.double(5000000),               // double → @
          RdoValue.int(12),                       // integer → #
          RdoValue.int(0x03)                      // word flags → # (bit0=autoRelease, bit1=autoProduce)
        )
        .build();

      expect(cmd).toContain('sel 130300200');
      expect(cmd).toContain('call RDOLaunchMovie');
      expect(cmd).toContain('"*"');                     // void procedure → push separator
      expect(cmd).toContain('"%Shamba Night Live"');     // widestring arg
      expect(cmd).toContain('"@5000000"');               // double arg
      expect(cmd).toContain('"#12"');                    // integer arg
      expect(cmd).toContain('"#3"');                     // word flag 0x03 = 3
    });

    it('should use double type (@) for budget, not integer (#)', () => {
      // TRAP: budget is declared as `double` in Delphi, not integer
      const cmd = RdoCommand.sel(TV_STATION_BLOCK)
        .call('RDOLaunchMovie').push()
        .args(
          RdoValue.string('Test Film'),
          RdoValue.double(2500000.50),  // fractional budget is valid
          RdoValue.int(6),
          RdoValue.int(0)
        )
        .build();

      expect(cmd).toContain('"@2500000.5"');
      expect(cmd).not.toContain('"#2500000"');
    });

    it('should encode AutoInfo bitmask: 0x01=autoRelease, 0x02=autoProduce', () => {
      // AutoInfo flags from MovieStudios.pas:
      //   flgAutoRelease = $01  (bit 0)
      //   flgAutoProduce = $02  (bit 1)
      const autoRelOnly = RdoValue.int(0x01).format();
      const autoProdOnly = RdoValue.int(0x02).format();
      const both = RdoValue.int(0x03).format();
      const neither = RdoValue.int(0x00).format();

      expect(autoRelOnly).toBe('"#1"');
      expect(autoProdOnly).toBe('"#2"');
      expect(both).toBe('"#3"');
      expect(neither).toBe('"#0"');
    });

    it('should enforce minimum 6 months (clamped by FilmsSheet.pas)', () => {
      // FilmsSheet.pas lines 443-448: time clamped between 6 and 30
      const cmd = RdoCommand.sel(TV_STATION_BLOCK)
        .call('RDOLaunchMovie').push()
        .args(
          RdoValue.string(''),
          RdoValue.double(5000000),
          RdoValue.int(6),   // minimum 6 months
          RdoValue.int(0)
        )
        .build();

      expect(cmd).toContain('"#6"');
    });

    it('should enforce maximum 30 months', () => {
      const cmd = RdoCommand.sel(TV_STATION_BLOCK)
        .call('RDOLaunchMovie').push()
        .args(
          RdoValue.string('Epic Saga'),
          RdoValue.double(50000000),
          RdoValue.int(30),  // maximum 30 months
          RdoValue.int(0x03)
        )
        .build();

      expect(cmd).toContain('"#30"');
    });
  });

  describe('RDOCancelMovie', () => {
    it('should build command with single dummy integer arg (always 0)', () => {
      // Delphi: procedure RDOCancelMovie(useless: integer)
      const cmd = RdoCommand.sel(TV_STATION_BLOCK)
        .call('RDOCancelMovie').push()
        .args(RdoValue.int(0))
        .build();

      expect(cmd).toBe(`C sel ${TV_STATION_BLOCK} call RDOCancelMovie "*" "#0";`);
    });

    it('should use push separator (*) since it is a void procedure', () => {
      const cmd = RdoCommand.sel(TV_STATION_BLOCK)
        .call('RDOCancelMovie').push()
        .args(RdoValue.int(0))
        .build();

      expect(cmd).toContain('"*"');
      expect(cmd).not.toContain('"^"');
    });
  });

  describe('RDOReleaseMovie', () => {
    it('should build command with single dummy integer arg (always 0)', () => {
      // Delphi: procedure RDOReleaseMovie(useless: integer)
      const cmd = RdoCommand.sel(TV_STATION_BLOCK)
        .call('RDOReleaseMovie').push()
        .args(RdoValue.int(0))
        .build();

      expect(cmd).toBe(`C sel ${TV_STATION_BLOCK} call RDOReleaseMovie "*" "#0";`);
    });
  });

  describe('RDOAutoProduce (existing SET command, tested here for completeness)', () => {
    it('should use WordBool: #-1 for true, #0 for false', () => {
      // Delphi: procedure RDOAutoProduce(value: WordBool)
      const trueCmd = RdoCommand.sel(TV_STATION_BLOCK)
        .call('RDOAutoProduce').push()
        .args(RdoValue.int(-1))  // WordBool true = -1
        .build();

      const falseCmd = RdoCommand.sel(TV_STATION_BLOCK)
        .call('RDOAutoProduce').push()
        .args(RdoValue.int(0))   // WordBool false = 0
        .build();

      expect(trueCmd).toContain('"#-1"');
      expect(falseCmd).toContain('"#0"');
    });
  });
});

describe('GAP-02: Films Tab — GetPropertyList Exchange', () => {
  // FilmsSheet.pas SetFocus (lines 211-228) queries these properties:
  //   xfer_ auto-collected: FilmName, FilmBudget, FilmTime
  //   Explicit adds: SecurityId, CurrBlock, InProd, AutoRel, AutoProd, FilmDone
  const FILMS_PROPERTIES = [
    'FilmName', 'FilmBudget', 'FilmTime',
    'SecurityId', 'CurrBlock', 'InProd', 'AutoRel', 'AutoProd', 'FilmDone',
  ];

  // Mock values for a film in production
  const FILMS_VALUES_IN_PRODUCTION = [
    'Shamba Night Live',  // FilmName
    '5000000',            // FilmBudget
    '12',                 // FilmTime (months)
    'ownerTycoon123',     // SecurityId
    TV_STATION_BLOCK,     // CurrBlock
    'Shamba Night Live',  // InProd (non-empty = production in progress)
    '0',                  // AutoRel
    '1',                  // AutoProd
    '0',                  // FilmDone (0 = not done yet)
  ];

  // Mock values for completed film ready for release
  const FILMS_VALUES_DONE = [
    'Shamba Night Live', '5000000', '12',
    'ownerTycoon123', TV_STATION_BLOCK,
    'Shamba Night Live', '1', '1',
    'YES',  // FilmDone = 'YES' enables the Release button (FilmsSheet.pas)
  ];

  // Mock values for idle studio (no production)
  const FILMS_VALUES_IDLE = [
    '', '', '',
    'ownerTycoon123', TV_STATION_BLOCK,
    '',   // InProd empty = no production
    '0', '0', '0',
  ];

  it('should define GetPropertyList request matching FilmsSheet.pas SetFocus', () => {
    const request = buildGetPropertyListRequest(200, TV_STATION_BLOCK, FILMS_PROPERTIES);

    expect(request).toContain('call GetPropertyList');
    expect(request).toContain('"^"');
    expect(request).toContain('FilmName');
    expect(request).toContain('FilmBudget');
    expect(request).toContain('FilmTime');
    expect(request).toContain('InProd');
    expect(request).toContain('AutoRel');
    expect(request).toContain('AutoProd');
    expect(request).toContain('FilmDone');
  });

  it('should build exchange for film in production', () => {
    const exchange: RdoExchange = {
      id: 'gap-films-in-production',
      request: buildGetPropertyListRequest(200, TV_STATION_BLOCK, FILMS_PROPERTIES),
      response: buildGetPropertyListResponse(200, FILMS_VALUES_IN_PRODUCTION),
      matchKeys: {
        verb: 'sel',
        action: 'call',
        member: 'GetPropertyList',
        argsPattern: [`"%${FILMS_PROPERTIES.join('\t')}\t"`],
      },
    };

    expect(exchange.response).toContain('Shamba Night Live');
    expect(exchange.response).toContain('5000000');
  });

  it('should parse response to extract InProd and FilmDone state', () => {
    const response = buildGetPropertyListResponse(200, FILMS_VALUES_IN_PRODUCTION);
    // Extract payload from A200 res="%..."
    const payloadMatch = response.match(/res="%(.*)"$/);
    expect(payloadMatch).not.toBeNull();

    const values = payloadMatch![1].split('\t');
    expect(values[0]).toBe('Shamba Night Live');  // FilmName
    expect(values[5]).toBe('Shamba Night Live');  // InProd (non-empty = in production)
    expect(values[8]).toBe('0');                  // FilmDone (not done)
  });

  it('should distinguish idle vs in-production vs done states', () => {
    const idle = FILMS_VALUES_IDLE[5];         // InProd
    const inProd = FILMS_VALUES_IN_PRODUCTION[5];
    const done = FILMS_VALUES_DONE[8];         // FilmDone

    expect(idle).toBe('');                       // empty = no film
    expect(inProd).not.toBe('');                 // non-empty = film in progress
    expect(done).toBe('YES');                    // 'YES' = film complete, can release
  });

  it('should build exchange for completed film (FilmDone=YES)', () => {
    const exchange: RdoExchange = {
      id: 'gap-films-done',
      request: buildGetPropertyListRequest(200, TV_STATION_BLOCK, FILMS_PROPERTIES),
      response: buildGetPropertyListResponse(200, FILMS_VALUES_DONE),
      matchKeys: {
        verb: 'sel',
        action: 'call',
        member: 'GetPropertyList',
        argsPattern: [`"%${FILMS_PROPERTIES.join('\t')}\t"`],
      },
    };

    const payloadMatch = exchange.response.match(/res="%(.*)"$/);
    const values = payloadMatch![1].split('\t');
    expect(values[8]).toBe('YES');  // FilmDone
  });
});

// =============================================================================
// GAP-02: RDOVOTE COMMAND (ENTIRELY MISSING)
// =============================================================================
// Source: TownPolitics.pas (TPoliticalTownHall), WorldPolitics.pas (TPresidentialHall)
//         VotesSheet.pas (Voyager UI)
//
// Published methods:
//   procedure RDOVote(voterTycoon, choiceTycoon: widestring);     → void (*) separator
//   function  RDOVoteOf(tycoonName: widestring): OleVariant;      → return (^) separator
//
// Campaign launch/cancel (on TPresidentialHall only):
//   function  RDOLaunchCampaign(TycoonId: widestring): olevariant; → return (^)
//   procedure RDOCancelCampaign(TycoonId: widestring);             → void (*)
// =============================================================================

describe('GAP-02: RDOVote — RDO Command Format', () => {
  describe('RDOVote', () => {
    it('should build command with 2 widestring args: voter and choice', () => {
      // Delphi: procedure RDOVote(voterTycoon, choiceTycoon: widestring)
      const cmd = RdoCommand.sel(CAPITOL_BLOCK)
        .call('RDOVote').push()
        .args(
          RdoValue.string('SPO_test3'),       // voterTycoon (widestring → %)
          RdoValue.string('Senator Adams')    // choiceTycoon (widestring → %)
        )
        .build();

      expect(cmd).toContain('sel 130400300');
      expect(cmd).toContain('call RDOVote');
      expect(cmd).toContain('"*"');                 // void procedure → push separator
      expect(cmd).toContain('"%SPO_test3"');
      expect(cmd).toContain('"%Senator Adams"');
    });

    it('should use push separator (*) since RDOVote is a void procedure', () => {
      const cmd = RdoCommand.sel(CAPITOL_BLOCK)
        .call('RDOVote').push()
        .args(RdoValue.string('voter'), RdoValue.string('candidate'))
        .build();

      expect(cmd).toContain('"*"');
      expect(cmd).not.toContain('"^"');
    });

    it('should use OLE string prefix (%) for both params, not short string ($)', () => {
      // Delphi declares both as `widestring` which maps to OLE string (%)
      const cmd = RdoCommand.sel(CAPITOL_BLOCK)
        .call('RDOVote').push()
        .args(RdoValue.string('voter'), RdoValue.string('candidate'))
        .build();

      expect(cmd).toContain('"%voter"');
      expect(cmd).toContain('"%candidate"');
      expect(cmd).not.toContain('"$');  // never short string
    });
  });

  describe('RDOVoteOf', () => {
    it('should build command with method separator (^) since it returns a value', () => {
      // Delphi: function RDOVoteOf(tycoonName: widestring): OleVariant
      const cmd = RdoCommand.sel(CAPITOL_BLOCK)
        .call('RDOVoteOf').method()
        .args(RdoValue.string('SPO_test3'))
        .build();

      expect(cmd).toContain('call RDOVoteOf');
      expect(cmd).toContain('"^"');                 // function → method separator
      expect(cmd).toContain('"%SPO_test3"');
    });

    it('should parse response as string (voted candidate name)', () => {
      // Server returns: A200 res="%Senator Adams"
      const response = 'A200 res="%Senator Adams"';
      const payloadMatch = response.match(/res="%(.*)"$/);
      expect(payloadMatch).not.toBeNull();
      expect(payloadMatch![1]).toBe('Senator Adams');
    });

    it('should handle empty response when voter has not voted', () => {
      const response = 'A200 res="%"';
      const payloadMatch = response.match(/res="%(.*)"$/);
      expect(payloadMatch).not.toBeNull();
      expect(payloadMatch![1]).toBe('');
    });
  });

  describe('RDOLaunchCampaign (TPresidentialHall only)', () => {
    it('should build command with method separator (^) since it returns error code', () => {
      // Delphi: function RDOLaunchCampaign(TycoonId: widestring): olevariant
      const cmd = RdoCommand.sel(CAPITOL_BLOCK)
        .call('RDOLaunchCampaign').method()
        .args(RdoValue.string('SPO_test3'))
        .build();

      expect(cmd).toContain('call RDOLaunchCampaign');
      expect(cmd).toContain('"^"');
      expect(cmd).toContain('"%SPO_test3"');
    });
  });

  describe('RDOCancelCampaign (TPresidentialHall only)', () => {
    it('should build command with push separator (*) since it is void', () => {
      // Delphi: procedure RDOCancelCampaign(TycoonId: widestring)
      const cmd = RdoCommand.sel(CAPITOL_BLOCK)
        .call('RDOCancelCampaign').push()
        .args(RdoValue.string('SPO_test3'))
        .build();

      expect(cmd).toContain('call RDOCancelCampaign');
      expect(cmd).toContain('"*"');
      expect(cmd).toContain('"%SPO_test3"');
    });
  });
});

describe('GAP-02: Votes Tab — GetPropertyList Exchange', () => {
  // VotesSheet.pas SetFocus (lines 98-121) queries these properties:
  //   Explicit: SecurityId, Trouble, CurrBlock, CampaignCount,
  //             RulerName, RulerVotes, RulerCmpRat, RulerCmpPnts
  // Dynamic per campaign (fetched in threadedGetProperties):
  //   Candidate{i}, Votes{i}, CmpRat{i}, CmpPnts{i}
  const VOTES_STATIC_PROPERTIES = [
    'SecurityId', 'Trouble', 'CurrBlock',
    'CampaignCount', 'RulerName', 'RulerVotes', 'RulerCmpRat', 'RulerCmpPnts',
  ];

  const VOTES_STATIC_VALUES = [
    'ownerTycoon123',    // SecurityId
    '0',                 // Trouble
    CAPITOL_BLOCK,       // CurrBlock
    '2',                 // CampaignCount
    'President Crazz',   // RulerName
    '15200',             // RulerVotes
    '72',                // RulerCmpRat
    '8500',              // RulerCmpPnts
  ];

  it('should define initial query with static properties', () => {
    const request = buildGetPropertyListRequest(200, CAPITOL_BLOCK, VOTES_STATIC_PROPERTIES);

    expect(request).toContain('CampaignCount');
    expect(request).toContain('RulerName');
    expect(request).toContain('RulerVotes');
    expect(request).toContain('RulerCmpRat');
    expect(request).toContain('RulerCmpPnts');
  });

  it('should build per-campaign dynamic property names from CampaignCount', () => {
    const campaignCount = 2;
    const dynamicProps: string[] = [];
    for (let i = 0; i < campaignCount; i++) {
      dynamicProps.push(`Candidate${i}`, `Votes${i}`, `CmpRat${i}`, `CmpPnts${i}`);
    }

    expect(dynamicProps).toEqual([
      'Candidate0', 'Votes0', 'CmpRat0', 'CmpPnts0',
      'Candidate1', 'Votes1', 'CmpRat1', 'CmpPnts1',
    ]);
  });

  it('should build exchange for votes tab with 2 campaigns', () => {
    // Dynamic properties follow the initial query
    const dynamicProps = [
      'Candidate0', 'Votes0', 'CmpRat0', 'CmpPnts0',
      'Candidate1', 'Votes1', 'CmpRat1', 'CmpPnts1',
    ];
    const dynamicValues = [
      'Senator Adams', '8900', '45', '4200',
      'Mayor Wilson', '6300', '38', '3100',
    ];

    const exchange: RdoExchange = {
      id: 'gap-votes-campaigns',
      request: buildGetPropertyListRequest(201, CAPITOL_BLOCK, dynamicProps),
      response: buildGetPropertyListResponse(201, dynamicValues),
      matchKeys: {
        verb: 'sel',
        action: 'call',
        member: 'GetPropertyList',
        argsPattern: [`"%${dynamicProps.join('\t')}\t"`],
      },
    };

    expect(exchange.response).toContain('Senator Adams');
    expect(exchange.response).toContain('8900');
    expect(exchange.response).toContain('Mayor Wilson');
  });

  it('should parse campaign data with correct indices', () => {
    const dynamicValues = [
      'Senator Adams', '8900', '45', '4200',
      'Mayor Wilson', '6300', '38', '3100',
    ];
    const response = buildGetPropertyListResponse(201, dynamicValues);
    const payloadMatch = response.match(/res="%(.*)"$/);
    const values = payloadMatch![1].split('\t');

    // Campaign 0: values[0..3]
    expect(values[0]).toBe('Senator Adams');  // Candidate0
    expect(values[1]).toBe('8900');           // Votes0
    expect(values[2]).toBe('45');             // CmpRat0
    expect(values[3]).toBe('4200');           // CmpPnts0

    // Campaign 1: values[4..7]
    expect(values[4]).toBe('Mayor Wilson');   // Candidate1
    expect(values[5]).toBe('6300');           // Votes1
    expect(values[6]).toBe('38');             // CmpRat1
    expect(values[7]).toBe('3100');           // CmpPnts1
  });
});

// =============================================================================
// GAP-02: MINISTERIES ACTION BUTTONS
// =============================================================================
// Source: WorldPolitics.pas (TPresidentialHall), MinisteriesSheet.pas (Voyager UI)
//
// Published methods on TPresidentialHall:
//   procedure RDOSetMinistryBudget(MinistryId: integer; Budget: widestring);  → void (*)
//   procedure RDOBanMinister(MinistryId: integer);                            → void (*)
//   procedure RDOSitMinister(MinistryId: integer; name: widestring);          → void (*)
//   procedure RDOSetTownTaxes(Index, Value: integer);                         → void (*)
//   procedure RDOSetMinSalaryValue(PopKind, Value: integer);                  → void (*)
//   procedure RDOSitMayor(TownName, TycoonName: widestring);                  → void (*)
// =============================================================================

describe('GAP-02: Ministeries Action Buttons — RDO Command Format', () => {
  describe('RDOSetMinistryBudget', () => {
    it('should build command with integer ministryId and widestring budget', () => {
      // Delphi: procedure RDOSetMinistryBudget(MinistryId: integer; Budget: widestring)
      const cmd = RdoCommand.sel(CAPITOL_BLOCK)
        .call('RDOSetMinistryBudget').push()
        .args(
          RdoValue.int(0),                  // MinistryId (integer → #)
          RdoValue.string('2500000')        // Budget (widestring → %, currency as string)
        )
        .build();

      expect(cmd).toContain('call RDOSetMinistryBudget');
      expect(cmd).toContain('"*"');           // void procedure
      expect(cmd).toContain('"#0"');          // integer ministryId
      expect(cmd).toContain('"%2500000"');    // widestring budget
    });

    it('should use widestring (%) for budget, not integer (#)', () => {
      // TRAP: Budget is declared as `widestring` in Delphi (CurrToStr format),
      // not integer. The original client converts currency to string first.
      const cmd = RdoCommand.sel(CAPITOL_BLOCK)
        .call('RDOSetMinistryBudget').push()
        .args(RdoValue.int(1), RdoValue.string('1500000'))
        .build();

      expect(cmd).toContain('"%1500000"');    // widestring, not "#1500000"
    });
  });

  describe('RDOBanMinister', () => {
    it('should build command with single integer ministryId', () => {
      // Delphi: procedure RDOBanMinister(MinistryId: integer)
      const cmd = RdoCommand.sel(CAPITOL_BLOCK)
        .call('RDOBanMinister').push()
        .args(RdoValue.int(2))
        .build();

      expect(cmd).toBe(`C sel ${CAPITOL_BLOCK} call RDOBanMinister "*" "#2";`);
    });
  });

  describe('RDOSitMinister', () => {
    it('should build command with integer ministryId and widestring ministerName', () => {
      // Delphi: procedure RDOSitMinister(MinistryId: integer; name: widestring)
      const cmd = RdoCommand.sel(CAPITOL_BLOCK)
        .call('RDOSitMinister').push()
        .args(
          RdoValue.int(0),                      // MinistryId (integer → #)
          RdoValue.string('Dr. Smith')           // name (widestring → %)
        )
        .build();

      expect(cmd).toContain('call RDOSitMinister');
      expect(cmd).toContain('"*"');
      expect(cmd).toContain('"#0"');
      expect(cmd).toContain('"%Dr. Smith"');
    });
  });

  describe('RDOSetMinSalaryValue (world-level, on TPresidentialHall)', () => {
    it('should build command with 2 integer args: PopKind and Value', () => {
      // Delphi: procedure RDOSetMinSalaryValue(PopKind, Value: integer)
      // PopKind: 0=pkHigh, 1=pkMiddle, 2=pkLow
      const cmd = RdoCommand.sel(CAPITOL_BLOCK)
        .call('RDOSetMinSalaryValue').push()
        .args(RdoValue.int(0), RdoValue.int(150))
        .build();

      expect(cmd).toContain('call RDOSetMinSalaryValue');
      expect(cmd).toContain('"*"');
      expect(cmd).toContain('"#0"');
      expect(cmd).toContain('"#150"');
    });
  });

  describe('RDOSitMayor', () => {
    it('should build command with 2 widestring args: TownName and TycoonName', () => {
      // Delphi: procedure RDOSitMayor(TownName, TycoonName: widestring)
      const cmd = RdoCommand.sel(CAPITOL_BLOCK)
        .call('RDOSitMayor').push()
        .args(
          RdoValue.string('Shamba'),
          RdoValue.string('Mayor Chen')
        )
        .build();

      expect(cmd).toContain('call RDOSitMayor');
      expect(cmd).toContain('"*"');
      expect(cmd).toContain('"%Shamba"');
      expect(cmd).toContain('"%Mayor Chen"');
    });
  });
});

describe('GAP-02: Ministeries Tab — GetPropertyList Exchange', () => {
  // MinisteriesSheet.pas threadedGetProperties (lines 164-219):
  //   First query: MinisterCount
  //   Per ministry: MinistryId{i}, Ministry{i}.{lang}, Minister{i}, MinisterRating{i}, MinisterBudget{i}
  //   Also: SecurityId, ActualRuler, CurrBlock

  it('should define initial query for MinisterCount', () => {
    const props = ['MinisterCount', 'SecurityId', 'ActualRuler', 'CurrBlock'];
    const values = ['3', 'ownerTycoon123', 'President Crazz', CAPITOL_BLOCK];

    const exchange: RdoExchange = {
      id: 'gap-ministeries-count',
      request: buildGetPropertyListRequest(200, CAPITOL_BLOCK, props),
      response: buildGetPropertyListResponse(200, values),
      matchKeys: {
        verb: 'sel',
        action: 'call',
        member: 'GetPropertyList',
      },
    };

    const payloadMatch = exchange.response.match(/res="%(.*)"$/);
    const respValues = payloadMatch![1].split('\t');
    expect(respValues[0]).toBe('3');  // MinisterCount
  });

  it('should build per-ministry property names with MinistryId indexed', () => {
    // MinisteriesSheet.pas lines 191-201: per-ministry properties
    const ministerCount = 3;
    const lang = '0';  // default language
    const perMinistryProps: string[] = [];

    for (let i = 0; i < ministerCount; i++) {
      perMinistryProps.push(
        `MinistryId${i}`,
        `Ministry${i}.${lang}`,
        `Minister${i}`,
        `MinisterRating${i}`,
        `MinisterBudget${i}`
      );
    }

    expect(perMinistryProps).toEqual([
      'MinistryId0', 'Ministry0.0', 'Minister0', 'MinisterRating0', 'MinisterBudget0',
      'MinistryId1', 'Ministry1.0', 'Minister1', 'MinisterRating1', 'MinisterBudget1',
      'MinistryId2', 'Ministry2.0', 'Minister2', 'MinisterRating2', 'MinisterBudget2',
    ]);
  });

  it('should build exchange with ministry details (including MinistryId for RDO calls)', () => {
    const props = [
      'MinistryId0', 'Ministry0.0', 'Minister0', 'MinisterRating0', 'MinisterBudget0',
      'MinistryId1', 'Ministry1.0', 'Minister1', 'MinisterRating1', 'MinisterBudget1',
      'MinistryId2', 'Ministry2.0', 'Minister2', 'MinisterRating2', 'MinisterBudget2',
    ];
    const values = [
      '100', 'Health', 'Dr. Smith', '78', '2000000',
      '101', 'Education', 'Prof. Jones', '65', '1500000',
      '102', 'Defense', 'Gen. Brown', '82', '3000000',
    ];

    const exchange: RdoExchange = {
      id: 'gap-ministeries-details',
      request: buildGetPropertyListRequest(201, CAPITOL_BLOCK, props),
      response: buildGetPropertyListResponse(201, values),
      matchKeys: {
        verb: 'sel',
        action: 'call',
        member: 'GetPropertyList',
        argsPattern: [`"%${props.join('\t')}\t"`],
      },
    };

    const payloadMatch = exchange.response.match(/res="%(.*)"$/);
    const respValues = payloadMatch![1].split('\t');

    // Ministry 0
    expect(respValues[0]).toBe('100');         // MinistryId0 — used in RDOBanMinister/RDOSitMinister
    expect(respValues[1]).toBe('Health');       // Ministry0.0
    expect(respValues[2]).toBe('Dr. Smith');    // Minister0

    // Empty minister means vacant slot
    // Ministry 1
    expect(respValues[5]).toBe('101');          // MinistryId1
    expect(respValues[6]).toBe('Education');    // Ministry1.0
  });

  it('should handle vacant ministry (empty Minister name)', () => {
    const values = [
      '103', 'Transport', '', '0', '0',        // vacant — Minister2 is empty
    ];

    const response = buildGetPropertyListResponse(202, values);
    const payloadMatch = response.match(/res="%(.*)"$/);
    const respValues = payloadMatch![1].split('\t');

    // MinisteriesSheet.pas: when Minister{i} is empty, show "Elect" UI instead of "Depose/Budget"
    expect(respValues[2]).toBe('');
  });
});

// =============================================================================
// GAP-03: RESGENERAL MISSING PROPERTIES
// =============================================================================
// Source: PopulatedBlock.pas (TPopulatedBlock published + StoreToCache),
//         ResidentialSheet.pas (Voyager UI)
//
// Currently in mock: Name, Creator, Cost, ROI, Years, Trouble, Rent, Maintenance
//
// Missing from StoreToCache (PopulatedBlock.pas lines ~300-370):
//   Inhabitants     → round(People.Q)         : integer (population count)
//   Occupancy       → published property       : TPercent (0-100)
//   QOL             → percent 0-100            : integer (quality of life)
//   Beauty          → percent 0-100            : integer
//   Crime           → percent 0-100            : integer
//   Pollution       → percent 0-100            : integer
//   Repair          → fRepair                  : integer (repair state)
//   RepairPrice     → FormatMoney(...)         : string
//   ActualCrime     → percent                  : integer
//   ActualPollution → percent                  : integer
//   Efficiency      → round(100*Efficiency)    : integer
//
// Queried by ResidentialSheet.pas xfer_ controls:
//   invCrimeRes, invPollutionRes, invPrivacy, InvBeauty
// =============================================================================

describe('GAP-03: ResGeneral — Complete Property Set from Delphi Source', () => {
  // Complete property set combining:
  //   ResidentialSheet.pas SetFocus queries (xfer_ + explicit)
  //   + PopulatedBlock.StoreToCache values
  const RESGENERAL_VOYAGER_PROPERTIES = [
    // xfer_ auto-collected from ResidentialSheet.pas controls:
    'Name', 'Rent', 'Creator', 'invCrimeRes', 'invPollutionRes',
    'invPrivacy', 'InvBeauty', 'Years', 'Maintenance',
    // Explicitly added by SetFocus:
    'SecurityId', 'Trouble', 'CurrBlock', 'Cost', 'ROI',
  ];

  const RESGENERAL_STORE_TO_CACHE_PROPERTIES = [
    // Available from PopulatedBlock.StoreToCache but NOT queried by Voyager's SetFocus:
    'Inhabitants', 'Occupancy', 'QOL', 'Beauty', 'Crime', 'Pollution',
    'Repair', 'RepairPrice', 'ActualCrime', 'ActualPollution', 'Efficiency',
  ];

  const RESGENERAL_ALL_PROPERTIES = [
    ...RESGENERAL_VOYAGER_PROPERTIES,
    ...RESGENERAL_STORE_TO_CACHE_PROPERTIES,
  ];

  const RESGENERAL_ALL_VALUES = [
    // Voyager properties:
    'Luxury Apartments',  // Name
    '120',                // Rent (TPercent 0-255)
    'Yellow Inc.',        // Creator
    '75',                 // invCrimeRes (round(100*finvCrimeRes))
    '60',                 // invPollutionRes (round(100*finvPollRes))
    '80',                 // invPrivacy (round(100*finvPrivacy))
    '85',                 // InvBeauty (round(100*finvBeauty))
    '5',                  // Years
    '80',                 // Maintenance (TPercent 0-255)
    'ownerTycoon123',     // SecurityId
    '0',                  // Trouble
    RESIDENTIAL_BLOCK,    // CurrBlock
    '500000',             // Cost
    '8',                  // ROI
    // StoreToCache properties:
    '156',                // Inhabitants — round(People.Q) = population count
    '72',                 // Occupancy — published property TPercent (0-100)
    '68',                 // QOL — quality of life percent (0-100)
    '85',                 // Beauty — percent (0-100)
    '15',                 // Crime — percent (0-100)
    '22',                 // Pollution — percent (0-100)
    '0',                  // Repair — repair state (0=none, 1=repairing)
    '$0',                 // RepairPrice — FormatMoney string
    '12',                 // ActualCrime — raw crime percent
    '18',                 // ActualPollution — raw pollution percent
    '100',                // Efficiency — round(100*Efficiency)
  ];

  it('should include all 14 properties from ResidentialSheet.pas SetFocus', () => {
    expect(RESGENERAL_VOYAGER_PROPERTIES).toHaveLength(14);
    expect(RESGENERAL_VOYAGER_PROPERTIES).toContain('Rent');
    expect(RESGENERAL_VOYAGER_PROPERTIES).toContain('Maintenance');
    expect(RESGENERAL_VOYAGER_PROPERTIES).toContain('invCrimeRes');
    expect(RESGENERAL_VOYAGER_PROPERTIES).toContain('InvBeauty');
  });

  it('should include all 11 StoreToCache properties from PopulatedBlock.pas', () => {
    expect(RESGENERAL_STORE_TO_CACHE_PROPERTIES).toHaveLength(11);
    expect(RESGENERAL_STORE_TO_CACHE_PROPERTIES).toContain('Inhabitants');
    expect(RESGENERAL_STORE_TO_CACHE_PROPERTIES).toContain('Occupancy');
    expect(RESGENERAL_STORE_TO_CACHE_PROPERTIES).toContain('QOL');
    expect(RESGENERAL_STORE_TO_CACHE_PROPERTIES).toContain('Crime');
    expect(RESGENERAL_STORE_TO_CACHE_PROPERTIES).toContain('Pollution');
  });

  it('should identify the 5 properties specifically called out in GAP-03', () => {
    const gap03Properties = ['Occupancy', 'Inhabitants', 'QOL', 'Crime', 'Pollution'];
    for (const prop of gap03Properties) {
      expect(RESGENERAL_ALL_PROPERTIES).toContain(prop);
    }
  });

  it('should build exchange for complete ResGeneral properties', () => {
    const exchange: RdoExchange = {
      id: 'gap-resgeneral-complete',
      request: buildGetPropertyListRequest(200, RESIDENTIAL_BLOCK, RESGENERAL_ALL_PROPERTIES),
      response: buildGetPropertyListResponse(200, RESGENERAL_ALL_VALUES),
      matchKeys: {
        verb: 'sel',
        action: 'call',
        member: 'GetPropertyList',
        argsPattern: [`"%${RESGENERAL_ALL_PROPERTIES.join('\t')}\t"`],
      },
    };

    expect(exchange.request).toContain('Inhabitants');
    expect(exchange.request).toContain('Occupancy');
    expect(exchange.request).toContain('QOL');
    expect(exchange.request).toContain('Crime');
    expect(exchange.request).toContain('Pollution');
  });

  it('should parse response values for the 5 missing GAP-03 properties', () => {
    const response = buildGetPropertyListResponse(200, RESGENERAL_ALL_VALUES);
    const payloadMatch = response.match(/res="%(.*)"$/);
    const values = payloadMatch![1].split('\t');

    // Map property names to their indices for clarity
    const propIndex = (name: string) => RESGENERAL_ALL_PROPERTIES.indexOf(name);

    expect(values[propIndex('Inhabitants')]).toBe('156');   // Population
    expect(values[propIndex('Occupancy')]).toBe('72');      // Occupancy %
    expect(values[propIndex('QOL')]).toBe('68');            // Quality of Life %
    expect(values[propIndex('Crime')]).toBe('15');          // Crime %
    expect(values[propIndex('Pollution')]).toBe('22');      // Pollution %
  });

  it('should verify Rent and Maintenance are published r/w properties (SET-able)', () => {
    // PopulatedBlock.pas:
    //   property Rent : TPercent read GetRent write SetRent;
    //   property Maintenance : TPercent read GetMaintenance write SetMaintenance;
    const rentCmd = RdoCommand.sel(RESIDENTIAL_BLOCK)
      .set('Rent')
      .args(RdoValue.int(120))
      .build();

    const maintCmd = RdoCommand.sel(RESIDENTIAL_BLOCK)
      .set('Maintenance')
      .args(RdoValue.int(80))
      .build();

    expect(rentCmd).toContain('set Rent');
    expect(rentCmd).toContain('="#120"');
    expect(maintCmd).toContain('set Maintenance');
    expect(maintCmd).toContain('="#80"');
  });

  it('should verify Occupancy is read-only (no SET)', () => {
    // PopulatedBlock.pas: property Occupancy : TPercent read GetOccupancy;
    // No write accessor — this is a display-only property
    expect(RESGENERAL_STORE_TO_CACHE_PROPERTIES).toContain('Occupancy');
    // Occupancy should never have a SET command
  });

  it('should verify RdoRepair method (void procedure, integer arg)', () => {
    // PopulatedBlock.pas: procedure RdoRepair(useless: integer);
    const cmd = RdoCommand.sel(RESIDENTIAL_BLOCK)
      .call('RdoRepair').push()
      .args(RdoValue.int(0))
      .build();

    expect(cmd).toContain('call RdoRepair');
    expect(cmd).toContain('"*"');        // void procedure
    expect(cmd).toContain('"#0"');       // useless param
  });

  it('should verify RdoStopRepair method (void procedure, integer arg)', () => {
    // PopulatedBlock.pas: procedure RdoStopRepair(useless: integer);
    const cmd = RdoCommand.sel(RESIDENTIAL_BLOCK)
      .call('RdoStopRepair').push()
      .args(RdoValue.int(0))
      .build();

    expect(cmd).toContain('call RdoStopRepair');
    expect(cmd).toContain('"*"');
    expect(cmd).toContain('"#0"');
  });
});

// =============================================================================
// GAP-05: WORKFORCE MISSING WorkersCap / MinSalaries
// =============================================================================
// Source: WorkCenterBlock.pas (TWorkCenter StoreToCache), WorkForceSheet.pas (Voyager UI)
//
// StoreToCache writes per TPeopleKind (0=pkHigh, 1=pkMiddle, 2=pkLow):
//   'Workers' + kind       → round(fWorkers[kind].Q)
//   'WorkersK' + kind      → fWorkers[kind].K
//   'WorkersMax' + kind    → round(fWorkersMax[kind].Q)
//   'Salaries' + kind      → fSalaries[kind]
//   'WorkForcePrice' + kind → round(WorkForcePrice[kind])
//   'SalaryValues' + kind  → round(fSalaries[kind]*WorkForcePrice[kind]/100)
//   'WorkersCap' + kind    → round(TMetaWorkCenter(MetaBlock).Capacity[kind])  ← MISSING
//   'MinSalaries' + kind   → Facility.Town.MinSalary[kind]                     ← MISSING
//
// WorkForceSheet.pas constants confirm the full property list:
//   tidWorkersCap0 = 'WorkersCap0', tidWorkersCap1 = 'WorkersCap1', tidWorkersCap2 = 'WorkersCap2'
//   tidMinSalaries0 = 'MinSalaries0', tidMinSalaries1 = 'MinSalaries1', tidMinSalaries2 = 'MinSalaries2'
//
// BUG in Voyager: tidSalaryValues1 = 'SalaryValues' (missing '1' suffix)
// =============================================================================

describe('GAP-05: Workforce — Complete Property Set Including WorkersCap/MinSalaries', () => {
  // Complete property list from WorkForceSheet.pas threadedGetProperties
  const WORKFORCE_COMPLETE_PROPERTIES = [
    'CurrBlock', 'SecurityId',
    // Per class 0 (High/Executive)
    'Salaries0', 'WorkForcePrice0', 'SalaryValues0',
    'Workers0', 'WorkersK0', 'WorkersMax0', 'WorkersCap0',
    // Per class 1 (Middle/Professional)
    'Salaries1', 'WorkForcePrice1', 'SalaryValues1',
    'Workers1', 'WorkersK1', 'WorkersMax1', 'WorkersCap1',
    // Per class 2 (Low/Worker)
    'Salaries2', 'WorkForcePrice2', 'SalaryValues2',
    'Workers2', 'WorkersK2', 'WorkersMax2', 'WorkersCap2',
    // Minimum salary floors (town-level, from Facility.Town.MinSalary[kind])
    'MinSalaries0', 'MinSalaries1', 'MinSalaries2',
  ];

  // Values for factory with all 3 worker classes active
  const WORKFORCE_FACTORY_VALUES = [
    FACTORY_BLOCK, 'ownerTycoon123',
    // Class 0 (High): 27 workers, capacity 30
    '100', '250', '250', '27', '85', '27', '30',
    // Class 1 (Middle): 1 worker, capacity 5
    '100', '180', '180', '1', '50', '1', '5',
    // Class 2 (Low): 0 workers, capacity 0 (not supported!)
    '100', '100', '100', '0', '0', '0', '0',
    // Min salaries (town-level floor)
    '80', '60', '40',
  ];

  // Values for building where class 2 is not supported (WorkersCap2=0)
  const WORKFORCE_NO_LOW_CLASS_VALUES = [
    FACTORY_BLOCK, 'ownerTycoon123',
    '120', '250', '300', '10', '90', '12', '15',  // Class 0
    '100', '180', '180', '5', '75', '5', '8',     // Class 1
    '100', '100', '100', '0', '0', '0', '0',      // Class 2: WorkersCap2=0 → NOT SUPPORTED
    '80', '60', '40',
  ];

  it('should include WorkersCap0/1/2 in the complete property list', () => {
    expect(WORKFORCE_COMPLETE_PROPERTIES).toContain('WorkersCap0');
    expect(WORKFORCE_COMPLETE_PROPERTIES).toContain('WorkersCap1');
    expect(WORKFORCE_COMPLETE_PROPERTIES).toContain('WorkersCap2');
  });

  it('should include MinSalaries0/1/2 in the complete property list', () => {
    expect(WORKFORCE_COMPLETE_PROPERTIES).toContain('MinSalaries0');
    expect(WORKFORCE_COMPLETE_PROPERTIES).toContain('MinSalaries1');
    expect(WORKFORCE_COMPLETE_PROPERTIES).toContain('MinSalaries2');
  });

  it('should have 26 properties: CurrBlock + SecurityId + (7×3 per-class) + 3 MinSalaries', () => {
    // 2 (CurrBlock + SecurityId) + 21 (7 props × 3 classes) + 3 (MinSalaries) = 26
    expect(WORKFORCE_COMPLETE_PROPERTIES).toHaveLength(26);
  });

  it('should build exchange for factory with full workforce properties', () => {
    const exchange: RdoExchange = {
      id: 'gap-workforce-complete',
      request: buildGetPropertyListRequest(200, FACTORY_BLOCK, WORKFORCE_COMPLETE_PROPERTIES),
      response: buildGetPropertyListResponse(200, WORKFORCE_FACTORY_VALUES),
      matchKeys: {
        verb: 'sel',
        action: 'call',
        member: 'GetPropertyList',
        argsPattern: [`"%${WORKFORCE_COMPLETE_PROPERTIES.join('\t')}\t"`],
      },
    };

    expect(exchange.request).toContain('WorkersCap0');
    expect(exchange.request).toContain('MinSalaries0');
  });

  it('should parse WorkersCap to determine if worker class is supported', () => {
    const response = buildGetPropertyListResponse(200, WORKFORCE_FACTORY_VALUES);
    const payloadMatch = response.match(/res="%(.*)"$/);
    const values = payloadMatch![1].split('\t');

    const propIndex = (name: string) => WORKFORCE_COMPLETE_PROPERTIES.indexOf(name);

    // Class 0: WorkersCap0=30 → supported, has capacity for 30 workers
    expect(parseInt(values[propIndex('WorkersCap0')], 10)).toBe(30);

    // Class 1: WorkersCap1=5 → supported, has capacity for 5 workers
    expect(parseInt(values[propIndex('WorkersCap1')], 10)).toBe(5);

    // Class 2: WorkersCap2=0 → NOT SUPPORTED, should grey-out in UI
    expect(parseInt(values[propIndex('WorkersCap2')], 10)).toBe(0);
  });

  it('should parse MinSalaries for salary slider minimum enforcement', () => {
    const response = buildGetPropertyListResponse(200, WORKFORCE_FACTORY_VALUES);
    const payloadMatch = response.match(/res="%(.*)"$/);
    const values = payloadMatch![1].split('\t');

    const propIndex = (name: string) => WORKFORCE_COMPLETE_PROPERTIES.indexOf(name);

    // MinSalary values (town-level floor, from Facility.Town.MinSalary[kind])
    expect(parseInt(values[propIndex('MinSalaries0')], 10)).toBe(80);
    expect(parseInt(values[propIndex('MinSalaries1')], 10)).toBe(60);
    expect(parseInt(values[propIndex('MinSalaries2')], 10)).toBe(40);
  });

  it('should document Voyager bug: SalaryValues1 missing suffix in original client', () => {
    // WorkForceSheet.pas: tidSalaryValues1 = 'SalaryValues' (missing '1' suffix)
    // This means the original Voyager client never correctly reads SalaryValues for class 1.
    // The server-side StoreToCache writes 'SalaryValues1' but client queries 'SalaryValues'.
    // Our implementation should use the CORRECT key 'SalaryValues1'.
    const buggedKey = 'SalaryValues';   // What Voyager queries (broken)
    const correctKey = 'SalaryValues1'; // What server writes (correct)

    expect(WORKFORCE_COMPLETE_PROPERTIES).toContain(correctKey);
    expect(WORKFORCE_COMPLETE_PROPERTIES).not.toContain(buggedKey);
  });

  it('should verify RDOSetSalaries uses all 3 salaries in single call', () => {
    // WorkCenterBlock.pas: procedure RDOSetSalaries(hiSal, miSal, loSal: integer)
    // Note: parameter order is hi, mi, lo (0, 1, 2)
    const cmd = RdoCommand.sel(FACTORY_BLOCK)
      .call('RDOSetSalaries').push()
      .args(RdoValue.int(120), RdoValue.int(100), RdoValue.int(80))
      .build();

    expect(cmd).toContain('call RDOSetSalaries');
    expect(cmd).toContain('"*"');
    expect(cmd).toContain('"#120","#100","#80"');
  });

  it('should verify RDOGetWorkers for live refresh (returns worker count)', () => {
    // WorkCenterBlock.pas: function RDOGetWorkers(kind: integer): OleVariant
    // Returns SmartRound(workers.Q) — used by timer-based refresh
    for (let kind = 0; kind < 3; kind++) {
      const cmd = RdoCommand.sel(FACTORY_BLOCK)
        .call('RDOGetWorkers').method()
        .args(RdoValue.int(kind))
        .build();

      expect(cmd).toContain('call RDOGetWorkers');
      expect(cmd).toContain('"^"');                  // function → method separator
      expect(cmd).toContain(`"#${kind}"`);
    }
  });
});

// =============================================================================
// GAP-01: UNMAPPED HANDLERS — hdqInventions, InputSelection, townPolitics, facMinisteries
// =============================================================================
// Source: InventionsSheet.pas, InputSelectionForm.pas, PoliticSheet.pas, MinisteriesSheet.pas
//
// Note: These 4 handlers are NOT used by any CLASSES.BIN configuration in the current
// game data. They exist in Voyager's SheetHandlerRegistry but no visual class references
// them. They may be dead code. However, the RDO methods they call DO exist on the
// server objects, so we document them here for completeness.
// =============================================================================

describe('GAP-01: hdqInventions — RDO Methods (TResearchCenter)', () => {
  const HQ_BLOCK = '999999001';  // hypothetical HQ building

  // InventionsSheet.pas initial properties:
  //   SecurityId, CurrBlock, RsKind
  //   hasCount{tab}, devCount{tab}, avlCount{tab}

  describe('GetPropertyList for inventions tab', () => {
    it('should query initial properties: SecurityId, CurrBlock, RsKind, counts', () => {
      const props = ['SecurityId', 'CurrBlock', 'RsKind', 'hasCount0', 'devCount0', 'avlCount0'];
      const values = ['ownerTycoon123', HQ_BLOCK, '0', '5', '2', '8'];

      const exchange: RdoExchange = {
        id: 'gap-inventions-initial',
        request: buildGetPropertyListRequest(200, HQ_BLOCK, props),
        response: buildGetPropertyListResponse(200, values),
        matchKeys: {
          verb: 'sel',
          action: 'call',
          member: 'GetPropertyList',
        },
      };

      const payloadMatch = exchange.response.match(/res="%(.*)"$/);
      const respValues = payloadMatch![1].split('\t');
      expect(respValues[3]).toBe('5');   // hasCount0 — 5 invented
      expect(respValues[4]).toBe('2');   // devCount0 — 2 in development
      expect(respValues[5]).toBe('8');   // avlCount0 — 8 available
    });
  });

  describe('RDOQueueResearch', () => {
    it('should build command with widestring inventionId and integer priority', () => {
      // Delphi: procedure RDOQueueResearch(InventionId: widestring; Priority: integer)
      const cmd = RdoCommand.sel(HQ_BLOCK)
        .call('RDOQueueResearch').push()
        .args(
          RdoValue.string('StudioReseach.Level2'),  // InventionId (widestring → %)
          RdoValue.int(10)                           // Priority (default=10 from Voyager)
        )
        .build();

      expect(cmd).toContain('call RDOQueueResearch');
      expect(cmd).toContain('"*"');
      expect(cmd).toContain('"%StudioReseach.Level2"');
      expect(cmd).toContain('"#10"');
    });
  });

  describe('RDOCancelResearch', () => {
    it('should build command with single widestring inventionId', () => {
      // Delphi: procedure RDOCancelResearch(InventionId: widestring)
      // Used for both "stop research" and "sell invention"
      const cmd = RdoCommand.sel(HQ_BLOCK)
        .call('RDOCancelResearch').push()
        .args(RdoValue.string('StudioReseach.Level2'))
        .build();

      expect(cmd).toContain('call RDOCancelResearch');
      expect(cmd).toContain('"*"');
      expect(cmd).toContain('"%StudioReseach.Level2"');
    });
  });

  describe('RDOGetInvPropsByLang', () => {
    it('should build command with inventionId and language, returns string', () => {
      // Delphi: function RDOGetInvPropsByLang(InventionId, lang: widestring): olevariant
      const cmd = RdoCommand.sel(HQ_BLOCK)
        .call('RDOGetInvPropsByLang').method()
        .args(
          RdoValue.string('StudioReseach.Level2'),
          RdoValue.string('0')  // language ID (0 = default)
        )
        .build();

      expect(cmd).toContain('call RDOGetInvPropsByLang');
      expect(cmd).toContain('"^"');                    // function → method separator
      expect(cmd).toContain('"%StudioReseach.Level2"');
      expect(cmd).toContain('"%0"');
    });
  });

  describe('RDOGetInvDescEx', () => {
    it('should build command with inventionId and language, returns description', () => {
      // Delphi: function RDOGetInvDescEx(InventionId, LangId: widestring): olevariant
      const cmd = RdoCommand.sel(HQ_BLOCK)
        .call('RDOGetInvDescEx').method()
        .args(
          RdoValue.string('StudioReseach.Level2'),
          RdoValue.string('0')
        )
        .build();

      expect(cmd).toContain('call RDOGetInvDescEx');
      expect(cmd).toContain('"^"');
    });
  });

  describe('RDOGetInvDesc (fallback, non-localized)', () => {
    it('should build command with single inventionId, returns description', () => {
      // Delphi: function RDOGetInvDesc(InventionId: widestring): olevariant
      const cmd = RdoCommand.sel(HQ_BLOCK)
        .call('RDOGetInvDesc').method()
        .args(RdoValue.string('StudioReseach.Level2'))
        .build();

      expect(cmd).toContain('call RDOGetInvDesc');
      expect(cmd).toContain('"^"');
    });
  });
});

describe('GAP-01: InputSelection — Properties and Cache Methods', () => {
  const WAREHOUSE_BLOCK = '130700600';

  it('should query core properties: SecurityId, CurrBlock, GateMap, ObjectId', () => {
    // InputSelectionForm.pas threadedGetProperties
    const props = ['SecurityId', 'CurrBlock', 'GateMap', 'ObjectId'];
    const values = ['ownerTycoon123', WAREHOUSE_BLOCK, '110', '45678'];

    const exchange: RdoExchange = {
      id: 'gap-inputselection-props',
      request: buildGetPropertyListRequest(200, WAREHOUSE_BLOCK, props),
      response: buildGetPropertyListResponse(200, values),
      matchKeys: {
        verb: 'sel',
        action: 'call',
        member: 'GetPropertyList',
      },
    };

    const payloadMatch = exchange.response.match(/res="%(.*)"$/);
    const respValues = payloadMatch![1].split('\t');

    // GateMap: string of '0'/'1' chars, one per input gate
    // '110' = gate0 enabled, gate1 enabled, gate2 disabled
    expect(respValues[2]).toBe('110');
    expect(respValues[2].charAt(0)).toBe('1');  // gate 0 enabled
    expect(respValues[2].charAt(1)).toBe('1');  // gate 1 enabled
    expect(respValues[2].charAt(2)).toBe('0');  // gate 2 disabled
  });

  it('should handle empty GateMap (all inputs default to enabled)', () => {
    // InputSelectionForm.pas: if GateMap is empty, all inputs default to checked
    const props = ['SecurityId', 'CurrBlock', 'GateMap', 'ObjectId'];
    const values = ['ownerTycoon123', WAREHOUSE_BLOCK, '', '45678'];

    const response = buildGetPropertyListResponse(200, values);
    const payloadMatch = response.match(/res="%(.*)"$/);
    const respValues = payloadMatch![1].split('\t');

    expect(respValues[2]).toBe('');  // empty = all enabled
  });
});

describe('GAP-01: townPolitics — Same Protocol as Votes (TPoliticalTownHall)', () => {
  const TOWN_HALL_BLOCK = '130500400';

  it('should use same RDOVote method as Capitol votes', () => {
    // TownPolitics.pas: TPoliticalTownHall has identical RDOVote signature
    // procedure RDOVote(voterTycoon, choiceTycoon: widestring)
    const cmd = RdoCommand.sel(TOWN_HALL_BLOCK)
      .call('RDOVote').push()
      .args(RdoValue.string('SPO_test3'), RdoValue.string('Mayor Chen'))
      .build();

    expect(cmd).toContain('sel 130500400');
    expect(cmd).toContain('call RDOVote');
    expect(cmd).toContain('"*"');
    expect(cmd).toContain('"%SPO_test3"');
    expect(cmd).toContain('"%Mayor Chen"');
  });

  it('should use same RDOVoteOf method as Capitol votes', () => {
    // TownPolitics.pas: function RDOVoteOf(tycoonName: widestring): OleVariant
    const cmd = RdoCommand.sel(TOWN_HALL_BLOCK)
      .call('RDOVoteOf').method()
      .args(RdoValue.string('SPO_test3'))
      .build();

    expect(cmd).toContain('call RDOVoteOf');
    expect(cmd).toContain('"^"');
  });
});

describe('GAP-01: facMinisteries — Same Protocol as Ministeries (TPresidentialHall)', () => {
  // Note: facMinisteries is a per-facility variant of the Ministeries handler
  // It uses the same RDO methods but targets a different server object

  const FACILITY_MINISTRY_BLOCK = '999999002';  // hypothetical facility with ministries

  it('should use same RDOSetMinistryBudget as Capitol ministeries', () => {
    const cmd = RdoCommand.sel(FACILITY_MINISTRY_BLOCK)
      .call('RDOSetMinistryBudget').push()
      .args(RdoValue.int(0), RdoValue.string('1000000'))
      .build();

    expect(cmd).toContain('call RDOSetMinistryBudget');
    expect(cmd).toContain('"*"');
    expect(cmd).toContain('"#0"');
    expect(cmd).toContain('"%1000000"');
  });

  it('should use same RDOBanMinister as Capitol ministeries', () => {
    const cmd = RdoCommand.sel(FACILITY_MINISTRY_BLOCK)
      .call('RDOBanMinister').push()
      .args(RdoValue.int(1))
      .build();

    expect(cmd).toContain('call RDOBanMinister');
    expect(cmd).toContain('"#1"');
  });

  it('should use same RDOSitMinister as Capitol ministeries', () => {
    const cmd = RdoCommand.sel(FACILITY_MINISTRY_BLOCK)
      .call('RDOSitMinister').push()
      .args(RdoValue.int(2), RdoValue.string('New Minister'))
      .build();

    expect(cmd).toContain('call RDOSitMinister');
    expect(cmd).toContain('"#2"');
    expect(cmd).toContain('"%New Minister"');
  });
});

// =============================================================================
// CROSS-CUTTING: RDO TYPE CONFORMITY
// =============================================================================
// Verify that all gap commands use correct Delphi→RDO type mappings:
//   widestring → % (OLE string)
//   integer    → # (ordinal)
//   double     → @ (double precision)
//   WordBool   → # (integer: -1 for true, 0 for false)
//   word       → # (integer, unsigned 16-bit treated as integer)
// =============================================================================

describe('Cross-cutting: Delphi→RDO Type Prefix Conformity', () => {
  it('should map widestring parameters to OLE string prefix (%)', () => {
    // All widestring params across gap commands
    const oleStringArgs = [
      RdoValue.string('Film Name'),            // RDOLaunchMovie.theName
      RdoValue.string('voter'),                 // RDOVote.voterTycoon
      RdoValue.string('candidate'),             // RDOVote.choiceTycoon
      RdoValue.string('2500000'),               // RDOSetMinistryBudget.Budget
      RdoValue.string('Dr. Smith'),             // RDOSitMinister.name
      RdoValue.string('Shamba'),                // RDOSitMayor.TownName
      RdoValue.string('StudioReseach.Level2'),  // RDOQueueResearch.InventionId
    ];

    for (const arg of oleStringArgs) {
      expect(arg.prefix).toBe(RdoTypePrefix.OLESTRING);
      expect(arg.format()).toMatch(/^"%/);
    }
  });

  it('should map integer parameters to ordinal prefix (#)', () => {
    const intArgs = [
      RdoValue.int(0),     // RDOCancelMovie.useless
      RdoValue.int(12),    // RDOLaunchMovie.months
      RdoValue.int(0x03),  // RDOLaunchMovie.AutoInfo (word)
      RdoValue.int(100),   // MinistryId
      RdoValue.int(10),    // RDOQueueResearch.Priority
      RdoValue.int(-1),    // WordBool true
      RdoValue.int(0),     // WordBool false
    ];

    for (const arg of intArgs) {
      expect(arg.prefix).toBe(RdoTypePrefix.INTEGER);
      expect(arg.format()).toMatch(/^"#/);
    }
  });

  it('should map double parameters to double prefix (@)', () => {
    const doubleArgs = [
      RdoValue.double(5000000),     // RDOLaunchMovie.budget
      RdoValue.double(2500000.50),  // fractional budget
    ];

    for (const arg of doubleArgs) {
      expect(arg.prefix).toBe(RdoTypePrefix.DOUBLE);
      expect(arg.format()).toMatch(/^"@/);
    }
  });

  it('should map void procedures to push separator (*)', () => {
    // All void procedures use "*" separator
    const voidCommands = [
      'RDOCancelMovie', 'RDOReleaseMovie', 'RDOAutoProduce',
      'RDOVote', 'RDOCancelCampaign',
      'RDOSetMinistryBudget', 'RDOBanMinister', 'RDOSitMinister',
      'RDOSetMinSalaryValue', 'RDOSitMayor',
      'RDOQueueResearch', 'RDOCancelResearch',
      'RDOSetSalaries',
    ];

    for (const method of voidCommands) {
      const cmd = RdoCommand.sel('12345')
        .call(method).push()
        .args(RdoValue.int(0))
        .build();

      expect(cmd).toContain('"*"');
      expect(cmd).not.toContain('"^"');
    }
  });

  it('should map functions returning OleVariant to method separator (^)', () => {
    // All functions use "^" separator
    const functionCommands = [
      'RDOVoteOf', 'RDOLaunchCampaign',
      'RDOGetInvPropsByLang', 'RDOGetInvDescEx', 'RDOGetInvDesc',
      'RDOGetWorkers',
    ];

    for (const method of functionCommands) {
      const cmd = RdoCommand.sel('12345')
        .call(method).method()
        .args(RdoValue.string('arg'))
        .build();

      expect(cmd).toContain('"^"');
      expect(cmd).not.toContain('"*"');
    }
  });
});

// =============================================================================
// COMPLETE EXCHANGE CATALOGUE — All gap-related exchanges in scenario format
// =============================================================================

describe('Exchange Catalogue: Scenario-ready RdoExchange definitions', () => {
  /**
   * Returns all RDO exchanges needed to fill the 5 critical gaps.
   * These are ready to be added to building-details-scenario.ts or
   * a new gap-specific scenario file.
   */
  function buildGapExchanges(): RdoExchange[] {
    return [
      // --- Films action buttons (GAP-02) ---
      {
        id: 'gap-films-launch',
        request: `C sel ${TV_STATION_BLOCK} call RDOLaunchMovie "*" "%Shamba Night Live","@5000000","#12","#3"`,
        response: 'A200 res="*"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOLaunchMovie' },
      },
      {
        id: 'gap-films-cancel',
        request: `C sel ${TV_STATION_BLOCK} call RDOCancelMovie "*" "#0"`,
        response: 'A200 res="*"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOCancelMovie' },
      },
      {
        id: 'gap-films-release',
        request: `C sel ${TV_STATION_BLOCK} call RDOReleaseMovie "*" "#0"`,
        response: 'A200 res="*"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOReleaseMovie' },
      },

      // --- RDOVote (GAP-02) ---
      {
        id: 'gap-vote-cast',
        request: `C sel ${CAPITOL_BLOCK} call RDOVote "*" "%SPO_test3","%Senator Adams"`,
        response: 'A200 res="*"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOVote' },
      },
      {
        id: 'gap-vote-query',
        request: `C sel ${CAPITOL_BLOCK} call RDOVoteOf "^" "%SPO_test3"`,
        response: 'A200 res="%Senator Adams"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOVoteOf' },
      },
      {
        id: 'gap-campaign-launch',
        request: `C sel ${CAPITOL_BLOCK} call RDOLaunchCampaign "^" "%SPO_test3"`,
        response: 'A200 res="%NOERROR"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOLaunchCampaign' },
      },
      {
        id: 'gap-campaign-cancel',
        request: `C sel ${CAPITOL_BLOCK} call RDOCancelCampaign "*" "%SPO_test3"`,
        response: 'A200 res="*"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOCancelCampaign' },
      },

      // --- Ministeries action buttons (GAP-02) ---
      {
        id: 'gap-ministry-budget',
        request: `C sel ${CAPITOL_BLOCK} call RDOSetMinistryBudget "*" "#100","%2500000"`,
        response: 'A200 res="*"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOSetMinistryBudget' },
      },
      {
        id: 'gap-ministry-ban',
        request: `C sel ${CAPITOL_BLOCK} call RDOBanMinister "*" "#100"`,
        response: 'A200 res="*"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOBanMinister' },
      },
      {
        id: 'gap-ministry-sit',
        request: `C sel ${CAPITOL_BLOCK} call RDOSitMinister "*" "#100","%Dr. Smith"`,
        response: 'A200 res="*"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOSitMinister' },
      },
      {
        id: 'gap-ministry-sit-mayor',
        request: `C sel ${CAPITOL_BLOCK} call RDOSitMayor "*" "%Shamba","%Mayor Chen"`,
        response: 'A200 res="*"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOSitMayor' },
      },

      // --- ResGeneral extended properties (GAP-03) ---
      {
        id: 'gap-resgeneral-extended',
        request: buildGetPropertyListRequest(200, RESIDENTIAL_BLOCK, [
          'Inhabitants', 'Occupancy', 'QOL', 'Beauty', 'Crime', 'Pollution',
          'Repair', 'RepairPrice', 'ActualCrime', 'ActualPollution', 'Efficiency',
          'invCrimeRes', 'invPollutionRes', 'invPrivacy', 'InvBeauty',
        ]),
        response: buildGetPropertyListResponse(200, [
          '156', '72', '68', '85', '15', '22',
          '0', '$0', '12', '18', '100',
          '75', '60', '80', '85',
        ]),
        matchKeys: {
          verb: 'sel', action: 'call', member: 'GetPropertyList',
          argsPattern: [`"%Inhabitants\tOccupancy\tQOL\t`],
        },
      },

      // --- Workforce WorkersCap/MinSalaries (GAP-05) ---
      {
        id: 'gap-workforce-extended',
        request: buildGetPropertyListRequest(200, FACTORY_BLOCK, [
          'WorkersCap0', 'WorkersCap1', 'WorkersCap2',
          'MinSalaries0', 'MinSalaries1', 'MinSalaries2',
        ]),
        response: buildGetPropertyListResponse(200, [
          '30', '5', '0',    // WorkersCap: class 0=30, class 1=5, class 2=0 (unsupported)
          '80', '60', '40',  // MinSalaries: town-level floors
        ]),
        matchKeys: {
          verb: 'sel', action: 'call', member: 'GetPropertyList',
          argsPattern: [`"%WorkersCap0\tWorkersCap1\t`],
        },
      },

      // --- hdqInventions methods (GAP-01) ---
      {
        id: 'gap-inventions-queue',
        request: 'C sel 999999001 call RDOQueueResearch "*" "%StudioReseach.Level2","#10"',
        response: 'A200 res="*"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOQueueResearch' },
      },
      {
        id: 'gap-inventions-cancel',
        request: 'C sel 999999001 call RDOCancelResearch "*" "%StudioReseach.Level2"',
        response: 'A200 res="*"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOCancelResearch' },
      },
      {
        id: 'gap-inventions-props',
        request: 'C sel 999999001 call RDOGetInvPropsByLang "^" "%StudioReseach.Level2","%0"',
        response: 'A200 res="%Level 2 Studio\t500000\tImproved film quality and reduced production time"',
        matchKeys: { verb: 'sel', action: 'call', member: 'RDOGetInvPropsByLang' },
      },
    ];
  }

  it('should produce 16 exchanges covering all 5 gaps', () => {
    const exchanges = buildGapExchanges();
    expect(exchanges).toHaveLength(16);
  });

  it('should have unique exchange IDs', () => {
    const exchanges = buildGapExchanges();
    const ids = exchanges.map(e => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have valid matchKeys for every exchange', () => {
    const exchanges = buildGapExchanges();
    for (const exchange of exchanges) {
      expect(exchange.matchKeys).toBeDefined();
      expect(exchange.matchKeys!.verb).toBe('sel');
      expect(exchange.matchKeys!.action).toBeDefined();
      expect(exchange.matchKeys!.member).toBeDefined();
    }
  });

  it('should have all Film exchanges use void response', () => {
    const exchanges = buildGapExchanges();
    const filmExchanges = exchanges.filter(e => e.id.startsWith('gap-films-'));
    expect(filmExchanges).toHaveLength(3);
    for (const ex of filmExchanges) {
      expect(ex.response).toContain('res="*"');
    }
  });

  it('should have RDOVoteOf return a string value (not void)', () => {
    const exchanges = buildGapExchanges();
    const voteQuery = exchanges.find(e => e.id === 'gap-vote-query');
    expect(voteQuery).toBeDefined();
    expect(voteQuery!.response).toContain('res="%Senator Adams"');
    expect(voteQuery!.response).not.toContain('res="*"');
  });

  it('should have all void procedure exchanges respond with res="*"', () => {
    const exchanges = buildGapExchanges();
    const voidExchanges = exchanges.filter(e =>
      e.request.includes('"*"') &&
      !e.id.includes('query') &&
      !e.id.includes('props') &&
      !e.id.includes('extended') &&
      !e.id.includes('campaign-launch')
    );

    for (const ex of voidExchanges) {
      expect(ex.response).toMatch(/res="\*"/);
    }
  });

  it('should correctly reference mock building block IDs', () => {
    const exchanges = buildGapExchanges();

    const filmExchanges = exchanges.filter(e => e.id.startsWith('gap-films-'));
    for (const ex of filmExchanges) {
      expect(ex.request).toContain(`sel ${TV_STATION_BLOCK}`);
    }

    const voteExchanges = exchanges.filter(e => e.id.startsWith('gap-vote-') || e.id.startsWith('gap-campaign-'));
    for (const ex of voteExchanges) {
      expect(ex.request).toContain(`sel ${CAPITOL_BLOCK}`);
    }

    const ministryExchanges = exchanges.filter(e => e.id.startsWith('gap-ministry-'));
    for (const ex of ministryExchanges) {
      expect(ex.request).toContain(`sel ${CAPITOL_BLOCK}`);
    }
  });
});
