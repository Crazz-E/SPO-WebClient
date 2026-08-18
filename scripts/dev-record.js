/**
 * dev-record — start the gateway in RDO capture mode.
 *
 *   npm run dev:record -- <journey-name>
 *
 * Sets the three variables the logger reads (src/shared/config.ts:171-176) and
 * starts the built server. Every RDO frame the gateway puts on or takes off the
 * wire lands in the NDJSON log as `RDO>> ` (synchronous request), `RDO>* `
 * (fire-and-forget push) or `RDO<< ` (incoming), with credentials redacted.
 *
 * Why a wrapper and not an inline env prefix: `LOG_JSON=true npm start` is POSIX
 * syntax that cmd.exe does not understand, and this repo has no `cross-env`.
 *
 * ## Why a child process and not `require()`
 *
 * `dist/server/server.js` only starts itself when it IS the entry point:
 *
 *     const isDirectRun = typeof require !== 'undefined' && require.main === module;
 *     if (isDirectRun) { main(); }                        // server.js:1436
 *
 * Requiring it from here makes `require.main` this file, so `isDirectRun` is
 * false and the gateway never listens — the banner prints and the process exits
 * (observed 2026-08-18). Spawning it keeps it the entry point, and `stdio:
 * 'inherit'` keeps Ctrl-C, colours and exit codes behaving as with `npm start`.
 *
 * ## One journey, one session, one file
 *
 * A page reload opens a NEW gateway session with a new `sid`, and the converter
 * then refuses to guess which one you meant. Play the journey in a single page
 * load, stop the server, convert:
 *
 *   npm run capture:convert -- <the file printed below> --name <journey-name>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rawName = process.argv[2];
if (!rawName) {
  console.error('usage: npm run dev:record -- <journey-name>');
  console.error('example: npm run dev:record -- construire');
  process.exit(1);
}

// Keep the name filesystem-safe; it also becomes part of the scenario name.
const name = rawName.replace(/[^a-zA-Z0-9._-]/g, '-');

const root = path.join(__dirname, '..');
const server = path.join(root, 'dist', 'server', 'server.js');
if (!fs.existsSync(server)) {
  console.error(`[dev:record] ${server} is missing — run "npm run build" first.`);
  process.exit(1);
}

const logsDir = path.join(root, 'logs');
fs.mkdirSync(logsDir, { recursive: true });

// UTC, and seconds included: two captures of the same journey in one minute is
// a normal thing to do, and silently appending to the previous file would merge
// two sessions into one unusable log.
const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const logFile = path.join(logsDir, `capture-${name}-${stamp}.ndjson`);
const rel = path.relative(root, logFile).split(path.sep).join('/');

console.log('');
console.log('  ┌─ RDO CAPTURE MODE ────────────────────────────────────────────');
console.log(`  │  journey : ${name}`);
console.log(`  │  log     : ${rel}`);
console.log('  │');
console.log('  │  Play the journey in ONE page load — a reload starts a new');
console.log('  │  gateway session and the converter will ask which one you meant.');
console.log('  │  Stop the server (Ctrl-C) when the journey is done, then:');
console.log('  │');
console.log(`  │    npm run capture:convert -- ${rel} --name ${name}`);
console.log('  └───────────────────────────────────────────────────────────────');
console.log('');

// Same flags as `npm start`, so capture mode differs from a normal run by the
// log destination and nothing else.
const child = spawn(process.execPath, ['--disable-warning=DEP0040', server], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    LOG_LEVEL: 'debug',
    LOG_JSON: 'true',
    LOG_FILE: logFile,
  },
});

child.on('error', err => {
  console.error(`[dev:record] could not start the gateway: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  let size = 0;
  try { size = fs.statSync(logFile).size; } catch { /* never written */ }

  console.log('');
  if (size === 0) {
    console.log(`[dev:record] ⚠ ${rel} is empty — nothing was captured.`);
  } else {
    console.log(`[dev:record] captured ${(size / 1024).toFixed(1)} kB → ${rel}`);
    console.log(`[dev:record] convert with:  npm run capture:convert -- ${rel} --name ${name}`);
  }
  process.exit(signal ? 0 : (code ?? 0));
});
