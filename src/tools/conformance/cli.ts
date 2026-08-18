/**
 * CLI argument handling — every refusal that keeps a frame off a live server
 * by accident lives here, so it is testable without a network.
 *
 * Risk tiering, kept from the probe harness and widened:
 *   --transport replay      no server at all (default) — needs --recording
 *   --transport live        real TCP; requires --live as a second, explicit yes
 *   --target shared         (default) reads only; every mutation is refused
 *   --target dedicated      mutations allowed; the suite documents its reset
 *   --allow-mutations       run mutation steps on a shared target, deliberately
 *   --allow-variant-on-procedure   the one `"^"`-on-a-procedure step; never in `all`
 */

import { SUITES, allStepIds } from './suites';
import type { TargetKind, TransportKind } from './types';
import { hasRisk } from './types';
import { DEFAULT_FRAME_BUDGET } from './runner';
import { DEFAULT_LOG_BASE } from './server-logs';

export class CliRefusal extends Error {}

export interface ConformanceOptions {
  suites: string[];
  only: Set<string>;
  transport: TransportKind;
  target: TargetKind;
  live: boolean;
  /**
   * Run `risk: 'mutation'` steps without `--target dedicated`.
   *
   * A mutation step reaches `call MethodAddr` and the server EXECUTES the
   * method body on the live `SPO_test3` account. The flag is how a run says so
   * — in the command line and in the report — instead of relabelling the step
   * `risk: 'read'`, which would corrupt the very bookkeeping the suite exists
   * to produce.
   */
  allowMutations: boolean;
  allowVariantOnProcedure: boolean;
  strict: boolean;
  json: boolean;
  recording?: string;
  recordTo?: string;
  recordBaseline?: string;
  diffBaseline?: string;
  /** Write the full RunReport JSON here (independent of --json on stdout). */
  reportTo?: string;
  /** Company to select after login (the reference flow); null = stay before selection. */
  company: string | null;
  /** Base URL of the public server logs to correlate against; undefined = no correlation. */
  serverLogs?: string;
  serverLogsSettleMs: number;
  frameBudget: number;
  username: string;
  password: string;
  world: string;
  zonePath: string;
}

/** Directory path behind the "Free Space" zone card (WORLD_ZONES, protocol-types.ts:85). */
export const FREE_SPACE_ZONE_PATH = 'Root/Areas/America/Worlds';
/** The locked E2E company (CLAUDE.md). */
export const DEFAULT_COMPANY = 'SPO_test3 - Green';
export const DEFAULT_SERVER_LOGS_SETTLE_MS = 5000;

export const USAGE = `rdo-conformance — RDO protocol conformance suite over the real StarpeaceSession

  --suite <name[,name]|all>       suites to run (${SUITES.map(s => s.name).join(', ')})
                                  "all" runs every replayable suite (see NOT_REPLAYABLE)
  --only <suite/step[,…]>         restrict to these step ids
  --transport replay|live         replay (default, offline) or live TCP
  --recording <file.ndjson>       replay: the recording to answer from
  --live                          live: second explicit yes (frames reach a real server)
  --target shared|dedicated       shared (default): reads only; dedicated: mutations + reset
  --allow-mutations               run mutation steps on a shared target — declares the intent
  --allow-variant-on-procedure    enable "^"-on-a-procedure steps (error 9 below 2 emitted args)
  --company <name> | --no-company select this company after login (default "${DEFAULT_COMPANY}", the reference flow)
  --server-logs [base-url]        after logoff, correlate the session with the public server logs
                                  (default ${DEFAULT_LOG_BASE}); a pathology fails the run
  --server-logs-settle <ms>       wait before fetching the logs (default ${DEFAULT_SERVER_LOGS_SETTLE_MS})
  --record <file.ndjson>          write the wire recording (both transports)
  --record-baseline <file.json>   write the replies of this run as the baseline
  --diff-baseline <file.json>     compare the replies of this run against a baseline
  --report <file.json>            write the full run report to a file
  --json                          print the run report as JSON on stdout
  --strict                        UNKNOWN verdicts fail the run too
  --frame-budget <n>              hard cap on frames per run (default ${DEFAULT_FRAME_BUDGET})
  --user / --pass / --world / --zone   overrides (env SPO_PROBE_USER / SPO_PROBE_PASS)
`;

/**
 * Suites that `--suite all` must not pick up — `all` is the gate's replay step,
 * so a suite without a baseline recording would read as silence.
 *
 * The replay transport answers by byte-identical match and leaves every
 * unrecorded frame unanswered (`replay-transport.ts`); the runner reads one
 * unanswered frame as a stop and ends the whole run (`runner.ts`, stop-on-
 * silence). A suite in `all` that no recording covers would therefore break
 * `git commit` for everybody, not just fail.
 *
 * Empty since 2026-08-18 (the certification sweep was removed, plan rev. 4 §7):
 * the set is kept so the rule survives its only client, and so the next
 * non-replayable suite has an obvious home instead of a rediscovered filter.
 */
export const NOT_REPLAYABLE: ReadonlySet<string> = new Set();

