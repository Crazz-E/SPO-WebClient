#!/usr/bin/env bash
# PreToolUse(Bash) — refuses `gh project item-list`, the read that emptied the GraphQL bucket.
#
# doc/kanban-workflow.md § GitHub API discipline: every session, workflow and machine shares
# ONE GitHub account's quota — 5000 GraphQL points/hour — and `gh project item-list 1 --limit
# 100` costs ~103 of them (its generated query nests every field's options inside every field
# value of every item, and pulls every card body). On 2026-08-25, five sessions re-reading the
# board this way emptied the bucket and the board went unreadable for ~5 minutes, mid-claim.
#
# The claim read (`npm run board:claim`, scripts/claim-read.sh) returns the same decision data
# PLUS the ids the claim's writes need, for ~2 points — fifty times cheaper, measured the same
# day on the same board. There is no case where a session needs `item-list` instead of it: the
# claim read IS the pool read, done once, at claim, per doc/kanban-workflow.md rule 1.
#
# So this is mechanical, like bench-port-guard.sh and verdict-pipe-guard.sh, whose headers
# record the same lesson: a rule that lives only in CLAUDE.md is advisory to a model, and a
# model can read the rule and still reach for the expensive call under pressure. `item-list`
# stays fine for a HUMAN one-off at a terminal — it is a session's loop and fan-out that
# empties the bucket for everyone — hence the documented override below.
#
# Exit 0 = allow, exit 2 = block with the reason fed back to the model.
#
# The session heartbeat is not stamped here: bench-port-guard.sh runs on the same event and
# already stamps it for every Bash call.

set -uo pipefail

payload="$(cat)"

# A deliberate, human-typed override — an inline assignment in front of the command, the same
# shape as SPO_BENCH_PORT_OVERRIDE in bench-port-guard.sh. Documented in
# doc/kanban-workflow.md; a session must not type it — if the claim read genuinely cannot
# answer a question, that is a question for the maintainer, not a reason to reach for the
# 103-point call.
case "$payload" in
  *SPO_ITEM_LIST_OVERRIDE=*) exit 0 ;;
esac

verdict="$(printf '%s' "$payload" | node -e "
  let raw = '';
  process.stdin.on('data', c => (raw += c));
  process.stdin.on('end', () => {
    let command = '';
    try { command = JSON.parse(raw)?.tool_input?.command ?? ''; } catch { command = ''; }

    // A heredoc body is text, not commands — a doc that quotes \`gh project item-list\` is
    // not a run. Same skeleton as bench-port-guard.sh / verdict-pipe-guard.sh.
    const lines = command.split('\n');
    const kept = [];
    let terminator = null;
    for (const line of lines) {
      if (terminator !== null) {
        if (line.trim() === terminator) terminator = null;
        continue;
      }
      kept.push(line);
      const heredoc = line.match(/<<-?\s*[\"']?([A-Za-z_][A-Za-z0-9_]*)[\"']?/);
      if (heredoc) terminator = heredoc[1];
    }
    const text = kept.join('\n');
    const segments = text.split(/\n|;|&&|\|\||\||\(/);

    // A command that only READS a line of script — grep, cat, sed -n — mentions the call
    // without invoking it. Only an invocation at the head of a segment counts.
    const strip = s => s.replace(/^\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)*/, '').trim();

    const isItemList = s => /^gh\s+project\s+item-list(\s|$)/.test(strip(s));

    process.stdout.write(segments.some(isItemList) ? 'block' : 'ok');
  });
" 2>/dev/null)"

# Refusal ledger (card #369) — count this refusal, so the message below can tell a first
# refusal from a session still composing variants of the same blocked command. Computed only
# when we are actually about to block; a passing call never touches the ledger.
count=0
if [ "${verdict:-ok}" != "ok" ]; then
  count="$(node "$(dirname "$0")/refusal-ledger.js" "item-list" 2>/dev/null || echo 0)"
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

case "${verdict:-ok}" in
  block)
    echo "BLOCKED: \`gh project item-list\` costs ~103 GraphQL points (measured" >&2
    echo "2026-08-25) — its generated query nests every field's options inside every field" >&2
    echo "value of every item, and pulls every card body. ~48 calls end the hour for every" >&2
    echo "session at once; that is exactly what happened on 2026-08-25." >&2
    echo "" >&2
    echo "The claim read returns the same decision data plus the ids the claim's writes" >&2
    echo "need, for ~2 points — fifty times cheaper:" >&2
    echo "" >&2
    echo "  npm run board:claim   scripts/claim-read.sh — one pool read, at claim, once" >&2
    echo "" >&2
    echo "doc/kanban-workflow.md § GitHub API discipline has the full recipe and the five" >&2
    echo "rules on when a session may read the board at all." >&2
    if [ -n "$escalation" ]; then echo "$escalation" >&2; fi
    exit 2
    ;;
  *)
    exit 0
    ;;
esac
