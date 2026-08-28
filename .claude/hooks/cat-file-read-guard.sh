#!/usr/bin/env bash
# PreToolUse(Bash) — routes bare `cat <file>` commands to the Read tool.
#
# Card #403. `cat` reads a file fine, but the Read tool gives line numbers, image/PDF support,
# and harness-integrated cancellation — CLAUDE.md already asks for the built-in tools (Read,
# Grep, Glob, Edit, Write) over the shell aliases.
#
# SCOPE, deliberately narrow: a bare `cat <file>` invocation, flags after the verb skipped. A
# file under a legacy tree root (SPO_LEGACY_TREES) is left to investigation-form-guard.sh
# instead — that guard's job is sharper for that tree (the ISO-8859 `-a` trap), and this guard
# staying out avoids a second, weaker voice on the same read. It runs AFTER
# investigation-form-guard.sh in settings.json so a legacy-tree read is judged there first.
#
# EVERY REFUSAL RENDERS THE CORRECTED COMMAND — same reasoning as file-discovery-guard.sh: a
# refusal naming the replacement gets applied first try, a bare rejection does not.
#
# CHEAP WAKE GATE. Nothing to do unless the payload even mentions `cat ` — every ordinary Bash
# call (npm test, git status, an Edit) never spawns node at all.
#
# OVERRIDE. `SPO_CAT_FILE_READ_GUARD_OVERRIDE=` — a deliberate, human-typed token, the
# item-list-guard.sh shape. A model must not type it: this guard exists precisely to catch a
# model reaching for the form it refuses.
#
# Exit 0 = allow, exit 2 = block with the reason (and the corrected command) fed back to the
# model.

set -uo pipefail

. "$(dirname "$0")/session-heartbeat.sh"
spo_stamp_heartbeat

payload="$(cat)"

case "$payload" in
  *SPO_CAT_FILE_READ_GUARD_OVERRIDE=*) exit 0 ;;
esac

# Cheap gate: nothing to do unless `cat ` is mentioned
case "$payload" in
  *"cat "*) ;;
  *) exit 0 ;;
esac

LEGACY_TREES="${SPO_LEGACY_TREES:-$HOME/SPO-Original:$HOME/SPO-ASP}"

verdict="$(printf '%s' "$payload" | SPO_LEGACY_TREES="$LEGACY_TREES" \
  node "$(dirname "$0")/cat-file-read-guard.js" 2>/dev/null)" || exit 0

[ -n "$verdict" ] || exit 0
[ "$verdict" = "ALLOW" ] && exit 0

# Refusal ledger (card #369) — count this refusal, so the message below can tell a first
# refusal from a session still composing variants of the same blocked command.
count=0
if [ "${verdict:-ok}" != "ALLOW" ]; then
  count="$(node "$(dirname "$0")/refusal-ledger.js" "cat-file-read" 2>/dev/null || echo 0)"
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
