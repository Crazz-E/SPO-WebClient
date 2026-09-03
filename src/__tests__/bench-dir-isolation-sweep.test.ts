/**
 * A standing guard over action b5.4's fix: nothing in this test suite may resolve a bench path
 * against the REAL ~/.spo-bench — the production evidence store a multi-day audit was built on.
 *
 * ---- the incident -------------------------------------------------------------------------
 *
 * Measured before this action: of 7,172 files under ~/.spo-bench/logs/gate-*, 6,938 (96.7%)
 * were test-written — 6,714 empty, 224 carrying the literal "fake npm: … failed" string this
 * suite's own fake-npm stubs emit. Root cause: scripts/verify-gate.js computes
 * `BENCH_DIR = process.env.SPO_BENCH_DIR || \`${process.env.HOME}/.spo-bench\`` and writes
 * gate logs under it; src/e2e/verify-gate.test.ts spawns that script as a real subprocess with
 * `env: { ...process.env, ... }` and never set SPO_BENCH_DIR, so every run wrote into the real
 * corpus. Three other files shared the same shape (named the real ~/.spo-bench in prose or
 * spawned a subprocess without isolating it): src/__tests__/area-reservation.test.ts and
 * src/__tests__/github-api-discipline.test.ts only ever compare DOC PROSE (they read
 * doc/kanban-workflow.md and assert it mentions `~/.spo-bench/...` — no code path they exercise
 * touches a real bench directory), and src/e2e/finish.test.ts already overrides SPO_SESSION_DIR
 * everywhere it matters — but the same textual shape ("names ~/.spo-bench, no SPO_BENCH_DIR")
 * is exactly what let the real offender hide among three harmless look-alikes.
 *
 * ---- the fix ------------------------------------------------------------------------------
 *
 * src/server/__tests__/setup/jest-setup.ts — wired into BOTH jest "projects" via
 * `setupFilesAfterEnv` in jest.config.js — forces `process.env.SPO_BENCH_DIR` to a fresh
 * `fs.mkdtempSync` directory before any test FILE's own module code runs. That one place
 * closes the class for every test that either calls src/e2e/bench/paths.ts's `benchRoot()`
 * directly (it reads `process.env.SPO_BENCH_DIR` by default) or spawns a subprocess whose env
 * spreads `...process.env` (the env it spreads now already carries the safe override).
 *
 * ---- what this sweep checks -----------------------------------------------------------------
 *
 * 1. The global guard is actually installed: jest.config.js still wires jest-setup.ts into
 *    every project, and jest-setup.ts still forces SPO_BENCH_DIR via mkdtempSync (not a fixed
 *    or home-relative path).
 * 2. No test file can defeat it: `delete process.env.SPO_BENCH_DIR` (dot or bracket notation) or
 *    a literal-string reassignment (`process.env.SPO_BENCH_DIR = '...'`) would reopen the real
 *    default for the rest of that synchronous span — src/e2e/bench/paths.test.ts used to do
 *    exactly this until action b5.4 redesigned it to inject an `env` object into `benchRoot()`
 *    instead (see that file, and src/e2e/bench/paths.ts's `benchRoot(env = process.env)`
 *    signature).
 * 3. No test file spawns a real subprocess (spawnSync/execFileSync/execSync/spawn/fork/exec/
 *    execFile) with a custom `env:` object that drops the global override: the env object
 *    itself must spread `...process.env`, set `SPO_BENCH_DIR` explicitly, or override `HOME`
 *    (the fallback scripts/verify-gate.js and src/e2e/bench/paths.ts both key off when
 *    SPO_BENCH_DIR itself is unset). The safe-marker check is scoped to the `env: { ... }`
 *    object's own text, not the whole call — a marker string that only happens to appear
 *    elsewhere in the call (e.g. inside an argv string) no longer counts. A call with no `env:`
 *    override at all is safe by default — Node inherits the full parent environment, override
 *    included — so only an EXPLICIT, incomplete override is an offence.
 * 4. No test file names the literal path `.spo-bench` at all — added after adversarial
 *    verification of this sweep found 15 ways to reach the real corpus without ever touching
 *    `SPO_BENCH_DIR`: `path.join(os.homedir(), '.spo-bench', ...)`, a template literal
 *    (`` `${os.homedir()}/.spo-bench` ``), or handing that literal path to `benchPaths()`
 *    directly all bypass rules 1–3 entirely, because none of them mention SPO_BENCH_DIR. This
 *    one rule closes 5 of those 15 evasions (the ones that name the path as a literal); it needs
 *    four named exemptions — this file's own fixture-construction and offence-message text, the
 *    two doc-prose comparison files identified ahead of time, and one more (src/e2e/bench/
 *    paths.test.ts) that this rule itself surfaced once it ran for real: all four legitimately
 *    quote the real path as TEXT (a doc-prose match, or a pure `os.homedir()` string comparison)
 *    and never resolve or touch it.
 *
 *    Of the 9 remaining evasions after rule 4, this pass additionally closed 5 with small,
 *    targeted fixes: bracket-notation delete (rule 2 above); fork/exec/execFile added to the
 *    call list (rule 3's CHILD_PROCESS_CALLS); and the env-object marker-scoping fix described
 *    in rule 3 above, which also closed a false-negative where a safe-looking marker string
 *    appeared in argv text rather than the actual env override. What remains — 4 genuinely out
 *    of reach for a text sweep:
 *      - `delete process.env['SPO_BENCH_DIR' + '']` or any other non-literal computed member
 *        access — no fixed substring to match; needs an actual parser to resolve the expression.
 *      - `process.env.SPO_BENCH_DIR = someVariable` (assignment from a variable, not a literal)
 *        — the sweep has no dataflow analysis, so it cannot tell a safe temp-dir variable from
 *        one that resolves to the real path.
 *      - a spawn whose env comes from a variable built elsewhere (`const opts = { env: {...} };
 *        spawnSync('sh', [], opts)`) or through a helper wrapper (`runIt('sh', buildEnv({...}))`)
 *        — both require tracing an identifier back to its definition, the same class of gap.
 *      - `scripts/finish.sh` / `scripts/session-marker.sh` reach the corpus through
 *        `SPO_SESSION_DIR`, a variable this sweep does not check at all, and their own fallback
 *        (`${SPO_SESSION_DIR:-$HOME/.spo-bench/sessions}`) lives in the spawned SCRIPT, not in
 *        the calling test's source text — nothing here can see it. Today's two callers
 *        (src/e2e/finish.test.ts, src/__tests__/board-take-finished-worktree.test.ts) both set
 *        SPO_SESSION_DIR by hand, so nothing leaks yet; closing this needs either forcing
 *        SPO_SESSION_DIR in jest-setup.ts alongside SPO_BENCH_DIR, or a fifth rule that requires
 *        it specifically for spawns of those two scripts — tracked as follow-up, not done here.
 *
 * ---- the floor -----------------------------------------------------------------------------
 *
 * `checked >= 300` only catches total collapse (walkTestFiles returning nothing, or close to
 * it) — a whole subdirectory silently dropping out of the walk would still leave `checked` well
 * above 300 and the sweep green. Kept as a cheap catastrophic-collapse tripwire, but backed by a
 * named canary-files assertion below: one known file per corner of src/ that must always be
 * found, so a partial regression in the walk itself fails loudly regardless of the total count.
 *
 * Text-based, like the pipeline repo's own doc/no-real-spawn sweeps, for the same reason: a
 * test file added tomorrow that spawns a process is covered without anyone remembering to wire
 * it in by hand.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const JEST_CONFIG = path.join(ROOT, 'jest.config.js');
const JEST_SETUP = path.join(ROOT, 'src', 'server', '__tests__', 'setup', 'jest-setup.ts');

interface Redaction {
  /** An exact, literal source substring known to be inert (a comment-like string, a fixture
   *  literal, an offence-message string) rather than a real finding. */
  snippet: string;
  /** How many occurrences of `snippet` are known and accounted for. An occurrence beyond this
   *  count is a NEW, unaccounted-for finding and is left for the rules below to catch. */
  count: number;
}

