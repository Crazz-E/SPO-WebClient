/**
 * Tests for the live probe harness (lot L9-pré).
 *
 * The frames are asserted against `report/campaign/sondes-live-U1-U6.md`, and
 * the refusals are asserted at least as hard: this is the one module in the
 * project whose failure mode is "froze the shared live Interface Server", so the
 * guards that stop it firing matter more than the frames it fires.
 *
 * Several assertions target the WORDING of the refusals. That is deliberate:
 * the refusals are the only place where the observed fact (SayThis froze the
 * server on 2026-08-15) and the untested inference (ClientAware should be safe
 * because it takes no parameters) are held apart. Prose that merges them is how
 * a probe gets fired on a false sense of proof.
 */

import {
  parseProbeArgs,
  ProbeRefusal,
  emitProbeFrame,
  runProbe,
  PROBES,
  SAFE_PROBES,
  U1A_FRAMES,
  U1A_EVIDENCE,
  U4A_FRAMES,
  U6_FRAMES,
  FREE_SPACE_ZONE_PATH,
  type ProbeFrame,
} from './rdo-probe';
import { RdoAction, RdoVerb } from '../shared/types';
import { TimeoutCategory } from '../shared/timeout-categories';
import type { StarpeaceSession } from '../server/spo_session';

const BASE_ARGS = ['--probe', 'u6', '--live'];

describe('rdo-probe — refusals', () => {
  it('refuses to run without --live', () => {
    expect(() => parseProbeArgs(['--probe', 'u6'], {}))
      .toThrow(ProbeRefusal);
  });

  it('refuses an unknown probe name', () => {
    expect(() => parseProbeArgs(['--probe', 'u9', '--live'], {}))
      .toThrow(/Unknown probe/);
  });

  it('refuses with no --probe at all', () => {
    expect(() => parseProbeArgs(['--live'], {})).toThrow(/Missing --probe/);
  });

  // The whole point of the flag. u1a emits "^" on a Delphi procedure.
  it('refuses u1a unless --allow-u1a is given as well', () => {
    expect(() => parseProbeArgs(['--probe', 'u1a', '--live'], {}))
      .toThrow(ProbeRefusal);
  });

  it('reports the 2026-08-16 result rather than a prediction', () => {
    // Ran live and answered error 9 without freezing. A refusal that still
    // described this as unknown would be stale, and staleness here is how a
    // settled question gets re-probed against a shared server for nothing.
    expect(() => parseProbeArgs(['--probe', 'u1a', '--live'], {}))
      .toThrow(/2026-08-16.*error 9.*errIllegalFunctionRes/s);
  });

  it('keeps the 2026-08-15 freeze as the contrast case', () => {
    expect(() => parseProbeArgs(['--probe', 'u1a', '--live'], {}))
      .toThrow(/2026-08-15.*SayThis/s);
  });

  it('says the question is settled, so re-running is not justified by curiosity', () => {
    expect(() => parseProbeArgs(['--probe', 'u1a', '--live'], {}))
      .toThrow(/SETTLED/);
  });

  it('accepts u1a only with both flags', () => {
    const opts = parseProbeArgs(['--probe', 'u1a', '--live', '--allow-u1a'], {});
    expect(opts.probes).toEqual(['u1a']);
    expect(opts.allowU1a).toBe(true);
  });

  // U2 is cancelled for good — one frame of it froze the server. The harness
  // must not merely omit it; it must say no.
  it('refuses U2 by name, permanently', () => {
    expect(() => parseProbeArgs(['--probe', 'u2', '--live'], {}))
      .toThrow(/Unknown probe/);
  });

  it('excludes u1a from --probe all', () => {
    const opts = parseProbeArgs(['--probe', 'all', '--live'], {});
    expect(opts.probes).toEqual([...SAFE_PROBES]);
    expect(opts.probes).not.toContain('u1a');
  });

  it('defaults to the locked E2E account and Free Space / planitia', () => {
    const opts = parseProbeArgs(BASE_ARGS, {});
    expect(opts.username).toBe('SPO_test3');
    expect(opts.world).toBe('planitia');
    // "Free Space" is a UI LABEL; the directory path is America
    // (WORLD_ZONES, protocol-types.ts:85). Passing the label as a path is not an
    // error — the directory just answers an empty world list, and the probe
    // aborts with "World not in the directory listing". Caught live 2026-08-16.
    expect(opts.zonePath).toBe(FREE_SPACE_ZONE_PATH);
    expect(opts.zonePath).toBe('Root/Areas/America/Worlds');
    expect(opts.zonePath).not.toContain('Free Space');
  });

  it('lets the environment override credentials without touching argv', () => {
    const opts = parseProbeArgs(BASE_ARGS, { SPO_PROBE_USER: 'other', SPO_PROBE_PASS: 'secret' });
    expect(opts.username).toBe('other');
    expect(opts.password).toBe('secret');
  });
});

