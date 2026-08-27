#!/usr/bin/env bash
# PreToolUse(Agent) — refuses (and corrects) a sub-agent spawn whose PROMPT TEXT names an
# absolute path that resolves outside this session's own worktree but still inside the main
# checkout that hosts every worktree.
#
# THE INCIDENT THIS CLOSES ONE STEP EARLIER. worktree-scope-guard.sh's own header tells the
# story: on 2026-08-26 a `/next-task` driver spawned its execution sub-agent with a payload
# naming a file by path, the sub-agent resolved it against the wrong repository root, and the
# edit landed byte-identical in the main checkout — nothing looked wrong until the branch the
# card was meant for stayed empty. worktree-scope-guard.sh catches the WRITE that follows from
# that wrong belief; this hook (card #370) catches the belief itself, in the spawn prompt,
# before the sub-agent ever starts. The maintainer's 2026-08-27 permission-request inventory
# (17:15–22:04 CEST) counted 15 worktree-scope-guard refusals in one day, nearly all from
# execution sub-agents writing to the family root — this is the fix upstream of that count.
#
# WHAT IT REFUSES. `top` = this session's worktree root; `family` = the main checkout root that
# contains every worktree (`git rev-parse --git-common-dir`'s directory). An `Agent` tool call
# whose `prompt` names an ABSOLUTE path resolving under `family` but NOT under `top` is
# refused — the main checkout itself, or another session's worktree nested beside this one.
# Scope is absolute paths only: a bare relative mention in the prompt resolves against the
# sub-agent's own cwd, which IS this worktree, so it is never wrong-tree by construction.
#
# WHAT IT LETS THROUGH. Everything else: paths already inside `top`; anything outside `family`
# entirely — `~/SPO-Original`, `~/SPO-ASP`, the scratchpad, `~/.spo-bench` — spawn-path-guard.js
# has no opinion on those, same as worktree-scope-guard.js; every non-`Agent` tool call; a
# session running from the main checkout itself (no worktree to correct against, see the
# early exit below).
#
# THE CLASSIFIER IS BORROWED, NOT DUPLICATED. spawn-path-guard.js requires `classify` and
# `correctPath` straight from worktree-scope-guard.js (card #370: "reuse its classification, do
# not fork it") — one containment rule, read by both guards.
#
# ARMED ONLY INSIDE A SESSION WORKTREE. `top == family` means this session IS the main checkout
# — there is no "corrected worktree path" to offer, so the hook has nothing useful to say and
# exits before spawning `node` at all.
#
# Exit 0 = allow, exit 2 = block with the reason (and correction) fed back to the model.

set -uo pipefail

. "$(dirname "$0")/session-heartbeat.sh"
spo_stamp_heartbeat

payload="$(cat)"

top="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -n "$top" ] || exit 0
top="$(readlink -f "$top" 2>/dev/null)" || exit 0

common="$(git rev-parse --git-common-dir 2>/dev/null)" || exit 0
[ -n "$common" ] || exit 0
common="$(readlink -f "$common" 2>/dev/null)" || exit 0
family="$(dirname "$common")"
[ -n "$family" ] || exit 0

# Not inside a session worktree — this hook only guards spawns FROM a worktree.
[ "$top" != "$family" ] || exit 0

verdict="$(printf '%s' "$payload" | SPO_TOP="$top" SPO_FAMILY="$family" \
  node "$(dirname "$0")/spawn-path-guard.js" 2>/dev/null)" || exit 0

[ -n "$verdict" ] || exit 0
[ "$verdict" = "ALLOW" ] && exit 0

# Parse verdict as: "reason\tcorrected" (no tab = corrected is empty)
reason="${verdict%%$'\t'*}"
corrected="${verdict#*$'\t'}"
if [ "$verdict" = "$reason" ]; then
  corrected=""
fi

cat >&2 <<MSG
BLOCKED — this spawn's prompt ${reason}.

This session's worktree is:
  ${top}

A sub-agent has no memory of this conversation: it resolves every path in its prompt against
its OWN cwd, which is this worktree — not the main checkout CLAUDE.md's text names (repo at
/home/<user>/SPO-WebClient), and not any other session's worktree. A path that lands outside
this worktree either edits the wrong tree's copy of a file, or resolves to nothing at all —
and by the time worktree-scope-guard.sh would catch the resulting write, the sub-agent has
already spent a turn believing the wrong path.

MSG

if [ -n "$corrected" ]; then
  cat >&2 <<MSG
The correct path to use in the prompt is:

  ${corrected}

Rewrite the prompt with that path and retry the spawn.
MSG
else
  cat >&2 <<MSG
Rewrite the prompt to use an absolute path rooted in THIS worktree and retry the spawn.
MSG
fi

exit 2
