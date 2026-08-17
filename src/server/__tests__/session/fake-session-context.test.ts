/**
 * Tests for the shared fake `SessionContext` factory.
 *
 * The helper is used by every subsequent lot of the RDO coverage mission, so
 * the three properties every one of those lots depends on are pinned here:
 * the `"*"` channel is captured through the REAL `writeRdoFrame` and decoded
 * latin1, a responder can reject, and an undeclared socket is absent.
 */

import { RdoCommand, RdoValue } from '../../../shared/rdo-types';
import { TimeoutCategory } from '../../../shared/timeout-categories';
import type { RdoPacket } from '../../../shared/types';
import { writeRdoFrame } from '../../rdo-helpers';
import { makeLoginCtx, makePushCtx, makeSessionCtx, FAKE_CONTEXT_IDS } from './fake-session-context';
import { SessionPhase } from '../../../shared/types';

// ── The fire-and-forget "*" channel ─────────────────────────────────────────

describe('makeSessionCtx — writeRdoFrame capture', () => {
  it('captures the frame through the real writeRdoFrame, decoded latin1', () => {
    const { ctx, frames } = makeSessionCtx({ sockets: ['construction'] });
    // Accented text is the whole point of the L1 codec: `writeRdoFrame` writes
    // Buffer.from(frame, 'latin1'), where "é" is the single byte 0xE9.
    // A capture that decoded UTF-8 would hand the test back U+FFFD.
    const frame = RdoCommand.sel(FAKE_CONTEXT_IDS.worldContextId)
      .call('SayThis')
      .push()
      .args(RdoValue.string('Café'))
      .build();

    const accepted = writeRdoFrame(ctx.getSocket('construction')!, frame);

    expect(accepted).toBe(true);
    expect(frames.construction).toEqual([frame]);
    expect(frames.construction[0]).toContain('Café');
  });

  it('keeps one frame list per socket, in write order', () => {
    const { ctx, frames } = makeSessionCtx({ sockets: ['world', 'mail'] });
    const first = RdoCommand.sel('1001').call('ClientAware').push().build();
    const second = RdoCommand.sel('1001').call('KeepAlive').push().build();

    writeRdoFrame(ctx.getSocket('world')!, first);
    writeRdoFrame(ctx.getSocket('world')!, second);

    expect(frames.world).toEqual([first, second]);
    // Seeded, not absent — "nothing was emitted on mail" is directly assertable.
    expect(frames.mail).toEqual([]);
  });

  it('leaves an undeclared socket absent, which is the default for every name', () => {
    const { ctx } = makeSessionCtx({ sockets: ['world'] });

    expect(ctx.getSocket('world')).toBeDefined();
    expect(ctx.getSocket('construction')).toBeUndefined();
    expect(makeSessionCtx().ctx.getSocket('world')).toBeUndefined();
  });

  it('gives each factory call its own capture buffers', () => {
    const a = makeSessionCtx({ sockets: ['world'] });
    const b = makeSessionCtx({ sockets: ['world'] });

    writeRdoFrame(a.ctx.getSocket('world')!, RdoCommand.sel('1001').call('ClientAware').push().build());

    expect(a.frames.world).toHaveLength(1);
    expect(b.frames.world).toEqual([]);
  });
});

// ── The synchronous "^" channel ─────────────────────────────────────────────

describe('makeSessionCtx — sendRdoRequest capture', () => {
  it('records socket name, packet, timeout and category in call order', async () => {
    const { ctx, sent } = makeSessionCtx();

    await ctx.sendRdoRequest('world', { member: 'GetPropertyList' }, undefined, TimeoutCategory.FAST);
    await ctx.sendRdoRequest('mail', { member: 'CheckNewMail' }, 4200, TimeoutCategory.SLOW);

    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual({
      socketName: 'world',
      packet: { member: 'GetPropertyList' },
      timeoutMs: undefined,
      category: TimeoutCategory.FAST,
    });
    expect(sent[1].socketName).toBe('mail');
    expect(sent[1].timeoutMs).toBe(4200);
    expect(sent[1].category).toBe(TimeoutCategory.SLOW);
  });

  it('answers with an empty payload until the test declares one', async () => {
    const { ctx } = makeSessionCtx();

    const response = await ctx.sendRdoRequest('world', { member: 'Anything' }, undefined, TimeoutCategory.FAST);

    // No business default: a handler that needs `res="#0"` has to say so.
    expect(response.payload).toBe('');
    expect(response.type).toBe('RESPONSE');
  });

  it('wraps a responder string as the response payload', async () => {
    const { ctx, respond } = makeSessionCtx();
    respond(() => 'res="#0"');

    const response = await ctx.sendRdoRequest('world', { member: 'RDODelFacility' }, undefined, TimeoutCategory.SLOW);

    expect(response.payload).toBe('res="#0"');
  });

  it('returns a responder packet untouched, so errorCode can be exercised', async () => {
    const { ctx, respond } = makeSessionCtx();
    const canned: RdoPacket = { raw: 'A 1 error 17', type: 'RESPONSE', rid: 1, errorCode: 17, errorName: 'errServerBusy' };
    respond(() => canned);

    const response = await ctx.sendRdoRequest('world', { member: 'GetPropertyList' }, undefined, TimeoutCategory.FAST);

    expect(response).toBe(canned);
  });

  it('rejects when the responder returns an Error — the timeout branch', async () => {
    const { ctx, respond, sent } = makeSessionCtx();
    // Production rejects with exactly this shape (spo_session.ts:2403).
    respond((packet) => new Error(`Request timeout: ${packet.member}`));

    await expect(
      ctx.sendRdoRequest('world', { member: 'GetPropertyList' }, undefined, TimeoutCategory.FAST),
    ).rejects.toThrow('Request timeout: GetPropertyList');
    // The call is still recorded: what the handler emitted before failing matters.
    expect(sent).toHaveLength(1);
  });

  it('hands the responder a 0-based call index so a sequence can differ', async () => {
    const { ctx, respond } = makeSessionCtx();
    respond((_packet, callIndex) => (callIndex === 0 ? 'res="%first"' : 'res="%later"'));

    const first = await ctx.sendRdoRequest('world', { member: 'GetPropertyList' }, undefined, TimeoutCategory.FAST);
    const second = await ctx.sendRdoRequest('world', { member: 'GetPropertyList' }, undefined, TimeoutCategory.FAST);

    expect(first.payload).toBe('res="%first"');
    expect(second.payload).toBe('res="%later"');
  });
});

