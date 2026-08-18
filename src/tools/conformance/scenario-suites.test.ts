/**
 * The scenario suites drive the session through a FAKE driver whose methods
 * write the frames the real session would (taken from the captures), so the
 * oracles are exercised against capture-grade bytes and the shared-state /
 * skip logic is pinned without a socket.
 */

import type { Socket } from 'net';
import { ConformanceRunner, DEFAULT_FRAME_BUDGET } from './runner';
import type { RunPolicy } from './runner';
import { Recorder } from './transport';
import {
  CHAT_SUITE, FOCUS_SUITE, INSPECTOR_SUITE, MAIL_SUITE, MAP_SUITE, POLITICS_SUITE, RESEARCH_SUITE, SCENARIO_SUITES,
} from './scenario-suites';
import type { SessionDriver } from './types';

const CV = '32000416';

/**
 * A driver that records what the real one would put on the wire. Every method
 * appends its frames (request + reply) to the recorder and returns a shaped
 * value; `unanswered` lets a test simulate silence, `throwAfter` a client bug.
 */
function fakeDriver(rec: Recorder, opts: { buildings?: number; inbox?: number; owned?: number; unanswered?: Set<string>; throwAfter?: Set<string>; tabs?: string[] } = {}) {
  let rid = 100;
  const say = (frame: string, reply: string | null) => {
    const r = ++rid;
    rec.recordOut('world', `C ${r} ${frame};`);
    const m = /call (\w+)|get (\w+)|idof "(\w+)"/.exec(frame);
    const member = m?.[1] ?? m?.[2] ?? m?.[3] ?? '';
    if (opts.unanswered?.has(member)) return;
    if (reply !== null) rec.recordIn('world', `A${r} ${reply}`);
    if (opts.throwAfter?.has(member)) throw new Error(`client bug after ${member}`);
  };
  const push = (frame: string) => rec.recordOut('world', `C ${frame};`);
  const buildings = Array.from({ length: opts.buildings ?? 1 }, (_, i) => ({ visualClass: '4602', tycoonId: 37, options: 0, x: 933 + i, y: 1000, level: 0, alert: false, attack: 0 }));
  const tabs = (opts.tabs ?? ['general', 'supplies', 'products']).map((id, i) => ({ id, name: id.toUpperCase(), icon: '', order: i }));

  const driver = {
    sendRdoRequest: jest.fn(),
    getSocket: () => ({} as Socket),
    worldContextId: CV, interfaceServerId: '31929384', tycoonId: '37',
    currentWorldInfo: { name: 'Planitia', ip: '1.2.3.4' },
    getPlayerPosition: () => ({ x: 933, y: 1000 }),
    connectMapService: async () => { say('idof "WSObjectCacher"', 'objid="30829256"'); },
    loadMapArea: async (x: number, y: number, w: number, h: number) => {
      say(`sel ${CV} call ObjectsInArea "^" "#${x}","#${y}","#${w}","#${h}"`, buildings.length ? `res="%${buildings.map(b => `${b.visualClass}\r\n${b.tycoonId}\r\n0\r\n${b.x}\r\n${b.y}`).join('\r\n')}"` : 'res="%"');
      say(`sel ${CV} call SegmentsInArea "^" "#1","#${x}","#${y}","#${x + w}","#${y + h}"`, 'res="%981\r\n999\r\n1174\r\n999\r\n-12\r\n-20\r\n3\r\n3\r\n0\r\n0"');
      return { x, y, w, h, buildings, segments: [] };
    },
    updateCameraPosition: (x: number, y: number) => { push(`sel ${CV} call SetViewedArea "*" "#${x}","#${y}","#64","#64"`); },
    getSurfaceData: async () => { say(`sel ${CV} call GetSurface "^" "%ZONES","#933","#1000","#996","#1063"`, 'res="%65:65:0=65,:0=65,"'); return { type: 'ZONES', x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0, data: [] }; },
    focusBuilding: async (x: number, y: number) => { say(`sel ${CV} call SwitchFocusEx "^" "#0","#${x}","#${y}"`, 'res="%127706280\r\nFarm 10\r\n\r\nYellow Inc.\r\n"'); return { buildingId: '127706280', x, y }; },
    unfocusBuilding: async () => { push(`sel ${CV} call UnfocusObject "*" "#127706280"`); },
    getCacherPropertyListAt: async (x: number, y: number, names: string[]) => {
      say('sel 30829256 call CreateObject "^" "%Planitia"', 'res="#7024008"');
      say(`sel 7024008 call SetObject "^" "#${x}","#${y}"`, 'res="#-1"');
      say(`sel 7024008 call GetPropertyList "^" "%${names.join('\t')}\t"`, `res="%${names.map(() => 'v').join('\t')}\t"`);
      push('sel 30829256 call CloseObject "*" "#7024008"');
      return names.map(() => 'v');
    },
    queryTycoonPoliticalRole: async () => {
      say('sel 30829256 call CreateObject "^" "%Planitia"', 'res="#100766120"');
      say('sel 100766120 call SetPath "^" "%Tycoons\\SPO_test3.five\\"', 'res="#-1"');
      say('sel 100766120 call GetPropertyList "^" "%IsMayor\tTown\tIsCapitalMayor\tIsPresident\tIsMinister\tMinistry\t"', 'res="%\t\t\t\t\t\t"');
      push('sel 30829256 call CloseObject "*" "#100766120"');
      return { isMayor: false, isPresident: false, isMinister: false };
    },
    getBuildingBasicDetails: async (x: number, y: number, visualClass: string) => {
      say(`sel ${CV} call SwitchFocusEx "^" "#127706280","#${x}","#${y}"`, 'res="%127706280\r\nFarm 10\r\n"');
      say('sel 30829256 call CreateObject "^" "%Planitia"', 'res="#6803460"');
      say(`sel 6803460 call SetObject "^" "#${x}","#${y}"`, 'res="#-1"');
      say('sel 6803460 call GetPropertyList "^" "%Creator\tYears\tName\t"', 'res="%SPO_test3\t3\tDrug Store 9\t"');
      return { buildingId: '127706280', x, y, visualClass, templateName: 'store', buildingName: 'Drug Store 9', ownerName: 'SPO_test3', securityId: '', tabs, groups: {} };
    },
    getBuildingTabData: async (_x: number, _y: number, tabId: string) => {
      if (tabId === 'supplies') say('sel 6803460 call GetInputNames "^" "#0","%0"', 'res="%Companies\\Yellow Inc..five\\Drug Store 9{459{389.five\\Inputs\\00000004.Drugs.five\\::Pharmaceutics"');
      if (tabId === 'products') say('sel 6803460 call GetOutputNames "^" "#0","%0"', 'res="%"');
      return {};
    },
    refreshBuildingProperties: async (x: number, y: number) => {
      say(`sel 6803460 call SetObject "^" "#${x}","#${y}"`, 'res="#-1"');
      say('sel 6803460 call GetPropertyList "^" "%Creator\tYears\tName\t"', 'res="%SPO_test3\t3\tDrug Store 9\t"');
      return { buildingId: '127706280', x, y, visualClass: '4602', templateName: 'store', buildingName: '', ownerName: '', securityId: '', tabs, groups: {} };
    },
    releaseInspector: () => { push('sel 30829256 call CloseObject "*" "#6803460"'); },
    getChatChannelList: async () => { say(`sel ${CV} call GetChannelList "^" "%ROOT"`, 'res="%Punta Morena\r\n\r\nWest Bank\r\n\r\n"'); return ['Lobby', 'Punta Morena', 'West Bank']; },
    joinChatChannel: async () => { say(`sel ${CV} call JoinChannel "^" "%","%"`, 'res="#0"'); },
    getChatUserList: async () => { say(`sel ${CV} call GetUserList "^"`, 'res="%RolloCat/8388958/0\r\nSPO_test3/0/0\r\n"'); return []; },
    getChatChannelInfo: async (name: string) => { say(`sel ${CV} call GetChannelInfo "^" "%${name}"`, 'res="%info"'); return 'info'; },
    connectMailService: async () => { say('idof "MailServer"', 'objid="30433648"'); say('sel 30433648 call LogServerOn "^" "%Planitia"', 'res="#30428152"'); },
    getMailUnreadCount: async () => { say('sel 30433648 call CheckNewMail "^" "#30428152","%SPO_test3@Planitia.net"', 'res="#1"'); return 1; },
    getMailAccount: () => 'SPO_test3@Planitia.net',
    getMailFolder: async () => Array.from({ length: opts.inbox ?? 1 }, (_, i) => ({ messageId: `269161B0B2B2${i}`, fromAddr: '', toAddr: '', from: '', to: '', subject: '', date: '', dateFmt: '', read: false, stamp: 0, noReply: false })),
    readMailMessage: async (_folder: string, id: string) => {
      say(`sel 30433648 call OpenMessage "^" "%Planitia","%SPO_test3@Planitia.net","%Inbox","%${id}"`, 'res="#29076320"');
      say('sel 29076320 call GetHeaders "^" "#0"', 'res="%[Header]\r\nFromAddr=mailer@GlobalPlanitia.net\r\n"');
      say('sel 29076320 call GetLines "^" "#0"', 'res="%<HEAD>\r\n"');
      say('sel 29076320 call GetAttachmentCount "^" "#0"', 'res="#0"');
      say('sel 30433648 call CloseMessage "*" "#29076320"', '');
      return { messageId: id, body: '' };
    },
    fetchOwnedFacilities: async () => { say(`sel ${CV} call RDOFavoritesGetSubItems "^" "%"`, 'res="%"'); return Array.from({ length: opts.owned ?? 0 }, (_, i) => ({ id: i, name: `Fac ${i}`, x: 500 + i, y: 500 })); },
    getResearchInventory: async (x: number, y: number) => {
      say('sel 30829256 call CreateObject "^" "%Planitia"', 'res="#7000000"');
      say(`sel 7000000 call SetObject "^" "#${x}","#${y}"`, 'res="#-1"');
      say('sel 7000000 call GetPropertyList "^" "%avlCount0\tdevCount0\thasCount0\t"', 'res="%0\t0\t0\t"');
      push('sel 30829256 call CloseObject "*" "#7000000"');
      return { categoryIndex: 0, available: [], developing: [], completed: [] };
    },
    getPoliticsData: async () => ({}),
  };
  return driver as unknown as SessionDriver;
}

