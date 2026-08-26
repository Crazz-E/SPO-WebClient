/**
 * The driver-scope guard (.claude/hooks/driver-scope-guard.{sh,js}).
 *
 * WHY THIS FILE EXISTS AT ALL. `next-task.md` § 3 (i) — "the driver never creates, edits or
 * deletes a tracked file itself" — was, until this guard, a question the driver asked ITSELF.
 * That is the weakest enforcement there is: the model that has already drifted is the one
 * being asked whether it is drifting, and on 2026-08-26 a Haiku driver rewrote a whole script
 * with a card and a criterion in hand, neither of which told it to stop.
 *
 * A hook is a program with an exit-code contract, so unlike the prose it replaces it can be
 * EXECUTED and asserted — which is the whole point: `.claude/**` is outside what the bench
 * gate runs, so a guard nothing exercises would be exactly the unverifiable change the gate
 * cannot see. These tests drive the decision program directly with crafted payloads.
 *
 * The two properties that carry everything:
 *
 *   - **`agent_id` is the sole discriminator.** Verified live against CLI 2.1.80, not merely
 *     read off the schema: a Task sub-agent's Bash *and* Write calls both carry `agent_id`,
 *     the main thread's carry none — and `session_id` is IDENTICAL for driver and sub-agent,
 *     so it separates nothing. If a refactor ever leans on `session_id` to spot the delegate,
 *     the guard starts refusing the one writer it must let through and the pipeline stalls.
 *   - **It must not cry wolf.** A guard that blocks ordinary work gets disabled, which is
 *     worse than no guard. The sanctioned driver moves — writing a PR body to the scratchpad,
 *     `git commit -F`, redirecting a log — must pass untouched, and a heredoc body that
 *     merely *mentions* `rm doc/…` is text, not a deletion.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const GUARD = path.join(ROOT, '.claude', 'hooks', 'driver-scope-guard.js');
const SID = 'driver-session-id';

const readScript = (p: string): string => fs.readFileSync(p, 'utf8');

interface Payload {
  session_id?: string;
  agent_id?: string;
  cwd?: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/** Run the decision program over one payload and return the verdict line. */
function verdict(payload: Partial<Payload>): string {
  const body: Payload = {
    session_id: SID,
    cwd: ROOT,
    tool_name: 'Bash',
    tool_input: {},
    ...payload,
  } as Payload;
  return execFileSync('node', [GUARD], {
    input: JSON.stringify(body),
    encoding: 'utf8',
    env: { ...process.env, SPO_TOP: ROOT, SPO_DRIVER_SID: SID },
  }).trim();
}

const bash = (command: string, extra: Partial<Payload> = {}): string =>
  verdict({ tool_name: 'Bash', tool_input: { command }, ...extra });

const edit = (file_path: string, extra: Partial<Payload> = {}): string =>
  verdict({ tool_name: 'Edit', tool_input: { file_path }, ...extra });

// A file this repo certainly tracks, and one it certainly does not.
const TRACKED = 'scripts/finish.sh';
const SCRATCH = '/tmp/claude-1000/driver-scope-scratch.md';

describe('driver-scope-guard — who is writing', () => {
  it('refuses the driver editing a tracked file', () => {
    expect(edit(TRACKED)).toContain('tracked file');
  });

  it('lets the execution sub-agent edit the very same file', () => {
    // agent_id present = the call came from inside a Task worker. This is the single fact the
    // whole guard turns on; see the file header.
    expect(edit(TRACKED, { agent_id: 'sub-1' })).toBe('ALLOW');
  });

  it('does not lean on session_id to spot the sub-agent', () => {
    // Driver and sub-agent share one session_id (verified live). A sub-agent carrying the
    // driver's session_id must still pass, or the guard blocks the one writer it must allow.
    expect(edit(TRACKED, { agent_id: 'sub-1', session_id: SID })).toBe('ALLOW');
  });

  it('ignores a different session standing in the same worktree', () => {
    expect(edit(TRACKED, { session_id: 'someone-else' })).toBe('ALLOW');
  });
});

