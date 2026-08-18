/**
 * Parsers and verdict against REAL lines sampled from the public log endpoint
 * on 2026-08-16 (the SPO_test3 probe sessions of that morning).
 */

import {
  FATAL_SIGNATURES, correlateSession, fatalAnomalies, fetchDayLogs, findLogonBlocks, formatClock,
  formatServerLogVerdict, heartbeatGaps, ISCNX_CONCLUSION_WINDOW_SEC, lastStampOf, logDateOf, logUrl,
  parseClients, parseClock, parseIsCnxEvents, parseSurvival, troubleLines, utcSecondsOfDay,
} from './server-logs';

const IS_SURVIVAL = [
  '10:03:22 AM - ========================================',
  '10:03:23 AM - LOGON ATTEMPT: User=SPO_test3',
  '10:03:23 AM - fDAOK=TRUE',
  '10:03:23 AM - (Logon.4) TycoonProxyId=298805160',
  '10:03:23 AM - CheckUserAccount RDOLogonUser result: 0',
  '10:03:23 AM - Account validation PASSED',
  '10:03:24 AM - LOGON SUCCESS: ClientViewId=7187732',
  '10:03:24 AM SPO_test3.IP = 88.167.51.32',
  '10:03:26 AM - Start Disconnecting SPO_test3',
  '10:03:26 AM - (Disconnect.1) done',
  '10:49:38 AM - LOGON SUCCESS: ClientViewId=6850248',
  '10:52:22 AM - LOGON ATTEMPT: User=SPO_test3',
  '10:52:23 AM - LOGON SUCCESS: ClientViewId=6942220',
  '10:52:23 AM SPO_test3.IP = 88.167.51.32',
  '10:52:23 AM - Error in SegmentsInArea',
  '10:52:24 AM - Start Disconnecting SPO_test3',
  '11:41:22 AM End renewing proxy',
].join('\n');

const IS_CLIENTS = [
  'SPO_test3\t88.167.51.32\t10:03:24 AM\t10:03:26 AM\t0',
  'SPO_test3\t88.167.51.32\t10:52:23 AM\t10:52:24 AM\t3',
  'lord kaio\t189.18.23.35\t1:32:03 PM\t1:40:00 PM\t0',
].join('\n');

const MS_SURVIVAL = [
  '10:03:10 AM Check roads', '10:03:10 AM SIM-Tycoons', '10:03:25 AM Check roads', '10:03:25 AMSIM-Cleaning',
  '10:03:40 AM Check roads', '10:52:00 AM Check roads', '10:52:15 AM Check roads', '10:53:30 AM Check roads',
].join('\n');

const at = (h: number, m: number, s: number) => new Date(Date.UTC(2026, 7, 16, h, m, s));

describe('server-logs — clock and url helpers', () => {
  it('parses 12-hour clocks, tolerating a missing space after the meridian', () => {
    expect(parseClock('10:03:24 AM')).toBe(10 * 3600 + 3 * 60 + 24);
    expect(parseClock('12:00:05 AM')).toBe(5);
    expect(parseClock('12:30:00 PM')).toBe(12 * 3600 + 30 * 60);
    expect(parseClock('2:07:24 PMSIM-Cleaning')).toBe(14 * 3600 + 7 * 60 + 24);
    expect(parseClock('garbage')).toBeNull();
    expect(formatClock(14 * 3600 + 7 * 60 + 24)).toBe('2:07:24 PM');
    expect(formatClock(0)).toBe('12:00:00 AM');
  });

  it('derives the file date and URL from a UTC instant', () => {
    expect(logDateOf(at(10, 3, 24))).toBe('26-08-16');
    expect(logUrl('http://158.69.153.134/logs/', 'FIVEINTERFACESERVER', 'Survival', '26-08-16'))
      .toBe('http://158.69.153.134/logs/FIVEINTERFACESERVER/Survival%2026-08-16.log');
    expect(utcSecondsOfDay(at(10, 3, 24))).toBe(10 * 3600 + 3 * 60 + 24);
  });
});

