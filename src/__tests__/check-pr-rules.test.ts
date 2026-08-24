/**
 * scripts/check-pr-rules.js — the three rules the ruleset cannot express, made mechanical.
 * The pure predicates only; the git-facing CLI is exercised by the CI job itself.
 */

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
}

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
