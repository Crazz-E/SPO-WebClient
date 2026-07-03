/**
 * log-capture-converter — turns a gateway NDJSON debug log into RdoScenario files.
 *
 * The gateway wire-logs every RDO frame at debug level:
 *   `RDO>> <socket>`  outgoing synchronous request (sendRdoRequest; meta.rid, meta.raw)
 *   `RDO>* <socket>`  outgoing fire-and-forget / answer frame (writeRdoFrame tap; meta.raw)
 *   `RDO<< <socket>`  incoming frame (processSingleCommand; meta.rid, meta.raw)
 *
 * This module pairs those entries per socket into RdoExchange objects
 * (request → response, with server pushes attached), extracts session-specific
 * object IDs into `{{variable}}` placeholders, and emits a ready-to-register
 * scenario .ts file. Captures are the top of the evidence hierarchy
 * (doc/rdo-protocol-architecture.md §0) — generated files must not be
 * hand-edited; re-capture instead.
 */

import { RdoProtocol } from '@/server/rdo';
import { RdoVerb, RdoAction } from '@/shared/types/protocol-types';
import type { RdoScenario, RdoExchange } from './types/rdo-exchange-types';

// ── NDJSON parsing ─────────────────────────────────────────────────────

export interface WireEntry {
  ts: string;
  sid?: string;
  socket: string;
  dir: 'out-sync' | 'out-void' | 'in';
  rid?: number;
  raw: string;
}

const MSG_PREFIXES: Array<{ prefix: string; dir: WireEntry['dir'] }> = [
  { prefix: 'RDO>> ', dir: 'out-sync' },
  { prefix: 'RDO>* ', dir: 'out-void' },
  { prefix: 'RDO<< ', dir: 'in' },
];

/**
 * Extract wire entries from raw NDJSON log text.
 * Non-JSON lines and non-wire entries are skipped.
 */
export function parseNdjsonCapture(ndjson: string, opts?: { sid?: string }): WireEntry[] {
  const entries: WireEntry[] = [];

  for (const line of ndjson.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    const msg = typeof obj.msg === 'string' ? obj.msg : '';
    const match = MSG_PREFIXES.find(p => msg.startsWith(p.prefix));
    if (!match) continue;

    const meta = (obj.meta ?? {}) as Record<string, unknown>;
    if (typeof meta.raw !== 'string' || meta.raw.length === 0) continue;

    const sid = typeof obj.sid === 'string' ? obj.sid : undefined;
    // Entries without a sid (e.g. the RdoWire tap on fire-and-forget frames)
    // carry no session context — keep them when filtering, drop only entries
    // positively belonging to another session.
    if (opts?.sid && sid !== undefined && sid !== opts.sid) continue;

    entries.push({
      ts: typeof obj.ts === 'string' ? obj.ts : '',
      sid,
      socket: msg.substring(match.prefix.length).trim() || 'unknown',
      dir: match.dir,
      rid: typeof meta.rid === 'number' ? meta.rid : undefined,
      raw: meta.raw,
    });
  }

  return entries;
}

// ── Scenario building ──────────────────────────────────────────────────

export interface ConvertOptions {
  /** Scenario name — also used for exchange ID prefixes */
  name: string;
  description?: string;
  /** Extra substitutions, varName → literal value (e.g. { username: 'SPO_test3' }) */
  knownVariables?: Record<string, string>;
  /** Only convert entries from this session ID */
  sid?: string;
}

export interface ConversionReport {
  totalEntries: number;
  exchanges: number;
  voidPushes: number;
  attachedServerPushes: number;
  pushOnlyExchanges: number;
  answeredServerRequests: number;
  orphanAnswers: string[];
  unansweredRequests: string[];
  warnings: string[];
  variables: Record<string, string>;
  sids: string[];
  sockets: string[];
}

interface ExchangeDraft {
  socketKey: string;
  request: string;
  response: string | null;
  pushes: string[];
  pushOnly: boolean;
  rid?: number;
}

