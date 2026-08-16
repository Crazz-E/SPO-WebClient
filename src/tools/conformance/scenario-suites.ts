/**
 * Scenario suites — the read-only flows of the reference client, driven
 * through the session's own methods and judged on the frames they produce.
 *
 * Where the frame suites (`suites.ts`) put ONE frame on the wire and judge its
 * reply, a scenario step calls a session method (`loadMapArea`,
 * `focusBuilding`, `getBuildingBasicDetails`, `readMailMessage`…) exactly as
 * the WebSocket handlers do, then reads the frames back from the transport
 * recorder. The oracle names the frame that matters (`member`) and every frame
 * lands in the report. Steps that need something an earlier step found (a
 * building in the area, a mail in the inbox) read it from `ctx.state` and skip
 * themselves — `StepSkip` — when it is not there.
 *
 * Every step here is a READ the browser client performs in normal play, on the
 * account's own session: area reads, focus, inspector, chat lists, mail
 * listing, favourites, the tycoon's own political role. Nothing addresses an
 * object the reference client would not address from the same screen; no
 * mutation lives in this file (see `MUTATIONS_SUITE` in suites.ts).
 *
 * Evidence per step is cited in `intent`; `[INFERRED]` marks an oracle with no
 * capture behind it — those are the members the census found without any
 * reply example (GetChannelInfo, GetOutputNames, CloseMessage "*"+rid…), and
 * this run is their first live observation.
 */

import { SurfaceType } from '../../shared/types';
import type { MapBuilding, MapData, MailMessageHeader, BuildingDetailsResponse } from '../../shared/types';
import type { FavoritesItem } from '../../shared/types/message-types';
import type { ImperativeStep, StepContext, StepOutcome, Suite } from './types';
import { StepSkip } from './types';

// ── Shared state keys ──────────────────────────────────────────────────────

const K = {
  center: 'center',            // { x, y } — where the area read is anchored
  area: 'area',                // MapData
  building: 'building',        // MapBuilding chosen for focus / inspector
  detailsMark: 'detailsMark',  // wire mark of the basic-details step
  details: 'details',          // BuildingDetailsResponse
  mailMark: 'mailMark',        // wire mark of the read-message step
  mailHeaders: 'mailHeaders',  // MailMessageHeader[] (Inbox)
  owned: 'owned',              // FavoritesItem[]
} as const;

function need<T>(ctx: StepContext, key: string, what: string): T {
  const v = ctx.state.get(key);
  if (v === undefined || v === null) throw new StepSkip(`needs ${what} — an earlier step did not provide it`);
  return v as T;
}

/**
 * A step judged from frames an EARLIER step already produced (same wire mark),
 * without emitting anything: several members of one method, one verdict each.
 */
function derived(id: string, intent: string, markKey: string, member: string, expect: ImperativeStep['expect']): ImperativeStep {
  return {
    id, intent, expect,
    run: async ctx => {
      const mark = need<number>(ctx, markKey, `the wire mark of ${markKey}`);
      const ex = ctx.wire.exchanges(mark, member);
      if (ex.length === 0) throw new StepSkip(`no ${member} frame in the observed exchange`);
      const last = ex[ex.length - 1];
      const outcome: StepOutcome = {
        response: last.rid === undefined ? `(push) ${last.request}` : last.reply,
        elapsedMs: 0,
        wire: [`>> ${last.request}`, ...(last.reply !== null ? [`<< A${last.rid} ${last.reply}`] : [])],
      };
      const code = last.reply ? /^error\s+(\d+)/i.exec(last.reply) : null;
      if (code) outcome.errorCode = parseInt(code[1], 10);
      return outcome;
    },
  };
}

/** Pick the building the focus / inspector steps will use: the first one in the area. */
function chooseBuilding(area: MapData): MapBuilding | null {
  return area.buildings.length ? area.buildings[0] : null;
}

// ── map ────────────────────────────────────────────────────────────────────

/** Five ints per object (visualClass, tycoonId, options, x, y), CRLF-separated; empty area → `res="%"`. */
const OBJECTS_IN_AREA = /^res="%((-?\d+\r?\n){4}-?\d+(\r?\n)?)*"$/;
/** Ten ints per segment, CRLF-separated, no trailing CRLF (login-full :539-540; doc :2031-2072). */
const SEGMENTS_IN_AREA = /^res="%(-?\d+\r?\n)*(-?\d+)?"$/;

