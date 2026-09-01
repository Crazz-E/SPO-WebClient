/**
 * #443: `scripts/pr-wait.sh` used to treat a single `state=closed, merged=false` REST read as
 * terminal — PR #447 read `closed false` at 13:17:57 while the merge queue was landing it, and
 * merged 30 s later at 13:18:27, so the one-read verdict falsely parked an already-merging card
 * as `pr-closed-unmerged`.
 *
 * The fix makes `closed false` a two-read verdict: a first `closed false` schedules a second
 * read after the full `--interval-sec` floor, and either read's own `merged`/`merged_at` wins
 * over a prior reading. This file runs the real script — with a stubbed `gh` that replays a
 * scripted sequence of PR bodies through the real `jq` binary and a stubbed `sleep` that
 * records its argument instead of actually waiting — rather than only reading the source, so
 * the tests exercise the actual jq fold, not a hand-typed result string.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'pr-wait.sh');

function scratch(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function which(cmd: string): string {
  return execFileSync('bash', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).trim();
}

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  sleeps: string[];
}

let bashPath: string;
let jqPath: string;
let datePath: string;
let headPath: string;
let tailPath: string;
let mvPath: string;
let catPath: string;

beforeAll(() => {
  bashPath = which('bash');
  jqPath = which('jq');
  datePath = which('date');
  headPath = which('head');
  tailPath = which('tail');
  mvPath = which('mv');
  catPath = which('cat');
});

/**
 * Builds a scratch PATH holding: a real `date` (the script's own deadline math), a stub `gh`
 * that pops one canned PR-body line per call from `responsesFile` (repeating the last line
 * once exhausted, so an "open forever" case needs only one response line) and pipes it through
 * the real `jq` with whatever `--jq` expression the script passed, and a stub `sleep` that
 * appends its argument to `sleepLog` and returns immediately instead of waiting.
 */
function buildBin(responsesFile: string, sleepLog: string): string {
  const bin = scratch('pr-wait-bin-');
  const lastLineFile = path.join(bin, '.last-line');

  fs.symlinkSync(datePath, path.join(bin, 'date'));

  fs.writeFileSync(
    path.join(bin, 'gh'),
    `#!${bashPath}
set -euo pipefail
jq_expr=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--jq" ]; then
    jq_expr="$arg"
  fi
  prev="$arg"
done

if [ -s "${responsesFile}" ]; then
  line="$("${headPath}" -n1 "${responsesFile}")"
  "${tailPath}" -n +2 "${responsesFile}" > "${responsesFile}.tmp"
  "${mvPath}" "${responsesFile}.tmp" "${responsesFile}"
  echo "$line" > "${lastLineFile}"
else
  line="$("${catPath}" "${lastLineFile}")"
fi

echo "$line" | "${jqPath}" -r "$jq_expr"
`,
    { mode: 0o755 },
  );

  fs.writeFileSync(
    path.join(bin, 'sleep'),
    `#!${bashPath}
echo "$1" >> "${sleepLog}"
exit 0
`,
    { mode: 0o755 },
  );

  return bin;
}

function runScript(responses: string[], extraArgs: string[] = []): Run {
  const responsesFile = path.join(scratch('pr-wait-responses-'), 'responses.txt');
  fs.writeFileSync(responsesFile, responses.map((r) => `${r}\n`).join(''), 'utf8');
  const sleepLog = path.join(scratch('pr-wait-sleeplog-'), 'sleeps.txt');
  fs.writeFileSync(sleepLog, '', 'utf8');

  const bin = buildBin(responsesFile, sleepLog);

  const result = spawnSync(bashPath, [SCRIPT, '443', ...extraArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { PATH: bin, HOME: os.tmpdir() },
    timeout: 20000,
  });

  const sleeps = fs
    .readFileSync(sleepLog, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0);

  return { status: result.status, stdout: result.stdout, stderr: result.stderr, sleeps };
}

function pr(opts: { state: 'open' | 'closed'; merged?: boolean; mergedAt?: string | null }): string {
  return JSON.stringify({
    state: opts.state,
    merged: opts.merged ?? false,
    merged_at: opts.mergedAt ?? null,
  });
}

describe('scripts/pr-wait.sh — closed-unmerged requires a confirmed second read (#443)', () => {
  it('#443 shape: a closed-false read followed by a merged read exits 0, not 1', () => {
    const { status, stdout, sleeps } = runScript([
      pr({ state: 'closed', merged: false, mergedAt: null }),
      pr({ state: 'closed', merged: true }),
    ]);

    expect(status).toBe(0);
    expect(stdout).toContain('MERGED: #443');
    expect(sleeps).toContain('30');
  });

  it('a merged_at timestamp corroborates merge even when `merged` itself reads false', () => {
    const { status, stdout } = runScript([
      pr({ state: 'closed', merged: false, mergedAt: null }),
      pr({ state: 'closed', merged: false, mergedAt: '2026-08-30T13:18:27Z' }),
    ]);

    expect(status).toBe(0);
    expect(stdout).toContain('MERGED: #443');
  });

  it('a genuinely closed-unmerged PR still parks with exit 1 and today\'s reason', () => {
    const { status, stderr } = runScript([
      pr({ state: 'closed', merged: false, mergedAt: null }),
      pr({ state: 'closed', merged: false, mergedAt: null }),
    ]);

    expect(status).toBe(1);
    expect(stderr).toContain('CLOSED UNMERGED: #443');
  });

  it('an unconfirmed second read (flap back to open) resumes the wait instead of deciding', () => {
    const { status, stdout } = runScript([
      pr({ state: 'closed', merged: false, mergedAt: null }),
      pr({ state: 'open' }),
      pr({ state: 'closed', merged: true }),
    ]);

    expect(status).toBe(0);
    expect(stdout).toContain('MERGED: #443');
  });

  it('an open PR that never lands still times out at exit 4', () => {
    const { status, stderr } = runScript([pr({ state: 'open' })], ['--timeout-min=10']);

    expect(status).toBe(4);
    expect(stderr).toContain('TIMEOUT:');
  });

  it('an interval below the 30s floor is still refused before any gh read', () => {
    const { status, stderr } = runScript([], ['--interval-sec=5']);

    expect(status).toBe(2);
    expect(stderr).toContain('REFUSED:');
  });
});
