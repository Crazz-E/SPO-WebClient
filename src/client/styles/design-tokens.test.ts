/**
 * Design-token guard.
 *
 * The UX audit (doc/ux/audit.md §2.1) found 25 `var(--x)` references to tokens that do not
 * exist — each one a silent visual bug (a dropped declaration, a mobile toolbar with no
 * stacking order). This test makes that class of bug impossible to reintroduce:
 *
 *  1. every custom property referenced in a client stylesheet must be defined in
 *     `src/client/styles/*.css` (or be set at runtime — see ALLOWED_RUNTIME);
 *  2. no stylesheet may remove the focus ring (`outline: none` / `outline: 0`) without
 *     providing a `:focus-visible` rule in the same file;
 *  3. the type scale never drops below 12 px (11 px is the one documented exception,
 *     `--text-2xs`), including inside media queries.
 *
 * Why a Jest test and not stylelint: no new dependency (CLAUDE.md), and the gate already
 * runs Jest on every PR.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const CLIENT_ROOT = join(__dirname, '..');
const STYLES_DIR = __dirname;

/** Custom properties that are set from TypeScript at runtime, never in a stylesheet. */
const ALLOWED_RUNTIME = new Set<string>([
  '--path-length', // SVG stroke animation, set by the component
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') walk(full, out);
    } else if (entry.endsWith('.css')) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const allCss = walk(CLIENT_ROOT);
const tokenFiles = allCss.filter((f) => f.startsWith(STYLES_DIR));
const moduleFiles = allCss.filter((f) => !f.startsWith(STYLES_DIR));

const defined = new Set<string>();
for (const f of tokenFiles) {
  const css = stripComments(readFileSync(f, 'utf8'));
  for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);
}

describe('design tokens', () => {
  it('finds the token files', () => {
    expect(tokenFiles.length).toBeGreaterThan(0);
    expect(defined.has('--accent-gold')).toBe(true);
  });

  it('every var(--x) used by a stylesheet is defined', () => {
    const missing: string[] = [];
    for (const f of allCss) {
      const css = stripComments(readFileSync(f, 'utf8'));
      for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
        const name = m[1];
        if (!defined.has(name) && !ALLOWED_RUNTIME.has(name)) {
          missing.push(`${relative(CLIENT_ROOT, f)}: ${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('no stylesheet removes the focus ring without a :focus-visible rule', () => {
    const offenders: string[] = [];
    for (const f of moduleFiles) {
      const css = stripComments(readFileSync(f, 'utf8'));
      const removes = /outline\s*:\s*(none|0)\b/.test(css);
      const restores = /:focus-visible/.test(css);
      if (removes && !restores) offenders.push(relative(CLIENT_ROOT, f));
    }
    expect(offenders).toEqual([]);
  });

  it('the type scale never drops below 12 px (11 px only via --text-2xs)', () => {
    const tokens = stripComments(readFileSync(join(STYLES_DIR, 'design-tokens.css'), 'utf8'));
    for (const m of tokens.matchAll(/--text-([a-z0-9]+)\s*:\s*([0-9.]+)rem/g)) {
      const px = parseFloat(m[2]) * 16;
      const floor = m[1] === '2xs' ? 11 : 12;
      expect({ token: `--text-${m[1]}`, px }).toEqual({ token: `--text-${m[1]}`, px: expect.any(Number) });
      expect(px).toBeGreaterThanOrEqual(floor);
    }
  });
});
