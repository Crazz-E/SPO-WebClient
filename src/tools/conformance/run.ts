/**
 * One conformance run, end to end: transport → real session → login (→ company)
 * → suites → graceful Logoff → server-log correlation → reports. The CLI shell
 * (`rdo-conformance.ts`) only parses arguments and maps the result to files and
 * an exit code.
 */

import * as fs from 'fs';
import { StarpeaceSession } from '../../server/spo_session';
import { BuildingDataService } from '../../server/building-data-service';
import type { WorldInfo } from '../../shared/types';
import { toErrorMessage } from '../../shared/error-utils';
import type { ConformanceOptions } from './cli';
import { LiveTransport, Recorder } from './transport';
import type { RdoTransport } from './transport';
import { ReplayTransport } from './replay-transport';
import { ConformanceRunner } from './runner';
import { suiteByName } from './suites';
import {
  buildRunReport, diffBaseline, exitCodeFor, formatBaselineDiff, formatStepLine, formatSummary,
  baselineDiverges, isBaseline, recordBaseline,
} from './report';
import { correlateSession, fetchDayLogs, formatServerLogVerdict } from './server-logs';
import type { DayLogs, ServerLogVerdict } from './server-logs';
import type { RunReport, SessionFacts, SuiteReport, TargetKind } from './types';

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
  /** Read the git gate file (`.conformance-gate.json`), or null when absent/unreadable. */
  readGate(): Gate | null;
  /** Persist the git gate file. */
  writeGate(gate: Gate): void;
}

/**
 * The git gate (developer rule, 2026-08-16): sources go to git only after a
 * replay run and then a live run both exited 0 on the current sources. Every
 * run that exits 0 records itself here, per transport; the PreToolUse hook
 * `.claude/hooks/conformance-gate.sh` reads it before any `git commit` / `git push`.
 */
export interface GateEntry {
  finishedAt: string;
  exitCode: number;
  suites: string;
  world: string;
  target: TargetKind;
}
export interface Gate {
  tool: 'rdo-conformance-gate';
  replay?: GateEntry;
  live?: GateEntry;
}
export const GATE_FILE = '.conformance-gate.json';

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
  readGate: () => {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(GATE_FILE, 'utf-8'));
      return isGate(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  writeGate: gate => fs.writeFileSync(GATE_FILE, JSON.stringify(gate, null, 2) + '\n', { encoding: 'utf-8' }),
};

export function isGate(value: unknown): value is Gate {
  return typeof value === 'object' && value !== null && (value as { tool?: unknown }).tool === 'rdo-conformance-gate';
}

/**
 * Record this run in the gate. A run that exits 0 validates its step; a live
 * run without a prior replay entry is recorded but flagged — the rule is
 * replay first, then live. Never throws: the gate is bookkeeping, the run is
 * the product.
 */
