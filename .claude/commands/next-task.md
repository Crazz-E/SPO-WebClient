---
description: Take the next unowned Todo item from the GitHub Projects kanban and drive it end-to-end (dev → gate → PR → merge → finish), updating the board at each milestone
argument-hint: "[issue number or OB-N to take a specific item]"
---

# Next task

**The rulebook is [doc/kanban-workflow.md](../../doc/kanban-workflow.md)** — columns,
ownership law, board writes, model routing. Do not restate or reinvent it; follow it.
Board: [github.com/orgs/Crazz-Org/projects/1](https://github.com/orgs/Crazz-Org/projects/1).

**Run the scripted steps verbatim.** Every board and bench read below is a named script,
reached through an npm alias: `bench:nightly`, `board:claim`, `board:verify`,
`board:sessions`, `board:status`, `bench:wait`, `pr:wait`. Call each in exactly the form written here —
`npm run <alias>`, arguments after `--` — from the worktree you are in, with **no `cd`
prefix and no shell composition around it**. None of them needs a working directory other
than yours.

That form is not cosmetic: `npm run …` is allowlisted, so these calls never stop to ask.
A `cd … && …` compound, a variable assignment, a `[ -f … ] &&` guard or the raw
`bash scripts/…` path matches no allowlist entry and turns a scripted step into a permission
prompt — which is the one thing these aliases exist to remove. Compose no GraphQL by hand
either: raw `gh api graphql` deliberately still prompts.

**A wait is a scripted step too.** Every "wait for X" in this command has an alias, and none
of them is a loop you write: `npm run gate` and `npm run test:live` wait for their own job,
`npm run bench:wait -- <job-id>` re-attaches to one whose wait was interrupted, and
`npm run pr:wait -- <n>` waits for a pull request to leave the merge queue. Composing
`until … do sleep … done` around `gh` instead stops to ask the human **and** polls GitHub
under the 30 s floor — `.claude/hooks/poll-loop-guard.sh` refuses it and names the alias.

## 0 · Is `main` red?

The bench proves branches; one nightly run proves `main` itself
([bench-worker.md § The nightly proof of `main`](../../doc/bench-worker.md)). Read its
result before claiming anything:

```bash
npm run bench:nightly
```

**`main` is red** when that file's `verdict` is `FAIL` **and** its `sha` is still the sha
`origin/main` points at. While it is red:

- claim **no ordinary card** — the only admissible work is the repair;
- **merge `origin/main` into no branch**, in this session or any other: updating from `main`
  must never import a defect.

Take the open issue titled `Nightly: main is red` if one exists; otherwise file it (Category
🔴 Defect, `cat:defect`, area from where the failure lands) quoting the `sha`, the `detail`
and the `logFile` from that file, then claim it and drive it like any other card.

Anything else — the file is missing, the verdict is `PASS`, the verdict is `ENVIRONMENT` or
`INTERRUPTED` (the run never learned anything about `main`), or the `sha` is one `main` has
already moved past — is **not** red. Proceed to § 1.

## 1 · Pick — the first Todo card whose ground is free

**One read for the whole claim.** Run **the claim read** — `npm run board:claim`, the
composite query kept in `scripts/claim-read.sh` (~2 GraphQL points; never
`gh project item-list`, which costs ~103 and is why the board went unreadable on
2026-08-25). It returns, in a single call: `status`, `session` and `area` come back on every item, in board order (topmost Todo =
the human's priority), with the project, field and option ids § 2's writes take; the blocked
set; and
`rateLimit { cost remaining resetAt }` — state the last `remaining` you saw in your final
report (kanban-workflow § GitHub API discipline). Candidates: Status = **Todo** and
`Session` **empty**.

A card's **blockers are not on the card** — the relation lives on the issue, so no project field
carries it. Read the whole blocked set in **one** call, before walking — it rides in the claim
read, whose `issueDependenciesSummary { blockedBy }` tail counts **open** blockers only: a
closed blocker frees the card, so anything it prints is blocked right now (kanban-workflow
§ Blocking order).

1. **Compute the busy set** (kanban-workflow § One session per area): every `Area` held by a
   card in **In progress**, **Gate** or **PR** whose reservation is still live (below).
   `docs` never enters the busy set — it does not block.
2. **Walk Todo top-down** — list order is the human's priority — and take the first card whose
   `Area` is **not** busy **and** which the query above did not print. A card with an **empty**
   `Area` is claimable and blocks nothing. A card with an open blocker is **skipped, and the
   skip is named in your final report** (`#120 skipped: blocked by #108`) — never silently.
   With `$ARGUMENTS`, take the item named there instead; if it is owned, or if it is blocked by
   an open issue, **stop and say so** — ownership is sacred, and so is the order.
3. **Claim it** (§ 2 below).
4. **If `Area` was empty, determine it now** from the partition in kanban-workflow § The areas
   (one area per card: where the majority of the change lands), and **write it before** moving
   the card to In progress.
5. **If the area you just determined turns out to be busy**: clear `Session`, leave the card in
   Todo with `Area` now filled, and go back to step 2 **reusing the first claim read** — the
   pool is never re-read for a back-off. The card never reached In progress, so
   this is the same back-off as a lost claim race — ownership law 3 is not violated. The
   session title follows: it names the card you end up holding, so a back-off leaves it to be
   rewritten by the next claim, never pointing at a card you released.
6. **If no Todo card is claimable, stop and say so.** Do not take a busy card, do not take a
   blocked one, and do not invent work outside the board.

**A blocked card is never written to.** `Session` stays empty, Status stays **Todo**, no
comment: nothing failed and nobody owned it. It is not Needs triage.

**Is a reservation live?** Not from the board clock — from the session heartbeat, which moves
while a session works even when it has no reason to touch its card for hours:

```bash
npm run board:sessions
```

A card's reservation is live while the heartbeat of the worktree standing on the branch its
`Session` field names is younger than `SPO_WORKTREE_IDLE_MIN` (default **120** minutes). No
heartbeat for that branch → fall back to that branch's last commit date on `origin`, same
window. Neither signal → the area is free, and the card's `Session` field is still left
untouched: what expired is the ground reservation, never the ownership.

## 2 · Claim (handshake)

Write `Session` = `<branch> @ <YYYY-MM-DD>`, move Status → **In progress**, then **re-read**
`Session` — with `npm run board:verify -- <ITEM_ID>` (1 point), never by listing the pool
again. It prints the three fields the claim writes, `Session`, `Status` and `Area`, so one
call proves all three landed. Not your identity → you lost the race: take the next candidate,
from the claim read you already hold. One card at a time.

**If GitHub answers `RATE_LIMITED` mid-handshake, the write half decides** (kanban-workflow
§ GitHub API discipline, rule 5). The write failed → nothing landed: the card is untouched,
you own nothing — claim nothing else, read the bucket's `reset` from `gh api rate_limit`
(free, it still answers when the bucket is empty), wait for it once in the background, then
start the handshake over. The write succeeded and the re-read failed → the card is
provisionally yours: do not walk away half-claimed — wait for `reset`, finish the re-read,
and if this session must end first, name the card and the unverified write in your final
report so the human can read the board.

**Then rename this session** — `mcp__ccd_session_mgmt__set_session_title` with
`session_id: "self"` and `title: "#<issue> · <Status>"`, e.g. `#212 · In progress`. Issue
number and column, nothing else: the session list then shows at a glance which card each
session holds and where it stands.

**The title tracks the card.** Every time you move the card in § 3 or § 4, rewrite the title
in the same breath — `#212 · Gate`, `#212 · PR`, `#212 · Done`, `#212 · Needs triage`. A
gate retry that sends the card back to In progress renames it back too.

It is a display name, never a source of truth: **the board write comes first**, and a failed
rename is mentioned in your final report and nothing more — never retried in a loop, never a
reason to stop working.

## 3 · Work the lot end-to-end

The repo process applies unchanged — this command adds nothing to it:

- **Never state another card's status from memory** (kanban-workflow § GitHub API
  discipline, rule 6). Your own claim-time snapshot goes stale within minutes — other
  sessions move cards while you work. Before you write anything durable that names another
  card — an issue comment, a PR body, this session's final report — re-read it first with
  `npm run board:status -- <n>…` (~1 point for any number of issues, never the pool).
- Branch, implement, tests (≥ 93 % on new/modified lines), typecheck, lint.
- **Model routing** (kanban-workflow § Model routing — read the step table, it covers
  every § of this command, not just the two glamorous ones): drive the board steps, the
  gate wait and the PR/merge/`finish` steps on **Haiku 4.5**, plan and diagnose on
  **Fable 5**, execute on **Sonnet 5**, and escalate to **Opus 5** only for the wire
  (`rdo-*`), an `L` card, or a defect whose reproduction is not yet understood. Effort
  follows the card's `Size`. Via sub-agents if the session cannot switch itself.
- **Context discipline**: stay under ~250k, delegate heavy reads to sub-agents, compact
  after exploration.
- **Handoff discipline** (kanban-workflow § Sub-agent handoffs): a spawn costs a fixed
  preamble whether you send ten lines or a hundred, so spend the spawn, not the prose.
  Pass **paths and line numbers, never pasted file bodies**; give the payload as a compact
  `key: value` block, one field per line, and keep prose only where a human reads the
  result verbatim. Ask for the shortest reply that carries the answer — a verdict, a
  `file:line`, a number — and say so in the prompt: **no preamble, no restatement of the
  task, no summary of what was read, no closing offer.**
- Gate deposited (`npm run gate`, background) → Status → **Gate** → title `#<issue> · Gate`.
- Gate PASS → push, PR with **`Closes #<issue>`** in the body → Status → **PR** → title
  `#<issue> · PR`.
- Checks green → merge, `npm run finish` → Status → **Done** + one final comment
  (2–4 lines: what changed, PR number, anything the human should know) → title
  `#<issue> · Done`. **Checking is one read, not a vigil**: your gate PASS *is* the
  `bench/gate` status, and CI normally concluded while the gate was queued —
  `gh pr checks <n>` once; genuinely pending → `npm run pr:wait -- <n>` in the background,
  which *is* that ≥ 30 s interval and that deadline — never a tight loop, and never one you
  compose yourself (kanban-workflow § GitHub API discipline).

## 4 · If it fails

Three gate attempts max, each naming a different root cause — as ever. If the task cannot
land (blocked, out of reach, wrongly scoped): Status → **Needs triage**, title
`#<issue> · Needs triage`, keep `Session` filled, post one comment **in simple, non-technical English** explaining what was attempted
and what blocked it. Never leave the card in In progress/Gate/PR at session end — close your
ownership, one way or the other.

## 5 · Findings along the way

Anything discovered out of scope: new issue, added to the board in Todo (bottom), `Category`
**and the matching `cat:` / `size:` labels** set (kanban-workflow § Feeding rule — the project
field is not queryable, the label is), synthetic body — then back to the task. Never expand
your own scope with it.

Run the draft past the **`card-reviewer`** sub-agent before filing (kanban-workflow § The
card review): its verdict becomes the new issue's first comment, and on `DO NOT FILE` no
issue is created — your final report says what was found and why no card exists.
