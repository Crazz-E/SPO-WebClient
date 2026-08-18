/**
 * The RDO surface matcher — `.claude/hooks/rdo-surface.js`.
 *
 * It decides whether a `git commit` / `git push` needs a fresh RDO
 * certification. Getting it wrong is expensive in both directions: too wide and
 * every documentation commit costs a live run, too narrow and a frame changes
 * without anyone re-certifying it.
 *
 * The module is plain CommonJS because a git hook loads it, so it is required
 * rather than imported.
 */

import * as path from 'path';

interface SurfaceRule { path?: string; prefix?: string; suffix?: string; why?: string }
interface Surface { tier1: SurfaceRule[]; tier2: SurfaceRule[]; exclude?: SurfaceRule[] }
interface SurfaceModule {
  loadSurface(hooksDir?: string): Surface;
  classify(files: string[], surface: Surface): { tier1: string[]; tier2: string[]; ignored: string[]; touched: boolean };
  classifyFile(file: string, surface: Surface): 'tier1' | 'tier2' | null;
  normalise(file: string): string;
  newestSurfaceMtime(root: string, surface: Surface): number;
}

const HOOKS_DIR = path.join(__dirname, '..', '..', '..', '.claude', 'hooks');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const surfaceModule = require(path.join(HOOKS_DIR, 'rdo-surface.js')) as SurfaceModule;
const { loadSurface, classify, classifyFile, normalise, newestSurfaceMtime } = surfaceModule;

const surface = loadSurface(HOOKS_DIR);

describe('the declared surface', () => {
  it('names the seven files that change every byte on the wire', () => {
    const tier1 = surface.tier1.map(r => r.path).sort();
    expect(tier1).toEqual([
      'src/server/rdo-helpers.ts',
      'src/server/rdo.ts',
      'src/server/session/rdo-request-guards.ts',
      'src/server/spo_session.ts',
      'src/shared/cp1252.ts',
      'src/shared/rdo-types.ts',
      'src/shared/timeout-categories.ts',
    ]);
  });

  // A rule nobody can explain is a rule nobody can audit.
  it('carries a reason on every rule', () => {
    for (const rule of [...surface.tier1, ...surface.tier2, ...(surface.exclude ?? [])]) {
      expect(typeof rule.why).toBe('string');
      expect((rule.why ?? '').length).toBeGreaterThan(10);
    }
  });
});

describe('classifyFile', () => {
  it.each([
    ['src/shared/rdo-types.ts', 'tier1'],
    ['src/server/rdo-helpers.ts', 'tier1'],
    ['src/server/spo_session.ts', 'tier1'],
    ['src/server/session/rdo-request-guards.ts', 'tier1'],
  ])('%s is tier 1', (file, tier) => {
    expect(classifyFile(file, surface)).toBe(tier);
  });

  it.each([
    'src/server/session/mail-handler.ts',
    'src/tools/conformance/suites.ts',
    'src/mock-server/scenarios/login.scenario.ts',
    'src/shared/error-codes.ts',
  ])('%s is tier 2', file => {
    expect(classifyFile(file, surface)).toBe('tier2');
  });

  it.each([
    ['a client component', 'src/client/components/BuildingPanel.tsx'],
    ['documentation', 'doc/rdo-protocol-architecture.md'],
    ['a report', 'report/lot-A-inventaire-campagne-live.md'],
    ['a markdown file living under src/', 'src/server/CLAUDE.md'],
    ['the campaign bus', '.rdo-live/inventory.ndjson'],
  ])('%s does not touch the surface', (_label, file) => {
    expect(classifyFile(file, surface)).toBeNull();
  });

  // The trap the old gate fell into: a test cannot change the frame the
  // gateway puts on the wire, so it must not cost a live run.
  it('ignores a unit test sitting inside a tier-2 directory', () => {
    expect(classifyFile('src/server/session/mail-handler.test.ts', surface)).toBeNull();
  });

  it('ignores generated capture scenarios, which are never hand-edited', () => {
    expect(classifyFile('src/mock-server/scenarios/captured/login-full-captured.scenario.ts', surface)).toBeNull();
  });

  it('accepts Windows separators — git speaks POSIX, callers may not', () => {
    expect(classifyFile('src\\shared\\rdo-types.ts', surface)).toBe('tier1');
    expect(normalise('src\\server\\rdo.ts')).toBe('src/server/rdo.ts');
  });

  // Exclusions are a convenience for tier 2. A file named explicitly in tier 1
  // is load-bearing whatever its name suggests.
  it('lets tier 1 win over an exclusion', () => {
    const contrived: Surface = {
      tier1: [{ path: 'src/shared/rdo-types.ts', why: 'x' }],
      tier2: [],
      exclude: [{ suffix: '.ts', why: 'deliberately over-broad' }],
    };
    expect(classifyFile('src/shared/rdo-types.ts', contrived)).toBe('tier1');
  });
});

describe('classify — the gate decision', () => {
  it('does not require certification for a documentation-only change', () => {
    const result = classify(
      ['doc/rdo-protocol-architecture.md', 'report/plan-campagne-live-rdo.md', 'README.md'],
      surface,
    );
    expect(result.touched).toBe(false);
    expect(result.ignored).toHaveLength(3);
  });

  it('requires certification as soon as one tier-2 file appears', () => {
    const result = classify(['doc/x.md', 'src/server/session/chat-handler.ts'], surface);
    expect(result.touched).toBe(true);
    expect(result.tier2).toEqual(['src/server/session/chat-handler.ts']);
    expect(result.tier1).toHaveLength(0);
  });

  it('separates tier 1 so the operator knows every frame is implicated', () => {
    const result = classify(['src/shared/cp1252.ts', 'src/server/session/mail-handler.ts'], surface);
    expect(result.tier1).toEqual(['src/shared/cp1252.ts']);
    expect(result.tier2).toEqual(['src/server/session/mail-handler.ts']);
    expect(result.touched).toBe(true);
  });

  it('treats an empty change set as untouched rather than as unknown', () => {
    expect(classify([], surface).touched).toBe(false);
  });
});

describe('newestSurfaceMtime', () => {
  // The point of the rewrite: freshness is dated from the RDO files, not from
  // the newest write anywhere under src/.
  it('reads a real timestamp from the checked-out surface', () => {
    const root = path.join(__dirname, '..', '..', '..');
    const newest = newestSurfaceMtime(root, surface);
    expect(newest).toBeGreaterThan(0);
    expect(newest).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('is zero when no surface file exists on disk', () => {
    const empty: Surface = { tier1: [{ path: 'nope/absent.ts', why: 'x' }], tier2: [], exclude: [] };
    expect(newestSurfaceMtime(path.join(__dirname, 'does-not-exist'), empty)).toBe(0);
  });
});

describe('loadSurface', () => {
  it('refuses a surface whose tiers are not arrays — a silent empty surface would disarm the gate', () => {
    expect(() => loadSurface(path.join(__dirname, 'no-such-dir'))).toThrow();
  });
});
