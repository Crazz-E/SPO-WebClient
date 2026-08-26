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
| `docs` | `**/*.md`, `doc/**` |
| `rdo` | `src/shared/rdo-*.ts`, `src/server/rdo*.ts`, `src/server/session/rdo-*.ts`, `src/mock-server/**` |
| `bench` | `src/e2e/bench/**`, `scripts/bench-*.sh`, `scripts/verify-gate.js`, `.claude/hooks/**` |
| `renderer` | `src/client/renderer/**`, `src/client/**/*.module.css` |
| `gateway` | `src/server/**` |
| `client` | `src/client/**`, `public/**` |
| `e2e` | `src/e2e/**` |
| `shared` | `src/shared/**`, `src/*.d.ts` |
| `ci` | `.github/**`, `scripts/**`, `.claude/**`, `src/__tests__/**`, `src/__mocks__/**`, `jest.config.js`, `eslint.config.js`, `tsconfig*.json`, `vite.config.ts`, `Dockerfile*`, `docker-compose.yml`, `deploy/**` |

**`ci` is the last row and the catch-all.** Anything reachable that no earlier row claims is
`ci` — the machinery that builds, tests, ships and automates the repository. That is what makes
this table a *partition* rather than a list to be extended every time a file appears at the
root: a session can always read an area off it, so §4's "never leave `Area` empty" is a rule it
is possible to obey.

**`docs` comes first, so a Markdown file is documentation wherever it lives** —
`.github/pull_request_template.md`, `.claude/commands/*.md`, `src/mock-server/CLAUDE.md`. Prose
cannot break a build, and `docs` never blocks (§ One session per area), so reserving no ground
for it costs nothing; the reverse costs a great deal — editing one slash command would hold the
whole `ci` area, and nearly every task edits some Markdown.

**`shared` is ground of its own**, because `src/shared/` is consumed by both halves and neither
owns it. `gateway` and `client` were each plausible for `logger.ts` or `road-cost.ts`, and two
sessions guessing differently is exactly the silent overlap this field exists to remove. A card
centred on `src/shared/` blocks neither half; one that genuinely has to change `src/shared/`
*and* `src/server/` is two cards, by the rule below.

