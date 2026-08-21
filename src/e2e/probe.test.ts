import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import { WsDriver } from './ws-driver';
import { runProbe, probeFailure, type ProbeSpec } from './probe';
import { WorldLock } from './world-lock';
import type { LiveSession } from './session';
import { PRIMARY_ACCOUNT } from './config';
import * as liveLog from './live-log';

const spec: ProbeSpec = {
  what: 'Helartia tax row 0',
  member: 'RDOSetTaxValue',
  x: 100,
  y: 200,
  visualClass: '512',
  groupId: 'townTaxes',
  readProperty: 'Tax0Percent',
  writeProperty: 'RDOSetTaxValue',
  additionalParams: { index: '0' },
  testValue: () => '8',
};

const window = { url: 'http://logs/S.log', offset: 0, openedAt: 'now' };
const factory = async () => window;

/** A session whose reads return `values.shift()` and whose writes are recorded. */
function sessionReading(values: (string | undefined)[], onWrite?: (value: string) => void): LiveSession {
  const driver = {
    close: jest.fn(),
    log: [],
    errors: [],
    send: jest.fn(),
    seen: jest.fn(() => []),
    request: jest.fn(async (msg: WsMessage) => {
      if (msg.type === WsMessageType.REQ_BUILDING_DETAILS) {
        const value = values.shift();
        return {
          type: WsMessageType.RESP_BUILDING_DETAILS,
          details: {
            groups: value === undefined ? {} : { townTaxes: [{ name: 'Tax0Percent', value }] },
          },
        };
      }
      onWrite?.((msg as unknown as { value: string }).value);
      return { type: WsMessageType.RESP_BUILDING_SET_PROPERTY, success: true, newValue: '' };
    }),
  };
  return {
    driver: driver as unknown as WsDriver,
    account: PRIMARY_ACCOUNT,
    company: { id: '1', name: 'SPO_test3 - Green' },
    worlds: 1,
    companies: [],
  };
}

function tempLock(): WorldLock {
  return new WorldLock(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-probe-')));
}

afterEach(() => jest.restoreAllMocks());

describe('runProbe', () => {
  it('passes when the log proves the write and the value is restored', async () => {
    jest.spyOn(liveLog, 'awaitMarker').mockResolvedValue('Setting Tax value: 8');
    const writes: string[] = [];
    const session = sessionReading(['7', '8'], v => writes.push(v));
    const lock = tempLock();

    const result = await runProbe(session, spec, lock, factory, window.url);

    expect(result.status).toBe('PASS');
    expect(result.original).toBe('7');
    expect(result.written).toBe('8');
    expect(result.readBack).toBe('CONFIRMED');
    expect(result.restored).toBe(true);
    expect(writes).toEqual(['8', '7']);
    expect(lock.read().pendingRestores).toEqual([]);
  });

  it('fails when no log line appears — the write never reached the object', async () => {
    jest.spyOn(liveLog, 'awaitMarker').mockResolvedValue(null);
    const result = await runProbe(sessionReading(['7', '8']), spec, tempLock(), factory, window.url);
    expect(result.status).toBe('FAIL');
    expect(result.note).toMatch(/never reached the object/);
  });

  it('still restores after a failed assertion', async () => {
    jest.spyOn(liveLog, 'awaitMarker').mockResolvedValue(null);
    const writes: string[] = [];
    const session = sessionReading(['7', '8'], v => writes.push(v));
    await runProbe(session, spec, tempLock(), factory, window.url);
    expect(writes).toEqual(['8', '7']);
  });

  it('downgrades a lagging read-back instead of failing the probe', async () => {
    jest.spyOn(liveLog, 'awaitMarker').mockResolvedValue('Setting Tax value: 8');
    const result = await runProbe(sessionReading(['7', '7']), spec, tempLock(), factory, window.url);
    expect(result.status).toBe('PASS');
    expect(result.readBack).toBe('UNCONFIRMED');
    expect(result.note).toMatch(/OB-29/);
  });

  it('registers the pending restore before issuing the write', async () => {
    jest.spyOn(liveLog, 'awaitMarker').mockResolvedValue('Setting Tax value: 8');
    const lock = tempLock();
    const seen: number[] = [];
    const session = sessionReading(['7', '8'], () => seen.push(lock.read().pendingRestores.length));
    await runProbe(session, spec, lock, factory, window.url);
    expect(seen[0]).toBe(1);
  });

  it('leaves the pending restore in place when the restore itself fails', async () => {
    jest.spyOn(liveLog, 'awaitMarker').mockResolvedValue('Setting Tax value: 8');
    const lock = tempLock();
    let writes = 0;
    const session = sessionReading(['7', '8'], () => {
      writes += 1;
      if (writes === 2) throw new Error('restore rejected');
    });
    const result = await runProbe(session, spec, lock, factory, window.url);
    expect(result.status).toBe('FAIL');
    expect(result.note).toMatch(/world is left dirty/);
    expect(lock.read().pendingRestores).toHaveLength(1);
  });

  it('refuses to write when the original value cannot be read', async () => {
    const lock = tempLock();
    await expect(runProbe(sessionReading([undefined]), spec, lock, factory, window.url)).rejects.toThrow(
      /nothing to restore to/,
    );
    expect(lock.read().pendingRestores).toEqual([]);
  });

  it('refuses a member with no known log marker — it could never be proven', async () => {
    const unproven = { ...spec, member: 'RDOSetSomethingNew' };
    await expect(runProbe(sessionReading(['7']), unproven, tempLock(), factory, window.url)).rejects.toThrow(
      /No model-server log marker/,
    );
  });

  it('reports a mid-probe throw as a failure and still restores', async () => {
    jest.spyOn(liveLog, 'awaitMarker').mockRejectedValue(new Error('log host vanished'));
    const writes: string[] = [];
    const result = await runProbe(
      sessionReading(['7', '8'], v => writes.push(v)),
      spec,
      tempLock(),
      factory,
      window.url,
    );
    expect(result.status).toBe('FAIL');
    expect(result.note).toBe('log host vanished');
    expect(result.restored).toBe(true);
    expect(writes).toEqual(['8', '7']);
  });
});

describe('probeFailure', () => {
  it('keeps the reason so the report is not just "FAIL"', () => {
    const result = probeFailure(spec, new Error('socket closed'));
    expect(result).toMatchObject({ status: 'FAIL', note: 'socket closed', restored: false });
  });
});
