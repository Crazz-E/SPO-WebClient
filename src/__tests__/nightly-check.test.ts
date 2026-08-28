/**
 * #295: `scripts/nightly-check.sh` used to misdiagnose a missing `jq` binary as invalid JSON
 * in the nightly verdict file — `jq -e . "$NIGHTLY"` fails identically whether `jq` itself is
 * absent from PATH or the file it is pointed at is genuinely malformed, so the old single
 * check could only ever print "unreadable or invalid JSON", which sent whoever read it
 * chasing a corrupt `~/.spo-bench/nightly/latest.json` that was never the problem.
 *
 * The fix adds one `command -v jq` preflight ahead of the parse, so the two causes get two
 * distinct exit-2 messages. This file pins that distinction by actually running the script —
 * with PATH narrowed to a directory that holds `git` but not `jq` — rather than only reading
 * its source, and a contrasting run (real `jq`, deliberately broken JSON) proves the original
 * invalid-JSON branch survived untouched.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'nightly-check.sh');

function scratch(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

interface Run {
  status: number | null;
  stdout: string;
}

// Absolute paths resolved once, over the test runner's own (unrestricted) PATH — so they can
// be reused to build a deliberately narrow PATH for the script under test without needing to
// look `bash`/`git` up again inside that narrowed environment.
let bashPath: string;
let gitPath: string;

/** A scratch bin dir holding a `git` symlink only — no `jq` anywhere on it. */
let binWithoutJq: string;

/** A repo with a local bare `origin`, so `git fetch origin main` succeeds with no network. */
let repoWithOrigin: string;

beforeAll(() => {
  bashPath = execFileSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();
  gitPath = execFileSync('bash', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();

  binWithoutJq = scratch('nightly-check-bin-');
  fs.symlinkSync(gitPath, path.join(binWithoutJq, 'git'));

  const template = scratch('nightly-check-template-');
  git(template, 'init', '-q', '-b', 'main');
  git(template, 'config', 'user.email', 'test@example.com');
  git(template, 'config', 'user.name', 'test');
  git(template, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(template, 'README.md'), 'seed\n', 'utf8');
  git(template, 'add', '.');
  git(template, 'commit', '-q', '-m', 'init');

  repoWithOrigin = scratch('nightly-check-repo-');
  fs.cpSync(template, repoWithOrigin, { recursive: true });
  const bareOrigin = scratch('nightly-check-origin-');
  git(bareOrigin, 'init', '-q', '--bare', '-b', 'main');
  git(repoWithOrigin, 'remote', 'add', 'origin', bareOrigin);
  git(repoWithOrigin, 'push', '-q', 'origin', 'main');
});

/** `$SPO_BENCH_DIR/nightly/latest.json` populated with the given raw content. */
function benchDirWith(content: string): string {
  const dir = scratch('nightly-check-bench-');
  fs.mkdirSync(path.join(dir, 'nightly'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'nightly', 'latest.json'), content, 'utf8');
  return dir;
}

function runScript(benchDir: string, pathOverride: string): Run {
  const result = spawnSync(bashPath, [SCRIPT], {
    cwd: repoWithOrigin,
    encoding: 'utf8',
    env: {
      SPO_BENCH_DIR: benchDir,
      PATH: pathOverride,
      HOME: repoWithOrigin,
    },
  });
  return { status: result.status, stdout: result.stdout };
}

describe('scripts/nightly-check.sh — jq preflight (#295)', () => {
  it('exits 2 with a "jq not installed" message when jq is missing from PATH, not "invalid JSON"', () => {
    const benchDir = benchDirWith('{"verdict":"PASS","sha":"deadbeef","finishedAt":"now"}');

    const { status, stdout } = runScript(benchDir, binWithoutJq);

    expect(status).toBe(2);
    expect(stdout).toContain('MAIN: UNKNOWN jq not installed (apt install jq)');
    expect(stdout).not.toContain('invalid JSON');
  });

  it('still reports "invalid JSON", not "jq not installed", when jq is present but the file is broken', () => {
    const benchDir = benchDirWith('{not valid json');

    const { status, stdout } = runScript(benchDir, process.env.PATH ?? '');

    expect(status).toBe(2);
    expect(stdout).toContain('MAIN: UNKNOWN unreadable or invalid JSON in');
    expect(stdout).not.toContain('jq not installed');
  });

  it('the jq-installed check runs before the JSON parse in the script source', () => {
    const script = fs.readFileSync(SCRIPT, 'utf8');
    const jqInstalledCheck = script.indexOf('command -v jq');
    const jqParseCheck = script.indexOf('jq -e .');
    expect(jqInstalledCheck).toBeGreaterThan(-1);
    expect(jqParseCheck).toBeGreaterThan(jqInstalledCheck);
  });
});
