/**
 * Scenario integrity tests for all 15 mock server scenario factory functions
 * and the scenario registry.
 */
import { describe, it, expect } from '@jest/globals';
import { WsMessageType } from '@/shared/types/message-types';
import { createAuthScenario } from './auth-scenario';
import { createWorldListScenario, AMERICA_WORLDS, ASIA_WORLDS } from './world-list-scenario';
import { createCompanyListScenario, CAPTURED_COMPANY } from './company-list-scenario';
import { createSelectCompanyScenario, CAPTURED_COOKIE } from './select-company-scenario';
import { createMapDataScenario, SAMPLE_SEGMENTS, SAMPLE_OBJECTS } from './map-data-scenario';
import { createServerBusyScenario } from './server-busy-scenario';
import { createSwitchFocusScenario, CAPTURED_FARM, CAPTURED_DRUG_STORE } from './switch-focus-scenario';
import { createRefreshObjectScenario } from './refresh-object-scenario';
import { createSetViewedAreaScenario } from './set-viewed-area-scenario';
import { createPickEventScenario } from './pick-event-scenario';
import { createOverlaysScenario } from './overlays-scenario';
import { createBuildMenuScenario, CAPTURED_BUILD_SUCCESS, CAPTURED_BUILD_DUPLICATE } from './build-menu-scenario';
import { createBuildRoadsScenario, CAPTURED_ROAD_BUILD } from './build-roads-scenario';
import { createMailScenario, CAPTURED_MAIL_SEND } from './mail-scenario';
import {
  createBuildingDetailsScenario,
  MOCK_FACTORY,
  MOCK_BANK,
  MOCK_TV_STATION,
  MOCK_CAPITOL,
  MOCK_TOWN_HALL,
  ALL_MOCK_BUILDINGS,
} from './building-details-scenario';
import { loadScenario, loadAll, SCENARIO_NAMES } from './scenario-registry';

// =============================================================================
// Scenario 1: auth
// =============================================================================

