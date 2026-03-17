#!/usr/bin/env node
// Cross-platform electron-builder wrapper
// Disables code signing auto-discovery when no certificate is configured
if (!process.env.CSC_LINK && !process.env.WIN_CSC_LINK) {
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
}

const { execSync } = require('child_process');
try {
  execSync('npx electron-builder', {
    stdio: 'inherit',
    cwd: __dirname,
    env: process.env,
  });
} catch (err) {
  process.exit(err.status || 1);
}
