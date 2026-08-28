/**
 * The cat-file-read guard (.claude/hooks/cat-file-read-guard.{sh,js}).
 *
 * WHY THIS FILE EXISTS. Card #403. `cat <file>` reads a file fine, but the Read tool does the
 * same job with line numbers, image/PDF support, and harness-integrated cancellation —
 * CLAUDE.md already asks for the built-in tools (Read, Grep, Glob, Edit, Write) over the shell
 * aliases. This guard catches the bare `cat <file>` shape and routes it to Read(), leaving a
 * file under a legacy tree root (SPO_LEGACY_TREES) to investigation-form-guard.js, which
 * already owns that read (the ISO-8859 / `-a` trap).
 *
 * This guard follows driver-scope-guard's `.sh + .js + test` shape — the same one
 * investigation-form-guard and file-discovery-guard use — and drives cat-file-read-guard.js
 * directly with crafted payloads, the same way src/__tests__/investigation-form-guard.test.ts
 * drives its own decision program.
 *
 * Fabricated `/legacy/SPO-Original` and `/legacy/SPO-ASP` roots (via SPO_LEGACY_TREES) keep
 * the suite hermetic — no dependency on the real ~/SPO-Original / ~/SPO-ASP trees existing on
 * the machine running the test.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const ROOT = process.cwd();
const GUARD = path.join(ROOT, '.claude', 'hooks', 'cat-file-read-guard.js');
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'cat-file-read-guard.sh');

const LEGACY_ORIGINAL = '/legacy/SPO-Original';
const LEGACY_ASP = '/legacy/SPO-ASP';
const LEGACY_TREES = `${LEGACY_ORIGINAL}:${LEGACY_ASP}`;
const CWD = '/somewhere/not-legacy';

interface Payload {
  cwd?: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/** Run the decision program (cat-file-read-guard.js) directly over one command string. */
function verdict(command: string, extra: Partial<Payload> = {}, legacyTrees: string = LEGACY_TREES): string {
  const body: Payload = { cwd: CWD, tool_name: 'Bash', tool_input: { command }, ...extra };
  return execFileSync('node', [GUARD], {
    input: JSON.stringify(body),
    encoding: 'utf8',
    env: { ...process.env, SPO_LEGACY_TREES: legacyTrees },
  }).trim();
}

/** The single line the guard renders after "Corrected form:" — the suggested Read() call. */
function correctedLine(message: string): string {
  const m = message.match(/Corrected form:\n\n {2}(.+)\n/);
  if (!m) throw new Error(`no "Corrected form:" line in:\n${message}`);
  return m[1];
}

describe('cat-file-read-guard.js — the bare cat shape', () => {
  it('blocks a plain cat with an absolute path', () => {
    const out = verdict('cat /somewhere/not-legacy/notes.txt');
    expect(out).not.toBe('ALLOW');
    expect(out).toContain('BLOCKED');
    const corrected = correctedLine(out);
    expect(corrected).toBe('Read(file_path="/somewhere/not-legacy/notes.txt")');
  });

  it('blocks a plain cat with a relative path, resolved against cwd', () => {
    const out = verdict('cat notes.txt');
    expect(out).not.toBe('ALLOW');
    expect(out).toContain('BLOCKED');
    const corrected = correctedLine(out);
    expect(corrected).toBe(`Read(file_path="${CWD}/notes.txt")`);
  });

  it('blocks cat with flags before the path (-n)', () => {
    const out = verdict('cat -n /somewhere/not-legacy/notes.txt');
    expect(out).not.toBe('ALLOW');
    const corrected = correctedLine(out);
    expect(corrected).toBe('Read(file_path="/somewhere/not-legacy/notes.txt")');
  });

  it('blocks cat with a different flag (-v)', () => {
    const out = verdict('cat -v /somewhere/not-legacy/notes.txt');
    expect(out).not.toBe('ALLOW');
    const corrected = correctedLine(out);
    expect(corrected).toBe('Read(file_path="/somewhere/not-legacy/notes.txt")');
  });

  it('blocks cat with multiple stacked flags', () => {
    const out = verdict('cat -n -A /somewhere/not-legacy/notes.txt');
    expect(out).not.toBe('ALLOW');
    const corrected = correctedLine(out);
    expect(corrected).toBe('Read(file_path="/somewhere/not-legacy/notes.txt")');
  });

  it('blocks cat reading from a task scratchpad path (/tmp/claude-...)', () => {
    const scratchpad = '/tmp/claude-1000/some-session/scratchpad/data.json';
    const out = verdict(`cat ${scratchpad}`);
    expect(out).not.toBe('ALLOW');
    const corrected = correctedLine(out);
    expect(corrected).toBe(`Read(file_path="${scratchpad}")`);
  });

  it('blocks the first of two cat commands chained with `;`', () => {
    const out = verdict('cat a.txt; cat b.txt');
    expect(out).not.toBe('ALLOW');
    const corrected = correctedLine(out);
    expect(corrected).toBe(`Read(file_path="${CWD}/a.txt")`);
  });

  it('blocks the first of two cat commands chained with `&&`', () => {
    const out = verdict('cat a.txt && cat b.txt');
    expect(out).not.toBe('ALLOW');
    const corrected = correctedLine(out);
    expect(corrected).toBe(`Read(file_path="${CWD}/a.txt")`);
  });
});