describe('server-logs — parsers on real lines', () => {
  it('splits Survival lines into clock + text, keeping the raw line', () => {
    const lines = parseSurvival(IS_SURVIVAL);
    expect(lines[1]).toEqual({ at: 10 * 3600 + 3 * 60 + 23, text: 'LOGON ATTEMPT: User=SPO_test3', raw: '10:03:23 AM - LOGON ATTEMPT: User=SPO_test3' });
    expect(lines[7].text).toBe('SPO_test3.IP = 88.167.51.32');
    expect(parseSurvival('no clock here')[0]).toEqual({ at: null, text: 'no clock here', raw: 'no clock here' });
  });

  it('parses the Clients TSV', () => {
    const rows = parseClients(IS_CLIENTS);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ tycoon: 'SPO_test3', ip: '88.167.51.32', exitCode: 0 });
    expect(rows[1].exitCode).toBe(3);
    expect(parseClients('short\tline')).toEqual([]);
  });

  it('brackets each LOGON of one user, with ClientViewId, IP and disconnect', () => {
    const blocks = findLogonBlocks(parseSurvival(IS_SURVIVAL), 'SPO_test3');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ clientViewId: '7187732', ip: '88.167.51.32', successAt: 10 * 3600 + 3 * 60 + 24, disconnectAt: 10 * 3600 + 3 * 60 + 26 });
    expect(blocks[1].clientViewId).toBe('6942220');
    // The other user's LOGON SUCCESS between the two is not ours.
    expect(blocks.map(b => b.clientViewId)).not.toContain('6850248');
  });

  it('surfaces trouble lines but not the ordinary logon vocabulary', () => {
    const blocks = findLogonBlocks(parseSurvival(IS_SURVIVAL), 'SPO_test3');
    expect(troubleLines(blocks[0].lines)).toEqual([]);
    expect(troubleLines(blocks[1].lines).map(l => l.text)).toEqual(['Error in SegmentsInArea']);
  });

  it('finds heartbeat gaps only inside the window', () => {
    const ms = parseSurvival(MS_SURVIVAL);
    expect(heartbeatGaps(ms, 10 * 3600 + 3 * 60 + 24, 10 * 3600 + 3 * 60 + 26)).toEqual([]);
    const gaps = heartbeatGaps(ms, 10 * 3600 + 52 * 60 + 23, 10 * 3600 + 53 * 60);
    expect(gaps).toEqual([{ from: 10 * 3600 + 52 * 60 + 15, to: 10 * 3600 + 53 * 60 + 30, gapSec: 75 }]);
  });
});

describe('server-logs — correlateSession', () => {
  const logs = { isSurvival: IS_SURVIVAL, isClients: IS_CLIENTS, msSurvival: MS_SURVIVAL };

  it('a clean session: bracket by ClientViewId, exit 0, offset measured, no failures', () => {
    const v = correlateSession({ username: 'SPO_test3', clientViewId: '7187732', loginAt: at(10, 3, 23), logoffAt: at(10, 3, 26) }, logs);
    expect(v.bracketFound).toBe(true);
    expect(v.serverLoginAt).toBe('10:03:24 AM');
    expect(v.serverDisconnectAt).toBe('10:03:26 AM');
    expect(v.serverIp).toBe('88.167.51.32');
    expect(v.clockOffsetSec).toBe(1);
    expect(v.clientsRow).toEqual({ login: '10:03:24 AM', logout: '10:03:26 AM', exitCode: 0 });
    expect(v.otherSessionsToday).toBe(1);
    expect(v.anomalies).toEqual([]);
    expect(v.failures).toEqual([]);
    expect(formatServerLogVerdict(v)).toContain('exit code 0');
  });

  it('a troubled session: anomaly surfaced, exit code ≠ 0 and heartbeat gap are failures', () => {
    const v = correlateSession({ username: 'SPO_test3', clientViewId: '6942220', loginAt: at(10, 52, 23), logoffAt: at(10, 53, 0) }, logs);
    expect(v.anomalies).toEqual(['10:52:23 AM - Error in SegmentsInArea']);
    expect(v.failures).toEqual(expect.arrayContaining([expect.stringMatching(/exit code 3/), expect.stringMatching(/heartbeat gap/)]));
    expect(formatServerLogVerdict(v)).toContain('FAILURES');
  });

  it('no bracket → one failure, nothing else judged', () => {
    const v = correlateSession({ username: 'SPO_test3', clientViewId: '999', loginAt: at(10, 3, 23), logoffAt: at(10, 3, 26) }, logs);
    expect(v.bracketFound).toBe(false);
    expect(v.failures).toEqual([expect.stringMatching(/no LOGON SUCCESS block with ClientViewId=999/)]);
    expect(formatServerLogVerdict(v)).toContain('NOT FOUND');
  });

  it('a session whose Clients row is not written yet is flagged, not crashed', () => {
    const v = correlateSession({ username: 'SPO_test3', clientViewId: '7187732', loginAt: at(10, 3, 23), logoffAt: at(10, 3, 26) }, { ...logs, isClients: '' });
    expect(v.clientsRow).toBeNull();
    expect(v.failures[0]).toMatch(/no Clients row/);
  });
});

