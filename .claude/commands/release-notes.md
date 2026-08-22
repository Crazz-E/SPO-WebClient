---
description: Generate release notes from git history since the last tag
argument-hint: "[version, e.g. 1.3.0]"
allowed-tools: Bash(git log*), Bash(git describe*), Bash(git tag*), Bash(git diff*), Bash(npm run release*), Read, Write, Edit
model: fable
---

# Generate Release Notes

Generate release notes from git history since the last tag.

If `$ARGUMENTS` provides a version number (e.g., `1.3.0`), run the full automated release process. Otherwise, just display formatted notes for review.

## Procedure

### 1. Find Last Tag

```bash
git describe --tags --abbrev=0
```

If no tags exist, use the initial commit as the starting point.

### 2. Collect Commits

```bash
git log <last-tag>..HEAD --oneline
```

### 3. Categorize by Conventional Commit Prefix

Parse each commit message and group by type:

| Prefix | Category |
|--------|----------|
| `feat:` | **Added** |
| `fix:` | **Fixed** |
| `refactor:`, `perf:` | **Changed** |
| `docs:` | **Documentation** |
| `test:`, `chore:`, `build:` | **Other** (only include if non-trivial) |

Commits that don't follow conventional format go into **Other**.

### 4. Format as Markdown

```markdown
## [version] — YYYY-MM-DD

### Added
- Feature description (from feat: commits)

### Fixed
- Bug fix description (from fix: commits)

### Changed
- Refactor/perf description

### Documentation
- Docs changes

### Other
- Non-trivial chore/test/build changes
```

Omit empty sections. Use today's date. If no version argument was given, use `[Unreleased]` as the version.

### 5. If Version Argument Provided

When `$ARGUMENTS` contains a version number (e.g., `1.3.0`):

1. Run the automated release script:
   ```bash
   node scripts/release.js $ARGUMENTS
   ```
   This updates: CHANGELOG.md, package.json, changelog-data.json, README.md, CLAUDE.md

2. Print the manual next steps. `main` takes PRs only (ruleset, no bypass) and the push
   hook refuses `main` outright, so the release rides a branch like any other change:
   ```
   Release $ARGUMENTS prepared. Next steps:
     git switch -c chore/release-$ARGUMENTS
     git add package.json package-lock.json electron/package.json electron/package-lock.json README.md CLAUDE.md CHANGELOG.md src/client/changelog-data.json
     git commit -m "chore: release v$ARGUMENTS"
     npm run gate                      # bench attestation for this sha (static only: manifests and docs)
     git push -u origin HEAD && gh pr create --fill
     # after CI + bench/gate are green and the PR is squash-merged:
     git fetch origin main && git tag -a v$ARGUMENTS -m "Release $ARGUMENTS" origin/main
     git push origin v$ARGUMENTS       # the tag triggers electron-release.yml
     gh release create v$ARGUMENTS --title "v$ARGUMENTS" --notes-file CHANGELOG-LATEST.md
   ```

### 6. If No Version Argument

Just display the formatted release notes for the user to review. No files are modified.