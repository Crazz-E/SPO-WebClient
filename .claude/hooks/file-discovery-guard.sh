#!/usr/bin/env bash
# PreToolUse(Bash) — routes find and grep commands to Glob and Grep tools.
#
# Card #398, related #395. Find and grep work fine, but the Glob and Grep tools provide:
#
#   - Structured integration with Claude Code (cwd awareness, error handling)
#   - Better cancellation support
#   - Predictable output format
#   - More reliable path resolution
#
# Scope: narrow — find commands with glob patterns (-name, -path, -iname, -ipath with
# wildcards), and grep commands searching files (single file or -r recursive). Other forms
# pass through.
#
# EVERY REFUSAL RENDERS THE CORRECTED COMMAND. That is the load-bearing shape: a refusal
# that names the replacement is applied first try by a Haiku driver and a Sonnet sub-agent alike,
# while a bare rejection only fixes the defect that was visibly refused.
#
# CHEAP WAKE GATE. Nothing to do unless the payload even names `find` or `grep` — every ordinary
# Bash call (npm test, git status, an Edit) never spawns node at all.
#
# OVERRIDE. `SPO_FILE_DISCOVERY_GUARD_OVERRIDE=` — a deliberate, human-typed token, the
# item-list-guard.sh shape. A model must not type it: this guard exists precisely to catch a
# model reaching for the forms it refuses.
#
# Exit 0 = allow, exit 2 = block with the reason (and the corrected command) fed back to the
# model.

set -uo pipefail

. "$(dirname "$0")/session-heartbeat.sh"
spo_stamp_heartbeat

payload="$(cat)"

case "$payload" in
  *SPO_FILE_DISCOVERY_GUARD_OVERRIDE=*) exit 0 ;;
esac

# Cheap gate: nothing to do unless find or grep is mentioned
case "$payload" in
  *"find "*|*"fd "*|*"grep "*) ;;
  *) exit 0 ;;
esac

verdict="$(printf '%s' "$payload" | node "$(dirname "$0")/file-discovery-guard.js" 2>/dev/null)" || exit 0

[ -n "$verdict" ] || exit 0
[ "$verdict" = "ALLOW" ] && exit 0

# Refusal ledger (card #369) — count this refusal, so the message below can tell a first
# refusal from a session still composing variants of the same blocked command.
count=0
if [ "${verdict:-ok}" != "ALLOW" ]; then
  count="$(node "$(dirname "$0")/refusal-ledger.js" "file-discovery" 2>/dev/null || echo 0)"
fi
escalation=""
if [ "${count:-0}" -ge 3 ] 2>/dev/null; then
  escalation="
This is refusal #${count} from this guard in this session. Do not compose another
variant — that is workaround-hunting, and it is the one continuation this project
forbids. Either run the exact command above, or release: move the card to
Needs triage with a comment quoting this refusal and what you were trying to do
(next-task.md § Refusal discipline), and close this session's ownership."
fi

echo "$verdict" >&2
if [ -n "$escalation" ]; then echo "$escalation" >&2; fi
exit 2