export function parseConformanceArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ConformanceOptions {
  const has = (flag: string) => argv.includes(flag);
  const valueOf = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const requested = valueOf('--suite');
  if (!requested) throw new CliRefusal(`Missing --suite <${SUITES.map(s => s.name).join('|')}|all>.\n${USAGE}`);
  const known = SUITES.map(s => s.name);
  const suites = requested === 'all' ? known.filter(n => !NOT_REPLAYABLE.has(n)) : requested.split(',');
  for (const s of suites) {
    if (!known.includes(s)) throw new CliRefusal(`Unknown suite "${s}". Known: ${known.join(', ')}, all.`);
  }

  const only = new Set((valueOf('--only') ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const knownIds = new Set(allStepIds());
  for (const id of only) {
    if (!knownIds.has(id)) throw new CliRefusal(`Unknown step "${id}". Use <suite>/<step-id>.`);
  }

  const transport = (valueOf('--transport') ?? 'replay') as TransportKind;
  if (transport !== 'replay' && transport !== 'live') throw new CliRefusal(`--transport must be replay or live, got "${transport}".`);

  const target = (valueOf('--target') ?? 'shared') as TargetKind;
  if (target !== 'shared' && target !== 'dedicated') throw new CliRefusal(`--target must be shared or dedicated, got "${target}".`);

  const live = has('--live');
  if (transport === 'live' && !live) {
    throw new CliRefusal(
      'Refusing --transport live without --live. These frames reach a real Interface Server; ' +
      'on 2026-08-15 a single frame froze the shared one.'
    );
  }

  const recording = valueOf('--recording');
  if (transport === 'replay' && !recording) {
    throw new CliRefusal('--transport replay needs --recording <file.ndjson> (a Recorder / gateway wire log).');
  }

  // No refusal pairs with this one: `--allow-mutations` on a shared target is
  // exactly the case it exists for. It is deliberately NOT implied by --live,
  // and NOT implied by --target dedicated (which already allows mutations).
  const allowMutations = has('--allow-mutations');

  // The flag and its refusal both survive the removal of the sweep (R1,
  // 2026-08-18) — the motive is rewritten here, third and last time.
  //
  // What it covers TODAY is one step: `separators/variant-on-zero-param-
  // procedure`, `"^"` on `ClientAware`, adjudicated by live capture on
  // 2026-08-16 (`error 9` in 91 ms). It used to cover the certification sweep's
  // waves 2 and 3 as well; those are gone with the sweep, and with them the
  // "it classifies 156 unknown members" justification.
  //
  // The rule the refusal encodes is unchanged and is not about arity: a step
  // that emits `"^"` makes the server EXECUTE the method body, so putting it on
  // a live account must be a decision. `all` is the automatic, unattended,
  // gate-driven mode — the one place a decision cannot be recorded. Naming the
  // suite is how the command line records it.
  const allowVariantOnProcedure = has('--allow-variant-on-procedure');
  if (allowVariantOnProcedure && requested === 'all') {
    throw new CliRefusal(
      '--allow-variant-on-procedure is never combined with --suite all. Name the suites explicitly ' +
      `(${SUITES.filter(s => s.steps.some(st => hasRisk(st, 'variant-on-procedure'))).map(s => s.name).join(', ')}): ` +
      'those steps put `"^"` on a Delphi procedure and the server EXECUTES the method body — ' +
      'harmless for the freeze below 2 emitted arguments, never harmless for the account state. ' +
      'Running them must be a decision, not a default.'
    );
  }

  const company = has('--no-company') ? null : (valueOf('--company') ?? DEFAULT_COMPANY);
  if (has('--no-company') && valueOf('--company')) throw new CliRefusal('--company and --no-company are exclusive.');

  let serverLogs: string | undefined;
  if (has('--server-logs')) {
    const v = valueOf('--server-logs');
    serverLogs = v && !v.startsWith('--') ? v : DEFAULT_LOG_BASE;
  }
  const settleRaw = valueOf('--server-logs-settle');
  const serverLogsSettleMs = settleRaw === undefined ? DEFAULT_SERVER_LOGS_SETTLE_MS : parseInt(settleRaw, 10);
  if (!Number.isFinite(serverLogsSettleMs) || serverLogsSettleMs < 0) throw new CliRefusal(`--server-logs-settle must be a non-negative integer, got "${settleRaw}".`);

  const budgetRaw = valueOf('--frame-budget');
  const frameBudget = budgetRaw === undefined ? DEFAULT_FRAME_BUDGET : parseInt(budgetRaw, 10);
  if (!Number.isFinite(frameBudget) || frameBudget <= 0) throw new CliRefusal(`--frame-budget must be a positive integer, got "${budgetRaw}".`);

  return {
    suites,
    only,
    transport,
    target,
    live,
    allowMutations,
    allowVariantOnProcedure,
    strict: has('--strict'),
    json: has('--json'),
    recording,
    recordTo: valueOf('--record'),
    recordBaseline: valueOf('--record-baseline'),
    diffBaseline: valueOf('--diff-baseline'),
    reportTo: valueOf('--report'),
    company,
    serverLogs,
    serverLogsSettleMs,
    frameBudget,
    username: valueOf('--user') ?? env.SPO_PROBE_USER ?? 'SPO_test3',
    password: valueOf('--pass') ?? env.SPO_PROBE_PASS ?? 'test3',
    world: valueOf('--world') ?? 'planitia',
    // "Free Space" is the UI label; the directory path is America. planitia /
    // shamba / zorcon live there — BETA (Asia) only has aries. Using the label as
    // a path returns an empty world list, silently (caught live 2026-08-16).
    zonePath: valueOf('--zone') ?? FREE_SPACE_ZONE_PATH,
  };
}
