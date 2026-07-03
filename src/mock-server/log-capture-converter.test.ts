/**
 * Tests for log-capture-converter — NDJSON wire log → RdoScenario.
 * Fixture frames mirror the documented auth capture shapes
 * (doc/Mock_Server_scenarios_captures.md / auth-scenario.ts).
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseNdjsonCapture,
  buildRdoScenario,
  emitScenarioTs,
  convertNdjsonToScenario,
} from './log-capture-converter';
import type { WireEntry } from './log-capture-converter';

/** Build one NDJSON log line the way the gateway logger does. */
function line(
  msg: string,
  meta: Record<string, unknown>,
  sid: string | null = 's-cap-1',
  ts = '2026-07-03T10:00:00.000Z'
): string {
  const entry: Record<string, unknown> = { ts, level: 'DEBUG', ctx: 'Session', msg, meta };
  if (sid) entry.sid = sid;
  return JSON.stringify(entry);
}

/** Full auth-flow fixture: sync exchanges, void push, attached push, orphans. */
function authFixture(): string {
  return [
    // noise: non-wire entries and garbage must be ignored
    line('[Session] Connected to directory (host:1111)', {}),
    'not json at all',
    JSON.stringify({ ts: 't', level: 'INFO', ctx: 'Server', msg: 'Server ready' }),

    // idof → answer
    line('RDO>> directory', { command: 'idof', rid: 0, raw: 'C 0 idof "DirectoryServer"' }),
    line('RDO<< directory', { type: 'RESPONSE', rid: 0, raw: 'A0 objid="39751288"' }),

    // get RDOOpenSession → session handle used later as sel target
    line('RDO>> directory', { command: 'RDOOpenSession', rid: 1, raw: 'C 1 sel 39751288 get RDOOpenSession' }),
    line('RDO<< directory', { type: 'RESPONSE', rid: 1, raw: 'A1 RDOOpenSession="#142217260"' }),

    // logon (password already redacted by the gateway logger)
    line('RDO>> directory', {
      command: 'RDOLogonUser', rid: 2,
      raw: 'C 2 sel 142217260 call RDOLogonUser "^" "%SPO_test3","%[REDACTED]"',
    }),
    line('RDO<< directory', { type: 'RESPONSE', rid: 2, raw: 'A2 res="#0"' }),

    // sync request whose answer arrives AFTER a server push → push attaches to it
    line('RDO>> world', { command: 'RegisterEventsById', rid: 3, raw: 'C 3 sel 142217260 call RegisterEventsById "^" "#77"' }),
    line('RDO<< world', { type: 'PUSH', raw: 'C sel 999 call InitClient "*" "#1","%hello"' }),
    line('RDO<< world', { type: 'RESPONSE', rid: 3, raw: 'A3 res="#0"' }),

    // fire-and-forget void push (tap entry, no rid)
    line('RDO>* directory', { raw: 'C sel 142217260 call RDOEndSession "*";' }),

    // spontaneous server push with nothing pending → pushOnly exchange
    line('RDO<< world', { type: 'PUSH', raw: 'C sel 999 call RefreshArea "*" "#10","#20","#5","#5"' }),

    // gateway answering a server-initiated request (heartbeat) → not an exchange
    line('RDO>* world', { raw: 'A17 res="#0"' }),

    // orphan answer (no pending rid)
    line('RDO<< world', { type: 'RESPONSE', rid: 99, raw: 'A99 res="#1"' }),

    // request that never gets an answer
    line('RDO>> world', { command: 'GetWorldOverview', rid: 50, raw: 'C 50 sel 39751288 get GetWorldOverview' }),
  ].join('\n');
}

describe('parseNdjsonCapture', () => {
  it('extracts only wire entries, tolerating noise and garbage lines', () => {
    const entries = parseNdjsonCapture(authFixture());
    expect(entries).toHaveLength(14);
    expect(entries[0]).toEqual({
      ts: '2026-07-03T10:00:00.000Z',
      sid: 's-cap-1',
      socket: 'directory',
      dir: 'out-sync',
      rid: 0,
      raw: 'C 0 idof "DirectoryServer"',
    });
  });

  it('classifies directions from the message prefix', () => {
    const entries = parseNdjsonCapture(authFixture());
    const dirs = entries.map(e => e.dir);
    expect(dirs).toContain('out-sync');
    expect(dirs).toContain('out-void');
    expect(dirs).toContain('in');
  });

  it('filters by sid when requested', () => {
    const mixed = [
      line('RDO>> directory', { rid: 0, raw: 'C 0 idof "DirectoryServer"' }, 's-one'),
      line('RDO>> directory', { rid: 0, raw: 'C 0 idof "DirectoryServer"' }, 's-two'),
    ].join('\n');
    expect(parseNdjsonCapture(mixed, { sid: 's-one' })).toHaveLength(1);
    expect(parseNdjsonCapture(mixed)).toHaveLength(2);
  });

  it('keeps sid-less tap entries (RDO>* fire-and-forget) when a sid filter is set', () => {
    const mixed = [
      line('RDO>> world', { rid: 1, raw: 'C 1 sel 100 get GetSeason' }, 's-one'),
      line('RDO>* world', { raw: 'C sel 100 call KeepAlive "*";' }, null),
      line('RDO>> world', { rid: 1, raw: 'C 1 sel 200 get GetSeason' }, 's-two'),
    ].join('\n');
    const filtered = parseNdjsonCapture(mixed, { sid: 's-one' });
    expect(filtered).toHaveLength(2);
    expect(filtered.map(e => e.dir)).toEqual(['out-sync', 'out-void']);
  });

  it('skips wire entries without raw frames and entries without sid filter mismatch', () => {
    const bad = [
      line('RDO>> directory', { rid: 0 }), // no raw
      line('RDO>> directory', { rid: 0, raw: '' }), // empty raw
    ].join('\n');
    expect(parseNdjsonCapture(bad)).toHaveLength(0);
  });

  it('handles entries with no sid field', () => {
    const entries = parseNdjsonCapture(
      line('RDO<< world', { rid: 1, raw: 'A1 res="#0"' }, null)
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].sid).toBeUndefined();
  });
});

