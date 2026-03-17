/**
 * Validates the esbuild Electron bundle output (dist/server-bundle.js).
 *
 * These tests only run when the bundle exists (i.e., after `npm run build:electron-bundle`).
 * During normal `npm test` they are skipped automatically.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const BUNDLE_PATH = path.resolve(__dirname, '../../../dist/server-bundle.js');
const bundleExists = fs.existsSync(BUNDLE_PATH);

const describeIfBundle = bundleExists ? describe : describe.skip;

describeIfBundle('electron bundle (dist/server-bundle.js)', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(BUNDLE_PATH, 'utf-8');
  });

  it('should be a non-trivial file (> 100KB)', () => {
    const stat = fs.statSync(BUNDLE_PATH);
    expect(stat.size).toBeGreaterThan(100 * 1024);
  });

  it('should contain startGateway export', () => {
    expect(content).toContain('startGateway');
  });

  it('should not bundle electron (marked external)', () => {
    // BrowserWindow is an Electron-only class — should never appear in the server bundle
    expect(content).not.toContain('BrowserWindow');
  });

  it('should externalize 7zip-min (require preserved)', () => {
    // esbuild preserves require() calls for external modules
    const has7zipRequire =
      content.includes('require("7zip-min")') ||
      content.includes("require('7zip-min')");
    expect(has7zipRequire).toBe(true);
  });

  it('should be valid CJS (no top-level import/export syntax)', () => {
    // esbuild CJS output should not contain ES module syntax at top level
    // Check first 500 chars for import/export statements
    const head = content.slice(0, 500);
    expect(head).not.toMatch(/^import\s/m);
    expect(head).not.toMatch(/^export\s/m);
  });
});
