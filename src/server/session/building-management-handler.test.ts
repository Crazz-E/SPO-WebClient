/// <reference path="../__tests__/matchers/rdo-matchers.d.ts" />

/**
 * building-management-handler — construction lifecycle on the `construction`
 * socket: political-role cache reads, upgrade/downgrade, rename, demolish.
 *
 * What these tests are for. Every function here picks a TARGET (CurrBlock vs
 * ObjectId vs worldId) and a CHANNEL (`"^"` synchronous vs `"*"` fire-and-forget).
 * Both choices are invisible in the return value and only observable on the wire,
 * so each test drives the real handler and reads back what the fake context
 * received — `sent[]` for the synchronous channel, `frames.construction` for the
 * latin1 frames.
 *
 * Delphi declarations that fix the channel (Kernel.pas):
 *   procedure RDOStartUpgrades(count : integer)   — :1092  → void `"*"`
 *   procedure RDOStopUpgrade                      — :1093  → void `"*"`
 *   procedure RDODowngrade                        — :1094  → void `"*"`
 *   property  RDOAcceptCloning : boolean          — :1347  → get/set
 * The `set RDOAcceptCloning="#-1"` frame is reproduced byte for byte from the
 * live wire.
 *
 * `deleteFacility` already has its M-B regression suite in
 * `building-mutations.test.ts`; only the branches it leaves open are added here.
 */

import {
  queryTycoonPoliticalRole,
  manageConstruction,
  upgradeBuildingAction,
  renameFacility,
  deleteFacility,
} from './building-management-handler';
import { makeSessionCtx } from '../__tests__/session/fake-session-context';
import type { FakeSessionCtx } from '../__tests__/session/fake-session-context';
import type { SessionContext } from './session-context';
import type { RdoPacket } from '../../shared/types';
import { RdoValue, RdoCommand } from '../../shared/rdo-types';
import { TimeoutCategory } from '../../shared/timeout-categories';
import { RdoVerb, RdoAction } from '../../shared/types';

// ── Fixtures ────────────────────────────────────────────────────────────────
//
// "IDs dynamiques": the ids the fake server hands back are distinct from
// one another AND from every argument the tests pass, so a handler that swaps
// CurrBlock for ObjectId, or hardcodes one, shows up as a wrong `sel`.
const CURR_BLOCK = '40133601';
const OBJECT_ID = '40133602';
const TEMP_OBJ = '7734';
const X = 118;
const Y = 226;

type CacherListAt = jest.MockedFunction<SessionContext['getCacherPropertyListAt']>;
type FocusBuilding = jest.MockedFunction<SessionContext['focusBuilding']>;

function propsAt(fake: FakeSessionCtx): CacherListAt {
  return fake.ctx.getCacherPropertyListAt as CacherListAt;
}

function focus(fake: FakeSessionCtx): FocusBuilding {
  return fake.ctx.focusBuilding as FocusBuilding;
}

/** A context wired for the happy path of `manageConstruction`. */
function makeConstructionCtx(cloning = '255'): FakeSessionCtx {
  const fake = makeSessionCtx({ sockets: ['construction'] });
  propsAt(fake).mockResolvedValue([CURR_BLOCK, OBJECT_ID]);
  // A property GET answers with the member name echoed back —
  // `A40 ServerBusy="#0";` (observed on the live wire).
  fake.respond(() => `RDOAcceptCloning="#${cloning}"`);
  return fake;
}

/**
 * Drive a call that parks on the post-command `setTimeout(…, 200)`
 * (building-management-handler.ts:183). `runAllTimers` would spin on the
 * session's `setInterval`s, so the wait is advanced by exactly its duration.
 */
