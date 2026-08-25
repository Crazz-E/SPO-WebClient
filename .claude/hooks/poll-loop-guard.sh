#!/usr/bin/env bash
# PreToolUse(Bash) — refuses a hand-rolled wait loop and names the alias that replaces it.
#
# Three commands a session composed on 2026-08-25, one after the other, for two steps that
# both already had a sanctioned form:
#
#   until [ -f ~/.spo-bench/done/job-…json ]; do sleep 10; done; cat …
#   until gh pr view 276 --json mergedAt --jq '.mergedAt' | grep -qv null; do sleep 5; done
#   for i in {1..24}; do status=$(gh pr view 276 …); … sleep 5; done
#
# Each one is a compound the allowlist cannot match, so each one stopped and asked the
# human — three interruptions for a wait that costs zero tokens when it is a script. The
# second and third also poll GitHub every 5 s, under the >= 30 s floor in
# doc/kanban-workflow.md § GitHub API discipline: one account, 5000 GraphQL points an hour,
# every session and workflow on every machine drawing from it.
#
# The prose rule ("run the scripted steps verbatim", "no shell composition around it") was
# already written, in /next-task § intro. It was followed for the steps that HAVE an alias
# and improvised for the two that did not — which is the real lesson: a rule that names no
# alternative is a rule a model routes around. So this guard does two things at once, and
# neither works without the other: `bench:wait` and `pr:wait` now exist, and the loop that
# used to stand in for them is refused with their name in the message.
#
# Scope, kept narrow on purpose — a false positive costs a session a turn:
#   refused  a loop (`until` / `while` / `for`) whose body sleeps AND which mentions a
#            bench job file, a verdict file, or a `gh` read
#   allowed  everything else, heredoc bodies included (a doc quoting a loop is not a run)
#
# Exit 0 = allow, exit 2 = block with the reason fed back to the model.
#
# The session heartbeat is not stamped here: bench-port-guard.sh runs on the same event and
# already stamps it for every Bash call.

set -uo pipefail

payload="$(cat)"

verdict="$(printf '%s' "$payload" | node -e "
  let raw = '';
  process.stdin.on('data', c => (raw += c));
  process.stdin.on('end', () => {
    let command = '';
    try { command = JSON.parse(raw)?.tool_input?.command ?? ''; } catch { command = ''; }

    // A heredoc body is text, not commands — same skeleton as verdict-pipe-guard.sh.
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

    // A loop that waits: one of the three headers, and a sleep inside it. A loop with no
    // sleep is doing work, not waiting, and is none of this guard's business.
    const isLoop = /(^|[;&|\n\`(])\s*(until|while|for)\s/.test(text);
    // A separator list does not work here: a semicolon, then do, then sleep — the
    // keyword sits between the separator and the verb, and do is not punctuation.
    // Anchor on a word boundary; the loop header above keeps this off a bare sleep 30.
    const sleeps = /(^|[^A-Za-z0-9_.\/-])sleep\s+[0-9$]/.test(text);
    if (!isLoop || !sleeps) { process.stdout.write('ok'); return; }

    // What is being waited FOR decides which alias the message names.
    const bench = /\.spo-bench\/(done|jobs|verdicts)\b|job-[0-9a-f]{6,}/.test(text);
    const pr    = /\bgh\s+(pr|api)\b/.test(text) || /mergedAt|mergeStateStatus/.test(text);

    process.stdout.write(bench ? 'bench' : pr ? 'pr' : 'ok');
  });
" 2>/dev/null)"

case "${verdict:-ok}" in
  bench)
    echo "BLOCKED: that hand-rolls the wait for a bench job." >&2
    echo "" >&2
    echo "There is an alias for it, and it is allowlisted — so it never stops to ask:" >&2
    echo "" >&2
    echo "  npm run bench:wait -- <job-id> [--timeout-min=N]" >&2
    echo "" >&2
    echo "Read the verdict from its EXIT CODE, never from the report text:" >&2
    echo "  0 PASS/LEASED · 1 verdict not passing · 3 worker down · 4 wait timed out" >&2
    echo "" >&2
    echo "Run it as one background command — the wait then costs zero tokens." >&2
    echo "\`npm run gate\` and \`npm run test:live\` already wait; you only need this one" >&2
    echo "for a job whose wait was interrupted. doc/bench-worker.md." >&2
    exit 2
    ;;
  pr)
    echo "BLOCKED: that polls GitHub in a loop." >&2
    echo "" >&2
    echo "Two problems, and the alias fixes both:" >&2
    echo "" >&2
    echo "  npm run pr:wait -- <pr-number> [--interval-sec=N] [--timeout-min=N]" >&2
    echo "" >&2
    echo "1. The interval. doc/kanban-workflow.md § GitHub API discipline sets a 30 s" >&2
    echo "   floor: one account, 5000 points an hour, shared by every session and" >&2
    echo "   workflow on every machine. Five looping sessions made the board unreadable" >&2
    echo "   on 2026-08-25." >&2
    echo "2. The deadline. A loop with no deadline hangs the session on a PR that never" >&2
    echo "   lands; pr:wait exits 4 and says so." >&2
    echo "" >&2
    echo "Exit: 0 merged · 1 closed unmerged · 4 still open at the deadline." >&2
    echo "" >&2
    echo "If you only want the state ONCE — which is usually all you need, since your" >&2
    echo "gate PASS is already the bench/gate status — one REST call answers it:" >&2
    echo "  gh api repos/Crazz-Org/SPO-WebClient/pulls/<n> --jq '{state,merged}'" >&2
    exit 2
    ;;
  *)
    exit 0
    ;;
esac
