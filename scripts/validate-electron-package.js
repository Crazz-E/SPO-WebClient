#!/usr/bin/env node
/**
 * Post-build validation for the Electron packaged app.
 *
 * Inspects electron/release/win-unpacked/ and verifies that all critical files
 * are present, the bundle is sane, and path resolution won't break at runtime.
 *
 * Usage:  node scripts/validate-electron-package.js
 * Exit:   0 = all checks pass, 1 = one or more failures
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'electron', 'release', 'win-unpacked');
const RESOURCES = path.join(RELEASE_DIR, 'resources');

let passed = 0;
let failed = 0;

function check(label, ok, detail) {
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}`);
    if (detail) console.log(`        ${detail}`);
    failed++;
  }
}

function fileExists(p) {
  return fs.existsSync(p);
}

function dirExists(p) {
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

// ---------------------------------------------------------------------------
// Pre-flight: does the unpacked release exist?
// ---------------------------------------------------------------------------
console.log('\nElectron Package Validation');
console.log('==========================\n');

if (!dirExists(RELEASE_DIR)) {
  console.log(`  SKIP  Release directory not found: ${RELEASE_DIR}`);
  console.log('        Run "npm run electron:dist" first.\n');
  process.exit(0); // Not a failure — build hasn't been run yet
}

// ---------------------------------------------------------------------------
// 1. Required files
// ---------------------------------------------------------------------------
console.log('1. Required files\n');

check(
  'Server bundle exists',
  fileExists(path.join(RESOURCES, 'dist', 'server-bundle.js')),
  `Expected: ${path.join(RESOURCES, 'dist', 'server-bundle.js')}`,
);

check(
  'index.html exists',
  fileExists(path.join(RESOURCES, 'public', 'index.html')),
  `Expected: ${path.join(RESOURCES, 'public', 'index.html')}`,
);

check(
  'app.js exists',
  fileExists(path.join(RESOURCES, 'public', 'app.js')),
  `Expected: ${path.join(RESOURCES, 'public', 'app.js')}`,
);

check(
  '7zip-min module exists',
  dirExists(path.join(RESOURCES, 'dist', 'node_modules', '7zip-min')),
  `Expected: ${path.join(RESOURCES, 'dist', 'node_modules', '7zip-min')}`,
);

check(
  '7zip-bin module exists',
  dirExists(path.join(RESOURCES, 'dist', 'node_modules', '7zip-bin')),
  `Expected: ${path.join(RESOURCES, 'dist', 'node_modules', '7zip-bin')}`,
);

check(
  'app.asar exists',
  fileExists(path.join(RESOURCES, 'app.asar')),
  `Expected: ${path.join(RESOURCES, 'app.asar')}`,
);

// ---------------------------------------------------------------------------
// 2. Bundle sanity checks
// ---------------------------------------------------------------------------
console.log('\n2. Bundle sanity\n');

const bundlePath = path.join(RESOURCES, 'dist', 'server-bundle.js');
if (fileExists(bundlePath)) {
  const stat = fs.statSync(bundlePath);
  check(
    `Bundle size > 100KB (actual: ${Math.round(stat.size / 1024)}KB)`,
    stat.size > 100 * 1024,
  );

  const content = fs.readFileSync(bundlePath, 'utf-8');

  check(
    'Bundle exports startGateway',
    content.includes('startGateway'),
  );

  check(
    'electron is externalized (not bundled)',
    !content.includes('BrowserWindow'),
    'Found "BrowserWindow" in bundle — electron should be external',
  );

  check(
    '7zip-min is externalized (require preserved)',
    content.includes('require("7zip-min")') || content.includes("require('7zip-min')"),
    '7zip-min should be a runtime require, not inlined',
  );
} else {
  console.log('  SKIP  Bundle file missing — skipping sanity checks');
}

// ---------------------------------------------------------------------------
// 3. Path resolution simulation
// ---------------------------------------------------------------------------
console.log('\n3. Path resolution (regression check)\n');

// Simulate what paths.ts projectRoot() would compute at runtime:
// __dirname = <resources>/dist/  →  projectRoot = __dirname/../.. = <install-root>/
const simulatedDirname = path.join(RESOURCES, 'dist');
const simulatedProjectRoot = path.resolve(simulatedDirname, '..', '..');
const wrongPublicDir = path.join(simulatedProjectRoot, 'public');
const correctPublicDir = path.join(RESOURCES, 'public');

check(
  'OLD bug: <install-root>/public does NOT exist (would indicate broken __dirname resolution)',
  !dirExists(wrongPublicDir),
  `Found directory at ${wrongPublicDir} — this means the old __dirname bug would "work" by accident`,
);

check(
  'CORRECT: <resources>/public exists',
  dirExists(correctPublicDir),
  `Expected: ${correctPublicDir}`,
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
