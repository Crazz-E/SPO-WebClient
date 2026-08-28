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
mechanically: neither source file ever emits `"permissionDecision"` as an actual JSON key.

## The trigger — deciding "uncovered" without an LLM call

`.claude/hooks/uncovered-command-guard.js` (`trigger` mode) merges every `Bash(...)` entry from
`permissions.allow` and `permissions.deny` across every settings file the harness itself layers
— the repo's `.claude/settings.json`, the gitignored `.claude/settings.local.json`, and the
user's `~/.claude/settings.json` — into one flat pattern list (prefix match for a `*`-suffixed
entry, exact match otherwise). The command is split into top-level statements with
`bash-command-parse.js`'s `statements()` (heredoc- and quote-aware, shared with
`verdict-pipe-guard.sh` and `investigation-form-guard.js`), each statement's leading `VAR=value`
assignments stripped, and **every statement must match some pattern** for the command to be
`COVERED`.

The bias is deliberately asymmetric: a false `COVERED` can only happen if the local read
under-approximates the exact files the harness itself reads — structurally excluded by
construction, not just unlikely — and would cost a human a prompt, visibly, immediately
fixable. A false `UNCOVERED` costs one Haiku call and, almost always, a deny whose corrected
form is the already-sanctioned equivalent — one extra turn, never a human. `permission_mode:
"bypassPermissions"` and the payload-borne `SPO_HOOK_LLM_OVERRIDE=` escape (same doctrine as
`SPO_ITEM_LIST_OVERRIDE`, `SPO_BENCH_PORT_OVERRIDE`: a session must not type it) both short
-circuit to `COVERED` before any pattern matching happens.

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
spike (4.5s, $0.004) that used a two-field schema and no rules file. The internal timeout
(`SPO_HOOK_LLM_TIMEOUT`, default 75s; the `settings.json` hook timeout is 100s, always above
it) is set from the real number. `--effort low` was tried and made it *worse* (thinking tokens
rose, not fell) — not used. This is still trivial next to a human being asked, and the
per-session throttle (`SPO_HOOK_LLM_MAX_PER_HOUR`, default 30) bounds the total regardless.

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