describe('buildRdoScenario', () => {
  function convert() {
    const entries = parseNdjsonCapture(authFixture());
    return buildRdoScenario(entries, {
      name: 'auth-cap',
      knownVariables: { username: 'SPO_test3' },
    });
  }

  it('pairs sync requests with their answers by rid and socket', () => {
    const { scenario } = convert();
    const idof = scenario.exchanges[0];
    expect(idof.request).toBe('C 0 idof "DirectoryServer"');
    expect(idof.response).toBe('A0 objid="{{directoryServerId}}"');
    expect(idof.matchKeys).toEqual({ verb: 'idof', targetId: 'DirectoryServer' });
  });

  it('extracts idof object IDs and sel-target handles as variables', () => {
    const { scenario, report } = convert();
    expect(scenario.variables.directoryServerId).toBe('39751288');
    expect(scenario.variables.rDOOpenSessionId).toBe('142217260');
    expect(report.variables.username).toBe('SPO_test3');
  });

  it('names res="#…" call-result handles after the request member', () => {
    const ndjson = [
      line('RDO>> world', { rid: 4, raw: 'C 4 sel 100 call RDOCnntId "^" "#7"' }),
      line('RDO<< world', { rid: 4, raw: 'A4 res="#55667788"' }),
      line('RDO>> world', { rid: 5, raw: 'C 5 sel 55667788 get Name' }),
      line('RDO<< world', { rid: 5, raw: 'A5 Name="%x"' }),
    ].join('\n');
    const { scenario } = buildRdoScenario(parseNdjsonCapture(ndjson), { name: 'handle' });
    expect(scenario.variables.rDOCnntIdId).toBe('55667788');
    expect(scenario.exchanges[1].request).toBe('C 5 sel {{rDOCnntIdId}} get Name');
  });

  it('substitutes known variables and redacted credentials with placeholders', () => {
    const { scenario } = convert();
    const logon = scenario.exchanges.find(e => e.request.includes('RDOLogonUser'));
    expect(logon).toBeDefined();
    expect(logon!.request).toBe(
      'C 2 sel {{rDOOpenSessionId}} call RDOLogonUser "^" "%{{username}}","%{{password}}"'
    );
    expect(scenario.variables.password).toBe('[REDACTED]');
  });

  it('attaches server pushes to the exchange awaiting its answer', () => {
    const { scenario, report } = convert();
    const register = scenario.exchanges.find(e => e.request.includes('RegisterEventsById'));
    expect(register!.pushes).toHaveLength(1);
    expect(register!.pushes![0]).toContain('InitClient');
    expect(report.attachedServerPushes).toBe(1);
  });

  it('records spontaneous pushes as pushOnly exchanges', () => {
    const { scenario, report } = convert();
    const pushOnly = scenario.exchanges.filter(e => e.pushOnly);
    expect(pushOnly).toHaveLength(1);
    expect(pushOnly[0].request).toBe('');
    expect(pushOnly[0].response).toContain('RefreshArea');
    expect(report.pushOnlyExchanges).toBe(1);
  });

  it('keeps fire-and-forget void pushes as request-only exchanges (delimiter stripped)', () => {
    const { scenario, report } = convert();
    const voidPush = scenario.exchanges.find(e => e.request.includes('RDOEndSession'));
    expect(voidPush!.request).toBe('C sel {{rDOOpenSessionId}} call RDOEndSession "*"');
    expect(voidPush!.response).toBe('');
    expect(report.voidPushes).toBe(1);
  });

  it('counts gateway answers to server requests without creating exchanges', () => {
    const { scenario, report } = convert();
    expect(report.answeredServerRequests).toBe(1);
    expect(scenario.exchanges.some(e => e.request.startsWith('A'))).toBe(false);
  });

  it('reports orphan answers and unanswered requests', () => {
    const { report } = convert();
    expect(report.orphanAnswers).toEqual(['A99 res="#1"']);
    expect(report.unansweredRequests).toEqual(['GetWorldOverview']);
  });

  it('assigns sequential zero-padded exchange IDs with the scenario name', () => {
    const { scenario } = convert();
    expect(scenario.exchanges[0].id).toBe('auth-cap-rdo-001');
    expect(scenario.exchanges[1].id).toBe('auth-cap-rdo-002');
  });

  it('builds matchKeys for sel commands without pinning the target ID', () => {
    const { scenario } = convert();
    const logon = scenario.exchanges.find(e => e.request.includes('RDOLogonUser'));
    expect(logon!.matchKeys).toEqual({ verb: 'sel', action: 'call', member: 'RDOLogonUser' });
  });

  it('warns when the log holds several sessions and no sid filter is given', () => {
    const mixed = [
      line('RDO>> directory', { rid: 0, raw: 'C 0 idof "DirectoryServer"' }, 's-one'),
      line('RDO<< directory', { rid: 0, raw: 'A0 objid="111222333"' }, 's-one'),
      line('RDO>> directory', { rid: 0, raw: 'C 0 idof "DirectoryServer"' }, 's-two'),
      line('RDO<< directory', { rid: 0, raw: 'A0 objid="444555666"' }, 's-two'),
    ].join('\n');
    const { report } = buildRdoScenario(parseNdjsonCapture(mixed), { name: 'multi' });
    expect(report.warnings.some(w => w.includes('2 sessions'))).toBe(true);
    expect(report.sids).toEqual(['s-one', 's-two']);
  });

  it('does not cross-pair answers between sockets or sessions', () => {
    const mixed = [
      line('RDO>> world', { rid: 5, raw: 'C 5 sel 100 get GetSeason' }, 's-one'),
      // same rid, different socket — must NOT resolve the world request
      line('RDO<< mail', { rid: 5, raw: 'A5 res="#9"' }, 's-one'),
    ].join('\n');
    const { report } = buildRdoScenario(parseNdjsonCapture(mixed), { name: 'x' });
    expect(report.orphanAnswers).toEqual(['A5 res="#9"']);
    expect(report.unansweredRequests).toEqual(['GetSeason']);
  });

  it('flags SET commands whose matchKeys embed the value', () => {
    const ndjson = [
      line('RDO>> world', { rid: 9, raw: 'C 9 sel 100 set EnableEvents="#-1"' }),
      line('RDO<< world', { rid: 9, raw: 'A9 ;' }),
    ].join('\n');
    const { report } = buildRdoScenario(parseNdjsonCapture(ndjson), { name: 'set' });
    expect(report.warnings.some(w => w.includes('SET command'))).toBe(true);
  });

  it('handles an empty entry list', () => {
    const { scenario, report } = buildRdoScenario([], { name: 'empty' });
    expect(scenario.exchanges).toHaveLength(0);
    expect(report.exchanges).toBe(0);
  });

  it('warns on unrecognized incoming frame shapes', () => {
    const entries: WireEntry[] = [
      { ts: 't', socket: 'world', dir: 'in', raw: 'garbage-frame' },
    ];
    const { report } = buildRdoScenario(entries, { name: 'w' });
    expect(report.warnings.some(w => w.includes('Unrecognized'))).toBe(true);
  });
});

