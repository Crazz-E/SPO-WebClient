/**
 * Live RDO probe harness — lot L9-pré.
 *
 * Executes the probes specified in `report/campaign/sondes-live-U1-U6.md`
 * against the REAL production Delphi servers, over a real StarpeaceSession:
 * directory logon → world logon → probe frames → clean Logoff.
 *
 * ## Read this before running it
 *
 * These frames go to a SHARED live Interface Server — the planitia test server,
 * which other clients connect to. On 2026-08-15 a single probe frame froze it.
 * Nothing here runs without an explicit flag, and the frames that carry real
 * risk need a second, separate one.
 *
 * Observed 2026-08-16 10:03 UTC: the server answered all seven u6+u4a frames in
 * 90-98 ms each, logged a clean logon/logoff, and its simulation loop resumed
 * 3 s later with zero exceptions that day. The harness itself is proven good.
 *
 * The harness deliberately talks to `StarpeaceSession` rather than reproducing
 * the wire format: a probe that hand-builds its own frames is testing the probe,
 * not the client. Every frame below is produced by the same `RdoProtocol.format`
 * path production uses.
 *
 * ## Probes
 *
 * | Probe  | Frames                                   | Risk |
 * |--------|------------------------------------------|------|
 * | `u6`   | `get UserName / MailAccount / CompositeName` | none — pure reads |
 * | `u4a`  | `set RdoProbeU4="…"` ×4, property does not exist | none — parses the literal, writes nothing |
 * | `u1a`  | `call ClientAware "^"` ×1                 | **NOT NONE — see below** |
 *
 * `u1a` emits the VariantId separator on a Delphi `procedure`. **It has now been
 * run** (2026-08-16 10:52 UTC) and it answered `A<rid> error 9;`
 * (`errIllegalFunctionRes`) in 91 ms without freezing anything. Together with
 * the 2026-08-15 freeze it brackets the mechanism — see {@link U1A_EVIDENCE}.
 *
 * It still requires `--allow-u1a` on top of `--live`, and it is still excluded
 * from `--probe all`. The question it answered is settled; re-running it buys
 * nothing, and it remains a `"^"`-on-a-procedure frame.
 *
 * U2 is CANCELLED permanently and is not implemented here. Do not add it.
 *
 * ## Usage
 *
 *   node dist/tools/rdo-probe.js --probe u6 --live
 *   node dist/tools/rdo-probe.js --probe u4a --live
 *   node dist/tools/rdo-probe.js --probe all --live          # u6 + u4a only
 *   node dist/tools/rdo-probe.js --probe u1a --live --allow-u1a
 *
 * Credentials come from SPO_PROBE_USER / SPO_PROBE_PASS, defaulting to the
 * locked E2E account (CLAUDE.md). World and zone default to planitia / Free Space.
 */

import { StarpeaceSession } from '../server/spo_session';
import { RdoVerb, RdoAction } from '../shared/types';
import type { WorldInfo } from '../shared/types';
import { TimeoutCategory } from '../shared/timeout-categories';
import { toErrorMessage } from '../shared/error-utils';

/**
 * TODO (session dédiée — mise en place du test protocolaire en production).
 *
 * This harness is currently a *specific* one: three hard-coded probes, each
 * with its oracle written in prose in `report/campaign/sondes-live-U1-U6.md`
 * and evaluated by a human reading the output. That was right for one-shot
 * investigation. It is the wrong shape for a protocol conformity suite run on
 * every release, which is where this is heading.
 *
 * What it needs to become generic — in rough dependency order:
 *
 * 1. **Declarative oracle per frame.** `ProbeFrame` gains an `expect` field —
 *    an exact payload, a pattern, or a predicate — so `runProbe` can return a
 *    verdict instead of raw text. Today the oracle tables live in Markdown and
 *    a human matches them by eye; that does not scale past a handful of frames
 *    and cannot fail a build.
 * 2. **Machine-readable output.** A `--json` mode emitting `ProbeResult[]` plus
 *    verdicts, so CI consumes it. Keep the human-readable log as the default.
 * 3. **Exit code from the verdicts**, so a divergence fails the pipeline.
 * 4. **Suites rather than a flat probe list.** Group frames by what they pin
 *    (type prefixes, separator matrix, error codes, session lifecycle) instead
 *    of by the investigation that happened to create them. The `u6` / `u4a`
 *    names are historical and should not survive the refactor.
 * 5. **Keep the risk tiering.** `--live`, `--allow-u1a` and the stop-on-silence
 *    rule are not scaffolding to remove: a conformity suite that can freeze a
 *    shared server needs them more than a one-shot probe did, not less.
 * 6. **Baseline capture.** Record answers on a known-good run and diff against
 *    it, so unexpected server-side changes surface without a hand-written
 *    expectation for every frame.
 *
 * Deliberately NOT done in this session: the shape should be driven by the E2E
 * protocol strategy, not guessed at from here.
 */

