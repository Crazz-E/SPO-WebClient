# The hook-LLM fallback layer

**Trigger:** CLAUDE.md § Automation, `uncovered-command-guard.sh` row. This document is the
mechanism; CLAUDE.md carries the one-line decision.

## The problem this closes

Nine scripted PreToolUse(Bash) guards already exist in `.claude/hooks/`, each written after a
*measured* incident: a session composed a command that matched no allowlisted prefix and no
deny pattern, stopped, and asked a human. `doc/haiku-permission-analysis.md` is the record of a
human doing that measurement by hand on 2026-08-27 — reading transcripts, classifying 43 stopped
calls, deriving 16 rules — which then became `doc/haiku-permission-plan.md` and three kanban
cards that hardened the scripted layer. That loop worked, and it is also exactly the kind of work
this repo tries not to spend a human on twice.

`uncovered-command-guard.sh` is the automated version of that same loop. It is the *tenth*
PreToolUse(Bash) guard, always last, and it fires on every Bash call. For the overwhelming
majority — anything already allowlisted, deny-listed, or caught by one of the other nine — it
costs one Node startup and exits 0 in milliseconds. For the residual, exactly the shape that
today stops and asks a human, it makes one narrow `claude -p` call and turns the answer into a
deny with a corrected form, in this repo's own house style. **The human is never asked.**

## Two layers, one direction of travel

```
scripted layer (9 guards + allow/deny patterns)  --catches most calls, ~0 cost--
        |
        | residual: matches nothing
        v
LLM fallback layer (uncovered-command-guard.sh)  --one Haiku call, denies + guides--
        |
        | worth_hardening / recurs 3x
        v
local journal -> hook:harvest -> a filed card -> a human-reviewed PR
        |
        v
back into the scripted layer, permanently, at zero further cost
```

Every card that lands moves a family of commands from the bottom loop to the top one. The
loop's own success metric — `npm run hook:stats` — is the fallback layer's invocation rate
trending down over time, not a one-time claim.

## Why this layer only ever denies

The hook I/O contract documents a JSON form (`hookSpecificOutput.permissionDecision: "allow"`)
that can, per the official reference, bypass the static allow/deny lists entirely. This layer
never uses it, and that is a deliberate constraint, not an oversight:

- The maintainer's own description of the job is "guide to the right syntax, explain what was
  wrong" — never "grant it anyway". Nothing in the ask requests live capability escalation.
- Letting an unattended, narrowly-prompted Haiku call widen its own session's permissions on the
  spot is a bigger trust delegation than anything else in this repo's hook chain does today, and
  the interaction between `"allow"` and the static allowlist is documented but not proven by a
  worked example in this codebase.
- A durable new capability is still only ever added by a human-reviewed PR to
  `.claude/settings.json`, exactly as before this layer existed. The self-learning loop
  *proposes* that PR, as a normal kanban card; it never grants it live.

So `uncovered-command-guard.sh` can only ever exit 0 (no objection — the harness's own
allow/deny/ask machinery still decides) or exit 2 (deny, reason on stderr, corrected form when
one exists). `src/__tests__/uncovered-command-guard.test.ts`'s "never-allow pin" checks this
mechanically: neither source file ever emits `"permissionDecision"` as an actual JSON key. In
`async` mode (below) the alphabet narrows further, to `{exit 0}` alone — nothing is ever denied
either, so the never-allow property holds a fortiori.

## Two modes: async (learning) and sync (steady-state)

`SPO_HOOK_LLM_MODE`, read once near the top of `uncovered-command-guard.sh`, values `async` |
`sync`, **default `async`** — an unrecognised value falls back to `async` on purpose, because
this hook must never fail *into* 40–75s of blocking over a typo in a settings file.

- **`async` (the current default — the LEARNING PHASE).** The hook fires the exact same
  classifier call, **detached**, and returns to the harness in ~150ms. The Bash command runs
  **unexamined** — identical risk to the hook being unregistered entirely (which was live on
  `main` for a time, "chore: temporarily disable the LLM fallback hook") — and the verdict still
  lands in the journal 40–75s later, so `hook:harvest`/`hook:stats` keep learning without any
  session ever waiting. What's dormant: real-time guidance — a `needs-form` verdict's
  `corrected_command` is computed and journalled, but the command already ran, so the agent
  never sees it.