**No row may match nothing.** `electron` had one until 2026-08-25, and it was dead from birth:
`electron/` was deleted at 19:25 on 2026-08-24 (`ba7822a6`, #149) and the row was written at 20:38
the same evening (`eb6307b6`, #159) — 73 minutes later. A row that can never match is offered at
every classification and read by every session, so `src/__tests__/area-reservation.test.ts` now
checks each row's directories against the tracked tree.

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
reads project fields directly through the claim read (§ gh CLI recipes). A hand-posted `area:`
label would duplicate the automatic PR path labels and drift from them.

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

**One narrow exception to "only the human may free it" (#299):** `npm run board:take --
<n> --release` may clear a *different* session's stale claim when the card is the trace of
an issue that got **reopened** after its owner correctly closed it — not a failure trace, and
not a live owner. It checks all three at once: Status is `Done` or `Needs triage`, the issue
is **open**, and the issue's `stateReason` is **REOPENED**. A failure release never sets
`stateReason` (the issue was never closed), so law 4's trace stays exactly as human-only as
it was — this exception can never fire on it. Anything short of all three — a live owner in
Todo/In progress/Gate/PR, a failure trace, or a closed issue — still exits refused, and the
tool says which.

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

### Blocking order — the card that cannot start yet

The area reservation above says *two sessions must not stand on the same ground at once*. It
says nothing about **order**, and nothing else did either: a session could claim a card whose
work cannot begin until another card's change exists. Until 2026-08-25 that order lived in
prose — [#120](https://github.com/Crazz-Org/SPO-WebClient/issues/120) carried
"⚠ Depends on #108 … Fix #108 first" inside its own body, and `/next-task` offered it at every
claim like any other Todo card. Its order held only because the human's vertical rank happened
to agree, and any reprioritisation would have destroyed it silently.

GitHub records the relation on the **issue**, not on the card — `blocked by` / `blocks`
(`Issue.blockedBy`, `Issue.issueDependenciesSummary`, the `addBlockedBy` / `removeBlockedBy`
mutations). The project's fields do not include it, so `gh project item-list` cannot see one:
reading the relation rides in the claim read's single GraphQL call over the open issues — for
the whole set, never one per card (recipe in § gh CLI recipes).

**A blocked card is not claimable, and closing the blocker is the whole lifecycle.**
`issueDependenciesSummary.blockedBy` counts the **open** blockers only, so a blocker that closes
frees the card by itself, with no board write anywhere.

**What a session does when it meets one** — and none of it touches the card:

| The session was | It does |
|---|---|
| walking Todo top-down | **skips the card and names the skip in its final report** — `#120 skipped: blocked by #108`. A silent skip would make the board read *worse* with dependencies than without: the human sees a card passed over and is given no reason. |
| handed the card by number (`/next-task 120`) | **stops and says so out loud**, exactly as it does for a card another session owns. The human named that card; claiming it anyway breaks the order, and skipping it silently answers nothing. |

In both cases `Session` stays empty, `Status` stays **Todo**, and no comment is posted. A
blocked card is **not** Needs triage — nothing failed, and it was never owned.

**Who may post one, and what it may never be used for.**

1. **The human always may**, on any card.
2. **A session may add one** when the relation is a fact of the code — the blocked card's work
   cannot begin until the blocker's change exists — and it says why in one comment on the
   blocked card. A session **never removes** one: that is the human's, or the blocker closing.
3. **A dependency is never a substitute for priority.** Priority is the vertical rank of Todo
   and it belongs to the human (§ The board). A dependency says *cannot start yet*, never
   *matters less* — to push work back, move the card down; do not invent a blocker.
4. **It neither substitutes for the `Area` reservation nor is substituted by it.** Areas guard
   against merge collisions between two live sessions; dependencies guard logical order between
   two cards that may never be live at the same moment. Both are checked, independently.
5. **A sub-issue link is not a dependency.** `Parent issue` / `Sub-issues progress` decompose a
   task ([#167](https://github.com/Crazz-Org/SPO-WebClient/issues/167) → #171–#174); nothing in
   that link orders the children.

[src/\_\_tests\_\_/card-dependencies.test.ts](../src/__tests__/card-dependencies.test.ts) keeps
the three surfaces of this rule — this rulebook, the `/next-task` command and `CLAUDE.md` — from
drifting apart.

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
| **Item reopened** | trigger `issue, pull request`; set `Status` = **Needs triage** | Without it, reopening a closed issue leaves its card in Done, where it misrepresents the work. **Not Todo:** `Session` still holds the old owner and Needs triage is the human's column — though `board:take --release` (#299) can now clear that stale claim itself, since a reopened issue's `stateReason` is the one thing a failure trace can never forge |
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

## GitHub API discipline — reads are budgeted like writes

Every session, every workflow and every machine authenticates as **one GitHub account**, and
the account is the quota: **5000 GraphQL points per hour**, and separately 5000 REST requests
per hour (`gh api rate_limit` shows both buckets; a second PC adds nothing). On 2026-08-25,
five sessions re-reading the board in a loop emptied the GraphQL bucket and the board went
unreadable for ~5 minutes, mid-claim. The rules below make that behaviour impossible to write
by accident: if there are ever too many requests, it must be because of a real need, never
because a session used the API badly.

**The costs are measured, not guessed** — measured 2026-08-25 by asking `rateLimit { cost }`
inside the query, which is the measure every hand-written call carries (rule 3):

| Call | Bucket | Cost |
|---|---|---|
| `gh project item-list 1 --limit 100` | GraphQL | **~103 points** — its generated query nests every field's options inside every field value of every item, and pulls every card body |
| the claim read (§ gh CLI recipes) | GraphQL | **2 points** |
| the single-item handshake re-read | GraphQL | 1 point |
| one `item-edit` / issue mutation | GraphQL | ~1 point |
| `gh api repos/…` (issue, PR, branch, comment) | REST | 1 request, the other bucket |
| `gh api rate_limit` | neither | **free — and still answers when a bucket is empty** |

~48 `item-list` calls end the hour for every session at once. That is why a session never
reads the pool with `gh project item-list`: the claim read returns the same decision data
*plus* the ids `item-edit` needs, fifty times cheaper (2 points against 103, both measured
2026-08-25 on this board). (`item-list` stays fine for a human
one-off at a terminal; it is the loop and the fan-out that killed the board.)

**The five rules:**

1. **Reads happen at state transitions only, exactly like writes.** One pool read at claim —
   the claim read, once; it carries the board, the blocked set and every project/field/option
   id the claim's writes take. The handshake re-read is the single-item recipe, never a second
   listing. A back-off to the next candidate reuses the first read. After the claim, milestone
   writes are blind `item-edit`s: nothing between claim and Done re-reads the pool.
2. **Never poll GitHub for a state that has a local surface.** The bench verdict is the exit
   code of `npm run gate` (one background command) and `~/.spo-bench/verdicts/<sha>.json`; the
   nightly is `~/.spo-bench/nightly/latest.json`; session liveness is the heartbeat files in
   `~/.spo-bench/sessions/`. None of these is ever asked of GitHub. The only GitHub-only waits
   are **CI and the merge queue**: check once when you arrive — CI normally concluded while
   the gate was queued — and if something is genuinely pending, re-read at **≥ 30 s**
   intervals, over REST (`gh api repos/Crazz-Org/SPO-WebClient/pulls/<N>`), the way
   `scripts/deps-gate.sh` waits for its merge, and **for at most 20 polls or 10 minutes,
   whichever comes first** — "a hard deadline" is not a number, and a wait that never states
   one is a wait a background loop can run forever without anyone noticing. **That wait is a
   script, not a line you compose**: `npm run pr:wait -- <N>` is exactly this rule — REST,
   the 30 s floor (refused below it, never clamped), both bounds, and an exit code for the
   answer (0 merged · 1 closed unmerged · 4 still open). Four hand-rolled
   `until … do sleep 5 … done` loops were proposed here on 2026-08-25, three of them polling
   at 5 s; `.claude/hooks/poll-loop-guard.sh` now refuses the shape and names the alias, and
   `npm run bench:wait -- <job-id>` is its counterpart for a bench job whose wait was
   interrupted. A tight retry
   loop on any GitHub error is never correct: on failure, read the bucket's `reset` from
   `gh api rate_limit` (free) and wait once, in the background, until then. The same rule
   [doc/E2E-POLICY.md](E2E-POLICY.md) states for live evidence holds for a watch loop too —
   a crash is a failure, but silence is not a pass: a watcher that has printed nothing is
   suspect, not calm, and its own bound is what tells you which.
3. **Ask the price inside the query.** Every hand-written GraphQL call includes
   `rateLimit { cost remaining resetAt }` — it costs nothing and turns drift into a number in
   the transcript instead of a discovery at exhaustion. The session's final report states the
   last `remaining` it saw. Below **500 remaining**, stop every optional read and say so: what
   is left belongs to claims and milestone writes.
4. **REST where GraphQL is not required.** Projects v2 items and fields, issue dependencies
   and project workflows exist **only** in GraphQL — those reads are the budget's legitimate
   owners. Issues, PRs, comments, labels and branches all exist in REST, and `gh issue …` /
   `gh pr … --json` go through GraphQL even when they look REST-shaped — for a repeated or
   bulk read of those, prefer the `gh api repos/…` form and spend the other bucket. The MCP
   GitHub tools spend this same account's quota and are bound by every rule here
   (`search_issues` also draws on the search bucket, 30/min). The recipes below are the
   sanctioned forms; a GitHub read outside them needs a reason the session's report can state.
5. **`RATE_LIMITED` mid-claim: the write half decides.** The handshake is write → re-read. If
   the **write** failed rate-limited, nothing landed: the card is untouched, you own nothing —
   claim nothing else, wait for `reset` (rule 2), then start the handshake over. If the write
   succeeded and the **re-read** is what failed, the card is provisionally yours and must not
   be abandoned half-claimed: wait for `reset` in the background, then finish the re-read. A
   session that must end before the bucket resets names the card and the unverified write in
   its final report — that report is what lets the human read the board instead of discovering
   a locked card. Ownership law 3 — every owner closes its ownership — binds the rate-limited
   case too.
6. **Never assert another card's state from memory.** Rule 1 forbids re-reading the *pool*
   between claim and Done, but a session's own claim-time snapshot of *other* cards goes
   stale within minutes — a PR merges, a card moves — and several sessions run at once
   precisely on that pool. A session may cache what it owns (nobody else writes its own
   card); anything it is about to *state* about another card — in an issue comment, a PR
   body, or its final report — it re-reads first, with `scripts/board-status.sh <n>…`
   (`npm run board:status -- <n>…`): one call, ~1 GraphQL point regardless of how many
   issue numbers are passed, because it reads each named issue's own project item and
   linked pull requests, never the pool. This is the single-item shape of rule 1's
   handshake re-read, generalised to any card a session is about to talk about — not a
   second listing, and not covered by rule 2's "no local surface" exemption, because the
   board has none.

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
`Category`, `Size`, `Area`, verbatim, and nothing else. It is read-only, it carries none of the
finder's context, and it does not want the work.

Why: a pull request has had a second reader since #143. A card had none — the session that
finds something also judges it worth doing, sizes it and picks its `Category`.

**`Area` is checked here because nothing else checks it.** No workflow sets it, `/next-task`
only fills it *after* a claim, and the claim rule reads it: a card filed without one is
claimable by anyone and reserves no ground, which is the overlap § The areas exists to
prevent. On 2026-08-25, 22 of 49 Todo cards had none — two of them filed after the field
shipped ([#236](https://github.com/Crazz-Org/SPO-WebClient/issues/236)). The cost of a
misread claim, a duplicate, a card with no `file:line` or no statement of what *done* looks
like lands entirely on whoever claims it, never on whoever wrote it. That is the same
asymmetry the English-only rule above exists to prevent.

Three verdicts, and what each does to the flow:

| Verdict | The session |
|---|---|
| `FILE` | Files the card as written. |
| `FILE AMENDED` | Applies the named corrections — body, `Category`, `Size`, `Area` — then files. |
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
keeps the five surfaces of the mechanism — this rulebook, the agent, `/next-task`,
`/triage-report` and CLAUDE.md — from drifting apart.

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

## Sub-agent handoffs

**The spawn is the cost, not the payload.** Every sub-agent invocation re-pays a fixed
preamble — the project instructions, the agent definition, the tool schemas it was granted —
before it reads the first word of its task. Measured on this repo: `CLAUDE.md` alone is
~8.8k tokens and `card-reviewer.md` ~1.7k, against a task payload of ~150. Re-encoding that
payload from Markdown prose to a `key: value` block saves ~40 tokens — real, and worth
taking, but it is a rounding error next to the four levers above it.

In descending order of what they actually save:

1. **Spawn fewer agents.** Two questions for the same reader are one prompt. A one-liner is
   a direct tool call, never an agent (CLAUDE.md § Delegation strategy).
2. **Grant the narrowest tool set.** An agent declared `tools: *` inherits the whole MCP
   surface; the three agents in `.claude/agents/` declare `Read, Grep, Glob, Bash` and stay
   that way. Prefer them, or `Explore`, over a general-purpose spawn.
3. **Pass pointers, never bodies.** `src/server/session/push-dispatcher.ts:88` costs eight
   tokens; the function pasted around it costs four hundred, and the agent can open the file
   itself. The one exception is content that does not exist on disk — a draft card, a
   verdict — which is exactly what the payload block is for.
4. **Cap the reply in the prompt.** Name the shape you want and forbid the rest: no
   preamble, no restatement of the task, no summary of what was read, no closing offer.
   A reply that opens with "I have analysed the file you mentioned" is billed twice — once
   as the agent's output, once as the session's input.
5. **Then the encoding.** Compact `key: value`, one field per line, for anything the session
   consumes; **Markdown for anything posted verbatim** to GitHub or read by the human — the
   `card-reviewer` verdict becomes an issue comment, so encoding it as YAML only means
   rendering it back to Markdown afterwards, at a net loss.

## Model routing

**The driver is the expensive part.** A session's main loop re-reads its whole context on
every turn, so the model it *runs on* costs far more than the models its sub-agents run on.
Routing only the two glamorous steps (plan, implement) and leaving everything else on
whatever the session started with is how a board of S-sized cards ends up billed as Opus:
picking a card, waiting on the gate, writing the PR body, moving the column and running
`finish` are the majority of a session's turns and none of them is execution.

So the rule is inverted from the obvious one: **drive on the cheapest model the step needs,
and escalate a step by delegating it to a sub-agent**, never the other way round.

A *decision* delegates in one round trip; a *phase* does not. An implementation phase becomes
one spawn per attempt with a driver-held ledger, and the gate stays with the driver because
only the depositing worktree can reach it.

**And that boundary is now enforced, not asked.** "The driver never edits a tracked file
itself" was prose the driver put to itself, which is the weakest enforcement there is: the
model that has already drifted is the one being asked whether it is drifting. On 2026-08-26 a
Haiku driver rewrote a whole script with a card and a criterion in hand, neither of which told
it to stop. `.claude/hooks/driver-scope-guard.sh` now refuses the driver's own writes —
`Edit`/`Write`, and the Bash verbs that reach the tree without them — arming on a verified
`board:take` claim and releasing on every path that closes ownership. It tells the driver from
its own sub-agent by the `agent_id` the PreToolUse payload carries only inside a Task worker,
so the delegate writes unblocked. A guardrail, not a sandbox: what it buys is that drift now
has to be deliberate instead of merely easy.

### The steps of a session, and what each one is worth

| Step (`/next-task` §) | What it actually is | Model | Effort |
|---|---|---|---|
| § 0–2 nightly check, pick, claim, rename | scripted `gh`/`jq`, one right answer | **Haiku 4.5** | low |
| § 1.4 `Area` on a legacy card | first match on a path table | **Sonnet 5** sub-agent | low |
| § 3 understand the card, plan the change | analysis | **Fable 5** | per Size (below) |
| § 3 implement + tests | execution | **Opus 5** — but see the escalation rule | per Size |
| § 3 a merge conflict | judgement over two intents | **Sonnet 5** sub-agent (Opus 5 on an `rdo-*` path) | per Size |
| § 3 `main` moved — same ground? | a file-set intersection, not a judgement | **Haiku 4.5** driver | low |
| § 3 typecheck / lint / coverage fixes | mechanical, the compiler names the fix | **Sonnet 5 or 4.6** | low |
| § 3 deposit the gate, wait, read the exit code | a wait and a number | **Haiku 4.5** | low |
| § 3/4 a gate or CI failure | diagnosis, the hardest reading in the loop | **Fable 5** | high |
| § 3 PR body, merge, `finish`, board writes | mechanical, template-shaped | **Haiku 4.5** | low |
| § 4 the Needs-triage comment | plain-English writing | **Sonnet 5 or 4.6** | low |
| § 5 a finding → draft card → `card-reviewer` | analysis | **Fable 5** | medium |

**The two Sonnet rows accept 4.6.** Both are mechanical: the compiler names the fix, and the
triage comment is template-shaped prose. Neither needs a capability 4.6 lacks — Sonnet 5 is
named there as *the cheapest model that is not Haiku*, not for a judgement only it can make.
So a session already driving on Sonnet 4.6 (or on Haiku, between two scripted steps)
**absorbs these two steps itself** instead of spending a sub-agent spawn on them. That is the
whole point of the substitution; it buys nothing on a session already running Sonnet 5.

It stops there. The `Sonnet 5` in the escalation rule below is real **execution** — writing
code — and is not covered by this: route that one by the rule, not by what the session
happens to be running.

### Escalation — what actually earns Opus 5

Opus is for execution whose **cost of being wrong is not caught by a test**:

- anything touching the RDO wire — `src/shared/rdo-*`, `src/server/rdo.ts`,
  `rdo-members.ts`, the session phases (CLAUDE.md: *a wire divergence is not replaceable*);
- an `L`-sized card, or one whose change spans more than ~5 files;
- a 🔴 Defect or 🟠 Latent trap whose reproduction is not yet understood.

Everything else — `S`/`M` cards in `client`, `docs`, tests, mechanical sweeps, renames,
a change the failing test already describes — is **Sonnet 5** execution. Reach for Opus when
the first Sonnet attempt is wrong in a way that is about judgement rather than about a
missing fact; do not pre-emptively route to it because the card looks important.

### Effort follows `Size`, not the model

| `Size` | plan effort | execution effort |
|---|---|---|
| S | low | low |
| M | medium | medium |
| L | high | medium, raised to high only after a first attempt fails |

Two adjustments: a card whose `Category` is 🔴 Defect or 🟠 Latent trap gets **one notch
more** on the plan step (the diagnosis is the work); a gate retry gets one notch more than
the attempt that failed, never the same effort twice.

### Applying it

Whatever model the session was started with, it is entitled to switch to comply. If the
harness cannot switch the session's own model, apply the routing to its **sub-agents**
(`model: haiku` / `model: sonnet` / `model: fable` / `model: opus` on the Agent tool or on
workflow `agent()` calls). A `.claude/commands/*.md` file may also pin a whole command with
`model:` frontmatter — `coverage-check` and `release-notes` do, because they are single-step
and read-only. `next-task` deliberately does **not**: it spans every row of the table above,
so pinning it to one model is exactly the mistake this section exists to prevent.

## gh CLI recipes

The project scope is required once per machine: `gh auth refresh -s project` (run inside WSL).

**The reads are npm aliases, and that is deliberate.** `board:claim`, `board:verify`,
`board:status`, `board:sessions` and `bench:nightly` each wrap one script under `scripts/`.
A session drives its scripted steps on Haiku 4.5 (§ Model routing), and a model driving
scripted steps must not be composing shell: `npm run …` is allowlisted, so these calls never
stop to ask, while a hand-composed `cd … &&`, a variable assignment or a raw `gh api graphql`
still prompts. That asymmetry is the point — **the query belongs in the script, never in the
prompt**. Change a query by editing its script; do not paste one back into this file.

```bash
# THE CLAIM READ — one query, ~2 GraphQL points per page (4 on today's 116-item board),
# everything a claim needs: every card with Status/Session/Area in board order (topmost
# Todo first = priority order), the blocked set, the project/field/option ids item-edit
# takes, and the price of asking. Run it ONCE per claim.
# Never read the pool with `gh project item-list` in a session: same data, ~103 points
# (§ GitHub API discipline). The busy set is computed inside this call, never by a second one.
npm run board:claim                        # the query lives in scripts/claim-read.sh
# The `busy areas:` line IS the busy set (§ One session per area) — derived inside this one
# call, never fetched by a second: In progress, Gate or PR, `docs` excluded because it never
# blocks. It is computed rather than eyeballed off the item lines so the rule stays executable;
# `$cards` is bound once and both outputs read it.
# The blocked lines: `issueDependenciesSummary { blockedBy }` counts OPEN blockers only, so a
# closed blocker frees the card by itself. The board side paginates itself now; only
# `issues(first: 100)` remains a raise-when-exceeded number (41 open today).
# jq is available, but gh's own `--jq` runs once per page under `--paginate`, so it cannot
# sum rateLimit.cost, dedupe the metadata, or compute a busy set across pages — hence `jq -s`
# over the whole stream: the whole claim read is one program over one response, and not a
# saved file filtered twice.

# Re-read before stating another card's status anywhere durable — a comment, a PR body, the
# final report (§ GitHub API discipline, rule 6). ~1 point for any number of issues.
npm run board:status -- 144 106            # scripts/board-status.sh

# The handshake re-read — ONE item, ~1 point, after writing `Session`. Never a second listing.
# It prints Session, Status and Area, so a single call proves all three claim writes landed.
npm run board:verify -- <ITEM_ID>          # the query lives in scripts/claim-verify.sh

# Move a card (single-select field, e.g. Status) — every id below comes from the claim read
gh project item-edit --id <ITEM_ID> --project-id <PROJECT_ID> \
  --field-id <STATUS_FIELD_ID> --single-select-option-id <OPTION_ID>

# Claim (text field Session)
gh project item-edit --id <ITEM_ID> --project-id <PROJECT_ID> \
  --field-id <SESSION_FIELD_ID> --text "<branch> @ <date>"

# Fill Area before the card moves to In progress (single select, like Status)
gh project item-edit --id <ITEM_ID> --project-id <PROJECT_ID> \
  --field-id <AREA_FIELD_ID> --single-select-option-id <OPTION_ID>

# The blocked set — Todo cards that cannot be claimed — is the tail of the claim read above:
# ONE call for the whole pool, never one per card, and never a separate query beside the claim.

# Record a blocking order (§ Blocking order). The mutation takes node ids, not numbers:
# issueId = the card that waits, blockingIssueId = the card it waits on.
gh api graphql -f query='{repository(owner:"Crazz-Org",name:"SPO-WebClient"){issue(number:<N>){id}}}' \
  --jq '.data.repository.issue.id'
gh api graphql -f query='mutation { addBlockedBy(input:{
  issueId:"<BLOCKED_NODE_ID>", blockingIssueId:"<BLOCKER_NODE_ID>"}) { issue { number } } }'

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
