#!/usr/bin/env node
/**
 * SkillsMP Installer for SPO-WebClient
 * Searches and installs skills from skillsmp.com
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'sk_live_skillsmp_Y-DcREuip4XIpakL7dMNRMVZvQSO81aqE6JI-8LODBg';
const API_BASE = 'https://skillsmp.com/api/v1';
const SKILLS_DIR = path.join(__dirname, 'skills');

// Required skills for SPO-WebClient
const REQUIRED_SKILLS = [
  // Core development
  { query: 'typescript strict', name: 'typescript' },
  { query: 'nodejs backend architecture', name: 'nodejs-backend' },
  { query: 'jest testing coverage', name: 'jest-testing' },
  { query: 'security audit OWASP', name: 'security-auditor' },
  { query: 'memory optimization profiling', name: 'memory-optimization' },
  { query: 'protocol reverse engineering', name: 'protocol-reverse-engineering' },
  { query: 'web performance optimization', name: 'web-performance' },
  { query: 'git workflow conventional commits', name: 'git-workflow' },
  { query: 'debugging systematic', name: 'debugging' },
  { query: 'e2e testing playwright', name: 'e2e-testing' },
  { query: 'refactoring SOLID patterns', name: 'refactoring' },
  { query: 'claude md improver', name: 'claude-md-improver' },
  // Workflow & context - Added 2026-02-16
  { query: 'claude-code-workflow ilude', name: 'claude-code-workflow' },
  { query: 'context-master josiahsiegel', name: 'context-master' },
  { query: 'agentic-jumpstart-testing webdevcody', name: 'agentic-jumpstart-testing' },
  { query: 'mobile-design davila7', name: 'mobile-design' },
  { query: 'mobile-ux-optimizer erichowens', name: 'mobile-ux-optimizer' },
  { query: 'docs-codebase vasilyu1983', name: 'docs-codebase' },
  // Game rendering & performance - Added 2026-02-16
  { query: 'r3f-performance bbeierle12', name: 'r3f-performance' },
  { query: 'web-games kjibba', name: 'web-games' },
  { query: 'webgl-expert ronnycoding', name: 'webgl-expert' },
  // React UI framework - Added 2026-02-26
  { query: 'store-data-structures lobehub zustand', name: 'store-data-structures' },
  { query: 'react-state-management zustand', name: 'react-state-management' },
  { query: 'accessibility-compliance WCAG aria', name: 'accessibility-compliance' },
  { query: 'accessibility-auditor design', name: 'accessibility-auditor' },
  { query: 'zustand-store-ts typescript', name: 'zustand-store-ts' },
  { query: 'react-expert hooks component patterns', name: 'react-expert' },
  { query: 'react-patterns best practices', name: 'react-patterns' },
  { query: 'pwa-development progressive web app', name: 'pwa-development-v2' },
  { query: 'react-best-practices skillcreatorai', name: 'react-best-practices' },
  { query: 'design-system-patterns tokens components', name: 'design-system-patterns' },
  { query: 'interaction-design user experience', name: 'interaction-design' },
  { query: 'animation micro-interaction pack', name: 'animation-micro-interaction-pack' },
  { query: 'ui-ux-pro-max design', name: 'ui-ux-pro-max' },
  { query: 'pwa-expert service worker', name: 'pwa-expert' },
  { query: 'web-accessibility screen reader', name: 'web-accessibility' },
];

/**
 * Make API request to skillsmp.com
 */
function apiRequest(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString();
    const url = `${API_BASE}${endpoint}?${query}`;

    const options = {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'User-Agent': 'SPO-WebClient-SkillsMP-Installer/1.0.0'
      }
    };

    https.get(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success) {
            resolve(json.data);
          } else {
            reject(new Error(json.error?.message || 'API request failed'));
          }
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${err.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Download file from GitHub raw URL
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });

      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Search and install a skill
 */
async function installSkill(skillConfig) {
  console.log(`\n🔍 Searching for: ${skillConfig.name} (query: "${skillConfig.query}")`);

  try {
    const results = await apiRequest('/skills/search', {
      q: skillConfig.query,
      limit: 5,
      sortBy: 'stars'
    });

    if (results.skills.length === 0) {
      console.log(`   ❌ No skills found for "${skillConfig.query}"`);
      return null;
    }

    // Pick the skill with most stars
    const skill = results.skills.reduce((best, current) =>
      (current.stars > best.stars) ? current : best
    );

    console.log(`   ✅ Found: ${skill.name} by ${skill.author} (⭐ ${skill.stars})`);
    console.log(`      URL: ${skill.githubUrl}`);

    // Convert GitHub URL to raw content URL for SKILL.md
    const rawUrl = skill.githubUrl
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/tree/', '/')
      + '/SKILL.md';

    // Create skill directory
    const skillDir = path.join(SKILLS_DIR, skillConfig.name);
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    const destPath = path.join(skillDir, 'SKILL.md');

    console.log(`   📥 Downloading ${rawUrl}...`);
    await downloadFile(rawUrl, destPath);

    console.log(`   ✅ Installed to ${destPath}`);

    return {
      name: skillConfig.name,
      skillName: skill.name,
      author: skill.author,
      stars: skill.stars,
      path: destPath,
      githubUrl: skill.githubUrl
    };
  } catch (err) {
    console.error(`   ❌ Error installing ${skillConfig.name}: ${err.message}`);
    return null;
  }
}

/**
 * Main installation process
 */
async function main() {
  console.log('🚀 SkillsMP Installer for SPO-WebClient');
  console.log('========================================\n');

  // Create skills directory
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }

  const installed = [];
  const failed = [];

  for (const skillConfig of REQUIRED_SKILLS) {
    const result = await installSkill(skillConfig);
    if (result) {
      installed.push(result);
    } else {
      failed.push(skillConfig.name);
    }

    // Rate limiting - wait 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n========================================');
  console.log('📊 Installation Summary');
  console.log('========================================\n');

  console.log(`✅ Installed: ${installed.length}/${REQUIRED_SKILLS.length} skills`);
  installed.forEach(skill => {
    console.log(`   - ${skill.name}: ${skill.skillName} by ${skill.author} (⭐ ${skill.stars})`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length} skills`);
    failed.forEach(name => {
      console.log(`   - ${name}`);
    });
  }

  // Write manifest
  const manifest = {
    version: '1.0.0',
    installedAt: new Date().toISOString(),
    source: 'skillsmp.com',
    skills: installed
  };

  fs.writeFileSync(
    path.join(SKILLS_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`\n✅ Manifest written to ${path.join(SKILLS_DIR, 'manifest.json')}`);
  console.log('\n🎉 Installation complete!');
}

// Run
main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