export const MAP_SUITE: Suite = {
  name: 'map',
  description: 'Map service and area reads: WSObjectCacher handshake, ObjectsInArea / SegmentsInArea, SetViewedArea, GetSurface (capture login-full :431-560, doc :2020-2123)',
  steps: [
    {
      id: 'connect-map-service',
      intent: '`idof WSObjectCacher` on the map socket (port 6000) answers an object id — capture login-full :431-432',
      run: ctx => ctx.scenario('idof:WSObjectCacher', s => s.connectMapService()),
      expect: { kind: 'pattern', value: /^objid="\d+"$/ },
    },
    {
      id: 'objects-in-area',
      intent: '`call ObjectsInArea "^" #x,#y,#w,#h` at the tycoon\'s last camera position — 5 ints per object, CRLF (login-full :529-530)',
      run: async ctx => {
        const pos = ctx.session.getPlayerPosition();
        const center = pos.x || pos.y ? pos : { x: 1000, y: 1000 };
        ctx.state.set(K.center, center);
        const mark = ctx.wire.mark();
        const outcome = await ctx.scenario('ObjectsInArea', async s => {
          const area = await s.loadMapArea(center.x, center.y, 64, 64);
          ctx.state.set(K.area, area);
          const b = chooseBuilding(area);
          if (b) ctx.state.set(K.building, b);
        });
        ctx.state.set('areaMark', mark);
        return outcome;
      },
      expect: { kind: 'pattern', value: OBJECTS_IN_AREA },
    },
    derived('segments-in-area',
      '`call SegmentsInArea "^" #1,#x1,#y1,#x2,#y2` — 10 ints per segment (login-full :539-540). Divergence noted by the census: the reference client pads the box by one tile (doc :2020-2031); the gateway does not',
      'areaMark', 'SegmentsInArea', { kind: 'pattern', value: SEGMENTS_IN_AREA }),
    {
      id: 'set-viewed-area',
      intent: 'fire-and-forget `SetViewedArea "*" #x,#y,#dx,#dy` — what makes RefreshArea / RefreshObject pushes flow (capture :2111; login-full :450-451)',
      run: ctx => {
        const c = need<{ x: number; y: number }>(ctx, K.center, 'the area centre');
        return ctx.scenario('SetViewedArea', async s => { s.updateCameraPosition(c.x, c.y, c.x, c.y, 64, 64); });
      },
      expect: { kind: 'pattern', value: /^\(push\) C sel \d+ call SetViewedArea "\*" "#-?\d+","#-?\d+","#\d+","#\d+"$/ },
    },
    {
      id: 'surface-zones',
      intent: '`call GetSurface "^" "%ZONES",#x1,#y1,#x2,#y2` answers `res="%w:h:<rle rows>"` — doc capture :2120-2123 (Shamba). First observation through the gateway on planitia',
      run: ctx => {
        const c = need<{ x: number; y: number }>(ctx, K.center, 'the area centre');
        return ctx.scenario('GetSurface', s => s.getSurfaceData(SurfaceType.ZONES, c.x, c.y, c.x + 63, c.y + 63));
      },
      expect: { kind: 'pattern', value: /^res="%\d+:\d+:/ },
    },
    {
      id: 'pushes-after-viewport',
      intent: 'observation — which server pushes arrived since the viewport was set (RefreshTycoon / RefreshArea / RefreshDate / ChatMsg… captures :1014-1018, login-full :691-971). No oracle: cadence is the simulation\'s',
      run: async ctx => {
        const mark = need<number>(ctx, 'areaMark', 'the area wire mark');
        await new Promise(r => setTimeout(r, 3000));
        const members = ctx.wire.pushMembers(mark);
        return { response: members.length ? [...new Set(members)].sort().join(',') : '(none within 3 s)', elapsedMs: 3000, wire: ctx.wire.pushes(mark).map(p => `<< ${p}`) };
      },
    },
  ],
};

// ── focus ──────────────────────────────────────────────────────────────────

export const FOCUS_SUITE: Suite = {
  name: 'focus',
  description: 'Building focus (SwitchFocusEx) and unfocus (UnfocusObject "*") on a building found in the area — session-scoped, what every map click does (doc :2079-2097; live: no gateway capture yet)',
  steps: [
    {
      id: 'switch-focus',
      intent: '`call SwitchFocusEx "^" #0,#x,#y` answers `res="%<objectId>\\n<name>\\n…"` — doc capture :2079-2097 (LF there; CRLF vs LF live is [UNKNOWN] per census)',
      run: ctx => {
        const b = need<MapBuilding>(ctx, K.building, 'a building in the area');
        return ctx.scenario('SwitchFocusEx', s => s.focusBuilding(b.x, b.y));
      },
      expect: { kind: 'pattern', value: /^res="%\d+(\r?\n|")/ },
    },
    {
      id: 'unfocus',
      intent: 'fire-and-forget `UnfocusObject "*" #objectId` — mail-read :1509-1510, panels-tour :1594-1595',
      run: ctx => {
        need<MapBuilding>(ctx, K.building, 'a focused building');
        return ctx.scenario('UnfocusObject', s => s.unfocusBuilding());
      },
      expect: { kind: 'pattern', value: /^\(push\) C sel \d+ call UnfocusObject "\*" "#\d+"$/ },
    },
  ],
};

