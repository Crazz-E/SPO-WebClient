/**
 * The wc-line-count guard (.claude/hooks/wc-line-count-guard.{sh,js}).
 *
 * WHY THIS FILE EXISTS. Card #406. `wc -l <file>` reports a file's line count fine, but the
 * Read tool does the same job with line numbers, image/PDF support, and harness-integrated
 * cancellation — CLAUDE.md already asks for the built-in tools (Read, Grep, Glob, Edit, Write)
 * over the shell aliases. This guard catches the `wc -l <file>` / `wc -l < <file>` shape and
 * routes it to Read(), leaving a file under a legacy tree root (SPO_LEGACY_TREES) alone, the
 * same carve-out cat-file-read-guard.js uses.
 *
 * This guard follows cat-file-read-guard's `.sh + .js + test` shape — the same one
 * driver-scope-guard, investigation-form-guard and file-discovery-guard use — and drives
 * wc-line-count-guard.js directly with crafted payloads, the same way
 * src/__tests__/cat-file-read-guard.test.ts drives its own decision program.
 *
 * Fabricated `/legacy/SPO-Original` and `/legacy/SPO-ASP` roots (via SPO_LEGACY_TREES) keep
 * the suite hermetic — no dependency on the real ~/SPO-Original / ~/SPO-ASP trees existing on
 * the machine running the test.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const ROOT = process.cwd();
const GUARD = path.join(ROOT, '.claude', 'hooks', 'wc-line-count-guard.js');
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'wc-line-count-guard.sh');

const LEGACY_ORIGINAL = '/legacy/SPO-Original';
const LEGACY_ASP = '/legacy/SPO-ASP';
const LEGACY_TREES = `${LEGACY_ORIGINAL}:${LEGACY_ASP}`;
const CWD = '/somewhere/not-legacy';

interface Payload {
  cwd?: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/** Run the decision program (wc-line-count-guard.js) directly over one command string. */
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

describe('wc-line-count-guard.js — the `wc -l <file>` shape', () => {
  it('blocks a plain `wc -l` with an absolute path', () => {
    const out = verdict('wc -l /somewhere/not-legacy/notes.txt');
    expect(out).not.toBe('ALLOW');
    expect(out).toContain('BLOCKED');
    const corrected = correctedLine(out);
    expect(corrected).toBe('Read(file_path="/somewhere/not-legacy/notes.txt")');
  });

  it('blocks a plain `wc -l` with a relative path, resolved against cwd', () => {
    const out = verdict('wc -l notes.txt');
    expect(out).not.toBe('ALLOW');
    expect(out).toContain('BLOCKED');
    const corrected = correctedLine(out);
    expect(corrected).toBe(`Read(file_path="${CWD}/notes.txt")`);
  });

  it('blocks `wc -l < file` (input redirection)', () => {
    const out = verdict('wc -l < /somewhere/not-legacy/notes.txt');
    expect(out).not.toBe('ALLOW');
    expect(out).toContain('BLOCKED');
    const corrected = correctedLine(out);
    expect(corrected).toBe('Read(file_path="/somewhere/not-legacy/notes.txt")');
  });

  it('blocks `wc -l < file` with a relative path, resolved against cwd', () => {
    const out = verdict('wc -l < notes.txt');
    expect(out).not.toBe('ALLOW');
    const corrected = correctedLine(out);
    expect(corrected).toBe(`Read(file_path="${CWD}/notes.txt")`);
  });

  it('blocks `wc` with a stacked flag that includes `l` (-cl)', () => {
    const out = verdict('wc -cl /somewhere/not-legacy/notes.txt');
    expect(out).not.toBe('ALLOW');
    const corrected = correctedLine(out);
    expect(corrected).toBe('Read(file_path="/somewhere/not-legacy/notes.txt")');
  });

  it('blocks `wc --lines file`', () => {
    const out = verdict('wc --lines /somewhere/not-legacy/notes.txt');
    expect(out).not.toBe('ALLOW');
    const corrected = correctedLine(out);
    expect(corrected).toBe('Read(file_path="/somewhere/not-legacy/notes.txt")');
  });

  it('blocks wc -l reading from a task scratchpad path (/tmp/claude-...)', () => {
    const scratchpad = '/tmp/claude-1000/some-session/scratchpad/data.json';
    const out = verdict(`wc -l ${scratchpad}`);
    expect(out).not.toBe('ALLOW');
    const corrected = correctedLine(out);
    expect(corrected).toBe(`Read(file_path="${scratchpad}")`);
  });

  it('blocks the first of two `wc -l` commands chained with `;`', () => {
    const out = verdict('wc -l a.txt; wc -l b.txt');
    expect(out).not.toBe('ALLOW');
    const corrected = correctedLine(out);
    expect(corrected).toBe(`Read(file_path="${CWD}/a.txt")`);
  });

  it('blocks the first of two `wc -l` commands chained with `&&`', () => {
    const out = verdict('wc -l a.txt && wc -l b.txt');
    expect(out).not.toBe('ALLOW');
    const corrected = correctedLine(out);
    expect(corrected).toBe(`Read(file_path="${CWD}/a.txt")`);
  });
});