/** Strip the trailing packet delimiter and surrounding whitespace. */
function normalizeFrame(raw: string): string {
  return raw.trim().replace(/;\s*$/, '');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toCamelVarName(name: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return 'obj';
  const joined = parts
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');
  return joined.charAt(0).toLowerCase() + joined.slice(1);
}

/**
 * Pair wire entries into exchanges, extract variables, and build the scenario.
 */
export function buildRdoScenario(
  entries: WireEntry[],
  opts: ConvertOptions
): { scenario: RdoScenario; report: ConversionReport } {
  const report: ConversionReport = {
    totalEntries: entries.length,
    exchanges: 0,
    voidPushes: 0,
    attachedServerPushes: 0,
    pushOnlyExchanges: 0,
    answeredServerRequests: 0,
    orphanAnswers: [],
    unansweredRequests: [],
    warnings: [],
    variables: {},
    sids: [],
    sockets: [],
  };

  const drafts: ExchangeDraft[] = [];
  const pendingByRid = new Map<string, ExchangeDraft>(); // key: socketKey|rid
  const sidsSeen = new Set<string>();
  const socketsSeen = new Set<string>();

  for (const entry of entries) {
    if (entry.sid) sidsSeen.add(entry.sid);
    socketsSeen.add(entry.socket);
    const socketKey = `${entry.sid ?? ''}|${entry.socket}`;
    const norm = normalizeFrame(entry.raw);
    if (norm.length === 0) continue;

    if (entry.dir === 'out-sync') {
      const draft: ExchangeDraft = {
        socketKey,
        request: norm,
        response: null,
        pushes: [],
        pushOnly: false,
        rid: entry.rid,
      };
      drafts.push(draft);
      if (entry.rid !== undefined) {
        pendingByRid.set(`${socketKey}|${entry.rid}`, draft);
      }
      continue;
    }

    if (entry.dir === 'out-void') {
      if (norm.startsWith('A')) {
        // Gateway answering a server-initiated request (AnswerStatus heartbeat,
        // reverse idof InterfaceEvents) — protocol behavior, not an exchange.
        report.answeredServerRequests++;
        continue;
      }
      drafts.push({
        socketKey,
        request: norm,
        response: '',
        pushes: [],
        pushOnly: false,
        rid: undefined,
      });
      report.voidPushes++;
      continue;
    }

    // entry.dir === 'in'
    if (norm.startsWith('A')) {
      const rid = entry.rid ?? RdoProtocol.parse(norm).rid;
      const key = rid !== undefined ? `${socketKey}|${rid}` : undefined;
      const pending = key ? pendingByRid.get(key) : undefined;
      if (pending && pending.response === null) {
        pending.response = norm;
        pendingByRid.delete(key!);
      } else {
        report.orphanAnswers.push(norm);
      }
      continue;
    }

    if (norm.startsWith('C')) {
      // Server-initiated frame (push or reverse request). Attach to the most
      // recent exchange still awaiting its answer on this socket (e.g.
      // InitClient arriving during RegisterEventsById); otherwise standalone.
      const awaiting = [...drafts].reverse().find(
        d => d.socketKey === socketKey && !d.pushOnly && d.response === null
      );
      if (awaiting) {
        awaiting.pushes.push(norm);
        report.attachedServerPushes++;
      } else {
        drafts.push({
          socketKey,
          request: '',
          response: norm,
          pushes: [],
          pushOnly: true,
        });
        report.pushOnlyExchanges++;
      }
      continue;
    }

    report.warnings.push(`Unrecognized incoming frame shape: ${norm.slice(0, 80)}`);
  }

  // Unanswered requests: keep the exchange (request shape is still evidence),
  // empty response, and flag it.
  for (const draft of drafts) {
    if (!draft.pushOnly && draft.response === null) {
      draft.response = '';
      const member = safeParse(draft.request)?.member ?? draft.request.slice(0, 60);
      report.unansweredRequests.push(String(member));
    }
  }

  // ── Variable extraction ──────────────────────────────────────────────
  const variables: Record<string, string> = {};
  const usedNames = new Set<string>();

  const addVariable = (baseName: string, value: string): void => {
    if (value.length < 3) return;
    if (Object.values(variables).includes(value)) return; // first name wins
    let name = baseName;
    let n = 2;
    while (usedNames.has(name)) {
      name = `${baseName}${n++}`;
    }
    usedNames.add(name);
    variables[name] = value;
  };

  // Caller-supplied variables first (username etc.)
  for (const [name, value] of Object.entries(opts.knownVariables ?? {})) {
    addVariable(name, value);
  }

  // Redacted credentials become a declared placeholder
  if (drafts.some(d => d.request.includes('"%[REDACTED]"'))) {
    addVariable('password', '[REDACTED]');
  }

  // idof exchanges yield object-ID variables: idof "X" → xId = <objid>
  for (const draft of drafts) {
    if (draft.pushOnly || draft.request === '') continue;
    const parsed = safeParse(draft.request);
    if (parsed?.verb === RdoVerb.IDOF && parsed.targetId && draft.response) {
      const objidMatch = draft.response.match(/objid\s*=\s*"([^"]*)"/i);
      if (objidMatch && objidMatch[1]) {
        const value = objidMatch[1].replace(/^[#$%@]/, '').trim();
        addVariable(`${toCamelVarName(parsed.targetId)}Id`, value);
      }
    }
  }

  // get-property answers whose value is later used as a `sel` target are
  // object handles (RDOOpenSession, RDOCnntId, …) — session-specific, so
  // they become variables too.
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    if (d.pushOnly || !d.response) continue;
    const m = d.response.match(/^A\d+\s+([A-Za-z_]\w*)="#?(\d{3,})"$/);
    if (!m) continue;
    const usedLater = drafts.some(
      (later, j) => j > i && !later.pushOnly && later.request.includes(`sel ${m[2]} `)
    );
    if (!usedLater) continue;
    // `res="#…"` answers (call results) get named after the request member
    // instead of the meaningless `res` key.
    const keyName = m[1] === 'res' ? safeParse(d.request)?.member ?? m[1] : m[1];
    addVariable(`${toCamelVarName(String(keyName))}Id`, m[2]);
  }

  // Substitute values (longest first, token-bounded) in every frame string.
  const substitute = (text: string): string => {
    let result = text;
    const byLength = Object.entries(variables).sort((a, b) => b[1].length - a[1].length);
    for (const [name, value] of byLength) {
      const re = new RegExp(
        `(^|[\\s"#%,(])${escapeRegExp(value)}(?=$|[\\s"',;)])`,
        'g'
      );
      result = result.replace(re, `$1{{${name}}}`);
    }
    return result;
  };

  // ── Emit exchanges ───────────────────────────────────────────────────
  const exchanges: RdoExchange[] = drafts.map((draft, i) => {
    const id = `${opts.name}-rdo-${String(i + 1).padStart(3, '0')}`;

    if (draft.pushOnly) {
      return {
        id,
        request: '',
        response: substitute(draft.response ?? ''),
        pushOnly: true,
      };
    }

    const parsed = safeParse(draft.request);
    const exchange: RdoExchange = {
      id,
      request: substitute(draft.request),
      response: substitute(draft.response ?? ''),
    };
    if (draft.pushes.length > 0) {
      exchange.pushes = draft.pushes.map(substitute);
    }

    if (parsed?.verb === RdoVerb.IDOF && parsed.targetId) {
      exchange.matchKeys = { verb: 'idof', targetId: parsed.targetId };
    } else if (parsed?.member) {
      exchange.matchKeys = {
        verb: parsed.verb,
        action: parsed.action,
        member: parsed.member,
      };
      if (parsed.action === RdoAction.SET) {
        report.warnings.push(
          `SET command matchKeys include the value (parser limitation): ${parsed.member}`
        );
      }
    }

    return exchange;
  });

  report.exchanges = exchanges.length;
  report.variables = { ...variables };
  report.sids = [...sidsSeen];
  report.sockets = [...socketsSeen];
  if (sidsSeen.size > 1 && !opts.sid) {
    report.warnings.push(
      `Log contains ${sidsSeen.size} sessions — pass { sid } to isolate one (sids: ${[...sidsSeen].join(', ')})`
    );
  }

  const scenario: RdoScenario = {
    name: opts.name,
    description: opts.description ?? `Captured scenario: ${opts.name}`,
    exchanges,
    variables,
  };

  return { scenario, report };
}

/**
 * Resolve `{{variable}}` placeholders in a captured scenario back into
 * concrete frames, using the scenario's own captured values unless
 * overridden. Needed because RdoMock's built-in substitution only knows the
 * fixed ScenarioVariables keys, while captures carry arbitrary handles.
 */
export function resolveScenarioVariables(
  scenario: RdoScenario,
  overrides?: Record<string, string>
): RdoScenario {
  const vars = { ...scenario.variables, ...overrides };
  const resolve = (text: string): string => {
    let out = text;
    for (const [name, value] of Object.entries(vars)) {
      out = out.split(`{{${name}}}`).join(value);
    }
    return out;
  };
  return {
    ...scenario,
    exchanges: scenario.exchanges.map(ex => ({
      ...ex,
      request: resolve(ex.request),
      response: resolve(ex.response),
      pushes: ex.pushes?.map(resolve),
    })),
    variables: vars,
  };
}

function safeParse(raw: string): ReturnType<typeof RdoProtocol.parse> | null {
  try {
    return RdoProtocol.parse(raw);
  } catch {
    return null;
  }
}

// ── TypeScript emission ────────────────────────────────────────────────

export interface EmitOptions {
  /** Exported const name, e.g. `loginCapturedScenario` */
  exportName: string;
  /** Provenance note (log file, world, date) written into the header */
  sourceNote?: string;
  /** Import path to rdo-exchange-types from the emitted file's location */
  typesImportPath?: string;
}

/**
 * Emit a scenario as a standalone .ts module (object literal, typed).
 */
export function emitScenarioTs(scenario: RdoScenario, opts: EmitOptions): string {
  const importPath = opts.typesImportPath ?? '../../types/rdo-exchange-types';
  const source = opts.sourceNote ? ` * Source: ${opts.sourceNote}\n` : '';
  return (
    `/**\n` +
    ` * CAPTURED SCENARIO — generated by log-capture-converter. DO NOT HAND-EDIT.\n` +
    ` * Evidence tier: live capture (gateway wire tap). To update, re-capture\n` +
    ` * the flow and re-run the converter (npm run capture:convert).\n` +
    source +
    ` */\n` +
    `import type { RdoScenario } from '${importPath}';\n\n` +
    `export const ${opts.exportName}: RdoScenario = ${JSON.stringify(scenario, null, 2)};\n`
  );
}

/**
 * End-to-end: NDJSON log text → scenario + report + emitted .ts code.
 */
export function convertNdjsonToScenario(
  ndjson: string,
  opts: ConvertOptions & { exportName?: string; sourceNote?: string }
): { scenario: RdoScenario; report: ConversionReport; code: string } {
  const entries = parseNdjsonCapture(ndjson, { sid: opts.sid });
  const { scenario, report } = buildRdoScenario(entries, opts);
  const exportName =
    opts.exportName ?? `${toCamelVarName(opts.name)}CapturedScenario`;
  const code = emitScenarioTs(scenario, {
    exportName,
    sourceNote: opts.sourceNote,
  });
  return { scenario, report, code };
}