// ── inspector ──────────────────────────────────────────────────────────────

const TAB_SEP_LIST = /^res="%([^\t"]*\t)*"$/;

export const INSPECTOR_SUITE: Suite = {
  name: 'inspector',
  description: 'Cacher temp-object round trips: CreateObject / SetObject / GetPropertyList / CloseObject on the building found in the area, the inspector open / tab data / refresh / release flow, the tycoon\'s own role (doc/building_details_rdo.txt; login-full :440-481)',
  steps: [
    {
      id: 'property-list-at',
      intent: '`getCacherPropertyListAt(x,y,[Name,Creator,CurrBlock,ObjectId])` — CreateObject → SetObject → GetPropertyList → CloseObject "*"; reply is tab-separated WITH trailing tab (building_details_rdo.txt:3-4, 9-10)',
      run: async ctx => {
        const b = need<MapBuilding>(ctx, K.building, 'a building in the area');
        const mark = ctx.wire.mark();
        ctx.state.set('propertyListMark', mark);
        return ctx.scenario('GetPropertyList', s => s.getCacherPropertyListAt(b.x, b.y, ['Name', 'Creator', 'CurrBlock', 'ObjectId']));
      },
      expect: { kind: 'pattern', value: /^res="%([^\t"]*\t){4}"$/ },
    },
    derived('create-object', '`call CreateObject "^" "%<world>"` on WSObjectCacher answers `res="#<tempId>"` — login-full :440-441', 'propertyListMark', 'CreateObject', { kind: 'pattern', value: /^res="#\d+"$/ }),
    derived('set-object', '`call SetObject "^" #x,#y` on the temp object answers `res="#-1"` — building_details_rdo.txt:1-2 (doc-only until now)', 'propertyListMark', 'SetObject', { kind: 'exact', value: 'res="#-1"' }),
    derived('close-object', 'fire-and-forget `CloseObject "*" #tempId` — building_details_rdo.txt:22, login-full :480-481', 'propertyListMark', 'CloseObject', { kind: 'pattern', value: /^\(push\) C sel \d+ call CloseObject "\*" "#\d+"$/ }),
    {
      id: 'tycoon-role',
      intent: '`SetPath "%Tycoons\\<user>.five\\"` then `GetPropertyList IsMayor…Ministry` — 6 fields, trailing tab (login-full :460-471; chat :471 shows `1\\tAgriculture`)',
      run: ctx => ctx.scenario('GetPropertyList', s => s.queryTycoonPoliticalRole(ctx.username)),
      expect: { kind: 'pattern', value: /^res="%([^\t"]*\t){6}"$/ },
    },
    {
      id: 'basic-details',
      intent: 'inspector open — SwitchFocusEx, CreateObject, SetObject, GetPropertyList in batches ≤ 50 (building_details_rdo.txt); the temp object stays open as the ActiveInspector',
      run: async ctx => {
        const b = need<MapBuilding>(ctx, K.building, 'a building in the area');
        const mark = ctx.wire.mark();
        ctx.state.set(K.detailsMark, mark);
        return ctx.scenario('GetPropertyList', async s => {
          const d = await s.getBuildingBasicDetails(b.x, b.y, b.visualClass);
          ctx.state.set(K.details, d);
        });
      },
      expect: { kind: 'pattern', value: TAB_SEP_LIST },
    },
    {
      id: 'tab-supplies',
      intent: 'supplies tab — `GetInputNames "^" #0,"%0"` (building_details_rdo.txt:12-13) then per gate SetPath / GetPropertyList / GetSubObjectProps; skipped when the template has no supplies tab',
      run: ctx => {
        const b = need<MapBuilding>(ctx, K.building, 'a building in the area');
        const d = need<BuildingDetailsResponse>(ctx, K.details, 'the basic details');
        if (!d.tabs.some(t => t.id.startsWith('supplies'))) throw new StepSkip(`template ${d.templateName} has no supplies tab`);
        return ctx.scenario('GetInputNames', s => s.getBuildingTabData(b.x, b.y, 'supplies', b.visualClass));
      },
      expect: { kind: 'pattern', value: /^res="%/ },
    },
    {
      id: 'tab-products',
      intent: 'products tab — `GetOutputNames "^" #0,"%0"` [INFERRED — no capture at all]; skipped when the template has no products tab',
      run: ctx => {
        const b = need<MapBuilding>(ctx, K.building, 'a building in the area');
        const d = need<BuildingDetailsResponse>(ctx, K.details, 'the basic details');
        if (!d.tabs.some(t => t.id.startsWith('products'))) throw new StepSkip(`template ${d.templateName} has no products tab`);
        return ctx.scenario('GetOutputNames', s => s.getBuildingTabData(b.x, b.y, 'products', b.visualClass));
      },
      expect: { kind: 'pattern', value: /^res="%/ },
    },
    {
      id: 'refresh',
      intent: 'inspector refresh — SetObject again on the SAME temp object then GetPropertyList (parity with TObjectInspectorContainer.Refresh; no capture)',
      run: ctx => {
        const b = need<MapBuilding>(ctx, K.building, 'a building in the area');
        need<BuildingDetailsResponse>(ctx, K.details, 'an open inspector');
        return ctx.scenario('GetPropertyList', s => s.refreshBuildingProperties(b.x, b.y, b.visualClass));
      },
      expect: { kind: 'pattern', value: TAB_SEP_LIST },
    },
    {
      id: 'release',
      intent: 'inspector release — `CloseObject "*" #tempId` on the ActiveInspector',
      run: ctx => {
        need<BuildingDetailsResponse>(ctx, K.details, 'an open inspector');
        return ctx.scenario('CloseObject', async s => { s.releaseInspector(); });
      },
      expect: { kind: 'pattern', value: /^\(push\) C sel \d+ call CloseObject "\*" "#\d+"$/ },
    },
  ],
};

