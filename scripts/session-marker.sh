#!/usr/bin/env bash
# The session-marker key — sourced, never run.
#
# One worktree, one key: `sha1(realpath(toplevel))[0:16]`.
#
# finish.sh carries its own copy of this derivation (session_key), because it keys an ARBITRARY
# path while this one keys the CURRENT worktree. The two must stay identical — a copy that
# drifted would leave markers nobody can find.
#
# One marker hangs off this key:
#   finished  `finish` ran here (finish.sh), which board-take.sh reads to refuse a second
#             claim in a worktree whose work is already on main
#
# There was an `alive` heartbeat marker too, read by heartbeat-scan.sh and claim-read.sh. Its
# writer went with the pilot hook layer in #425 and both readers were removed in #441.
session_marker() {
  local dir store key
  dir="$(git rev-parse --show-toplevel 2>/dev/null)" || return 1
  [ -n "$dir" ] || return 1
  dir="$(readlink -f "$dir" 2>/dev/null)" || return 1
  store="${SPO_SESSION_DIR:-$HOME/.spo-bench/sessions}"
  key="$(printf '%s' "$dir" | sha1sum | cut -c1-16)"
  printf '%s/%s.%s' "$store" "$key" "${1:?session_marker needs a suffix}"
}
