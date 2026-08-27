#!/usr/bin/env bash
# PreToolUse(Bash) — keeps a verdict from being laundered by a pipe.
#
# CLAUDE.md and doc/bench-worker.md:213 already say it: "Read the verdict from the exit
# code, never from the printed report." That rule was FOLLOWED and still produced a false
# green, because of a fact the rule does not state:
#
#     npm test | tail -20        ->  the shell reports TAIL's status, not Jest's
#
# Bash reports the last stage of a pipeline. `tail` succeeds on anything it can read, so
# the suite's failure never reaches the shell. Jest compounds it by writing its summary to
# stderr, which a bare `|` does not carry — so the filtered text is quiet AND the status is
# 0 at the same moment, and "the suite is green" is the only reading left. It has happened
# here: a session reported a green suite off a run that had failed.
#
# A rule that can be satisfied and still be wrong is worse than no rule — it turns a
# mistake into a confident one. So this one is mechanical, like bench-port-guard.sh, whose
# header records the same lesson about prose: advisory to a model, and broken.
#
# Refused: a pipeline whose FIRST stage is a command whose exit code IS the verdict —
# npm test / typecheck / lint / build / gate, jest, tsc, eslint, the gate scripts, the E2E
# runner. Allowed: the same pipeline under `set -o pipefail`, or one that reads PIPESTATUS
# itself. Either says the author knows where the status comes from, which is the whole
# subject; there is nothing left to protect them from.
#
# The sanctioned form separates the two questions instead of nesting them — a FOREGROUND
# form:
#
#   npm test > /tmp/<scratchpad>/test.log 2>&1; echo "EXIT=$?"; tail -40 <same file>
#
# Never with run_in_background: true — poll-loop-guard.sh refuses that combination, because
# the harness's completion notification would then report the ECHO's exit status (always
# 0), not the suite's; a backgrounded run must stay the bare command, nothing chained after it.
#
# The status comes from the run, the text from the file. No filter stands between the
# suite and the exit code, and no stream is dropped on the way.
#
# Exit 0 = allow, exit 2 = block with the reason fed back to the model.
#
# The session heartbeat is not stamped here: bench-port-guard.sh runs on the same event
# and already stamps it for every Bash call.

set -uo pipefail

payload="$(cat)"

HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"

verdict="$(printf '%s' "$payload" | HOOKS_DIR="$HOOKS_DIR" node -e "
  const path = require('path');
  const { statements: statementsOf, splitOutsideQuotes } = require(path.join(process.env.HOOKS_DIR, 'bash-command-parse'));

  let raw = '';
  process.stdin.on('data', c => (raw += c));
  process.stdin.on('end', () => {
    let command = '';
    try { command = JSON.parse(raw)?.tool_input?.command ?? ''; } catch { command = ''; }

    // The two ways of asking the shell for the pipeline's real status. Either one and the
    // exit code is no longer the last stage's, which is the only thing being guarded.
    if (/set\s+-[A-Za-z]*o\s+pipefail|PIPESTATUS/.test(command)) {
      process.stdout.write('ok');
      return;
    }

    // '||' is a statement separator, not a pipe — split it out first, so every '|' left
    // inside a statement is a real pipe. The openers of a subshell and of a command
    // substitution go too, so \\\$(npm test | tail) is seen as the pipeline it is. Heredoc
    // stripping and quote-aware splitting both come from bash-command-parse.js now, shared
    // with investigation-form-guard.js instead of duplicated here.
    const statements = statementsOf(command);

    // A command that only READS a line of script — grep, cat, sed -n — mentions the verb
    // without invoking it. Only an invocation at the head of a stage counts.
    const strip = s => s.replace(/^\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)*/, '').trim();

    // Commands whose exit code is the answer, not a side effect.
    const VERDICT = [
      /^npm\s+(?:run\s+)?(?:test|typecheck|lint|build|gate|e2e)\b/,
      /^npm\s+run\s+(?:coverage|deps:gate)\b/,
      /^(?:npx\s+)?(?:jest|tsc|eslint)\b/,
      /^(?:npx\s+)?node\s+(?:--[^\s]+\s+)*(?:dist\/e2e\/run\.js|scripts\/(?:verify-gate|coverage-changed|check-pr-rules)\.js)\b/,
    ];
    // ...except when they are only being asked what they are. \`npx tsc --version | tail\`
    // has an exit code nobody is reading as a verdict.
    const isQuery = s => /(?:^|\s)(?:--version|--help)(?:\s|$)/.test(s);
    const isVerdict = s => !isQuery(s) && VERDICT.some(re => re.test(strip(s)));

    let reason = 'ok';
    let culprit = '';
    for (const statement of statements) {
      const stages = splitOutsideQuotes(statement, /\|/);
      if (stages.length >= 2 && isVerdict(stages[0])) {
        reason = 'pipe';
        // The suggested form appends its own redirections — carrying the stage's along
        // would print \`npm test 2>&1 > log 2>&1\`, which is advice nobody can follow.
        culprit = strip(stages[0])
          .replace(/\s*(?:\d?>&\d|\d?>>?\s*&?\s*[^\s|]+)/g, '')
          .trim()
          .slice(0, 120);
        break;
      }
    }
    process.stdout.write(reason === 'pipe' ? 'pipe\t' + culprit : 'ok');
  });
" 2>/dev/null)"

case "${verdict:-ok}" in
  pipe*)
    culprit="${verdict#pipe$'\t'}"
    echo "BLOCKED: that pipes a command whose exit code IS the verdict." >&2
    echo "" >&2
    echo "Bash reports the LAST stage of a pipeline, so the status you would read is the" >&2
    echo "filter's, not \`${culprit}\`'s — and a filter succeeds on anything it can read." >&2
    echo "Jest also writes its summary to stderr, which a bare \`|\` does not carry, so the" >&2
    echo "filtered text goes quiet at the same moment. That pair has already produced a" >&2
    echo "false \"suite green\" in this repo." >&2
    echo "" >&2
    echo "Separate the two questions instead of nesting them:" >&2
    echo "" >&2
    echo "  ${culprit} > /tmp/run.log 2>&1; echo \"EXIT=\$?\"; tail -40 /tmp/run.log" >&2
    echo "" >&2
    echo "(use your scratchpad directory for the log). The status comes from the run, the" >&2
    echo "text from the file — no filter in between, no stream dropped." >&2
    echo "" >&2
    echo "That is a FOREGROUND form. Backgrounded (run_in_background: true), the command" >&2
    echo "must stay bare — nothing chained after it — or poll-loop-guard.sh refuses it." >&2
    echo "" >&2
    echo "If you want the pipeline anyway, make the shell carry the real status:" >&2
    echo "" >&2
    echo "  set -o pipefail; ${culprit} 2>&1 | tail -40" >&2
    exit 2
    ;;
  *)
    exit 0
    ;;
esac