export interface ProbeFrame {
  /** Which probe this frame belongs to. */
  probe: string;
  /** Human-readable purpose, quoted from the probe spec. */
  intent: string;
  packet: {
    verb: RdoVerb;
    action: RdoAction;
    member: string;
    args?: string[];
  };
}

export interface ProbeResult extends ProbeFrame {
  /** Raw payload the server answered, or null when it did not answer. */
  response: string | null;
  /** Set when the request threw (timeout, transport error). */
  error?: string;
  elapsedMs: number;
}

// ── Probe definitions ───────────────────────────────────────────────────────

/**
 * U6 — does the server ever emit `$` (AnsiString)?
 *
 * Three `string` properties published on `TClientView`
 * (`InterfaceServer.pas:126, :127, :141`). Pure reads: `get` emits no separator
 * (`rdo.ts:354-365`), touches no method, and changes nothing.
 */
export const U6_FRAMES: ProbeFrame[] = ['UserName', 'MailAccount', 'CompositeName'].map(member => ({
  probe: 'u6',
  intent: `read the published string property ${member} — does the value carry "$" or "%"?`,
  packet: { verb: RdoVerb.SEL, action: RdoAction.GET, member },
}));

/**
 * U4-a — does the server's literal parser accept a fractional `@`?
 *
 * Targets a property that does NOT exist, so `SetProperty` returns
 * `errUnexistentProperty` without writing (`RDOObjectServer.pas:176`). The two
 * outcomes are disjoint and that is the whole design:
 *   - literal parses    → `error 3 setting RdoProbeU4`
 *   - literal does not  → `error 4 setting RdoProbeU4`  (`RDOQueryServer.pas:338-346`)
 *
 * Order matters: `"#1"` is the control. If it does not answer `error 3`, the
 * harness is wrong and nothing after it may be interpreted.
 */
export const U4A_FRAMES: ProbeFrame[] = [
  { literal: '"#1"', intent: 'control — proves the harness and the oracle work' },
  { literal: '"@1"', intent: 'integral @, no decimal separator involved' },
  { literal: '"@1234.5"', intent: 'THE question — is "." the server locale decimal separator?' },
  { literal: '"!3.14"', intent: 'same question in single precision' },
].map(({ literal, intent }) => ({
  probe: 'u4a',
  intent,
  packet: {
    verb: RdoVerb.SEL,
    action: RdoAction.SET,
    member: 'RdoProbeU4',
    args: [literal],
  },
}));

/**
 * U1-a — what does the server answer to `"^"` on a 0-parameter procedure?
 *
 * `procedure ClientAware;` — `InterfaceServer.pas:197`. The reference client
 * emits it repeatedly as `call ClientAware "*"` [capture :1017, :1019], so the
 * member itself is idempotent and inoffensive. The separator is the risk, and
 * the 0-parameter signature is the entire safety argument.
 *
 * ONE frame. Never repeated. See the module header before enabling it.
 */
export const U1A_FRAMES: ProbeFrame[] = [{
  probe: 'u1a',
  intent: 'VariantId on a 0-parameter procedure — stack-balanced by source analysis, unverified in the wild',
  packet: { verb: RdoVerb.SEL, action: RdoAction.CALL, member: 'ClientAware' },
}];