describe('auth scenario', () => {
  it('creates scenario with default variables', () => {
    const { ws, rdo } = createAuthScenario();
    expect(ws).toBeDefined();
    expect(rdo).toBeDefined();
    expect(ws.name).toBe('auth');
    expect(rdo.name).toBe('auth');
  });

  it('RDO has 5 exchanges (idof, OpenSession, MapSegaUser, LogonUser, EndSession)', () => {
    const { rdo } = createAuthScenario();
    expect(rdo.exchanges).toHaveLength(5);
    const members = rdo.exchanges.map(e => e.matchKeys?.member ?? e.matchKeys?.targetId);
    expect(members).toEqual([
      'DirectoryServer',
      'RDOOpenSession',
      'RDOMapSegaUser',
      'RDOLogonUser',
      'RDOEndSession',
    ]);
  });

  it('RDO exchanges contain correct matchKeys', () => {
    const { rdo } = createAuthScenario();
    expect(rdo.exchanges[0].matchKeys).toEqual({ verb: 'idof', targetId: 'DirectoryServer' });
    expect(rdo.exchanges[1].matchKeys).toEqual({ verb: 'sel', action: 'get', member: 'RDOOpenSession' });
    expect(rdo.exchanges[2].matchKeys).toEqual({ verb: 'sel', action: 'call', member: 'RDOMapSegaUser' });
    expect(rdo.exchanges[3].matchKeys).toEqual({ verb: 'sel', action: 'call', member: 'RDOLogonUser' });
    expect(rdo.exchanges[4].matchKeys).toEqual({ verb: 'sel', action: 'call', member: 'RDOEndSession' });
  });

  it('WS exchange has REQ_CONNECT_DIRECTORY request and RESP_CONNECT_SUCCESS response', () => {
    const { ws } = createAuthScenario();
    expect(ws.exchanges).toHaveLength(1);
    const exchange = ws.exchanges[0];
    expect(exchange.request.type).toBe(WsMessageType.REQ_CONNECT_DIRECTORY);
    expect(exchange.responses).toHaveLength(1);
    expect(exchange.responses[0].type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
  });

  it('variable override changes username in RDO exchanges', () => {
    const { rdo } = createAuthScenario({ username: 'TestPlayer' });
    const mapSegaUser = rdo.exchanges[2];
    expect(mapSegaUser.request).toContain('%TestPlayer');
    expect(mapSegaUser.request).not.toContain('%Crazz');
  });
});

// =============================================================================
// Scenario 2: world-list
// =============================================================================

describe('world-list scenario', () => {
  it('creates scenario with RDO and WS', () => {
    const { ws, rdo } = createWorldListScenario();
    expect(ws).toBeDefined();
    expect(rdo).toBeDefined();
    expect(ws.name).toBe('world-list');
    expect(rdo.name).toBe('world-list');
  });

  it('AMERICA_WORLDS has 3 worlds', () => {
    expect(AMERICA_WORLDS).toHaveLength(3);
  });

  it('ASIA_WORLDS has 9 worlds', () => {
    expect(ASIA_WORLDS).toHaveLength(9);
  });

  it('RDO response contains "Count=3" for America', () => {
    const { rdo } = createWorldListScenario();
    const americaExchange = rdo.exchanges.find(
      e => e.matchKeys?.argsPattern?.some(a => a.includes('America'))
    );
    expect(americaExchange).toBeDefined();
    expect(americaExchange!.response).toContain('Count=3');
  });

  it('RDO response contains "Count=9" for Asia', () => {
    const { rdo } = createWorldListScenario();
    const asiaExchange = rdo.exchanges.find(
      e => e.matchKeys?.argsPattern?.some(a => a.includes('Asia'))
    );
    expect(asiaExchange).toBeDefined();
    expect(asiaExchange!.response).toContain('Count=9');
  });

  it('WS response contains world list', () => {
    const { ws } = createWorldListScenario();
    expect(ws.exchanges).toHaveLength(1);
    const resp = ws.exchanges[0].responses[0] as unknown as Record<string, unknown>;
    expect(resp.type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
    const worlds = resp.worlds as Array<Record<string, unknown>>;
    expect(worlds).toBeDefined();
    expect(worlds.length).toBe(ASIA_WORLDS.length);
  });
});

// =============================================================================
// Scenario 3: company-list
// =============================================================================

describe('company-list scenario', () => {
  it('creates scenario with HTTP and WS', () => {
    const { ws, http } = createCompanyListScenario();
    expect(ws).toBeDefined();
    expect(http).toBeDefined();
    expect(ws.name).toBe('company-list');
    expect(http.name).toBe('company-list');
  });

  it('CAPTURED_COMPANY has correct name/id/ownerRole', () => {
    expect(CAPTURED_COMPANY.name).toBe('Yellow Inc.');
    expect(CAPTURED_COMPANY.id).toBe('28');
    expect(CAPTURED_COMPANY.ownerRole).toBe('Crazz');
  });

  it('HTTP has 3 exchanges (pleasewait, logonComplete, chooseCompany)', () => {
    const { http } = createCompanyListScenario();
    expect(http.exchanges).toHaveLength(3);
    expect(http.exchanges[0].urlPattern).toContain('pleasewait.asp');
    expect(http.exchanges[1].urlPattern).toContain('logonComplete.asp');
    expect(http.exchanges[2].urlPattern).toContain('chooseCompany.asp');
  });

  it('chooseCompany HTML contains company name and ID', () => {
    const { http } = createCompanyListScenario();
    const chooseCompany = http.exchanges[2];
    expect(chooseCompany.body).toContain('Yellow Inc.');
    expect(chooseCompany.body).toContain('companyId="28"');
  });

  it('variable override changes company name in HTML', () => {
    const { http } = createCompanyListScenario({ companyName: 'Red Corp.' });
    const chooseCompany = http.exchanges[2];
    expect(chooseCompany.body).toContain('Red Corp.');
    expect(chooseCompany.body).not.toContain('Yellow Inc.');
  });
});

// =============================================================================
// Scenario 4: select-company
// =============================================================================

describe('select-company scenario', () => {
  it('creates scenario with WS, RDO, HTTP', () => {
    const { ws, rdo, http } = createSelectCompanyScenario();
    expect(ws).toBeDefined();
    expect(rdo).toBeDefined();
    expect(http).toBeDefined();
  });

  it('RDO has EnableEvents, PickEvent, GetTycoonCookie exchanges', () => {
    const { rdo } = createSelectCompanyScenario();
    const members = rdo.exchanges.map(e => e.matchKeys?.member);
    expect(members).toContain('EnableEvents');
    expect(members).toContain('PickEvent');
    expect(members).toContain('GetTycoonCookie');
  });

  it('HTTP toolbar contains button links', () => {
    const { http } = createSelectCompanyScenario();
    const toolbar = http.exchanges.find(e => e.urlPattern.includes('toolbar'));
    expect(toolbar).toBeDefined();
    expect(toolbar!.body).toContain('btnBuild');
    expect(toolbar!.body).toContain('btnMail');
    expect(toolbar!.body).toContain('btnSearch');
  });

  it('WS has scheduledEvents (tycoon update, chat msg)', () => {
    const { ws } = createSelectCompanyScenario();
    expect(ws.scheduledEvents).toBeDefined();
    expect(ws.scheduledEvents!.length).toBeGreaterThanOrEqual(2);
    const eventTypes = ws.scheduledEvents!.map(e => e.event.type);
    expect(eventTypes).toContain(WsMessageType.EVENT_TYCOON_UPDATE);
    expect(eventTypes).toContain(WsMessageType.EVENT_CHAT_MSG);
  });

  it('CAPTURED_COOKIE has lastX and lastY coordinates', () => {
    expect(CAPTURED_COOKIE.lastX).toBe('467');
    expect(CAPTURED_COOKIE.lastY).toBe('395');
  });
});

// =============================================================================
// Scenario 5: map-data
// =============================================================================

describe('map-data scenario', () => {
  it('creates scenario with RDO', () => {
    const { rdo } = createMapDataScenario();
    expect(rdo).toBeDefined();
    expect(rdo.name).toBe('map-data');
  });

  it('SAMPLE_SEGMENTS is an array of segment data', () => {
    expect(Array.isArray(SAMPLE_SEGMENTS)).toBe(true);
    expect(SAMPLE_SEGMENTS.length).toBeGreaterThan(0);
    const first = SAMPLE_SEGMENTS[0];
    expect(first).toHaveProperty('x1');
    expect(first).toHaveProperty('y1');
    expect(first).toHaveProperty('x2');
    expect(first).toHaveProperty('y2');
    expect(first).toHaveProperty('leftTerrain');
    expect(first).toHaveProperty('rightTerrain');
  });

  it('SAMPLE_OBJECTS is an array of object data', () => {
    expect(Array.isArray(SAMPLE_OBJECTS)).toBe(true);
    expect(SAMPLE_OBJECTS.length).toBeGreaterThan(0);
    const first = SAMPLE_OBJECTS[0];
    expect(first).toHaveProperty('classId');
    expect(first).toHaveProperty('rotation');
    expect(first).toHaveProperty('visualClassId');
    expect(first).toHaveProperty('x');
    expect(first).toHaveProperty('y');
  });

  it('RDO ObjectsInArea response format is correct (groups of 5)', () => {
    const { rdo } = createMapDataScenario();
    // Find the ObjectsInArea exchange that returns actual objects
    const objectsExchange = rdo.exchanges.find(
      e => e.matchKeys?.member === 'ObjectsInArea' && e.response.includes('%')
        && e.response.length > 20
    );
    expect(objectsExchange).toBeDefined();
    // The response body after "res=%" should be groups of 5 numbers per object
    const body = objectsExchange!.response.split('res="%')[1];
    expect(body).toBeDefined();
    const lines = body!.replace(/"$/, '').split('\n').filter(l => l.length > 0);
    // Should be divisible by 5 (classId, rotation, visualClassId, x, y)
    expect(lines.length % 5).toBe(0);
  });

  it('RDO SegmentsInArea response format is correct (groups of 10)', () => {
    const { rdo } = createMapDataScenario();
    const segmentsExchange = rdo.exchanges.find(
      e => e.matchKeys?.member === 'SegmentsInArea'
    );
    expect(segmentsExchange).toBeDefined();
    const body = segmentsExchange!.response.split('res="%')[1];
    expect(body).toBeDefined();
    const lines = body!.replace(/\\n?"$/, '').replace(/\n"$/, '').split('\n').filter(l => l.length > 0);
    // Should be divisible by 10 (x1,y1,x2,y2,leftT,rightT,leftS,rightS,leftSA,rightSA)
    expect(lines.length % 10).toBe(0);
  });
});

// =============================================================================
// Scenario 6: server-busy
// =============================================================================

describe('server-busy scenario', () => {
  it('creates RDO with single exchange', () => {
    const { rdo } = createServerBusyScenario();
    expect(rdo.exchanges).toHaveLength(1);
  });

  it('response contains ServerBusy="#0"', () => {
    const { rdo } = createServerBusyScenario();
    expect(rdo.exchanges[0].response).toContain('ServerBusy="#0"');
  });
});

// =============================================================================
// Scenario 7: switch-focus
// =============================================================================

describe('switch-focus scenario', () => {
  it('CAPTURED_FARM has name "Farm 10" and ownerCompany "Yellow Inc."', () => {
    expect(CAPTURED_FARM.name).toBe('Farm 10');
    expect(CAPTURED_FARM.ownerCompany).toBe('Yellow Inc.');
  });

  it('CAPTURED_DRUG_STORE has name starting with number', () => {
    expect(CAPTURED_DRUG_STORE.name).toBe('10');
    expect(/^\d/.test(CAPTURED_DRUG_STORE.name)).toBe(true);
  });

  it('RDO has 2 SwitchFocusEx exchanges', () => {
    const { rdo } = createSwitchFocusScenario();
    const switchFocusExchanges = rdo.exchanges.filter(
      e => e.matchKeys?.member === 'SwitchFocusEx'
    );
    expect(switchFocusExchanges).toHaveLength(2);
  });
});

// =============================================================================
// Scenario 8: refresh-object
// =============================================================================

describe('refresh-object scenario', () => {
  it('creates scenario (no request, server push)', () => {
    const { rdo } = createRefreshObjectScenario();
    expect(rdo.exchanges).toHaveLength(1);
    // Server push has empty request
    expect(rdo.exchanges[0].request).toBe('');
  });

  it('WS has scheduledEvents', () => {
    const { ws } = createRefreshObjectScenario();
    expect(ws.scheduledEvents).toBeDefined();
    expect(ws.scheduledEvents!.length).toBeGreaterThanOrEqual(2);
    const eventTypes = ws.scheduledEvents!.map(e => e.event.type);
    expect(eventTypes).toContain(WsMessageType.EVENT_BUILDING_REFRESH);
    expect(eventTypes).toContain(WsMessageType.EVENT_TYCOON_UPDATE);
  });
});

// =============================================================================
// Scenario 9: set-viewed-area
// =============================================================================

describe('set-viewed-area scenario', () => {
  it('creates scenario with empty response', () => {
    const { rdo } = createSetViewedAreaScenario();
    expect(rdo.exchanges).toHaveLength(1);
    expect(rdo.exchanges[0].response).toBe('');
  });

  it('RDO matchKeys has member="SetViewedArea"', () => {
    const { rdo } = createSetViewedAreaScenario();
    expect(rdo.exchanges[0].matchKeys?.member).toBe('SetViewedArea');
  });
});

// =============================================================================
// Scenario 10: pick-event
// =============================================================================

describe('pick-event scenario', () => {
  it('creates scenario with empty response', () => {
    const { rdo } = createPickEventScenario();
    expect(rdo.exchanges).toHaveLength(1);
    // PickEvent returns empty string response (no pending events)
    expect(rdo.exchanges[0].response).toContain('res="%"');
  });

  it('RDO matchKeys has member="PickEvent"', () => {
    const { rdo } = createPickEventScenario();
    expect(rdo.exchanges[0].matchKeys?.member).toBe('PickEvent');
  });
});

// =============================================================================
// Scenario 11: overlays
// =============================================================================

describe('overlays scenario', () => {
  it('creates scenario with GetSurface', () => {
    const { rdo } = createOverlaysScenario();
    expect(rdo.exchanges).toHaveLength(1);
    expect(rdo.exchanges[0].matchKeys?.member).toBe('GetSurface');
  });

  it('response contains RLE-compressed data', () => {
    const { rdo } = createOverlaysScenario();
    const response = rdo.exchanges[0].response;
    // RLE format: "65:65:" prefix (rows:cols) followed by "0=65" repeated entries
    expect(response).toContain('65:65:');
    expect(response).toContain('0=65');
  });
});

// =============================================================================
// Scenario 12: build-menu
// =============================================================================

describe('build-menu scenario', () => {
  it('creates scenario with HTTP and RDO', () => {
    const { http, rdo } = createBuildMenuScenario();
    expect(http).toBeDefined();
    expect(rdo).toBeDefined();
  });

  it('CAPTURED_BUILD_SUCCESS has result=0', () => {
    expect(CAPTURED_BUILD_SUCCESS.result).toBe(0);
  });

  it('CAPTURED_BUILD_DUPLICATE has result=33', () => {
    expect(CAPTURED_BUILD_DUPLICATE.result).toBe(33);
  });

  it('HTTP Build.asp contains frameset', () => {
    const { http } = createBuildMenuScenario();
    const buildAsp = http.exchanges.find(e => e.urlPattern.includes('Build.asp'));
    expect(buildAsp).toBeDefined();
    expect(buildAsp!.body).toContain('frameset');
  });

  it('RDO NewFacility has correct matchKeys', () => {
    const { rdo } = createBuildMenuScenario();
    const newFacility = rdo.exchanges.find(
      e => e.matchKeys?.member === 'NewFacility'
    );
    expect(newFacility).toBeDefined();
    expect(newFacility!.matchKeys?.verb).toBe('sel');
    expect(newFacility!.matchKeys?.action).toBe('call');
    expect(newFacility!.matchKeys?.member).toBe('NewFacility');
  });
});

// =============================================================================
// Scenario 13: build-roads
// =============================================================================

describe('build-roads scenario', () => {
  it('CAPTURED_ROAD_BUILD has correct coordinates', () => {
    expect(CAPTURED_ROAD_BUILD.x1).toBe(462);
    expect(CAPTURED_ROAD_BUILD.y1).toBe(403);
    expect(CAPTURED_ROAD_BUILD.x2).toBe(464);
    expect(CAPTURED_ROAD_BUILD.y2).toBe(403);
  });

  it('RDO CreateCircuitSeg has pushes array', () => {
    const { rdo } = createBuildRoadsScenario();
    const createSeg = rdo.exchanges.find(
      e => e.matchKeys?.member === 'CreateCircuitSeg'
    );
    expect(createSeg).toBeDefined();
    expect(createSeg!.pushes).toBeDefined();
    expect(createSeg!.pushes!.length).toBeGreaterThan(0);
    expect(createSeg!.pushes![0]).toContain('RefreshArea');
  });

  it('HTTP RoadOptions.asp contains BuildRoad and DemolishRoad', () => {
    const { http } = createBuildRoadsScenario();
    const roadOptions = http.exchanges.find(e => e.urlPattern.includes('RoadOptions'));
    expect(roadOptions).toBeDefined();
    expect(roadOptions!.body).toContain('BuildRoad');
    expect(roadOptions!.body).toContain('DemolishRoad');
  });
});

// =============================================================================
// Scenario 14: mail
// =============================================================================

describe('mail scenario', () => {
  it('CAPTURED_MAIL_SEND has correct to/subject', () => {
    expect(CAPTURED_MAIL_SEND.to).toBe('Mayor of Olympus@Shamba.net');
    expect(CAPTURED_MAIL_SEND.subject).toBe('test subjct');
  });

  it('RDO has 14 exchanges covering all mail operations', () => {
    const { rdo } = createMailScenario();
    expect(rdo.exchanges).toHaveLength(14);
    const members = rdo.exchanges.map(
      e => e.matchKeys?.member ?? e.matchKeys?.targetId
    );
    // First 6: original compose/save flow
    expect(members.slice(0, 6)).toEqual([
      'MailServer',
      'NewMail',
      'AddLine',
      'MailServer',
      'Save',
      'CloseMessage',
    ]);
    // Additional 8: Post, DeleteMessage, OpenMessage, GetHeaders, GetLines, GetAttachmentCount, CheckNewMail, AddHeaders
    expect(members.slice(6)).toEqual([
      'Post',
      'DeleteMessage',
      'OpenMessage',
      'GetHeaders',
      'GetLines',
      'GetAttachmentCount',
      'CheckNewMail',
      'AddHeaders',
    ]);
  });

  it('HTTP has MailFolder, MailFolderTop, and MessageList pages', () => {
    const { http } = createMailScenario();
    expect(http.exchanges).toHaveLength(4);
    expect(http.exchanges[0].urlPattern).toContain('MailFolder.asp');
    expect(http.exchanges[1].urlPattern).toContain('MailFolderTop.asp');
    expect(http.exchanges[2].urlPattern).toContain('MessageList.asp');
    expect(http.exchanges[3].urlPattern).toContain('MessageList.asp');
  });

  it('MailFolderTop HTML contains Inbox/Sent/Draft tabs', () => {
    const { http } = createMailScenario();
    const folderTop = http.exchanges.find(
      e => e.urlPattern.includes('MailFolderTop')
    );
    expect(folderTop).toBeDefined();
    expect(folderTop!.body).toContain('Inbox');
    expect(folderTop!.body).toContain('Sent');
    expect(folderTop!.body).toContain('Draft');
  });
});

// =============================================================================
// Scenario 15: building-details
// =============================================================================

describe('building-details scenario', () => {
  it('creates scenario with WS and RDO', () => {
    const { ws, rdo } = createBuildingDetailsScenario();
    expect(ws).toBeDefined();
    expect(rdo).toBeDefined();
    expect(ws.name).toBe('building-details');
    expect(rdo.name).toBe('building-details');
  });

  it('has WS exchanges for all mock buildings', () => {
    const { ws } = createBuildingDetailsScenario();
    expect(ws.exchanges).toHaveLength(ALL_MOCK_BUILDINGS.length);
    for (const exchange of ws.exchanges) {
      expect(exchange.tags).toContain('building-details');
      const request = exchange.request as unknown as Record<string, unknown>;
      expect(request.type).toBe(WsMessageType.REQ_BUILDING_DETAILS);
    }
  });

  it('MOCK_FACTORY has IndGeneral + products + supplies + workforce + upgrade + finances tabs', () => {
    expect(MOCK_FACTORY.tabs).toHaveLength(6);
    const handlerNames = MOCK_FACTORY.tabs.map(t => t.handlerName);
    expect(handlerNames).toContain('IndGeneral');
    expect(handlerNames).toContain('Products');
    expect(handlerNames).toContain('Supplies');
    expect(handlerNames).toContain('Workforce');
    expect(handlerNames).toContain('facManagement');
    expect(handlerNames).toContain('Chart');
  });

  it('MOCK_BANK has BankGeneral + BankLoans tabs', () => {
    expect(MOCK_BANK.tabs).toHaveLength(2);
    expect(MOCK_BANK.groups['bankLoans']).toBeDefined();
    const loanCount = MOCK_BANK.groups['bankLoans'].find(p => p.name === 'LoanCount');
    expect(loanCount?.value).toBe('3');
  });

  it('MOCK_TV_STATION has TVGeneral + Antennas + Films tabs', () => {
    expect(MOCK_TV_STATION.tabs).toHaveLength(4);
    expect(MOCK_TV_STATION.groups['antennas']).toBeDefined();
    expect(MOCK_TV_STATION.groups['films']).toBeDefined();
    const antCount = MOCK_TV_STATION.groups['antennas'].find(p => p.name === 'antCount');
    expect(antCount?.value).toBe('3');
  });

  it('MOCK_CAPITOL has capitolGeneral + CapitolTowns + Ministeries + Votes tabs', () => {
    expect(MOCK_CAPITOL.tabs).toHaveLength(4);
    const handlerNames = MOCK_CAPITOL.tabs.map(t => t.handlerName);
    expect(handlerNames).toContain('capitolGeneral');
    expect(handlerNames).toContain('CapitolTowns');
    expect(handlerNames).toContain('Ministeries');
    expect(handlerNames).toContain('Votes');
  });

  it('MOCK_TOWN_HALL has townGeneral + townJobs + townRes + townServices + townTaxes tabs', () => {
    expect(MOCK_TOWN_HALL.tabs).toHaveLength(5);
    const handlerNames = MOCK_TOWN_HALL.tabs.map(t => t.handlerName);
    expect(handlerNames).toContain('townGeneral');
    expect(handlerNames).toContain('townJobs');
    expect(handlerNames).toContain('townRes');
    expect(handlerNames).toContain('townServices');
    expect(handlerNames).toContain('townTaxes');
  });

  it('townTaxes uses columnSuffix pattern (Tax0Name, Tax0Kind, Tax0Percent)', () => {
    const taxProps = MOCK_TOWN_HALL.groups['townTaxes'];
    expect(taxProps).toBeDefined();
    const propNames = taxProps.map(p => p.name);
    expect(propNames).toContain('Tax0Name.0');
    expect(propNames).toContain('Tax0Kind');
    expect(propNames).toContain('Tax0Percent');
    expect(propNames).toContain('Tax0LastYear');
  });

  it('RDO has GetPropertyList exchanges for each building group', () => {
    const { rdo } = createBuildingDetailsScenario();
    // Each building has exchanges for each group
    const totalGroups = ALL_MOCK_BUILDINGS.reduce(
      (sum, b) => sum + Object.keys(b.groups).length, 0
    );
    expect(rdo.exchanges).toHaveLength(totalGroups);
    for (const exchange of rdo.exchanges) {
      expect(exchange.matchKeys?.member).toBe('GetPropertyList');
    }
  });
});

// =============================================================================
// Scenario Registry
// =============================================================================

describe('scenario registry', () => {
  it('SCENARIO_NAMES has 16 entries', () => {
    expect(SCENARIO_NAMES).toHaveLength(16);
  });

  it('loadScenario returns bundle for each name', () => {
    for (const name of SCENARIO_NAMES) {
      const bundle = loadScenario(name);
      expect(bundle).toBeDefined();
      // Every scenario should have at least one of ws, rdo, or http
      const hasAtLeastOne = bundle.ws !== undefined || bundle.rdo !== undefined || bundle.http !== undefined;
      expect(hasAtLeastOne).toBe(true);
    }
  });

  it('loadAll merges all scenarios', () => {
    const all = loadAll();
    expect(all.ws).toBeDefined();
    expect(all.rdo).toBeDefined();
    expect(all.http).toBeDefined();
    expect(all.ws.name).toBe('all-scenarios');
    expect(all.rdo.name).toBe('all-scenarios');
    expect(all.http.name).toBe('all-scenarios');
  });

  it('loadAll.ws has exchanges from all scenarios', () => {
    const all = loadAll();
    // Every scenario with WS contributes at least 1 exchange (except refresh-object which has 0)
    expect(all.ws.exchanges.length).toBeGreaterThanOrEqual(10);
  });

  it('loadAll.rdo has exchanges from all scenarios', () => {
    const all = loadAll();
    // Auth(5) + world-list(5) + select-company(5) + map-data(3) + server-busy(1) +
    // switch-focus(2) + refresh-object(1) + set-viewed-area(1) + pick-event(1) +
    // overlays(1) + build-menu(2) + build-roads(1) + mail(6) = 34
    expect(all.rdo.exchanges.length).toBeGreaterThanOrEqual(30);
  });

  it('loadAll.http has exchanges from all scenarios', () => {
    const all = loadAll();
    // company-list(3) + select-company(2) + build-menu(2) + build-roads(1) + mail(2) = 10
    expect(all.http.exchanges.length).toBeGreaterThanOrEqual(8);
  });

  it('variable overrides propagate through registry', () => {
    const all = loadAll({ username: 'TestUser' });
    // Check that auth WS exchange uses the override
    const authExchange = all.ws.exchanges.find(
      e => e.id === 'auth-ws-001'
    );
    expect(authExchange).toBeDefined();
    const request = authExchange!.request as unknown as Record<string, unknown>;
    expect(request.username).toBe('TestUser');
  });
});
