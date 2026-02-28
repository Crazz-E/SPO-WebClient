/**
 * PreToolUse hook: Protects critical files from accidental Edit/Write.
 *
 * Reads JSON from stdin (Claude Code hook protocol), checks file_path
 * against protected patterns, and returns "ask" permission decision
 * so the user gets a confirmation prompt before the tool proceeds.
 *
 * Protected files (per CLAUDE.md):
 *   - src/shared/rdo-types.ts
 *   - src/server/rdo.ts
 *   - src/__fixtures__/**
 *   - facility_db.csv
 */
'use strict';

const PROTECTED_PATTERNS = [
  /rdo-types\.ts$/,
  /[/\\]rdo\.ts$/,
  /facility_db\.csv$/,
  /__fixtures__[/\\]/,
];

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const filePath = (input.tool_input?.file_path || '').replace(/\\/g, '/');

    const matched = PROTECTED_PATTERNS.some((p) => p.test(filePath));

    if (matched) {
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
    }
    // Non-protected files: exit 0 with no output = allow
  } catch {
    // Parse error: don't block — allow the tool call
  }
  process.exit(0);
});