export function updateGate(deps: RunDeps, report: RunReport, exitCode: number, log: (line: string) => void): void {
  const gate: Gate = deps.readGate() ?? { tool: 'rdo-conformance-gate' };
  const entry: GateEntry = {
    finishedAt: report.finishedAt, exitCode,
    suites: report.suites.map(s => s.name).join(','), world: report.world, target: report.target,
  };
  if (exitCode !== 0) {
    log(`[gate] run failed (exit ${exitCode}) — ${report.transport} step NOT validated; the gate file is left as it was`);
    return;
  }
  gate[report.transport] = entry;
  try {
    deps.writeGate(gate);
  } catch (err: unknown) {
    log(`[gate] could not write ${GATE_FILE}: ${toErrorMessage(err)}`);
    return;
  }
  if (report.transport === 'live' && !gate.replay) {
    log('[gate] live step validated, but step 1 (replay) has no validated run yet — git sync stays blocked until it does');
  } else if (report.transport === 'live') {
    log(`[gate] both steps validated (replay ${gate.replay!.finishedAt}, live ${entry.finishedAt}) — git sync allowed on these sources`);
  } else {
    log('[gate] step 1 (replay) validated — step 2 is the live run');
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
  const transport = deps.createTransport(options);
  const session = deps.createSession();
  session.setSocketFactory(purpose => transport.socketFactory(purpose));
  // The pool would move suite frames onto connections the recording never saw
  // — and, live, would multiply the sockets a probe run opens on the server.
  session.setWorldPoolEnabled(false);

  const suites = options.suites.map(name => suiteByName(name)!);
  deps.log(`[conformance] ${options.transport}/${options.target} → ${options.world} (${options.zonePath}) as ${options.username}`);
  deps.log(`[conformance] suites: ${suites.map(s => s.name).join(', ')}`);
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

  try {
    const worlds: WorldInfo[] = await session.connectDirectory(options.username, options.password, options.zonePath);
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
    deps.log(`[conformance] ClientViewId = ${contextId}, InterfaceServer = ${session.interfaceServerId}, TycoonId = ${tycoonId}`);

    if (options.company) {
      // The reference flow selects a company before anything else; the reads
      // suites (map, focus, details) run in that state. `selectCompany` sets
      // EnableEvents, PickEvent, reads the cookies and says ClientAware —
      // session-scoped, no world mutation.
      const companies = session.getAvailableCompanies();
      const match = companies.find(c => c.name.toLowerCase() === options.company!.toLowerCase());
      if (!match && companies.length > 0) {
        throw new Error(`Company "${options.company}" not in: ${companies.map(c => c.name).join(', ')}`);
      }
      await session.selectCompany(match?.id ?? options.company);
      facts.company = match?.name ?? options.company;
      deps.log(`[conformance] company selected: ${facts.company}${match ? ` (#${match.id})` : ' (id unknown — HTTP company list empty)'}`);
    }

    const runner = new ConformanceRunner(session, {
      target: options.target,
      allowVariantOnProcedure: options.allowVariantOnProcedure,
      only: options.only,
      frameBudget: options.frameBudget,
      username: options.username,
    }, {
      onStep: step => { if (!options.json) deps.log(formatStepLine(step)); },
      onSkip: (suite, id, reason) => { if (!options.json) deps.log(`skip ${suite}/${id}  — ${reason}`); },
    }, transport.recorder);

    suiteReports = await runner.runAll(suites);
  } finally {
    // A run that leaves its session open leaves a ClientView alive on the server.
    await session.endSession().catch((err: unknown) => deps.error(`[conformance] logoff: ${toErrorMessage(err)}`));
    session.destroy();
    transport.close();
    if (loginAt) facts.logoffAt = deps.now().toISOString();
  }

  const report = buildRunReport({
    startedAt, finishedAt: deps.now(),
    target: options.target, transport: options.transport, world: options.world,
    suites: suiteReports, session: facts,
  });
  let exitCode = exitCodeFor(report, options.strict);

  if (options.serverLogs && facts.clientViewId && loginAt && facts.logoffAt) {
    // The Clients row is written at disconnect; give the server a moment.
    await deps.sleep(options.serverLogsSettleMs);
    const logoffAt = new Date(facts.logoffAt);
    let verdict: ServerLogVerdict | null = null;
    try {
      const logs = await deps.fetchServerLogs(options.serverLogs, { loginAt, logoffAt });
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
  if (options.recordTo) {
    deps.writeFile(options.recordTo, transport.recorder.toNdjson());
    deps.log(`[conformance] recording written: ${options.recordTo} (${transport.recorder.all().length} frames)`);
  }
  if (options.reportTo) {
    deps.writeFile(options.reportTo, JSON.stringify(report, null, 2) + '\n');
    deps.log(`[conformance] report written: ${options.reportTo}`);
  }

  if (options.json) deps.log(JSON.stringify(report, null, 2));
  else deps.log(formatSummary(report));

  updateGate(deps, report, exitCode, options.json ? deps.error : deps.log);

  return { report, exitCode };
}