describe('cat-file-read-guard.js — legacy tree carve-out (not this guard\'s job)', () => {
  it('allows a cat under the SPO-Original legacy root', () => {
    expect(verdict(`cat ${LEGACY_ORIGINAL}/Kernel/KernelCache.pas`)).toBe('ALLOW');
  });

  it('allows a cat under the SPO-ASP legacy root', () => {
    expect(verdict(`cat ${LEGACY_ASP}/Five/0/Visual/Voyager/main.asp`)).toBe('ALLOW');
  });

  it('allows a cat exactly at a legacy root path', () => {
    expect(verdict(`cat ${LEGACY_ORIGINAL}`)).toBe('ALLOW');
  });

  it('still blocks a cat outside both legacy roots even when they are configured', () => {
    const out = verdict('cat /somewhere/not-legacy/notes.txt');
    expect(out).not.toBe('ALLOW');
  });
});

describe('cat-file-read-guard.js — override and pass-through', () => {
  it('allows a command carrying the override token', () => {
    const command = 'SPO_CAT_FILE_READ_GUARD_OVERRIDE=i-mean-it cat /somewhere/not-legacy/notes.txt';
    expect(verdict(command)).toBe('ALLOW');
  });

  it('allows a non-cat Bash command', () => {
    expect(verdict('npm test')).toBe('ALLOW');
  });

  it('allows a command whose head token merely contains the substring "cat" (concat)', () => {
    expect(verdict('concat /somewhere/not-legacy/notes.txt')).toBe('ALLOW');
  });

  it('allows a command with no cat token at all (git status)', () => {
    expect(verdict('git status')).toBe('ALLOW');
  });

  it('allows bare `cat` with no file operand (reads stdin)', () => {
    expect(verdict('echo hi | cat')).toBe('ALLOW');
  });

  it('allows `git cat-file` — a different program, head token is `git`', () => {
    expect(verdict('git cat-file -p HEAD')).toBe('ALLOW');
  });

  it('fails open on an unparseable payload', () => {
    const out = execFileSync('node', [GUARD], {
      input: 'not json',
      encoding: 'utf8',
      env: { ...process.env, SPO_LEGACY_TREES: LEGACY_TREES },
    }).trim();
    expect(out).toBe('ALLOW');
  });

  it('fails open on a non-Bash tool', () => {
    const out = execFileSync('node', [GUARD], {
      input: JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/somewhere/notes.txt' } }),
      encoding: 'utf8',
      env: { ...process.env, SPO_LEGACY_TREES: LEGACY_TREES },
    }).trim();
    expect(out).toBe('ALLOW');
  });

  it('fails open on an empty command', () => {
    const out = execFileSync('node', [GUARD], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: '' } }),
      encoding: 'utf8',
      env: { ...process.env, SPO_LEGACY_TREES: LEGACY_TREES },
    }).trim();
    expect(out).toBe('ALLOW');
  });
});

describe('cat-file-read-guard.sh — the wrapper', () => {
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

  it('blocks a bare cat end-to-end and renders the corrected Read() call', () => {
    const { code, err } = run('cat /somewhere/not-legacy/notes.txt', { SPO_LEGACY_TREES: LEGACY_TREES });
    expect(code).toBe(2);
    expect(err).toContain('BLOCKED');
    expect(err).toContain('Read(file_path="/somewhere/not-legacy/notes.txt")');
  });

  it('a deliberate human override passes an otherwise-refused command', () => {
    const command = 'SPO_CAT_FILE_READ_GUARD_OVERRIDE=i-mean-it cat /somewhere/not-legacy/notes.txt';
    expect(run(command, { SPO_LEGACY_TREES: LEGACY_TREES })).toEqual({ code: 0, err: '' });
  });

  it('allows a cat under the legacy tree end-to-end (left to investigation-form-guard)', () => {
    const result = run(`cat ${LEGACY_ORIGINAL}/Kernel/KernelCache.pas`, { SPO_LEGACY_TREES: LEGACY_TREES });
    expect(result).toEqual({ code: 0, err: '' });
  });

  it('stays asleep — exit 0, no output — when the payload never mentions cat', () => {
    const result = run('npm test', { SPO_LEGACY_TREES: LEGACY_TREES });
    expect(result).toEqual({ code: 0, err: '' });
  });

  it('defaults SPO_LEGACY_TREES to the real trees when unset, and still blocks elsewhere', () => {
    const env = { ...process.env };
    delete env.SPO_LEGACY_TREES;
    const { code, err } = run('cat /somewhere/not-legacy/notes.txt', env);
    expect(code).toBe(2);
    expect(err).toContain('BLOCKED');
  });
});