// =============================================================================
// O5 — the ISCnx freeze oracle
//
// Lines copied verbatim from report/campaign/logs-cache/2026-08-17-preserve/MS.
// They are the ONLY dated lines in an MS Survival file, which is why they need
// their own parser: parseSurvival leaves them at:null.
// =============================================================================
const MS_ISCNX_FREEZE = [
  '9:29:48 PM Check roads',
  '9:29:48 PM 29573>',
  '2026-08-14 9:29:58 PM <ISCnx> (10)- Query timed out sel 6944144 call ModelStatusChanged "*" "#1"; Time: 10000',
  '9:29:58 PM - Starting binary backup.',
  '2026-08-14 9:30:48 PM <ISCnx> (10)- Query timed out sel 6944144 call ModelStatusChanged "*" "#2"; Time: 10000',
  '9:30:48 PM <29574',
].join('\n');

const MS_ISCNX_SOCKET_DEATH = [
  '10:10:07 AM SIM-Facs',
  '2026-08-15 10:10:09 AM ISCnx Error writing to socket',
  'Start disconnecting: (ISCnx) 2026-08-15 10:10:09 AM',
  'End disconnecting: (ISCnx) ',
  '10:10:24 AM Check roads',
].join('\n');

describe('server-logs — parseIsCnxEvents', () => {
  it('parses the dated query-timeout lines of the 2026-08-14 freeze', () => {
    const events = parseIsCnxEvents(MS_ISCNX_FREEZE);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: 'query-timeout', date: '2026-08-14', at: 21 * 3600 + 29 * 60 + 58 });
    expect(events[1].at).toBe(21 * 3600 + 30 * 60 + 48);
  });

  it('parses the socket death and both disconnect lines of 2026-08-15', () => {
    const events = parseIsCnxEvents(MS_ISCNX_SOCKET_DEATH);
    expect(events.map(e => e.kind)).toEqual(['write-error', 'disconnect', 'disconnect']);
    expect(events[0].at).toBe(10 * 3600 + 10 * 60 + 9);
    // `Start disconnecting: (ISCnx) <date> <clock>` carries its stamp at the END.
    expect(events[1]).toMatchObject({ date: '2026-08-15', at: 10 * 3600 + 10 * 60 + 9 });
    // `End disconnecting: (ISCnx)` carries none at all — kept, unstamped.
    expect(events[2].at).toBeNull();
  });

  // Specificity: 0 ISCnx lines across 08-10/11/12/13/16 in the preserved corpus,
  // including a 3 h world suspension on 08-11. An ordinary simulation tick
  // cannot produce one.
  it('finds nothing in an ordinary heartbeat', () => {
    expect(parseIsCnxEvents(MS_SURVIVAL)).toEqual([]);
  });

  it('ignores lines that merely mention the word without a parseable shape', () => {
    expect(parseIsCnxEvents('some prose about ISCnx with no stamp')).toEqual([]);
  });
});

describe('server-logs — lastStampOf', () => {
  it('reports how far the log actually extends, skipping unstamped trailers', () => {
    const lines = parseSurvival([...MS_SURVIVAL.split('\n'), 'End disconnecting: (ISCnx) '].join('\n'));
    expect(lastStampOf(lines)).toBe(10 * 3600 + 53 * 60 + 30);
  });

  it('is null when nothing carries a clock', () => {
    expect(lastStampOf(parseSurvival('no clock at all'))).toBeNull();
  });
});

