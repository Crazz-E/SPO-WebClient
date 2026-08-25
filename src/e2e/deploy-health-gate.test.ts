/**
 * The production deploy health gate — `deploy/deploy.sh`.
 *
 * Policy SEC-R-3 says a deploy must pass the health gate before old containers are pruned,
 * and that a failed gate must leave the previous deployment reachable. The script used to
 * do neither: `docker compose up` had already replaced the containers before the first
 * probe, a timed-out gate logged a warning and fell through to `docker image prune`, and a
 * `curl` with no `--max-time` against a stream that never closes could hold the deploy lock
 * for ever, silently stopping every later cron run.
 *
 * The suite drives the real script with `git`, `docker` and `curl` replaced by shims on
 * PATH, so the branches that only ever run on the production host are exercised here.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REAL_SCRIPT = path.join(process.cwd(), 'deploy', 'deploy.sh');
const OLD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NEW_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const GIT_SHIM = `#!/usr/bin/env bash
echo "git $*" >> "$SHIM_LOG"
case "$1" in
  fetch) exit 0 ;;
  rev-parse)
    case "$2" in
      HEAD)    cat "$SHIM_STATE/local_sha" ;;
      --short) cut -c1-7 "$SHIM_STATE/local_sha" ;;
      *)       cat "$SHIM_STATE/remote_sha" ;;
    esac
    exit 0 ;;
  pull)
    [ "\${SHIM_GIT_PULL_EXIT:-0}" = "0" ] || exit "\${SHIM_GIT_PULL_EXIT}"
    cp "$SHIM_STATE/remote_sha" "$SHIM_STATE/local_sha"
    exit 0 ;;
  reset)
    printf '%s\\n' "$3" > "$SHIM_STATE/local_sha"
    exit 0 ;;
esac
exit 0
`;

const DOCKER_SHIM = `#!/usr/bin/env bash
echo "docker $*" >> "$SHIM_LOG"
if [ "$1" = "compose" ]; then
  case "$2" in
    version) exit 0 ;;
    build)   exit "\${SHIM_BUILD_EXIT:-0}" ;;
    up)
      if [ "\${SHIM_UP_EXIT:-0}" != "0" ]; then exit "\${SHIM_UP_EXIT}"; fi
      touch "$SHIM_STATE/container_present"
      exit 0 ;;
    ps)   echo "spo-webclient  Up"; exit 0 ;;
    logs) echo "(container logs)"; exit 0 ;;
    *)    exit 0 ;;
  esac
fi
case "$1" in
  inspect)
    [ -f "$SHIM_STATE/container_present" ] || exit 1
    case "$3" in
      '{{.Image}}')        echo "sha256:previousimage" ;;
      '{{.Config.Image}}') echo "spo-webclient-spo-webclient" ;;
      *State.Health*)      cat "$SHIM_STATE/health" 2>/dev/null || echo "none" ;;
      *)                   echo "" ;;
    esac
    exit 0 ;;
esac
exit 0
`;

const CURL_SHIM = `#!/usr/bin/env bash
echo "curl $*" >> "$SHIM_LOG"
if [ -f "$SHIM_STATE/sse_body" ]; then cat "$SHIM_STATE/sse_body"; exit 0; fi
exit 22
`;

interface Scenario {
  /** Docker health status the container reports. Absent = image has no HEALTHCHECK. */
  health?: string;
  /** Body the readiness stream returns; absent = unreachable. */
  sse?: string;
  /** Is a gateway container already running when the deploy starts? */
  running?: boolean;
  buildExit?: number;
  upExit?: number;
  /** Content of the failed-commit memo before the run. */
  failedSha?: string;
  env?: NodeJS.ProcessEnv;
  args?: string[];
}

interface Run {
  code: number;
  stdout: string;
  calls: string[];
  failedSha: string | null;
  localSha: string;
  lockExists: boolean;
  dir: string;
}

function statusEvent(phase: string, message: string): string {
  return `event: status\ndata: ${JSON.stringify({ phase, progress: 1, message })}\n\n`;
}

