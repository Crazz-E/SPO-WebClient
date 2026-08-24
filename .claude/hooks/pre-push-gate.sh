#!/usr/bin/env bash
# PreToolUse(Bash) — blocks a direct `git push` to `main`.
#
# doc/E2E-POLICY.md §3. An instruction in CLAUDE.md is advisory to a model; a hook is not.
#
# Until #158 stage C this also refused any push whose HEAD the bench had not attested.
# That rule became self-contradictory the moment the gate started testing a commit the
# worker FETCHES: a commit must be pushed before it can be gated, so "no push without an
# attestation" and "no attestation without a push" cannot both hold.
#
# The check did not disappear, it moved to where the irreversible act is. `bench/gate` is
# a required status check on `main` with an empty bypass list, so a pull request cannot
# merge without the worker's live evidence for its head sha — and neither can the
# maintainer. Pushing a branch nobody has gated is now how a session ASKS to be gated.
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
    const isPush = s => /^\s*git\s+(?:-[^\s]+(?:\s+[^\s-][^\s]*)?\s+)*push(\s|$)/.test(s);
    const pushes = segments.filter(isPush);
    const dryRun = /--dry-run/.test(command);
    // A push that only DELETES a remote ref (\`--delete\`, \`-d\`, or an empty-source refspec
    // \`origin :branch\`) moves no code and needs no attestation.
    const deleteOnly = pushes.length > 0 && pushes.every(s => /\s(?:--delete|-d)(?:\s|$)/.test(s) || /\s:[^\s]+/.test(s));

    // Which repo the push acts on. The hook runs in the SESSION's cwd, which is not where
    // a \`cd <worktree> && git push\` or a \`git -C <worktree> push\` lands — judging the
    // session's own HEAD there would block a correctly attested push (or, worse, bless the
    // wrong tree). Take \`-C <dir>\` from the push itself, else the last \`cd <dir>\` before it.
    let dir = '';
    const first = segments.findIndex(isPush);
    if (first >= 0) {
      const c = segments[first].match(/\s-C\s+([^\s]+)/);
      if (c) dir = c[1];
      else {
        for (let i = first - 1; i >= 0; i--) {
          const cd = segments[i].match(/^\s*cd\s+([^\s]+)\s*$/);
          if (cd) { dir = cd[1]; break; }
        }
      }
    }
    process.stdout.write((pushes.length > 0 && !dryRun && !deleteOnly ? 'yes' : 'no') + '\t' + dir.replace(new RegExp('^[\\x22\\x27]|[\\x22\\x27]$', 'g'), ''));
  });
" 2>/dev/null)"

push_dir="${invokes_push#*	}"
invokes_push="${invokes_push%%	*}"
[ "$invokes_push" = "yes" ] || exit 0

# The repo to judge: the directory the push command itself names (\`git -C <dir>\`, or a
# preceding \`cd <dir>\`), else the working directory. GATE_REPO_DIR overrides both, so the
# hook's own test suite can point it at a scratch repo.
repo="${GATE_REPO_DIR:-${push_dir:-.}}"

head_sha="$(git -C "$repo" rev-parse HEAD 2>/dev/null)"
branch="$(git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null)"

if [ "$branch" = "main" ]; then
  echo "BLOCKED: direct push to main. doc/E2E-POLICY.md §3 — work on a feature/fix branch and open a PR." >&2
  exit 2
fi

# Everything from here used to refuse the push unless the bench had attested HEAD. That
# check is gone, and its absence is the point of #158 stage C.
#
# The gate now tests a commit the worker FETCHES, so a commit must be pushed before it can
# be gated at all. Keeping the old rule would have made the two mutually exclusive: no push
# without an attestation, no attestation without a push.
#
# Nothing is loosened, because the push was never the irreversible act — the merge is, and
# that is where the rule now lives. `bench/gate` is a required status check on `main` with
# an EMPTY bypass list (ruleset 21111153), so a pull request still cannot merge without the
# worker's live evidence for its head sha, and the maintainer cannot wave it through either.
# What a session can now do that it could not before is push a branch nobody has gated —
# which is exactly how it asks to be gated.
#
# The `main` block above stays, and it is now this hook's whole job.

echo "Push allowed. Gate the pushed commit with:  npm run gate"
echo "(the bench fetches ${head_sha:0:8} and attests it as bench/gate — doc/bench-worker.md §11)"
exit 0
