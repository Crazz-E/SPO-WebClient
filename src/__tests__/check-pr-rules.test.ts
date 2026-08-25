/**
 * scripts/check-pr-rules.js — the three rules the ruleset cannot express, made mechanical.
 *
 * The pure predicates, plus the two ways the script used to fail OPEN: an unresolvable diff
 * base, and a rename that walked past the protected-file list. Those two need a real git
 * repository, so they get one — a throwaway in tmp, not the working tree.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface RuleResult {
  ok: boolean;
  detail: string;
}

interface Regression {
  scope: string;
  metric: string;
  from: number | string;
  to: number | string;
}

interface Thresholds {
  [scope: string]: { [metric: string]: number };
}

interface CheckPrRulesModule {
  PROTECTED_FILES: string[];
  PROTECTED_PREFIXES: string[];
  APPROVAL_LABEL: string;
  CITATION_FILES: string[];
  protectedTouched(files: string[]): string[];
  parseLabels(raw: string | undefined): string[];
  checkProtectedPaths(files: string[], labels: string[]): RuleResult;
  checkCitation(files: string[], body: string): RuleResult;
  thresholdRegressions(base: Thresholds, head: Thresholds): Regression[];
  checkThresholds(base: Thresholds, head: Thresholds): RuleResult;
  ratchetResult(baseState: BaseThresholdState, head: Thresholds): RuleResult;
}

type BaseThresholdState =
  | { state: 'ok'; thresholds: Thresholds }
  | { state: 'absent' }
  | { state: 'unreadable'; reason: string };

const rules: CheckPrRulesModule = require('../../scripts/check-pr-rules.js');

describe('protectedTouched', () => {
  it('matches the frozen files exactly and the fixtures by prefix', () => {
    expect(rules.protectedTouched(['src/server/rdo.ts'])).toEqual(['src/server/rdo.ts']);
    expect(rules.protectedTouched(['jest.config.js'])).toEqual(['jest.config.js']);
    expect(rules.protectedTouched(['src/__fixtures__/deep/politics.json'])).toEqual([
      'src/__fixtures__/deep/politics.json',
    ]);
    expect(rules.protectedTouched(['src/server/rdo-request-guards.ts'])).toEqual([]);
  });

  it('leaves the catalogue out — it grows as normal work, guarded by the citation rule', () => {
    expect(rules.protectedTouched(['src/shared/rdo-members.ts'])).toEqual([]);
    expect(rules.CITATION_FILES).toContain('src/shared/rdo-members.ts');
  });

  it('normalises windows separators so a CRLF checkout cannot slip past', () => {
    expect(rules.protectedTouched(['src\\shared\\rdo-frame.ts'])).toEqual(['src/shared/rdo-frame.ts']);
  });
});

describe('parseLabels', () => {
  it('reads the JSON array GitHub Actions produces', () => {
    expect(rules.parseLabels('["rdo-approved","doc"]')).toEqual(['rdo-approved', 'doc']);
  });

  it('reads a raw label object array too', () => {
    expect(rules.parseLabels('[{"name":"rdo-approved"}]')).toEqual(['rdo-approved']);
  });

  it('reads a comma list, for a human running it by hand', () => {
    expect(rules.parseLabels(' rdo-approved , doc ')).toEqual(['rdo-approved', 'doc']);
  });

  it('treats an absent, empty or malformed value as no labels — never as an unlock', () => {
    expect(rules.parseLabels(undefined)).toEqual([]);
    expect(rules.parseLabels('')).toEqual([]);
    expect(rules.parseLabels('[not json')).toEqual([]);
  });
});

describe('checkProtectedPaths', () => {
  it('passes when nothing protected is touched', () => {
    expect(rules.checkProtectedPaths(['src/client/App.tsx'], []).ok).toBe(true);
  });

  it('fails when a protected file changes without the label, and names the file', () => {
    const result = rules.checkProtectedPaths(['src/shared/rdo-types.ts', 'a.ts'], ['doc']);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('src/shared/rdo-types.ts');
    expect(result.detail).toContain(rules.APPROVAL_LABEL);
  });

  it('passes once the human posts the label', () => {
    expect(rules.checkProtectedPaths(['src/shared/rdo-types.ts'], ['rdo-approved']).ok).toBe(true);
  });
});

describe('checkCitation', () => {
  it('is silent while the catalogue is untouched, whatever the body says', () => {
    expect(rules.checkCitation(['src/client/App.tsx'], '').ok).toBe(true);
  });

  it('accepts a File.pas:Line citation anywhere in the body', () => {
    expect(
      rules.checkCitation(['src/shared/rdo-members.ts'], 'kind from RDOObjectServer.pas:218').ok,
    ).toBe(true);
    expect(rules.checkCitation(['src/shared/rdo-members.ts'], 'see BasicTaxes.pas:249 out').ok).toBe(true);
  });

  it('rejects a body with no citation, or a filename with no line', () => {
    expect(rules.checkCitation(['src/shared/rdo-members.ts'], 'trust me').ok).toBe(false);
    expect(rules.checkCitation(['src/shared/rdo-members.ts'], 'see RDOObjectServer.pas').ok).toBe(false);
    expect(rules.checkCitation(['src/shared/rdo-members.ts'], '').ok).toBe(false);
  });
});

describe('thresholdRegressions', () => {
  const base: Thresholds = {
    global: { lines: 38, functions: 39, branches: 29, statements: 38 },
    './src/shared/': { lines: 54, functions: 65, branches: 37, statements: 54 },
  };

  it('says nothing when every value holds or rises', () => {
    expect(rules.thresholdRegressions(base, base)).toEqual([]);
    const raised = { ...base, global: { ...base.global, lines: 40 } };
    expect(rules.thresholdRegressions(base, raised)).toEqual([]);
  });

  it('catches a lowered metric and reports both values', () => {
    const lowered = { ...base, global: { ...base.global, branches: 20 } };
    expect(rules.thresholdRegressions(base, lowered)).toEqual([
      { scope: 'global', metric: 'branches', from: 29, to: 20 },
    ]);
  });

  it('catches a deleted metric and a deleted scope — a retreat by omission is still a retreat', () => {
    const droppedMetric = { ...base, global: { lines: 38, functions: 39, statements: 38 } };
    expect(rules.thresholdRegressions(base, droppedMetric)).toEqual([
      { scope: 'global', metric: 'branches', from: 29, to: 'removed' },
    ]);
    expect(rules.thresholdRegressions(base, { global: base.global })).toEqual([
      { scope: './src/shared/', metric: '*', from: 'present', to: 'removed' },
    ]);
  });

  it('lets a new scope in without complaint', () => {
    const added = { ...base, './src/server/': { lines: 60 } };
    expect(rules.thresholdRegressions(base, added)).toEqual([]);
  });

  it('tolerates an empty or absent base rather than inventing a failure', () => {
    expect(rules.thresholdRegressions({}, base)).toEqual([]);
  });
});

describe('checkThresholds', () => {
  it('passes on equal configs and fails on a retreat, quoting the numbers', () => {
    const base: Thresholds = { global: { lines: 38 } };
    expect(rules.checkThresholds(base, base).ok).toBe(true);
    const result = rules.checkThresholds(base, { global: { lines: 30 } });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('global lines: 38 -> 30');
  });
});

describe('the guarded set matches what the repository declares protected', () => {
  it('covers the wire emitter, the type module, the server socket and the machine floor', () => {
    expect(rules.PROTECTED_FILES).toEqual(
      expect.arrayContaining([
        'src/shared/rdo-types.ts',
        'src/shared/rdo-frame.ts',
        'src/server/rdo.ts',
        'jest.config.js',
      ]),
    );
    expect(rules.PROTECTED_PREFIXES).toContain('src/__fixtures__/');
  });
});


describe('ratchetResult — the base states are not interchangeable', () => {
  it('passes when the base genuinely has no jest.config.js', () => {
    const result = rules.ratchetResult({ state: 'absent' }, { global: { lines: 38 } });
    expect(result.ok).toBe(true);
    expect(result.detail).toContain('nothing to ratchet against');
  });

  it('FAILS when the base has the file but it could not be read', () => {
    // The whole point: this used to return ok, so any read error silently disarmed the
    // ratchet while printing a line that read like success.
    const result = rules.ratchetResult({ state: 'unreadable', reason: 'boom' }, { global: { lines: 38 } });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('boom');
  });

  it('judges the numbers when the base was read', () => {
    const base: BaseThresholdState = { state: 'ok', thresholds: { global: { lines: 38 } } };
    expect(rules.ratchetResult(base, { global: { lines: 38 } }).ok).toBe(true);
    expect(rules.ratchetResult(base, { global: { lines: 30 } }).ok).toBe(false);
  });
});

describe('the script against a real repository', () => {
  const SCRIPT = path.resolve(__dirname, '../../scripts/check-pr-rules.js');
  let repo: string;

  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

  /** Run the script in the throwaway repo; returns its exit code and combined output. */
  const run = (env: NodeJS.ProcessEnv = {}): { code: number; out: string } => {
    try {
      const out = execFileSync('node', [SCRIPT], {
        cwd: repo,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, PR_BODY: '', PR_LABELS: '', BASE_SHA: '', ...env },
      });
      return { code: 0, out };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  };

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-rules-test-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t.t');
    git('config', 'user.name', 'test');
    fs.writeFileSync(path.join(repo, 'jest.config.js'), 'module.exports = { coverageThreshold: { global: { lines: 38 } } };\n');
    fs.mkdirSync(path.join(repo, 'src/shared'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src/shared/rdo-frame.ts'), 'export const emitter = 1;\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('branch', 'work');
    git('checkout', '-q', 'work');
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('refuses when no diff base can be resolved, instead of passing over an empty set', () => {
    // No origin/main, no BASE_SHA — and `main` exists but the old fallback was the working
    // tree, which is clean here, so every rule would have reported ok over zero files.
    git('branch', '-D', 'main');
    const { code, out } = run();
    expect(code).toBe(1);
    expect(out).toContain('no diff base could be resolved');
  });

  it('catches a protected file that was RENAMED, not edited', () => {
    git('mv', 'src/shared/rdo-frame.ts', 'src/shared/wire-emitter.ts');
    git('commit', '-qm', 'move the emitter');
    const { code, out } = run();
    expect(code).toBe(1);
    expect(out).toContain('src/shared/rdo-frame.ts');
    expect(out).toContain('rdo-approved');
  });

  it('lets the same rename through once the label is present', () => {
    git('mv', 'src/shared/rdo-frame.ts', 'src/shared/wire-emitter.ts');
    git('commit', '-qm', 'move the emitter');
    expect(run({ PR_LABELS: '["rdo-approved"]' }).code).toBe(0);
  });

  it('fails the ratchet when jest.config.js on the base cannot be required', () => {
    // The script reads the MERGE-BASE, not main's tip, so the unreadable config has to be
    // there — breaking main after the fork would never be looked at. Fast-forward the branch
    // onto the broken commit, then repair the config on the branch so the HEAD read succeeds
    // and the base read is the only thing that can fail. The label isolates the ratchet from
    // the protected-file rule, which jest.config.js also trips.
    git('checkout', '-q', 'main');
    fs.writeFileSync(path.join(repo, 'jest.config.js'), 'this is not javascript {{{\n');
    git('commit', '-qam', 'break the base config');
    git('checkout', '-q', 'work');
    git('merge', '-q', 'main', '-m', 'take main');
    fs.writeFileSync(path.join(repo, 'jest.config.js'), 'module.exports = { coverageThreshold: { global: { lines: 38 } } };\n');
    git('commit', '-qam', 'repair the config on the branch');
    const { code, out } = run({ PR_LABELS: '["rdo-approved"]' });
    expect(code).toBe(1);
    expect(out).toContain('could not be read');
  });

  it('passes a clean unrelated change', () => {
    fs.writeFileSync(path.join(repo, 'note.md'), 'x\n');
    git('add', '-A');
    git('commit', '-qm', 'unrelated change');
    const { code } = run();
    expect(code).toBe(0);
  });
});
