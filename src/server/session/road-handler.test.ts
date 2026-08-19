/**
 * road-handler — CreateCircuitSeg / BreakCircuitAt / WipeCircuit on the
 * `world` socket, all three Delphi FUNCTIONS returning an OleVariant error code
 * (World.pas:4311-4354 for RDOBreakCircuitAt), so all three go through
 * `sendRdoRequest` with `"^"` and a QueryId, TimeoutCategory.SLOW.
 *
 * Reference frame, live capture (road-build-rejected-captured.scenario.ts:1125):
 *   C 1083 sel {{logonId}} call CreateCircuitSeg "^" "#1","#272762984","#955","#1000","#955","#1001","#2000000"
 *   A1083 res="#22"
 * i.e. target = worldContextId (the Logon id, NOT interfaceServerId), args =
 * circuit 1, tycoon PROXY id, x1, y1, x2, y2, cost — every one an integer `#`.
 *
 * `generateRoadSegments` is module-private; it is observed through the frames
 * `buildRoad` emits: one for horizontal/vertical, a staircase of 1-tile
 * frames for a diagonal.
 *
 * The handler assembles its `#` args with template strings rather than
 * `RdoValue.int()` (road-handler.ts:182-190, :339-344, :411-418), so the
 * packet carries bare `#N` tokens where `RdoValue.int(N).format()` yields the
 * quoted form. `RdoProtocol.format()` emits identical bytes for both. The
 * expectations below decode both sides with `RdoParser.extract` and build the
 * expected side with `RdoValue.int()`, so the test states the *type* and value
 * — not a hand-written string.
 */

import { buildRoad, getRoadCostEstimate, demolishRoad, wipeCircuit, ROAD_COST_PER_TILE } from './road-handler';
import { makeSessionCtx, FAKE_CONTEXT_IDS } from '../__tests__/session/fake-session-context';
import type { FakeSessionCtx, SentRequest } from '../__tests__/session/fake-session-context';
import { RdoValue, RdoParser } from '../../shared/rdo-types';
import { RdoVerb, RdoAction } from '../../shared/types';
import { TimeoutCategory } from '../../shared/timeout-categories';

const WORLD = FAKE_CONTEXT_IDS.worldContextId;
// §4bis: the tycoon PROXY id (fTycoonProxyId) is what goes on the wire, not
// tycoonId; keep it distinct from both the context ids and every coordinate.
const TYCOON_PROXY = 272762984;
const OK = 'res="#0"';
const REJECTED_22 = 'res="#22"'; // the captured refusal

type Typed = { prefix: string; value: string };

/** Decode a packet's args with the codec, for comparison against `ints()`. */
function decoded(args: string[] | undefined): Typed[] {
  return (args ?? []).map(a => RdoParser.extract(a));
}

/** The decoded form of `RdoValue.int(v)` for each value — `#` prefix + digits. */
function ints(...values: number[]): Typed[] {
  return values.map(v => RdoParser.extract(RdoValue.int(v).format()));
}

function makeRoadCtx(): FakeSessionCtx {
  return makeSessionCtx({ sockets: ['world'], fTycoonProxyId: TYCOON_PROXY });
}

/** The (sx,sy,ex,ey) tuple of every CreateCircuitSeg the handler sent. */
function segmentsOf(sent: SentRequest[]): Array<[number, number, number, number]> {
  return sent.map(req => {
    const a = (req.packet.args ?? []).map(v => RdoParser.asInt(v));
    return [a[2], a[3], a[4], a[5]];
  });
}

// ===========================================================================
// buildRoad — wire form
// ===========================================================================

