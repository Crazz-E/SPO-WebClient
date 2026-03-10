# SkillsMP Skills Installation

**Installed:** 2026-02-16T13:59:54.202Z
**Source:** [skillsmp.com](https://skillsmp.com)
**API Key:** Configured (sk_live_skillsmp_...)

## Installed Skills (12 total)

All skills sourced from skillsmp.com marketplace using authenticated API search.

### Core Development

| Skill | Author | Stars | Purpose |
|-------|--------|-------|---------|
| **typescript** | prowler-cloud | 12,990 | TypeScript strict mode, generics, utility types |
| **nodejs-backend** | wshobson | 28,683 | Node.js backend architecture, async patterns, DI |
| **jest-testing** | supabase | 97,659 | Vitest/Jest testing, mocking, coverage >= 93% |

### Security & Quality

| Skill | Author | Stars | Purpose |
|-------|--------|-------|---------|
| **security-auditor** | jeremylongshore | 1,367 | OWASP Top 10 compliance checking |
| **memory-optimization** | jeremylongshore | 1,367 | Application profiling, memory leak detection |
| **debugging** | Shubhamsaboo | 95,384 | Systematic debugging, root cause analysis |
| **refactoring** | sickn33 | 9,848 | Codebase cleanup, SOLID patterns |

### Specialized

| Skill | Author | Stars | Purpose |
|-------|--------|-------|---------|
| **protocol-reverse-engineering** | wshobson | 28,683 | Network protocol analysis (for RDO) |
| **web-performance** | davila7 | 20,474 | Core Web Vitals, caching, runtime optimization |
| **e2e-testing** | affaan-m | 46,711 | Playwright E2E testing patterns |

### Workflow

| Skill | Author | Stars | Purpose |
|-------|--------|-------|---------|
| **git-workflow** | openclaw | 1,036 | Conventional commits, PR workflows |
| **claude-md-improver** | anthropics | 7,492 | Audit & improve CLAUDE.md files |

## Usage

Skills are automatically loaded by Claude Code from this directory. Each skill is invoked when:

1. **User explicitly mentions the skill domain** (e.g., "optimize performance", "run security audit")
2. **Task context matches skill expertise** (e.g., TypeScript errors → typescript skill)
3. **Skill trigger patterns match** (defined in each SKILL.md front matter)

## Manifest

See [manifest.json](manifest.json) for full installation metadata including:
- Exact GitHub URLs for each skill
- Installation timestamps
- Star counts at installation time
- Local file paths

## Updating Skills

To update all skills to latest versions:

```bash
node .claude/skillsmp-installer.js
```

This will re-download all skills from skillsmp.com using the same search queries.

## Adding More Skills

Edit `.claude/skillsmp-installer.js` and add to the `REQUIRED_SKILLS` array:

```javascript
{ query: 'your search query', name: 'skill-directory-name' }
```

Then run the installer script.

## API Documentation

Skills sourced via skillsmp.com API:
- Endpoint: `https://skillsmp.com/api/v1/skills/search`
- Authentication: Bearer token (configured in installer script)
- Sorting: By GitHub stars (highest quality skills)

## License

Each skill maintains its own license. See individual GitHub repositories for details.