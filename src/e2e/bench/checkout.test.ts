/**
 * The worker-owned checkout — src/e2e/bench/checkout.ts.
 *
 * The property this file exists to pin is the install decision. Skipping `npm ci` is the
 * only place here that trades safety for time, so every case that is not positive
 * evidence of a current `node_modules` must answer "install". Getting that backwards
 * builds a fetched ref against the wrong packages and blames the code for it.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  installedLockFile,
  installedLockHash,
  lockHash,
  needsInstall,
  prepareCheckout,
  recordInstalled,
  type CheckoutDeps,
} from './checkout';

const NOW = 1_800_000_000_000;

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spo-checkout-'));
}

interface Harness {
  deps: CheckoutDeps;
  commands: { cmd: string; args: string[]; cwd: string }[];
  exitCodes: number[];
  logs: string[];
}

function harness(): Harness {
  const h: Harness = {
    commands: [],
    exitCodes: [],
    logs: [],
    deps: {
      runCommand: async (cmd, args, options) => {
        h.commands.push({ cmd, args, cwd: options.cwd });
        return h.exitCodes.shift() ?? 0;
      },
      now: () => NOW,
      log: line => h.logs.push(line),
    },
  };
  return h;
}

/** A checkout that already looks cloned, so prepare goes straight to the git steps. */
function clonedDir(): string {
  const dir = path.join(tempDir(), 'checkout');
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  return dir;
}

const git = (): string => 'https://github.com/Crazz-Org/SPO-WebClient.git';

describe('the install decision', () => {
  it('installs when node_modules is not there at all', () => {
    const dir = clonedDir();
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    expect(needsInstall(dir)).toBe(true);
  });

  it('installs when nothing recorded what node_modules was built from', () => {
    const dir = clonedDir();
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    expect(needsInstall(dir)).toBe(true);
  });

  it('installs when the lockfile has moved since the last install', () => {
    const dir = clonedDir();
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"v":1}');
    recordInstalled(dir, lockHash(dir) as string);
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"v":2}');
    expect(needsInstall(dir)).toBe(true);
  });

  it('installs when the lockfile cannot be read — skipping needs positive evidence', () => {
    const dir = clonedDir();
    fs.mkdirSync(path.join(dir, 'node_modules'));
    recordInstalled(dir, 'whatever');
    expect(lockHash(dir)).toBeNull();
    expect(needsInstall(dir)).toBe(true);
  });

  it('skips only when the recorded hash IS the lockfile on disk', () => {
    const dir = clonedDir();
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"v":1}');
    recordInstalled(dir, lockHash(dir) as string);
    expect(needsInstall(dir)).toBe(false);
  });

  it('reads back nothing when no install was ever recorded', () => {
    expect(installedLockHash(clonedDir())).toBeNull();
  });

  it('keeps its record beside the checkout, not inside it — a git clean must not eat it', () => {
    const dir = clonedDir();
    expect(installedLockFile(dir).startsWith(dir + '.')).toBe(true);
  });
});