describe('buildRoad — CreateCircuitSeg frame', () => {
  it('targets the world context (Logon id) with "^", SLOW, and the seven # args in capture order', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => OK);

    const result = await buildRoad(fake.ctx, 955, 1000, 955, 1001);

    expect(fake.sent).toHaveLength(1);
    const [req] = fake.sent;
    expect(req.socketName).toBe('world');
    expect(req.category).toBe(TimeoutCategory.SLOW);
    expect(req.packet).toMatchObject({
      verb: RdoVerb.SEL,
      targetId: WORLD,
      action: RdoAction.CALL,
      member: 'CreateCircuitSeg',
      separator: '"^"',
    });
    expect(decoded(req.packet.args)).toEqual(ints(1, TYCOON_PROXY, 955, 1000, 955, 1001, ROAD_COST_PER_TILE));
    // fire-and-forget channel untouched
    expect(fake.frames.world).toHaveLength(0);
    expect(result).toEqual({ success: true, partial: false, cost: ROAD_COST_PER_TILE, tileCount: 1, message: 'Road built successfully: 1 tiles' });
  });

  it('never uses interfaceServerId or tycoonId as target or owner', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => OK);
    await buildRoad(fake.ctx, 0, 0, 3, 0);
    const req = fake.sent[0];
    expect(req.packet.targetId).not.toBe(FAKE_CONTEXT_IDS.interfaceServerId);
    expect(decoded(req.packet.args)[1]).not.toEqual(ints(parseInt(FAKE_CONTEXT_IDS.tycoonId, 10))[0]);
  });
});

// ===========================================================================
// buildRoad — segment generation, observed on the wire
// ===========================================================================

describe('buildRoad — segment generation', () => {
  it('a horizontal path is one segment with the full length and cost = tiles × ROAD_COST_PER_TILE', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => OK);

    const result = await buildRoad(fake.ctx, 10, 20, 14, 20);

    expect(segmentsOf(fake.sent)).toEqual([[10, 20, 14, 20]]);
    expect(RdoParser.asInt(fake.sent[0].packet.args![6])).toBe(4 * ROAD_COST_PER_TILE);
    expect(result).toMatchObject({ success: true, cost: 4 * ROAD_COST_PER_TILE, tileCount: 4 });
  });

  it('a vertical path is one segment', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => OK);

    const result = await buildRoad(fake.ctx, 10, 20, 10, 17);

    expect(segmentsOf(fake.sent)).toEqual([[10, 20, 10, 17]]);
    expect(result).toMatchObject({ success: true, cost: 3 * ROAD_COST_PER_TILE, tileCount: 3 });
  });

  it('a pure diagonal is a staircase of 1-tile segments starting on X, each costing one tile', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => OK);

    const result = await buildRoad(fake.ctx, 0, 0, 2, 2);

    expect(segmentsOf(fake.sent)).toEqual([
      [0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 2, 1], [2, 1, 2, 2],
    ]);
    for (const req of fake.sent) {
      expect(RdoParser.asInt(req.packet.args![6])).toBe(ROAD_COST_PER_TILE);
    }
    expect(result).toMatchObject({ success: true, cost: 4 * ROAD_COST_PER_TILE, tileCount: 4 });
  });

  it('an L-shaped path favours the axis with more distance remaining', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => OK);

    await buildRoad(fake.ctx, 0, 0, 3, 1);

    // X has 3 to go, Y 1: X, X, then tie (1 vs 1) → X, then Y
    expect(segmentsOf(fake.sent)).toEqual([
      [0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 3, 0], [3, 0, 3, 1],
    ]);
  });

  it('a diagonal with more Y than X moves Y first', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => OK);

    await buildRoad(fake.ctx, 5, 5, 6, 8);

    expect(segmentsOf(fake.sent)).toEqual([
      [5, 5, 5, 6], [5, 6, 5, 7], [5, 7, 6, 7], [6, 7, 6, 8],
    ]);
  });

  it('inverted coordinates step negatively, in the same staircase', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => OK);

    await buildRoad(fake.ctx, 2, 2, 0, 0);

    expect(segmentsOf(fake.sent)).toEqual([
      [2, 2, 1, 2], [1, 2, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0],
    ]);
  });

  it('a zero-length path is refused before anything is sent (errorCode 2)', async () => {
    const fake = makeRoadCtx();

    const result = await buildRoad(fake.ctx, 7, 7, 7, 7);

    expect(fake.sent).toHaveLength(0);
    expect(result).toEqual({ success: false, cost: 0, tileCount: 0, message: 'Start and end points must be different.', errorCode: 2 });
  });
});

