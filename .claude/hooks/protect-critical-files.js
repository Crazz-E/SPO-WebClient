/**
 * PreToolUse hook: Protects critical files from accidental Edit/Write.
 *
 * Two protection layers:
 *   1. Static patterns (per CLAUDE.md): rdo-types.ts, rdo.ts, __fixtures__, facility_db.csv
 *   2. Dynamic patterns from .claude/validated-modules.json (the /validate system)
 *
 * Returns "ask" permission decision so the user gets a confirmation prompt.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const STATIC_PROTECTED_PATTERNS = [
  /rdo-types\.ts$/,
  /[/\\]rdo\.ts$/,
  /facility_db\.csv$/,
  /__fixtures__[/\\]/,
];

/**
 * Load validated module file paths + test paths from the registry.
 * Returns { patterns: RegExp[], moduleInfo: Map<string, { name, date }> }
 */
function loadValidatedModules() {
  const patterns = [];
  const moduleInfo = new Map();

  try {
    const registryPath = path.join(__dirname, '..', 'validated-modules.json');
    const raw = fs.readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(raw);

    for (const [name, entry] of Object.entries(registry.modules || {})) {
      // Protect the module's own files
      for (const filePath of entry.files || []) {
        const escaped = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '[/\\\\]');
        const re = new RegExp(escaped + '$');
        patterns.push(re);
        moduleInfo.set(re.source, { name, date: entry.validatedAt, type: entry.type });
      }

      // Protect associated test files/directories
      if (entry.tests) {
        const testsPath = entry.tests;
        const escaped = testsPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '[/\\\\]');
        // If tests points to a directory, match anything inside it; if a file, match exactly
        const isDir = !testsPath.match(/\.\w+$/);
        const re = isDir
          ? new RegExp(escaped + '[/\\\\]')
          : new RegExp(escaped + '$');
        patterns.push(re);
        moduleInfo.set(re.source, { name, date: entry.validatedAt, type: entry.type, isTest: true });
      }
    }
  } catch {
    // Registry doesn't exist or is invalid — no dynamic patterns
  }

  return { patterns, moduleInfo };
}

const { patterns: dynamicPatterns, moduleInfo } = loadValidatedModules();
const ALL_PATTERNS = [...STATIC_PROTECTED_PATTERNS, ...dynamicPatterns];

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const filePath = (input.tool_input?.file_path || '').replace(/\\/g, '/');

    // Check static patterns first
    const staticMatch = STATIC_PROTECTED_PATTERNS.some((p) => p.test(filePath));
    if (staticMatch) {
      const shortName = filePath.split('/').slice(-2).join('/');
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'ask',
            permissionDecisionReason:
              `Protected file: ${shortName} — This file is critical per CLAUDE.md. Review changes carefully before approving.`,
          },
        })
      );
      process.exit(0);
      return;
    }

    // Check validated module patterns
    for (const pattern of dynamicPatterns) {
      if (pattern.test(filePath)) {
        const info = moduleInfo.get(pattern.source);
        const shortName = filePath.split('/').slice(-2).join('/');
        const dateStr = info?.date ? info.date.split('T')[0] : 'unknown';
        const label = info?.isTest ? 'Test file for validated module' : 'Validated module';
        const typeLabel = info?.type === 'visual' ? ' (visual)' : '';

        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'ask',
              permissionDecisionReason:
                `${label}: ${shortName}${typeLabel} — Part of "${info?.name}" validated on ${dateStr}. Approve edit or use /validate --remove ${info?.name} first.`,
            },
          })
        );
        process.exit(0);
        return;
      }
    }

    // Non-protected files: exit 0 with no output = allow
  } catch {
    // Parse error: don't block — allow the tool call
  }
  process.exit(0);
});
