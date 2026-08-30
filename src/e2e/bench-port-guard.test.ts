/**
 * The bench-port guard decides whether a Bash command would take the live bench from the
 * worker that owns it.
 *
 * Why it exists: port 8080, the LOCKED accounts and the Helartia world state belong to a
 * single worker process, and the rule saying so lived in CLAUDE.md — advisory to a model.
 * A session verifying its own change reached for a gateway, the default port is 8080
 * (src/shared/config.ts:23), and the worker then either killed that gateway mid-run or
 * found a listener it could not attribute and blocked every session's gate.
 *
 * The suite pins both halves: what must be refused, and — just as important, because a
 * false positive costs a session a turn — what must go straight through.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import { createServer } from 'net';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';

const HOOK = path.join(process.cwd(), '.claude', 'hooks', 'bench-port-guard.sh');
const DEV_LOCAL = path.join(process.cwd(), 'scripts', 'dev-local.sh');

interface HookRun {
  code: number;
  stderr: string;
}

function scratchSessions(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spo-port-guard-'));
}

function invoke(command: string, env: NodeJS.ProcessEnv = {}): HookRun {
  try {
    execFileSync('bash', [HOOK], {
      input: JSON.stringify({ tool_input: { command } }),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, SPO_SESSION_DIR: scratchSessions(), ...env },
    });
    return { code: 0, stderr: '' };
  } catch (err: unknown) {
    const failure = err as { status?: number; stderr?: Buffer };
    return { code: failure.status ?? -1, stderr: failure.stderr?.toString() ?? '' };
  }
}

/** 0 = allowed through, 2 = blocked. */
function guard(command: string): number {
  return invoke(command).code;
}

describe('starting a gateway on the bench port', () => {
  it.each([
    ['npm start'],
    ['npm run start'],
    ['node dist/server/server.js'],
    ['node --disable-warning=DEP0040 dist/server/server.js'],
    ['npm run build && npm start'],
    ['PORT=8080 npm start'],
    ['PORT=8080 npm run dev:local'],
    ['export PORT=8080; npm start'],
    ['env PORT=8080 npm start'],
    ['nohup node dist/server/server.js'],
    ["bash -c 'npm start'"],
    ['sh -c "npm start"'],
    ['npm --prefix /x start'],
    ['echo $((1 << 2))\nnpm start'],
  ])('blocks %s', (command) => {
    expect(guard(command)).toBe(2);
  });

  it('names the two sanctioned ways out', () => {
    const run = invoke('npm start');
    expect(run.stderr).toMatch(/npm run dev\b/);
    expect(run.stderr).toMatch(/PORT=8081 npm run dev:local/);
    expect(run.stderr).toMatch(/npm run gate/);
  });

  it.each([
    ['PORT=8081 npm start'],
    ['PORT=9000 node dist/server/server.js'],
    ['export PORT=8081 && npm start'],
    // dev:local picks its own free port off the bench — scripts/dev-local.sh.
    ['npm run dev:local'],
    ['npm run dev'],
    ['npm run gate'],
    ['npm run test:live'],
    ['npm run build'],
    ['npm test'],
    ['env PORT=8081 npm start'],
    ['npm run gate:local'],
    ['node scripts/verify-gate.js'],
  ])('allows %s', (command) => {
    expect(guard(command)).toBe(0);
  });

  it('follows SPO_BENCH_PORT when the bench moves', () => {
    expect(invoke('PORT=8085 npm start', { SPO_BENCH_PORT: '8085' }).code).toBe(2);
    expect(invoke('npm start', { SPO_BENCH_PORT: '8085' }).code).toBe(0);
  });
});

describe('driving the live world outside the worker', () => {
  it.each([
    ['npm run test:live:local'],
    ['node dist/e2e/run.js'],
    ['node scripts/verify-gate.js --live'],
    ['npm run gate:local -- --live'],
  ])('blocks %s', (command) => {
    expect(guard(command)).toBe(2);
  });

  it('points at the queued form', () => {
    expect(invoke('npm run test:live:local').stderr).toMatch(/npm run test:live\b/);
  });
});

/**
 * The class of false positive that made the first version of the push-gate hook unusable:
 * a command that merely NAMES the verb is not an invocation of it.
 */
describe('mentions are not invocations', () => {
  it.each([
    ["grep -rn 'npm start' doc/"],
    ['echo "run npm start to boot the gateway"'],
    ['cat > /tmp/note.md <<EOF\nnpm start\nnode dist/server/server.js\nEOF'],
  ])('allows %s', (command) => {
    expect(guard(command)).toBe(0);
  });
});

describe('the escape hatch', () => {
  it('lets a human who owns the bench through, explicitly', () => {
    expect(guard('SPO_BENCH_PORT_OVERRIDE=i-own-the-bench npm start')).toBe(0);
  });
});

/**
 * The guard is the backstop; the default belongs in the script. dev:local used to be
 * `npm run build && npm start`, which binds the bench port when PORT is unset.
 */
describe('dev:local never lands on the bench port', () => {
  function devLocal(env: NodeJS.ProcessEnv): { code: number; stderr: string } {
    const run = spawnSync('bash', [DEV_LOCAL], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    return { code: run.status ?? -1, stderr: run.stderr };
  }

  it('refuses PORT=8080 outright', () => {
    const run = devLocal({ PORT: '8080' });
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/8080 is the bench port/);
    expect(run.stderr).toMatch(/npm run dev\b/);
  });

  it('refuses a port already in use, before spending a build on it', async () => {
    const held = createServer();
    await new Promise<void>((resolve) => held.listen(0, '0.0.0.0', resolve));
    const taken = (held.address() as AddressInfo).port;
    try {
      const run = devLocal({ PORT: String(taken) });
      expect(run.code).toBe(1);
      expect(run.stderr).toMatch(new RegExp(`port ${taken} is already in use`));
    } finally {
      await new Promise<void>((resolve) => held.close(() => resolve()));
    }
  });

  it('refuses when the whole local range is taken, instead of falling back to the bench', async () => {
    const held = createServer();
    await new Promise<void>((resolve) => held.listen(0, '0.0.0.0', resolve));
    const taken = (held.address() as AddressInfo).port;
    try {
      // A one-port range, and that port is busy: there is nowhere to go but the bench,
      // and the answer must be a refusal.
      const run = spawnSync('bash', [DEV_LOCAL], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PORT: '',
          SPO_LOCAL_PORT_BASE: String(taken),
          SPO_LOCAL_PORT_SPAN: '1',
        },
      });
      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(/no free port/);
    } finally {
      await new Promise<void>((resolve) => held.close(() => resolve()));
    }
  });
});