// ===========================================================================
// buildRoad — server answers
// ===========================================================================

describe('buildRoad — server answers', () => {
  it('maps the captured res="#22" refusal to its message and returns failure with that code', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => REJECTED_22);

    const result = await buildRoad(fake.ctx, 955, 1000, 955, 1001);

    expect(result).toEqual({
      success: false, cost: 0, tileCount: 0,
      message: 'Cannot build a road at this location — area may be occupied or restricted',
      errorCode: 22,
    });
    expect(fake.log.warn).toHaveBeenCalledWith(expect.stringContaining('Segment 1 failed'));
  });

  it.each([
    [1, 'Road construction failed — please try a different location'],
    [2, 'Invalid road segment — check your coordinates'],
    [3, 'Permission denied — you may not have sufficient funds or rights to build here'],
    [4, 'Insufficient funds to build this road segment'],
    [5, 'Your company was not recognized — please reconnect'],
    [21, 'Unsupported road type'],
    [23, 'Cannot modify an existing road segment here'],
  ])('maps error code %i to its user message', async (code, message) => {
    const fake = makeRoadCtx();
    fake.respond(() => `res="#${code}"`);
    const result = await buildRoad(fake.ctx, 0, 0, 1, 0);
    expect(result).toMatchObject({ success: false, message, errorCode: code });
  });

  it('falls back to "Failed with code N" for an unmapped code', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => 'res="#99"');
    const result = await buildRoad(fake.ctx, 0, 0, 1, 0);
    expect(result).toMatchObject({ success: false, message: 'Failed with code 99', errorCode: 99 });
  });

  it('treats a payload without res="#N" as code -1 (truthy, so it is the reported errorCode)', async () => {
    // parseResultCode → -1 for a payload without res="#N"; -1 is truthy so it
    // is the errorCode reported, and the message is the generic fallback.
    const fake = makeRoadCtx();
    fake.respond(() => 'res="%"');
    const result = await buildRoad(fake.ctx, 0, 0, 1, 0);
    expect(result).toEqual({ success: false, cost: 0, tileCount: 0, message: 'Failed with code -1', errorCode: -1 });
  });

  it('keeps sending the remaining segments after one is refused and reports a partial road', async () => {
    const fake = makeRoadCtx();
    // 4 segments; refuse the second one
    fake.respond((_p, i) => (i === 1 ? REJECTED_22 : OK));

    const result = await buildRoad(fake.ctx, 0, 0, 2, 2);

    expect(fake.sent).toHaveLength(4);
    expect(result).toEqual({
      success: true,
      partial: true,
      cost: 3 * ROAD_COST_PER_TILE,
      tileCount: 3,
      message: 'Road partially built (3 tiles). Some segments failed: Cannot build a road at this location — area may be occupied or restricted',
    });
  });

  it('when every segment is refused, reports the LAST failure and no tiles', async () => {
    const fake = makeRoadCtx();
    fake.respond((_p, i) => (i === 0 ? 'res="#4"' : 'res="#3"'));

    const result = await buildRoad(fake.ctx, 0, 0, 1, 1);

    expect(fake.sent).toHaveLength(2);
    expect(result).toMatchObject({ success: false, cost: 0, tileCount: 0, errorCode: 3 });
  });

  it('a timeout is caught, logged and returned as a failure with the error message (no throw)', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => new Error('Request timeout: CreateCircuitSeg'));

    const result = await buildRoad(fake.ctx, 0, 0, 1, 0);

    expect(result).toEqual({ success: false, cost: 0, tileCount: 0, message: 'Request timeout: CreateCircuitSeg', errorCode: 1 });
    expect(fake.log.error).toHaveBeenCalledWith('[RoadBuilding] Failed to build road:', expect.any(Error));
  });

  it('a timeout mid-staircase abandons the rest of the segments', async () => {
    const fake = makeRoadCtx();
    fake.respond((_p, i) => (i === 1 ? new Error('Request timeout: CreateCircuitSeg') : OK));

    const result = await buildRoad(fake.ctx, 0, 0, 2, 2);

    expect(fake.sent).toHaveLength(2);
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// buildRoad — preconditions (§4bis: nothing leaves the process)
// ===========================================================================

describe('buildRoad — preconditions', () => {
  it('without the world socket: errorCode 1, nothing sent', async () => {
    const fake = makeSessionCtx({ fTycoonProxyId: TYCOON_PROXY });
    const result = await buildRoad(fake.ctx, 0, 0, 1, 0);
    expect(result).toEqual({ success: false, cost: 0, tileCount: 0, message: 'Interface server not connected', errorCode: 1 });
    expect(fake.sent).toHaveLength(0);
  });

  it('with worldContextId null: errorCode 1, nothing sent', async () => {
    const fake = makeSessionCtx({ sockets: ['world'], fTycoonProxyId: TYCOON_PROXY, worldContextId: null });
    const result = await buildRoad(fake.ctx, 0, 0, 1, 0);
    expect(result).toEqual({ success: false, cost: 0, tileCount: 0, message: 'World context not initialized', errorCode: 1 });
    expect(fake.sent).toHaveLength(0);
    expect(fake.frames.world).toHaveLength(0);
  });

  it('with no tycoon proxy id: asks to reconnect, nothing sent', async () => {
    // Explicit: the fake now carries a proxy id by default, because every
    // model-server member that dereferences a tycoon needs one.
    const fake = makeSessionCtx({ sockets: ['world'], fTycoonProxyId: null });
    const result = await buildRoad(fake.ctx, 0, 0, 1, 0);
    expect(result).toEqual({ success: false, cost: 0, tileCount: 0, message: 'Tycoon not initialized — reconnect', errorCode: 1 });
    expect(fake.sent).toHaveLength(0);
  });
});

// ===========================================================================
// getRoadCostEstimate — pure
// ===========================================================================

describe('getRoadCostEstimate', () => {
  it('uses the Chebyshev distance × ROAD_COST_PER_TILE', () => {
    expect(getRoadCostEstimate(0, 0, 3, 5)).toEqual({ cost: 5 * ROAD_COST_PER_TILE, tileCount: 5, costPerTile: ROAD_COST_PER_TILE, valid: true });
    expect(getRoadCostEstimate(10, 10, 4, 10)).toEqual({ cost: 6 * ROAD_COST_PER_TILE, tileCount: 6, costPerTile: ROAD_COST_PER_TILE, valid: true });
  });

  it('is invalid for identical points', () => {
    expect(getRoadCostEstimate(2, 2, 2, 2)).toEqual({
      cost: 0, tileCount: 0, costPerTile: ROAD_COST_PER_TILE, valid: false, error: 'Start and end points must be different',
    });
  });
});

// ===========================================================================
// demolishRoad — BreakCircuitAt
// ===========================================================================

describe('demolishRoad', () => {
  it('calls BreakCircuitAt on the world context with (circuit 1, tycoon proxy, x, y), "^", SLOW', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => OK);

    const result = await demolishRoad(fake.ctx, 955, 1000);

    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].socketName).toBe('world');
    expect(fake.sent[0].category).toBe(TimeoutCategory.SLOW);
    expect(fake.sent[0].packet).toMatchObject({
      verb: RdoVerb.SEL,
      targetId: WORLD,
      action: RdoAction.CALL,
      member: 'BreakCircuitAt',
      separator: '"^"',
    });
    expect(decoded(fake.sent[0].packet.args)).toEqual(ints(1, TYCOON_PROXY, 955, 1000));
    expect(result).toEqual({ success: true });
  });

  it.each([
    [1, 'Road demolition failed — please try a different location'],
    [15, 'Permission denied — you do not have rights to demolish roads here'],
    [21, 'Invalid circuit type'],
    [7, 'Failed with code 7'],
  ])('maps code %i to its message', async (code, message) => {
    const fake = makeRoadCtx();
    fake.respond(() => `res="#${code}"`);
    expect(await demolishRoad(fake.ctx, 1, 2)).toEqual({ success: false, message, errorCode: code });
    expect(fake.log.warn).toHaveBeenCalledWith(`[RoadDemolish] Failed at (1, 2): ${message}`);
  });

  it('a timeout is caught and reported as errorCode 1', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => new Error('Request timeout: BreakCircuitAt'));
    expect(await demolishRoad(fake.ctx, 1, 2)).toEqual({ success: false, message: 'Request timeout: BreakCircuitAt', errorCode: 1 });
  });

  it('with worldContextId null: nothing sent', async () => {
    const fake = makeSessionCtx({ worldContextId: null, fTycoonProxyId: TYCOON_PROXY });
    expect(await demolishRoad(fake.ctx, 1, 2)).toEqual({ success: false, message: 'Not connected to world', errorCode: 1 });
    expect(fake.sent).toHaveLength(0);
  });

  it('with no tycoon proxy id: nothing sent', async () => {
    const fake = makeSessionCtx({ fTycoonProxyId: null });
    expect(await demolishRoad(fake.ctx, 1, 2)).toEqual({ success: false, message: 'Tycoon not initialized — reconnect', errorCode: 1 });
    expect(fake.sent).toHaveLength(0);
  });
});

