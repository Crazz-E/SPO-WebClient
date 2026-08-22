/**
 * The gate body the bench worker runs — scripts/verify-gate.js — driven as a black box.
 *
 * The script shells out to `npm`, reads git, and requires the compiled e2e driver from
 * `dist/e2e/`. Each case therefore gets a scratch git repo, a fake `npm` on PATH whose
 * failures are chosen per stage, and two small CommonJS fakes standing in for
 * `dist/e2e/routing.js` and `dist/e2e/run.js`, steered through environment variables.
 * Nothing here touches the real bench, ~/.spo-bench or the live servers.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.join(process.cwd(), 'scripts', 'verify-gate.js');

interface GateRun {
  code: number;
  stdout: string;
  stderr: string;
  /** The `report/e2e/gate-<sha>.json` artifact, when the run wrote one. */
  artifact: Record<string, unknown> | null;
  /** Every `npm …` invocation, one per line, in order. */
  npmCalls: string[];
  /** The diff text handed to `presidentMembersInDiff`, when the run got that far. */
  diffSeen: string | null;
  /** The options handed to `runLive`, when the run got that far. */
  liveOptions: Record<string, unknown> | null;
}

interface RepoOptions {
  /** Push `main` to a bare remote so `origin/main` exists. */
  withRemote?: boolean;
  /** Extra files written but not committed (untracked). */
  untracked?: Record<string, string>;
}

const FAKE_NPM = `#!/usr/bin/env bash
# Logs its arguments; fails when FAKE_NPM_FAIL names this stage.
stage="$1"; [ "$1" = "run" ] && stage="$2"
echo "$*" >> "$FAKE_NPM_LOG"
if [ "$stage" = "\${FAKE_NPM_FAIL:-}" ]; then echo "fake npm: $stage failed" >&2; exit 1; fi
exit 0
`;

const FAKE_ROUTING = `'use strict';
const fs = require('fs');
const decision = JSON.parse(process.env.FAKE_ROUTING || '{}');
exports.route = files => ({
  changed: files,
  required: [],
  unmapped: [],
  staticOnly: false,
  needsL3: false,
  reasons: [],
  ...decision,
});
exports.presidentMembersInDiff = diff => {
  if (process.env.FAKE_DIFF_OUT) fs.writeFileSync(process.env.FAKE_DIFF_OUT, diff, 'utf8');
  return [];
};
`;

const FAKE_RUN = `'use strict';
const fs = require('fs');
exports.runLive = async options => {
  if (process.env.FAKE_LIVE_OUT) fs.writeFileSync(process.env.FAKE_LIVE_OUT, JSON.stringify(options), 'utf8');
  return JSON.parse(process.env.FAKE_LIVE || '{"status":"PASS"}');
};
exports.formatSummary = result => 'summary: ' + result.status;
`;

function scratch(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function commitFile(dir: string, file: string, body: string, message: string): void {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), body, 'utf8');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', message);
}

/** A bin dir holding the fake `npm`, prepended to PATH for each run. */
let fakeBin: string;
/** The scratch repo every case starts from — built once, copied per case (git init is slow). */
let template: string;

beforeAll(() => {
  fakeBin = scratch('spo-gate-bin-');
  fs.writeFileSync(path.join(fakeBin, 'npm'), FAKE_NPM, { mode: 0o755 });

  template = scratch('spo-gate-template-');
  git(template, 'init', '-q', '-b', 'main');
  git(template, 'config', 'user.email', 'test@example.com');
  git(template, 'config', 'user.name', 'test');
  git(template, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(template, '.gitignore'), 'dist/\nreport/\n', 'utf8');
  commitFile(template, 'README.md', 'seed\n', 'init');
  git(template, 'checkout', '-q', '-b', 'feature/x');
  commitFile(template, 'src/server/thing.ts', 'export const thing = 1;\n', 'feat: thing');
  fs.mkdirSync(path.join(template, 'dist', 'e2e'), { recursive: true });
  fs.writeFileSync(path.join(template, 'dist', 'e2e', 'routing.js'), FAKE_ROUTING, 'utf8');
  fs.writeFileSync(path.join(template, 'dist', 'e2e', 'run.js'), FAKE_RUN, 'utf8');
});

