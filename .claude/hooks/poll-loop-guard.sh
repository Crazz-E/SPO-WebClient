#!/usr/bin/env bash
# PreToolUse(Bash) — refuses the two shapes that lose a verdict while waiting for it, and
# names the form that keeps it.
#
# They are the same incident twice. A trailing ampersand makes the shell report the FORK
# rather than the run, so the exit code is 0 whatever happened; with the verdict gone, the
# only ways left are the printed report (which CLAUDE.md forbids) and a poll on the done/
# file — which is precisely the loop below. The ampersand is upstream of the loop, so both
# belong in one guard.
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
#   refused  a trailing `&` on a command whose exit code IS the verdict, in EITHER mode; a
#            `;`/`&&` chained after one, but ONLY when the Bash call also sets
#            run_in_background: true — the harness then notifies on the chained call's LAST
#            stage, not the verdict's; and a loop (`until` / `while` / `for`) whose body
#            sleeps AND which mentions a bench job file, a verdict file, or a `gh` read
#   allowed  everything else, heredoc bodies included (a doc quoting a loop is not a run).
#            The redirect to a log file is explicitly fine — only the ampersand is not. A
#            `;`/`&&` chain run in the FOREGROUND is what verdict-pipe-guard.sh prescribes
#            (`cmd > log 2>&1; echo "EXIT=$?"`) and stays legal here.
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
    let background = false;
    try {
      const parsed = JSON.parse(raw);
      command = parsed?.tool_input?.command ?? '';
      background = parsed?.tool_input?.run_in_background === true;
    } catch { command = ''; }

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

    // Shell-backgrounding a command whose exit code IS the verdict. \`cmd &\` makes the
    // shell report the FORK, not the run — always 0 — so the verdict is destroyed before
    // anyone reads it, and the only ways left are the report text (forbidden) or a poll on
    // the done/ file (the loop refused below). The ampersand is upstream of that loop.
    const backgrounded = /(^|[;\n&|])\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)*(npm\s+(?:run\s+)?(?:gate|test|test:live|typecheck|lint|build|verdict)|npx\s+jest|node\s+[^\s]*(?:verify-gate|run)\.js)\b[^\n;]*&\s*(?:$|[\n;])/;
    if (backgrounded.test(text)) { process.stdout.write('amp'); return; }

    // The same destruction reached without an ampersand at all, but ONLY when the Bash call
    // is also going to be BACKGROUNDED (run_in_background: true): chaining a second command
    // after the verdict with \`;\` or \`&&\`. With the call backgrounded, the harness's
    // completion notification reports the LAST stage of what it ran — \`cmd; echo
    // \"EXIT=\$?\"\` notifies on the ECHO's status (always 0), \`cmd && next\` on NEXT's —
    // never the verdict command's, which is the number CLAUDE.md says to read.
    //
    // In the FOREGROUND the same chain stays legal — reading (a) on issue #289, for three
    // reasons: (1) the card that raised the incident rules the foreground compound safe;
    // (2) shell state does not persist between Bash tool calls, so \`; echo \"EXIT=\$?\"\` is
    // the ONLY way a foreground caller learns WHICH of the bench's several non-zero codes
    // came back — the tool call returns synchronously with the real exit code regardless,
    // and the echo only mirrors it into the printed text; (3) in the foreground \`&&\`
    // propagates a genuine failure code from \`cmd\` — only the backgrounded completion
    // notification is destroyed, which is the incident this branch exists for.
    // \`2>&1\` is a redirect, not this separator — stripped first so it is never mistaken
    // for one.
    const stripRedirects = text.replace(/\d*>&\d+/g, '');
    const compound = /(^|[;\n&|])\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)*(npm\s+(?:run\s+)?(?:gate|test|test:live|typecheck|lint|build|verdict)|npx\s+jest|node\s+[^\s]*(?:verify-gate|run)\.js)\b[^\n;&]*(;|&&)\s*\S/;
    if (background && compound.test(stripRedirects)) {
      process.stdout.write('compound');
      return;
    }

    // There is a third route by which an exit code is lost — capturing the OUTPUT in a
    // command substitution, which keeps the text and discards the number. It is NOT guarded
    // here on purpose: the pattern matches any command that merely quotes the shape (a test,
    // a doc, a grep), and the false positives cost more than the rare real case. It is
    // recorded in CLAUDE.md as prose instead.

    // A loop that waits: one of the three headers, and a sleep inside it. A loop with no
    // sleep is doing work, not waiting, and is none of this guard's business.
    const isLoop = /(^|[;&|\n\`(])\s*(until|while|for)\s/.test(text);
    // A separator list does not work here: a semicolon, then do, then sleep — the
    // keyword sits between the separator and the verb, and do is not punctuation.
    // Anchor on a word boundary; the loop header above keeps this off a bare sleep 30.
    const sleeps = /(^|[^A-Za-z0-9_.\/-])sleep\s+[0-9$]/.test(text);
    if (!isLoop || !sleeps) { process.stdout.write('ok'); return; }

    // What is being waited FOR decides which alias the message names, and extract IDs.
    const isBench = /\.spo-bench\/(done|jobs|verdicts)\b|job-[0-9a-f]{6,}/.test(text);
    const isPr    = /\bgh\s+(pr|api)\b/.test(text) || /mergedAt|mergeStateStatus/.test(text);

    let jobId = '';
    let prNum = '';

    if (isBench) {
      // Extract first job-[hex] id from text
      const m = text.match(/job-[0-9a-f]{6,}/);
      if (m) jobId = m[0];
      process.stdout.write('bench\t' + jobId);
    } else if (isPr) {
      // Extract PR number from gh pr ... <N> or /pulls/(<N>)
      const m1 = text.match(/\bgh\s+pr\s+\w+\s+(\d+)/);
      const m2 = text.match(/pulls\/(\d+)/);
      if (m1) prNum = m1[1];
      else if (m2) prNum = m2[1];
      process.stdout.write('pr\t' + prNum);
    } else {
      process.stdout.write('ok');
    }
  });
" 2>/dev/null)"

# Refusal ledger (card #369) — count this refusal, so the message below can tell a first
# refusal from a driver still composing variants of the same blocked command. Computed only
# when we are actually about to block; a passing call never touches the ledger.
count=0
if [ "${verdict:-ok}" != "ok" ]; then
  count="$(node "$(dirname "$0")/refusal-ledger.js" "poll-loop" 2>/dev/null || echo 0)"
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
  amp)
    echo "BLOCKED: a trailing \`&\` destroys the verdict you are running that command for." >&2
    echo "" >&2
    echo "\`cmd &\` makes the shell report the FORK, not the run — the exit code is 0 whatever" >&2
    echo "happens. CLAUDE.md says to read the verdict from the exit code and never from the" >&2
    echo "printed report; after an ampersand there is no exit code left to read, so the only" >&2
    echo "ways out are the report text (forbidden) or a poll on the done/ file (also refused" >&2
    echo "by this hook). The ampersand is what creates that dead end." >&2
    echo "" >&2
    echo "Background it with the TOOL, not with the shell: pass run_in_background: true on" >&2
    echo "the Bash call and drop the \`&\`. The harness then keeps the process, notifies you" >&2
    echo "when it exits, and preserves its exit code." >&2
    echo "" >&2
    echo '  npm run gate > <scratchpad>/gate.log 2>&1' >&2
    echo "" >&2
    echo "with run_in_background: true. The redirect is fine and needs no permission — only" >&2
    echo "the ampersand does. Keep the BACKGROUNDED command bare: do not append" >&2
    echo "\`; echo \$?\` or anything else after it when run_in_background: true — see" >&2
    echo "the compound refusal below for why that destroys the same exit code from" >&2
    echo "the other side. In the FOREGROUND that chain is fine; it just is not what" >&2
    echo "backgrounding needs." >&2
    if [ -n "$escalation" ]; then echo "$escalation" >&2; fi
    exit 2
    ;;
  compound)
    echo "BLOCKED: that chains a second command after a verdict command AND backgrounds it." >&2
    echo "" >&2
    echo "With run_in_background: true, the harness's completion notification reports the" >&2
    echo "LAST stage of what it ran — the echo's, or the next command's — never the verdict" >&2
    echo "command's. \`cmd; echo \"EXIT=\$?\"\` notifies on the ECHO's status (always 0);" >&2
    echo "\`cmd && next\` notifies on NEXT's. Either way the number CLAUDE.md says to" >&2
    echo "read the verdict from never reaches you." >&2
    echo "" >&2
    echo "Background the BARE command instead — nothing chained after it:" >&2
    echo "" >&2
    echo '  npm run gate > <scratchpad>/gate.log 2>&1' >&2
    echo "" >&2
    echo "with run_in_background: true." >&2
    echo "" >&2
    echo "In the FOREGROUND this same chain is fine, and is what verdict-pipe-guard.sh" >&2
    echo "recommends as the sanctioned form: the tool call returns synchronously with" >&2
    echo "the real exit code regardless of what follows it, so \`; echo \"EXIT=\$?\"\`" >&2
    echo "only mirrors that code into the printed text — which is how a foreground" >&2
    echo "caller tells apart the bench's several non-zero verdicts, since shell state" >&2
    echo "does not persist between Bash tool calls:" >&2
    echo "" >&2
    echo '  npm run gate > <scratchpad>/gate.log 2>&1; echo "EXIT=$?"' >&2
    if [ -n "$escalation" ]; then echo "$escalation" >&2; fi
    exit 2
    ;;
  bench*)
    # Parse verdict as: "bench\t<job-id>"
    jobId="${verdict#bench$'\t'}"

    echo "BLOCKED: that hand-rolls the wait for a bench job." >&2
    echo "" >&2
    echo "There is an alias for it, and it is allowlisted — so it never stops to ask:" >&2
    echo "" >&2

    if [ -n "$jobId" ]; then
      echo "  npm run bench:wait -- $jobId" >&2
    else
      echo "  npm run bench:wait -- <job-id> [--timeout-min=N]" >&2
    fi

    echo "" >&2
    echo "Read the verdict from its EXIT CODE, never from the report text:" >&2
    echo "  0 PASS/LEASED · 1 verdict not passing · 3 worker down · 4 wait timed out" >&2
    echo "" >&2
    echo "Run it as one background command — the wait then costs zero tokens." >&2
    echo "\`npm run gate\` and \`npm run test:live\` already wait; you only need this one" >&2
    echo "for a job whose wait was interrupted. doc/bench-worker.md." >&2
    if [ -n "$escalation" ]; then echo "$escalation" >&2; fi
    exit 2
    ;;
  pr*)
    # Parse verdict as: "pr\t<pr-number>"
    prNum="${verdict#pr$'\t'}"

    echo "BLOCKED: that polls GitHub in a loop." >&2
    echo "" >&2
    echo "Two problems, and the alias fixes both:" >&2
    echo "" >&2

    if [ -n "$prNum" ]; then
      echo "  npm run pr:wait -- $prNum" >&2
    else
      echo "  npm run pr:wait -- <pr-number> [--interval-sec=N] [--timeout-min=N]" >&2
    fi

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
    if [ -n "$escalation" ]; then echo "$escalation" >&2; fi
    exit 2
    ;;
  *)
    exit 0
    ;;
esac
