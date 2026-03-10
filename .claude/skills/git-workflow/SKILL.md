---
name: Git
slug: git
version: 1.0.2
description: "TRIGGER: When managing branches, resolving conflicts, or planning releases. Covers feature/, fix/ conventions."
---

## When to Use

User needs Git expertise — from basic operations to complex workflows. Agent handles branching, merging, rebasing, conflict resolution, and team collaboration patterns.

## Quick Reference

| Topic | File |
|-------|------|
| Branch strategies | `branching.md` |
| Conflict resolution | `conflicts.md` |
| History and recovery | `history.md` |
| Team workflows | `collaboration.md` |

## Push Safety

- Use `git push --force-with-lease` instead of `--force` — prevents overwriting others' work
- If push rejected, run `git pull --rebase` before retrying
- Never force push to main/master branch

## Commit Messages

- Use conventional commit format: `type(scope): description`
- Keep first line under 72 characters
- Include scope only if project uses it consistently

## Conflict Resolution

- After editing conflicted files, verify no markers remain: `grep -r "<<<\|>>>\|===" .`
- Test that code builds before completing merge
- If merge becomes complex, abort with `git merge --abort` and try `git rebase` instead

## Branch Hygiene

- Delete merged branches locally: `git branch -d branch-name`
- Before creating PR, rebase feature branch onto latest main
- Use `git rebase -i` to squash messy commits before pushing

## Recovery Commands

- Undo last commit keeping changes: `git reset --soft HEAD~1`
- Discard unstaged changes: `git restore filename`
- Use `git add -p` for partial staging when commit mixes multiple changes

## Common Traps

- Verify git user.email matches expected committer before important commits
- Empty directories aren't tracked — add `.gitkeep` if needed
- With submodules, always clone with `--recurse-submodules`
- Check if remote branch was deleted before trying to push to it

## Safety Checklist

Before destructive operations:
- [ ] Is this a shared branch? → Don't rewrite history
- [ ] Do I have uncommitted changes? → Stash or commit first
- [ ] Am I on the right branch? → `git branch` to verify
- [ ] Is remote up to date? → `git fetch` first