// ===========================================================================
// wipeCircuit — WipeCircuit
// ===========================================================================

describe('wipeCircuit', () => {
  it('calls WipeCircuit on the world context with the normalised rectangle, "^", SLOW', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => OK);

    // corners given inverted on both axes
    const result = await wipeCircuit(fake.ctx, 30, 40, 10, 20);

    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].socketName).toBe('world');
    expect(fake.sent[0].category).toBe(TimeoutCategory.SLOW);
    expect(fake.sent[0].packet).toMatchObject({
      verb: RdoVerb.SEL,
      targetId: WORLD,
      action: RdoAction.CALL,
      member: 'WipeCircuit',
      separator: '"^"',
    });
    expect(decoded(fake.sent[0].packet.args)).toEqual(ints(1, TYCOON_PROXY, 10, 20, 30, 40));
    expect(result).toEqual({ success: true });
    expect(fake.log.debug).toHaveBeenCalledWith('[RoadDemolish] Area wiped (10,20)→(30,40)');
  });

  it.each([
    [1, 'Road demolition failed — please try a different area'],
    [15, 'Permission denied — you do not have rights to demolish roads here'],
    [21, 'Invalid circuit type'],
    [8, 'Failed with code 8'],
  ])('maps code %i to its message', async (code, message) => {
    const fake = makeRoadCtx();
    fake.respond(() => `res="#${code}"`);
    expect(await wipeCircuit(fake.ctx, 0, 0, 1, 1)).toEqual({ success: false, message, errorCode: code });
  });

  it('a timeout is caught and reported as errorCode 1', async () => {
    const fake = makeRoadCtx();
    fake.respond(() => new Error('Request timeout: WipeCircuit'));
    expect(await wipeCircuit(fake.ctx, 0, 0, 1, 1)).toEqual({ success: false, message: 'Request timeout: WipeCircuit', errorCode: 1 });
  });

  it('with worldContextId null: nothing sent', async () => {
    const fake = makeSessionCtx({ worldContextId: null, fTycoonProxyId: TYCOON_PROXY });
    expect(await wipeCircuit(fake.ctx, 0, 0, 1, 1)).toEqual({ success: false, message: 'Not connected to world', errorCode: 1 });
    expect(fake.sent).toHaveLength(0);
  });

  it('with no tycoon proxy id: nothing sent', async () => {
    const fake = makeSessionCtx({ fTycoonProxyId: null });
    expect(await wipeCircuit(fake.ctx, 0, 0, 1, 1)).toEqual({ success: false, message: 'Tycoon not initialized — reconnect', errorCode: 1 });
    expect(fake.sent).toHaveLength(0);
  });
});
