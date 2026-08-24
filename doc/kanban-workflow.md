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
| 🔨 **In progress** | Owned, in development | Session wrote its identity into `Session` and moved the card. Branch, implementation, tests. | Gate deposited, or released. |
| 🧪 **Gate** | `npm run gate` deposited on the bench worker | Implementation + tests done, gate queued. | Gate PASS → PR opened. Gate failure loops back to In progress (3 attempts max, then release). |
| 🔀 **PR** | Pull request open | PR opened with `Closes #N` in the body. CI + `bench/gate` statuses, merge. | Merge (issue auto-closes). |
| ✅ **Done** | Merged, released, finished | PR merged, release published, `npm run finish` run. Final synthetic comment posted. | Terminal. |
| 🚨 **Needs triage** | Ownership released on failure/abandon | Owner released the task with a **simple, non-technical explanation** as an issue comment. | **Human only**: reprioritises, clears `Session`, moves back to Todo (or closes). |

## Fields on each card

| Field | Kind | Meaning |
|---|---|---|
| `Session` | text | **The ownership marker.** Empty = claimable. Format: `<branch> @ <YYYY-MM-DD>` (e.g. `claude-crazz/mail-refresh-x1 @ 2026-08-24`). All sessions push as the same GitHub account, so the assignee cannot distinguish them — this field can. |
| `Category` | single select | 🔴 Defect · 🟠 Latent trap · 🟡 Feature/Gap · ⚪ Observation · 📚 Doc/Infra — called `Category` and not `Type`, which GitHub Projects reserves |
| `Size` | single select | S · M · L — rough estimate at creation, for scanning the pool. |

## The board is written in English — all of it

**Every word that lands on the board is English**, whatever language the session, the
source or the conversation was in: issue titles, issue bodies, every comment, the release
explanation, the final synthetic comment. A finding read off a French ASP page, a Delphi
comment in Portuguese or a chat in French is *translated* on the way in, not transcribed.

Why it is a rule and not a preference: the backlog is the one artefact every session reads
and no session owns. A bilingual backlog costs a reader twice — once to find the card, once
to be sure they understood it — and the cost lands on whoever picks the card up, never on
whoever wrote it. Titles carry `file:line` references and RDO member names that must be
greppable; mixing languages around them makes the pool unsearchable in practice.

The one thing this does **not** change: the release comment (§ ownership law 4) is still
written for a non-programmer. Plain English, not technical English.

Board structure follows the same rule — columns, fields and `cat:` / `size:` labels are all
English. Conversation with the maintainer is not board content and is not affected.

## The ownership law

1. **Ownership is sacred.** A card whose `Session` field is non-empty belongs to that
   session. No other session may take it, edit it, or work its scope — ever. There is no
   staleness timeout for sessions.
2. **Claiming is a handshake, not a write.** Read the board → write your identity into
   `Session` → **re-read the field**. If it holds someone else's identity, you lost the
   race: take the next item. Claim one card at a time.
3. **Every owner must close its ownership** — in success (→ Done) or in failure
   (→ Needs triage). A session that ends without doing either leaves a locked card; **only
   the human** may free it (clear `Session`, move back to Todo).
4. **Releasing a task** (failure, abandon, out of scope): move to Needs triage, keep
   `Session` filled (it is the trace), and post one issue comment explaining **in simple,
   non-technical English** why the task failed — what was attempted, what blocked it, in
   words a non-programmer follows. The human reclassifies from there.

## The orphan watch — the law's missing half

Rule 3 says a session that ends without closing its ownership leaves a locked card, and only
the human may free it. Nothing told the human it had happened. With several sessions running
in parallel on one machine, a session dying mid-flight is the likeliest failure of the
assignment process, and its card sat in In progress / Gate / PR — owned by nobody alive —
until somebody happened to re-read the board.

[`.github/workflows/orphan-cards.yml`](../.github/workflows/orphan-cards.yml) runs
[`scripts/orphan-cards.js`](../scripts/orphan-cards.js) every morning at 07:10 UTC and makes
that visible. **It frees nothing.** It never edits the board, never clears a `Session`, never
moves a card — rule 1 is untouched, and the job holds no token that could break it.

| Decision | Answer | Why |
|---|---|---|
| What is a suspect | `Session` non-empty **and** column ∈ {In progress, Gate, PR} **and** the card's `updatedAt` is ≥ N old | `updatedAt` is the one clock that ticks on every milestone a live session must write. A missing branch or a missing PR is **evidence printed next to the card**, never the trigger — a card in In progress legitimately has neither. |
| N | **24 h** (`ORPHAN_STALE_HOURS`) | The bench serialises every session's gate on one machine, so an L-sized task behind a queue can honestly be quiet for most of a working day. 12 h fires on a card claimed in the evening and worked next morning; every card that has landed so far was claimed and finished the same day. |
| Shape of the reminder | **One comment on the quiet card**, once per ownership episode, plus a table in the run's job summary | A digest issue would be auto-added to the board (see below) and a `/next-task` session would eventually claim the machine's own bookkeeping as work. A comment creates no card and lands where the decision is made. |
| Repeat | Never, for the same owner | Each comment carries a hidden `<!-- orphan-watch:<Session> -->` marker. Keyed on the `Session` text, not a timestamp: posting the comment can itself bump `updatedAt`, and a timestamp key would make the job re-fire on the trace of its own last run every day. A freed and re-claimed card gets a new `Session` and re-arms. |

**One human step, once.** The board is a *user-scoped* project, which the repository's
`GITHUB_TOKEN` cannot read at any permission level. Provision a PAT with `read:project` as
the `PROJECTS_TOKEN` secret (Settings → Secrets and variables → Actions). Until it exists the
job is inert: green, skipped, one notice — never a red X every morning. `--dry-run` and
`workflow_dispatch` give a manual check without commenting on anything.

