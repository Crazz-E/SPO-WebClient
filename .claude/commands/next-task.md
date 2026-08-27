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
`board:sessions`, `board:status`, `board:wait`, `bench:wait`, `pr:wait`. Call each in
exactly the form written here —
`npm run <alias>`, arguments after `--` — from the worktree you are in, with **no `cd`
prefix and no shell composition around it**. None of them needs a working directory other
than yours.

That form is not cosmetic: `npm run …` is allowlisted, so these calls never stop to ask.
A `cd … && …` compound, a variable assignment, a `[ -f … ] &&` guard or the raw
`bash scripts/…` path matches no allowlist entry and turns a scripted step into a permission
prompt — which is the one thing these aliases exist to remove. Compose no GraphQL by hand
either: raw `gh api graphql` deliberately still prompts.

**A wait is a scripted step too.** Every "wait for X" in this command has an allowlisted
form, and none of them is a loop you write: `npm run gate` and `npm run test:live` wait for
their own job, `npm run bench:wait -- <job-id>` re-attaches to one whose wait was
interrupted, `gh pr checks <n> --watch` blocks on CI, `npm run board:wait` on an exhausted
quota, and `npm run pr:wait -- <n>` on a pull request leaving the merge queue. Composing
`until … do sleep … done` instead stops to ask the human **and** polls GitHub under the
30 s floor — `.claude/hooks/poll-loop-guard.sh` refuses that shape and names the form.

**Multi-line text goes through a file, never through substitution.** A commit message, a PR
body or a long comment written as `git commit -m "$(cat <<'EOF' …)"` is compound shell and
stops to ask. Write the text to a file, then `git commit -F <file>`,
`gh pr create --body-file <file>` or `gh issue comment --body-file <file>` — all three are
plain prefix-matched calls that pass. Same reasoning as the aliases: the content belongs in
a file, never in the command line.

**And that file goes in the scratchpad, OUTSIDE the worktree** — never beside the code. A
commit message or a PR body written inside the tree dirties it, and a dirty tree is refused
at gate deposit (exit 2) whoever wrote it; `driver-scope-guard.sh` refuses it earlier and
says so. All three flags read the file happily from anywhere.

**If `Grep`, `Read` or `Glob` are deferred, load them first.** When native tools are unavailable
in this harness, the risk is silent truncation — a shell `grep`, `find` or `cat` returns an
incomplete result and appears to succeed. If you detect a deferred tool, load its schema with
`ToolSearch select:Grep,Read,Glob`. If that load fails, delegate the read to a sub-agent
(which has native tools) or stop and say so. Never fall back to shell equivalents — they
bury the problem, just as `.claude/hooks/poll-loop-guard.sh:25-29` refuses the form but names
the alternative: a rule that names no workaround is a rule a model routes around.

## 0 · Is `main` red?

The bench proves branches; one nightly run proves `main` itself
([bench-worker.md § The nightly proof of `main`](../../doc/bench-worker.md)). Read its
result before claiming anything — run the alias and branch on its **exit code**, never on
the printed text:

```bash
npm run bench:nightly
```

Exit **0** — not red. Proceed to § 1.

Exit **1** — **RED**, and the one printed line already carries the `sha`, the `detail` and
the `logFile` verbatim. While it is red:

- claim **no ordinary card** — the only admissible work is the repair;
- **merge `origin/main` into no branch**, in this session or any other: updating from `main`
  must never import a defect.

Take the open issue titled `Nightly: main is red` if one exists; otherwise file it (Category
🔴 Defect, `cat:defect`, area from where the failure lands) quoting the `sha`, the `detail`
and the `logFile` straight off that line, then claim it and drive it like any other card.

Exit **2** — **UNKNOWN**: the run never learned anything about `main`. Stop and say so —
UNKNOWN is never treated as green.

## 1 · Pick — the first Todo card whose ground is free