describe('server-logs — O5 in correlateSession', () => {
  const freezeLogs = {
    isSurvival: IS_SURVIVAL,
    isClients: IS_CLIENTS,
    // Same shape as the real freeze, moved into our fixture session's window.
    msSurvival: [
      '10:03:10 AM Check roads',
      '2026-08-16 10:03:40 AM <ISCnx> (10)- Query timed out sel 6944144 call ModelStatusChanged "*" "#1"; Time: 10000',
      '11:00:00 AM Check roads',
    ].join('\n'),
  };

  it('fails the session when ISCnx saw the Interface Server go silent', () => {
    const v = correlateSession(
      { username: 'SPO_test3', clientViewId: '7187732', loginAt: at(10, 3, 23), logoffAt: at(10, 3, 26) },
      freezeLogs,
    );
    expect(v.isCnxEvents).toHaveLength(1);
    expect(v.isCnxEvents[0].kind).toBe('query-timeout');
    expect(v.failures).toEqual(expect.arrayContaining([expect.stringMatching(/freeze signature/)]));
    expect(formatServerLogVerdict(v)).toContain('O5 ISCnx');
  });

  // The freeze that mattered produced a NOMINAL Model Server heartbeat for 12 h.
  // If O5 rested on heartbeat gaps it would have reported this session clean.
  it('catches a freeze that leaves the MS heartbeat perfectly regular', () => {
    const v = correlateSession(
      { username: 'SPO_test3', clientViewId: '7187732', loginAt: at(10, 3, 23), logoffAt: at(10, 3, 26) },
      freezeLogs,
    );
    expect(v.heartbeatGaps).toEqual([]);
    expect(v.failures.some(f => /freeze signature/.test(f))).toBe(true);
  });

  // An open measurement is not a verdict. A run correlates seconds after logoff,
  // so the probe that would reveal a freeze has not fired yet — failing on that
  // would fail every live run and jam the git gate. Calling it "clean" is what
  // the old O5 did. It is reported, and left open.
  it('declares the oracle inconclusive without failing the run', () => {
    const v = correlateSession(
      { username: 'SPO_test3', clientViewId: '7187732', loginAt: at(10, 3, 23), logoffAt: at(10, 3, 26) },
      { ...freezeLogs, msSurvival: '10:03:10 AM Check roads\n10:03:40 AM Check roads' },
    );
    expect(v.isCnxEvents).toEqual([]);
    expect(v.livenessConclusive).toBe(false);
    expect(v.livenessConclusiveAt).toBe(formatClock(10 * 3600 + 3 * 60 + 26 + ISCNX_CONCLUSION_WINDOW_SEC));
    expect(v.failures).toEqual([]);
    expect(formatServerLogVerdict(v)).toContain('INCONCLUSIVE');
  });

  it('concludes once the log extends past one probe cycle after the session', () => {
    const end = 10 * 3600 + 3 * 60 + 26;
    const v = correlateSession(
      { username: 'SPO_test3', clientViewId: '7187732', loginAt: at(10, 3, 23), logoffAt: at(10, 3, 26) },
      { ...freezeLogs, msSurvival: `10:03:10 AM Check roads\n${formatClock(end + ISCNX_CONCLUSION_WINDOW_SEC)} Check roads` },
    );
    expect(v.livenessConclusive).toBe(true);
    expect(v.livenessConclusiveAt).toBe(formatClock(end + ISCNX_CONCLUSION_WINDOW_SEC));
    expect(v.failures).toEqual([]);
  });

  it('ignores ISCnx events from before our session', () => {
    const v = correlateSession(
      { username: 'SPO_test3', clientViewId: '6942220', loginAt: at(10, 52, 23), logoffAt: at(10, 53, 0) },
      freezeLogs,
    );
    // The 10:03:40 AM event predates this session's 10:52:23 AM bracket.
    expect(v.isCnxEvents).toEqual([]);
  });
});