/** A throwaway project tree with the real script and shimmed tooling on PATH. */
function deploy(scenario: Scenario = {}): Run {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-deploy-'));
  const bin = path.join(dir, 'bin');
  const state = path.join(dir, 'state');
  const project = path.join(dir, 'project');
  fs.mkdirSync(path.join(project, 'deploy'), { recursive: true });
  fs.mkdirSync(bin);
  fs.mkdirSync(state);

  fs.copyFileSync(REAL_SCRIPT, path.join(project, 'deploy', 'deploy.sh'));
  fs.chmodSync(path.join(project, 'deploy', 'deploy.sh'), 0o755);
  fs.writeFileSync(path.join(project, 'docker-compose.yml'), 'services: {}\n');
  fs.writeFileSync(path.join(project, '.env'), 'NODE_ENV=production\n');

  for (const [name, body] of [['git', GIT_SHIM], ['docker', DOCKER_SHIM], ['curl', CURL_SHIM]]) {
    fs.writeFileSync(path.join(bin, name), body, { mode: 0o755 });
  }

  fs.writeFileSync(path.join(state, 'local_sha'), `${OLD_SHA}\n`);
  fs.writeFileSync(path.join(state, 'remote_sha'), `${NEW_SHA}\n`);
  if (scenario.health) fs.writeFileSync(path.join(state, 'health'), `${scenario.health}\n`);
  if (scenario.sse) fs.writeFileSync(path.join(state, 'sse_body'), scenario.sse);
  if (scenario.running !== false) fs.writeFileSync(path.join(state, 'container_present'), '');
  if (scenario.failedSha) {
    fs.mkdirSync(path.join(project, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(project, 'logs', 'deploy-failed-sha'), `${scenario.failedSha}\n`);
  }

  const log = path.join(dir, 'calls.log');
  const lock = path.join(dir, 'deploy.lock');
  const run = spawnSync('bash', [path.join(project, 'deploy', 'deploy.sh'), ...(scenario.args ?? [])], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      SHIM_LOG: log,
      SHIM_STATE: state,
      SHIM_BUILD_EXIT: String(scenario.buildExit ?? 0),
      SHIM_UP_EXIT: String(scenario.upExit ?? 0),
      DEPLOY_LOCK_FILE: lock,
      HEALTH_TIMEOUT: '2',
      HEALTH_INTERVAL: '1',
      HEALTH_PROBE_TIMEOUT: '1',
      DEPLOY_STEP_TIMEOUT: '20',
      ...scenario.env,
    },
  });

  const failedShaFile = path.join(project, 'logs', 'deploy-failed-sha');
  return {
    code: run.status ?? -1,
    stdout: `${run.stdout}${run.stderr}`,
    calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [],
    failedSha: fs.existsSync(failedShaFile) ? fs.readFileSync(failedShaFile, 'utf8').trim() : null,
    localSha: fs.readFileSync(path.join(state, 'local_sha'), 'utf8').trim(),
    lockExists: fs.existsSync(lock),
    dir,
  };
}

const called = (run: Run, fragment: string): boolean => run.calls.some(c => c.includes(fragment));

describe('a deploy whose health gate passes', () => {
  const healthy = (): Run => deploy({ health: 'healthy' });

  it('exits 0 and prunes', () => {
    const run = healthy();
    expect(run.code).toBe(0);
    expect(called(run, 'docker image prune')).toBe(true);
  });

  it('rolls nothing back and leaves the checkout on the new commit', () => {
    const run = healthy();
    expect(called(run, 'git reset')).toBe(false);
    expect(called(run, '--force-recreate')).toBe(false);
    expect(run.localSha).toBe(NEW_SHA);
  });

  it('pins the running image as a rollback point before building', () => {
    const run = healthy();
    const tagAt = run.calls.findIndex(c => c.startsWith('docker tag sha256:previousimage'));
    const buildAt = run.calls.findIndex(c => c.startsWith('docker compose build'));
    expect(tagAt).toBeGreaterThanOrEqual(0);
    expect(tagAt).toBeLessThan(buildAt);
  });

  it('clears any memo of a previously failed commit', () => {
    expect(deploy({ health: 'healthy', failedSha: NEW_SHA, args: ['--force'] }).failedSha).toBeNull();
  });
});

describe('a deploy whose health gate never goes green', () => {
  // The container comes up, stays `starting` for ever, and the stream never reports ready:
  // a gateway that is listening but hung.
  const hung = (): Run =>
    deploy({ health: 'starting', sse: statusEvent('initializing', 'Loading facilities') });

  it('exits non-zero — the gate is a gate, not a log line', () => {
    expect(hung().code).toBe(1);
  });

  it('prunes nothing, so the previous image stays reachable', () => {
    expect(called(hung(), 'docker image prune')).toBe(false);
  });

  it('restores the previous image and the previous checkout', () => {
    const run = hung();
    expect(called(run, 'docker tag spo-webclient:rollback spo-webclient-spo-webclient')).toBe(true);
    expect(called(run, 'compose up -d --force-recreate --no-build spo-webclient')).toBe(true);
    expect(run.localSha).toBe(OLD_SHA);
  });

  it('remembers the commit that failed, and refuses to redeploy it', () => {
    expect(hung().failedSha).toBe(NEW_SHA);
    const second = deploy({ health: 'healthy', failedSha: NEW_SHA });
    expect(second.code).toBe(0);
    expect(called(second, 'docker compose build')).toBe(false);
    expect(second.stdout).toContain('Not redeploying it');
  });

  it('retries that commit when a human asks with --force', () => {
    const forced = deploy({ health: 'healthy', failedSha: NEW_SHA, args: ['--force'] });
    expect(forced.code).toBe(0);
    expect(called(forced, 'docker compose build')).toBe(true);
  });

  it('says so plainly when there is no rollback point at all', () => {
    const first = deploy({ health: 'starting', running: false });
    expect(first.code).toBe(1);
    expect(first.stdout).toContain('MANUAL INTERVENTION REQUIRED');
  });
});

