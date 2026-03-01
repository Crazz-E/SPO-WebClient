/**
 * PostToolUse hook: Runs targeted tests after edits to validated modules.
 *
 * Reads .claude/validated-modules.json and checks if the edited file belongs
 * to a validated module. If yes, runs that module's test suite.
 * If tests fail, exits non-zero so Claude receives feedback to fix the regression.
 *
 * For non-validated files, exits immediately with 0 (no overhead).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadRegistry() {
  try {
    const registryPath = path.join(__dirname, '..', 'validated-modules.json');
    const raw = fs.readFileSync(registryPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { version: 1, modules: {} };
  }
}

function normalizeToForwardSlash(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Find the validated module whose files or tests match the edited file path.
 * Returns { name, testPath } or null.
 */
function findMatchingModule(filePath, registry) {
  const normalized = normalizeToForwardSlash(filePath);

  for (const [name, entry] of Object.entries(registry.modules || {})) {
    // Check if edited file is one of the module's protected files
    for (const moduleFile of entry.files || []) {
      if (normalized.endsWith(normalizeToForwardSlash(moduleFile))) {
        return { name, testPath: entry.tests };
      }
    }

    // Check if edited file is the module's test file/directory
    if (entry.tests) {
      const testsNorm = normalizeToForwardSlash(entry.tests);
      if (normalized.includes(testsNorm)) {
        return { name, testPath: entry.tests };
      }
    }
  }

  return null;
}

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const filePath = input.tool_input?.file_path || '';

    if (!filePath) {
      process.exit(0);
      return;
    }

    const registry = loadRegistry();
    const match = findMatchingModule(filePath, registry);

    if (!match || !match.testPath) {
      // Not a validated module — no tests to run
      process.exit(0);
      return;
    }

    // Run the targeted test suite
    const testPattern = normalizeToForwardSlash(match.testPath);
    const cmd = `npx jest --no-coverage --testPathPatterns="${testPattern}"`;

    try {
      execSync(cmd, {
        cwd: path.join(__dirname, '..', '..'),
        stdio: 'pipe',
        timeout: 55000,
        env: {
          ...process.env,
          PATH: `/c/Program Files/nodejs:${process.env.PATH}`,
        },
      });
      // Tests passed — write success info to stderr (not stdout, which is for hook protocol)
      process.stderr.write(`[validate] Tests passed for validated module "${match.name}"\n`);
      process.exit(0);
    } catch (execErr) {
      // Tests failed — exit non-zero so Claude gets the failure signal
      const output = (execErr.stdout || '').toString().slice(-500);
      process.stderr.write(
        `[validate] REGRESSION DETECTED in validated module "${match.name}"!\n` +
        `Test suite: ${match.testPath}\n` +
        `${output}\n` +
        `Fix the regression before continuing.\n`
      );
      process.exit(1);
    }
  } catch {
    // Parse error or unexpected issue — don't block
    process.exit(0);
  }
});
