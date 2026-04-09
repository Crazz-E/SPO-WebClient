# Commit and Push Current Session Changes

Commit and push ONLY changes made during the current session.

If `$ARGUMENTS` is provided, use it as the commit message instead of generating one.

## Procedure

### 1. Inspect Changes

Run these in parallel:
- `git status` — see all changed/untracked files
- `git diff` — review staged and unstaged changes
- `git log --oneline -5` — see recent commit message style

### 2. Safety Checks

- **If on `main` branch**: WARN the user and ask for explicit confirmation before proceeding. Do NOT continue without their approval.
- **Never** use `--force` or `--force-with-lease` on push
- **Skip** any `.env`, `credentials`, or secret files — warn the user if they exist in the changeset
- **Skip** `.claude/settings.local.json` — this is a local-only config file

### 3. Stage Files

Use `git add <specific files>` for each file — do NOT use `git add .` or `git add -A`.

Only stage files that were meaningfully changed during this session. Skip generated files, local configs, and secrets.

### 4. Commit

If `$ARGUMENTS` was provided, use it as the commit message. Otherwise, generate a conventional commit message following the project style:

Format: `type: short summary`

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`

Always include the Co-Authored-By trailer:

```
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

Use a HEREDOC to pass the commit message:
```bash
git commit -m "$(cat <<'EOF'
type: short summary

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 5. Push

Push to the current branch with the `-u` flag:
```bash
git push -u origin HEAD
```

### 6. Report

Print a summary:
- Branch name
- Commit hash (short)
- Files changed (list)
- Push status (success/failure)