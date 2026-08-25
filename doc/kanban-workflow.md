# Kanban workflow — GitHub Projects is the backlog

**Single source of truth for all open work:**
[github.com/orgs/Crazz-Org/projects/1](https://github.com/orgs/Crazz-Org/projects/1)
(organization project #1, Kanban — **public**). Every task is a **GitHub issue** on
`Crazz-Org/SPO-WebClient`,
added to the project. Draft items are not used.

The former documentary backlog (`doc/BACKLOG.md`, `doc/BACKLOG-OPEN.md`) is **retired and
deleted**; its full text stays readable at the archive permalink:
[`doc/BACKLOG-OPEN.md` @ `94b059a0`](https://github.com/Crazz-Org/SPO-WebClient/blob/94b059a08caa5d834ce9e1fac6ac5f398b91943f/doc/BACKLOG-OPEN.md)
· [`doc/BACKLOG.md` @ `94b059a0`](https://github.com/Crazz-Org/SPO-WebClient/blob/94b059a08caa5d834ce9e1fac6ac5f398b91943f/doc/BACKLOG.md).
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
| `Area` | single select | **The ground reservation.** Which part of the tree the card's change lands in — exactly one per card, from the partition below. No other field says what ground a task occupies, and `/next-task` skips a Todo card whose area another live session already holds. |

### The areas — a partition, first match from the top

Every path belongs to **exactly one** area. Where two rules could match, the earlier row wins.

| `Area` | Paths |
|---|---|
| `rdo` | `src/shared/rdo-*.ts`, `src/server/rdo*.ts`, `src/server/session/rdo-*.ts`, `src/mock-server/**` |
| `bench` | `src/e2e/bench/**`, `scripts/bench-*.sh`, `scripts/verify-gate.js`, `.claude/hooks/**` |
| `renderer` | `src/client/renderer/**`, `src/client/**/*.module.css` |
| `gateway` | `src/server/**` |
| `client` | `src/client/**` |
| `e2e` | `src/e2e/**` |
| `electron` | `electron/**` |
| `ci` | `.github/**`, `scripts/**` |
| `docs` | `doc/**`, `**/*.md` |

**This is not [`.github/labeler.yml`](../.github/labeler.yml).** That file's labels overlap on
purpose — a PR can be both `client` and `renderer`. An area must *not* overlap, or two sessions
holding `client` and `renderer` would each believe they are on separate ground while editing
the same tree.

**One area per card** — where the *majority* of the change lands. Incidental edits do not
change the choice, specifically `CLAUDE.md`, `package.json`, `package-lock.json`, `README.md`,
and anything under `doc/`: a card that touches `src/client/renderer/` plus three Markdown files
is `renderer`, not `docs`. A task that genuinely spans two blocking areas is **split into two
cards** — never invent a combined area, and never leave `Area` empty to dodge the rule.

**No `area:` labels.** `Category` and `Size` carry labels because workflows and
`gh issue list --label` cannot read a project field. `Area` is read only by `/next-task`, which
reads project fields directly through `gh project item-list`. A hand-posted `area:` label would
duplicate the automatic PR path labels and drift from them.

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

### One session per area — the ground reservation

Git only refuses a merge when both sides changed the **same lines**. Two changes on different
lines that break each other merge cleanly, and the defect is visible only once it is on `main`.
Measured on 2026-08-24: **19** forced `Merge remote-tracking branch 'origin/main'` commits in a
single day, one branch re-syncing **six times** before it landed. Ownership of a *card* is
therefore joined by a reservation on its *ground*.

**The busy set.** An area is **busy** when a card holds it in **In progress**, **Gate** or
**PR**, and that card's reservation is still live (below). `Todo`, `Done` and `Needs triage`
never make an area busy. `Gate` and `PR` do: the branch exists and is about to land.

**`docs` never blocks.** Two or more cards may hold `docs` at the same time. A documentation
change cannot break the build, and a same-line collision is caught by Git; blocking on it would
freeze the board for no gain, since nearly every task edits some Markdown. **Every other area
blocks.**

**The claim rule.** `/next-task` walks Todo top-down and takes the first card whose `Area` is
not in the busy set; a card with an **empty** `Area` is claimable and blocks nothing. The full
algorithm — including what to do when the area determined *after* claiming turns out to be busy,
and what to do when no card is claimable — is
[.claude/commands/next-task.md](../.claude/commands/next-task.md) § 1.

**The reservation expires on session inactivity — the card's ownership never does.** A task
here can legitimately run for **several hours**, and board writes happen at state transitions
only, so a busy session goes hours without touching its card. The reservation is keyed to
factual activity instead: the liveness signal is the **session heartbeat**
([.claude/hooks/session-heartbeat.sh](../.claude/hooks/session-heartbeat.sh)), which every hook
stamps — a prompt, an edit, a Bash call, the end of a turn — so it moves continuously while a
session works, whatever the task's length.

Joining a card to a heartbeat takes four steps, because `Session` holds a **branch** while the
heartbeat store is keyed by **worktree path**. Do not guess the mapping from the names:

1. list `~/.spo-bench/sessions/*.alive` (`SPO_SESSION_DIR` overrides the directory);
2. each file *contains* the absolute worktree path — read it;
3. `git -C <path> rev-parse --abbrev-ref HEAD` gives that worktree's branch;
4. a card matches when its `Session` field begins with that branch.

The window is **`SPO_WORKTREE_IDLE_MIN`** — the same variable and the same 120-minute default
[`scripts/finish.sh:51`](../scripts/finish.sh) already uses to decide a worktree is abandoned.
One number to tune, not two. While the heartbeat is younger than that, the reservation is live.
**When no heartbeat is found for the branch** (the store was cleared, or the session runs on
another machine — [#158](https://github.com/Crazz-Org/SPO-WebClient/issues/158)), fall back to the
branch's last commit date on `origin`, with the same window. A branch with neither signal does
not hold its area.

**`Session` is never touched by any of this**, in any of these cases. Ownership law 1 stands
unchanged: a card whose `Session` is filled still belongs to that session, and only the human
may free it. What expires is the *ground reservation*, and nothing else — that distinction is
the whole point of the field.

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

**One human step, once.** The board is a Projects v2 board, which the repository's
`GITHUB_TOKEN` cannot read at any permission level — moving it into the organization changed
nothing there, because the resource is the project and not the repository. Provision a PAT with `read:project` as
the `PROJECTS_TOKEN` secret (Settings → Secrets and variables → Actions). Until it exists the
job is inert: green, skipped, one notice — never a red X every morning. `--dry-run` and
`workflow_dispatch` give a manual check without commenting on anything.

### The built-in Projects workflows — configured, and four that stay off

The other half of #124 — the mechanical transitions nobody should have to remember — is
configuration, not code, and **it did not survive the move to the organization**: a project's
`Auto-add to project` workflow is bound to a repository filter belonging to *that* project, so
the whole set had to be built again on the new board. That was done on **2026-08-25**. Read the
current state rather than assuming it:

```bash
gh api graphql -f query='query{organization(login:"Crazz-Org"){projectV2(number:1){workflows(first:20){nodes{name enabled}}}}}'
```

⚠ **There is no mutation for this, and the read is partial.** The public GraphQL API can
*delete* a project workflow (`deleteProjectV2Workflow`) and can read its `enabled` flag, but it
can neither create one, enable one, nor read the **value** a `Set value` step is configured
with. So a session can prove a workflow is *on*; only the UI can turn it on, and only the
board's behaviour proves it points at the right column. Project → ⋯ → Workflows.

**On, and what each one buys:**

| Workflow | Configured as | Why it matters |
|---|---|---|
| **Auto-add to project** | repository **picker** → `Crazz-Org/SPO-WebClient`; filter box → `is:issue is:open` | **The feeding rule rests on this one.** Without it a new issue belongs to no board, so a finding filed by a session is invisible |
| **Item added to project** | trigger `issue, pull request`; set `Status` = **Todo** | Auto-add only *adds*. Without this a new card arrives with no status — on the board and outside the pool at the same time, since `/next-task` selects on `Status = Todo` |
| **Pull request linked to issue** | set `Status` = **PR** | The column the ownership law defines as "pull request open", reached from the `Closes #N` the PR body already carries |
| **Item reopened** | trigger `issue, pull request`; set `Status` = **Needs triage** | Without it, reopening a closed issue leaves its card in Done, where it misrepresents the work. **Not Todo:** `Session` still holds the old owner and only the human may clear it — Needs triage is the human's column |
| **Item closed** | trigger `issue, pull request`; set `Status` = **Done** | The Done cards with an empty `Session` are the trace of this firing on its own |
| **Auto-close issue** | trigger *when the status is updated* → `Status: Done` | Closes the issue when a session moves the card |
| **Auto-add sub-issues to project** | — | Inherited, no value to set |

**Every `Set value` step needs its value, and the value is not optional** — a workflow whose
value is unset shows a red **!** in the sidebar and its *Save and turn on workflow* button
stays greyed. Expect all of them to arrive that way on a freshly rebuilt board: rebuilding
`Status` with these six columns regenerates the option ids, so whatever GitHub pre-filled
against its own `Todo` / `In Progress` / `Done` defaults is left pointing at options that no
longer exist.

**Off, and staying off.** Three of the four are **pull-request workflows on an issue-only
board** — GitHub's wording for the merge one is *"when pull requests in your project are
merged"*, and the auto-add filter is `is:issue is:open`, so no pull request is ever an item
here and none of the three could fire whatever value it held.

| Off | Fires on | Covered instead by |
|---|---|---|
| `Pull request merged` | PR items | merge → `Closes #N` closes the issue → `Item closed` → Done |
| `Code review approved` | PR items | nothing to cover — solo maintainer, 0 approvals required |
| `Code changes requested` | PR items | idem |
| `Auto-archive items` | any item | deliberately nothing — Done **is** the record of finished work; archiving would hide it |

⚠ **Never widen the auto-add filter to pull requests to "unlock" those three.** Combined with
`Item added to project` → Todo, every open PR would drop into the pool and a `/next-task`
session would claim a pull request as work.

That is not a theoretical risk, and the reason is in the trigger rows above: `Item added to
project`, `Item closed` and `Item reopened` are all typed **`issue, pull request`** — none of
them excludes a pull request by itself. **The auto-add filter is the only thing keeping pull
requests off this board**, and therefore the only thing that makes those three safe. It is a
single UI field, and changing it changes the meaning of every column.

⚠ **Two traps in the auto-add row, and the first is a hard error.** The repository is chosen
from a *separate picker*; the filter box beside it accepts only `is:`, `label:`, `reason:`,
`assignee:` and `no:` (all but `no:` negatable). Writing the repository into the filter is
rejected outright — `Invalid filter: Unknown field name "repo"`. And **auto-add sets no field
value**: `Status` = Todo is the separate `Item added to project` workflow, so turning on only
the first of the two leaves every new card statusless.
([GitHub docs](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically))

**What a session still does by hand.** Nothing on the way in — a filed issue reaches Todo on
its own (auto-add verified live 2026-08-25: a throwaway issue reached the board in under ten
seconds). But no workflow sets `Category`, `Size` or `Area`, and every transition after the
claim is still a board write its owner makes (§ *What a session writes on the board*). A
finding that never enters the Todo pool is lost exactly as surely as one that was never filed —
which is how one was nearly lost when the repository moved and the old board's filter stopped
matching.

## What a session writes on the board — and only this

Board writes happen at **state transitions only** — no running log, no progress notes.
Every write is very short.

| Moment | Writes |
|---|---|
| Claim | `Session` field + Status → In progress |
| Gate deposited | Status → Gate |
| PR opened | Status → PR (the PR link appears on the card automatically via `Closes #N`, and `Pull request linked to issue` is configured to set the column from the same link — the owner sets it anyway and reads it back: the workflow has not yet been *observed* firing, and the owner's write is what the law relies on) |
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
— `rdo`, `gateway`, `client`, `renderer`, `e2e`, `bench`, `ci`, `documentation`.
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
# List cards with status + session + area (topmost Todo first = priority order)
gh project item-list 1 --owner Crazz-Org --format json \
  --jq '.items[] | {id, title: .content.title, number: .content.number, status, session, area}'

# The busy set — areas held by a live card (docs excluded: it never blocks)
gh project item-list 1 --owner Crazz-Org --limit 100 --format json \
  --jq '[.items[] | select(.status == "In progress" or .status == "Gate" or .status == "PR")
        | select(.area != null and .area != "docs") | .area] | unique'

# Resolve project and field ids (needed for item-edit)
gh project view 1 --owner Crazz-Org --format json --jq .id
gh project field-list 1 --owner Crazz-Org --format json

# Move a card (single-select field, e.g. Status)
gh project item-edit --id <ITEM_ID> --project-id <PROJECT_ID> \
  --field-id <STATUS_FIELD_ID> --single-select-option-id <OPTION_ID>

# Claim (text field Session)
gh project item-edit --id <ITEM_ID> --project-id <PROJECT_ID> \
  --field-id <SESSION_FIELD_ID> --text "<branch> @ <date>"

# Fill Area before the card moves to In progress (single select, like Status)
gh project item-edit --id <ITEM_ID> --project-id <PROJECT_ID> \
  --field-id <AREA_FIELD_ID> --single-select-option-id <OPTION_ID>

# New finding → card review → issue → board (label = the queryable mirror of Category/Size)
# The draft goes to the `card-reviewer` sub-agent FIRST; on DO NOT FILE, nothing below runs.
gh issue create --repo Crazz-Org/SPO-WebClient --title "…" --body "…" \
  --label "cat:latent-trap" --label "size:M"
gh issue comment <N> --repo Crazz-Org/SPO-WebClient --body "<the verdict, verbatim>"
# `Auto-add to project` + `Item added to project` put the card in Todo on their own.
# Only if a card has not appeared after ~30 s (a workflow was turned off):
gh project item-add 1 --owner Crazz-Org --url <ISSUE_URL>

# Final comment
gh issue comment <N> --repo Crazz-Org/SPO-WebClient --body "…"
```

The entry point for a working session is the **`/next-task`** command
([.claude/commands/next-task.md](../.claude/commands/next-task.md)) — it encodes the claim
handshake and the milestone writes; this document is the rulebook it follows.

## While `main` is red — the nightly rule

The bench proves **branches**, each against the `main` it was based on. Two branches that
each pass alone and break together therefore land unchallenged: the mixture is never driven
live. One nightly run of the L2 flows against `origin/main` closes that gap — the worker
deposits it itself when the queue is idle, and publishes the answer to
`~/.spo-bench/nightly/latest.json`. Mechanism:
[bench-worker.md § The nightly proof of `main`](bench-worker.md).

**`main` is red** when that file's `verdict` is `FAIL` *and* its `sha` is still what
`origin/main` points at. A verdict of `ENVIRONMENT` or `INTERRUPTED` is not red: the run
never learned anything about `main`, and an unproven `main` is where the project already
stood every night before this existed.

Two rules follow, and they bind every session:

1. **`/next-task` hands out only the repair.** No new card is claimed while `main` is red.
   The repair is an ordinary card — issue `Nightly: main is red`, claimed, gated, merged like
   any other — it is simply the only one on offer.
2. **No session merges `origin/main` into its branch.** Updating from `main` must never
   import a defect. A branch already based on the last green `main` keeps working; its
   attestation records that `baseMain`, and the honest note the push hook prints about a
   moved `main` is exactly the signal to wait rather than sync.

Why the rule is written here rather than enforced by a hook: a red `main` is the moment the
board's priority order stops being the human's to set, and that is a rule about *dispatch* —
the thing this document governs. A hook refusing merges would also have to be sure which
`main` a branch is being updated *from*, and would refuse the repair itself.

**The misattribution this prevents** is the whole point. Without it, a later session claims a
card, gates it, and burns its three attempts ([E2E-POLICY.md](E2E-POLICY.md) §8) on a
regression it did not write, on ground it does not own. The failure is cheap; being unable to
tell whose failure it is, is not.
