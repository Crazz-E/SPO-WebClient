#!/bin/bash
# Sourced by the other hooks — never run as a process of its own.
#
# WHY. Several Claude sessions share one machine, each in its own worktree under
# .claude/worktrees/. `npm run finish` reaps the worktrees nobody is using any more, and
# its only proof that a session is alive was "some process has this exact directory as its
# cwd". That proof has holes, and each of them removes a working session's directory out
# from under it — the session then fails every tool call, because the path it stands in no
# longer exists:
#
#   - a shell that `cd src/client` inside the worktree has a SUBDIRECTORY as its cwd;
#   - a session working from its scratchpad has a cwd in /tmp;
#   - a session between turns may hold no shell in the tree at all.
#
# So the session leaves a heartbeat OUTSIDE the tree (touching a file inside it would make
# the worktree dirty, which breaks the gate and finish alike). Every hook stamps it: a
# prompt, an edit, a Bash call, the end of a turn. finish.sh refuses to reap a worktree
# whose heartbeat is younger than its idle window.
#
# Cost: one `git rev-parse` and one `sha1sum`, a few milliseconds. Never fails a hook.

spo_stamp_heartbeat() {
  local dir store key
  dir="$(git rev-parse --show-toplevel 2>/dev/null)" || return 0
  [ -n "$dir" ] || return 0
  dir="$(readlink -f "$dir" 2>/dev/null)" || return 0
  store="${SPO_SESSION_DIR:-$HOME/.spo-bench/sessions}"
  mkdir -p "$store" 2>/dev/null || return 0
  key="$(printf '%s' "$dir" | sha1sum | cut -c1-16)"
  printf '%s\n' "$dir" > "$store/$key.alive" 2>/dev/null || true
  return 0
}
