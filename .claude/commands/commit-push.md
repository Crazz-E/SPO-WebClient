---
description: Commit and push only the changes made during the current session
argument-hint: "[commit message]"
allowed-tools: Bash(git status*), Bash(git diff*), Bash(git log*), Bash(git add*), Bash(git commit*), Bash(git push*), Bash(git branch*), Bash(npm run gate*), Bash(npm run finish*), Bash(gh pr *), Read, Grep, Glob
---

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

Always end with the Co-Authored-By trailer the harness prescribes for the running model
(e.g. `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`). Use a HEREDOC to pass
the commit message:
```bash
git commit -m "$(cat <<'EOF'
type: short summary

Co-Authored-By: Claude <model> <noreply@anthropic.com>
EOF
)"
```

### 5. Gate (REQUIRED before any push)

The push is blocked by `.claude/hooks/pre-push-gate.sh` unless the **bench worker** has
attested HEAD (PASS, fingerprint-stable, this worktree, < 60 min). Run the gate **after**
committing, so the attestation matches the sha being pushed, and run it **in the
background** — it queues a bench job and waits, possibly behind other sessions' jobs:

```bash
npm run gate
```

It prechecks locally (typecheck -> lint -> tests), then the worker builds this worktree,
replays the static stages, applies the President exclusion and routing, drives the L2
flows live against planitia, writes `report/e2e/gate-<sha>.json` here and the attestation
in `~/.spo-bench/verdicts/`. `WORKER DOWN` (exit 3) means the bench itself needs
attention — `systemctl --user restart spo-bench-worker` — not the change.

Handle the outcome by verdict — the rules are [doc/E2E-POLICY.md](../../doc/E2E-POLICY.md) sections 7-8:

| Verdict | Do |
|---|---|
| `PASS` | Continue to step 6 |
| `BLOCKED` + President members | **Stop and tell the developer.** Name the members and the flow to exercise by hand. Never mark it verified yourself. Re-run with `npm run gate -- --manual-verified="..."` only after they confirm |
| `BLOCKED` + dirty world | Not a test failure — nothing ran. Clear the (machine-global) dirty world with `npm run e2e:unlock` after a human restored it |
| `STALE` | The tree changed while the job was queued or running. Not an attempt. Resubmit `npm run gate` on the tree you mean |
| `DIRTY` (or exit 2 `DIRTY TREE` at deposit) | Uncommitted or untracked changes in the worktree. A gate attests HEAD by sha, so nothing ran. Commit (or stash) first, then resubmit — not an attempt |
| `ENVIRONMENT` | The servers were not in a state to judge the change. Retry with backoff; **does not** count as one of the three attempts |
| `FAIL` | Diagnose, write the hypothesis, fix, commit, re-run. **Three attempts maximum, each naming a different root cause.** Never edit a test that was failing in order to make it pass |

After the third failed attempt: push the branch, open a **draft** PR titled `blocked: ...`
with the three hypotheses and the evidence, append the report to
[doc/BACKLOG-OPEN.md](../../doc/BACKLOG-OPEN.md), and hand back. Do not merge.

### 6. Push

Push to the current branch with the `-u` flag:
```bash
git push -u origin HEAD
```

Then open (or refresh) the PR. `main` requires the branch to be **up to date**: if `main`
moved since your gate, `gh pr update-branch <n>` (or merge `origin/main` locally), commit,
and **run `npm run gate` again** — the new sha has no attestation of its own. A PR merges on
`typecheck + tests` + `bench/gate` only; nobody, the owner included, can bypass.

### 7. Merge, then finish

When both statuses are green (`gh pr checks <n>`), squash-merge (`gh pr merge <n> --squash
--delete-branch`; "`main` is already used by worktree" after a successful merge is not an
error — the merge happened, only the local checkout switch failed). Then, **as the very last
command**:

```bash
npm run finish
```

It refuses unless the PR is MERGED; fast-forwards `~/SPO-WebClient`, prunes refs, reinstalls
the worker if `src/e2e/bench/` or `scripts/bench-*` changed, removes this worktree and branch.
Nothing survives but `main`.

### 8. Report

Print a summary:
- Branch name
- Commit hash (short)
- Files changed (list)
- Gate verdict, the flows that ran, and each probe's log-line / restore result
- Push status (success/failure), PR number, merge commit
- `npm run finish` result: main at <sha>, worktree and branch gone
- Whether an L3 browser pass is still owed (the gate says so when the diff touches pixels)