- **`sync` (the original behaviour).** Blocks on the classifier call and denies with the
  corrected form, exactly as this layer worked before this mode existed.

**Why async is safe, stated precisely — not a lowered bar, a strictly better one.** In async
mode an uncovered command runs before the classifier's opinion exists — but that is bit-for-bit
the state the temporary full-disable already put on `main`, at the maintainer's own approval:
in both states the command runs regardless of what the classifier would have said. Async mode
is strictly more informative than disabled (it still journals), at identical risk.

**The detachment mechanism, measured, not guessed (2026-08-28, this machine):**

```
setsid --fork bash "$HOOKS_DIR/uncovered-command-guard.sh" </dev/null >/dev/null 2>&1 &
```

A plain `cmd &` does **not** make the hook return early — the child inherits the hook's
stdout/stderr *pipes*, and the harness reads them to EOF, which only arrives when the last
writer closes them (measured: 8031ms for a `sleep 8 &`, even though the hook *process* itself
was already gone — the block was invisible from inside the script). `</dev/null >/dev/null
2>&1` is what closes all three streams and lets the hook return in single-digit milliseconds;
`disown` and `nohup` do not touch file descriptors and do not help. `setsid` is the separate
half that lets the classifier **survive** a signal sent to the hook's original process group
after the hook exits (measured: a plain redirect, or `nohup`+`disown`, both left the child
killable; `setsid` moved it to its own session/group, where the hook's original group is
already empty). `--fork` guarantees `setsid()` always succeeds rather than depending on the
caller not already being a group leader. A `command -v setsid` check falls back to plain
`& disown` when util-linux is unavailable — still non-blocking, but killable, and that
degradation is explicit rather than silent.

**Switching back to `sync`** is a two-line PR: `SPO_HOOK_LLM_MODE`'s default in the script, and
the matching `.claude/settings.json` `timeout` (10 for async — the hook itself does only a
`trigger` check, a throttle check, and the detached launch; 100 for sync — must exceed
`SPO_HOOK_LLM_TIMEOUT`'s 75s). The exit criterion: `npm run hook:stats` showing the recurring
`rule_slug`s absorbed by the scripted layer, so the residual the classifier still has to catch
is genuinely rare.

## The trigger — deciding "uncovered" without an LLM call

`.claude/hooks/uncovered-command-guard.js` (`trigger` mode) merges every `Bash(...)` entry from
`permissions.allow` and `permissions.deny` across every settings file the harness itself layers
— the repo's `.claude/settings.json`, the gitignored `.claude/settings.local.json`, and the
user's `~/.claude/settings.json` — into one flat pattern list (prefix match for a `*`-suffixed
entry, exact match otherwise). The command is split into top-level statements with
`bash-command-parse.js`'s `statements()` (heredoc- and quote-aware, shared with
`verdict-pipe-guard.sh` and `investigation-form-guard.js`), each statement further split into
pipe/background stages (`|`, `|&`, a lone `&` that is not part of a `2>&1`/`&>` redirect —
`statements()` has already consumed `&&`/`||`, so every `|` or lone `&` left inside a statement
is real), each stage's leading `VAR=value` assignments stripped, and **every resulting stage
must match some pattern** for the command to be `COVERED`. A quoted `$(...)` or backtick
substitution that survives splitting is never treated as covered — it executes under bash but
this layer has no way to vet what is inside it.