describe('prepareCheckout', () => {
  it('clones when there is no .git, then fetches, resets and cleans', async () => {
    const h = harness();
    const dir = path.join(tempDir(), 'fresh');
    const logFile = path.join(tempDir(), 'prepare.log');

    const result = await prepareCheckout(
      h.deps,
      { dir, ref: 'origin/main', workerRepo: '/repo', logFile },
      git,
    );

    expect(result.failed).toBeNull();
    expect(h.commands.map(c => `${c.cmd} ${c.args[0]}`)).toEqual([
      'git clone',
      'git fetch',
      'git reset',
      'git clean',
      'npm ci',
    ]);
  });

  it('resets to whatever ref it was given — a sha as readily as a branch', async () => {
    const h = harness();
    const dir = clonedDir();
    const sha = 'a'.repeat(40);
    await prepareCheckout(
      h.deps,
      { dir, ref: sha, workerRepo: '/repo', logFile: path.join(tempDir(), 'p.log') },
      git,
    );
    expect(h.commands.find(c => c.args[0] === 'reset')?.args).toEqual(['reset', '--hard', sha]);
  });

  it('fetches every branch, so a sha reachable from one resets without a direct fetch', async () => {
    const h = harness();
    const dir = clonedDir();
    await prepareCheckout(
      h.deps,
      { dir, ref: 'x', workerRepo: '/repo', logFile: path.join(tempDir(), 'p.log') },
      git,
    );
    expect(h.commands.find(c => c.args[0] === 'fetch')?.args).toEqual([
      'fetch', '--prune', '--force', 'origin',
    ]);
  });

  it('skips the install when the lockfile has not moved, and says so', async () => {
    const h = harness();
    const dir = clonedDir();
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"v":1}');
    recordInstalled(dir, lockHash(dir) as string);

    await prepareCheckout(
      h.deps,
      { dir, ref: 'origin/main', workerRepo: '/repo', logFile: path.join(tempDir(), 'p.log') },
      git,
    );

    expect(h.commands.some(c => c.cmd === 'npm')).toBe(false);
    expect(h.logs.join('\n')).toMatch(/already matches the lockfile/);
  });

  it('records the lockfile it installed from, so the next job may skip', async () => {
    const h = harness();
    const dir = clonedDir();
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"v":9}');

    await prepareCheckout(
      h.deps,
      { dir, ref: 'origin/main', workerRepo: '/repo', logFile: path.join(tempDir(), 'p.log') },
      git,
    );

    expect(installedLockHash(dir)).toBe(lockHash(dir));
    expect(needsInstall(dir, () => true)).toBe(false);
  });

  it('does not record anything when the install failed', async () => {
    const h = harness();
    const dir = clonedDir();
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"v":9}');
    h.exitCodes = [0, 0, 0, 1]; // fetch, reset, clean ok; npm ci fails

    const result = await prepareCheckout(
      h.deps,
      { dir, ref: 'origin/main', workerRepo: '/repo', logFile: path.join(tempDir(), 'p.log') },
      git,
    );

    expect(result.failed).toBe('npm ci');
    expect(installedLockHash(dir)).toBeNull();
  });

  it.each([
    ['git fetch', 0],
    ['git reset --hard origin/main', 1],
    ['git clean -fd', 2],
  ])('names %s when it is the step that failed', async (name, index) => {
    const h = harness();
    const dir = clonedDir();
    h.exitCodes = [0, 0, 0];
    h.exitCodes[index] = 1;

    await expect(
      prepareCheckout(
        h.deps,
        { dir, ref: 'origin/main', workerRepo: '/repo', logFile: path.join(tempDir(), 'p.log') },
        git,
      ),
    ).resolves.toMatchObject({ failed: name });
  });

  it('names the clone when it fails, and never touches the ref afterwards', async () => {
    const h = harness();
    h.exitCodes = [1];
    const result = await prepareCheckout(
      h.deps,
      {
        dir: path.join(tempDir(), 'fresh'),
        ref: 'origin/main',
        workerRepo: '/repo',
        logFile: path.join(tempDir(), 'p.log'),
      },
      git,
    );
    expect(result.failed).toBe('git clone');
    expect(h.commands).toHaveLength(1);
  });

  it('reports the origin lookup rather than cloning from a guess', async () => {
    const h = harness();
    const logFile = path.join(tempDir(), 'p.log');
    const result = await prepareCheckout(
      h.deps,
      { dir: path.join(tempDir(), 'fresh'), ref: 'origin/main', workerRepo: '/repo', logFile },
      () => {
        throw new Error('not a git repository');
      },
    );
    expect(result.failed).toBe('git remote get-url origin');
    expect(h.commands).toHaveLength(0);
    expect(fs.readFileSync(logFile, 'utf8')).toMatch(/not a git repository/);
  });

  it('starts the log fresh each time — a red run must not read yesterday\'s noise', async () => {
    const h = harness();
    const dir = clonedDir();
    const logFile = path.join(tempDir(), 'p.log');
    fs.writeFileSync(logFile, 'STALE FROM LAST NIGHT\n');

    await prepareCheckout(h.deps, { dir, ref: 'origin/main', workerRepo: '/repo', logFile }, git);

    expect(fs.readFileSync(logFile, 'utf8')).not.toMatch(/STALE/);
  });
});