**One read for the whole claim.** Run **the claim read** — `npm run board:claim`, the
composite query kept in `scripts/claim-read.sh` (~2 GraphQL points per page, 4 on today's
116-item board; never `gh project item-list`, which costs ~103 and is why the board went
unreadable on 2026-08-25). `status`, `session` and `area` come back on every item, and the
script has already done the walk: it prints, in order, `rateLimit { cost remaining resetAt }`
— state the last `remaining` you saw in your final report (kanban-workflow § GitHub API
discipline); an `items: N/M` line (N = M proves the pool came back whole; a mismatch is a
failed read, never a short board); `hidden: …`; `busy areas:`; a `walk:` block; then
`candidates: N` (or `candidates: none`), the candidate `item …` lines themselves (Status =
**Todo**, `Session` empty, in priority order), and finally the `#n blocked by …` lines for
whatever it skipped as blocked.

The `walk:` block carries a `skip #n: <reason>` line for every card the script ruled out —
already the named skip your final report must repeat verbatim (`#120 skipped: blocked by
#108`), never silently — followed by the `<rank> #n area=<a> <title>` lines it kept, still in
the human's priority order. A card's blockers are not on the card — the relation lives on the
issue — so this `skip` reasoning, and the `#n blocked by …` tail, are what the claim read
resolved for you in that one call (kanban-workflow § Blocking order).

1. **Compute the busy set** (kanban-workflow § One session per area) — already done: it is
   the `busy areas:` line above. `docs` never enters the busy set — it does not block.
2. **Walk Todo top-down** — already done too: read `candidates: N` (or `candidates: none`,
   in which case skip straight to step 6). Candidate `1` is the card to take — list order is
   the human's priority, and an **empty** `Area` is claimable and blocks nothing. With
   `$ARGUMENTS`, take the item named there instead: if it appears as a `skip` line in the
   walk, **stop and say so**, quoting that line — ownership is sacred, and so is the order.
3. **Claim it** (§ 2 below) — pass `--area <a>` once step 4 has filled one.
4. **If `Area` was empty**, do not classify it yourself: spawn a Sonnet 5 sub-agent, effort
   low, payload = card title/body + the partition below (kanban-workflow § The areas is the
   authority for *why*). It returns one word — **write it before** moving the card to In
   progress, as `npm run board:take -- <issue> --area <that-word>`. `card-reviewer` already
   checks `Area` at filing, so an empty one means a legacy card. Do NOT route it to Needs
   triage — the existing pool holds such cards and they are claimable.

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

   `docs` comes first so a Markdown file is documentation wherever it lives; `ci` is the last
   row and the catch-all; where two rows could match, the earlier row wins. Full rule and
   rationale: [kanban-workflow.md § The areas](../../doc/kanban-workflow.md).
5. **If the area you just determined turns out to be busy**: run `npm run board:take --
   <issue> --release`, which will clear `Session`, leave the card in Todo with `Area` now
   filled. Then go back to step 2 **reusing the first claim read** — the pool is never
   re-read for a back-off. The card never reached In progress, so this is the same back-off
   as a lost claim race — ownership law 3 is not violated. The session title follows: it
   names the card you end up holding, so a back-off leaves it to be rewritten by the next
   claim, never pointing at a card you released.
6. **If no Todo card is claimable, stop and say so.** Do not take a busy card, do not take a
   blocked one, and do not invent work outside the board.

**A blocked card is never written to.** `Session` stays empty, Status stays **Todo**, no
comment: nothing failed and nobody owned it. It is not Needs triage.

**Is a reservation live?** `npm run board:claim` already answers this inside `busy areas:` —
it folds in the heartbeat scan and the no-heartbeat fallback, so there is nothing left here to
compute by hand. The rule it applies: a card's reservation is live while the heartbeat of the
worktree standing on the branch its `Session` field names is younger than
`SPO_WORKTREE_IDLE_MIN` (default **120** minutes); no heartbeat for that branch → it falls
back to that branch's last commit date on `origin`, same window. Neither signal → the area is
free, and the card's `Session` field is still left untouched: what expired is the ground
reservation, never the ownership. `npm run board:sessions` remains the human-facing view of
the same heartbeats, for a look by eye.