The bias is deliberately asymmetric, and a false `COVERED` is possible two ways, only one of
which is excluded by construction: the local pattern *list* under-approximating what the
harness reads (excluded — the same files, always) versus this file's own *splitting* being less
operator-aware than the harness's real parser (not excluded — a live incident, task #369,
2026-08-28: an early version fast-path-matched `Bash(ls *)` against the raw string
`"ls ... | head -20"` before any splitting ran, so a real popup reached the maintainer for a
command this layer was built to intercept; fixed by removing that fast path and adding the
pipe/background split above). A false `UNCOVERED`, by contrast, costs one Haiku call and,
almost always, a deny whose corrected form is the already-sanctioned equivalent — one extra
turn, never a human. `permission_mode: "bypassPermissions"` and the payload-borne
`SPO_HOOK_LLM_OVERRIDE=` escape (same doctrine as `SPO_ITEM_LIST_OVERRIDE`,
`SPO_BENCH_PORT_OVERRIDE`: a session must not type it) both short-circuit to `COVERED` before
any pattern matching happens.

**Known remaining gaps, deferred rather than guessed at** — each is a claim about the harness's
own proprietary matching semantics that only a live probe (a popup, caught by the journal) can
settle, and none is implicated by the task #369 incident: whether the harness prefix-matches a
leading `VAR=value` assignment the same way this layer strips and re-checks it; whether a
trailing bare `&` (backgrounding) itself needs permission the way the reduced covered stage
does; whether a write through a redirect target (`echo x > f`) is gated independently of the
verb producing it (backstopped regardless by the write-path guards, `driver-scope`/
`worktree-scope`); and whether a heredoc-carrying command is parsed identically by the harness.
A wrong guess in any of these would either add unmeasured Haiku noise or contradict a pinned
test — and each failure mode is self-announcing, the same way task #369 was.

**Two popup classes this layer structurally cannot see, confirmed 2026-08-28.** A Bash command
that this layer marks `COVERED` exits the hook at 0 — if the harness's *own* separate heuristics
then still prompt (observed: a shell-expansion/injection heuristic overriding an allowlisted
`Bash(...)` prefix, "Contains expansion", triggered by `${PIPESTATUS[0]}`), that prompt happens
entirely outside this hook's turn and is never journalled. And any **Edit/Write** popup — the
harness's own "sensitive file" protection on `.claude/**`, the same category
`doc/haiku-permission-analysis.md` named "classifieur automode" — never reaches this layer at
all, since it is wired to `PreToolUse(Bash)` only. Both are confirmed out of scope for this
mechanism; the self-learning loop cannot self-report either, and only a human sighting can. The
`${PIPESTATUS[0]}`-vs-`$?` half of the first case was independently worth fixing regardless
(`verdict-pipe-guard.sh` was refusing its own recommended reporting form) — see its header.

## The classifier call

One `claude -p` subprocess, `--tools ""` (it can invoke no tool, so it can never reach a Bash
PreToolUse event and recurse), `--setting-sources ""` (loads no hooks block from any settings
file — confirmed 2026-08-28: `~/.claude/settings.json` on the reference machine carries zero
`hooks` entries), and `SPO_HOOK_LLM_ACTIVE=1` set before the call and checked on entry by the
wrapper itself — three independent recursion guards, any one of which alone would be enough.
`--system-prompt-file .claude/hooks/hook-llm-rules.md` replaces the default agentic system
prompt with this repo's own compact classifier rules (the class-A/B/C taxonomy and R1–R16 from
`doc/haiku-permission-analysis.md`, condensed); `--no-session-persistence`,
`--strict-mcp-config`, and `--json-schema` (a seven-field structured verdict) round it out. It
runs from a neutral `cd /tmp` so it loads no project `CLAUDE.md`.

**Real latency, dogfooded, not a toy spike:** 40–60s and ~$0.03–0.035 per call, on the full
rules file and the real seven-field schema — an order of magnitude past an early toy-schema
spike (4.5s, $0.004) that used a two-field schema and no rules file. `--effort low` was tried
and made it *worse* (thinking tokens rose, not fell) — not used.

**Production latency, measured on the real shared journal across a full day's many concurrent
sessions (2026-08-28, 159 real invocations, one shared account): p50 63.6s, p90 71.2s, max
73.7s — and 43% of lines are `verdict:"error"` / `"claude exited 124"`, the 75s ceiling firing.**
Far worse than the isolated dogfooding above; the shape (degrades under concurrent multi-session
load on one account) points at queueing/contention, not just per-call model cost. **This is why
`async` mode exists and is the default** (see "Two modes" above) — it makes this latency free to
every session by never blocking on it.

