---
name: dependency-updater
description: Smart dependency management for any language. Auto-detects project type, applies safe updates automatically, prompts for major versions, diagnoses and fixes dependency issues.
license: MIT
metadata:
  version: 1.0.0
---

# Dependency Updater

Smart dependency management for any language with automatic detection and safe updates.

---

## Quick Start

```
update my dependencies
```

The skill auto-detects your project type and handles the rest.

---

## Triggers

| Trigger | Example |
|---------|---------|
| Update dependencies | "update dependencies", "update deps" |
| Check outdated | "check for outdated packages" |
| Fix dependency issues | "fix my dependency problems" |
| Security audit | "audit dependencies for vulnerabilities" |
| Diagnose deps | "diagnose dependency issues" |

---

## Supported Languages

| Language | Package File | Update Tool | Audit Tool |
|----------|--------------|-------------|------------|
| **Node.js** | package.json | `taze` | `npm audit` |
| **Python** | requirements.txt, pyproject.toml | `pip-review` | `safety`, `pip-audit` |
| **Go** | go.mod | `go get -u` | `govulncheck` |
| **Rust** | Cargo.toml | `cargo update` | `cargo audit` |
| **Ruby** | Gemfile | `bundle update` | `bundle audit` |
| **Java** | pom.xml, build.gradle | `mvn versions:*` | `mvn dependency:*` |
| **.NET** | *.csproj | `dotnet outdated` | `dotnet list package --vulnerable` |

---

## Quick Reference

| Update Type | Version Change | Action |
|-------------|----------------|--------|
| **Fixed** | No `^` or `~` | Skip (intentionally pinned) |
| **PATCH** | `x.y.z` -> `x.y.Z` | Auto-apply |
| **MINOR** | `x.y.z` -> `x.Y.0` | Auto-apply |
| **MAJOR** | `x.y.z` -> `X.0.0` | Prompt user individually |

---

## Workflow

```
User Request
    |
    v
Step 1: DETECT PROJECT TYPE
  - Scan for package files (package.json, go.mod...)
  - Identify package manager

Step 2: CHECK PREREQUISITES
  - Verify required tools are installed
  - Suggest installation if missing

Step 3: SCAN FOR UPDATES
  - Run language-specific outdated check
  - Categorize: MAJOR / MINOR / PATCH / Fixed

Step 4: AUTO-APPLY SAFE UPDATES
  - Apply MINOR and PATCH automatically
  - Report what was updated

Step 5: PROMPT FOR MAJOR UPDATES
  - AskUserQuestion for each MAJOR update
  - Show current -> new version

Step 6: APPLY APPROVED MAJORS
  - Update only approved packages

Step 7: FINALIZE
  - Run install command
  - Run security audit
```

---

## Commands by Language

### Node.js (npm/yarn/pnpm)

```bash
# Check prerequisites
scripts/check-tool.sh taze "npm install -g taze"

# Scan for updates
taze

# Apply minor/patch
taze minor --write

# Apply specific majors
taze major --write --include pkg1,pkg2

# Monorepo support
taze -r  # recursive

# Security
npm audit
npm audit fix
```

### Python

```bash
pip list --outdated
pip-review --auto
pip install --upgrade package-name
pip-audit
safety check
```

### Go

```bash
go list -m -u all
go get -u ./...
go mod tidy
govulncheck ./...
```

### Rust

```bash
cargo outdated
cargo update
cargo audit
```

---

## Diagnosis Mode

When dependencies are broken, run diagnosis:

### Common Issues & Fixes

| Issue | Symptoms | Fix |
|-------|----------|-----|
| **Version Conflict** | "Cannot resolve dependency tree" | Clean install, use overrides/resolutions |
| **Peer Dependency** | "Peer dependency not satisfied" | Install required peer version |
| **Security Vuln** | `npm audit` shows issues | `npm audit fix` or manual update |
| **Unused Deps** | Bloated bundle | Run `depcheck` (Node) or equivalent |
| **Duplicate Deps** | Multiple versions installed | Run `npm dedupe` or equivalent |

### Emergency Fixes

```bash
# Node.js - Nuclear reset
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

---

## Security Audit

### Severity Response

| Severity | Action |
|----------|--------|
| **Critical** | Fix immediately |
| **High** | Fix within 24h |
| **Moderate** | Fix within 1 week |
| **Low** | Fix in next release |

---

## Anti-Patterns

| Avoid | Why | Instead |
|-------|-----|---------|
| Update fixed versions | Intentionally pinned | Skip them |
| Auto-apply MAJOR | Breaking changes | Prompt user |
| Batch MAJOR prompts | Loses context | Prompt individually |
| Skip lock file | Irreproducible builds | Always commit lock files |
| Ignore security alerts | Vulnerabilities | Address by severity |

---

## Verification Checklist

After updates:

- [ ] Updates scanned without errors
- [ ] MINOR/PATCH auto-applied
- [ ] MAJOR updates prompted individually
- [ ] Fixed versions untouched
- [ ] Lock file updated
- [ ] Install command ran
- [ ] Security audit passed (or issues noted)

---

## Version Strategies

### Semantic Versioning

```
MAJOR.MINOR.PATCH (e.g., 2.3.1)

MAJOR: Breaking changes - requires code changes
MINOR: New features - backward compatible
PATCH: Bug fixes - backward compatible
```

### Range Specifiers

| Specifier | Meaning | Example |
|-----------|---------|---------|
| `^1.2.3` | Minor + Patch OK | `>=1.2.3 <2.0.0` |
| `~1.2.3` | Patch only | `>=1.2.3 <1.3.0` |
| `1.2.3` | Exact (fixed) | Only `1.2.3` |
| `>=1.2.3` | At least | Any `>=1.2.3` |
| `*` | Any | Latest (dangerous) |

### Conflict Resolution (Node.js)

```bash
npm ls package-name      # See dependency tree
npm explain package-name # Why installed
```

**Resolution with overrides:**
```json
{
  "overrides": {
    "lodash": "^4.18.0"
  }
}
```

---

## Script Reference

| Script | Purpose |
|--------|---------|
| `scripts/check-tool.sh` | Verify tool is installed |
| `scripts/run-taze.sh` | Run taze with proper flags |

---

## Related Tools

| Tool | Language | Purpose |
|------|----------|---------|
| [taze](https://github.com/antfu-collective/taze) | Node.js | Smart dependency updates |
| [npm-check-updates](https://github.com/raineorshine/npm-check-updates) | Node.js | Alternative to taze |
| [pip-review](https://github.com/jgonggrijp/pip-review) | Python | Interactive pip updates |
| [cargo-edit](https://github.com/killercup/cargo-edit) | Rust | Cargo dependency management |
| [bundler-audit](https://github.com/rubysec/bundler-audit) | Ruby | Security auditing |
