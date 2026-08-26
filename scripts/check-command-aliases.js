#!/usr/bin/env node

/**
 * A future edit to .claude/commands/next-task.md can re-introduce exactly the shape the
 * command was written to remove: a derivation (`gh api`, `date +`, a raw commit sha) or a
 * bash-fence line that is not one of the sanctioned prefixes. Nothing else in CI reads this
 * file's prose, so nothing else would catch that regression. This does, mechanically:
 *
 *   1. Every `npm run <alias>` token names a real script in package.json.
 *   2. Every non-blank, non-comment line inside a ```bash fence starts with a sanctioned
 *      command — `npm run …`, a handful of `gh` and `git` forms.
 *   3. Outside all fences, the prose carries no derivation: no `gh api`, `gh project`,
 *      `git rev-parse`, `date +`, and no 40-character hex literal (a raw commit sha).
 *
 * Markdown inline code (single backticks) that merely NAMES a forbidden thing in a sentence
 * about it — "raw `gh api graphql` deliberately still prompts" — is not a violation: assertion
 * 3 strips inline-code spans before testing a prose line.
 *
 * On any failure, prints the offending line with its line number and exits 1. On success,
 * prints one short OK line and exits 0.
 *
 *   node scripts/check-command-aliases.js [path-to-next-task.md]
 */

const fs = require('fs');
const path = require('path');

const COMMAND_FILE = process.argv[2] || path.join(__dirname, '..', '.claude', 'commands', 'next-task.md');
const PACKAGE_JSON = path.join(__dirname, '..', 'package.json');

const SANCTIONED_PREFIXES = [
  'npm run ',
  'gh pr checks',
  'gh pr create',
  'gh pr merge',
  'gh pr view',
  'gh issue comment',
  'gh issue create',
  'git commit -F',
  'git diff',
  'git merge',
  'git push',
  'git status',
];

const FORBIDDEN_PROSE_PATTERNS = [
  { name: 'gh api', re: /\bgh api\b/ },
  { name: 'gh project', re: /\bgh project\b/ },
  { name: 'git rev-parse', re: /\bgit rev-parse\b/ },
  { name: 'date +', re: /\bdate \+/ },
  { name: '40-character hex literal', re: /\b[0-9a-f]{40}\b/i },
];

const ALIAS_PATTERN = /npm run ([\w:.-]+)/g;

/** Strip `single-backtick` inline-code spans so a line that merely names a forbidden thing
 * in prose ("raw `gh api graphql` deliberately still prompts") does not read as using it. */
function stripInlineCode(line) {
  return line.replace(/`[^`]*`/g, '');
}

function checkAliasesExist(lines, scripts) {
  const failures = [];
  lines.forEach((line, i) => {
    let match;
    ALIAS_PATTERN.lastIndex = 0;
    while ((match = ALIAS_PATTERN.exec(line))) {
      const alias = match[1];
      if (!Object.prototype.hasOwnProperty.call(scripts, alias)) {
        failures.push(`next-task.md:${i + 1}: npm run ${alias} — no such script in package.json`);
      }
    }
  });
  return failures;
}

function checkFences(lines) {
  const failures = [];
  let inFence = false;
  let fenceTag = null;
  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const fenceMatch = rawLine.match(/^\s*```(\S*)/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceTag = fenceMatch[1].trim().toLowerCase();
      } else {
        inFence = false;
        fenceTag = null;
      }
      return;
    }
    if (!inFence || fenceTag !== 'bash') return;
    const trimmed = rawLine.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    if (!SANCTIONED_PREFIXES.some(p => trimmed.startsWith(p))) {
      failures.push(`next-task.md:${lineNo}: ${trimmed} — not a sanctioned command`);
    }
  });
  return failures;
}

function checkProse(lines) {
  const failures = [];
  let inFence = false;
  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const fenceMatch = rawLine.match(/^\s*```/);
    if (fenceMatch) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const stripped = stripInlineCode(rawLine);
    for (const { name, re } of FORBIDDEN_PROSE_PATTERNS) {
      if (re.test(stripped)) {
        failures.push(`next-task.md:${lineNo}: contains ${name} — ${rawLine.trim()}`);
      }
    }
  });
  return failures;
}

function main() {
  let text;
  try {
    text = fs.readFileSync(COMMAND_FILE, 'utf8');
  } catch (err) {
    console.error(`check-command-aliases — FAIL: could not read ${COMMAND_FILE}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  } catch (err) {
    console.error(`check-command-aliases — FAIL: could not read ${PACKAGE_JSON}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  const scripts = pkg.scripts ?? {};
  const lines = text.split('\n');

  const failures = [
    ...checkAliasesExist(lines, scripts),
    ...checkFences(lines),
    ...checkProse(lines),
  ];

  if (failures.length > 0) {
    console.error('check-command-aliases — FAIL:');
    for (const f of failures) console.error(`  ${f}`);
    return 1;
  }
  console.log('check-command-aliases — OK: aliases resolve, bash fences sanctioned, prose carries no derivation');
  return 0;
}

module.exports = { checkAliasesExist, checkFences, checkProse, stripInlineCode };

if (require.main === module) {
  process.exit(main());
}
