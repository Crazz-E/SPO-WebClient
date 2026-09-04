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
| `CAPABILITY EXCEPTION` in a PASS | Not a failure: the server says the account lacks the role the touched members need (E2E-POLICY §7). Report the members and the checks in the PR body; nothing clears it. If the capability is GRANTED the gate fails closed — add the flow that drives the member |
| `BLOCKED` + dirty world | Not a test failure — nothing ran. Clear the (machine-global) dirty world with `npm run e2e:unlock` after a human restored it |
| `STALE` | The tree changed while the job was queued or running. Not an attempt. Resubmit `npm run gate` on the tree you mean |
| `DIRTY` (or exit 2 `DIRTY TREE` at deposit) | Uncommitted or untracked changes in the worktree. A gate attests HEAD by sha, so nothing ran. Commit (or stash) first, then resubmit — not an attempt |
| `ENVIRONMENT` | The servers were not in a state to judge the change. Retry with backoff; **does not** count as one of the three attempts |
| `FAIL` | Diagnose, write the hypothesis, fix, commit, re-run. **Three attempts maximum, each naming a different root cause.** Never edit a test that was failing in order to make it pass |

After the third failed attempt: push the branch, open a **draft** PR titled `blocked: ...`
with the three hypotheses and the evidence, post the report as a comment on the task's
issue and move its card to **Parked**
([doc/kanban-workflow.md](../../doc/kanban-workflow.md)), and hand back. Do not merge.

### 6. Push

Push to the current branch with the `-u` flag:
```bash
git push -u origin HEAD
```

Then open (or refresh) the PR. The branch is **not** required to be up to date with `main`
(that rule was removed 2026-08-24 — `doc/bench-worker.md` § The gate base). If `main` moved past your gate's
`baseMain`, the `bench/gate` status and the push hook *announce* it rather than refuse:
read the note and judge — if the incoming `main` touches the same ground, merge
`origin/main` in, commit, and **run `npm run gate` again**, because the new sha has no
attestation of its own. A PR merges on
`typecheck + tests` + `bench/gate` only; nobody, the owner included, can bypass.

### 7. Merge, then finish

When both statuses are green, merge. **Check once, do not poll**: your gate PASS *is*
the `bench/gate` status, and CI normally concluded while the gate was queued — run
`gh pr checks <n>` once, and only if something is genuinely pending re-read at ≥ 30 s
intervals with a deadline, never a tight loop
([doc/kanban-workflow.md § GitHub API discipline](../../doc/kanban-workflow.md)).
Then enqueue the merge: **`gh pr merge <n> --merge`, nothing else.** `main` has a merge
queue, so this *enqueues* and the queue lands it; GitHub deletes the branch itself. **Never
`--delete-branch`** — `gh` honours it the instant the entry is created, destroying it and
leaving the PR CLOSED unmerged (`doc/bench-worker.md` §12). The queue's method is `MERGE`, so
`--squash` would be overridden anyway. The command prints `! The merge strategy for main is
set by the merge queue` on stderr and exits **0**: expected and benign — judge on the exit
code, never on stderr text, and in doubt on one REST call,
`gh api repos/Crazz-Org/SPO-WebClient/pulls/<n> --jq '{state,merged}'` (`open` = enqueued).
("`main` is already used by worktree" is likewise not an error — the merge happened, only the
local checkout switch failed.) Then, **as the very last command**:

```bash
npm run finish
```

It refuses unless the PR is MERGED; fast-forwards `~/SPO-WebClient`, prunes refs, reinstalls
the worker if `src/e2e/bench/` or `scripts/bench-*` changed, then **retires** this worktree —
it stays usable while you are in it, and the next run reaps it once nobody is. Nothing
survives but `main`. You can keep working after it; `npm run finish -- --now` removes the
directory immediately instead.

### 8. Report

Print the gate verdict and attestation path (`~/.spo-bench/verdicts/<sha>.json`). On failure, add the job log path.