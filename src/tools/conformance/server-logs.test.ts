/**
 * Parsers and verdict against REAL lines sampled from the public log endpoint
 * on 2026-08-16 (the SPO_test3 probe sessions of that morning).
 */

import {
  correlateSession, fetchDayLogs, findLogonBlocks, formatClock, formatServerLogVerdict, heartbeatGaps,
  logDateOf, logUrl, parseClients, parseClock, parseSurvival, troubleLines, utcSecondsOfDay,
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
