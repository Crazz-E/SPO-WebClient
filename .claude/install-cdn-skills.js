#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'sk_live_skillsmp_Y-DcREuip4XIpakL7dMNRMVZvQSO81aqE6JI-8LODBg';
const API_BASE = 'https://skillsmp.com/api/v1';
const SKILLS_DIR = path.join(__dirname, 'skills');

const SKILLS_TO_INSTALL = [
  { query: 'cloudflare anomalyco', name: 'cloudflare' },
  { query: 'high-perf-browser wondelai', name: 'high-perf-browser' },
  { query: 'advanced-caching-strategies majiayu000', name: 'advanced-caching-strategies' },
  { query: 'file-uploads sickn33', name: 'file-uploads' },
  { query: 'service-worker oakoss', name: 'service-worker' },
];

function apiRequest(endpoint, params) {
  return new Promise(function(resolve, reject) {
    const query = new URLSearchParams(params || {}).toString();
    const url = API_BASE + endpoint + '?' + query;
    https.get(url, {
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'User-Agent': 'SPO-Installer/1.0'
      }
    }, function(res) {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try {
          const j = JSON.parse(data);
          if (j.success) { resolve(j.data); }
          else { reject(new Error(j.error && j.error.message || 'fail')); }
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise(function(resolve, reject) {
    https.get(url, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const f = fs.createWriteStream(dest);
      res.pipe(f);
      f.on('finish', function() { f.close(); resolve(); });
      f.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  for (const sk of SKILLS_TO_INSTALL) {
    console.log('Searching: ' + sk.name);
    try {
      const results = await apiRequest('/skills/search', { q: sk.query, limit: 5, sortBy: 'stars' });
      if (!results.skills.length) { console.log('  NOT FOUND'); continue; }
      const skill = results.skills.reduce(function(b, c) { return c.stars > b.stars ? c : b; });
      console.log('  Found: ' + skill.name + ' by ' + skill.author + ' (' + skill.stars + ' stars)');
      const rawUrl = skill.githubUrl
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/tree/', '/') + '/SKILL.md';
      const dir = path.join(SKILLS_DIR, sk.name);
      fs.mkdirSync(dir, { recursive: true });
      await downloadFile(rawUrl, path.join(dir, 'SKILL.md'));
      console.log('  Installed to ' + dir);
    } catch(e) {
      console.log('  ERROR: ' + e.message);
    }
    await new Promise(function(r) { setTimeout(r, 500); });
  }
  console.log('Done!');
}
main();
