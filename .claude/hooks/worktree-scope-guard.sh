#!/usr/bin/env bash
# PreToolUse(Edit|Write|NotebookEdit|Bash) — refuses a write that lands outside this session's
# own worktree but still inside the main checkout that hosts every worktree.
#
# THE INCIDENT THIS CLOSES. `.claude/commands/next-task.md` § Handoff discipline spawns an
# execution sub-agent with a payload that names files by a RELATIVE path. `Read`/`Edit`
# require an absolute one, so the sub-agent builds one itself — and on 2026-08-26 it rooted
# that path at the repository CLAUDE.md's own text names (`repo at /home/<user>/SPO-WebClient`)
# rather than at its actual, correct cwd (`.../worktrees/next-task-288-d1929c`). The edit
# landed in the main checkout, byte-identical to the worktree's copy so nothing looked wrong,
# and the branch the card was meant for stayed empty. `main-commit-guard.sh` catches the
# `git add`/`git commit` half of that leak; `driver-scope-guard.sh` deliberately lets the
# sub-agent through (`agent_id` — implementation is precisely its job) and so never saw this
# at all. Fix A (next-task.md) makes the payload require absolute, worktree-rooted paths;
# this hook is Fix B — the backstop for the day a payload still gets it wrong, or a session
# hand-types an absolute path into the wrong tree.
#
# WHAT IT REFUSES. `top` = this session's worktree root; `family` = the main checkout root
# that contains every worktree (`git rev-parse --git-common-dir`'s directory). A write is
# blocked iff its resolved target is under `family` but NOT under `top` — that is true for
# the main checkout itself and for every OTHER session's worktree, and false for everything
# inside this one.
#
# WHAT IT LETS THROUGH. Anything outside `family` altogether — the scratchpad, `/tmp`,
# `~/.claude` — this hook has no opinion on those, `bench-port-guard.sh` and the others do.
# Every write inside `top`. Every Bash command that is not one of the write verbs below,
# whatever path it names (a `cat`, a `grep`, a `git -C <main checkout> status` — read-only
# checks the driver itself runs, per next-task.md § 3).
#
# THE DOORS. `file_path`/`notebook_path` for `Edit`/`Write`/`NotebookEdit`. For `Bash`: a
# `>`/`>>` redirection, or one of `sed -i`, `rm`, `mv`, `cp`, `tee`, `chmod`, `git rm` — the
# same write-verb shape driver-scope-guard.js already parses, reused (not duplicated) from
# the shared `bash-command-parse.js` this hook was split out of. Unlike driver-scope-guard,
# there is no `agent_id` exemption: the sub-agent is exactly who this guard exists to catch.
#
# COSTS NOTHING IN THE COMMON CASE. An ordinary in-worktree write never mentions `family`
# except as `top`'s own prefix, and never contains `..`. Strip every occurrence of `top` from
# the payload; if `family` still appears, or `..` appears anywhere, the write MIGHT escape —
# only then is `node` spawned to resolve it for real. Every other call is a bash substring
# test and exit 0.
#
# Exit 0 = allow, exit 2 = block with the reason fed back to the model.

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

# THE COMMON CASE, and the reason this hook is nearly free: a session working only inside its
# own worktree never has a reason to spell out `family`, so there is nothing left to resolve.
without_top="${payload//$top/}"
if [[ "$without_top" != *"$family"* && "$payload" != *".."* ]]; then
  exit 0
fi

verdict="$(printf '%s' "$payload" | SPO_TOP="$top" SPO_FAMILY="$family" \
  node "$(dirname "$0")/worktree-scope-guard.js" 2>/dev/null)" || exit 0

[ -n "$verdict" ] || exit 0
[ "$verdict" = "ALLOW" ] && exit 0

# Parse verdict as: "reason\tcorrected" (no tab = corrected is empty)
reason="${verdict%%$'\t'*}"
corrected="${verdict#*$'\t'}"
if [ "$verdict" = "$reason" ]; then
  corrected=""
fi

cat >&2 <<MSG
BLOCKED — this write ${reason}.

This session's worktree is:
  ${top}

The write resolved to a path under the main checkout (${family}) but outside that worktree —
either the main checkout itself, or another session's worktree nested beside this one. That is
almost always a relative path resolved against the wrong repository root (CLAUDE.md § Environment
names the main checkout, not any one worktree), or a hand-typed absolute path that drifted.

MSG

if [ -n "$corrected" ]; then
  cat >&2 <<MSG
The writable copy of that file in THIS worktree is:

  ${corrected}

Retry the SAME change against that exact path. If the Edit's old_string no longer
matches there, Read that path first — what you read before came from the other tree.
If a sub-agent payload named the blocked path, the corrected path above is what the
payload should have carried (next-task.md § Handoff discipline: absolute, worktree-rooted).
MSG
else
  cat >&2 <<MSG
Re-target the same file inside THIS worktree instead. If a payload named this file, the payload
carried a relative path or the wrong root — fix the path there, not here.
MSG
fi

exit 2
