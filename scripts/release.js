#!/usr/bin/env node

/**
 * Release script — bumps version, generates CHANGELOG.md and changelog-data.json.
 *
 * Usage: node scripts/release.js <version>
 * Example: node scripts/release.js 0.2.0
 *
 * After running, follow the printed instructions to commit, tag, and push.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const ELECTRON_PKG_PATH = path.join(ROOT, 'electron', 'package.json');
const README_PATH = path.join(ROOT, 'README.md');
const CLAUDE_MD_PATH = path.join(ROOT, 'CLAUDE.md');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
const CHANGELOG_JSON_PATH = path.join(ROOT, 'src', 'client', 'changelog-data.json');

// --- Helpers ---

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getLastTag() {
  try {
    return run('git describe --tags --abbrev=0');
  } catch {
    return null;
  }
}

function getCommitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const log = run(`git log ${range} --oneline --no-merges`);
  if (!log) return [];
  return log.split('\n').map((line) => {
    const spaceIdx = line.indexOf(' ');
    return {
      hash: line.slice(0, spaceIdx),
      message: line.slice(spaceIdx + 1),
    };
  });
}

/**
 * Parse a conventional commit message into { prefix, description }.
 * Returns null for messages that don't match.
 */
function parseCommit(message) {
  const match = message.match(/^(\w+)(?:\(.+?\))?:\s*(.+)$/);
  if (!match) return null;
  return { prefix: match[1], description: match[2] };
}

// Mapping from commit prefix to changelog category
const CATEGORY_MAP = {
  feat: 'Added',
  fix: 'Fixed',
  refactor: 'Changed',
  perf: 'Changed',
};

// Prefixes included in the player-facing changelog
const PLAYER_PREFIXES = new Set(['feat', 'fix', 'refactor', 'perf']);

// Prefixes included in the dev changelog but not player-facing
const DEV_ONLY_PREFIXES = new Set(['docs']);

function categorize(commits) {
  const categories = {};
  for (const commit of commits) {
    const parsed = parseCommit(commit.message);
    if (!parsed) continue;
    const section = CATEGORY_MAP[parsed.prefix];
    if (!section && !DEV_ONLY_PREFIXES.has(parsed.prefix)) continue;
    const cat = section || 'Documentation';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({ ...parsed, hash: commit.hash });
  }
  return categories;
}

// --- Markdown generation ---

