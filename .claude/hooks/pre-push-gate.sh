#!/usr/bin/env bash
# PreToolUse(Bash) — blocks `git push` unless a fresh, matching gate artifact exists.
#
# doc/E2E-POLICY.md §3. An instruction in CLAUDE.md is advisory to a model; a hook is not.
# The gate itself runs the checks (`npm run gate`); this hook only verifies its verdict.
#
# Exit 0 = allow. Exit 2 = block, and stderr goes back to the model as the reason.

set -uo pipefail

payload="$(cat)"

# Decide whether this command actually INVOKES a push. Three things make that non-trivial,
# and all three have bitten already:
#   - a command may merely MENTION the verb (grep, a doc being written) — not a push;
#   - a heredoc body is text, not commands — its lines must be stripped before matching;
#   - a real invocation can sit anywhere in a chain (`a && git push`, or a later line).
invokes_push="$(printf '%s' "$payload" | node -e "
  let raw = '';
  process.stdin.on('data', c => (raw += c));
  process.stdin.on('end', () => {
    let command = '';
    try { command = JSON.parse(raw)?.tool_input?.command ?? ''; } catch { command = ''; }

    // Drop heredoc bodies: everything from the <<DELIM line up to its terminator.
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

    const segments = kept.join('\n').split(/\n|;|&&|\|\||\||\(/);
    // Allow leading global flags, with or without a value: `git -C . push`.
    const isPush = segments.some(s => /^\s*git\s+(?:-[^\s]+(?:\s+[^\s-][^\s]*)?\s+)*push(\s|$)/.test(s));
    const dryRun = /--dry-run/.test(command);
    process.stdout.write(isPush && !dryRun ? 'yes' : 'no');
  });
" 2>/dev/null)"

[ "$invokes_push" = "yes" ] || exit 0

# The repo to judge. Defaults to the working directory; overridden only so the hook's own
# test suite can exercise the artifact branches from a scratch repo on a feature branch —
# on `main` the branch guard below fires first and hides them.
repo="${GATE_REPO_DIR:-.}"

head_sha="$(git -C "$repo" rev-parse HEAD 2>/dev/null)"
branch="$(git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null)"
artifact="${repo}/report/e2e/gate-${head_sha}.json"

if [ "$branch" = "main" ]; then
  echo "BLOCKED: direct push to main. doc/E2E-POLICY.md §3 — work on a feature/fix branch and open a PR." >&2
  exit 2
fi

if [ ! -f "$artifact" ]; then
  echo "BLOCKED: no gate artifact for HEAD (${head_sha:0:8})." >&2
  echo "Run:  npm run gate" >&2
  echo "The gate runs static checks, the President exclusion, and the L2 live drive against" >&2
  echo "planitia, then writes ${artifact}. doc/E2E-POLICY.md §3." >&2
  exit 2
fi

verdict="$(node -e "
  const a = require(require('path').resolve('${artifact}'));
  process.stdout.write(String(a.verdict || 'UNKNOWN'));
" 2>/dev/null)"

age_minutes="$(node -e "
  const a = require(require('path').resolve('${artifact}'));
  const ms = Date.now() - Date.parse(a.createdAt);
  process.stdout.write(String(Math.floor(ms / 60000)));
" 2>/dev/null)"

max_age="${GATE_MAX_AGE_MINUTES:-60}"

if [ "$verdict" != "PASS" ]; then
  echo "BLOCKED: the gate verdict for HEAD is ${verdict}, not PASS." >&2
  if [ "$verdict" = "BLOCKED" ]; then
    echo "This diff touches President-only members. A person must verify it by hand, then:" >&2
    echo "  npm run gate -- --manual-verified=\"<what you ran, and the result>\"" >&2
    echo "Do not mark it verified on the developer's behalf — doc/E2E-POLICY.md §7." >&2
  else
    echo "Fix the failure, commit, and re-run: npm run gate" >&2
    echo "Three attempts maximum, each naming a different root cause — doc/E2E-POLICY.md §8." >&2
  fi
  exit 2
fi

if [ -n "$age_minutes" ] && [ "$age_minutes" -gt "$max_age" ]; then
  echo "BLOCKED: the gate artifact is ${age_minutes} min old (limit ${max_age})." >&2
  echo "The live world moves; stale evidence is not evidence. Re-run: npm run gate" >&2
  exit 2
fi

echo "Gate PASS for ${head_sha:0:8} (${age_minutes} min old) — push allowed."
exit 0