## 2 · Claim (handshake)

The whole handshake is one call — write, re-read and verify, never by listing the pool
again:

```bash
npm run board:take -- <issue>
```

Branch on its **exit code**, never on the printed text:

- **0 CLAIMED** — `Session`, Status → **In progress** and, if you passed it, `Area` all
  landed and were verified inside the same call. Continue to the rename below.
- **2 not on board / usage** — the issue is not a Todo candidate, or the arguments are wrong.
  Stop and say so.
- **3 LOST** — someone else's identity was already in `Session`: you lost the race. Take the
  next candidate from the claim read you already hold and try again. One card at a time.
- **4 RATE_LIMITED, write failed** — nothing landed, the card is untouched, you own nothing
  (**the write half decides**, kanban-workflow § GitHub API discipline, rule 5). Claim
  nothing else: wait for the bucket once with `npm run board:wait` — it reads the `reset`
  from `gh api rate_limit` itself and returns immediately when the bucket was never exhausted
  — then run `board:take` again.
- **5 RATE_LIMITED, write landed, re-read pending** — the card is provisionally yours: **do
  not walk away half-claimed**. Wait for `reset` with `npm run board:wait`, then run
  `board:take` again to finish the re-read; if this session must end first, name the card and
  the unverified write in your final report so the human can read the board.