// ── No business defaults ────────────────────────────────────────────────────

describe('makeSessionCtx — defaults are plumbing only', () => {
  it('leaves the reads that carry business data unimplemented', () => {
    const { ctx } = makeSessionCtx();

    // No implementation at all: the call yields `undefined` rather than a
    // promise of a plausible value. A handler that awaits it and indexes the
    // result throws a TypeError naming the line — which is the point. A shared
    // default such as `['8161308','8161308']` would instead let a test pass
    // while asserting someone else's fixture.
    expect(ctx.cacherGetPropertyList('7', ['CurrBlock'])).toBeUndefined();
    expect(ctx.cacherCreateObject()).toBeUndefined();
    expect(ctx.fetchAspPage('/Visual/TycoonReport.asp')).toBeUndefined();
    expect(ctx.focusBuilding(706, 436)).toBeUndefined();
  });

  it('resolves the cacher writes and the service connections quietly', async () => {
    const { ctx, cacher } = makeSessionCtx();

    await expect(ctx.cacherSetObject('7', 706, 436)).resolves.toBeUndefined();
    await expect(ctx.connectConstructionService()).resolves.toBeUndefined();
    ctx.cacherCloseObject('7');

    expect(cacher.setObject).toHaveBeenCalledWith('7', 706, 436);
    expect(cacher.closeObject).toHaveBeenCalledWith('7');
  });

  it('never returns the input from convertToProxyUrl', () => {
    const { ctx } = makeSessionCtx();
    const remote = 'http://158.69.153.134/img/logo.gif';

    // An identity default would let a handler that forgot to proxy pass.
    expect(ctx.convertToProxyUrl(remote)).not.toBe(remote);
    expect(ctx.convertToProxyUrl(remote)).toContain(remote);
  });

  it('gives every context id a distinct value', () => {
    const { ctx } = makeSessionCtx();
    const ids = [ctx.worldContextId, ctx.interfaceServerId, ctx.tycoonId, ctx.cacherId, ctx.worldId];

    expect(new Set(ids).size).toBe(ids.length);
    expect(ctx.currentWorldInfo).toBeNull();
    expect(ctx.currentCompany).toBeNull();
  });
});

// ── Overrides ───────────────────────────────────────────────────────────────

describe('makeSessionCtx — overrides', () => {
  it('replaces a plumbing default, including with null', () => {
    const { ctx } = makeSessionCtx({ worldContextId: null, worldXSize: 1000 });

    expect(ctx.worldContextId).toBeNull();
    expect(ctx.worldXSize).toBe(1000);
    expect(ctx.cacherId).toBe(FAKE_CONTEXT_IDS.cacherId);
  });

  it('points the cacher handles at an overridden mock, not the discarded one', async () => {
    const replacement = jest.fn(async () => ['40133496', '40133497']);
    const { ctx, cacher } = makeSessionCtx({ cacherGetPropertyList: replacement });

    await ctx.cacherGetPropertyList('7', ['CurrBlock', 'ObjectId']);

    expect(cacher.getPropertyList).toBe(replacement);
    expect(cacher.getPropertyList).toHaveBeenCalledTimes(1);
  });

  it('exposes the log sinks for assertion', () => {
    const { ctx, log } = makeSessionCtx();

    ctx.log.warn('[Test] something odd');

    expect(log.warn).toHaveBeenCalledWith('[Test] something odd');
  });
});

