# Kanban workflow — GitHub Projects is the backlog

**Single source of truth for all open work:**
[github.com/users/Crazz-E/projects/2](https://github.com/users/Crazz-E/projects/2)
(user project #2, Kanban). Every task is a **GitHub issue** on `Crazz-E/SPO-WebClient`,
added to the project. Draft items are not used.

The former documentary backlog (`doc/BACKLOG.md`, `doc/BACKLOG-OPEN.md`) is **retired and
deleted**; its full text stays readable at the archive permalink:
[`doc/BACKLOG-OPEN.md` @ `94b059a0`](https://github.com/Crazz-E/SPO-WebClient/blob/94b059a08caa5d834ce9e1fac6ac5f398b91943f/doc/BACKLOG-OPEN.md)
· [`doc/BACKLOG.md` @ `94b059a0`](https://github.com/Crazz-E/SPO-WebClient/blob/94b059a08caa5d834ce9e1fac6ac5f398b91943f/doc/BACKLOG.md).
`OB-N` identifiers survive as issue titles; new tasks get plain issue numbers.

## The board — six columns, one per milestone

The `Status` field is single-select: a task is in exactly one column.

| Column | Milestone | Enters when | Leaves when |
|---|---|---|---|
| 📥 **Todo** | Unowned pool | Issue created and added to the project. **Vertical order = priority**, maintained by the human — a session always takes the topmost unowned item. | A session claims it. |
| 🔨 **En cours** | Owned, in development | Session wrote its identity into `Session` and moved the card. Branch, implementation, tests. | Gate deposited, or released. |
| 🧪 **Gate** | `npm run gate` deposited on the bench worker | Implementation + tests done, gate queued. | Gate PASS → PR opened. Gate failure loops back to En cours (3 attempts max, then release). |
| 🔀 **PR** | Pull request open | PR opened with `Closes #N` in the body. CI + `bench/gate` statuses, merge. | Merge (issue auto-closes). |
| ✅ **Done** | Merged, released, finished | PR merged, release published, `npm run finish` run. Final synthetic comment posted. | Terminal. |
| 🚨 **À reclasser** | Ownership released on failure/abandon | Owner released the task with a **simple, non-technical explanation in French** as an issue comment. | **Human only**: reprioritises, clears `Session`, moves back to Todo (or closes). |

## Fields on each card

| Field | Kind | Meaning |
|---|---|---|
| `Session` | text | **The ownership marker.** Empty = claimable. Format: `<branch> @ <YYYY-MM-DD>` (e.g. `claude-crazz/mail-refresh-x1 @ 2026-08-24`). All sessions push as the same GitHub account, so the assignee cannot distinguish them — this field can. |
| `Catégorie` | single select | 🔴 Défaut · 🟠 Piège latent · 🟡 Feature/Manque · ⚪ Observation · 📚 Doc/Infra — named `Catégorie` because `Type` is a reserved field name on GitHub Projects |
| `Taille` | single select | S · M · L — rough estimate at creation, for scanning the pool. |

## The ownership law

1. **Ownership is sacred.** A card whose `Session` field is non-empty belongs to that
   session. No other session may take it, edit it, or work its scope — ever. There is no
   staleness timeout for sessions.
2. **Claiming is a handshake, not a write.** Read the board → write your identity into
   `Session` → **re-read the field**. If it holds someone else's identity, you lost the
   race: take the next item. Claim one card at a time.
3. **Every owner must close its ownership** — in success (→ Done) or in failure
   (→ À reclasser). A session that ends without doing either leaves a locked card; **only
   the human** may free it (clear `Session`, move back to Todo).
4. **Releasing a task** (failure, abandon, out of scope): move to À reclasser, keep
   `Session` filled (it is the trace), and post one issue comment explaining **in simple,
   non-technical French** why the task failed — what was attempted, what blocked it, in
   words a non-programmer follows. The human reclassifies from there.

## What a session writes on the board — and only this

Board writes happen at **state transitions only** — no running log, no progress notes.
Every write is very short.

| Moment | Writes |
|---|---|
| Claim | `Session` field + Status → En cours |
| Gate deposited | Status → Gate |
| PR opened | Status → PR (the PR link appears on the card automatically via `Closes #N`) |
| Merged + finished | Status → Done + **one final comment, 2–4 lines**: what changed, PR number, anything the human should know |
| Released | Status → À reclasser + the non-technical explanation comment |
| Gate attempt failed | Nothing on the board (Status stays Gate or returns to En cours); the detail lives in the PR/commits |

## Feeding rule (replaces the BACKLOG-OPEN feeding rule)

Every live-journey finding, investigation result, or defect discovered in passing **lands as
a new issue on the board**, in Todo (bottom — the human prioritises), with `Catégorie` set and a
synthetic body: what is wrong or missing, key `file:line` references, source (journey/date).
A finding that only lives in a session report is lost.

## Context discipline for sessions

- A good context stays **under ~250k tokens**. A session may deliberately exceed it when
  the task's goal justifies it — its call.
- Delegate heavy reads to sub-agents (screenshot reads are mandatory delegation; large
  inventories, cross-corpus audits, multi-file investigations should be).
- Compact deliberately: when the exploratory phase is over, summarise what matters and
  drop the rest.

## Model routing

- **Planning and analysis** (implementation plans, bug diagnosis, feature analysis) →
  **Fable 5**, with effort adapted to the difficulty.
- **Execution** (implementation, tests, mechanical sweeps, refactors) → **Opus 5**, with
  effort adapted.
- Whatever model the session was started with, it is entitled to switch to comply. If the
  harness cannot switch the session's own model, apply the routing to its **sub-agents**
  (`model: fable` / `model: opus` on the Agent tool or workflow `agent()` calls).

## gh CLI recipes

The project scope is required once per machine: `gh auth refresh -s project` (run inside WSL).

```bash
# List cards with status + session (topmost Todo first = priority order)
gh project item-list 2 --owner Crazz-E --format json \
  --jq '.items[] | {id, title: .content.title, number: .content.number, status: .status, session: .session}'

# Resolve project and field ids (needed for item-edit)
gh project view 2 --owner Crazz-E --format json --jq .id
gh project field-list 2 --owner Crazz-E --format json

# Move a card (single-select field, e.g. Status)
gh project item-edit --id <ITEM_ID> --project-id <PROJECT_ID> \
  --field-id <STATUS_FIELD_ID> --single-select-option-id <OPTION_ID>

# Claim (text field Session)
gh project item-edit --id <ITEM_ID> --project-id <PROJECT_ID> \
  --field-id <SESSION_FIELD_ID> --text "<branch> @ <date>"

# New finding → issue → board
gh issue create --repo Crazz-E/SPO-WebClient --title "…" --body "…"
gh project item-add 2 --owner Crazz-E --url <ISSUE_URL>

# Final comment
gh issue comment <N> --repo Crazz-E/SPO-WebClient --body "…"
```

The entry point for a working session is the **`/next-task`** command
([.claude/commands/next-task.md](../.claude/commands/next-task.md)) — it encodes the claim
handshake and the milestone writes; this document is the rulebook it follows.