describe('a container that reports itself unhealthy', () => {
  it('fails the gate without waiting out the timeout', () => {
    const run = deploy({ health: 'unhealthy' });
    expect(run.code).toBe(1);
    expect(run.stdout).toContain('unhealthy');
    expect(called(run, 'compose up -d --force-recreate --no-build spo-webclient')).toBe(true);
  });
});

describe('a build or start that fails outright', () => {
  it('never replaces the containers, and rewinds the checkout', () => {
    const run = deploy({ buildExit: 1 });
    expect(run.code).toBe(1);
    expect(called(run, 'docker compose up -d --remove-orphans')).toBe(false);
    expect(called(run, 'docker image prune')).toBe(false);
    expect(run.localSha).toBe(OLD_SHA);
    expect(run.failedSha).toBe(NEW_SHA);
    expect(run.stdout).toContain('the previous deployment is still serving');
  });

  it('rolls back when `compose up` itself fails, since it may have replaced containers', () => {
    const run = deploy({ upExit: 1 });
    expect(run.code).toBe(1);
    expect(called(run, 'docker tag spo-webclient:rollback spo-webclient-spo-webclient')).toBe(true);
  });
});

describe('the readiness read', () => {
  it('is bounded — every curl carries --max-time', () => {
    const run = deploy({ health: 'starting', sse: statusEvent('initializing', 'Loading') });
    const curls = run.calls.filter(c => c.startsWith('curl '));
    expect(curls.length).toBeGreaterThan(0);
    expect(curls.every(c => c.includes('--max-time'))).toBe(true);
  });

  it('takes the LAST event of the stream, not the first', () => {
    // An image with no HEALTHCHECK falls back to the stream. The first event says
    // initializing and the last says ready: reading the first would fail this deploy.
    const run = deploy({
      sse: statusEvent('initializing', 'Loading facilities') + statusEvent('ready', 'Server ready'),
    });
    expect(run.code).toBe(0);
    expect(called(run, 'docker image prune')).toBe(true);
  });
});

describe('the deploy lock', () => {
  /** A live process whose command line looks like a deploy, so the takeover check sees it. */
  function livingDeploy(dir: string): { pid: number; stop: () => void } {
    const fake = path.join(dir, 'deploy.sh');
    fs.writeFileSync(fake, '#!/usr/bin/env bash\nsleep 30\n', { mode: 0o755 });
    const child = spawnSync('bash', ['-c', `"${fake}" >/dev/null 2>&1 & echo $!`], { encoding: 'utf8' });
    const pid = Number(child.stdout.trim());
    return { pid, stop: () => { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } } };
  }

  it('leaves a live deploy alone — and leaves its lock file intact', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-lock-'));
    const holder = livingDeploy(dir);
    const lock = path.join(dir, 'held.lock');
    fs.writeFileSync(lock, `${holder.pid}\n`);
    try {
      const run = deploy({ health: 'healthy', env: { DEPLOY_LOCK_FILE: lock } });
      expect(run.code).toBe(0);
      expect(run.stdout).toContain('Another deploy is running');
      expect(called(run, 'docker compose build')).toBe(false);
      // The old script removed the lock here, letting the next cron run overlap with the
      // deploy that still held it.
      expect(fs.existsSync(lock)).toBe(true);
    } finally {
      holder.stop();
    }
  });

  it('takes over a lock whose holder is gone', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-lock-'));
    const lock = path.join(dir, 'stale.lock');
    fs.writeFileSync(lock, '2147483646\n'); // A pid that cannot be running.
    const run = deploy({ health: 'healthy', env: { DEPLOY_LOCK_FILE: lock } });
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('Stale lock file found');
    expect(called(run, 'docker compose build')).toBe(true);
  });

  it('takes over from a holder that has been hung past the maximum age', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-lock-'));
    const holder = livingDeploy(dir);
    const lock = path.join(dir, 'hung.lock');
    fs.writeFileSync(lock, `${holder.pid}\n`);
    try {
      const run = deploy({
        health: 'healthy',
        env: { DEPLOY_LOCK_FILE: lock, DEPLOY_LOCK_MAX_AGE: '0' },
      });
      expect(run.stdout).toContain('Taking over');
      expect(run.code).toBe(0);
      expect(called(run, 'docker compose build')).toBe(true);
    } finally {
      holder.stop();
    }
  });

  it('releases its own lock when it exits', () => {
    expect(deploy({ health: 'healthy' }).lockExists).toBe(false);
    expect(deploy({ health: 'starting' }).lockExists).toBe(false);
  });
});