describe('driver-scope-guard — the Bash door', () => {
  it('refuses chmod on a tracked file', () => {
    // The failure a content diff cannot see: a mode bit changed to make an assertion pass.
    expect(bash(`chmod +x ${TRACKED}`)).toContain(TRACKED);
  });

  it('refuses sed -i on a tracked file', () => {
    expect(bash(`sed -i s/a/b/ ${TRACKED}`)).toContain(TRACKED);
  });

  it('refuses rm of a tracked file', () => {
    // Deleting a tracked file is reachable ONLY through Bash — an Edit|Write matcher alone
    // would never see it.
    expect(bash(`rm ${TRACKED}`)).toContain(TRACKED);
  });

  it('refuses a redirection into a tracked file', () => {
    expect(bash(`echo x > ${TRACKED}`)).toContain(TRACKED);
  });

  it.each([
    ['git rm -r src/client', 'git rm'],
    ['git checkout -- .', 'git checkout'],
    ['git restore src', 'git restore'],
    ['npm run format', 'npm run format'],
    ['npx prettier --write src', 'prettier'],
  ])('refuses %s with no path resolution needed', (command, needle) => {
    expect(bash(command)).toContain(needle);
  });

  it('names a reason a driver can act on, never a junk operand', () => {
    // `chmod +x f` and `sed -i s/a/b/ f` hand the parser tokens that are not paths. An earlier
    // version reported "would create `+x`" — a refusal with a nonsense reason, which is how a
    // guard teaches models to ignore it.
    expect(bash(`chmod +x ${TRACKED}`)).not.toContain('+x`');
    expect(bash(`sed -i s/a/b/ ${TRACKED}`)).not.toContain('s/a/b');
  });
});

describe('driver-scope-guard — it must not cry wolf', () => {
  it.each([
    'npm run gate',
    'npm test',
    'git commit -F /tmp/claude-1000/msg.txt',
    'gh pr create --body-file /tmp/claude-1000/body.md',
    'npm run board:move -- 212 Gate',
    'git push -u origin my-branch',
    // These three write to tracked files and are STILL the driver's own work: § 3 hands it the
    // `main`-moved merge, and it branches and stages before it commits. The guard refuses the
    // driver *authoring* a change, not git moving the branch under it.
    'git merge origin/main',
    'git checkout -b feature/x',
    'git add -A',
    'npm run finish',
  ])('leaves the sanctioned driver move alone: %s', (command) => {
    expect(bash(command)).toBe('ALLOW');
  });

  it('leaves writes outside the worktree alone', () => {
    expect(edit(SCRATCH)).toBe('ALLOW');
    expect(bash(`sed -i s/a/b/ ${SCRATCH}`)).toBe('ALLOW');
    expect(bash(`npm test > /tmp/claude-1000/t.log 2>&1`)).toBe('ALLOW');
  });

  it('reads a heredoc body as text, not as commands', () => {
    // A PR body that discusses deleting a file is not a deletion.
    const command = `cat > /tmp/claude-1000/pr.md <<EOF\nwe should rm ${TRACKED} one day\nEOF`;
    expect(bash(command)).toBe('ALLOW');
  });

  it('honours the human override token', () => {
    expect(bash(`SPO_DRIVER_SCOPE_OVERRIDE=i-am-the-human rm ${TRACKED}`)).toBe('ALLOW');
  });

  it('fails open on an unparseable payload', () => {
    // A guard that cannot read its input must never be the reason work stops.
    const out = execFileSync('node', [GUARD], {
      input: 'not json',
      encoding: 'utf8',
      env: { ...process.env, SPO_TOP: ROOT, SPO_DRIVER_SID: SID },
    }).trim();
    expect(out).toBe('ALLOW');
  });
});

describe('driver-scope-guard — it stays asleep when nobody is driving', () => {
  it('exits 0 without spawning node when there is no marker', () => {
    // The wrapper is what owns this property: no `.driving` file for this worktree means one
    // stat and exit 0, which is what every human session and every non-driving command pays.
    const out = execFileSync('bash', [path.join(ROOT, '.claude', 'hooks', 'driver-scope-guard.sh')], {
      input: JSON.stringify({ session_id: SID, tool_name: 'Edit', tool_input: { file_path: TRACKED } }),
      encoding: 'utf8',
      env: { ...process.env, SPO_SESSION_DIR: '/tmp/claude-1000/no-such-sessions-dir' },
    });
    expect(out).toBe('');
  });
});

