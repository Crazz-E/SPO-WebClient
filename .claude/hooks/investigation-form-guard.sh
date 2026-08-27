#!/usr/bin/env bash
# PreToolUse(Bash) — refuses three shell forms that read the legacy Delphi tree WRONG, not
# empty. Card #324.
#
# THE INCIDENT THIS CLOSES (card #117, measured). A `/next-task` session ran:
#
#   find /home/crazz/SPO-Original -name "*.pas" -type f 2>/dev/null | xargs grep -l "X" 2>/dev/null
#
# and got 2 files back. The truth is 15, and the missing one is the authority
# (`Interface Server/InterfaceServer.pas`). Three stacked causes, ALL masked:
#
#   1. `xargs` without `-0` aborts on the apostrophe in `Pastel's mp3/` — only 1338 of 1747
#      files ever reached `grep`.
#   2. Word-splitting on spaces destroys `Interface Server/`, `Model Extensions/`,
#      `Mail Server/` — each becomes two non-existent arguments.
#   3. `2>/dev/null` swallowed 343 stderr lines, including the fatal
#      `xargs: unmatched single quote`.
#
# A fourth, already documented at CLAUDE.md § SPO-Original: `grep` without `-a` returns
# nothing on the ISO-8859-encoded .pas files, exiting 1 as if the text were absent.
#
# None of these four fails loudly. Each looks like a clean, empty (or nearly empty) answer —
# and the reads this guard protects feed `src/shared/rdo-members.ts`: a wrong `kind` or
# `arity` from a false-negative read produces a server freeze, an arbitrary memory write, or
# a crash (CLAUDE.md § RDO). So this is mechanical, like the other guards in this directory,
# not a rule left to a model to remember under pressure.
#
# SCOPE, deliberately narrow — the trigger is a READ verb (grep/find/ls/cat/file) whose
# operand resolves under one of the legacy tree roots (SPO-Original, SPO-ASP). `git grep`
# passes untouched: its head token is `git`, never a member of the read-verb set.
#
# EVERY REFUSAL RENDERS THE CORRECTED COMMAND. That is the load-bearing finding behind the
# shape: a refusal that names the replacement was applied first try by a Haiku driver and a
# Sonnet sub-agent alike, while a bare rejection only fixed the defect that was visibly
# refused (card #324 body).
#
# THE .sh/.js/test SHAPE is driver-scope-guard's — the only tested one in this directory —
# reusing bash-command-parse.js's `statements()` (shared with verdict-pipe-guard.sh, not a
# second copy).
#
# CHEAP WAKE GATE. Nothing to do unless the payload even names one of the legacy trees —
# every ordinary Bash call (npm test, git status, an Edit) never spawns node at all.
#
# OVERRIDE. `SPO_INVESTIGATION_FORM_OVERRIDE=` — a deliberate, human-typed token, the
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
  *SPO-Original*|*SPO-ASP*) ;;
  *) exit 0 ;;
esac

case "$payload" in
  *SPO_INVESTIGATION_FORM_OVERRIDE=*) exit 0 ;;
esac

LEGACY_TREES="${SPO_LEGACY_TREES:-$HOME/SPO-Original:$HOME/SPO-ASP}"

verdict="$(printf '%s' "$payload" | SPO_LEGACY_TREES="$LEGACY_TREES" \
  node "$(dirname "$0")/investigation-form-guard.js" 2>/dev/null)" || exit 0

[ -n "$verdict" ] || exit 0
[ "$verdict" = "ALLOW" ] && exit 0

echo "$verdict" >&2
exit 2