// ---- allowlist ---------------------------------------------------------------------------
// Per-fact, never per-file: an entry here names the EXACT literal substrings a file is known to
// contain, and how many times, not "whatever this file does." A whole-file exemption is itself
// a gap — the pipeline repo's test/no-real-spawn-sweep.test.js records, in its own header, the
// incident that taught it this: it once hid a real, uncovered
// `require('../orchestrator/park-loop')` because the entire file, not the one line, had been
// excused. Here, each entry blanks out only the NAMED number of occurrences of a NAMED string
// before the rules below run — so this file's own fixture-construction code (which builds
// synthetic source strings containing the literal offending patterns as inert text) and the
// doc-prose comparison files (which quote the real path as TEXT, never resolve it) are excused
// for exactly the occurrences already accounted for, and nothing more. An occurrence added on
// top — a real regression, or an evasion probe — is not blanked and is caught like any other
// finding. See the fixture tests below ("per-fact allowlist entry does not excuse an occurrence
// beyond the count it names") for the property this buys.
const ALLOWLIST: Record<string, Redaction[]> = {
  '__tests__/bench-dir-isolation-sweep.test.ts': [
    // Every count below is the exact, measured number of non-comment occurrences in THIS file
    // today (see the fixture-proof tests further down, which build these same strings as inert
    // text) -- not an estimate. It includes this file's own detector code (e.g. the
    // `.includes('delete process.env.SPO_BENCH_DIR')` call is itself a literal occurrence of the
    // text it looks for), its ALLOWLIST entries themselves (the snippet strings below ARE the
    // offending text, quoted), and every fixture string the tests construct. Re-measure with
    // `findOffences`/`blankComments` directly against this file (no allowlist) before changing
    // any count -- guessing here is exactly the failure mode this design exists to prevent.
    { snippet: 'delete process.env.SPO_BENCH_DIR', count: 10 },
    { snippet: "delete process.env['SPO_BENCH_DIR']", count: 2 },
    { snippet: "process.env.SPO_BENCH_DIR = '/somewhere/else';", count: 2 },
    { snippet: '.spo-bench', count: 16 },
    { snippet: "spawnSync('sh', ['-c', 'true'], { env: { PATH: '/usr/bin' } })", count: 2 },
    { snippet: "spawnSync('sh', [], { env: { PATH: '/usr/bin' } })", count: 2 },
    { snippet: "spawnSync('sh', ['-c', 'echo HOME: hi'], { env: { PATH: '/usr/bin' } })", count: 2 },
    { snippet: "fork('./w.js', [], { env: { PATH: '/usr/bin' } })", count: 2 },
    { snippet: "exec('true', { env: { PATH: '/usr/bin' } }, () => {})", count: 2 },
    { snippet: "execFile('true', [], { env: { PATH: '/usr/bin' } }, () => {})", count: 2 },
  ],
  '__tests__/area-reservation.test.ts': [
    // doc-prose comparison only — see the header comment above.
    { snippet: '.spo-bench', count: 1 },
  ],
  '__tests__/github-api-discipline.test.ts': [
    // doc-prose comparison only — see the header comment above.
    { snippet: '.spo-bench', count: 2 },
  ],
  'e2e/bench/paths.test.ts': [
    // Same shape as the two doc-prose files above: `expect(benchRoot({})).toBe(path.join(
    // os.homedir(), '.spo-bench'))` computes and compares a STRING -- os.homedir() is a pure
    // account-info lookup, not filesystem I/O, and the result is never opened, read or written.
    // Discovered by rule 4 itself when this action added it (see the header comment) -- a
    // fourth instance of "names the real path as text, never resolves it", not anticipated
    // ahead of time.
    { snippet: '.spo-bench', count: 1 },
  ],
};

function blankComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return withoutBlocks
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? ' '.repeat(line.length) : line))
    .join('\n');
}

// Blanks exactly `count` occurrences of `snippet` (left to right), leaving any occurrence beyond
// that count untouched — so a NEW occurrence appended after the known ones stays visible to the
// rules below, while the known, accounted-for occurrences do not trip a false positive.
function redactKnownOccurrences(source: string, redactions: Redaction[]): string {
  let out = source;
  for (const { snippet, count } of redactions) {
    let from = 0;
    for (let i = 0; i < count; i++) {
      const idx = out.indexOf(snippet, from);
      if (idx === -1) break;
      out = out.slice(0, idx) + ' '.repeat(snippet.length) + out.slice(idx + snippet.length);
      from = idx + snippet.length;
    }
  }
  return out;
}

function walkTestFiles(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkTestFiles(full, out);
    else if (/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const CHILD_PROCESS_CALLS = ['spawnSync', 'execFileSync', 'execSync', 'spawn', 'fork', 'exec', 'execFile'];
const SAFE_ENV_MARKERS = ['...process.env', 'SPO_BENCH_DIR', 'HOME:', 'HOME :'];

// Index of the ')' (or '}') that closes the '(' (or '{') at openIdx, by depth-counting. Textual,
// like the rest of this scanner — it does not understand string literals, same tolerance the
// pipeline's own sweeps accept.
function matchingIndex(source: string, openIdx: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Isolates the `{ ... }` object literal passed as `env:`, so the safe-marker check below only
// ever looks inside the actual env override — not the whole call. Without this, a marker string
// that happens to appear anywhere else in the call (e.g. `spawnSync('sh', ['-c', 'echo HOME:
// hi'], { env: { PATH } })`, where "HOME:" is shell output text, not an env override) is wrongly
// read as safe. Returns null when `env:`'s value isn't a literal object (e.g. a variable) — that
// shape is a separate, harder gap (see the header comment's "genuinely out of reach" list); the
// caller falls back to scanning the whole call text, same as before this fix.
function envValueText(argsText: string): string | null {
  const marker = /\benv\s*:\s*\{/.exec(argsText);
  if (!marker) return null;
  const openIdx = argsText.indexOf('{', marker.index);
  const closeIdx = matchingIndex(argsText, openIdx, '{', '}');
  if (closeIdx === -1) return null;
  return argsText.slice(openIdx, closeIdx + 1);
}

// Every way one test file's source can let a real path resolve against the real ~/.spo-bench.
// Pure text in, reasons out — as testable against a synthetic fixture string as against a real
// file's contents (see the fixture tests below). `redactions` blanks known, accounted-for
// occurrences before any rule runs (see ALLOWLIST and redactKnownOccurrences above).
function findOffences(rawSource: string, redactions: Redaction[] = []): string[] {
  const source = redactKnownOccurrences(blankComments(rawSource), redactions);
  const offences: string[] = [];

  if (
    source.includes('delete process.env.SPO_BENCH_DIR') ||
    /delete\s+process\.env\s*\[\s*['"]SPO_BENCH_DIR['"]\s*\]/.test(source)
  ) {
    offences.push(
      'deletes process.env.SPO_BENCH_DIR directly -- reopens the real ~/.spo-bench default for ' +
        'every other code path in this worker process for the span before it is restored ' +
        '(inject an env object at the call site instead, see src/e2e/bench/paths.test.ts)'
    );
  }
  if (/process\.env\.SPO_BENCH_DIR\s*=\s*['"]/.test(source)) {
    offences.push(
      'reassigns process.env.SPO_BENCH_DIR to a literal string -- mutates the real, ' +
        'process-wide variable instead of injecting a throwaway env object at the call site'
    );
  }
  if (source.includes('.spo-bench')) {
    offences.push(
      "names the literal '.spo-bench' path -- resolves against the real ~/.spo-bench " +
        'regardless of SPO_BENCH_DIR, whether via os.homedir()/HOME, a template literal, or any ' +
        'other route that never mentions SPO_BENCH_DIR at all'
    );
  }

  for (const name of CHILD_PROCESS_CALLS) {
    const pattern = new RegExp(`\\b${name}\\s*\\(`, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      const openIdx = match.index + match[0].length - 1;
      const closeIdx = matchingIndex(source, openIdx, '(', ')');
      if (closeIdx === -1) continue;
      const argsText = source.slice(openIdx + 1, closeIdx);
      if (!/\benv\s*:/.test(argsText)) continue; // no env override at all -> inherits the whole parent env
      // Scope the safe-marker check to the env object's own text when it's a literal; fall back
      // to the whole call only when it isn't (e.g. env comes from a variable -- a separate,
      // documented gap, not one this scoping fix can close).
      const scanTarget = envValueText(argsText) ?? argsText;
      const safe = SAFE_ENV_MARKERS.some((marker) => scanTarget.includes(marker));
      if (!safe) {
        offences.push(
          `${name}(...) passes a custom env that neither spreads ...process.env, sets ` +
            'SPO_BENCH_DIR, nor overrides HOME -- a real subprocess spawned this way resolves ' +
            'SPO_BENCH_DIR against the real ~/.spo-bench'
        );
      }
    }
  }

  return offences;
}

function scanDir(dir: string, allowlist: Record<string, Redaction[]>): { offenders: string[]; checked: number } {
  const offenders: string[] = [];
  let checked = 0;
  for (const file of walkTestFiles(dir)) {
    const key = path.relative(dir, file);
    const source = fs.readFileSync(file, 'utf8');
    checked += 1;
    const offences = findOffences(source, allowlist[key] ?? []);
    if (offences.length) offenders.push(`${key}: ${offences.join('; ')}`);
  }
  return { offenders, checked };
}

describe('bench isolation — the global guard is installed', () => {
  it('wires jest-setup.ts into setupFilesAfterEnv for every jest project', () => {
    const configSource = fs.readFileSync(JEST_CONFIG, 'utf8');
    const occurrences = configSource.split('server/__tests__/setup/jest-setup').length - 1;
    // One per jest "project" (today: unit, component) -- see jest.config.js's `projects` array.
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('jest-setup.ts forces SPO_BENCH_DIR to a fresh temp directory, never the real home path', () => {
    const setupSource = fs.readFileSync(JEST_SETUP, 'utf8');
    expect(setupSource).toMatch(/process\.env\.SPO_BENCH_DIR\s*=\s*fs\.mkdtempSync\(/);
    expect(setupSource).not.toMatch(/process\.env\.SPO_BENCH_DIR\s*=\s*(path\.join\(os\.homedir\(\)|os\.homedir\(\)|['"])/);
  });
});

describe('bench isolation — no test path can resolve to the real ~/.spo-bench', () => {
  it('every src/**/*.test.ts(x) file passes the sweep', () => {
    const { offenders, checked } = scanDir(SRC_DIR, ALLOWLIST);

    // If this drops well below the current count, the sweep has stopped finding files (a
    // rename, a moved directory) and a green result would mean nothing -- fail loudly instead,
    // same reasoning as the pipeline repo's own sweeps. Catches total collapse only -- see the
    // canary-files assertion below for the partial-collapse case this floor cannot see.
    expect(checked).toBeGreaterThanOrEqual(300);

    expect(offenders).toEqual([]);
  });

  it('the walk still reaches known files from every corner of the tree, not just enough of them', () => {
    // The floor above only catches total collapse: a whole subdirectory silently dropping out of
    // walkTestFiles (a rename, an accidentally-added exclusion) still leaves `checked` well above
    // 300 and the sweep green. Name one canary per corner of src/ instead -- any one going
    // missing means that subtree is no longer covered, floor or no floor.
    const files = walkTestFiles(SRC_DIR).map((f) => path.relative(SRC_DIR, f));
    expect(files).toEqual(
      expect.arrayContaining([
        path.join('e2e', 'verify-gate.test.ts'),
        path.join('e2e', 'bench', 'paths.test.ts'),
        path.join('__tests__', 'bench-dir-isolation-sweep.test.ts'),
        path.join('client', 'client.test.tsx'),
        path.join('server', 'map-parsers.test.ts'),
      ])
    );
  });
});

describe('sweep mechanics — fixture proofs', () => {
  function fixtureDir(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }

  it('flags a fixture that deletes process.env.SPO_BENCH_DIR', () => {
    const dir = fixtureDir('spo-bench-sweep-delete-');
    fs.writeFileSync(
      path.join(dir, 'fixture.test.ts'),
      ["'use strict';", 'delete process.env.SPO_BENCH_DIR;', ''].join('\n')
    );
    const { offenders } = scanDir(dir, {});
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toMatch(/deletes process\.env\.SPO_BENCH_DIR directly/);
  });

  it('flags bracket-notation deletion of SPO_BENCH_DIR too', () => {
    const dir = fixtureDir('spo-bench-sweep-delete-bracket-');
    fs.writeFileSync(path.join(dir, 'fixture.test.ts'), "delete process.env['SPO_BENCH_DIR'];\n");
    const { offenders } = scanDir(dir, {});
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toMatch(/deletes process\.env\.SPO_BENCH_DIR directly/);
  });

  it('flags a fixture that reassigns process.env.SPO_BENCH_DIR to a literal string', () => {
    const dir = fixtureDir('spo-bench-sweep-literal-');
    fs.writeFileSync(path.join(dir, 'fixture.test.ts'), "process.env.SPO_BENCH_DIR = '/somewhere/else';\n");
    const { offenders } = scanDir(dir, {});
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toMatch(/reassigns process\.env\.SPO_BENCH_DIR to a literal string/);
  });

  it('flags the literal .spo-bench path, however it reaches a real fs call', () => {
    const dir = fixtureDir('spo-bench-sweep-literal-path-');
    fs.writeFileSync(
      path.join(dir, 'fixture.test.ts'),
      "fs.writeFileSync(path.join(os.homedir(), '.spo-bench', 'logs', 'x'), 'x');\n"
    );
    const { offenders } = scanDir(dir, {});
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toMatch(/names the literal '\.spo-bench'/);
  });

  it('a per-fact allowlist entry can exempt the literal .spo-bench mention, for doc-prose comparisons', () => {
    const dir = fixtureDir('spo-bench-sweep-literal-path-allow-');
    fs.writeFileSync(path.join(dir, 'fixture.test.ts'), "expect(text).toMatch(/~\\/\\.spo-bench\\/verdicts\\//);\n");
    const withoutAllowlist = scanDir(dir, {});
    expect(withoutAllowlist.offenders).toHaveLength(1);
    const withAllowlist = scanDir(dir, { 'fixture.test.ts': [{ snippet: '.spo-bench', count: 1 }] });
    expect(withAllowlist.offenders).toEqual([]);
  });

  it('flags a fixture that spawns a subprocess with a custom env missing every safe marker', () => {
    const dir = fixtureDir('spo-bench-sweep-spawn-');
    fs.writeFileSync(
      path.join(dir, 'fixture.test.ts'),
      "spawnSync('sh', ['-c', 'true'], { env: { PATH: '/usr/bin' } });\n"
    );
    const { offenders } = scanDir(dir, {});
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toMatch(/passes a custom env that neither spreads/);
  });

  it('flags fork/exec/execFile the same as their *Sync siblings', () => {
    const dir = fixtureDir('spo-bench-sweep-async-spawns-');
    fs.writeFileSync(
      path.join(dir, 'fixture.test.ts'),
      [
        "fork('./w.js', [], { env: { PATH: '/usr/bin' } });",
        "exec('true', { env: { PATH: '/usr/bin' } }, () => {});",
        "execFile('true', [], { env: { PATH: '/usr/bin' } }, () => {});",
        '',
      ].join('\n')
    );
    const { offenders } = scanDir(dir, {});
    expect(offenders).toHaveLength(1);
    expect(offenders[0].match(/passes a custom env/g)).toHaveLength(3);
  });

  it('flags a "safe" marker that only appears in argv text, not in the env object itself', () => {
    const dir = fixtureDir('spo-bench-sweep-marker-scope-');
    // "HOME:" shows up in the shell command string, not in the actual env override -- the naive
    // whole-call-text marker check used to call this safe.
    fs.writeFileSync(
      path.join(dir, 'fixture.test.ts'),
      "spawnSync('sh', ['-c', 'echo HOME: hi'], { env: { PATH: '/usr/bin' } });\n"
    );
    const { offenders } = scanDir(dir, {});
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toMatch(/passes a custom env/);
  });

  it('passes a fixture that spreads ...process.env', () => {
    const dir = fixtureDir('spo-bench-sweep-ok-spread-');
    fs.writeFileSync(
      path.join(dir, 'fixture.test.ts'),
      "spawnSync('sh', [], { env: { ...process.env, PATH: '/usr/bin' } });\n"
    );
    expect(scanDir(dir, {}).offenders).toEqual([]);
  });

  it('passes a fixture that sets SPO_BENCH_DIR explicitly, with no spread at all', () => {
    const dir = fixtureDir('spo-bench-sweep-ok-explicit-');
    fs.writeFileSync(
      path.join(dir, 'fixture.test.ts'),
      "execFileSync('node', ['x.js'], { env: { SPO_BENCH_DIR: benchDir } });\n"
    );
    expect(scanDir(dir, {}).offenders).toEqual([]);
  });

  it('passes a fixture that overrides HOME instead', () => {
    const dir = fixtureDir('spo-bench-sweep-ok-home-');
    fs.writeFileSync(path.join(dir, 'fixture.test.ts'), "spawnSync('bash', [SCRIPT], { env: { PATH: bin, HOME: os.tmpdir() } });\n");
    expect(scanDir(dir, {}).offenders).toEqual([]);
  });

  it('passes a fixture that never overrides env at all -- full inheritance is safe by default', () => {
    const dir = fixtureDir('spo-bench-sweep-ok-noenv-');
    fs.writeFileSync(path.join(dir, 'fixture.test.ts'), "execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD']);\n");
    expect(scanDir(dir, {}).offenders).toEqual([]);
  });

  it('ignores mentions inside comments, on both sides of the rule', () => {
    const dir = fixtureDir('spo-bench-sweep-comment-');
    fs.writeFileSync(
      path.join(dir, 'fixture.test.ts'),
      [
        '// see delete process.env.SPO_BENCH_DIR for context',
        "spawnSync('sh', [], { env: { PATH: '/usr/bin' } });",
        '',
      ].join('\n')
    );
    const { offenders } = scanDir(dir, {});
    // The comment must not count as a second offence, but the real spawnSync call still does.
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toMatch(/passes a custom env/);
    // Distinct from the length check above: `offenders` is one joined string PER FILE, not per
    // offence, so a second real offence hiding in the same entry would not change its length --
    // this assertion is the one that actually looks at what the "comment" contributed.
    expect(offenders[0]).not.toMatch(/deletes process\.env\.SPO_BENCH_DIR/);
  });

  it('honours a NAMED, per-fact allowlist entry, for exactly the number of occurrences it names', () => {
    const dir = fixtureDir('spo-bench-sweep-allow-');
    fs.writeFileSync(path.join(dir, 'fixture-a.test.ts'), 'delete process.env.SPO_BENCH_DIR;\n');
    fs.writeFileSync(path.join(dir, 'fixture-b.test.ts'), 'delete process.env.SPO_BENCH_DIR;\n');

    const withoutAllowlist = scanDir(dir, {});
    expect(withoutAllowlist.offenders).toHaveLength(2);

    const withAllowlist = scanDir(dir, {
      'fixture-a.test.ts': [{ snippet: 'delete process.env.SPO_BENCH_DIR', count: 1 }],
    });
    expect(withAllowlist.offenders).toHaveLength(1);
    expect(withAllowlist.offenders[0]).toMatch(/^fixture-b\.test\.ts:/);
  });

  it('a per-fact allowlist entry does not excuse an occurrence beyond the count it names', () => {
    const dir = fixtureDir('spo-bench-sweep-allow-overflow-');
    // Two occurrences in the file, but the allowlist entry accounts for only one -- exactly the
    // shape of a real regression added on top of already-exempted fixture text. This is the
    // property a whole-file exemption cannot offer (see the header comment above): appending a
    // live offence to an allowlisted file must still be caught.
    fs.writeFileSync(
      path.join(dir, 'fixture.test.ts'),
      'delete process.env.SPO_BENCH_DIR;\ndelete process.env.SPO_BENCH_DIR;\n'
    );
    const { offenders } = scanDir(dir, {
      'fixture.test.ts': [{ snippet: 'delete process.env.SPO_BENCH_DIR', count: 1 }],
    });
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toMatch(/deletes process\.env\.SPO_BENCH_DIR directly/);
  });

  it('passes a fixture that never touches SPO_BENCH_DIR or spawns anything', () => {
    const dir = fixtureDir('spo-bench-sweep-none-');
    fs.writeFileSync(path.join(dir, 'fixture.test.ts'), "const fs = require('fs');\n");
    expect(scanDir(dir, {}).offenders).toEqual([]);
  });
});
