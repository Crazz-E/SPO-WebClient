#!/usr/bin/env bash
# PreToolUse(Bash) — refuses a shell `grep` that searches a file, and points at the native
# Grep() tool instead.
#
# CLAUDE.md § Environment already says it: "Use Claude Code tools (Read, Grep, Glob, Edit,
# Write) rather than shell grep/find/cat/sed. The permission allowlist deliberately excludes
# those shell aliases." That is prose, advisory to a model — and a model reaching for
# `grep -n "pattern" file | head -30` under pressure (a quick one-off lookup, mid-investigation)
# is the same failure mode bench-port-guard.sh and item-list-guard.sh were built to close: a
# rule that lives only in CLAUDE.md is a rule a model can read and still not apply. The native
# Grep tool gives structured matches (file, line, text) without a shell round trip, a `head`
# guess at how much output to keep, or the ISO-8859 binary-detection trap CLAUDE.md already
# warns about for some `.pas` files.
#
# What is refused: a `grep` invocation whose arguments name a FILE beyond the pattern —
# `grep -n "pattern" file`, `grep -n "pattern" -A 30 file | head -N`, `grep -r "x" doc/`. What
# is allowed: `grep` used as a plain filter over another command's output with no file
# argument of its own (`ps aux | grep node`, `git status | grep modified`) — that is not a file
# search, it is a pipeline stage, and the native tool has no equivalent for it. Also allowed:
# every non-grep command, and a heredoc body that merely mentions `grep`.
#
# Exit 0 = allow, exit 2 = block with the reason fed back to the model.

set -uo pipefail

payload="$(cat)"

verdict="$(printf '%s' "$payload" | node -e "
  let raw = '';
  process.stdin.on('data', c => (raw += c));
  process.stdin.on('end', () => {
    let command = '';
    try { command = JSON.parse(raw)?.tool_input?.command ?? ''; } catch { command = ''; }

    // A heredoc body is text, not commands — a doc that quotes \`grep -n\` is not a run. Same
    // skeleton as item-list-guard.sh / bench-port-guard.sh.
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

    // Split on every statement/pipe boundary so each stage of a pipeline is judged on its
    // own — \`grep pattern file | head\` and \`ps aux | grep node\` must not be judged by the
    // same segment.
    const segments = text.split(/\n|;|&&|\|\||\||\(/);

    const strip = s => s.replace(/^\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)*/, '').trim();

    // Value-taking short flags: the option and its value are two tokens, neither of which is
    // the pattern or a file (\`-A 30\`, \`-e pat\`, \`-f patfile\`, \`-m 3\`, \`-d action\`).
    const SHORT_VALUE_FLAGS = new Set(['-A', '-B', '-C', '-e', '-f', '-m', '-d']);
    // Same idea for the long forms, when given as two tokens rather than \`--flag=value\`.
    const LONG_VALUE_FLAGS = new Set([
      '--after-context', '--before-context', '--context',
      '--regexp', '--file', '--max-count', '--label', '--binary-files',
    ]);

    function tokenize(s) {
      const out = [];
      const re = /\"[^\"]*\"|'[^']*'|\S+/g;
      let m;
      while ((m = re.exec(s)) !== null) out.push(m[0]);
      return out;
    }

    // Does this ONE segment invoke shell grep against a file (as opposed to a bare pattern
    // reading whatever is piped into it)?
    function isFileSearchGrep(segment) {
      const command = strip(segment);
      const tokens = tokenize(command);
      if (tokens.length === 0) return false;
      if (tokens[0] !== 'grep') return false;

      const positionals = [];
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.startsWith('-') && t !== '-') {
          if (SHORT_VALUE_FLAGS.has(t) || LONG_VALUE_FLAGS.has(t)) {
            i++; // consume the flag's value — not a pattern, not a file
          }
          // else: a boolean flag (-n, -i, -r, -v, -w, -l, -c, -E, -F, -P, --color, ...) —
          // combined short flags (-rn) and \`--flag=value\` long forms are both self-contained
          // single tokens and need no extra consumption.
          continue;
        }
        positionals.push(t);
      }

      // First positional is the pattern; anything after it is a file argument.
      return positionals.length >= 2;
    }

    process.stdout.write(segments.some(isFileSearchGrep) ? 'block' : 'ok');
  });
" 2>/dev/null)"

# Refusal ledger (card #369) — count this refusal, so the message below can tell a first
# refusal from a session still composing variants of the same blocked command. Computed only
# when we are actually about to block; a passing call never touches the ledger.
count=0
if [ "${verdict:-ok}" != "ok" ]; then
  count="$(node "$(dirname "$0")/refusal-ledger.js" "grep-guard" 2>/dev/null || echo 0)"
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
    echo "BLOCKED: that runs shell \`grep\` against a file instead of the native Grep() tool." >&2
    echo "" >&2
    echo "CLAUDE.md § Environment: \"Use Claude Code tools (Read, Grep, Glob, Edit, Write)" >&2
    echo "rather than shell grep/find/cat/sed. The permission allowlist deliberately excludes" >&2
    echo "those shell aliases.\" The native tool returns structured matches (file, line, text)" >&2
    echo "with no shell round trip, no \`| head -N\` guess at how much to keep, and none of the" >&2
    echo "ISO-8859 binary-detection trap a plain \`grep\` hits on some .pas files." >&2
    echo "" >&2
    echo "  Grep(pattern: \"pattern\", path: \"file-or-dir\")   structured matches, paged for you" >&2
    echo "" >&2
    echo "A \`grep\` with no file argument, filtering another command's output" >&2
    echo "(\`ps aux | grep node\`), is unaffected — that is a pipeline stage, not a file search." >&2
    if [ -n "$escalation" ]; then echo "$escalation" >&2; fi
    exit 2
    ;;
  *)
    exit 0
    ;;
esac
