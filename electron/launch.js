#!/usr/bin/env node
// Cross-platform Electron launcher that clears ELECTRON_RUN_AS_NODE
// (VS Code sets this env var in its integrated terminal, which breaks require('electron'))
delete process.env.ELECTRON_RUN_AS_NODE;

const { execFileSync } = require('child_process');
const electronPath = require('electron');

try {
  execFileSync(electronPath, ['.'], {
    stdio: 'inherit',
    cwd: __dirname,
    env: process.env,
  });
} catch (err) {
  process.exit(err.status || 1);
}
