/**
 * A supervised pilot run on issue #247 hit `npm run board:take -- 247` failing with
 * `RATE_LIMITED: write failed, card untouched` (exit 4) — but `gh api rate_limit` showed
 * 4976/5000 remaining at the time, and a fresh call right after succeeded with plenty of
 * budget. It was not a rate limit: `scripts/board-take.sh` printed that one generic string
 * for THREE different failure conditions (the `gh api graphql` write call itself failing, a
 * 200 response whose body carried a top-level `.errors` array, and the post-write re-read
 * failing) and threw away whatever `gh` or GitHub actually said in every one of them.
 *
 * The orchestrator in the sibling SPO-Pipeline repo branches purely on board-take.sh's EXIT
 * CODE (0/2/3/4/5/6), never on the printed text — so the fix here only sharpens what gets
 * printed on the way to the same exit codes, which this file pins alongside the diagnostics:
 * a real `gh`/GraphQL error message now reaches the output, and the line says plainly whether
 * the failure looks like a genuine rate limit or something else.
 *
 * Drives the actual script with a fake `gh` on PATH (same technique as
 * board-take-finished-worktree.test.ts) so the write/re-read calls are fully scripted and no
 * network is touched.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'board-take.sh');

/**
 * Dispatches on whether `-i` is present (board-take.sh only passes `-i` for a write call) and,
 * for non-write calls, on call order (1st = the one composite read, 2nd = the post-write
 * re-read) via a counter file. Every response is fully scripted through env vars so no network
 * or real GitHub state is touched.
 */
const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$FAKE_GH_LOG"

is_write=0
for a in "$@"; do
  [ "$a" = "-i" ] && is_write=1
done

if [ "$is_write" = "1" ]; then
  case "$WRITE_MODE" in
    cmd_fail)
      echo "$WRITE_STDERR_MSG" >&2
      exit 1
      ;;
    body_errors)
      printf 'HTTP/2.0 200 OK\\nX-Ratelimit-Remaining: %s\\n\\n' "$WRITE_REMAINING"
      printf '%s\\n' "$WRITE_BODY_JSON"
      exit 0
      ;;
    ok)
      printf 'HTTP/2.0 200 OK\\nX-Ratelimit-Remaining: %s\\n\\n' "$WRITE_REMAINING"
      printf '%s\\n' "$WRITE_OK_BODY_JSON"
      exit 0
      ;;
  esac
  exit 99
fi

n=0
[ -f "$CALL_COUNT_FILE" ] && n=$(cat "$CALL_COUNT_FILE")
n=$((n + 1))
echo "$n" > "$CALL_COUNT_FILE"

if [ "$n" = "1" ]; then
  printf '%s\\n' "$READ_FIXTURE_JSON"
else
  case "$REREAD_MODE" in
    cmd_fail)
      echo "$REREAD_STDERR_MSG" >&2
      exit 1
      ;;
    ok)
      printf '%s\\n' "$REREAD_FIXTURE_JSON"
      ;;
  esac
