#!/usr/bin/env bash
# PreToolUse(Edit|Write|Bash) — the DRIVER of a claimed card never writes to the tree itself.
#
# doc/kanban-workflow.md § Model routing, .claude/commands/next-task.md § 3 question (i):
# "Will this action create, edit or delete a git-tracked file? Yes -> this is implementation:
# spawn the execution sub-agent. The driver never edits a tracked file itself."
#
# That rule was prose the driver asked ITSELF — which is the weakest possible enforcement,
# because the model that has already drifted is the one being asked whether it is drifting.
# On 2026-08-26 a Haiku driver met an S-sized card with a one-sentence criterion and rewrote
# a whole script (next-task.md § 3). It had a card and a criterion, and neither told it
# to stop. Every other hard rule in this repo is enforced by a hook that does not care what
# the model believes; this one now is too.
#
# TWO DOORS, one guard. `Edit|Write` is the obvious one. `Bash` is the one that made the
# first version useless: `sed -i`, a `>` redirection, `rm`, `mv`, `git rm` and `chmod` all
# write to tracked files without ever touching the Edit tool, and a deletion is reachable
# ONLY that way. A separate testimony records a sub-agent that `chmod +x`'d a script to make
# its own assertion pass — a mode bit is invisible to a content diff, so nothing downstream
# would have caught it either.
#
# HOW IT TELLS THE DRIVER FROM ITS OWN SUB-AGENT. The PreToolUse payload carries `agent_id`
# "only when the hook fires from within a subagent ... Absent for the main thread" (the CLI's
# own schema, 2.1.80). Verified live rather than read: a Task sub-agent's Bash AND Write calls
# both carried `agent_id`; the main thread's carried none. `session_id` does NOT separate them
# — driver and sub-agent share one — so `agent_id` is the sole discriminator, and the
# session_id test below serves a different purpose (another session in the same worktree).
#
# HOW IT STAYS ASLEEP. It arms only on a real claim: `board:take` writes
# `<sessions>/<key>.driving` when a claim is VERIFIED (scripts/board-take.sh), releases it on
# `--release`, and `finish.sh` forgets it with the rest. No marker -> one stat and exit 0.
# A human session, /gate, /commit-push, /triage-report and every non-driving session pay
# exactly that. A hook that blocks ordinary work gets disabled, which is worse than no hook.
#
# It is a guardrail, not a sandbox: the driver could remove its own marker with Bash. The
# useful property is that the guard, settings.json and next-task.md are themselves tracked
# files, so a driver drifting toward disabling the guard is stopped by the guard.
#
# Exit 0 = allow, exit 2 = block with the reason fed back to the model.

set -uo pipefail

. "$(dirname "$0")/session-heartbeat.sh"
spo_stamp_heartbeat

payload="$(cat)"

store="${SPO_SESSION_DIR:-$HOME/.spo-bench/sessions}"
top="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -n "$top" ] || exit 0
top="$(readlink -f "$top" 2>/dev/null)" || exit 0
key="$(printf '%s' "$top" | sha1sum | cut -c1-16)"
marker="$store/$key.driving"

# THE COMMON CASE, and the reason this hook costs nothing: nobody is driving a card from this
# worktree, so no node process is ever spawned.
[ -f "$marker" ] || exit 0

driver_sid="$(sed -n 1p "$marker" 2>/dev/null)"
issue="$(sed -n 2p "$marker" 2>/dev/null)"
[ -n "$driver_sid" ] || exit 0
[ -n "$issue" ] || issue="?"

LEGACY_TREES="${SPO_LEGACY_TREES:-$HOME/SPO-Original:$HOME/SPO-ASP}"
verdict="$(printf '%s' "$payload" | SPO_TOP="$top" SPO_DRIVER_SID="$driver_sid" SPO_LEGACY_TREES="$LEGACY_TREES" \
  node "$(dirname "$0")/driver-scope-guard.js" 2>/dev/null)" || exit 0

[ -n "$verdict" ] || exit 0
[ "$verdict" = "ALLOW" ] && exit 0

# Refusal ledger (card #369) — count this refusal, so the message below can tell a first
# refusal from a driver still composing variants of the same blocked write.
count="$(node "$(dirname "$0")/refusal-ledger.js" "driver-scope" 2>/dev/null || echo 0)"
escalation=""
if [ "${count:-0}" -ge 3 ] 2>/dev/null; then
  escalation="
This is refusal #${count} from this guard in this session. Do not compose another
variant — that is workaround-hunting, and it is the one continuation this project
forbids. Either run the exact command above, or release: move the card to
Needs triage with a comment quoting this refusal and what you were trying to do
(next-task.md § Refusal discipline), and close this session's ownership."
fi

# A CREATION and an EDIT have different right answers, and naming only one of them is how a
# guard sends a driver down the wrong path. Editing a tracked file is implementation -> the
# sub-agent. Creating a new file is usually the driver writing its OWN text — a commit message,
# a PR body — which is not implementation at all: it just belongs outside the tree.
tool=""
case "$payload" in
  *'"tool_name":"Edit"'*|*'"tool_name": "Edit"'*) tool="Edit" ;;
  *'"tool_name":"Write"'*|*'"tool_name": "Write"'*) tool="Write" ;;
  *'"tool_name":"NotebookEdit"'*|*'"tool_name": "NotebookEdit"'*) tool="NotebookEdit" ;;
  *) tool="Bash" ;;