### The built-in Projects workflows are on

The other half of #124 — the mechanical transitions nobody should have to remember — needs no
code and is already configured. All seven built-in workflows on the project report enabled:

```bash
gh api graphql -f query='query{user(login:"Crazz-E"){projectV2(number:2){workflows(first:20){nodes{name enabled}}}}}'
```

`Auto-add to project` (a new issue becomes a Todo card without an `item-add`), `Item closed`
and `Pull request merged` (→ Done), `Auto-close issue`, `Item added to project`, `Pull request
linked to issue`, `Auto-add sub-issues`. The Done cards with an empty `Session` field are the
trace of `Item closed` firing on its own. A session should still write its milestones — the
built-ins cover creation and closure, not the columns in between — but a forgotten `item-add`
no longer loses a finding.

## What a session writes on the board — and only this

Board writes happen at **state transitions only** — no running log, no progress notes.
Every write is very short.

| Moment | Writes |
|---|---|
| Claim | `Session` field + Status → In progress |
| Gate deposited | Status → Gate |
| PR opened | Status → PR (the PR link appears on the card automatically via `Closes #N`) |
| Merged + finished | Status → Done + **one final comment, 2–4 lines**: what changed, PR number, anything the human should know |
| Released | Status → Needs triage + the non-technical explanation comment |
| Gate attempt failed | Nothing on the board (Status stays Gate or returns to In progress); the detail lives in the PR/commits |

## Feeding rule (replaces the BACKLOG-OPEN feeding rule)

Every live-journey finding, investigation result, or defect discovered in passing **lands as
a new issue on the board**, in Todo (bottom — the human prioritises), with `Category` set and a
synthetic body: what is wrong or missing, key `file:line` references, source (journey/date).
A finding that only lives in a session report is lost.

**Set the matching label too**, not only the project field. The field is the board's truth;
the label is the only projection a workflow or `gh issue list --label` can read — GitHub
cannot query a project field, and the emoji in the title is not a query either.

| `Category` | label | | `Size` | label |
|---|---|---|---|---|
| 🔴 Defect | `cat:defect` | | S | `size:S` |
| 🟠 Latent trap | `cat:latent-trap` | | M | `size:M` |
| 🟡 Feature/Gap | `cat:feature` | | L | `size:L` |
| ⚪ Observation | `cat:observation` | | | |
| 📚 Doc/Infra | `cat:doc-infra` | | | |

Pull requests are labelled by **path**, automatically (`actions/labeler`, `.github/labeler.yml`)
— `rdo`, `gateway`, `client`, `renderer`, `e2e`, `bench`, `electron`, `ci`, `documentation`.
Never post those by hand. One label is neither derived nor a session's to post:
**`rdo-approved`**, which the maintainer alone adds to unlock a protected-file change.

### The card review — a neutral reader before the pool

**Before the `gh issue create`, the draft card goes to the `card-reviewer` sub-agent**
([.claude/agents/card-reviewer.md](../.claude/agents/card-reviewer.md)) — title, body,
`Category`, `Size`, verbatim, and nothing else. It is read-only, it carries none of the
finder's context, and it does not want the work.

Why: a pull request has had a second reader since #143. A card had none — the session that
finds something also judges it worth doing, sizes it and picks its `Category`. The cost of a
misread claim, a duplicate, a card with no `file:line` or no statement of what *done* looks
like lands entirely on whoever claims it, never on whoever wrote it. That is the same
asymmetry the English-only rule above exists to prevent.

Three verdicts, and what each does to the flow:

| Verdict | The session |
|---|---|
| `FILE` | Files the card as written. |
| `FILE AMENDED` | Applies the named corrections — body, `Category`, `Size` — then files. |
| `DO NOT FILE` | Files nothing. Its final report says what was found and why no card exists. |

`DO NOT FILE` names the code, the issue number or the commit that makes the finding moot. It
is never about priority: **priority is the human's**, and a real but low-value finding is
still filed, at the bottom of Todo like any other.

**The trace.** Immediately after creating the issue, the session posts the verdict
**verbatim as the card's first comment**, dated (`### Card review — <YYYY-MM-DD>`). Every
comment on this board posts as the same GitHub account, so that heading — not the author
line — is what marks the card as read by something other than its writer. A card whose first
comment is not a verdict is visibly unreviewed; that visibility is the enforcement, and
[src/\_\_tests\_\_/card-reviewer-agent.test.ts](../src/__tests__/card-reviewer-agent.test.ts)
keeps the four surfaces of the mechanism from drifting apart.

**What does not change.** The claim handshake is untouched. No human step is added. No
session ever waits on another session's review: the cost is one sub-agent inside the
finder's own turn, and it is paid by the finder rather than by the claimer.

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

# New finding → card review → issue → board (label = the queryable mirror of Category/Size)
# The draft goes to the `card-reviewer` sub-agent FIRST; on DO NOT FILE, nothing below runs.
gh issue create --repo Crazz-E/SPO-WebClient --title "…" --body "…" \
  --label "cat:latent-trap" --label "size:M"
gh issue comment <N> --repo Crazz-E/SPO-WebClient --body "<the verdict, verbatim>"
gh project item-add 2 --owner Crazz-E --url <ISSUE_URL>

# Final comment
gh issue comment <N> --repo Crazz-E/SPO-WebClient --body "…"
```

The entry point for a working session is the **`/next-task`** command
([.claude/commands/next-task.md](../.claude/commands/next-task.md)) — it encodes the claim
handshake and the milestone writes; this document is the rulebook it follows.
