#!/usr/bin/env bash
# The session-marker key — sourced, never run.
#
# One worktree, one key: `sha1(realpath(toplevel))[0:16]`. It lives in one file because the
# derivation must be identical everywhere — finish.sh computes the same key, and a second
# copy that drifted would leave markers nobody can find.
#
# Two markers hang off this key today:
#   finished  `finish` ran here (finish.sh), which board-take.sh reads to refuse a second
#             claim in a worktree whose work is already on main
#   alive     the session heartbeat file `scripts/heartbeat-scan.sh` reads
session_marker() {
  local dir store key
  dir="$(git rev-parse --show-toplevel 2>/dev/null)" || return 1
  [ -n "$dir" ] || return 1
  dir="$(readlink -f "$dir" 2>/dev/null)" || return 1
  store="${SPO_SESSION_DIR:-$HOME/.spo-bench/sessions}"
  key="$(printf '%s' "$dir" | sha1sum | cut -c1-16)"
  printf '%s/%s.%s' "$store" "$key" "${1:?session_marker needs a suffix}"
}
