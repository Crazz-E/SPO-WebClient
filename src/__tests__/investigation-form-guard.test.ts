/**
 * The investigation-form guard (.claude/hooks/investigation-form-guard.{sh,js}).
 *
 * WHY THIS FILE EXISTS. Card #117 measured a live `/next-task` session running:
 *
 *   find /home/crazz/SPO-Original -name "*.pas" -type f 2>/dev/null | xargs grep -l "X" 2>/dev/null
 *
 * and getting 2 files back where the truth is 15 — the missing one is the authority
 * (`Interface Server/InterfaceServer.pas`). Three stacked causes, all masked by `2>/dev/null`:
 * `xargs` aborting on the apostrophe in `Pastel's mp3/` (only 1338 of 1747 files ever reached
 * `grep`), word-splitting destroying every spaced directory, and 343 suppressed stderr lines
 * including the fatal `xargs: unmatched single quote`. A fourth cause, already documented at
 * CLAUDE.md § SPO-Original: `grep` without `-a` returns nothing on the ISO-8859-encoded `.pas`
 * files, exiting 1 as if the text were absent. None of these four fails loudly — each looks
 * like a clean, empty answer, and these reads feed `src/shared/rdo-members.ts` (CLAUDE.md § RDO).
 *
 * This guard follows driver-scope-guard's `.sh + .js + test` shape — the only tested one in
 * the directory — and drives investigation-form-guard.js directly with crafted payloads, the
 * same way src/__tests__/driver-scope-guard.test.ts and worktree-scope-guard.test.ts drive
 * their own decision programs.
 *
 * Fabricated `/legacy/SPO-Original` and `/legacy/SPO-ASP` roots (via SPO_LEGACY_TREES) keep
 * the suite hermetic — no dependency on the real ~/SPO-Original / ~/SPO-ASP trees existing on
 * the machine running the test.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const GUARD = path.join(ROOT, '.claude', 'hooks', 'investigation-form-guard.js');
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'investigation-form-guard.sh');
const PIPE_WRAPPER = path.join(ROOT, '.claude', 'hooks', 'verdict-pipe-guard.sh');

const LEGACY_ORIGINAL = '/legacy/SPO-Original';
const LEGACY_ASP = '/legacy/SPO-ASP';
const LEGACY_TREES = `${LEGACY_ORIGINAL}:${LEGACY_ASP}`;
const CWD = '/somewhere/not-legacy';

interface Payload {
  cwd?: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/** Run the decision program (investigation-form-guard.js) directly over one command string. */
function verdict(command: string, extra: Partial<Payload> = {}, legacyTrees: string = LEGACY_TREES): string {
  const body: Payload = { cwd: CWD, tool_name: 'Bash', tool_input: { command }, ...extra };
  return execFileSync('node', [GUARD], {
    input: JSON.stringify(body),
    encoding: 'utf8',
    env: { ...process.env, SPO_LEGACY_TREES: legacyTrees },
  }).trim();
}

/** Same as verdict(), but with SPO_LEGACY_TREES deleted rather than set — a distinct helper
 * because a default parameter cannot represent "explicitly absent": JS applies a default
 * whenever the argument is `undefined`, whether that is because it was omitted or passed
 * explicitly, so a sentinel default cannot double as the missing-env case. */
function verdictNoLegacyEnv(command: string): string {
  const body: Payload = { cwd: CWD, tool_name: 'Bash', tool_input: { command } };
  const env = { ...process.env };
  delete env.SPO_LEGACY_TREES;
  return execFileSync('node', [GUARD], {
    input: JSON.stringify(body),
    encoding: 'utf8',
    env,
  }).trim();
}

/** The single line the guard renders after "Corrected form:" — the fixed-up command. */
function correctedLine(message: string): string {
  const m = message.match(/Corrected form:\n\n {2}(.+)\n/);
  if (!m) throw new Error(`no "Corrected form:" line in:\n${message}`);
  return m[1];
}