/**
 * THE MARKER'S LIFECYCLE — the half that decides whether the guard is safe rather than merely
 * correct. The guard is inert without a marker, so an arm that is never released is not a
 * "fail-safe": it locks a session out of every tracked file in the name of a card it no longer
 * holds, and a guard that refuses work nobody asked it to refuse is a guard that gets disabled.
 *
 * Ownership closes four ways, and the first version of this change covered only one of them.
 * `finish` was the miss that mattered: CLAUDE.md promises "a session may keep working after
 * `finish`", and on the normal (retire) path finish drops nothing — the worktree is KEPT while
 * a session stands in it — so the marker survived into a session that no longer drove anything.
 */
describe('driver-scope marker — the lifecycle', () => {
  const LIB = path.join(ROOT, 'scripts', 'driver-scope.sh');

  /** Drive the sourced library for real, in a throwaway git repo with its own store. */
  function lifecycle(script: string): string {
    return execFileSync(
      'bash',
      [
        '-c',
        `set -e
         tmp="$(mktemp -d)"; store="$tmp/store"
         cd "$tmp" && git init -q .
         export SPO_SESSION_DIR="$store"
         . "${LIB}"
         ${script}
         rm -rf "$tmp"`,
      ],
      { encoding: 'utf8' },
    ).trim();
  }

  it('arms a marker carrying the session id and the issue', () => {
    const out = lifecycle(
      'CLAUDE_CODE_SESSION_ID=sid-1 arm_driver_scope 212; cat "$(driving_marker)"',
    );
    expect(out.split('\n')).toEqual(['sid-1', '212']);
  });

  it('arms nothing for a human at a bare terminal', () => {
    // No CLAUDE_CODE_SESSION_ID: board:take run by hand must not lock the human out.
    const out = lifecycle(
      'unset CLAUDE_CODE_SESSION_ID; arm_driver_scope 212; test -f "$(driving_marker)" && echo ARMED || echo NONE',
    );
    expect(out).toBe('NONE');
  });

  it('disarms, and disarming twice is not an error', () => {
    const out = lifecycle(
      `CLAUDE_CODE_SESSION_ID=sid-1 arm_driver_scope 212
       disarm_driver_scope; disarm_driver_scope
       test -f "$(driving_marker)" && echo ARMED || echo GONE`,
    );
    expect(out).toBe('GONE');
  });

  it('keys the marker the way session-heartbeat.sh keys its own file', () => {
    // Two derivations of one key, drifting apart, would arm a marker no hook ever reads.
    const lib = readScript(LIB);
    const heartbeat = readScript(path.join(ROOT, '.claude', 'hooks', 'session-heartbeat.sh'));
    const derivation = `key="$(printf '%s' "$dir" | sha1sum | cut -c1-16)"`;
    expect(lib).toContain(derivation);
    expect(heartbeat).toContain(derivation);
  });
});

describe('driver-scope marker — every path that closes ownership releases it', () => {
  it('board:take arms on a verified claim and releases on --release', () => {
    const take = readScript(path.join(ROOT, 'scripts', 'board-take.sh'));
    expect(take).toContain('arm_driver_scope "$issue"');
    expect(take).toContain('disarm_driver_scope');
    // Armed only after the re-read confirmed the claim — never on LOST or a failed write.
    expect(take.indexOf('arm_driver_scope "$issue"')).toBeGreaterThan(take.indexOf('LOST:'));
  });

  it('board:move releases on Done and on Needs triage', () => {
    const move = readScript(path.join(ROOT, 'scripts', 'board-move.sh'));
    expect(move).toMatch(/Done\|"Needs triage"\)\s*disarm_driver_scope/);
  });

  it('finish releases it on the RETIRE path, where it keeps everything else', () => {
    // The miss that motivated this block: retiring keeps `.alive` on purpose, because the
    // session goes on working. `.driving` must still go, or that session is locked out.
    const finish = readScript(path.join(ROOT, 'scripts', 'finish.sh'));
    const retire = finish.slice(finish.indexOf('retiring worktree') - 900, finish.indexOf('retiring worktree'));
    expect(retire).toContain('.driving');
    expect(finish).toContain('"$SESSIONS_DIR/$key.driving"');
  });
});

