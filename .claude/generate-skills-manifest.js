#!/usr/bin/env node
/**
 * generate-skills-manifest.js
 * Rebuilds skills/manifest.json from what is actually on disk.
 *
 * The manifest is documentation, not a discovery mechanism — Claude Code finds
 * skills by scanning for SKILL.md. It exists so the installed set stays auditable.
 *
 * Provenance (author/stars/githubUrl) is preserved verbatim from the previous
 * manifest and never invented: skills the installer did not record are emitted
 * with "provenance": "unrecorded".
 *
 * Usage: node .claude/generate-skills-manifest.js [--check]
 *   --check  exit 1 if the manifest is stale (for CI); writes nothing
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, 'skills');
const MANIFEST = path.join(SKILLS_DIR, 'manifest.json');

/**
 * Skills authored for this repo rather than installed from a marketplace.
 * Sourced from the CLAUDE.md project-skills table, plus skills whose SKILL.md
 * references project-only identifiers (RDO, Starpeace, SPO-Original, src/*).
 */
const PROJECT_SKILLS = new Set([
  'delphi-archaeologist',
  'dependencies',
  'e2e-test',
  'mobile-ux-optimizer',
  'rdo-network-resilience',
  'spo-testing',
  'web-games',
  'zustand-store-ts',
]);

/** Extract a frontmatter scalar (handles bare, quoted and `|`/`>` block forms). */
function readFrontmatter(skillMd) {
  const text = fs.readFileSync(skillMd, 'utf8');
  const lines = text.split(/\r?\n/);
  if (lines[0].trim() !== '---') return {};

  const end = lines.indexOf('---', 1);
  if (end < 0) return {};

  const out = {};
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    let [, key, value] = m;
    if (value === '|' || value === '>' || value === '|-' || value === '>-') {
      // Block scalar: take the indented lines that follow.
      const block = [];
      for (let j = i + 1; j < end && /^\s+\S/.test(lines[j]); j++) block.push(lines[j].trim());
      value = block.join(' ');
    }
    out[key] = value.replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

function buildManifest(previous) {
  const prevByName = new Map((previous.skills || []).map(s => [s.name, s]));

  const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  const skills = dirs.map(name => {
    const skillMd = path.join(SKILLS_DIR, name, 'SKILL.md');
    const fm = fs.existsSync(skillMd) ? readFrontmatter(skillMd) : {};
    const prev = prevByName.get(name);

    const entry = {
      name,
      skillName: fm.name || name,
      origin: PROJECT_SKILLS.has(name) ? 'project' : 'community',
      path: `.claude/skills/${name}`,
      hasSkillMd: fs.existsSync(skillMd),
    };

    if (prev && prev.githubUrl) {
      // Preserve recorded provenance exactly as the installer wrote it.
      entry.author = prev.author;
      entry.stars = prev.stars;
      entry.githubUrl = prev.githubUrl;
      // On a rebuild, prev.skillName already holds the normalised name — keep the
      // upstream name recorded by the original install so it survives re-runs.
      entry.upstreamName = prev.upstreamName || prev.skillName;
    } else if (entry.origin === 'community') {
      entry.provenance = 'unrecorded';
    }

    return entry;
  });

  return {
    version: '1.1.0',
    installedAt: previous.installedAt,
    generatedAt: new Date().toISOString(),
    source: previous.source,
    generator: '.claude/generate-skills-manifest.js',
    counts: {
      total: skills.length,
      project: skills.filter(s => s.origin === 'project').length,
      community: skills.filter(s => s.origin === 'community').length,
      withRecordedProvenance: skills.filter(s => s.githubUrl).length,
    },
    skills,
  };
}

function main() {
  const check = process.argv.includes('--check');
  const previous = fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    : { version: '1.0.0', skills: [] };

  const next = buildManifest(previous);

  if (check) {
    const a = JSON.stringify({ ...next, generatedAt: null });
    const b = JSON.stringify({ ...previous, generatedAt: null });
    if (a !== b) {
      console.error(`Manifest is stale: ${next.counts.total} skills on disk, ` +
        `${(previous.skills || []).length} in manifest. Run without --check to rebuild.`);
      process.exit(1);
    }
    console.log(`Manifest up to date (${next.counts.total} skills).`);
    return;
  }

  // LF endings + trailing newline to satisfy .gitattributes.
  fs.writeFileSync(MANIFEST, JSON.stringify(next, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8');
  console.log(`Wrote ${next.counts.total} skills ` +
    `(${next.counts.project} project, ${next.counts.community} community, ` +
    `${next.counts.withRecordedProvenance} with recorded provenance).`);
}

main();
