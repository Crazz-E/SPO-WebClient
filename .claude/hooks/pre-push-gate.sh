#!/usr/bin/env bash
# PreToolUse(Bash) — blocks `git push` unless the BENCH WORKER has attested this HEAD.
#
# doc/E2E-POLICY.md §3. An instruction in CLAUDE.md is advisory to a model; a hook is not.
# Since 2026-08-22 the attestation is the bench worker's verdicts/<sha>.json — written by
# the single process that owns the live bench (gateway port, LOCKED accounts, world
# state). A session-local `npm run gate:local` produces evidence for reading, but does
# NOT unblock a push: only the worker attests. `npm run gate` queues the job and waits.
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
    // Allow leading global flags, with or without a value: \`git -C . push\`.
    const pushes = segments.filter(s => /^\s*git\s+(?:-[^\s]+(?:\s+[^\s-][^\s]*)?\s+)*push(\s|$)/.test(s));
    const dryRun = /--dry-run/.test(command);
    // A push that only DELETES a remote ref (\`--delete\`, \`-d\`, or an empty-source refspec
    // \`origin :branch\`) moves no code and needs no attestation.
    const deleteOnly = pushes.length > 0 && pushes.every(s => /\s(?:--delete|-d)(?:\s|$)/.test(s) || /\s:[^\s]+/.test(s));
    process.stdout.write(pushes.length > 0 && !dryRun && !deleteOnly ? 'yes' : 'no');
  });
" 2>/dev/null)"

[ "$invokes_push" = "yes" ] || exit 0

# The repo to judge. Defaults to the working directory; overridden only so the hook's own
# test suite can exercise the attestation branches from a scratch repo on a feature
# branch — on `main` the branch guard below fires first and hides them.
repo="${GATE_REPO_DIR:-.}"
bench="${SPO_BENCH_DIR:-$HOME/.spo-bench}"

head_sha="$(git -C "$repo" rev-parse HEAD 2>/dev/null)"
branch="$(git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null)"
toplevel="$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null)"
attestation="${bench}/verdicts/${head_sha}.json"

if [ "$branch" = "main" ]; then
  echo "BLOCKED: direct push to main. doc/E2E-POLICY.md §3 — work on a feature/fix branch and open a PR." >&2
  exit 2
fi

if [ ! -f "$attestation" ]; then
  echo "BLOCKED: no bench attestation for HEAD (${head_sha:0:8})." >&2
  echo "Run:  npm run gate" >&2
  echo "It pre-checks locally (typecheck, lint, tests), then queues the job on the bench" >&2
  echo "worker, which builds this worktree, drives the L2 flows live against planitia and" >&2
  echo "attests the result. Only the worker attests — a local gate:local run does not" >&2
  echo "unblock a push. doc/E2E-POLICY.md §3." >&2
  exit 2
fi

read -r verdict stable wtree age_minutes <<EOF
$(node -e "
  const a = require(require('path').resolve('${attestation}'));
  const age = Math.floor((Date.now() - Date.parse(a.createdAt)) / 60000);
  process.stdout.write([a.verdict || 'UNKNOWN', String(a.fingerprintStable === true), a.worktree || '?', String(age)].join(' '));
" 2>/dev/null)
EOF

max_age="${GATE_MAX_AGE_MINUTES:-60}"

if [ "${verdict:-UNKNOWN}" != "PASS" ]; then
  echo "BLOCKED: the bench verdict for HEAD is ${verdict:-UNKNOWN}, not PASS." >&2
  if [ "${verdict:-}" = "BLOCKED" ]; then
    echo "The live stage was refused before running — a dirty world lock or the rate limit." >&2
    echo "Nothing was tested. Read the job report; a dirty world needs a human restore and" >&2
    echo "npm run e2e:unlock, then resubmit: npm run gate" >&2
  elif [ "${verdict:-}" = "STALE" ]; then
    echo "The tree changed while the job was queued or running; the result attests a tree" >&2
    echo "that no longer exists. Resubmit: npm run gate" >&2
  else
    echo "Fix the failure, commit, and re-run: npm run gate" >&2
    echo "Three attempts maximum, each naming a different root cause — doc/E2E-POLICY.md §8." >&2
  fi
  exit 2
fi

if [ "${stable:-false}" != "true" ]; then
  echo "BLOCKED: the attestation for HEAD is not fingerprint-stable — the tree moved during" >&2
  echo "the run. Resubmit: npm run gate" >&2
  exit 2
fi

if [ "${wtree:-?}" != "$toplevel" ]; then
  echo "BLOCKED: HEAD was attested for another worktree (${wtree:-?})." >&2
  echo "The bench tested that checkout's files, not this one's. Run npm run gate here." >&2
  exit 2
fi

if [ -n "${age_minutes:-}" ] && [ "$age_minutes" -gt "$max_age" ]; then
  echo "BLOCKED: the bench attestation is ${age_minutes} min old (limit ${max_age})." >&2
  echo "The live world moves; stale evidence is not evidence. Re-run: npm run gate" >&2
  exit 2
fi

echo "Bench attestation PASS for ${head_sha:0:8} (${age_minutes:-?} min old) — push allowed."
exit 0