describe('wc-line-count-guard.js — legacy tree carve-out (left alone)', () => {
  it('allows a `wc -l` under the SPO-Original legacy root', () => {
    expect(verdict(`wc -l ${LEGACY_ORIGINAL}/Kernel/KernelCache.pas`)).toBe('ALLOW');
  });

  it('allows a `wc -l` under the SPO-ASP legacy root', () => {
    expect(verdict(`wc -l ${LEGACY_ASP}/Five/0/Visual/Voyager/main.asp`)).toBe('ALLOW');
  });

  it('allows a `wc -l` exactly at a legacy root path', () => {
    expect(verdict(`wc -l ${LEGACY_ORIGINAL}`)).toBe('ALLOW');
  });

  it('still blocks a `wc -l` outside both legacy roots even when they are configured', () => {
    const out = verdict('wc -l /somewhere/not-legacy/notes.txt');
    expect(out).not.toBe('ALLOW');
  });
});

describe('wc-line-count-guard.js — override and pass-through', () => {
  it('allows a command carrying the override token', () => {
    const command = 'SPO_WC_LINE_COUNT_GUARD_OVERRIDE=i-mean-it wc -l /somewhere/not-legacy/notes.txt';
    expect(verdict(command)).toBe('ALLOW');
  });

  it('allows a non-wc Bash command', () => {
    expect(verdict('npm test')).toBe('ALLOW');
  });

  it('allows a command whose head token merely contains the substring "wc" (fwcount)', () => {
    expect(verdict('fwcount /somewhere/not-legacy/notes.txt')).toBe('ALLOW');
  });

  it('allows a command with no wc token at all (git status)', () => {
    expect(verdict('git status')).toBe('ALLOW');
  });

  it('allows bare `wc -l` with no file operand (reads stdin)', () => {
    expect(verdict('echo hi | wc -l')).toBe('ALLOW');
  });

  it('allows `wc -c` (byte count, not line count) even with a file operand', () => {
    expect(verdict('wc -c /somewhere/not-legacy/notes.txt')).toBe('ALLOW');
  });

  it('allows a bare `wc file` with no `-l` flag (not line-count mode)', () => {
    expect(verdict('wc /somewhere/not-legacy/notes.txt')).toBe('ALLOW');
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

describe('wc-line-count-guard.sh — the wrapper', () => {
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

  it('blocks a bare `wc -l` end-to-end and renders the corrected Read() call', () => {
    const { code, err } = run('wc -l /somewhere/not-legacy/notes.txt', { SPO_LEGACY_TREES: LEGACY_TREES });
    expect(code).toBe(2);
    expect(err).toContain('BLOCKED');
    expect(err).toContain('Read(file_path="/somewhere/not-legacy/notes.txt")');
  });

  it('blocks `wc -l < file` end-to-end and renders the corrected Read() call', () => {
    const { code, err } = run('wc -l < /somewhere/not-legacy/notes.txt', { SPO_LEGACY_TREES: LEGACY_TREES });
    expect(code).toBe(2);
    expect(err).toContain('BLOCKED');
    expect(err).toContain('Read(file_path="/somewhere/not-legacy/notes.txt")');
  });

  it('a deliberate human override passes an otherwise-refused command', () => {
    const command = 'SPO_WC_LINE_COUNT_GUARD_OVERRIDE=i-mean-it wc -l /somewhere/not-legacy/notes.txt';
    expect(run(command, { SPO_LEGACY_TREES: LEGACY_TREES })).toEqual({ code: 0, err: '' });
  });

  it('allows a `wc -l` under the legacy tree end-to-end (left alone)', () => {
    const result = run(`wc -l ${LEGACY_ORIGINAL}/Kernel/KernelCache.pas`, { SPO_LEGACY_TREES: LEGACY_TREES });
    expect(result).toEqual({ code: 0, err: '' });
  });

  it('stays asleep — exit 0, no output — when the payload never mentions wc', () => {
    const result = run('npm test', { SPO_LEGACY_TREES: LEGACY_TREES });
    expect(result).toEqual({ code: 0, err: '' });
  });

  it('stays asleep — exit 0, no output — when wc reads stdin only', () => {
    const result = run('echo hi | wc -l', { SPO_LEGACY_TREES: LEGACY_TREES });
    expect(result).toEqual({ code: 0, err: '' });
  });

  it('defaults SPO_LEGACY_TREES to the real trees when unset, and still blocks elsewhere', () => {
    const env = { ...process.env };
    delete env.SPO_LEGACY_TREES;
    const { code, err } = run('wc -l /somewhere/not-legacy/notes.txt', env);
    expect(code).toBe(2);
    expect(err).toContain('BLOCKED');
  });
});
