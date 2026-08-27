/**
 * Sessions #324 and #328 (2026-08-27) chained a second card into a worktree `npm run finish`
 * had already retired, and kept the finished card's branch. The board took the claim without
 * complaint; the damage lands on the branch. `gh pr view` finds a PR by branch NAME, so the
 * previous card's MERGED PR goes on answering for a branch that now carries a second card's
 * commits — and finish.sh hangs `worktree remove --force` + `branch -D` off that verdict.
 *
 * The guard is the other half of the fix (finish.sh's work_is_on_main is the first): a
 * worktree that has been finished claims nothing more. It sits before the first GitHub read,
 * so it can be exercised for real — no network, nothing written to the board.
 */

import { createHash } from 'crypto';
import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'board-take.sh');

/** Every gh call is recorded and refused: reaching it at all is the observable fact. */
const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$FAKE_GH_LOG"
exit 97
`;

interface Run {
  code: number;
  stdout: string;
  stderr: string;
  ghCalls: string;
}

let fakeBin: string;
let sessions: string;
let ghLog: string;
let marker: string;

beforeAll(() => {
  fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-take-bin-'));
  fs.writeFileSync(path.join(fakeBin, 'gh'), FAKE_GH, { mode: 0o755 });
  // The key board-take.sh derives for this worktree — sha1(realpath(toplevel))[0:16],
  // the one derivation, in scripts/driver-scope.sh.
  const toplevel = execFileSync('git', ['-C', ROOT, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
  const key = createHash('sha1').update(fs.realpathSync(toplevel)).digest('hex').slice(0, 16);
  sessions = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-take-sessions-'));
  marker = path.join(sessions, `${key}.finished`);
});

beforeEach(() => {
  ghLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-take-log-')), 'gh.log');
  fs.rmSync(marker, { force: true });
});

function take(args: string[]): Run {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      SPO_SESSION_DIR: sessions,
      FAKE_GH_LOG: ghLog,
    },
  });
  return {
    code: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
    ghCalls: fs.existsSync(ghLog) ? fs.readFileSync(ghLog, 'utf8') : '',
  };
}

function finished(): void {
  fs.writeFileSync(marker, `${ROOT}\tsome/branch\tdeadbeef\n`, 'utf8');
}

describe('a finished worktree claims nothing more', () => {
  it('refuses the claim with exit 6, before any GitHub call', () => {
    finished();
    const run = take(['999']);
    expect(run.code).toBe(6);
    expect(run.stderr).toMatch(/FINISHED WORKTREE: npm run finish already ran here/);
    expect(run.stderr).toMatch(/Claim #999 from a NEW session/);
    // The whole point of putting it first: no read, no write, no quota spent.
    expect(run.ghCalls).toBe('');
  });

  it('lets the claim through when the worktree was never finished', () => {
    const run = take(['999']);
    expect(run.code).not.toBe(6);
    // It got past the guard and asked GitHub, which is where the fake refuses it.
    expect(run.ghCalls).toMatch(/api graphql/);
  });

  it('never blocks --release: closing ownership must work from anywhere', () => {
    finished();
    const run = take(['999', '--release']);
    expect(run.code).not.toBe(6);
    expect(run.stderr).not.toMatch(/FINISHED WORKTREE/);
    expect(run.ghCalls).toMatch(/api graphql/);
  });

  it('still refuses bad arguments as a usage error, not as a finished worktree', () => {
    finished();
    const run = take([]);
    expect(run.code).toBe(2);
    expect(run.stdout).toMatch(/USAGE: board-take\.sh/);
    expect(run.ghCalls).toBe('');
  });
});