describe('investigation-form-guard.js — the three refused shapes', () => {
  it('measured case: find | xargs grep, no -print0/-0/-a, 2>/dev/null twice', () => {
    const command =
      'find /legacy/SPO-Original -name "*.pas" -type f 2>/dev/null | xargs grep -l "GetChannelInfo" 2>/dev/null';
    const out = verdict(command);
    expect(out).not.toBe('ALLOW');

    // The corrected form fixes all three causes at once.
    const corrected = correctedLine(out);
    expect(corrected).toContain('-print0');
    expect(corrected).toContain('xargs -0');
    expect(corrected).toContain('grep -a');
    expect(corrected).not.toContain('2>/dev/null');

    // The measured stderr count from the card #117 incident.
    expect(out).toContain('343');
  });

  it('grep with a parenthesis inside a quoted pattern — no -a, refused', () => {
    const command = 'grep -rn "= class(" /legacy/SPO-Original/Kernel';
    const out = verdict(command);
    expect(out).not.toBe('ALLOW');
    expect(out).toContain('-a');
    expect(out).toContain('Grep tool');
    // The quote-aware split must not have mistaken the `(` inside the quoted pattern for a
    // subshell opener and truncated the statement.
    expect(out).toContain('/legacy/SPO-Original/Kernel');
  });

  it('find \\( -name ... -o -name ... \\) | xargs grep — escaped-paren evasion refused', () => {
    // The statement split used to treat the bare `(` inside `find`'s backslash-escaped
    // `\( ... \)` as a subshell opener and cut the statement there — the `find` head fragment
    // then carried no violation and the `xargs grep` tail had no read-verb head, so the whole
    // pipeline passed untouched. Masking `\(`/`\)` before the split keeps it one statement.
    const command = `find ${LEGACY_ORIGINAL} \\( -name "*.pas" -o -name "*.dfm" \\) 2>/dev/null | xargs grep -l X`;
    const out = verdict(command);
    expect(out).not.toBe('ALLOW');

    // All three corrections fire, same as the measured case — the escaped parens did not
    // shield any of the three causes from detection.
    const corrected = correctedLine(out);
    expect(corrected).toContain('-print0');
    expect(corrected).toContain('xargs -0');
    expect(corrected).toContain('grep -a');
    expect(corrected).not.toContain('2>/dev/null');
  });

  it('redirect-only refusal on a non-grep read verb (cat)', () => {
    const command = `cat "${LEGACY_ASP}/Five/0/Visual/Voyager/main.asp" 2>/dev/null`;
    const out = verdict(command);
    expect(out).not.toBe('ALLOW');
    const corrected = correctedLine(out);
    expect(corrected).not.toContain('2>/dev/null');
    expect(corrected).toContain('main.asp');
    expect(out).toContain('343');
  });
});

describe('investigation-form-guard.js — must not cry wolf', () => {
  it('a dangerous form quoted inside a heredoc body is text, not a command', () => {
    const command = [
      'cat > /tmp/notes.md <<EOF',
      'find /legacy/SPO-Original -name "*.pas" 2>/dev/null | xargs grep -l X 2>/dev/null',
      'EOF',
    ].join('\n');
    expect(verdict(command)).toBe('ALLOW');
  });

  it('2>/dev/null on an action command (not a read verb) is allowed', () => {
    expect(verdict('git rev-parse --show-toplevel 2>/dev/null')).toBe('ALLOW');
  });

  it('git grep passes untouched — its head token is `git`, not a read verb', () => {
    expect(verdict(`git grep -n GetChannelInfo ${LEGACY_ORIGINAL}`)).toBe('ALLOW');
  });

  it('a path outside both legacy trees is none of this guard\'s business', () => {
    expect(verdict('grep -rn foo /home/crazz/SPO-WebClient/src')).toBe('ALLOW');
  });

  it('a correctly-formed command (all three fixes already applied) is allowed', () => {
    const command =
      'find /legacy/SPO-Original -name "*.pas" -print0 | xargs -0 grep -a -l "GetChannelInfo"';
    expect(verdict(command)).toBe('ALLOW');
  });

  it('fails open on an unparseable payload', () => {
    const out = execFileSync('node', [GUARD], {
      input: 'not json',
      encoding: 'utf8',
      env: { ...process.env, SPO_LEGACY_TREES: LEGACY_TREES },
    }).trim();
    expect(out).toBe('ALLOW');
  });

  it('fails open when SPO_LEGACY_TREES is missing', () => {
    expect(verdictNoLegacyEnv(`grep -rn foo ${LEGACY_ORIGINAL}`)).toBe('ALLOW');
  });

  it('fails open on a non-Bash tool', () => {
    const out = execFileSync('node', [GUARD], {
      input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: `${LEGACY_ORIGINAL}/x.pas` } }),
      encoding: 'utf8',
      env: { ...process.env, SPO_LEGACY_TREES: LEGACY_TREES },
    }).trim();
    expect(out).toBe('ALLOW');
  });
});