/**
 * THE REFUSAL ITSELF. A guard is read by a model that must then do the right thing, so naming
 * the WRONG remedy is a defect of the same family as blocking the wrong action — the driver
 * obeys, does something useless, and learns the guard is noise.
 *
 * A creation and an edit have different right answers. Editing a tracked file is implementation
 * and the answer is the sub-agent. Creating a file is usually the driver writing its OWN text —
 * a commit message, a PR body, which § 3 explicitly tells it to write — and the answer there is
 * the scratchpad, not a sub-agent. The first version named the sub-agent for both, which sent a
 * driver following § 3's own flow to spawn an agent for a PR body.
 */
describe('driver-scope-guard — the refusal names the right remedy', () => {
  const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'driver-scope-guard.sh');

  /** Run the wrapper for real, in a throwaway repo with a marker armed for session `sid`. */
  function refuse(toolInput: Record<string, unknown>, toolName = 'Write'): { code: number; err: string } {
    const tmp = fs.mkdtempSync('/tmp/claude-1000/dsg-');
    const store = path.join(tmp, 'store');
    execFileSync('bash', ['-c', `cd "${tmp}" && git init -q . && git commit -q --allow-empty -m x`], {
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' },
    });
    const key = execFileSync('bash', ['-c', `printf '%s' "$(readlink -f "${tmp}")" | sha1sum | cut -c1-16`], {
      encoding: 'utf8',
    }).trim();
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(path.join(store, `${key}.driving`), `${SID}\n212\n`);
    try {
      execFileSync('bash', [WRAPPER], {
        cwd: tmp,
        input: JSON.stringify({ session_id: SID, cwd: tmp, tool_name: toolName, tool_input: toolInput }),
        encoding: 'utf8',
        env: { ...process.env, SPO_SESSION_DIR: store },
      });
      return { code: 0, err: '' };
    } catch (e) {
      const err = e as { status?: number; stderr?: string };
      return { code: err.status ?? -1, err: err.stderr ?? '' };
    }
  }

  it('blocks with exit 2 and names the card', () => {
    const { code, err } = refuse({ file_path: 'pr-body.md' });
    expect(code).toBe(2);
    expect(err).toContain('DRIVING card #212');
  });

  it('sends a CREATION to the scratchpad, not to a sub-agent', () => {
    // § 3 tells the driver to write a PR body to a file. If the guard answers that with
    // "spawn the execution sub-agent", it has sent the driver down a path that cannot work.
    const { err } = refuse({ file_path: 'pr-body.md' });
    expect(err).toMatch(/SCRATCHPAD, outside the worktree/);
    expect(err).toContain('--body-file');
  });

  it('sends an EDIT of a tracked file to the sub-agent, with no scratchpad detour', () => {
    const tracked = 'tracked.txt';
    const tmpRun = refuseTracked(tracked);
    expect(tmpRun.err).toContain('execution sub-agent');
    expect(tmpRun.err).not.toMatch(/SCRATCHPAD/);
  });

  /** Same harness, but the file is committed first so it is genuinely tracked. */
  function refuseTracked(name: string): { code: number; err: string } {
    const tmp = fs.mkdtempSync('/tmp/claude-1000/dsg-');
    const store = path.join(tmp, 'store');
    const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };
    execFileSync('bash', ['-c', `cd "${tmp}" && git init -q . && echo hi > ${name} && git add ${name} && git commit -q -m x`], { env });
    const key = execFileSync('bash', ['-c', `printf '%s' "$(readlink -f "${tmp}")" | sha1sum | cut -c1-16`], {
      encoding: 'utf8',
    }).trim();
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(path.join(store, `${key}.driving`), `${SID}\n212\n`);
    try {
      execFileSync('bash', [WRAPPER], {
        cwd: tmp,
        input: JSON.stringify({ session_id: SID, cwd: tmp, tool_name: 'Edit', tool_input: { file_path: name } }),
        encoding: 'utf8',
        env: { ...process.env, SPO_SESSION_DIR: store },
      });
      return { code: 0, err: '' };
    } catch (e) {
      const err = e as { status?: number; stderr?: string };
      return { code: err.status ?? -1, err: err.stderr ?? '' };
    }
  }
});