esac

# THE CONTINUATION. Card #370: 9 of the 24 daily refusals stopped here — the driver read
# "spawn the sub-agent" and had no runnable shape for what that spawn actually looks like, or
# read "never retry the edit" for a `git stash` and had no worktree-safe way to get the same
# clean-tree effect. Three shapes, chosen by what was refused:
#   - Edit/Write/NotebookEdit on an EXISTING tracked file (not a creation — that already gets
#     its own scratchpad remedy above): the Agent-tool skeleton for the execution sub-agent.
#   - `git stash`: stash has no cross-worktree meaning worth fighting for — a trivial WIP
#     commit gets the same "clean tree" effect and is exactly as easy to undo.
#   - every other Bash write verb (`sed -i`, `rm`, `mv`, `chmod`, `git rm`, `git restore`, …):
#     both shapes, since the driver — not this guard — knows whether the command was
#     implementation or housekeeping.
continuation=""
case "$tool" in
  Edit|Write|NotebookEdit)
    case "$verdict" in
      "would create"*) ;; # the scratchpad remedy above already answers this one
      *)
        continuation="
If the driver needs this change, spawn the execution sub-agent rather than making it here.
Skeleton:

  Agent({
    description: \"Edit <short description>\",
    subagent_type: \"general-purpose\",
    prompt: \"Edit the following file:

file: <ABSOLUTE PATH INSIDE THIS WORKTREE>
change: <one-line description>

No explanation, no preamble. Return the diff only.\"
  })

Fill in the real absolute path (this worktree, not the main checkout) and the one-line change —
never paste the file's contents into the prompt; the sub-agent reads it itself.
"
        ;;
    esac
    ;;
  Bash)
    case "$verdict" in
      "reads the legacy tree"*) ;; # the delphi-archaeologist remedy above already answers this one
      *"git stash"*)
        continuation="
Worktree-safe alternative (CLAUDE.md § Git — each attempt is its own commit, so this costs
nothing to undo):

  git add -A && git commit -m \"wip: <why>\"

Retry the stash (or whatever needed the working tree clean) on this branch once it is safe —
there is no shared stash across worktrees to fight over, and the commit is trivial to
soft-reset later if it should not have existed.
"
        ;;
      *)
        continuation="
Two ways forward, depending on what this command was for:
  - If this is IMPLEMENTATION (the command was going to change tracked source), spawn the
    execution sub-agent instead — same Agent-tool skeleton as the Edit/Write case:
      Agent({ description: \"...\", subagent_type: \"general-purpose\",
              prompt: \"Edit the following file:\\n\\nfile: <ABSOLUTE PATH INSIDE THIS WORKTREE>\\nchange: <one-line description>\\n\\nNo explanation, no preamble. Return the diff only.\" })
  - If this is ENVIRONMENT SETUP OR CLEANUP (not a content change — e.g. clearing a stale
    lock, restoring a mode bit), commit the tree first so the change is never lost:
      git add -A && git commit -m \"wip: <why>\"
    then retry the same command on this branch.
"
        ;;
    esac
    ;;
esac

remedy=""
case "$verdict" in
  "would create"*)
    remedy="If this is text the driver itself writes — a commit message, a PR body, a board comment —
it is NOT implementation, and the answer is not a sub-agent: put the file in this session's
SCRATCHPAD, outside the worktree. \`git commit -F\`, \`gh pr create --body-file\` and
\`gh issue comment --body-file\` read it from there. A file written inside the worktree
dirties the tree, and the gate refuses a dirty tree (exit 2) whoever wrote it.

"
    ;;
  "reads the legacy tree"*)
    remedy="Reading SPO-Original or SPO-ASP is not implementation either — it is research, and the
driver delegates research the same way it delegates writes: to a sub-agent, here specifically
the \`delphi-archaeologist\` skill (invoke it with \`/delphi-archaeologist\`, or spawn a sub-agent
carrying the same brief). It knows the traps a bare grep/cat/head walks into on this tree — the
ISO-8859 encoding, the xargs word-splitting on spaced directory names (CLAUDE.md § SPO-Original,
§ Legacy web source) — and it returns citations (\`File.pas:Line\`), not a raw dump for the
driver to paste back into its own reasoning.

"
    ;;
esac

cat >&2 <<MSG
BLOCKED — this session is DRIVING card #${issue}, and this action ${verdict}.

${remedy}next-task.md § 3 (i): the driver never creates, edits or deletes a tracked file itself.
An implementation is a phase, not a decision: it is ONE spawn of the execution sub-agent
(kanban-workflow § Model routing), carrying the card, the invariant block and the file list.
Its writes pass this guard unblocked — it is only the driver's own hand that is refused.

Do NOT retry the edit, and do NOT reach for another shell verb: every write-shaped one is
refused the same way. Spawn the sub-agent.
${continuation}
Human override, on explicit instruction only:
  rm ${marker}
(the next \`npm run board:take\` re-arms it)
${escalation}
MSG
exit 2
