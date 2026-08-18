/**
 * One conformance run, end to end: transport → real session → login (→ company)
 * → suites → graceful Logoff → server-log correlation → reports. The CLI shell
 * (`rdo-conformance.ts`) only parses arguments and maps the result to files and
 * an exit code.
 */

import * as fs from 'fs';
import { StarpeaceSession } from '../../server/spo_session';
import { BuildingDataService } from '../../server/building-data-service';
import { RdoVerb, SessionPhase } from '../../shared/types';
import type { CompanyInfo, WorldInfo } from '../../shared/types';
import { TimeoutCategory } from '../../shared/timeout-categories';
import { config } from '../../shared/config';
import { toErrorMessage } from '../../shared/error-utils';
import type { ConformanceOptions } from './cli';
import { LiveTransport, Recorder } from './transport';
import type { RdoTransport } from './transport';
import { ReplayTransport } from './replay-transport';
import { ConformanceRunner } from './runner';
import { suiteByName } from './suites';
import {
  buildRunReport, diffBaseline, exitCodeFor, formatBaselineDiff, formatSilenceAttribution, formatStepLine,
  formatSummary, baselineDiverges, isBaseline, recordBaseline,
} from './report';
import { correlateSession, fetchDayLogs, formatServerLogVerdict } from './server-logs';
import type { DayLogs, ServerLogVerdict } from './server-logs';
import { defaultHaltStore, formatHaltNotice, readExistingHalt } from './halt';
import type { HaltStore } from './halt';
import { CONNECTION_STATE } from './types';
import type { RunReport, SessionFacts, SuiteReport } from './types';

/** Everything with a side effect, injectable for tests. */
export interface RunDeps {
  createSession(): StarpeaceSession;
  createTransport(options: ConformanceOptions): RdoTransport;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  log(line: string): void;
  error(line: string): void;
  now(): Date;
  sleep(ms: number): Promise<void>;
  /** Fetch the day's server logs (plain HTTP). */
  fetchServerLogs(base: string, facts: { loginAt: Date; logoffAt: Date }): Promise<DayLogs>;
  /**
   * Load the CLASSES.BIN inspector templates the gateway loads at startup, so
   * the inspector scenarios drive the same property lists as the UI. Optional:
   * without it every building falls back to the generic template.
   */
  loadBuildingTemplates(): Promise<void>;
  /**
   * Where `.rdo-live/HALT` is read from. Optional so a plain conformance run
   * needs no extra wiring; defaults to the real filesystem.
   */
  haltStore?: HaltStore;
}