describe('investigation-form-guard.js — shares parsing with the rest of the directory', () => {
  it('requires the shared bash-command-parse module, not a local copy', () => {
    const src = fs.readFileSync(GUARD, 'utf8');
    expect(src).toContain('require("./bash-command-parse")');
    expect(src).not.toMatch(/function\s+stripHeredocs\s*\(/);
    expect(src).not.toMatch(/function\s+statements\s*\(/);
  });
});

describe('investigation-form-guard.sh — the wrapper', () => {
  function run(command: string, env: NodeJS.ProcessEnv = {}): { code: number; err: string } {
    try {
      execFileSync('bash', [WRAPPER], {
        cwd: ROOT,
        input: JSON.stringify({ cwd: CWD, tool_name: 'Bash', tool_input: { command } }),
        encoding: 'utf8',
        env: { ...process.env, ...env },
      });
      return { code: 0, err: '' };
    } catch (e) {
      const err = e as { status?: number; stderr?: string };
      return { code: err.status ?? -1, err: err.stderr ?? '' };
    }
  }

  it('a deliberate human override passes an otherwise-refused command', () => {
    const command = `SPO_INVESTIGATION_FORM_OVERRIDE=i-mean-it grep -rn foo ${LEGACY_ORIGINAL}`;
    expect(run(command, { SPO_LEGACY_TREES: LEGACY_TREES })).toEqual({ code: 0, err: '' });
  });

  it('stays asleep — exit 0, no output — when the payload never mentions a legacy tree', () => {
    const result = run('npm test', { SPO_LEGACY_TREES: LEGACY_TREES });
    expect(result).toEqual({ code: 0, err: '' });
  });

  it('blocks the measured form end-to-end and renders the corrected command', () => {
    const command = `grep -rn foo ${LEGACY_ORIGINAL}`;
    const { code, err } = run(command, { SPO_LEGACY_TREES: LEGACY_TREES });
    expect(code).toBe(2);
    expect(err).toContain('grep -a');
  });
});

describe('verdict-pipe-guard.sh — smoke test after the shared-helper refactor', () => {
  it('still blocks `npm test | tail`', () => {
    let code = 0;
    let err = '';
    try {
      execFileSync('bash', [PIPE_WRAPPER], {
        cwd: ROOT,
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm test | tail -20' } }),
        encoding: 'utf8',
        env: process.env,
      });
    } catch (e) {
      const failure = e as { status?: number; stderr?: string };
      code = failure.status ?? -1;
      err = failure.stderr ?? '';
    }
    expect(code).toBe(2);
    expect(err).toContain('BLOCKED');
  });

  it('still allows a plain `npm test`', () => {
    const out = execFileSync('bash', [PIPE_WRAPPER], {
      cwd: ROOT,
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm test' } }),
      encoding: 'utf8',
      env: process.env,
    });
    expect(out).toBe('');
  });

  it('a heredoc body quoting PIPESTATUS must not disarm a real verdict pipe outside it', () => {
    // The escape check used to run on the raw command, so a heredoc that merely mentions
    // PIPESTATUS as text disarmed the guard for a real `npm test | tail` sitting right after
    // it — previously blocked, wrongly allowed. It must stay heredoc-stripped before the check.
    const command = [
      'cat > /tmp/notes.md <<EOF',
      'mentions PIPESTATUS here, just text',
      'EOF',
      'npm test | tail -20',
    ].join('\n');
    let code = 0;
    let err = '';
    try {
      execFileSync('bash', [PIPE_WRAPPER], {
        cwd: ROOT,
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
        encoding: 'utf8',
        env: process.env,
      });
    } catch (e) {
      const failure = e as { status?: number; stderr?: string };
      code = failure.status ?? -1;
      err = failure.stderr ?? '';
    }
    expect(code).toBe(2);
    expect(err).toContain('BLOCKED');
  });
});

describe('verdict-pipe-guard.sh — non-final positions (exit code lost before semicolon)', () => {
  it('blocks verdict command in non-final position: `npm test; echo x`', () => {
    let code = 0;
    let err = '';
    try {
      execFileSync('bash', [PIPE_WRAPPER], {
        cwd: ROOT,
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm test; echo x' } }),
        encoding: 'utf8',
        env: process.env,
      });
    } catch (e) {
      const failure = e as { status?: number; stderr?: string };
      code = failure.status ?? -1;
      err = failure.stderr ?? '';
    }
    expect(code).toBe(2);
    expect(err).toContain('BLOCKED');
    expect(err).toContain('non-final position');
  });

  it('blocks verdict command in non-final position: `npm test; true`', () => {
    let code = 0;
    let err = '';
    try {
      execFileSync('bash', [PIPE_WRAPPER], {
        cwd: ROOT,
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm test; true' } }),
        encoding: 'utf8',
        env: process.env,
      });
    } catch (e) {
      const failure = e as { status?: number; stderr?: string };
      code = failure.status ?? -1;
      err = failure.stderr ?? '';
    }
    expect(code).toBe(2);
    expect(err).toContain('BLOCKED');
    expect(err).toContain('non-final position');
  });

  it('blocks verdict command in non-final position within subshell: `(npm test; echo x)`', () => {
    let code = 0;
    let err = '';
    try {
      execFileSync('bash', [PIPE_WRAPPER], {
        cwd: ROOT,
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: '(npm test; echo x)' } }),
        encoding: 'utf8',
        env: process.env,
      });
    } catch (e) {
      const failure = e as { status?: number; stderr?: string };
      code = failure.status ?? -1;
      err = failure.stderr ?? '';
    }
    expect(code).toBe(2);
    expect(err).toContain('BLOCKED');
    expect(err).toContain('non-final position');
  });

  it('blocks verdict command in non-final position within braces: `{npm test; echo x}`', () => {
    let code = 0;
    let err = '';
    try {
      execFileSync('bash', [PIPE_WRAPPER], {
        cwd: ROOT,
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: '{npm test; echo x;}' } }),
        encoding: 'utf8',
        env: process.env,
      });
    } catch (e) {
      const failure = e as { status?: number; stderr?: string };
      code = failure.status ?? -1;
      err = failure.stderr ?? '';
    }
    expect(code).toBe(2);
    expect(err).toContain('BLOCKED');
    expect(err).toContain('non-final position');
  });

  it('allows verdict command in final position: `echo x; npm test`', () => {
    const out = execFileSync('bash', [PIPE_WRAPPER], {
      cwd: ROOT,
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'echo x; npm test' } }),
      encoding: 'utf8',
      env: process.env,
    });
    expect(out).toBe('');
  });

  it('allows verdict command in final position of subshell: `(echo x; npm test)`', () => {
    const out = execFileSync('bash', [PIPE_WRAPPER], {
      cwd: ROOT,
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: '(echo x; npm test)' } }),
      encoding: 'utf8',
      env: process.env,
    });
    expect(out).toBe('');
  });

  it('allows verdict command with no filter: `npm test > log`', () => {
    const out = execFileSync('bash', [PIPE_WRAPPER], {
      cwd: ROOT,
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm test > log' } }),
      encoding: 'utf8',
      env: process.env,
    });
    expect(out).toBe('');
  });

  it('allows verdict with PIPESTATUS check: `npm test; echo \"EXIT=${PIPESTATUS[0]}\"`', () => {
    const out = execFileSync('bash', [PIPE_WRAPPER], {
      cwd: ROOT,
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'npm test; echo "EXIT=${PIPESTATUS[0]}"' },
      }),
      encoding: 'utf8',
      env: process.env,
    });
    expect(out).toBe('');
  });

  it('allows query command in non-final position: `npm test --version; echo x`', () => {
    const out = execFileSync('bash', [PIPE_WRAPPER], {
      cwd: ROOT,
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm test --version; echo x' } }),
      encoding: 'utf8',
      env: process.env,
    });
    expect(out).toBe('');
  });

  it('blocks `npx tsc` in non-final position but suggests typecheck alternative', () => {
    let code = 0;
    let err = '';
    try {
      execFileSync('bash', [PIPE_WRAPPER], {
        cwd: ROOT,
        input: JSON.stringify({
          tool_name: 'Bash',
          tool_input: { command: '(npx tsc --noEmit; npx tsc --noEmit -p tsconfig.e2e.json) > log' },
        }),
        encoding: 'utf8',
        env: process.env,
      });
    } catch (e) {
      const failure = e as { status?: number; stderr?: string };
      code = failure.status ?? -1;
      err = failure.stderr ?? '';
    }
    expect(code).toBe(2);
    expect(err).toContain('BLOCKED');
    expect(err).toContain('non-final position');
  });
});