The internal timeout (`SPO_HOOK_LLM_TIMEOUT`, default 75s) governs how long the classifier call
itself is allowed to run, in EITHER mode. The `settings.json` hook `timeout` is separate and
mode-dependent: `sync` mode's hook process IS the classifier call, so its timeout (100) must
exceed `SPO_HOOK_LLM_TIMEOUT`; `async` mode's hook process only does the cheap `trigger`/
throttle check and the detached launch (~150-200ms measured), so its timeout is 10 — a hung
*hook*, as opposed to a slow classifier, should not be able to stall a session in a mode whose
whole purpose is never stalling. The per-session throttle (`SPO_HOOK_LLM_MAX_PER_HOUR`, default
30) bounds real spend in both modes; in `async` mode it is enforced by the detached child, so a
throttled call never even reaches the classifier (no cost, not just no wait).

On any failure — nonzero exit, timeout, unparseable output, a schema violation — the wrapper
**fails closed**: a generic, honest deny, journalled as `verdict: "error"`, never a hang, never
a silent allow.

## The journal

Every invocation appends one line to `${SPO_BENCH_DIR:-$HOME/.spo-bench}/hook-llm/journal.jsonl`
(global, not per-worktree — the harvest wants the cross-session view):

```json
{"ts": "...", "session_key": "...", "branch": "...", "agent": "driver|subagent",
 "command": "...", "verdict": "guide|gap|out-of-scope|error|throttled",
 "classification": "needs-form|capability-gap|out-of-scope|\"\"",
 "reason": "...", "corrected_command": "...", "worth_hardening": true|false,
 "rule_slug": "...", "harden_target": "allowlist|guard|docs|none", "model": "...",
 "latency_ms": 1234}
```

`verdict` is what the wrapper *did* (map: `needs-form`->`guide`, `capability-gap`->`gap`,
`out-of-scope`->`out-of-scope`, plus the two failure states `error`/`throttled`); the other
fields are the classifier's own structured answer, unmodified. This file is never read by
anything except `scripts/hook-llm-harvest.js` and `scripts/hook-llm-stats.js` — never GitHub,
never a notification.

**In `async` mode**, the line is written by a detached child 40–75s after the command actually
ran, so `ts` is *completion* time, not launch time — journal order is not command order.
Neither reader cares: `hook:harvest` picks the oldest candidate group via a `Math.min` over
parsed timestamps (order-insensitive), and `hook:stats` buckets by ISO week, where a sub-2-minute
skew is irrelevant. Concurrent appends from several sessions' detached children stay atomic —
`O_APPEND` plus one sub-`PIPE_BUF` `write()` per line. Two throttle properties follow from the
same lag: a throttled line still counts toward the next hour's `runThrottle` check, so a session
that hits the cap stays capped for an hour after its *last* uncovered command, not its first;
and because the counter lags launches by up to 75s, a burst of uncovered commands inside one
window can overshoot `SPO_HOOK_LLM_MAX_PER_HOUR` slightly (bounded by how many Bash calls a
session can issue in 75s — the busiest real session-hour measured so far is 28 against a cap of
30). Revisit only if `hook:stats` ever shows a session-hour above the cap; no in-flight
accounting is built speculatively.

## The harvest — local dedup, then one card

`npm run hook:harvest -- --take` groups journal entries with `verdict` in
`{guide, gap, out-of-scope}` by **signature** (the classifier's `rule_slug`, sanitised; a hash
of the command if the slug is somehow empty). A signature is eligible when no
`${SPO_BENCH_DIR}/hook-llm/filed.jsonl` entry marks it `FILED`/`DO-NOT-FILE`/`ABANDONED`
(terminal, forever) or a fresh `CLAIMED` (a stale one, older than an hour, is reclaimable — one
dead session can never permanently block a real candidate), and either any sighting carries
`worth_hardening: true` (the classifier's own judgement, trusted at first sighting because
`card-reviewer` is the gate before anything is filed) or it has recurred at least 3 times
regardless of that flag. The **oldest** eligible signature is taken, one per call — this bounds
both GitHub cost and how much of a session's time the loop can spend.