export const defaultDeps: RunDeps = {
  createSession: () => new StarpeaceSession(),
  createTransport: options => options.transport === 'live'
    ? new LiveTransport(new Recorder())
    : ReplayTransport.fromNdjson(fs.readFileSync(options.recording!, 'utf-8'), 'conformance'),
  readFile: path => fs.readFileSync(path, 'utf-8'),
  writeFile: (path, content) => fs.writeFileSync(path, content, { encoding: 'utf-8' }),
  log: line => console.log(line),
  error: line => console.error(line),
  now: () => new Date(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  fetchServerLogs: (base, facts) => fetchDayLogs(base, facts),
  loadBuildingTemplates: () => new BuildingDataService().initialize(),
  haltStore: defaultHaltStore,
};

/** Socket the pre-flight probe opens and destroys; never used for anything else. */
export const PREFLIGHT_SOCKET = 'preflight';

/**
 * Refuse to start a LIVE run against a Directory Server that is not answering.
 *
 * Two freezes in four days were not our doing. Without this probe a run that
 * meets an already-sick server records the incident against its own first
 * frame — we attribute a third party's crash to ourselves, or worse, keep
 * emitting into something that is already dying.
 *
 * ## The frame is `idof DirectoryServer`, and only that
 *
 * `idof` is intercepted by the query parser BEFORE any object dispatch, so it
 * touches no object state and runs no method body: the cheapest legal frame
 * there is. It is also the exact oracle for the failure it is meant to catch —
 * on 2026-08-18 the broken Interface Server answered `error 1` to *every*
 * query, `idof` included, because what was corrupted was the dispatcher itself.
 *
 * **The "trivial get" the plan also asked for is deliberately absent, and the
 * reason is in the Pascal.** `idof DirectoryServer` resolves `TDirectoryServer`
 * (`tidRDOHook_DirectoryServer`, Directory Server/DirectoryServer.pas:145), and
 * that class has exactly ONE published member: `function RDOOpenSession :
 * olevariant` (:110). Reading it CREATES a `TDirectorySession` — a side effect,
 * and a session-lifecycle member. Every other property on that unit belongs to
 * `TDirectorySession`, which does not exist yet. A `get` on any name we do not
 * have would answer `error 5` on a perfectly healthy server and the probe would
 * refuse to start: a false brake, which is worse here than no second frame.
 */
export async function preflight(session: StarpeaceSession, deps: RunDeps): Promise<void> {
  deps.log(`[preflight] idof DirectoryServer on ${config.rdo.directoryHost}:${config.rdo.ports.directory}`);
  try {
    await session.createSocket(PREFLIGHT_SOCKET, config.rdo.directoryHost, config.rdo.ports.directory);
    const reply = await session.sendRdoRequest(
      PREFLIGHT_SOCKET, { verb: RdoVerb.IDOF, targetId: 'DirectoryServer' }, undefined, TimeoutCategory.DIRECTORY,
    );
    const payload = reply.payload ?? '';
    if ((reply.errorCode !== undefined && reply.errorCode > 0) || /^error\s/i.test(payload)) {
      throw new Error(
        `the Directory Server answered "${payload}" to idof DirectoryServer. That is the signature of a `
        + 'server whose query dispatcher is broken (2026-08-18: error 1 to every query, on every connection). '
        + 'Refusing to start — this run would attribute someone else\'s incident to its own first frame.'
      );
    }
    deps.log(`[preflight] ok — ${payload}`);
  } catch (err: unknown) {
    throw new Error(`Pre-flight refused the live run: ${toErrorMessage(err)}`);
  } finally {
    session.destroySocket(PREFLIGHT_SOCKET);
  }
}

export interface RunResult {
  report: RunReport;
  exitCode: number;
}

/**
 * Perform the run. Resolves with the report and the exit code the CLI should
 * set; throws only when the run could not start (bad recording, login failed).
 * The session is logged off and destroyed on every path.
 */
export async function runConformance(options: ConformanceOptions, deps: RunDeps = defaultDeps): Promise<RunResult> {
  const startedAt = deps.now();

  // Protocol rule R3 — HALT is read before any live action, without exception.
  // A replay run touches no server, so it is not gated: the point of the stop is
  // to keep frames off a server that may be frozen.
  if (options.transport === 'live') {
    const stopped = readExistingHalt(deps.haltStore ?? defaultHaltStore);
    if (stopped) {
      deps.error(formatHaltNotice(stopped));
      throw new Error(
        'Campaign halted: .rdo-live/HALT is present. No live frame is emitted until the developer clears it.'
      );
    }
  }

  const transport = deps.createTransport(options);
  const session = deps.createSession();
  session.setSocketFactory(purpose => transport.socketFactory(purpose));
  // The pool would move suite frames onto connections the recording never saw
  // — and, live, would multiply the sockets a probe run opens on the server.
  session.setWorldPoolEnabled(false);

  const suites = options.suites.map(name => suiteByName(name)!);
  deps.log(`[conformance] ${options.transport}/${options.target} → ${options.world} (${options.zonePath}) as ${options.username}`);
  deps.log(`[conformance] suites: ${suites.map(s => s.name).join(', ')}`);

  // Before the first directory frame, and only live: a replay run answers from
  // a file and has no server to be sick.
  if (options.transport === 'live') await preflight(session, deps);
  try {
    await deps.loadBuildingTemplates();
  } catch (err: unknown) {
    deps.error(`[conformance] building templates not loaded (generic template for every class): ${toErrorMessage(err)}`);
  }

  const facts: SessionFacts = {
    clientViewId: null, interfaceServerId: null, tycoonId: null, company: null, loginAt: null, logoffAt: null,
  };
  let suiteReports: SuiteReport[] = [];
  let loginAt: Date | null = null;
  // What the connection floor learned, handed to the `connexion` suite as
  // runner state. The suite JUDGES this sequence; it never re-runs it. See the
  // design note in `connection-suite.ts`.
  const connectionState = new Map<string, unknown>();

  try {
    const worlds: WorldInfo[] = await session.connectDirectory(options.username, options.password, options.zonePath);
    connectionState.set(CONNECTION_STATE.worlds, worlds.map(w => w.name));
    connectionState.set(CONNECTION_STATE.requestedWorld, options.world);
    const found = worlds.find(w => w.name.toLowerCase() === options.world.toLowerCase());
    if (!found) {
      throw new Error(`World "${options.world}" not in the directory listing: ${worlds.map(w => w.name).join(', ') || '(empty)'}`);
    }
    // Replay never opens TCP, but loginWorld also fetches the company list over
    // HTTP from world.ip. Point that at loopback so an offline run fails fast
    // (caught inside the session — companies come back empty) instead of
    // reaching the live host the recording was made against.
    const world: WorldInfo = transport.kind === 'replay' ? { ...found, ip: '127.0.0.1' } : found;

    const { contextId, tycoonId } = await session.loginWorld(options.username, options.password, world);
    loginAt = deps.now();
    facts.clientViewId = contextId;
    facts.interfaceServerId = session.interfaceServerId;
    facts.tycoonId = tycoonId;
    facts.loginAt = loginAt.toISOString();
    connectionState.set(CONNECTION_STATE.login, {
      clientViewId: contextId, interfaceServerId: session.interfaceServerId, tycoonId,
    });
    deps.log(`[conformance] ClientViewId = ${contextId}, InterfaceServer = ${session.interfaceServerId}, TycoonId = ${tycoonId}`);

    if (options.company) {
      // The reference flow selects a company before anything else; the reads
      // suites (map, focus, details) run in that state. `selectCompany` sets
      // EnableEvents, PickEvent, reads the cookies and says ClientAware —
      // session-scoped, no world mutation.
      const companies: CompanyInfo[] = session.getAvailableCompanies();
      connectionState.set(CONNECTION_STATE.companies, companies.map(c => c.name));
      connectionState.set(CONNECTION_STATE.requestedCompany, options.company);

      // ── The false green of the replay, closed 2026-08-18 ──────────────────
      //
      // An EMPTY list used to fall straight through: `!match && length > 0` is
      // false, so `selectCompany` received the NAME where it expects an ID,
      // `currentCompany` stayed null — and the run passed. Replay forces
      // `world.ip` to loopback (below), so the HTTP company fetch always fails
      // and the list is always empty: every replay run validated a session with
      // no company selected. The same hole silently swallowed the known npm
      // trap, where `--company SPO_test3` (quotes eaten) reaches us instead of
      // `"SPO_test3 - Green"` — loud in live, mute in replay.
      //
      // Live: refuse. Replay: DECLARE that no company is selected and select
      // none, rather than pretend one was. The suites that need a company skip
      // themselves with a reason (`StepSkip`), which is a true report.
      if (companies.length === 0) {
        if (transport.kind !== 'replay') {
          throw new Error(
            `The company list is empty, so "${options.company}" cannot be resolved to an id. `
            + 'Refusing to continue: selectCompany would receive a name where it expects an id, '
            + 'currentCompany would stay null, and the run would pass with no company selected.'
          );
        }
        connectionState.set(CONNECTION_STATE.companySkipped,
          'replay: world.ip is forced to loopback, so the HTTP company list is empty by construction');
        deps.log('[conformance] no company selected — replay forces world.ip to loopback and the company '
          + 'list is served over HTTP. Declared, not faked: steps needing a company will skip themselves.');
      } else {
        const match = companies.find(c => c.name.toLowerCase() === options.company!.toLowerCase());
        if (!match) {
          throw new Error(`Company "${options.company}" not in: ${companies.map(c => c.name).join(', ')}`);
        }
        await session.selectCompany(match.id);
        facts.company = match.name;
        connectionState.set(CONNECTION_STATE.selectedCompany, { id: match.id, name: match.name });
        deps.log(`[conformance] company selected: ${facts.company} (#${match.id})`);
      }
    }

    // ── §3.3 — the operational sequence, made REQUIRED rather than respected ─
    //
    // Nothing used to check it. The sequence is authentication → world → world
    // login → company → exploration, and every suite below addresses objects
    // that sequence resolved; exploring without it means emitting against ids
    // that are null or stale. A named stop here is worth more than fifty
    // downstream FAILs that all mean the same thing.
    //
    // ## The phase and the company are ONE assertion, not two (found in R3)
    //
    // The plan asks for `WORLD_CONNECTED` **and** a non-null `currentCompany`,
    // as two independent checks. They are not independent: `WORLD_CONNECTED` is
    // set on the LAST line of `selectCompany` (`login-handler.ts:616`, after the
    // second `ClientAware`). Without a company selection the phase stays
    // `WORLD_CONNECTING` — for ever, legitimately. Demanding `WORLD_CONNECTED`
    // unconditionally would therefore refuse every `--no-company` run and every
    // replay run, including the one the git gate replays on each commit.
    //
    // So the expected terminal phase is a FUNCTION of whether a company was
    // selected, and the assertion says which contract it is checking. Both
    // branches are hard stops; neither is a fallback.
    const phase = session.getPhase();
    connectionState.set(CONNECTION_STATE.phase, phase);
    const companyExpected = Boolean(options.company) && !connectionState.has(CONNECTION_STATE.companySkipped);

    if (companyExpected) {
      if (!session.currentCompany) {
        throw new Error(
          `Refusing to explore: --company "${options.company}" was asked for and currentCompany is null. `
          + 'selectCompany did not complete, so the build catalogue, the favourites and the politics reads '
          + 'would all run outside any company context.'
        );
      }
      if (phase !== SessionPhase.WORLD_CONNECTED) {
        throw new Error(
          `Refusing to explore: a company is selected but the session phase is ${phase}, expected `
          + `${SessionPhase.WORLD_CONNECTED}. That phase is set on the last line of selectCompany `
          + '(login-handler.ts:616), so anything else means the selection did not run to the end.'
        );
      }
    } else if (phase !== SessionPhase.WORLD_CONNECTING && phase !== SessionPhase.WORLD_CONNECTED) {
      throw new Error(
        `Refusing to explore: session phase is ${phase}. No company was selected, so the reachable terminal `
        + `phase is ${SessionPhase.WORLD_CONNECTING} — but the world login did not even reach that, and every `
        + 'suite below addresses objects it resolves.'
      );
    } else if (!session.worldContextId) {
      throw new Error(
        'Refusing to explore: no company was selected and worldContextId is null. Every `clientView`-targeted '
        + 'step resolves that id, and they would all fail identically.'
      );
    }
    deps.log(`[conformance] sequence complete — phase ${phase}, company ${facts.company ?? '(none, declared)'}`);

    const runner = new ConformanceRunner(session, {
      target: options.target,
      allowMutations: options.allowMutations,
      allowVariantOnProcedure: options.allowVariantOnProcedure,
      only: options.only,
      frameBudget: options.frameBudget,
      username: options.username,
    }, {
      onStep: step => { if (!options.json) deps.log(formatStepLine(step)); },
      onSkip: (suite, id, reason) => { if (!options.json) deps.log(`skip ${suite}/${id}  — ${reason}`); },
      // A stop is attributed the moment it happens, on stderr, whatever --json
      // does to stdout: the operator decides what to do next from this line.
      onHalt: record => deps.error(formatSilenceAttribution(record)),
    }, transport.recorder, connectionState);

    suiteReports = await runner.runAll(suites);
    // The measurement behind DEFAULT_FRAME_BUDGET. Printed on every run so the
    // cap is re-derived from observation rather than re-guessed: a run that
    // reports 120 of 600 says the cap is sound, a run that reports 590 says it
    // is about to be raised for the wrong reason.
    deps.log(`[conformance] frames emitted: ${runner.emitted} / ${options.frameBudget} budget`);
  } finally {
    // A run that leaves its session open leaves a ClientView alive on the server.
    await session.endSession().catch((err: unknown) => deps.error(`[conformance] logoff: ${toErrorMessage(err)}`));
    session.destroy();
    transport.close();
    if (loginAt) facts.logoffAt = deps.now().toISOString();

    // ── §3.6 — the recording is written HERE, before any other I/O ───────────
    //
    // It used to be written at the very end, after the server-log correlation
    // and the baseline diff. Two paths destroyed it: an exception anywhere in
    // the connection block above (which has no catch), and a baseline that is
    // missing or malformed (`JSON.parse` then `throw`). Both are exactly the
    // runs whose recording matters most — **a failed login used to destroy the
    // evidence of the incident that caused it.**
    //
    // In the finally, and first in it after teardown: the wire log is the only
    // artefact that cannot be reconstructed afterwards. Its own failure is
    // swallowed and reported, never rethrown — losing the recording must not
    // also mask the error that is on its way up this stack.
    if (options.recordTo) {
      try {
        deps.writeFile(options.recordTo, transport.recorder.toNdjson());
        deps.log(`[conformance] recording written: ${options.recordTo} (${transport.recorder.all().length} frames)`);
      } catch (err: unknown) {
        deps.error(`[conformance] recording NOT written to ${options.recordTo}: ${toErrorMessage(err)}`);
      }
    }
  }

  const report = buildRunReport({
    startedAt, finishedAt: deps.now(),
    target: options.target, transport: options.transport, world: options.world,
    suites: suiteReports, session: facts,
  });
  let exitCode = exitCodeFor(report, options.strict);

  const logBase = options.serverLogs;
  if (logBase && facts.clientViewId && loginAt && facts.logoffAt) {
    // The Clients row is written at disconnect; give the server a moment.
    await deps.sleep(options.serverLogsSettleMs);
    const logoffAt = new Date(facts.logoffAt);
    let verdict: ServerLogVerdict | null = null;
    try {
      const logs = await deps.fetchServerLogs(logBase, { loginAt, logoffAt });
      verdict = correlateSession({ username: options.username, clientViewId: facts.clientViewId, loginAt, logoffAt }, logs);
    } catch (err: unknown) {
      deps.error(`[server-logs] fetch failed: ${toErrorMessage(err)}`);
    }
    if (verdict) {
      report.serverLogs = verdict;
      deps.log(formatServerLogVerdict(verdict));
      if (verdict.failures.length) exitCode = 1;
    }
  }

  if (options.recordBaseline) {
    deps.writeFile(options.recordBaseline, JSON.stringify(recordBaseline(report), null, 2) + '\n');
    deps.log(`[conformance] baseline written: ${options.recordBaseline}`);
  }
  if (options.diffBaseline) {
    const parsed: unknown = JSON.parse(deps.readFile(options.diffBaseline));
    if (!isBaseline(parsed)) throw new Error(`${options.diffBaseline} is not an rdo-conformance baseline.`);
    const diff = diffBaseline(report, parsed);
    deps.log(formatBaselineDiff(diff));
    if (baselineDiverges(diff)) exitCode = 1;
  }
  if (options.reportTo) {
    deps.writeFile(options.reportTo, JSON.stringify(report, null, 2) + '\n');
    deps.log(`[conformance] report written: ${options.reportTo}`);
  }

  if (options.json) deps.log(JSON.stringify(report, null, 2));
  else deps.log(formatSummary(report));

  return { report, exitCode };
}