fi
`;

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

let fakeBin: string;
let sessions: string;
let branch: string;
let today: string;
let session: string;

beforeAll(() => {
  fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-take-diag-bin-'));
  fs.writeFileSync(path.join(fakeBin, 'gh'), FAKE_GH, { mode: 0o755 });
  branch = execFileSync('git', ['-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  today = execFileSync('date', ['+%F'], { encoding: 'utf8' }).trim();
  session = `${branch} @ ${today}`;
});

beforeEach(() => {
  sessions = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-take-diag-sessions-'));
});

// The one composite read board-take.sh does before any write: an item with no current
// Session (so a plain claim proceeds) or, for the release tests, one held by THIS session.
function readFixture(currentSession: string): string {
  const sessionField = currentSession
    ? `,{"text":"${currentSession}","field":{"name":"Session"}}`
    : '';
  return JSON.stringify({
    data: {
      rateLimit: { cost: 1, remaining: 4976, resetAt: '2026-08-29T00:00:00Z' },
      organization: {
        projectV2: {
          id: 'PVT_test',
          fields: {
            nodes: [
              { id: 'FSession', name: 'Session' },
              {
                id: 'FStatus',
                name: 'Status',
                options: [
                  { id: 'OPT_todo', name: 'Todo' },
                  { id: 'OPT_inprogress', name: 'In progress' },
                ],
              },
            ],
          },
        },
      },
      repository: {
        issue: {
          number: 247,
          state: 'OPEN',
          stateReason: null,
          projectItems: {
            nodes: [
              {
                id: 'ITEM1',
                project: { number: 1 },
                fieldValues: {
                  nodes: JSON.parse(
                    `[{"name":"Todo","field":{"name":"Status"}}${sessionField}]`,
                  ),
                },
              },
            ],
          },
        },
      },
    },
  });
}

function run(args: string[], env: Record<string, string>): Run {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      SPO_SESSION_DIR: sessions,
      FAKE_GH_LOG: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-take-diag-log-')), 'gh.log'),
      CALL_COUNT_FILE: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-take-diag-cnt-')), 'n'),
      READ_FIXTURE_JSON: readFixture(''),
      ...env,
    },
  });
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe('a non-rate-limit write failure surfaces its real message (claim path)', () => {
  it('the `gh` call itself failing prints its own stderr and says this is not a confirmed rate limit', () => {
    const r = run(['247'], {
      WRITE_MODE: 'cmd_fail',
      WRITE_STDERR_MSG: "gh: Variable $sessionValue is invalid. (HTTP 422)",
    });
    expect(r.code).toBe(4); // exit-code contract unchanged
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/Variable \$sessionValue is invalid/);
    expect(out).toMatch(/WRITE_FAILED \(not a confirmed rate limit/);
    expect(out).not.toMatch(/RATE_LIMITED \(confirmed\)/);
  });

  it('a body-level GraphQL `.errors` entry prints the actual message, not just the generic label', () => {
    const r = run(['247'], {
      WRITE_MODE: 'body_errors',
      WRITE_REMAINING: '4955',
      WRITE_BODY_JSON: JSON.stringify({
        data: { m1: null, m2: null },
        errors: [{ type: 'UNPROCESSABLE', message: "Field 'sessionValue' of required type 'String!' was not provided." }],
      }),
    });
    expect(r.code).toBe(4); // exit-code contract unchanged
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/Field 'sessionValue' of required type 'String!' was not provided\./);
    expect(out).toMatch(/WRITE_FAILED \(not a confirmed rate limit/);
    expect(out).not.toMatch(/RATE_LIMITED \(confirmed\)/);
  });
});

describe('a genuine rate limit is still called out as one, not blended with other failures', () => {
  it('`gh` refusing with rate-limit wording is labeled RATE_LIMITED (confirmed)', () => {
    const r = run(['247'], {
      WRITE_MODE: 'cmd_fail',
      WRITE_STDERR_MSG: 'gh: You have exceeded a secondary rate limit. Please wait a few minutes. (HTTP 403)',
    });
    expect(r.code).toBe(4); // exit-code contract unchanged
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/secondary rate limit/);
    expect(out).toMatch(/RATE_LIMITED \(confirmed\)/);
  });

  it('a body `.errors` response with X-Ratelimit-Remaining: 0 is labeled RATE_LIMITED (confirmed)', () => {
    const r = run(['247'], {
      WRITE_MODE: 'body_errors',
      WRITE_REMAINING: '0',
      WRITE_BODY_JSON: JSON.stringify({
        data: { m1: null, m2: null },
        errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }],
      }),
    });
    expect(r.code).toBe(4); // exit-code contract unchanged
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/RATE_LIMITED \(confirmed\)/);
  });
});

describe('the release path gets the same treatment, not a stale copy', () => {
  it('a non-rate-limit `gh` failure on --release also surfaces its message and is labeled WRITE_FAILED', () => {
    const r = spawnSync('bash', [SCRIPT, '247', '--release'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
        SPO_SESSION_DIR: sessions,
        FAKE_GH_LOG: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-take-diag-log-')), 'gh.log'),
        CALL_COUNT_FILE: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-take-diag-cnt-')), 'n'),
        READ_FIXTURE_JSON: readFixture(session), // held by THIS session, so --release proceeds to the write
        WRITE_MODE: 'cmd_fail',
        WRITE_STDERR_MSG: 'gh: unauthorized (HTTP 401)',
      },
    });
    expect(r.status).toBe(4); // exit-code contract unchanged
    const out = (r.stdout ?? '') + (r.stderr ?? '');
    expect(out).toMatch(/unauthorized \(HTTP 401\)/);
    expect(out).toMatch(/WRITE_FAILED \(not a confirmed rate limit/);
    expect(out).not.toMatch(/RATE_LIMITED \(confirmed\)/);
  });
});

describe('a failed post-write re-read (exit 5) keeps its exit code and gets its own precise label', () => {
  it('surfaces the re-read failure instead of the old generic RATE_LIMITED line', () => {
    const r = run(['247'], {
      WRITE_MODE: 'ok',
      WRITE_REMAINING: '4954',
      WRITE_OK_BODY_JSON: JSON.stringify({
        data: { m1: { projectV2Item: { id: 'ITEM1' } }, m2: { projectV2Item: { id: 'ITEM1' } } },
      }),
      REREAD_MODE: 'cmd_fail',
      REREAD_STDERR_MSG: 'gh: network error: connection reset',
    });
    expect(r.code).toBe(5); // exit-code contract unchanged
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/connection reset/);
    expect(out).toMatch(/REREAD_FAILED/);
    expect(out).not.toMatch(/^RATE_LIMITED: write landed, re-read pending$/m);
  });
});