const policy = (): RunPolicy => ({
  target: 'shared', allowMutations: false, allowVariantOnProcedure: false,
  frameBudget: DEFAULT_FRAME_BUDGET, username: 'SPO_test3',
});

async function runAll(rec: Recorder, driver: SessionDriver, suites = SCENARIO_SUITES) {
  const runner = new ConformanceRunner(driver, policy(), {}, rec);
  return runner.runAll([...suites]);
}

describe('scenario suites — the happy path over capture-shaped frames', () => {
  it('every scenario step passes when the driver answers as the captures did', async () => {
    const rec = new Recorder(() => 't');
    const reports = await runAll(rec, fakeDriver(rec, { owned: 1 }));
    const failed = reports.flatMap(r => r.steps.filter(s => s.verdict.kind === 'FAIL').map(s => `${r.name}/${s.id}: ${s.verdict.detail}`));
    expect(failed).toEqual([]);
    const skipped = reports.flatMap(r => r.skipped.map(s => `${r.name}/${s.id}`));
    expect(skipped).toEqual([]);
    // The observation step is UNKNOWN by design (no oracle on push cadence).
    const unknown = reports.flatMap(r => r.steps.filter(s => s.verdict.kind === 'UNKNOWN').map(s => `${r.name}/${s.id}`));
    expect(unknown).toEqual(['map/pushes-after-viewport']);
    // Every scenario step carries its wire.
    const NO_WIRE = new Set(['inbox-listing-http', 'pushes-after-viewport']);
    for (const r of reports) for (const s of r.steps) if (!NO_WIRE.has(s.id)) expect(s.outcome.wire?.length).toBeGreaterThan(0);
  }, 20000);

  it('the derived steps judge frames of the parent step without emitting anything', async () => {
    const rec = new Recorder(() => 't');
    const runner = new ConformanceRunner(fakeDriver(rec, { inbox: 1 }), policy(), {}, rec);
    const mail = await runner.runSuite(MAIL_SUITE);
    const byId = Object.fromEntries(mail.steps.map(s => [s.id, s]));
    expect(byId['read-message'].outcome.response).toMatch(/^res="%\[Header\]/);
    expect(byId['read-message-open'].outcome.response).toBe('res="#29076320"');
    expect(byId['read-message-close-ack'].outcome.response).toBe('');
    expect(byId['read-message-close-ack'].verdict.kind).toBe('PASS');
    // 6 emitting frames for the whole mail suite: idof, LogServerOn, CheckNewMail, and 5 for the message.
    expect(runner.emitted).toBe(8);
  });

  it('push members are observed as the frame itself', async () => {
    const rec = new Recorder(() => 't');
    const runner = new ConformanceRunner(fakeDriver(rec), policy(), {}, rec);
    const map = await runner.runSuite(MAP_SUITE);
    const sva = map.steps.find(s => s.id === 'set-viewed-area')!;
    expect(sva.outcome.response).toBe(`(push) C sel ${CV} call SetViewedArea "*" "#933","#1000","#64","#64"`);
    expect(sva.verdict.kind).toBe('PASS');
  }, 10000);
});

describe('scenario suites — preconditions skip, they do not fail', () => {
  it('an empty area skips focus and inspector steps with a reason', async () => {
    const rec = new Recorder(() => 't');
    const reports = await runAll(rec, fakeDriver(rec, { buildings: 0 }), [MAP_SUITE, FOCUS_SUITE, INSPECTOR_SUITE]);
    const focus = reports.find(r => r.name === 'focus')!;
    expect(focus.steps).toEqual([]);
    expect(focus.skipped.map(s => s.id)).toEqual(['switch-focus', 'unfocus']);
    expect(focus.skipped[0].reason).toMatch(/needs a building in the area/);
    const inspector = reports.find(r => r.name === 'inspector')!;
    // tycoon-role needs no building; everything else does.
    expect(inspector.steps.map(s => s.id)).toEqual(['tycoon-role']);
    expect(inspector.stoppedOnSilence).toBe(false);
  }, 10000);

  it('an empty inbox skips the message read and its derived steps', async () => {
    const rec = new Recorder(() => 't');
    const runner = new ConformanceRunner(fakeDriver(rec, { inbox: 0 }), policy(), {}, rec);
    const mail = await runner.runSuite(MAIL_SUITE);
    expect(mail.steps.map(s => s.id)).toEqual(['log-server-on', 'check-new-mail', 'inbox-listing-http']);
    expect(mail.skipped.map(s => s.id)).toEqual(['read-message', 'read-message-open', 'read-message-lines', 'read-message-attachment-count', 'read-message-close-ack']);
    expect(mail.skipped[0].reason).toBe('inbox is empty');
  });

  it('research skips when the account owns nothing', async () => {
    const rec = new Recorder(() => 't');
    const runner = new ConformanceRunner(fakeDriver(rec, { owned: 0 }), policy(), {}, rec);
    await runner.runSuite(POLITICS_SUITE);
    const research = await runner.runSuite(RESEARCH_SUITE);
    expect(research.skipped).toEqual([{ id: 'inventory', reason: 'the account owns no facility with coordinates' }]);
  });

  it('a template without supplies/products skips those tabs', async () => {
    const rec = new Recorder(() => 't');
    const runner = new ConformanceRunner(fakeDriver(rec, { tabs: ['general'] }), policy(), {}, rec);
    await runner.runSuite(MAP_SUITE);
    const inspector = await runner.runSuite(INSPECTOR_SUITE);
    expect(inspector.skipped.map(s => s.id)).toEqual(['tab-supplies', 'tab-products']);
    expect(inspector.skipped[0].reason).toMatch(/no supplies tab/);
  }, 10000);

  it('chat channel-info skips when only the lobby exists', async () => {
    const rec = new Recorder(() => 't');
    const driver = fakeDriver(rec) as unknown as { getChatChannelList: () => Promise<string[]> };
    driver.getChatChannelList = async () => { rec.recordOut('world', `C 1 sel ${CV} call GetChannelList "^" "%ROOT";`); rec.recordIn('world', 'A1 res="%"'); return ['Lobby']; };
    const runner = new ConformanceRunner(driver as unknown as SessionDriver, policy(), {}, rec);
    const chat = await runner.runSuite(CHAT_SUITE);
    expect(chat.skipped).toEqual([{ id: 'channel-info', reason: 'no channel besides the lobby to ask about' }]);
  });
});

describe('scenario suites — silence and client failures', () => {
  it('a method whose key frame went unanswered is silence: FAIL and the suite stops', async () => {
    const rec = new Recorder(() => 't');
    const runner = new ConformanceRunner(fakeDriver(rec, { unanswered: new Set(['ObjectsInArea']) }), policy(), {}, rec);
    const map = await runner.runSuite(MAP_SUITE);
    expect(map.steps.map(s => `${s.id}:${s.verdict.kind}`)).toEqual(['connect-map-service:PASS', 'objects-in-area:FAIL']);
    expect(map.stoppedOnSilence).toBe(true);
  }, 10000);

  it('a method that throws after the server answered is a client failure, not silence', async () => {
    const rec = new Recorder(() => 't');
    const runner = new ConformanceRunner(fakeDriver(rec, { throwAfter: new Set(['GetChannelList']) }), policy(), {}, rec);
    const chat = await runner.runSuite(CHAT_SUITE);
    const list = chat.steps.find(s => s.id === 'channel-list')!;
    expect(list.verdict.kind).toBe('FAIL');
    expect(list.verdict.detail).toMatch(/client failure after the server answered: client bug after GetChannelList/);
    expect(chat.stoppedOnSilence).toBe(false);
    // The suite went on: join-lobby ran.
    expect(chat.steps.map(s => s.id)).toContain('join-lobby');
  });

  it('a method that emits no frame at all is reported as such', async () => {
    const rec = new Recorder(() => 't');
    const driver = fakeDriver(rec) as unknown as { connectMapService: () => Promise<void> };
    driver.connectMapService = async () => undefined; // already connected: nothing on the wire
    const runner = new ConformanceRunner(driver as unknown as SessionDriver, policy(), {}, rec);
    const map = await runner.runSuite(MAP_SUITE);
    expect(map.steps[0].outcome.error).toBe('no idof:WSObjectCacher frame was emitted');
    expect(map.steps[0].outcome.response).toBeNull();
  });
});