function generateMarkdownSection(version, date, categories) {
  const lines = [`## [${version}] - ${date}`, ''];
  const order = ['Added', 'Fixed', 'Changed', 'Documentation'];
  for (const section of order) {
    const items = categories[section];
    if (!items || items.length === 0) continue;
    lines.push(`### ${section}`);
    for (const item of items) {
      lines.push(`- ${item.description}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function updateChangelog(version, date, categories) {
  const section = generateMarkdownSection(version, date, categories);

  if (fs.existsSync(CHANGELOG_PATH)) {
    const existing = fs.readFileSync(CHANGELOG_PATH, 'utf-8');
    // Insert after the "# Changelog" header
    const headerEnd = existing.indexOf('\n') + 1;
    const updated =
      existing.slice(0, headerEnd) + '\n' + section + existing.slice(headerEnd);
    fs.writeFileSync(CHANGELOG_PATH, updated, 'utf-8');
  } else {
    fs.writeFileSync(CHANGELOG_PATH, '# Changelog\n\n' + section, 'utf-8');
  }
}

// --- JSON generation (player-facing) ---

function updateChangelogJson(version, date, categories) {
  // Build entries from player-visible categories only
  const entries = [];
  const typeMap = { Added: 'added', Fixed: 'fixed', Changed: 'changed' };
  for (const [section, items] of Object.entries(categories)) {
    const type = typeMap[section];
    if (!type) continue; // skip Documentation etc.
    for (const item of items) {
      entries.push({ type, text: item.description });
    }
  }

  let releases = [];
  if (fs.existsSync(CHANGELOG_JSON_PATH)) {
    releases = JSON.parse(fs.readFileSync(CHANGELOG_JSON_PATH, 'utf-8'));
  }

  // Prepend new release (or replace if same version exists)
  releases = releases.filter((r) => r.version !== version);
  releases.unshift({ version, date, entries });

  fs.writeFileSync(CHANGELOG_JSON_PATH, JSON.stringify(releases, null, 2) + '\n', 'utf-8');
}

// --- Main ---

function main() {
  const newVersion = process.argv[2];
  if (!newVersion) {
    console.error('Usage: node scripts/release.js <version>');
    console.error('Example: node scripts/release.js 0.2.0');
    process.exit(1);
  }

  // Validate semver-ish
  if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
    console.error(`Invalid version format: ${newVersion}`);
    console.error('Expected format: MAJOR.MINOR.PATCH (e.g. 0.2.0, 1.0.0-beta.1)');
    process.exit(1);
  }

  const lastTag = getLastTag();
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
  const oldVersion = pkg.version;

  console.log(`Releasing: ${oldVersion} -> ${newVersion}`);
  console.log(`Last tag: ${lastTag || '(none)'}`);

  // Collect commits
  const commits = getCommitsSince(lastTag);
  if (commits.length === 0) {
    console.error('No commits found since last tag. Nothing to release.');
    process.exit(1);
  }
  console.log(`Found ${commits.length} commits since ${lastTag || 'beginning'}`);

  const categories = categorize(commits);
  const date = today();

  // 1. Update CHANGELOG.md
  updateChangelog(newVersion, date, categories);
  console.log('Updated CHANGELOG.md');

  // 2. Update changelog-data.json (player-facing)
  updateChangelogJson(newVersion, date, categories);
  console.log('Updated src/client/changelog-data.json');

  // 3. Bump package.json version
  pkg.version = newVersion;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  console.log(`Bumped package.json version to ${newVersion}`);

  // 4. Sync electron/package.json version
  if (fs.existsSync(ELECTRON_PKG_PATH)) {
    const electronPkg = JSON.parse(fs.readFileSync(ELECTRON_PKG_PATH, 'utf-8'));
    electronPkg.version = newVersion;
    fs.writeFileSync(ELECTRON_PKG_PATH, JSON.stringify(electronPkg, null, 2) + '\n', 'utf-8');
    console.log(`Synced electron/package.json version to ${newVersion}`);
  }

  // 5. Update README.md version badge
  if (fs.existsSync(README_PATH)) {
    const readme = fs.readFileSync(README_PATH, 'utf-8');
    const updatedReadme = readme.replace(/> \*\*Beta \d+\.\d+\.\d+\S*\*\*/, `> **Beta ${newVersion}**`);
    fs.writeFileSync(README_PATH, updatedReadme, 'utf-8');
    console.log(`Updated README.md version badge to Beta ${newVersion}`);
  }

  // 6. Update CLAUDE.md version reference
  if (fs.existsSync(CLAUDE_MD_PATH)) {
    const claudeMd = fs.readFileSync(CLAUDE_MD_PATH, 'utf-8');
    const updatedClaudeMd = claudeMd.replace(
      /\| RDO protocol \| Beta \d+\.\d+\.\d+\S*/,
      `| RDO protocol | Beta ${newVersion}`
    );
    fs.writeFileSync(CLAUDE_MD_PATH, updatedClaudeMd, 'utf-8');
    console.log(`Updated CLAUDE.md version to Beta ${newVersion}`);
  }

  // 7. Print next steps
  console.log('\n--- Next steps ---');
  console.log(`git add package.json electron/package.json README.md CLAUDE.md CHANGELOG.md src/client/changelog-data.json`);
  console.log(`git commit -m "chore: release v${newVersion}"`);
  console.log(`git tag v${newVersion}`);
  console.log(`git push --follow-tags`);
  console.log(`gh release create v${newVersion} --title "v${newVersion}" --notes-file CHANGELOG.md`);
}

main();