/**
 * A scratch repo on `feature/x`, one commit ahead of `main`, with the two fake driver
 * modules already in `dist/e2e/`. The `dist/` directory is git-ignored so the fakes never
 * show up as changed files.
 */
function scratchRepo(options: RepoOptions = {}): string {
  const dir = scratch('spo-gate-repo-');
  fs.cpSync(template, dir, { recursive: true });

  if (options.withRemote) {
    // `main` has not moved since the fork, so pushing it now yields the same origin/main
    // a push before the fork would have.
    const bare = scratch('spo-gate-origin-');
    git(bare, 'init', '-q', '--bare', '-b', 'main');
    git(dir, 'remote', 'add', 'origin', bare);
    git(dir, 'push', '-q', 'origin', 'main');
  }

  for (const [file, body] of Object.entries(options.untracked ?? {})) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), body, 'utf8');
  }
  return dir;
}

function runGate(dir: string, args: string[] = [], env: NodeJS.ProcessEnv = {}): GateRun {
  const work = scratch('spo-gate-out-');
  const npmLog = path.join(work, 'npm.log');
  const diffOut = path.join(work, 'diff.txt');
  const liveOut = path.join(work, 'live.json');
  const result = spawnSync('node', [SCRIPT, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      FAKE_NPM_LOG: npmLog,
      FAKE_DIFF_OUT: diffOut,
      FAKE_LIVE_OUT: liveOut,
      ...env,
    },
  });
  const head = git(dir, 'rev-parse', 'HEAD');
  const artifactFile = path.join(dir, 'report', 'e2e', `gate-${head}.json`);
  const readJson = (file: string): Record<string, unknown> | null =>
    fs.existsSync(file)
      ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>)
      : null;
  return {
    code: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
    artifact: readJson(artifactFile),
    npmCalls: fs.existsSync(npmLog) ? fs.readFileSync(npmLog, 'utf8').trim().split('\n') : [],
    diffSeen: fs.existsSync(diffOut) ? fs.readFileSync(diffOut, 'utf8') : null,
    liveOptions: readJson(liveOut),
  };
}

describe('stage 1 — static', () => {
  it.each([
    ['typecheck', 'typecheck', ['run typecheck']],
    ['lint', 'lint', ['run typecheck', 'run lint']],
    ['test', 'test', ['run typecheck', 'run lint', 'test']],
  ])('exits 1 and stops at the first failing stage (%s)', (stage, key, expectedCalls) => {
    const run = runGate(scratchRepo(), [], { FAKE_NPM_FAIL: stage });
    expect(run.code).toBe(1);
    expect(run.npmCalls).toEqual(expectedCalls);
    expect(run.stderr).toMatch(/Gate FAIL — static stage failed/);
    expect(run.artifact).toMatchObject({ verdict: 'FAIL', branch: 'feature/x', attempt: 1 });
    expect(run.artifact?.static).toMatchObject({ [key]: 'FAIL' });
    expect(run.artifact?.live).toBeNull();
  });

  it('exits 1 when the e2e driver does not build, with buildE2e FAIL in the artifact', () => {
    const run = runGate(scratchRepo(), [], { FAKE_NPM_FAIL: 'build:e2e' });
    expect(run.code).toBe(1);
    expect(run.npmCalls).toEqual(['run typecheck', 'run lint', 'test', 'run build:e2e']);
    expect(run.stderr).toMatch(/could not build the e2e driver/);
    expect(run.artifact?.static).toEqual({
      typecheck: 'PASS',
      lint: 'PASS',
      test: 'PASS',
      buildE2e: 'FAIL',
    });
  });

  it('records --attempt in the artifact', () => {
    const run = runGate(scratchRepo(), ['--attempt=2'], { FAKE_NPM_FAIL: 'lint' });
    expect(run.artifact?.attempt).toBe(2);
  });
});