async function settleConstruction<T>(pending: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(200);
  return pending;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ===========================================================================
// queryTycoonPoliticalRole — cache path, and the boolean decoder behind it
// ===========================================================================

describe('queryTycoonPoliticalRole', () => {
  function makeRoleCtx(values: string[]): FakeSessionCtx {
    const fake = makeSessionCtx();
    fake.cacher.createObject.mockResolvedValue(TEMP_OBJ);
    fake.cacher.getPropertyList.mockResolvedValue(values);
    return fake;
  }

  it('threads one temp object through SetPath, GetPropertyList and CloseObject', async () => {
    const fake = makeRoleCtx(['1', 'Rio', '0', '0', '0', '']);

    await queryTycoonPoliticalRole(fake.ctx, 'SPO_test3');

    // The escaped path is the Delphi cache convention: Tycoons\<name>.five\
    expect(fake.cacher.setPath).toHaveBeenCalledWith(TEMP_OBJ, 'Tycoons\\SPO_test3.five\\');
    expect(fake.cacher.getPropertyList).toHaveBeenCalledWith(TEMP_OBJ, [
      'IsMayor', 'Town', 'IsCapitalMayor', 'IsPresident', 'IsMinister', 'Ministry',
    ]);
    expect(fake.cacher.closeObject).toHaveBeenCalledWith(TEMP_OBJ);
    expect(fake.ctx.connectMapService).toHaveBeenCalled();
  });

  it('maps the six cache slots onto the role fields, in order', async () => {
    const fake = makeRoleCtx(['0', 'Cape Town', '0', '1', '1', 'Transport']);

    const role = await queryTycoonPoliticalRole(fake.ctx, 'Fred');

    expect(role).toEqual({
      tycoonName: 'Fred',
      isMayor: false,
      town: 'Cape Town',
      isCapitalMayor: false,
      isPresident: true,
      isMinister: true,
      ministry: 'Transport',
      queriedAt: Date.now(),
    });
  });

  it('substitutes empty strings for text slots the cache never wrote', async () => {
    // TMayor.StoreRoleInfoToCache only writes Town when fTownHall <> nil
    // (Kernel/TownPolitics.pas:642-651), so short/partial responses are normal.
    const fake = makeRoleCtx(['1']);

    const role = await queryTycoonPoliticalRole(fake.ctx, 'Solo');

    expect(role.isMayor).toBe(true);
    expect(role.town).toBe('');
    expect(role.ministry).toBe('');
    expect(role.isMinister).toBe(false);
  });

  it('closes the temp object even when GetPropertyList rejects', async () => {
    const fake = makeRoleCtx([]);
    fake.cacher.getPropertyList.mockRejectedValue(new Error('Request timeout: GetPropertyList'));

    await expect(queryTycoonPoliticalRole(fake.ctx, 'Ghost')).rejects.toThrow('Request timeout');

    expect(fake.cacher.closeObject).toHaveBeenCalledWith(TEMP_OBJ);
  });

  // parseBooleanCacheValue is module-private; the role flags are its only
  // observable output. TObjectCache.WriteBoolean writes '1' or '0'
  // (Cache/CacheAgent.pas:143-153) — the two forms the live cache can produce.
  describe('boolean decoding of the cache flags', () => {
    async function isMayor(raw: string | undefined): Promise<boolean> {
      const fake = makeRoleCtx([raw as string]);
      return (await queryTycoonPoliticalRole(fake.ctx, 'T')).isMayor;
    }

    it("reads '1' — what TObjectCache.WriteBoolean(true) writes — as true", async () => {
      expect(await isMayor('1')).toBe(true);
    });

    it("reads '-1', the Delphi wordbool TRUE form, as true", async () => {
      expect(await isMayor('-1')).toBe(true);
    });

    it("reads 'true' in any case as true", async () => {
      expect(await isMayor('TRUE')).toBe(true);
      expect(await isMayor(' true ')).toBe(true);
    });

    it("reads '0' as false", async () => {
      expect(await isMayor('0')).toBe(false);
    });

    it('reads an absent property as false', async () => {
      expect(await isMayor('')).toBe(false);
      expect(await isMayor(undefined)).toBe(false);
    });

    it('reads a non-numeric value as false', async () => {
      expect(await isMayor('yes')).toBe(false);
    });

    // BUG connu (nouveau, lot 3) — building-management-handler.ts:26-30 accepts
    // only '1' / '-1' / 'true', where the wire rule is "any non-zero ordinal is
    // true" (rdo-helpers.ts:161 `isTrueOrdinal`). Latent rather
    // than live: this value comes from the object cache, and
    // TObjectCache.WriteBoolean only ever writes '1' or '0'
    // (Cache/CacheAgent.pas:150-152). Pinned so the divergence is visible if the
    // source of these flags ever changes.
    it('reads any other non-zero ordinal as FALSE — diverges from isTrueOrdinal', async () => {
      expect(await isMayor('255')).toBe(false);
      expect(await isMayor('2')).toBe(false);
    });

    // The `#` prefix is stripped once, for the whole payload, by
    // cacherGetPropertyList (spo_session.ts:1472-1474); individual values reach
    // this decoder unprefixed. A prefix that survived would read as false.
    it('reads a still-prefixed "#1" as false — the decoder is prefix-unaware', async () => {
      expect(await isMayor('#1')).toBe(false);
    });
  });
});

// ===========================================================================
// manageConstruction — the START / STOP / DOWN sequence
// ===========================================================================

describe('manageConstruction', () => {
  it('reads and locks RDOAcceptCloning on CurrBlock, then acts on ObjectId', async () => {
    const fake = makeConstructionCtx();

    const result = await settleConstruction(manageConstruction(fake.ctx, X, Y, 'START', 3));

    expect(result).toEqual({ status: 'OK' });
    expect(fake.ctx.connectConstructionService).toHaveBeenCalled();
    expect(propsAt(fake)).toHaveBeenCalledWith(X, Y, ['CurrBlock', 'ObjectId']);

    // 1. TARGET — the two cloning probes and the lock go to CurrBlock…
    expect(fake.sent.map(s => s.packet.targetId)).toEqual([CURR_BLOCK, CURR_BLOCK, CURR_BLOCK]);
    // …while the action itself goes to ObjectId. Distinct values on purpose.
    expect(fake.frames.construction[0]).toContain(`sel ${OBJECT_ID}`);
    expect(fake.frames.construction[0]).not.toContain(`sel ${CURR_BLOCK}`);

    // 2. VERB — get, set, get on the property; call on the action.
    expect(fake.sent.map(s => s.packet.action)).toEqual([RdoAction.GET, RdoAction.SET, RdoAction.GET]);
    expect(fake.sent.every(s => s.packet.verb === RdoVerb.SEL)).toBe(true);
    expect(fake.sent.every(s => s.packet.member === 'RDOAcceptCloning')).toBe(true);

    // 3. ARGUMENTS — the lock writes the Delphi wordbool TRUE, `#-1`, never `#1`.
    expect(fake.sent[1].packet.args).toEqual([RdoValue.int(-1).format()]);
    expect(fake.sent[0].packet.args).toBeUndefined();

    // 4. CATEGORY — all three property hops are SLOW.
    expect(fake.sent.every(s => s.category === TimeoutCategory.SLOW)).toBe(true);
    expect(fake.sent.every(s => s.socketName === 'construction')).toBe(true);
  });

  it('emits RDOStartUpgrades as a void push carrying the count', async () => {
    const fake = makeConstructionCtx();

    await settleConstruction(manageConstruction(fake.ctx, X, Y, 'START', 3));

    // procedure RDOStartUpgrades(count : integer) — Kernel.pas:1092. A void
    // member: `"*"` separator, NO QueryId. `"^"` here would freeze the server.
    expect(fake.frames.construction).toEqual([
      RdoCommand.sel(OBJECT_ID).call('RDOStartUpgrades').push().args(RdoValue.int(3)).build(),
    ]);
    expect(fake.frames.construction[0]).toMatchRdoCallFormat('RDOStartUpgrades');
    expect(fake.frames.construction[0]).toContain('"*"');
    expect(fake.frames.construction[0]).not.toMatch(/^C \d+ /); // no QueryId
  });

  it('defaults the upgrade count to 1 when the caller omits it', async () => {
    const fake = makeConstructionCtx();

    await settleConstruction(manageConstruction(fake.ctx, X, Y, 'START'));

    expect(fake.frames.construction[0]).toContain(RdoValue.int(1).format());
  });

  it('emits RDOStopUpgrade with no arguments', async () => {
    const fake = makeConstructionCtx();

    await settleConstruction(manageConstruction(fake.ctx, X, Y, 'STOP'));

    // procedure RDOStopUpgrade — Kernel.pas:1093, no parameters.
    expect(fake.frames.construction).toEqual([
      RdoCommand.sel(OBJECT_ID).call('RDOStopUpgrade').push().build(),
    ]);
  });

  it('emits RDODowngrade with no arguments', async () => {
    const fake = makeConstructionCtx();

    await settleConstruction(manageConstruction(fake.ctx, X, Y, 'DOWN'));

    // procedure RDODowngrade — Kernel.pas:1094, no parameters.
    expect(fake.frames.construction).toEqual([
      RdoCommand.sel(OBJECT_ID).call('RDODowngrade').push().build(),
    ]);
  });

  // `req.action` reaches this function straight from the browser message
  // (ws-handlers/misc-handlers.ts:35) with no runtime validation, so the guard
  // is reachable even though the TypeScript signature says otherwise.
  it('refuses an action outside START / STOP / DOWN without writing anything', async () => {
    const fake = makeConstructionCtx();

    const result = await manageConstruction(fake.ctx, X, Y, 'SIDEWAYS' as 'START');

    expect(result).toEqual({ status: 'ERROR', error: 'Unknown action: SIDEWAYS' });
    expect(fake.frames.construction).toEqual([]);
  });

  it('stops before the lock when no building sits at the coordinates', async () => {
    const fake = makeConstructionCtx();
    propsAt(fake).mockResolvedValue([CURR_BLOCK]); // one value, not two

    const result = await manageConstruction(fake.ctx, X, Y, 'START');

    expect(result).toEqual({ status: 'ERROR', error: `No building found at (${X}, ${Y})` });
    expect(fake.sent).toEqual([]);
    expect(fake.frames.construction).toEqual([]);
  });

  it('accepts RDOAcceptCloning=1, the existing-building value', async () => {
    const fake = makeConstructionCtx('1');

    const result = await settleConstruction(manageConstruction(fake.ctx, X, Y, 'DOWN'));

    expect(result.status).toBe('OK');
  });

  it('refuses to act when the block reports itself locked (-1)', async () => {
    const fake = makeConstructionCtx('-1');

    const result = await manageConstruction(fake.ctx, X, Y, 'START');

    expect(result.status).toBe('ERROR');
    expect(result.error).toContain('RDOAcceptCloning=-1');
    // Nothing was locked and nothing was pushed.
    expect(fake.sent).toHaveLength(1);
    expect(fake.frames.construction).toEqual([]);
  });

  it('refuses to act when the cloning probe answers nothing parseable', async () => {
    const fake = makeConstructionCtx();
    fake.respond(() => '');

    const result = await manageConstruction(fake.ctx, X, Y, 'START');

    expect(result.status).toBe('ERROR');
    expect(result.error).toContain('RDOAcceptCloning=NaN');
    expect(fake.frames.construction).toEqual([]);
  });

  it('reports the missing socket instead of pushing into the void', async () => {
    // Sockets default to absent in the fake — `getSocket` returns undefined for
    // any name not declared, which is exactly the disconnected-service branch.
    const fake = makeSessionCtx();
    propsAt(fake).mockResolvedValue([CURR_BLOCK, OBJECT_ID]);
    fake.respond(() => 'RDOAcceptCloning="#255"');

    const result = await manageConstruction(fake.ctx, X, Y, 'START');

    expect(result).toEqual({ status: 'ERROR', error: 'Construction socket unavailable' });
    // The block was still locked before the failure — the lock is not rolled back.
    expect(fake.sent).toHaveLength(2);
  });

  it('turns a rejected RDO request into an ERROR status, not a throw', async () => {
    const fake = makeConstructionCtx();
    fake.respond(() => new Error('Request timeout: RDOAcceptCloning'));

    const result = await manageConstruction(fake.ctx, X, Y, 'START');

    expect(result).toEqual({ status: 'ERROR', error: 'Request timeout: RDOAcceptCloning' });
    expect(fake.log.error).toHaveBeenCalled();
  });

  it('still reports OK when the closing probe comes back empty', async () => {
    const fake = makeConstructionCtx();
    // First two calls answer, the verification read returns a payload-less packet.
    const noPayload: RdoPacket = { raw: '', type: 'RESPONSE', rid: 9 };
    fake.respond((_p, n) => (n < 2 ? 'RDOAcceptCloning="#255"' : noPayload));

    const result = await settleConstruction(manageConstruction(fake.ctx, X, Y, 'STOP'));

    // Step 6 is a diagnostic read: its value is logged, never acted upon.
    expect(result).toEqual({ status: 'OK' });
  });

  it('serialises two concurrent requests on the same context', async () => {
    // construction-lock.ts:20 queues by ctx: the second sequence must not start
    // before the first has finished, or the two RDOAcceptCloning locks interleave.
    const fake = makeConstructionCtx();

    const first = manageConstruction(fake.ctx, X, Y, 'START', 2);
    const second = manageConstruction(fake.ctx, X + 1, Y, 'STOP');

    await jest.advanceTimersByTimeAsync(200);
    await first;
    await jest.advanceTimersByTimeAsync(200);
    await second;

    expect(fake.frames.construction).toEqual([
      RdoCommand.sel(OBJECT_ID).call('RDOStartUpgrades').push().args(RdoValue.int(2)).build(),
      RdoCommand.sel(OBJECT_ID).call('RDOStopUpgrade').push().build(),
    ]);
  });
});

// ===========================================================================
// upgradeBuildingAction — the WebSocket-facing wrapper
// ===========================================================================

describe('upgradeBuildingAction', () => {
  it('maps START_UPGRADE onto RDOStartUpgrades', async () => {
    const fake = makeConstructionCtx();

    const result = await settleConstruction(upgradeBuildingAction(fake.ctx, X, Y, 'START_UPGRADE', 2));

    expect(result).toEqual({ success: true, message: 'Upgrade started (2 levels)' });
    expect(fake.frames.construction[0]).toContain('call RDOStartUpgrades');
  });

  it('says "level" in the singular for a one-level upgrade', async () => {
    const fake = makeConstructionCtx();

    const result = await settleConstruction(upgradeBuildingAction(fake.ctx, X, Y, 'START_UPGRADE', 1));

    expect(result.message).toBe('Upgrade started (1 level)');
  });

  it('maps STOP_UPGRADE onto RDOStopUpgrade', async () => {
    const fake = makeConstructionCtx();

    const result = await settleConstruction(upgradeBuildingAction(fake.ctx, X, Y, 'STOP_UPGRADE'));

    expect(result).toEqual({ success: true, message: 'Upgrade stopped' });
    expect(fake.frames.construction[0]).toContain('call RDOStopUpgrade');
  });

  it('maps DOWNGRADE onto RDODowngrade', async () => {
    const fake = makeConstructionCtx();

    const result = await settleConstruction(upgradeBuildingAction(fake.ctx, X, Y, 'DOWNGRADE'));

    expect(result).toEqual({ success: true, message: 'Building downgraded' });
    expect(fake.frames.construction[0]).toContain('call RDODowngrade');
  });

  // ws-handlers/building-handlers.ts:272 forwards `req.action` from the browser
  // without validating it, so this guard is on a live path.
  it('rejects an unmapped action before any RDO traffic', async () => {
    const fake = makeConstructionCtx();

    const result = await upgradeBuildingAction(fake.ctx, X, Y, 'SIDEGRADE' as 'DOWNGRADE');

    expect(result).toEqual({ success: false, message: 'Unknown action: SIDEGRADE' });
    expect(fake.sent).toEqual([]);
    expect(fake.frames.construction).toEqual([]);
  });

  it('propagates the underlying error message on failure', async () => {
    const fake = makeConstructionCtx('-1');

    const result = await upgradeBuildingAction(fake.ctx, X, Y, 'DOWNGRADE');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Zone may be locked or busy');
  });

  // NOTE — the `result.error || 'Operation failed'` fallback at
  // building-management-handler.ts:242 is unreachable: every ERROR return of
  // `manageConstructionImpl` carries an `error` string. Reported as dead code
  // rather than reached through a mock of the function under test.

  // BUG connu (nouveau, lot 3) — building-management-handler.ts:238 interpolates
  // the RAW `count` into the message while the RDO call uses `count || 1`. With
  // the count omitted the user is told "(undefined levels)" for an upgrade that
  // did apply one level. Wire behaviour is correct; the message is not.
  it('reports "(undefined levels)" when the count is omitted — user-visible defect', async () => {
    const fake = makeConstructionCtx();

    const result = await settleConstruction(upgradeBuildingAction(fake.ctx, X, Y, 'START_UPGRADE'));

    expect(result.success).toBe(true);
    expect(result.message).toBe('Upgrade started (undefined levels)');
    // …while the frame that actually went out carries the correct default.
    expect(fake.frames.construction[0]).toContain(RdoValue.int(1).format());
  });
});

// ===========================================================================
// renameFacility — SET Name on the focused building id
// ===========================================================================

describe('renameFacility', () => {
  it('sets Name as a widestring on the id returned by focusBuilding', async () => {
    const fake = makeSessionCtx({ sockets: ['construction'] });
    focus(fake).mockResolvedValue({ buildingId: OBJECT_ID, buildingName: 'Old', ownerName: 'SPO_test3' });

    const result = await renameFacility(fake.ctx, X, Y, 'Usine Éclair');

    expect(result).toEqual({ success: true, message: 'Building renamed successfully' });
    expect(focus(fake)).toHaveBeenCalledWith(X, Y);
    expect(fake.sent).toHaveLength(1);

    const [{ packet, category, socketName }] = fake.sent;
    expect(socketName).toBe('construction');
    expect(packet.verb).toBe(RdoVerb.SEL);
    expect(packet.targetId).toBe(OBJECT_ID); // the id the server gave us, not x/y
    expect(packet.action).toBe(RdoAction.SET);
    expect(packet.member).toBe('Name');
    // `%` = OLESTRING. Name is a widestring property — a `$` here would be wrong.
    // `format()` yields the quoted token, so the prefix sits just inside the quote.
    expect(packet.args).toEqual([RdoValue.string('Usine Éclair').format()]);
    expect(packet.args?.[0]).toMatch(/^"%/);
    expect(category).toBe(TimeoutCategory.SLOW);
  });

  it('reuses the already-focused id instead of re-focusing', async () => {
    const fake = makeSessionCtx({
      sockets: ['construction'],
      currentFocusedBuildingId: OBJECT_ID,
      currentFocusedCoords: { x: X, y: Y },
    });

    await renameFacility(fake.ctx, X, Y, 'Renamed');

    expect(focus(fake)).not.toHaveBeenCalled();
    expect(fake.sent[0].packet.targetId).toBe(OBJECT_ID);
  });

  it('re-focuses when the focused coordinates belong to another building', async () => {
    const fake = makeSessionCtx({
      sockets: ['construction'],
      currentFocusedBuildingId: CURR_BLOCK,
      currentFocusedCoords: { x: X, y: Y + 1 },
    });
    focus(fake).mockResolvedValue({ buildingId: OBJECT_ID, buildingName: '', ownerName: '' });

    await renameFacility(fake.ctx, X, Y, 'Renamed');

    expect(focus(fake)).toHaveBeenCalledWith(X, Y);
    expect(fake.sent[0].packet.targetId).toBe(OBJECT_ID);
  });

  it('re-focuses when the x of the focused building differs', async () => {
    const fake = makeSessionCtx({
      sockets: ['construction'],
      currentFocusedBuildingId: CURR_BLOCK,
      currentFocusedCoords: { x: X + 1, y: Y },
    });
    focus(fake).mockResolvedValue({ buildingId: OBJECT_ID, buildingName: '', ownerName: '' });

    await renameFacility(fake.ctx, X, Y, 'Renamed');

    expect(focus(fake)).toHaveBeenCalled();
  });

  // Negative case: no id, no frame.
  it('emits nothing when focusBuilding returns no building id', async () => {
    const fake = makeSessionCtx({ sockets: ['construction'] });
    focus(fake).mockResolvedValue({ buildingId: '', buildingName: '', ownerName: '' });

    const result = await renameFacility(fake.ctx, X, Y, 'Nowhere');

    expect(result).toEqual({ success: false, message: 'Could not find building at specified coordinates' });
    expect(fake.sent).toEqual([]);
  });

  it('connects the construction service first when the socket is absent', async () => {
    const fake = makeSessionCtx(); // no sockets declared
    focus(fake).mockResolvedValue({ buildingId: OBJECT_ID, buildingName: '', ownerName: '' });

    const result = await renameFacility(fake.ctx, X, Y, 'Late');

    expect(fake.ctx.connectConstructionService).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('does not reconnect when the construction socket is already up', async () => {
    const fake = makeSessionCtx({ sockets: ['construction'] });
    focus(fake).mockResolvedValue({ buildingId: OBJECT_ID, buildingName: '', ownerName: '' });

    await renameFacility(fake.ctx, X, Y, 'Early');

    expect(fake.ctx.connectConstructionService).not.toHaveBeenCalled();
  });

  it('reports a rejected SET as a failure rather than throwing', async () => {
    const fake = makeSessionCtx({ sockets: ['construction'] });
    focus(fake).mockResolvedValue({ buildingId: OBJECT_ID, buildingName: '', ownerName: '' });
    fake.respond(() => new Error('Request timeout: Name'));

    const result = await renameFacility(fake.ctx, X, Y, 'Doomed');

    expect(result).toEqual({ success: false, message: 'Request timeout: Name' });
    expect(fake.log.error).toHaveBeenCalled();
  });

  it('reports a rejected focus as a failure', async () => {
    const fake = makeSessionCtx({ sockets: ['construction'] });
    focus(fake).mockRejectedValue(new Error('SwitchFocusEx failed'));

    const result = await renameFacility(fake.ctx, X, Y, 'Doomed');

    expect(result.success).toBe(false);
    expect(result.message).toBe('SwitchFocusEx failed');
    expect(fake.sent).toEqual([]);
  });

  // The server answers a refused SET with "error <code> setting <PropName>"
  // (RDOQueryServer.pas:344), which rdo.ts already parses into
  // errorCode/errorName. The response used to be discarded entirely, so a
  // rename the server refused (e.g. errUnexistentProperty,
  // RDOObjectServer.pas:176) came back to the caller as a success.
  it('reports a server-refused rename as a failure instead of a success', async () => {
    const fake = makeSessionCtx({ sockets: ['construction'] });
    focus(fake).mockResolvedValue({ buildingId: OBJECT_ID, buildingName: '', ownerName: '' });
    const refused: RdoPacket = {
      raw: '', type: 'RESPONSE', rid: 1, payload: 'error 15 setting Name',
      errorCode: 15, errorName: 'errUnexistentProperty',
    };
    fake.respond(() => refused);

    const result = await renameFacility(fake.ctx, X, Y, 'Refused');

    expect(result).toEqual({
      success: false,
      message: 'Building rename refused by the server (errUnexistentProperty)',
    });
    expect(fake.log.warn).toHaveBeenCalled();
  });

  it('falls back to the raw code when the server error is unnamed', async () => {
    const fake = makeSessionCtx({ sockets: ['construction'] });
    focus(fake).mockResolvedValue({ buildingId: OBJECT_ID, buildingName: '', ownerName: '' });
    const unnamed: RdoPacket = { raw: '', type: 'RESPONSE', rid: 1, errorCode: 42 };
    fake.respond(() => unnamed);

    const result = await renameFacility(fake.ctx, X, Y, 'Unnamed');

    expect(result).toEqual({
      success: false,
      message: 'Building rename refused by the server (error 42)',
    });
  });
});

// ===========================================================================
// deleteFacility — branches left open by building-mutations.test.ts (M-B)
// ===========================================================================

describe('deleteFacility', () => {
  it('calls RDODelFacility on the world id, never on the building block', async () => {
    const fake = makeSessionCtx({ sockets: ['construction'], worldId: '30430748' });
    fake.respond(() => 'res="#0"');

    await deleteFacility(fake.ctx, X, Y);

    const [{ packet, category }] = fake.sent;
    // `sel` uses the id from `idof World`, NOT CurrBlock — the comment at
    // building-management-handler.ts:344 is the whole point of this assertion.
    expect(packet.targetId).toBe('30430748');
    expect(packet.action).toBe(RdoAction.CALL);
    expect(packet.member).toBe('RDODelFacility');
    // A function, not a procedure: it answers `res="#<TErrorCode>"`, so `"^"`.
    expect(packet.separator).toBe('"^"');
    expect(packet.args).toEqual([RdoValue.int(X).format(), RdoValue.int(Y).format()]);
    expect(category).toBe(TimeoutCategory.SLOW);
  });

  it('refuses to send when the session never learned the world id', async () => {
    const fake = makeSessionCtx({ sockets: ['construction'], worldId: null });

    const result = await deleteFacility(fake.ctx, X, Y);

    expect(result).toEqual({
      success: false,
      message: 'Construction service not properly initialized - worldId is null',
    });
    expect(fake.sent).toEqual([]);
  });

  it('connects the construction service when the socket is absent', async () => {
    const fake = makeSessionCtx({ worldId: '30430748' });
    fake.respond(() => 'res="#0"');

    const result = await deleteFacility(fake.ctx, X, Y);

    expect(fake.ctx.connectConstructionService).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('reports a rejected call as a failure and keeps the focus', async () => {
    const fake = makeSessionCtx({ sockets: ['construction'], worldId: '30430748' });
    fake.respond(() => new Error('Request timeout: RDODelFacility'));

    const result = await deleteFacility(fake.ctx, X, Y);

    expect(result).toEqual({ success: false, message: 'Request timeout: RDODelFacility' });
    expect(fake.ctx.clearBuildingFocus).not.toHaveBeenCalled();
  });
});