/**
 * `"^"` on a Delphi procedure — BOTH halves of the mechanism, now observed.
 *
 * The two live results bracket `RDOObjectServer.pas:281-292` exactly: the
 * hidden result pointer is harmless while it fits in a register, and fatal once
 * the parameters push it onto the stack of a `register`-convention procedure
 * that never pops it.
 *
 *   0 parameters → pointer in a register → stack balanced → `A<rid> error 9;`
 *   2 widestrings → RegsUsed hits MaxRegs = 3 → `push edi` (:292) → FREEZE
 *
 * `error 9` is `errIllegalFunctionRes`, raised at `RDOQueryServer.pas:484`: the
 * server accepted the frame, dispatched the call, and failed to serialise a
 * result that does not exist. So `"^"` on a procedure is a real wire divergence
 * even when it does not freeze — the reply is an error, never an ack.
 *
 * Exported so the tests assert on the mechanism as data rather than on prose.
 */
export const U1A_EVIDENCE = {
  /** Observed live 2026-08-15 — the freeze that started all of this. */
  observedFreeze: {
    member: 'SayThis',
    paramCount: 2,
    /** With the hidden result pointer, RegsUsed reaches MaxRegs = 3 → `push edi`. */
    hiddenPointerOnStack: true,
    outcome: 'freeze',
    citation: 'RDOObjectServer.pas:292',
  },
  /** Observed live 2026-08-16 10:52 UTC by probe u1a — answered in 91 ms. */
  observedBalanced: {
    member: 'ClientAware',
    paramCount: 0,
    hiddenPointerOnStack: false,
    outcome: 'error 9',
    errorCode: 9,
    errorName: 'errIllegalFunctionRes',
    citation: 'RDOQueryServer.pas:484',
  },
} as const;

export const PROBES: Record<string, ProbeFrame[]> = {
  u6: U6_FRAMES,
  u4a: U4A_FRAMES,
  u1a: U1A_FRAMES,
};

/** Probes `--probe all` runs. u1a is excluded on purpose. */
export const SAFE_PROBES = ['u6', 'u4a'] as const;

// ── CLI argument handling ───────────────────────────────────────────────────

export interface ProbeOptions {
  probes: string[];
  live: boolean;
  allowU1a: boolean;
  username: string;
  password: string;
  world: string;
  zonePath: string;
}

export class ProbeRefusal extends Error {}

/** Directory path behind the "Free Space" zone card (WORLD_ZONES, protocol-types.ts:85). */
export const FREE_SPACE_ZONE_PATH = 'Root/Areas/America/Worlds';

/**
 * Parse argv into options, refusing anything that could fire a live frame by
 * accident. Exported so the refusals are testable without a network.
 */
export function parseProbeArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ProbeOptions {
  const has = (flag: string) => argv.includes(flag);
  const valueOf = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const requested = valueOf('--probe');
  if (!requested) {
    throw new ProbeRefusal('Missing --probe <u6|u4a|u1a|all>.');
  }

  const probes = requested === 'all' ? [...SAFE_PROBES] : requested.split(',');
  for (const p of probes) {
    if (!PROBES[p]) {
      throw new ProbeRefusal(`Unknown probe "${p}". Known: ${Object.keys(PROBES).join(', ')}, all.`);
    }
  }

  const live = has('--live');
  if (!live) {
    throw new ProbeRefusal(
      'Refusing to run without --live. These frames reach the shared production Interface Server.'
    );
  }

  const allowU1a = has('--allow-u1a');
  if (probes.includes('u1a') && !allowU1a) {
    throw new ProbeRefusal(
      'u1a emits "^" on a Delphi procedure. It was RUN on 2026-08-16 and answered error 9 ' +
      '(errIllegalFunctionRes, RDOQueryServer.pas:484) in 91 ms without freezing — ClientAware takes ' +
      '0 parameters, so the hidden result pointer stays in a register. The contrast case is the ' +
      '2026-08-15 freeze on SayThis (2 widestrings → the pointer is pushed on the stack, ' +
      'RDOObjectServer.pas:292). The question is SETTLED: re-running buys nothing, and this is still ' +
      'a "^"-on-a-procedure frame. Pass --allow-u1a only with a developer green light given at that moment.'
    );
  }

  if (probes.includes('u2')) {
    throw new ProbeRefusal('U2 is cancelled permanently. It is not implemented and must not be.');
  }

  return {
    probes,
    live,
    allowU1a,
    username: valueOf('--user') ?? env.SPO_PROBE_USER ?? 'SPO_test3',
    password: valueOf('--pass') ?? env.SPO_PROBE_PASS ?? 'test3',
    world: valueOf('--world') ?? 'planitia',
    // "Free Space" is the UI label; the directory path is America (WORLD_ZONES,
    // shared/types/protocol-types.ts:85). planitia/shamba/zorcon live there —
    // BETA (Asia) only has aries. Using the label as a path returns an empty
    // world list, silently.
    zonePath: valueOf('--zone') ?? FREE_SPACE_ZONE_PATH,
  };
}