- **6 FINISHED WORKTREE** — `npm run finish` already ran here, so this session is over and
  nothing was read from or written to the board. **Do not claim a second card in it.** Say so
  and stop: a new card belongs to a new session, which gets its own worktree and its own
  branch. Reusing a finished one puts the second card's commits on a branch whose name still
  answers with the first card's merged PR, and every deletion `finish` makes hangs off that
  answer (sessions #324 and #328, 2026-08-27).

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
- Two yes/no questions, asked before every action in § 3: (i) "Will this action create,
  edit or delete a git-tracked file?" Yes → this is implementation: spawn the execution
  sub-agent. The driver never edits a tracked file itself. (ii) "Is the exact command I am
  about to run written verbatim in this file, or is it one of the listed npm aliases?" No →
  stop and delegate; never compose one.
- Why (i) is the one that matters: on 2026-08-26 a Haiku driver met an S-sized card with a
  one-sentence criterion and an understood reproduction, and rewrote a whole script — it had
  a card and a criterion, and neither told it to stop. "Am I about to edit a tracked file" is
  answerable without either.
- **Question (i) is now enforced as well as asked** — keep asking it, because answering it
  costs nothing and being refused costs a turn. `.claude/hooks/driver-scope-guard.sh` refuses
  the driver's own writes to tracked files — both doors: `Edit`/`Write`, and the Bash verbs
  that reach the tree without them (`sed -i`, a `>` redirection, `rm`, `mv`, `chmod`,
  `git rm`, `git restore`, `npm run format`). It arms on a **verified claim** — `board:take`
  writes the marker — and tells the driver from its own sub-agent by the `agent_id` the
  PreToolUse payload carries only inside a Task worker; the sub-agent's writes pass
  untouched. A BLOCKED reply is answered by **spawning the execution sub-agent**, never by
  retrying the edit and never by reaching for another shell verb: they are all refused the
  same way. It is a guardrail, not a sandbox — but the guard, `settings.json` and this file
  are themselves tracked, so a driver drifting toward disabling it is stopped by it.
  **Nothing to release by hand**: every way ownership closes releases it — `--release`,
  `board:move … Done`, `board:move … "Needs triage"`, and `finish` (including the retire path,
  where the session keeps working). The driver's own git moves are untouched: the `main`-moved
  merge, `git checkout -b`, `git add`, `git commit`, `git push`. What is refused is the driver
  *authoring* a change, never git moving the branch under it.
- **Implementation is never driven by the session on Haiku** — kanban-workflow § Model
  routing routes execution to Sonnet 5, or Opus under the escalation rule; Haiku appears on
  no execution row.
  An attempt is ONE spawn: the execution sub-agent branches, writes, tests (≥ 93 % on
  new/modified lines), typechecks and lints, and self-checks, then returns a diff and the
  invariant report (below). It STOPS BEFORE the gate — only the depositing worktree can gate,
  so the driver deposits `npm run gate` itself.
- The driver keeps an attempt **ledger**: one line per attempt, `attempt N | root cause |
  outcome`. The three-attempts-max rule (§ 4) becomes a string comparison over that ledger —
  two attempts naming the same root cause is a stop, and Haiku can check that.
- On gate FAIL the driver spawns a Fable 5 diagnosis sub-agent (effort high), payload = the
  diff + the gate log path + the ledger; its one-line root cause is appended to the ledger.
- The driver does not "review" the returned diff — pretending a Haiku driver reviews a diff is
  the fiction that produced the incident. The gate and the mechanical invariant check answer
  whether the change is safe; the semantic question — whether the change actually meets the
  card's criterion and sits coherently in the code — is answered by the delegated
  `change-validator` sub-agent (below), never by the driver reading the diff itself.
- **The invariant report.** The plan step (Fable) emits an invariant block: each invariant a
  **verbatim quote** — of any length, not restricted to a single line — plus the `file:line`
  (or `file:start-end` for a quote spanning several lines) carrying it. The driver copies the
  block unmodified into every execution spawn, and the sub-agent returns one row per invariant:
  the quote plus `HELD` or `CHANGED`, plus a final row listing the files it changed as
  `git status --porcelain` output (the driver compares this to what it asked for). The driver's
  check below reads the quote against the file as it now stands — never a diff, never `grep`
  over added/removed lines.
- **Driver's check, all mechanical**: (1) **Before the invariant check**, verify expected files
  actually changed: `git status --porcelain` must name each file the spawn was told to edit.
  Empty output where edits were expected is a **failed attempt**, not a clean one — the
  sub-agent either did not run in the worktree or did nothing. (2) Verify the main checkout is
  untouched: `git -C <main checkout> status --porcelain` must be empty. A worktree session that
  dirties `main` has done something nobody asked for. (3) For each HELD row, extract the quoted
  text from the invariant and normalize it — strip comment markers (`#`, `**`, a leading `-` or
  `*`), collapse all whitespace, line breaks included, to single spaces — then check whether
  that normalized text is a substring of the same normalization applied to the actual file at
  the invariant's `file:line`/`file:start-end`. The check is over the resulting file, not over
  the patch: `git diff` never enters it, so re-wrapping an invariant (the same words, laid out
  on different lines) still reads as present, and rewording it (different words, whatever the
  layout) reads as absent. The working form:
  `sed -n '<start>,<end>p' <file> | sed 's/^[#*-]*\s*//' | tr '\n' ' ' | tr -s ' '`, then a plain
  substring test of the normalized quote against that output. Absent → the row is a lie and the
  attempt fails; a hunk that touched the invariant's own words is caught the same way, because
  its normalized text is now gone or altered. **Any CHANGED row halts the attempt** — a
  delegated implementation may not amend an invariant; only the human may. On 2026-08-26 a
  driver rewrote the comment carrying an invariant so it agreed with the new code — under this
  check that reads as a failed row, not as agreement.
- **Worked example**, using a real invariant from `scripts/claim-read.sh:16-18`:
  ```
  # Never read the pool with `gh project item-list` in a session: same data, ~103 points
  # (kanban-workflow § GitHub API discipline). That is how the board went unreadable on
  # 2026-08-25.
  ```
  **Re-wrapped** — same words, different line breaks, e.g. after an unrelated edit above it
  shifted the hunk:
  ```
  # Never read the pool with `gh project item-list` in a session: same data,
  # ~103 points (kanban-workflow § GitHub API discipline). That is how the
  # board went unreadable on 2026-08-25.
  ```
  Both normalize to the same string (`Never read the pool with ... went unreadable on
  2026-08-25.`) — the substring test finds it → **HELD**, correctly, even though every line in
  the file changed.

  **Reworded** — same idea, different words:
  ```
  # Do not use `gh project item-list` to read the pool during a session: it costs about 103
  # points for the same data (kanban-workflow § GitHub API discipline), which broke the board
  # on 2026-08-25.
  ```
  The normalized quote is no longer a substring of the normalized file text — the substring
  test fails → **CHANGED**, and the attempt halts.
- **`main` moved past your `baseMain`** — the push hook's `NOTE:` is informational, not a
  judgement call: run `git diff --name-only <baseMain>..origin/main` and intersect it with
  the changed paths on your branch (Haiku, low effort — two commands and an emptiness test,
  not a judgement). Non-empty → same ground: merge `origin/main` in and re-gate. Empty → the
  note is informational, proceed.
- **A merge conflict** (from the `main`-moved merge above, or any other): route it to a
  sub-agent, Sonnet 5, effort per Size — Opus 5 if any conflicted path matches the escalation
  rule (`src/shared/rdo-*`, `src/server/rdo.ts`, `rdo-members.ts`, session phases). It returns
  the resolved files plus the same invariant report (above); the driver's check is identical.
- **Model routing** (kanban-workflow § Model routing — read the step table, it covers
  every § of this command, not just the two glamorous ones): drive the board steps, the
  gate wait and the PR/merge/`finish` steps on **Haiku 4.5**, plan and diagnose on
  **Fable 5**, execute on **Sonnet 5**, and escalate to **Opus 5** only for the wire
  (`rdo-*`), an `L` card, or a defect whose reproduction is not yet understood. Effort
  follows the card's `Size`. Via sub-agents if the session cannot switch itself. Each attempt
  above is that one spawn, on the model this table names — never the driver's own model.
- **Context discipline**: stay under ~250k, delegate heavy reads to sub-agents, compact
  after exploration.
- **Handoff discipline** (kanban-workflow § Sub-agent handoffs): a spawn costs a fixed
  preamble whether you send ten lines or a hundred, so spend the spawn, not the prose.
  Pass **paths and line numbers, never pasted file bodies**; give the payload as a compact
  `key: value` block, one field per line, and keep prose only where a human reads the
  result verbatim. Ask for the shortest reply that carries the answer — a verdict, a
  `file:line`, a number — and say so in the prompt: **no preamble, no restatement of the
  task, no summary of what was read, no closing offer.** **Every file a spawn names must be an
  absolute path rooted in this session's worktree** — a relative path resolves against whatever
  the sub-agent believes the repository root is, and nothing in words ever tells it that
  root is the worktree rather than the main checkout CLAUDE.md's own text points at
  (`repo at /home/<user>/SPO-WebClient`). A spawn that must run in a specific directory
  carries it as an **instruction with verification the agent performs and reports**:
  `git rev-parse --show-toplevel` — its prefix is allowlisted, so it costs no permission
  prompt — and the returned reply shows where it actually ran, so the driver can verify
  it landed in the right place.
- Implementation and the driver's mechanical checks done → **commit → push → open the PR
  with `Closes #<issue>` in the body**. The PR precedes the gate, not the reverse: the worker
  refuses a sha that is not on `origin` (`scripts/bench-gate.sh:45-50` — "NOT PUSHED: … is not
  on origin, so the worker cannot fetch it"), and `ci.yml` triggers on `pull_request`, so a
  branch with no PR has no CI run for its sha and the worker replays the whole Jest suite on
  the exclusive bench — the slowest path, which has already killed a gateway mid-job
  (CLAUDE.md § The gate already says this — keep the two consistent). ⚠ Note the wrinkle so a
  driver is not surprised: the `Pull request linked to issue` project workflow sets `Status` =
  PR the moment the PR is opened, so the `board:move … Gate` below is correcting that automatic
  move, not fighting it.
- **Post-spawn checklist** — before depositing the gate, run these five checks. Each one is
  **emitted by the plan step as a runnable command or text**, not a prose instruction; the
  driver only runs them and reads an exit code. Steps 3 and 4 are required only when the
  card replaces existing behaviour (the plan says whether it is a rewrite). Step 1 is a rule:
  if a spawn fails because a tool does not exist here, that attempt returns to the plan step
  and **does not** consume one of the three gate attempts.
  1. **Is the plan executable?** Run the plan's first command once, before spawning. If it
     fails (e.g. `jq` not found), the design is not executable here — return to the plan step
     for a revised design.
  2. **Prototype before delegating** — policy, not a driver behavior. The plan provides runnable
     text, prototyped where feasible.
  3. **Output equivalence** (rewrites only) — run the `comm` command emitted by the plan,
     comparing old sorted output to new sorted output. No output means the rewrite is faithful.
  4. **Exercise failure paths** (rewrites only) — run each degenerate-input command emitted by
     the plan. All must fail loudly (exit non-zero with a legible error).
  5. **Sweep for falsified statements** — run each `grep` command emitted by the plan against
     `doc/`, `.claude/`, and `CLAUDE.md` to check whether the change falsifies documented
     claims. No matches means no falsifications.
- Gate deposited (`npm run gate`, with the tool's `run_in_background` — **never a trailing
  `&`**, which makes the shell report the fork and returns 0 whatever the gate found) →
  `npm run board:move -- <issue> Gate` (`MOVED #<issue> -> Gate`, same exit codes as § 2) →
  title `#<issue> · Gate`. A backgrounded verdict command must stand alone — no `;` or `&&`
  chained after it either. A backgrounded compound command's exit code is from the LAST
  command, so `cmd; echo $?` reports the echo, not the verdict.
- **The gate's verdict is its exit code, never the printed report** — same rule as § 0's
  `bench:nightly` read: `0` PASS · `1` verdict not passing · `2` refused at deposit (dirty
  tree) · `3` worker down · `4` wait timed out. The report's `=== bench job … — PASS` banner
  is NOT the verdict — it prints first, largest, and reads as authoritative whatever the
  exit code actually says. The other machine-readable surface is
  `~/.spo-bench/verdicts/<sha>.json`.
- Gate PASS (exit 0) → `npm run board:move -- <issue> Validation` → title
  `#<issue> · Validation`.
- **Spawn the `change-validator` sub-agent**
  ([.claude/agents/change-validator.md](../agents/change-validator.md)) — Fable 5, effort high
  regardless of the card's `Size`,
  escalated to Opus 5 under the existing wire rule (`src/shared/rdo-*`, `src/server/rdo.ts`,
  `rdo-members.ts`, the session phases) and also as the fallback when Fable is unavailable;
  **never Sonnet 5** — it is the executor, and a same-model judge ratifies the author's own
  blind spots. Payload: the diff, the card's criterion, the invariant block, the gate report
  path. It judges two things only — adequacy to the goal and coherence of integration — and
  returns one of three verdicts:
  - `PASS` → `npm run board:move -- <issue> PR` → title `#<issue> · PR`, then the merge step
    below.
  - `PASS WITH FINDINGS` → same as `PASS`; each finding is routed to the `card-reviewer`
    sub-agent exactly as every other draft (§ Feeding rule) — the validator files nothing
    itself, and a `card-reviewer` verdict of `DO NOT FILE` creates nothing. **Findings never
    block the merge.**
  - `REJECT` → a **failed attempt**: append the one-line root cause to the ledger
    (`validation N | root cause | REJECT`), move
    `npm run board:move -- <issue> "In progress"`, re-execute the fix, then **re-commit,
    re-push and re-gate** — the worker only judges a pushed sha, so a corrected attempt must
    be pushed again before it can be gated again. `REJECT` carries its own budget of **3**, separate from the implementation-attempt budget (§ 4) — three `REJECT`s ends the task at
    Needs triage the same way three failed gate attempts do.
- Checks green → merge, `npm run finish` → `npm run board:move -- <issue> Done` + one final
  comment (2–4 lines: what changed, PR number, anything the human should know) → title
  `#<issue> · Done`. **Checking is one read, not a vigil**: your gate PASS *is* the
  `bench/gate` status, and CI normally concluded while the gate was queued —
  `gh pr checks <n>` once. Genuinely pending → `gh pr checks <n> --watch --interval 20`,
  which blocks until every check concludes and exits non-zero if any failed. Read that exit
  code, not the printed table. Then `gh pr merge <n> --merge` **enqueues** — the queue lands
  it later, so the wait after the merge is a different wait: `npm run pr:wait -- <n>` in the
  background, which carries the ≥ 30 s floor and both bounds of the discipline and answers
  in its exit code (0 merged · 1 closed unmerged · 4 still open). Never hand-roll either
  poll, and **never a tight loop**: a `while`/`sleep` loop is compound shell, so it stops to
  ask for permission, and it re-reads GitHub far harder than the sanctioned forms do
  (kanban-workflow § GitHub API discipline). **No merge without a `change-validator` verdict
  for the sha being merged** — this is prose today, not an enforced rule: unlike
  `.claude/hooks/driver-scope-guard.sh`, nothing in the tree checks it, so do not promise an
  enforcement that does not exist.

## 4 · If it fails

Three gate attempts max, each naming a different root cause — as ever. If the task cannot
land (blocked, out of reach, wrongly scoped): `npm run board:move -- <issue> "Needs triage"`,
title `#<issue> · Needs triage`, keep `Session` filled, post one comment **in simple,
non-technical English** explaining what was attempted and what blocked it. Never leave the
card in In progress/Gate/Validation/PR at session end — close your ownership, one way or the other.

## 5 · Stay on the card

A session solves and implements the card it claimed, and its final report covers that card
only. What it met on the way — an unrelated snag noticed while reading, a smell in a file it
did not change, a "valuable but out of scope" remark — is neither filed nor narrated: no new
issue, no closing section of the report. A test session or a requested audit finds it again,
at a moment where someone asked for it. Never expand your own scope with it, and never widen
the report to make the detour visible.

The one card a session still files is the **split** — the claimed task turned out to be two
and the half you are not doing needs a home — or a card the maintainer asked for by name. Then:
new issue, board Todo (bottom), `Category`, `Size` and `Area` set **and the matching `cat:` /
`size:` labels** too (kanban-workflow § Feeding rule — the project field is not queryable, the
label is), synthetic body — then back to the task.

| `Category` | label | | `Size` | label |
|---|---|---|---|---|
| 🔴 Defect | `cat:defect` | | S | `size:S` |
| 🟠 Latent trap | `cat:latent-trap` | | M | `size:M` |
| 🟡 Feature/Gap | `cat:feature` | | L | `size:L` |
| ⚪ Observation | `cat:observation` | | | |
| 📚 Doc/Infra | `cat:doc-infra` | | | |

Authority for *why*: [kanban-workflow.md § Feeding rule](../../doc/kanban-workflow.md).

Run the draft past the **`card-reviewer`** sub-agent before filing (kanban-workflow § The
card review): its verdict becomes the new issue's first comment, and on `DO NOT FILE` no
issue is created and nothing is said of it.
