#!/usr/bin/env bash
# The driver-scope marker — sourced, never run.
#
# `.claude/hooks/driver-scope-guard.sh` refuses the DRIVER of a claimed card writing to a
# tracked file itself (next-task.md § 3 (i)). It arms on this marker and is inert without it,
# which makes the marker's lifecycle the whole safety of the mechanism:
#
#   ARM   a VERIFIED claim — the moment a session becomes a driver     (board-take.sh)
#   DISARM every way ownership closes, and there are four:
#           `board:take --release`     the back-off, the card was never held
#           `board:move … Done`        the card is finished
#           `board:move … Parked`      ownership closed the other way
#           `finish`                   including the RETIRE path, see below
#
# The retire path is the one that matters and the one the first version got wrong. CLAUDE.md:
# "A session may keep working after `finish`" — the worktree is kept while a session stands in
# it. So `finish` must drop `.driving` even when it drops nothing else: a session that keeps
# working while still armed is locked out of tracked files in the name of a card it no longer
# holds, and a guard that refuses work nobody asked it to refuse is a guard that gets disabled.
#
# It lives in one file because the key must be computed ONE way. session-heartbeat.sh and
# finish.sh both derive `sha1(realpath(toplevel))[0:16]`; a fourth and fifth copy of that
# derivation, drifting apart, would arm a marker no hook ever reads.

# Absolute path of one of this worktree's session markers, or non-zero if there is no
# worktree here. The suffix names which marker, and there are three around this key:
#   driving   this file's own — the session is the driver of a claimed card
#   finished  `finish` ran here (finish.sh), which board-take.sh reads to refuse a second
#             claim in a worktree whose work is already on main
#   alive     the heartbeat (.claude/hooks/session-heartbeat.sh)
session_marker() {
  local dir store key
  dir="$(git rev-parse --show-toplevel 2>/dev/null)" || return 1
  [ -n "$dir" ] || return 1
  dir="$(readlink -f "$dir" 2>/dev/null)" || return 1
  store="${SPO_SESSION_DIR:-$HOME/.spo-bench/sessions}"
  key="$(printf '%s' "$dir" | sha1sum | cut -c1-16)"
  printf '%s/%s.%s' "$store" "$key" "${1:?session_marker needs a suffix}"
}

driving_marker() {
  session_marker driving
}

# Arm. Records the session id the guard compares against, and the issue it names in refusals.
# No CLAUDE_CODE_SESSION_ID means a human at a bare terminal: nothing is armed, and nothing
# about the calling script changes.
arm_driver_scope() {
  local m
  [ -n "${CLAUDE_CODE_SESSION_ID:-}" ] || return 0
  m="$(driving_marker)" || return 0
  mkdir -p "$(dirname "$m")" 2>/dev/null || return 0
  printf '%s\n%s\n' "$CLAUDE_CODE_SESSION_ID" "${1:-?}" > "$m" 2>/dev/null || true
  return 0
}

# Disarm. Always safe to call: no marker, no worktree, no session — all are a silent no-op.
disarm_driver_scope() {
  local m
  m="$(driving_marker)" || return 0
  rm -f "$m" 2>/dev/null || true
  return 0
}