// ── Execution ───────────────────────────────────────────────────────────────

/**
 * Emit one probe frame and record what came back verbatim.
 *
 * Never throws: an unanswered frame is itself a result (and, for u1a, the worst
 * one — it means the request thread died). The caller decides whether to stop.
 */
export async function emitProbeFrame(
  session: StarpeaceSession,
  contextId: string,
  frame: ProbeFrame,
): Promise<ProbeResult> {
  const startedAt = Date.now();
  try {
    const response = await session.executeRdo('world', {
      verb: frame.packet.verb,
      targetId: contextId,
      action: frame.packet.action,
      member: frame.packet.member,
      args: frame.packet.args,
    }, TimeoutCategory.FAST);
    return { ...frame, response, elapsedMs: Date.now() - startedAt };
  } catch (err: unknown) {
    return {
      ...frame,
      response: null,
      error: toErrorMessage(err),
      elapsedMs: Date.now() - startedAt,
    };
  }
}

/**
 * Run a probe's frames in order, stopping at the first frame the server does not
 * answer.
 *
 * Stopping is not politeness. An unanswered frame means the request thread may
 * be gone; every probe spec says ARRÊT TOTAL on that oracle, and continuing
 * would put more frames on a server that just stopped talking.
 */
export async function runProbe(
  session: StarpeaceSession,
  contextId: string,
  frames: ProbeFrame[],
  report: (result: ProbeResult) => void,
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  for (const frame of frames) {
    const result = await emitProbeFrame(session, contextId, frame);
    results.push(result);
    report(result);
    if (result.response === null) break;
  }
  return results;
}

/* istanbul ignore next -- live entry point, exercised by hand under a developer green light */
async function main(): Promise<void> {
  const options = parseProbeArgs(process.argv.slice(2));
  const session = new StarpeaceSession();

  console.log(`[probe] target ${options.world} (${options.zonePath}) as ${options.username}`);
  console.log(`[probe] probes: ${options.probes.join(', ')}`);

  try {
    const worlds: WorldInfo[] = await session.connectDirectory(
      options.username, options.password, options.zonePath,
    );
    const world = worlds.find(w => w.name.toLowerCase() === options.world.toLowerCase());
    if (!world) {
      throw new Error(`World "${options.world}" not in the directory listing: ${worlds.map(w => w.name).join(', ')}`);
    }

    const { contextId } = await session.loginWorld(options.username, options.password, world);
    console.log(`[probe] ClientViewId = ${contextId}`);

    for (const probe of options.probes) {
      console.log(`\n=== ${probe} ===`);
      const results = await runProbe(session, contextId, PROBES[probe], result => {
        const answer = result.response === null
          ? `NO ANSWER (${result.error})`
          : JSON.stringify(result.response);
        console.log(`  ${result.packet.action} ${result.packet.member}` +
          `${result.packet.args ? ' ' + result.packet.args.join(',') : ''}` +
          ` -> ${answer}  [${result.elapsedMs}ms]`);
        console.log(`     intent: ${result.intent}`);
      });
      if (results.some(r => r.response === null)) {
        console.error(`[probe] ${probe}: a frame went unanswered — STOPPING. Do not replay.`);
        break;
      }
    }
  } finally {
    // A probe that leaves its session open is a probe that keeps a ClientView
    // alive on a shared server.
    await session.endSession().catch(() => { /* best effort */ });
    session.destroy();
  }
}

/* istanbul ignore next */
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`[probe] ${toErrorMessage(err)}`);
    process.exitCode = 1;
  });
}