describe('emitScenarioTs', () => {
  it('emits a typed, importable module with provenance header', () => {
    const { scenario } = buildRdoScenario(parseNdjsonCapture(authFixture()), { name: 'auth-cap' });
    const code = emitScenarioTs(scenario, {
      exportName: 'authCapCapturedScenario',
      sourceNote: 'planitia 2026-07-03',
    });
    expect(code).toContain('DO NOT HAND-EDIT');
    expect(code).toContain('Source: planitia 2026-07-03');
    expect(code).toContain("import type { RdoScenario } from '../../types/rdo-exchange-types';");
    expect(code).toContain('export const authCapCapturedScenario: RdoScenario =');
    // Body must be valid JSON (it is emitted via JSON.stringify)
    const body = code.substring(code.indexOf('= ') + 2).replace(/;\s*$/, '');
    expect(() => JSON.parse(body)).not.toThrow();
  });

  it('honors a custom types import path', () => {
    const { scenario } = buildRdoScenario([], { name: 'x' });
    const code = emitScenarioTs(scenario, { exportName: 'x', typesImportPath: './types' });
    expect(code).toContain("from './types'");
  });
});

describe('convertNdjsonToScenario (end-to-end)', () => {
  it('produces scenario, report, and code in one pass', () => {
    const { scenario, report, code } = convertNdjsonToScenario(authFixture(), {
      name: 'auth-cap',
      knownVariables: { username: 'SPO_test3' },
      sourceNote: 'test-fixture',
    });
    expect(scenario.name).toBe('auth-cap');
    expect(report.exchanges).toBeGreaterThan(0);
    expect(code).toContain('authCapCapturedScenario');
  });

  it('derives the export name from the scenario name', () => {
    const { code } = convertNdjsonToScenario('', { name: 'login-full' });
    expect(code).toContain('export const loginFullCapturedScenario');
  });
});
