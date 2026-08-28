#!/usr/bin/env bash
# PreToolUse(Agent) — refuses a spawn whose PROMPT names a path rooted in the main checkout (or
# another session's worktree) instead of this session's own worktree, before the sub-agent ever
# gets a chance to resolve it wrong.
#
# THE INCIDENT THIS CLOSES, ONE SPAWN EARLIER. `worktree-scope-guard.sh` already blocks the
# wrong-tree WRITE itself (Edit/Write/Bash targeting the main checkout) — but by the time that
# write is attempted, the sub-agent has already spent a turn reading the wrong file, or has
# already told the user it changed something it did not (card #370: 15 of 24 daily refusals
# were exactly this — a sub-agent catching its OWN wrong-tree write, one full turn after the
# spawn that set it up to do so). `next-task.md` § Handoff discipline requires every spawned
# path to be absolute and worktree-rooted; this hook enforces that requirement at the SPAWN
# itself, scanning the Agent payload's `prompt` field before it launches — catching a
# family-rooted path (the main checkout, or a sibling session's worktree) the moment the
# payload is built, not the moment a write lands.
#
# WHAT IT REFUSES. Any absolute path token in the payload's `prompt` field that resolves under
# `family` (the main checkout root that contains every worktree) but NOT under `top` (this
# session's own worktree) — the same THREE REGIONS `worktree-scope-guard.js` classifies a write
# with (see that file's header), applied to prompt TEXT instead of a tool_input path.
#
# WHAT IT LETS THROUGH. A relative path — nothing here can know what cwd the sub-agent will
# resolve it against, so this fails open exactly like `worktree-scope-guard.js` already does
# for a relative operand. A path outside `family` altogether — the scratchpad, ~/SPO-Original,
# ~/SPO-ASP, ~/.spo-bench. Every path already inside `top`. A payload for any tool other than
# `Agent` (the matcher in settings.json already restricts this, `spawn-path-guard.js` checks it
# again so it can be driven directly in tests).
#
# COSTS NOTHING IN THE COMMON CASE. Same shape as `worktree-scope-guard.sh`: strip `top` from
# the payload; if `family` still appears, only then is `node` spawned to scan the prompt text
# for real. Every other call is a bash substring test and exit 0.
#
# Exit 0 = allow, exit 2 = block with the offending/corrected paths fed back to the model.

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

# THE COMMON CASE, and the reason this hook is nearly free: a spawn whose prompt only ever
# names paths inside this worktree never has a reason to spell out `family`, so there is
# nothing left to resolve.
without_top="${payload//$top/}"
if [[ "$without_top" != *"$family"* ]]; then
  exit 0
fi

verdict="$(printf '%s' "$payload" | SPO_TOP="$top" SPO_FAMILY="$family" \
  node "$(dirname "$0")/spawn-path-guard.js" 2>/dev/null)" || exit 0

[ -n "$verdict" ] || exit 0
[ "$verdict" = "ALLOW" ] && exit 0

case "$verdict" in
  BLOCKED*) ;;
  *) exit 0 ;;
esac

pairs="${verdict#BLOCKED}"
pairs="${pairs#$'\n'}"

cat >&2 <<MSG
BLOCKED — this spawn's prompt names a path outside this session's worktree.

This session's worktree is:
  ${top}

At least one path in the payload resolves under the main checkout (${family}) but outside that
worktree — either the main checkout itself, or another session's worktree nested beside this
one. That is almost always a relative path resolved against the wrong repository root
(CLAUDE.md § Environment names the main checkout, not any one worktree), or a hand-typed
absolute path that drifted. next-task.md § Handoff discipline: every spawned path must be
absolute and rooted in THIS worktree — the enforcement point is exactly this hook.

Offending path -> corrected path (retry the spawn with the corrected path):
MSG

while IFS=$'\t' read -r offending corrected; do
  [ -n "$offending" ] || continue
  printf '  %s\n  -> %s\n\n' "$offending" "$corrected" >&2
done <<< "$pairs"

exit 2