describe('stage 2 — the diff handed to the exclusion scan', () => {
  it('renders untracked files into the diff as synthetic all-added hunks', () => {
    const dir = scratchRepo({
      untracked: { 'src/new/module.ts': 'first line\nRDOSitMinister call\n' },
    });
    const run = runGate(dir, [], { FAKE_ROUTING: JSON.stringify({ staticOnly: true }) });
    expect(run.code).toBe(0);
    expect(run.diffSeen).toContain('+++ b/src/new/module.ts');
    expect(run.diffSeen).toContain('+first line\n+RDOSitMinister call');
    // The committed change is in the same text, in git's own shape.
    expect(run.diffSeen).toContain('+++ b/src/server/thing.ts');
    expect(run.diffSeen).toContain('+export const thing = 1;');
  });
});

describe('stage 3 — routing', () => {
  it('exits 1 when a changed path has no routing rule, naming the path', () => {
    const run = runGate(scratchRepo(), [], {
      FAKE_ROUTING: JSON.stringify({ unmapped: ['src/server/thing.ts'] }),
    });
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/no routing rule covers:\n {2}src\/server\/thing\.ts/);
    expect(run.stderr).toMatch(/fails closed/);
    expect(run.artifact).toMatchObject({
      verdict: 'FAIL',
      routing: { unmapped: ['src/server/thing.ts'], changed: ['src/server/thing.ts'] },
    });
    expect(run.liveOptions).toBeNull();
  });

  it('passes static-only when routing says nothing is observable over the wire', () => {
    const run = runGate(scratchRepo(), [], {
      FAKE_ROUTING: JSON.stringify({ staticOnly: true, reasons: ['docs only'] }),
    });
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/Gate PASS \(static only\)/);
    expect(run.artifact).toMatchObject({
      verdict: 'PASS',
      live: { skipped: true },
      routing: { reasons: ['docs only'], required: [] },
    });
    expect(run.liveOptions).toBeNull();
  });

  it('passes static-only when no flow is required, even without the staticOnly flag', () => {
    const run = runGate(scratchRepo(), [], { FAKE_ROUTING: JSON.stringify({ required: [] }) });
    expect(run.code).toBe(0);
    expect(run.artifact).toMatchObject({ verdict: 'PASS', live: { skipped: true } });
  });

  it('honours --static-only over a routing decision that wants a live drive', () => {
    const run = runGate(scratchRepo(), ['--static-only'], {
      FAKE_ROUTING: JSON.stringify({ required: ['login-spine'] }),
    });
    expect(run.code).toBe(0);
    expect(run.artifact).toMatchObject({ verdict: 'PASS', live: { skipped: true } });
    expect(run.liveOptions).toBeNull();
  });

  it('warns about the L3 browser smoke when routing flags pixels', () => {
    const run = runGate(scratchRepo(), [], {
      FAKE_ROUTING: JSON.stringify({ staticOnly: true, needsL3: true }),
    });
    expect(run.code).toBe(0);
    expect(run.stdout).toMatch(/Run the L3 browser smoke/);
    expect(run.artifact?.routing).toMatchObject({ needsL3: true });
  });
});

