import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Writable } from 'stream';
import { formatSummary, main, runLive, type LiveRunOptions, type LiveRunResult } from './run';
import { WorldLock } from './world-lock';
import { LIMITS } from './config';
import * as preflightModule from './preflight';
import * as flowsModule from './flows';
import * as capabilityModule from './capability';

function tempLock(): WorldLock {
  return new WorldLock(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-run-')));
}

const okPreflight = {
  ok: true,
  checks: [{ what: 'gateway is ready', ok: true }],
  environmentAbort: false,
  survivalLogUrl: 'http://logs/S.log',
};

function passingFlow(name: string): flowsModule.FlowResult {
  return {
    name,
    status: 'PASS',
    assertions: [],
    probes: [],
    messagesSent: 4,
    messagesReceived: 6,
    wireErrors: 0,
  };
}

afterEach(() => jest.restoreAllMocks());

describe('runLive', () => {
  it('reads the requested capabilities before the flows and carries the evidence', async () => {
    jest.spyOn(preflightModule, 'preflight').mockResolvedValue(okPreflight);
    const order: string[] = [];
    jest.spyOn(capabilityModule, 'checkCapability').mockImplementation(async capability => {
      order.push(`cap:${capability}`);
      return {
        capability,
        account: 'SPO_test3',
        members: ['RDOSitMayor'],
        determined: true,
        granted: false,
        checks: [{ what: 'canGovern on the Capitol (server grantAccess)', value: 'false' }],
        checkedAt: 'now',
      };
    });
    jest.spyOn(flowsModule, 'runFlow').mockImplementation(async flow => {
      order.push(`flow:${flow.name}`);
      return passingFlow(flow.name);
    });

    const result = await runLive({
      flows: ['login-spine'],
      branch: 'fix/a',
      lock: tempLock(),
      capabilities: ['president'],
    });

    expect(order).toEqual(['cap:president', 'flow:login-spine']);
    expect(result.status).toBe('PASS');
    expect(result.capabilities).toHaveLength(1);
    expect(result.capabilities[0].granted).toBe(false);
    expect(formatSummary(result)).toContain('capability president: NOT GRANTED for SPO_test3');
  });

  it('runs the requested flows and passes when they all pass', async () => {
    jest.spyOn(preflightModule, 'preflight').mockResolvedValue(okPreflight);
    jest.spyOn(flowsModule, 'runFlow').mockImplementation(async flow => passingFlow(flow.name));

    const result = await runLive({ flows: ['login-spine'], branch: 'fix/a', lock: tempLock() });

    expect(result.status).toBe('PASS');
    expect(result.flows.map(f => f.name)).toEqual(['login-spine']);
  });

  it('fails the run when any flow fails', async () => {
    jest.spyOn(preflightModule, 'preflight').mockResolvedValue(okPreflight);
    jest
      .spyOn(flowsModule, 'runFlow')
      .mockImplementation(async flow => ({ ...passingFlow(flow.name), status: 'FAIL' as const }));

    const result = await runLive({ flows: ['login-spine'], branch: 'fix/a', lock: tempLock() });
    expect(result.status).toBe('FAIL');
  });

  it('reports an ENVIRONMENT abort without running a single flow', async () => {
    jest.spyOn(preflightModule, 'preflight').mockResolvedValue({
      ok: false,
      checks: [{ what: 'gateway is ready', ok: false, detail: 'unreachable' }],
      environmentAbort: true,
    });
    const runFlow = jest.spyOn(flowsModule, 'runFlow');

    const result = await runLive({ flows: ['login-spine'], branch: 'fix/a', lock: tempLock() });

    expect(result.status).toBe('ENVIRONMENT');
    expect(result.error).toContain('unreachable');
    expect(runFlow).not.toHaveBeenCalled();
  });

  it('releases the lock after an environment abort so the next run is not blocked', async () => {
    jest.spyOn(preflightModule, 'preflight').mockResolvedValue({
      ok: false,
      checks: [],
      environmentAbort: true,
    });
    const lock = tempLock();
    await runLive({ flows: ['login-spine'], branch: 'fix/a', lock });
    expect(lock.read().holder).toBeNull();
  });

  it('does not consume a run against the rate limit when pre-flight fails', async () => {
    jest.spyOn(preflightModule, 'preflight').mockResolvedValue({
      ok: false,
      checks: [],
      environmentAbort: true,
    });
    const lock = tempLock();
    await runLive({ flows: ['login-spine'], branch: 'fix/a', lock });
    expect(() => lock.checkRateLimit('fix/a')).not.toThrow();
  });

  it('reports BLOCKED rather than FAIL when the rate limiter refuses', async () => {
    // Since 2026-08-22 the shipping interval is 0 (developer decision — the bench worker
    // queue throttles), so the refusal is reached through the daily backstop cap instead.
    const lock = tempLock();
    const now = Date.now();
    for (let i = 0; i < LIMITS.maxRunsPerDay; i++) {
      lock.recordRun(`fix/${i}`, new Date(now - i * 1_000));
    }
    const preflight = jest.spyOn(preflightModule, 'preflight');

    const result = await runLive({ flows: ['login-spine'], branch: 'fix/a', lock });

    expect(result.status).toBe('BLOCKED');
    expect(result.error).toMatch(/Daily live-run cap/);
    expect(preflight).not.toHaveBeenCalled();
  });

  it('reports BLOCKED when the world is still dirty from an earlier run', async () => {
    const lock = tempLock();
    lock.acquire('fix/a', 1, () => false);
    lock.addPendingRestore({ what: 'x', x: 1, y: 2, propertyName: 'RDOSetTaxValue', originalValue: '7' });
    expect(() => lock.release()).toThrow();

    const result = await runLive({ flows: ['login-spine'], branch: 'fix/b', lock });
    expect(result.status).toBe('BLOCKED');
    expect(result.error).toMatch(/dirty/);
  });

  it('fails the run when a flow left the world dirty', async () => {
    jest.spyOn(preflightModule, 'preflight').mockResolvedValue(okPreflight);
    const lock = tempLock();
    jest.spyOn(flowsModule, 'runFlow').mockImplementation(async flow => {
      lock.addPendingRestore({ what: 'x', x: 1, y: 2, propertyName: 'RDOSetTaxValue', originalValue: '7' });
      return passingFlow(flow.name);
    });

    const result = await runLive({ flows: ['login-spine'], branch: 'fix/a', lock });

    expect(result.status).toBe('FAIL');
    expect(result.error).toMatch(/dirty/);
  });

  it('passes the resolved log url down to the flows', async () => {
    jest.spyOn(preflightModule, 'preflight').mockResolvedValue(okPreflight);
    const runFlow = jest
      .spyOn(flowsModule, 'runFlow')
      .mockImplementation(async flow => passingFlow(flow.name));

    await runLive({ flows: ['login-spine'], branch: 'fix/a', lock: tempLock() });

    expect(runFlow.mock.calls[0][1].survivalLogUrl).toBe('http://logs/S.log');
  });
});

describe('formatSummary', () => {
  const base: LiveRunResult = {
    world: 'planitia',
    branch: 'fix/a',
    startedAt: 'a',
    finishedAt: 'b',
    status: 'FAIL',
    preflight: { ok: true, checks: [], environmentAbort: false },
    flows: [],
    capabilities: [],
  };

  it('leads with the world and the verdict', () => {
    expect(formatSummary({ ...base, status: 'PASS' })).toContain('L2 live drive on planitia — PASS');
  });

  it('shows a failed assertion under its flow', () => {
    const summary = formatSummary({
      ...base,
      flows: [
        {
          name: 'permission-negative',
          status: 'FAIL',
          assertions: [{ what: 'a non-mayor is refused', ok: false, detail: 'canGovern=true' }],
          probes: [],
          messagesSent: 1,
          messagesReceived: 1,
          wireErrors: 0,
        },
      ],
    });
    expect(summary).toContain('x a non-mayor is refused (canGovern=true)');
  });

  it('shows whether each probe produced a log line and a restore', () => {
    const summary = formatSummary({
      ...base,
      flows: [
        {
          name: 'politics-write',
          status: 'FAIL',
          assertions: [],
          probes: [
            {
              what: 'tax row 0',
              member: 'RDOSetTaxValue',
              status: 'FAIL',
              original: '7',
              written: '8',
              logLine: null,
              readBack: 'UNCONFIRMED',
              restored: true,
            },
          ],
          messagesSent: 1,
          messagesReceived: 1,
          wireErrors: 0,
        },
      ],
    });
    expect(summary).toContain('log=NO');
    expect(summary).toContain('restored=true');
  });

  it('surfaces failed pre-flight checks', () => {
    const summary = formatSummary({
      ...base,
      status: 'ENVIRONMENT',
      preflight: {
        ok: false,
        checks: [{ what: 'gateway is ready', ok: false, detail: 'phase=loading' }],
        environmentAbort: true,
      },
    });
    expect(summary).toContain('pre-flight FAIL  gateway is ready: phase=loading');
  });
});

describe('main', () => {
  const result: LiveRunResult = {
    world: 'planitia',
    branch: 'fix/a',
    startedAt: '2026-08-21T10:00:00.000Z',
    finishedAt: '2026-08-21T10:05:00.000Z',
    status: 'PASS',
    preflight: { ok: true, checks: [], environmentAbort: false },
    flows: [],
    capabilities: [],
  };

  function sink(): { stream: Writable; text: () => string } {
    let text = '';
    const stream = new Writable({
      write(chunk, _enc, done) {
        text += String(chunk);
        done();
      },
    });
    return { stream, text: () => text };
  }

  it('runs every flow when none are named', async () => {
    const runner = jest.fn(async (_options: LiveRunOptions) => result);
    const out = sink();
    await main([], runner, out.stream);
    expect(runner.mock.calls[0][0].flows.length).toBeGreaterThan(1);
  });

  it('runs only the flows the caller asked for', async () => {
    const runner = jest.fn(async (_options: LiveRunOptions) => result);
    await main(['--flows=login-spine,politics-read', '--branch=fix/x'], runner, sink().stream);
    expect(runner.mock.calls[0][0]).toMatchObject({
      flows: ['login-spine', 'politics-read'],
      branch: 'fix/x',
    });
  });

  it('writes the run artifact and points at it', async () => {
    const out = sink();
    await main(['--flows=login-spine'], async () => result, out.stream);
    const expected = path.join('report', 'e2e', 'live-2026-08-21T10-00-00-000Z.json');
    expect(out.text()).toContain(expected);
    expect(JSON.parse(fs.readFileSync(expected, 'utf8')).status).toBe('PASS');
    fs.unlinkSync(expected);
  });

  it('exits non-zero on anything but PASS', async () => {
    const failed = { ...result, status: 'FAIL' as const };
    expect(await main(['--flows=login-spine'], async () => failed, sink().stream)).toBe(1);
    const written = path.join('report', 'e2e', 'live-2026-08-21T10-00-00-000Z.json');
    if (fs.existsSync(written)) fs.unlinkSync(written);
  });
});