// ── chat ───────────────────────────────────────────────────────────────────

export const CHAT_SUITE: Suite = {
  name: 'chat',
  description: 'Chat reads on the ClientView: channel list, lobby join (what login does), user list, channel info (login-full :589-733)',
  steps: [
    {
      id: 'channel-list',
      intent: '`call GetChannelList "^" "%ROOT"` answers name / password line pairs — login-full :589-590',
      run: ctx => ctx.scenario('GetChannelList', async s => { ctx.state.set('channels', await s.getChatChannelList()); }),
      expect: { kind: 'pattern', value: /^res="%/ },
    },
    {
      id: 'join-lobby',
      intent: '`call JoinChannel "^" "%","%"` (empty name = lobby, as the reference client at login) answers `res="#0"` — login-full :659-660',
      run: ctx => ctx.scenario('JoinChannel', s => s.joinChatChannel('')),
      expect: { kind: 'exact', value: 'res="#0"' },
    },
    {
      id: 'user-list',
      intent: '`call GetUserList "^"` answers `name/accDesc/status` lines — login-full :732-733',
      run: ctx => ctx.scenario('GetUserList', s => s.getChatUserList()),
      expect: { kind: 'pattern', value: /^res="%([^/\r\n"]+\/-?\d+\/-?\d+(\r?\n)?)*"$/ },
    },
    {
      id: 'channel-info',
      intent: '`call GetChannelInfo "^" "%<channel>"` on the first listed channel — [INFERRED] no reply evidence anywhere; first live observation',
      run: ctx => {
        const channels = need<string[]>(ctx, 'channels', 'the channel list');
        const first = channels.find(c => c && c !== 'Lobby');
        if (!first) throw new StepSkip('no channel besides the lobby to ask about');
        return ctx.scenario('GetChannelInfo', s => s.getChatChannelInfo(first));
      },
      expect: { kind: 'answered' },
    },
  ],
};

// ── mail ───────────────────────────────────────────────────────────────────