// ── LoginContext ────────────────────────────────────────────────────────────

describe('makeLoginCtx', () => {
  it('starts empty — no world, no credentials, no phase', () => {
    const { ctx, state } = makeLoginCtx();

    expect(ctx.worldContextId).toBeNull();
    expect(ctx.currentWorldInfo).toBeNull();
    expect(ctx.cachedPassword).toBeNull();
    expect(ctx.getPhase()).toBe(SessionPhase.DISCONNECTED);
    expect(state.availableCompanies).toEqual([]);
    expect(state.knownObjects.size).toBe(0);
  });

  it('reads back what a setter wrote — the login sequence depends on it', () => {
    const { ctx } = makeLoginCtx();

    // `fullWorldRelogin` writes RDOCnntId and then reads it back to build
    // RegisterEventsById; a fake that only recorded would skip that frame.
    ctx.setRdoCnntId('40530807');
    ctx.setWorldContextId('8161308');
    ctx.setTycoonId('4666201923');

    expect(ctx.rdoCnntId).toBe('40530807');
    expect(ctx.worldContextId).toBe('8161308');
    expect(ctx.tycoonId).toBe('4666201923');
    expect(ctx.setRdoCnntId).toHaveBeenCalledWith('40530807');
  });

  it('registers a socket it was asked to create, and captures its frames latin1', async () => {
    const { ctx, frames, hooks } = makeLoginCtx();

    const socket = await ctx.createSocket('directory_auth', 'www.starpeaceonline.com', 1111);
    writeRdoFrame(socket, RdoCommand.sel('44917624').call('RDOEndSession').push().build());

    expect(hooks.createSocket).toHaveBeenCalledWith('directory_auth', 'www.starpeaceonline.com', 1111);
    expect(ctx.getSocket('directory_auth')).toBe(socket);
    expect(frames.directory_auth).toEqual(['C sel 44917624 call RDOEndSession "*";']);

    ctx.deleteSocket('directory_auth');
    expect(ctx.getSocket('directory_auth')).toBeUndefined();
    expect(ctx.getSocketNames()).toEqual([]);
  });

  it('pre-opens the sockets a test declares, and nothing else', () => {
    const { ctx, frames } = makeLoginCtx({ sockets: ['world'] });

    expect(ctx.getSocket('world')).toBeDefined();
    expect(ctx.getSocket('map')).toBeUndefined();
    expect(frames.world).toEqual([]);
  });

  it('captures the "^" channel and rejects on demand, like the session fake', async () => {
    const { ctx, sent, respond } = makeLoginCtx();
    respond(packet => (packet.member === 'Logon'
      ? 'res="#8161308"'
      : new Error('Request timeout: RegisterEventsById')));

    await expect(ctx.sendRdoRequest('world', { member: 'Logon' }, undefined, TimeoutCategory.NORMAL))
      .resolves.toMatchObject({ payload: 'res="#8161308"' });
    await expect(ctx.sendRdoRequest('world', { member: 'RegisterEventsById' }, undefined, TimeoutCategory.NORMAL))
      .rejects.toThrow('Request timeout: RegisterEventsById');

    expect(sent.map(s => s.packet.member)).toEqual(['Logon', 'RegisterEventsById']);
  });

  it('takes the initial state a test declares', () => {
    const { ctx, state } = makeLoginCtx({
      cachedUsername: 'SPO_test3',
      cachedPassword: 'test3',
      phase: SessionPhase.WORLD_CONNECTED,
    });

    expect(ctx.cachedUsername).toBe('SPO_test3');
    expect(ctx.cachedPassword).toBe('test3');
    expect(state.phase).toBe(SessionPhase.WORLD_CONNECTED);
  });
});

// ── PushContext ─────────────────────────────────────────────────────────────

describe('makePushCtx', () => {
  it('mocks every setter and returns the quiescent value from the gating getters', () => {
    const { ctx, emit } = makePushCtx();

    expect(ctx.getWaitingForInitClient()).toBe(false);
    expect(ctx.getInitClientResolver()).toBeNull();
    expect(ctx.getVirtualDate()).toBeNull();
    expect(ctx.getCurrentChannel()).toBe('');
    expect(ctx.getLastRanking()).toBe(0);

    ctx.setAccountMoney('419278163478');
    ctx.emit('gameDate', 78006);

    expect(ctx.setAccountMoney).toHaveBeenCalledWith('419278163478');
    expect(emit).toHaveBeenCalledWith('gameDate', 78006);
  });

  it('lets a test open the InitClient login window', () => {
    const { ctx } = makePushCtx({ getWaitingForInitClient: jest.fn(() => true) });

    expect(ctx.getWaitingForInitClient()).toBe(true);
  });

  it('records the push log lines', () => {
    const { ctx, log } = makePushCtx();

    ctx.log.debug('[Session] Server sent InitClient push');

    expect(log.debug).toHaveBeenCalledWith('[Session] Server sent InitClient push');
  });
});