describe('stage 4 — live', () => {
  const needsLive = JSON.stringify({ required: ['login-spine', 'politics-read'] });

  it('drives the routed flows and exits 0 on a live PASS, with the artifact filled', () => {
    const live = { status: 'PASS', flows: [{ name: 'login-spine', status: 'PASS' }] };
    const run = runGate(scratchRepo(), [], {
      FAKE_ROUTING: needsLive,
      FAKE_LIVE: JSON.stringify(live),
    });
    expect(run.code).toBe(0);
    expect(run.liveOptions).toEqual({
      flows: ['login-spine', 'politics-read'],
      branch: 'feature/x',
    });
    expect(run.stdout).toMatch(/live drive on planitia: login-spine, politics-read/);
    expect(run.stdout).toMatch(/summary: PASS/);
    expect(run.stdout).toMatch(/Gate PASS\. Artifact:/);
    expect(run.artifact).toMatchObject({ verdict: 'PASS', live });
  });

  it('exits 1 on a live FAIL', () => {
    const run = runGate(scratchRepo(), [], {
      FAKE_ROUTING: needsLive,
      FAKE_LIVE: JSON.stringify({ status: 'FAIL' }),
    });
    expect(run.code).toBe(1);
    expect(run.stdout).toMatch(/Gate FAIL\. Artifact:/);
    expect(run.artifact).toMatchObject({ verdict: 'FAIL', live: { status: 'FAIL' } });
  });

  it('exits 1 on a live BLOCKED and records the verdict as BLOCKED', () => {
    const run = runGate(scratchRepo(), [], {
      FAKE_ROUTING: needsLive,
      FAKE_LIVE: JSON.stringify({ status: 'BLOCKED' }),
    });
    expect(run.code).toBe(1);
    expect(run.artifact).toMatchObject({ verdict: 'BLOCKED' });
  });

  it('exits 1 on an ENVIRONMENT abort but says it does not count as an attempt', () => {
    const run = runGate(scratchRepo(), [], {
      FAKE_ROUTING: needsLive,
      FAKE_LIVE: JSON.stringify({ status: 'ENVIRONMENT' }),
    });
    expect(run.code).toBe(1);
    expect(run.stdout).toMatch(/ENVIRONMENT abort, not a failed attempt/);
    expect(run.artifact).toMatchObject({ verdict: 'FAIL' });
  });

  it('lets --flows= override the routed set', () => {
    const run = runGate(scratchRepo(), ['--flows=mail-roundtrip,building-details'], {
      FAKE_ROUTING: needsLive,
    });
    expect(run.code).toBe(0);
    expect(run.liveOptions).toMatchObject({ flows: ['mail-roundtrip', 'building-details'] });
  });

  it('exits 1 when the live driver crashes', () => {
    const run = runGate(scratchRepo(), [], { FAKE_ROUTING: needsLive, FAKE_LIVE: '{not json' });
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/Gate crashed:/);
  });
});

describe('the diff base', () => {
  /**
   * `main` advanced by one commit after being pushed, then the feature branch forked from
   * it: against `origin/main` the branch shows two files, against a lagging local `main`
   * only one.
   */
  function repoWithDivergedMain(withRemote: boolean): string {
    const dir = scratchRepo({ withRemote });
    git(dir, 'checkout', '-q', 'main');
    commitFile(dir, 'src/server/later.ts', 'export const later = 2;\n', 'feat: later');
    git(dir, 'checkout', '-q', 'feature/x');
    git(dir, 'rebase', '-q', 'main');
    return dir;
  }

  it('judges the branch against origin/main when the remote ref exists', () => {
    const run = runGate(repoWithDivergedMain(true), [], {
      FAKE_ROUTING: JSON.stringify({ staticOnly: true }),
    });
    expect(run.code).toBe(0);
    expect(run.artifact?.routing).toMatchObject({
      changed: expect.arrayContaining(['src/server/later.ts', 'src/server/thing.ts']),
    });
    expect((run.artifact?.routing as { changed: string[] }).changed).toHaveLength(2);
    expect(run.diffSeen).toContain('+++ b/src/server/later.ts');
  });

  it('falls back to the local main when there is no origin/main', () => {
    const run = runGate(repoWithDivergedMain(false), [], {
      FAKE_ROUTING: JSON.stringify({ staticOnly: true }),
    });
    expect(run.code).toBe(0);
    expect(run.artifact?.routing).toMatchObject({ changed: ['src/server/thing.ts'] });
    expect(run.diffSeen).not.toContain('later.ts');
  });

  it('includes working-tree modifications in the changed files and the diff', () => {
    const dir = scratchRepo();
    fs.appendFileSync(path.join(dir, 'README.md'), 'edited\n', 'utf8');
    const run = runGate(dir, [], { FAKE_ROUTING: JSON.stringify({ staticOnly: true }) });
    expect(run.code).toBe(0);
    expect(run.artifact?.routing).toMatchObject({
      changed: expect.arrayContaining(['README.md', 'src/server/thing.ts']),
    });
    expect(run.diffSeen).toContain('+edited');
  });
});