describe('server-logs — fetchDayLogs', () => {
  it('fetches the three files for the day, and both days across midnight', async () => {
    const urls: string[] = [];
    const fetch = async (u: string) => { urls.push(u); return `body:${u.slice(-28)}`; };
    const one = await fetchDayLogs('http://x/logs', { loginAt: at(10, 0, 0), logoffAt: at(10, 5, 0) }, fetch);
    expect(urls).toHaveLength(3);
    expect(one.isClients).toContain('Clients%2026-08-16');
    urls.length = 0;
    await fetchDayLogs('http://x/logs', { loginAt: new Date(Date.UTC(2026, 7, 16, 23, 59, 0)), logoffAt: new Date(Date.UTC(2026, 7, 17, 0, 1, 0)) }, fetch);
    expect(urls).toHaveLength(6);
    expect(urls.some(u => u.includes('26-08-17'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R2 §3.7 — the two hard signatures are fatal, not decorative
//
// Every other TROUBLE pattern is ambiguous by design (`timeout`, `renewing`,
// `fail` all appear on a healthy busy server) and is surfaced for a human.
// These two are what a Delphi server writes when it has ALREADY been
// corrupted, and a run that produced one has no business exiting 0.
// ═══════════════════════════════════════════════════════════════════════════
describe('server-logs — fatal signatures', () => {
  it('promotes the malformed-query line — the 2026-08-18 signature', () => {
    const out = fatalAnomalies(['11:41:03 AM - Malformed query in TRDOQueryServer.ExecQuery']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/query dispatcher can no longer parse its input/);
    expect(out[0]).toMatch(/Malformed query in TRDOQueryServer\.ExecQuery/);
  });

  it('promotes an access violation — the direct symptom of the "*"-on-a-function write', () => {
    const out = fatalAnomalies(['11:39:57 AM - Access violation at address 004A1B2C in module FIVEIS.exe']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/memory it does not own/);
  });

  // The hole this closed: `Malformed query in TRDOQueryServer.ExecQuery` carries
  // none of the words TROUBLE looked for, so it was never even DISPLAYED. The
  // fatal scan therefore reads the bracket's raw lines, never `anomalies`.
  it('is its own oracle: it does not depend on TROUBLE having matched first', () => {
    const line = '11:41:03 AM - Malformed query in TRDOQueryServer.ExecQuery';
    expect(fatalAnomalies([line])).toHaveLength(1);
    // …and the line is now surfaced too, so the console shows what failed the run.
    expect(troubleLines([{ at: 1, text: line, raw: line }])).toHaveLength(1);
  });

  it('leaves the ambiguous lines exactly where they were — surfaced, not judged', () => {
    expect(fatalAnomalies([
      '12:00:00 PM - Renewing world proxy',
      '12:00:01 PM - Request timeout on ISProxy',
      '12:00:02 PM - Failed to deliver event',
      '12:00:03 PM - error 5 getting Whatever',
    ])).toEqual([]);
  });

  it('matches whatever the case, and reports each offending line once', () => {
    const out = fatalAnomalies([
      '1 - MALFORMED QUERY IN TRDOQUERYSERVER.EXECQUERY',
      '2 - access violation',
      '3 - nothing to see',
    ]);
    expect(out).toHaveLength(2);
  });

  it('every signature carries the reason it is fatal — no bare regex list', () => {
    expect(FATAL_SIGNATURES).toHaveLength(2);
    for (const { why } of FATAL_SIGNATURES) expect(why.length).toBeGreaterThan(30);
  });

  /**
   * End to end: the signature has to reach `verdict.failures`, because that is
   * the field `run.ts` turns into exit code 1. A promotion that stopped at the
   * display would look identical in the console and change nothing.
   */
  it('a malformed-query line inside our bracket fails the verdict', () => {
    const verdict = correlateSession(
      { username: 'SPO_test3', clientViewId: '7272232', loginAt: new Date(Date.UTC(2026, 7, 18, 12, 0, 1)), logoffAt: new Date(Date.UTC(2026, 7, 18, 12, 0, 30)) },
      {
        isSurvival: [
          '12:00:00 PM - LOGON ATTEMPT: User=SPO_test3',
          '12:00:01 PM - LOGON SUCCESS: ClientViewId=7272232',
          '12:00:10 PM - Malformed query in TRDOQueryServer.ExecQuery',
          '12:00:30 PM - Start Disconnecting Client',
        ].join('\n'),
        isClients: 'SPO_test3\t12:00:01 PM\t12:00:30 PM\t0\n',
        msSurvival: '12:00:00 PM - tick\n12:00:30 PM - tick\n',
      },
    );
    expect(verdict.anomalies.some(a => /Malformed query/.test(a))).toBe(true);
    expect(verdict.failures.some(f => /query dispatcher can no longer parse its input/.test(f))).toBe(true);
  });
});