describe('mergeRef — gating the tree the branch would actually land, not the branch alone', () => {
  /** A checkout already installed, so every scenario's command list is just the git steps. */
  function installedDir(): string {
    const dir = clonedDir();
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"v":1}');
    recordInstalled(dir, lockHash(dir) as string);
    return dir;
  }

  it('takes the fast path when ref already contains mergeRef — one plumbing call, no merge', async () => {
    const h = harness();
    const dir = installedDir();

    const result = await prepareCheckout(
      h.deps,
      { dir, ref: 'abc', workerRepo: '/repo', logFile: path.join(tempDir(), 'p.log'), mergeRef: 'origin/main' },
      git,
    );

    expect(result).toEqual({ failed: null, merged: false });
    expect(h.commands.map(c => c.args[0])).toEqual(['fetch', 'reset', 'clean', 'merge-base']);
    expect(h.commands.find(c => c.args[0] === 'merge-base')?.args).toEqual([
      'merge-base', '--is-ancestor', 'origin/main', 'HEAD',
    ]);
  });

  it('merges mergeRef in with the SPO Bench identity when ref does not already contain it', async () => {
    const h = harness();
    const dir = installedDir();
    h.exitCodes = [0, 0, 0, 1, 0]; // fetch, reset, clean ok; merge-base: not an ancestor; merge: ok

    const result = await prepareCheckout(
      h.deps,
      { dir, ref: 'abc', workerRepo: '/repo', logFile: path.join(tempDir(), 'p.log'), mergeRef: 'origin/main' },
      git,
    );

    expect(result).toEqual({ failed: null, merged: true });
    const merge = h.commands.find(c => c.args.includes('--no-edit'));
    expect(merge?.args).toEqual([
      '-c', 'user.name=SPO Bench', '-c', 'user.email=bench@local', 'merge', '--no-edit', 'origin/main',
    ]);
  });

  it('aborts explicitly on a conflict and names the base sha it could not merge with', async () => {
    const h = harness();
    const dir = clonedDir();
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"v":1}');
    h.exitCodes = [0, 0, 0, 1, 1]; // fetch, reset, clean ok; not an ancestor; merge: conflict
    const baseSha = 'deadbeef'.repeat(5);
    const gitWithRevParse = (_worktree: string, args: string[]): string =>
      args[0] === 'rev-parse' ? baseSha : git();

    const result = await prepareCheckout(
      h.deps,
      { dir, ref: 'abc', workerRepo: '/repo', logFile: path.join(tempDir(), 'p.log'), mergeRef: 'origin/main' },
      gitWithRevParse,
    );

    expect(result).toEqual({ failed: 'merge', conflictBase: baseSha });
    // Abort ran, and nothing after it (no install attempted on a checkout mid-merge).
    expect(h.commands.some(c => c.args[0] === 'merge' && c.args[1] === '--abort')).toBe(true);
    expect(h.commands.some(c => c.cmd === 'npm')).toBe(false);
    // The log ends clean: no half-merged state left for the log to describe.
    expect(h.logs.join('\n')).toMatch(/merge conflict with origin\/main.*aborted/);
  });

  it('installs only after a successful merge — the merged tree is what node_modules must match', async () => {
    const h = harness();
    const dir = clonedDir();
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"v":9}'); // no node_modules: needsInstall
    h.exitCodes = [0, 0, 0, 1, 0]; // fetch, reset, clean ok; not an ancestor; merge: ok

    await prepareCheckout(
      h.deps,
      { dir, ref: 'abc', workerRepo: '/repo', logFile: path.join(tempDir(), 'p.log'), mergeRef: 'origin/main' },
      git,
    );

    const order = h.commands.map(c => (c.args.includes('--no-edit') ? 'merge' : c.args[0]));
    expect(order.indexOf('merge')).toBeGreaterThan(-1);
    expect(order.indexOf('ci')).toBeGreaterThan(order.indexOf('merge'));
  });

  it('never calls merge-base at all when no mergeRef is requested — unchanged behaviour', async () => {
    const h = harness();
    const dir = installedDir();

    const result = await prepareCheckout(
      h.deps,
      { dir, ref: 'origin/main', workerRepo: '/repo', logFile: path.join(tempDir(), 'p.log') },
      git,
    );

    expect(result).toEqual({ failed: null, merged: false });
    expect(h.commands.some(c => c.args.includes('merge-base'))).toBe(false);
  });
});