`--take` writes a draft to `${SPO_BENCH_DIR}/hook-llm/drafts/<signature>.md` (sample commands,
the classifier's reason and corrected form, the proposed `Category`/`Size`/`Area`) and marks the
signature `CLAIMED`. `/next-task § 0.5` reads the draft, runs it past `card-reviewer` exactly as
§ 5 already does for a split or a named request, files on `FILE`/`FILE AMENDED`, and calls
`--resolve <signature> --verdict FILED --issue <n>` (or `DO-NOT-FILE`) to close the loop. No
step in this path ever calls the GitHub API except the one `gh issue create` a real filing needs
— matching `doc/kanban-workflow.md § GitHub API discipline`: this journal and its markers ARE
the local surface that rule requires, so nothing here polls GitHub to check "has this already
been filed".

`Area` follows `harden_target`: `guard` -> `bench` (the fix lands in `.claude/hooks/**`),
`allowlist` -> `ci` (the fix lands in `.claude/settings.json`, the `ci` catch-all row), `docs`
-> `docs`.

## Triage is not this hook's decision

The hook never decides a card is stuck — it only ever denies-with-guidance or, rarely, logs an
honest `capability-gap`. `.claude/commands/next-task.md § 4`'s existing three-attempts-then
-`Needs triage` rule is the only thing that ever moves a card, unchanged by this layer. This
mirrors the maintainer's own framing: the hook mechanism should never carry the weight of
deciding when a session is stuck — that stays the dev process's job.

## Checking "usage → 0", not asserting it

`npm run hook:stats` reads the journal only (no GitHub, no LLM) and prints a weekly invocation
trend, a verdict breakdown, the top recurring uncovered shapes with their filed status, and an
error rate. As `hook:harvest`-filed cards land, the corresponding `rule_slug` should stop
appearing in new journal lines — that absence, over weeks, is the loop's own proof, read
locally, on demand.

## What this deliberately does not do

- No live capability grant, ever — see "Why this layer only ever denies" above. Revisiting that
  needs its own card and a worked proof of the allow/allowlist interaction.
- No coverage of non-Bash tools (MCP calls, a deferred `WebFetch`, the `Agent` matcher) — the
  journal will name real gaps there with evidence before anything is built for them.
- No classifier escalation tier (e.g. Fable 5 for RDO-adjacent commands) — the blast radius of a
  wrong verdict is one over-denied turn; if the journal's error rate says otherwise, that is a
  card, filed by the loop itself.
- No new persistent daemon and no bench-worker change — the harvest rides `/next-task`'s
  existing cadence. The only persistent process on this machine remains the bench worker.
- No auto-application of hardening — a filed card is still claimed, reviewed, gated and merged
  like any other change; this loop accelerates the proposal, never the landing.
- No retrofit of pre-existing worktrees — they read their own copies of hooks and settings, as
  every other hook change in this repo already does.
- No retroactive guidance in `async` mode — no `Stop`/`PostToolUse` hook that reads the journal
  and surfaces a late `corrected_command` back to the agent. `PreToolUse` has no channel to a
  turn that already completed; recovering this needs a different hook event, cross-process state
  to correlate a verdict with the turn that caused it, and a policy for what to say about a
  command that already ran successfully on its own. `sync` mode is what restores this, in full.
- No daemon or request queue for the classifier — the shape the production latency numbers might
  seem to argue for. `async` mode makes the latency free without one, which removes the
  motivation; the only persistent process on this machine remains the bench worker (unchanged
  from the bullet above).
- No in-flight throttle accounting for the lag `async` mode introduces (see "The journal") —
  the overshoot is bounded and self-announcing via `hook:stats`, not worth speculative machinery.
