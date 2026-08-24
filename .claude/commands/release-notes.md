---
description: Preview the release notes the next merge to main will publish
allowed-tools: Bash(git log*), Bash(git describe*), Bash(git tag*), Bash(git diff*), Bash(node scripts/changelog.js*), Bash(npm run release:preview*)
model: fable
---

# Preview Release Notes

Preview-only. Nothing here releases anything: every merge to `main` is the release
(`.github/workflows/release.yml` derives the version from the last `v*` tag and
the conventional commits since it, builds, tags and publishes). Never create `v*` tags by hand.

## Procedure

```bash
node scripts/changelog.js --preview     # or: npm run release:preview
```

This prints what the next merge would publish: the derived version (`feat` → minor,
otherwise patch; nothing since the tag → skip) and the commits since the last `v*` tag
grouped by conventional prefix:

| Prefix | Category |
|--------|----------|
| `feat:` | **Added** |
| `fix:` | **Fixed** |
| `refactor:`, `perf:` | **Changed** |
| `docs:` | **Documentation** |
| `test:`, `chore:`, `build:`, non-conventional | dropped |

Show the output to the user for review. No file is modified. If a line reads badly, the fix
is a better PR title on the next change — not an edit to any changelog.