describe('rdo-probe — frames match the probe specification', () => {
  it('U6 reads exactly the three TClientView string properties, as pure gets', () => {
    expect(U6_FRAMES.map(f => f.packet.member)).toEqual(['UserName', 'MailAccount', 'CompositeName']);
    for (const frame of U6_FRAMES) {
      expect(frame.packet.action).toBe(RdoAction.GET);
      expect(frame.packet.verb).toBe(RdoVerb.SEL);
      // A `get` carries no separator and no arguments — that is what makes U6
      // risk-free (rdo.ts:354-365).
      expect(frame.packet.args).toBeUndefined();
    }
  });

  it('U4-a sends the four literals in spec order, control first', () => {
    expect(U4A_FRAMES.map(f => f.packet.args?.[0])).toEqual([
      '"#1"', '"@1"', '"@1234.5"', '"!3.14"',
    ]);
    // Order is load-bearing: "#1" is the control. Interpreting "@1234.5"
    // without it having answered error 3 first is meaningless.
    expect(U4A_FRAMES[0].intent).toMatch(/control/);
  });

  it('U4-a targets a property that must NOT exist, so nothing is written', () => {
    for (const frame of U4A_FRAMES) {
      expect(frame.packet.action).toBe(RdoAction.SET);
      expect(frame.packet.member).toBe('RdoProbeU4');
    }
  });

  it('U1-a is exactly one frame and is never repeated', () => {
    expect(U1A_FRAMES).toHaveLength(1);
    expect(U1A_FRAMES[0].packet.member).toBe('ClientAware');
    expect(U1A_FRAMES[0].packet.action).toBe(RdoAction.CALL);
    // 0 parameters is the entire safety argument (RDOObjectServer.pas:281-292).
    expect(U1A_FRAMES[0].packet.args).toBeUndefined();
  });

  // The mechanism as data, so it cannot drift in prose. Both halves are now
  // observed live, and together they bracket RDOObjectServer.pas:281-292: the
  // hidden result pointer is harmless in a register and fatal on the stack.
  it('brackets the mechanism — stack position is what decides freeze vs error', () => {
    const { observedFreeze, observedBalanced } = U1A_EVIDENCE;

    // The ONLY difference between the two cases is where the pointer lands,
    // and that follows from the parameter count. If a future edit made these
    // agree on hiddenPointerOnStack, the bracket would prove nothing.
    expect(observedFreeze.hiddenPointerOnStack).toBe(true);
    expect(observedBalanced.hiddenPointerOnStack).toBe(false);
    expect(observedFreeze.paramCount).toBeGreaterThan(observedBalanced.paramCount);
    expect(observedBalanced.paramCount).toBe(0);

    expect(observedFreeze.outcome).toBe('freeze');
    expect(observedBalanced.outcome).toBe('error 9');
  });

  it('records the balanced case as an ERROR reply, never an ack', () => {
    // This is why "^" on a procedure stays a wire divergence even when it does
    // not freeze: the server answers errIllegalFunctionRes, so the call site
    // never learns the procedure actually ran. VOID_MEMBERS remains right.
    expect(U1A_EVIDENCE.observedBalanced.errorCode).toBe(9);
    expect(U1A_EVIDENCE.observedBalanced.errorName).toBe('errIllegalFunctionRes');
  });

  it('fires at the balanced case, never at the one that froze the server', () => {
    expect(U1A_FRAMES[0].packet.member).toBe(U1A_EVIDENCE.observedBalanced.member);
    expect(U1A_FRAMES[0].packet.member).not.toBe(U1A_EVIDENCE.observedFreeze.member);
  });

  it('cites Delphi lines for both halves of the mechanism', () => {
    expect(U1A_EVIDENCE.observedFreeze.citation).toMatch(/\.pas:\d+/);
    expect(U1A_EVIDENCE.observedBalanced.citation).toMatch(/\.pas:\d+/);
  });

  it('exposes no probe beyond the three specified', () => {
    expect(Object.keys(PROBES).sort()).toEqual(['u1a', 'u4a', 'u6']);
  });
});

describe('rdo-probe — execution', () => {
  const frame: ProbeFrame = {
    probe: 'test',
    intent: 'unit',
    packet: { verb: RdoVerb.SEL, action: RdoAction.GET, member: 'UserName' },
  };

  function fakeSession(executeRdo: jest.Mock): StarpeaceSession {
    return { executeRdo } as unknown as StarpeaceSession;
  }

  it('emits through executeRdo on the world socket, at the FAST deadline', async () => {
    const executeRdo = jest.fn().mockResolvedValue('UserName="$SPO_test3"');
    const result = await emitProbeFrame(fakeSession(executeRdo), '8161308', frame);

    expect(executeRdo).toHaveBeenCalledWith('world', {
      verb: RdoVerb.SEL,
      targetId: '8161308',
      action: RdoAction.GET,
      member: 'UserName',
      args: undefined,
    }, TimeoutCategory.FAST);
    expect(result.response).toBe('UserName="$SPO_test3"');
    expect(result.error).toBeUndefined();
  });

  it('records an unanswered frame as a result instead of throwing', async () => {
    // Silence IS the oracle for the worst outcome — the spec's ARRÊT TOTAL row.
    // Throwing here would lose the observation.
    const executeRdo = jest.fn().mockRejectedValue(new Error('Request timeout'));
    const result = await emitProbeFrame(fakeSession(executeRdo), '8161308', frame);

    expect(result.response).toBeNull();
    expect(result.error).toMatch(/Request timeout/);
  });

  it('stops at the first unanswered frame and sends nothing further', async () => {
    const executeRdo = jest.fn()
      .mockResolvedValueOnce('ok')
      .mockRejectedValueOnce(new Error('Request timeout'));
    const reported: string[] = [];

    const results = await runProbe(
      fakeSession(executeRdo),
      '8161308',
      [frame, frame, frame],
      r => reported.push(r.response ?? 'NONE'),
    );

    // Three frames were offered; two were sent; the third must never go out.
    expect(executeRdo).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(reported).toEqual(['ok', 'NONE']);
  });

  it('reports every frame as it happens, not only at the end', async () => {
    const executeRdo = jest.fn().mockResolvedValue('ok');
    const reported: number[] = [];

    await runProbe(fakeSession(executeRdo), '8161308', U4A_FRAMES, () => {
      reported.push(executeRdo.mock.calls.length);
    });

    // A probe that batches its output tells you nothing while it is running,
    // which is when you would want to stop it.
    expect(reported).toEqual([1, 2, 3, 4]);
  });
});