export const MAIL_SUITE: Suite = {
  name: 'mail',
  description: 'Mail reads: MailServer handshake (LogServerOn), CheckNewMail, Inbox listing (HTTP), OpenMessage / GetHeaders / GetLines / GetAttachmentCount / CloseMessage "*"+rid (login-full :490-510; mail-read :971-1012)',
  steps: [
    {
      id: 'log-server-on',
      intent: '`call LogServerOn "^" "%<world>"` on MailServer answers `res="#<id>"` — login-full :499-500',
      run: ctx => ctx.scenario('LogServerOn', s => s.connectMailService()),
      expect: { kind: 'pattern', value: /^res="#\d+"$/ },
    },
    {
      id: 'check-new-mail',
      intent: '`call CheckNewMail "^" #srv,"%<account>"` answers `res="#<count>"` — login-full :509-510',
      run: ctx => ctx.scenario('CheckNewMail', s => s.getMailUnreadCount()),
      expect: { kind: 'pattern', value: /^res="#-?\d+"$/ },
    },
    {
      id: 'inbox-listing-http',
      intent: 'transport C — `MessageList.asp` over HTTP, no RDO frame; yields the message ids the RDO read needs. Volatile (mail arrives; unreachable in replay)',
      volatile: true,
      run: async ctx => {
        const t0 = Date.now();
        const headers = await ctx.session.getMailFolder('Inbox');
        ctx.state.set(K.mailHeaders, headers);
        return { response: `${headers.length} message(s)`, elapsedMs: Date.now() - t0 };
      },
      expect: { kind: 'pattern', value: /^\d+ message\(s\)$/ },
    },
    {
      id: 'read-message',
      intent: '`readMailMessage(Inbox, id)` — OpenMessage / GetHeaders / GetLines / GetAttachmentCount / CloseMessage "*"+rid; judged here on GetHeaders `res="%[Header]…"` (mail-read :981-982)',
      run: async ctx => {
        const headers = need<MailMessageHeader[]>(ctx, K.mailHeaders, 'the inbox listing');
        if (!headers.length) throw new StepSkip('inbox is empty');
        const mark = ctx.wire.mark();
        ctx.state.set(K.mailMark, mark);
        return ctx.scenario('GetHeaders', s => s.readMailMessage('Inbox', headers[0].messageId));
      },
      expect: { kind: 'pattern', value: /^res="%\[Header\]/ },
    },
    derived('read-message-open', '`OpenMessage "^" "%<world>","%<account>","%Inbox","%<id>"` answers `res="#<msg>"` — mail-read :971-972', K.mailMark, 'OpenMessage', { kind: 'pattern', value: /^res="#\d+"$/ }),
    derived('read-message-lines', '`GetLines "^" #0` answers `res="%…"` (embedded quotes doubled) — mail-read :991-992', K.mailMark, 'GetLines', { kind: 'pattern', value: /^res="%/ }),
    derived('read-message-attachment-count', '`GetAttachmentCount "^" #0` answers `res="#n"` — mail-read :1001-1002', K.mailMark, 'GetAttachmentCount', { kind: 'pattern', value: /^res="#\d+"$/ }),
    derived('read-message-close-ack', '`CloseMessage "*"` WITH QueryId (VOID_MEMBERS) is acked `A<id> ;` — doc :3548-3549; the live capture only holds the rejected `"^"` form (error 9, mail-read :1011-1012). First live observation of the corrected form', K.mailMark, 'CloseMessage', { kind: 'exact', value: '' }),
  ],
};

// ── politics / empire ──────────────────────────────────────────────────────

export const POLITICS_SUITE: Suite = {
  name: 'politics',
  description: 'Empire and politics reads: owned facilities (RDOFavoritesGetSubItems), the tycoon\'s own role. Town data needs a town hall / town name — see the report',
  steps: [
    {
      id: 'owned-facilities',
      intent: '`call RDOFavoritesGetSubItems "^" "%"` answers `res="%…"` — panels-tour :1246-1247 (empty there); non-empty shape [INFERRED] from parseFavoritesResponse',
      run: ctx => ctx.scenario('RDOFavoritesGetSubItems', async s => { ctx.state.set(K.owned, await s.fetchOwnedFacilities()); }),
      expect: { kind: 'pattern', value: /^res="%/ },
    },
  ],
};

// ── research ───────────────────────────────────────────────────────────────

export const RESEARCH_SUITE: Suite = {
  name: 'research',
  description: 'Research inventory read on an owned facility (cacher GetPropertyList avl/dev/has counts) — no capture at all; skipped when the account owns nothing',
  steps: [
    {
      id: 'inventory',
      intent: '`getResearchInventory(x,y,0)` on the first owned facility — CreateObject / SetObject / GetPropertyList avlCount0… / CloseObject [INFERRED]',
      run: ctx => {
        const owned = need<FavoritesItem[]>(ctx, K.owned, 'the owned-facilities list');
        const first = owned.find(o => o.x > 0 || o.y > 0);
        if (!first) throw new StepSkip('the account owns no facility with coordinates');
        return ctx.scenario('GetPropertyList', s => s.getResearchInventory(first.x, first.y, 0));
      },
      expect: { kind: 'pattern', value: TAB_SEP_LIST },
    },
  ],
};

export const SCENARIO_SUITES: readonly Suite[] = [
  MAP_SUITE, FOCUS_SUITE, INSPECTOR_SUITE, CHAT_SUITE, MAIL_SUITE, POLITICS_SUITE, RESEARCH_SUITE,
];
