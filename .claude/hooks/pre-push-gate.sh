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
# That justification is load-bearing, and it has failed once: `bench/gate` was REMOVED from
# ruleset 21111153's required list 2026-08-29T10:17:40Z and restored 2026-09-03T07:32:42+02:00
# (action B1.5). For those five days this hook stood down on a guarantee that did not exist,
# and 11 PRs merged behind a gate that certified less than its name promised. Verify, never
# assume:
#   gh api repos/Crazz-Org/SPO-WebClient/rulesets/21111153 --jq '.rules[]|select(.type=="required_status_checks").parameters.required_status_checks[].context, .bypass_actors'
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
      // Scrub arithmetic expansions first so an arithmetic left-shift never reads as a
      // heredoc start; exclude herestrings (triple-angle-bracket) with the lookbehind/lookahead pair.
      const scrubbed = line.replace(/\\\$\(\([\s\S]*?\)\)/g, '');
      const heredoc = scrubbed.match(/(?<!<)<<(?!<)-?\s*[\"']?([A-Za-z_][A-Za-z0-9_]*)[\"']?/);
      if (heredoc) terminator = heredoc[1];
    }

    // Drop an unquoted trailing comment per line before segmenting — errs toward blocking,
    // which is the safe direction for a push gate (\`git push origin main # not a --dry-run\`).
    const uncommented = kept.map(l => l.replace(/\s#.*$/, '')).join('\n');
    const segments = uncommented.split(/\n|;|&&|\|\||\||\(/);
    // Allow leading global flags, with or without a value: \`git -C . push\`.
    const isPush = s => /^\s*git\s+(?:-[^\s]+(?:\s+[^\s-][^\s]*)?\s+)*push(\s|$)/.test(s);
    const pushes = segments.filter(isPush);
    // Per-segment, not per-command: \`echo --dry-run && git push origin main\` must not be
    // disarmed by a --dry-run token that belongs to a DIFFERENT segment.
    const dryRun = pushes.length > 0 && pushes.every(s => /(^|\s)--dry-run(\s|$)/.test(s));
    // A push that only DELETES a remote ref (\`--delete\`, \`-d\`, or an empty-source refspec
    // \`origin :branch\`) moves no code and needs no attestation.
    const deleteOnly = pushes.length > 0 && pushes.every(s => /\s(?:--delete|-d)(?:\s|$)/.test(s) || /\s:[^\s]+/.test(s));

    // Refspec pushes to main from ANY branch — \`git push origin HEAD:main\`,
    // \`origin fix/x:main\`, \`--force origin HEAD:main\` — are not caught by the current-branch
    // check below, which only sees the session's own HEAD. Tokenize each engaged push after
    // \`push\`, drop flags, treat the first remaining token as the remote when 2+ tokens
    // remain, and refuse when any remaining refspec's destination (after the last \`:\`, \`+\`
    // stripped) is \`main\` or \`refs/heads/main\`.
    let refspecToMain = false;
    if (!dryRun && !deleteOnly) {
      for (const s of pushes) {
        const afterPush = s.replace(/^\s*git\s+(?:-[^\s]+(?:\s+[^\s-][^\s]*)?\s+)*push\s*/, '');
        const tokens = afterPush.split(/\s+/).filter(Boolean).filter(t => !t.startsWith('-'));
        const refspecs = tokens.length >= 2 ? tokens.slice(1) : [];
        for (const raw of refspecs) {
          const spec = raw.replace(/^\+/, '');
          const dest = spec.includes(':') ? spec.slice(spec.lastIndexOf(':') + 1) : spec;
          if (dest === 'main' || dest === 'refs/heads/main') refspecToMain = true;
        }
      }
    }

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
    const engaged = pushes.length > 0 && !dryRun && !deleteOnly;
    const verdict = engaged ? (refspecToMain ? 'main' : 'yes') : 'no';
    process.stdout.write(verdict + '\t' + dir.replace(new RegExp('^[\\x22\\x27]|[\\x22\\x27]$', 'g'), ''));
  });
" 2>/dev/null)"

push_dir="${invokes_push#*	}"
invokes_push="${invokes_push%%	*}"

if [ "$invokes_push" = "main" ]; then
  echo "BLOCKED: push to main by refspec (e.g. \`origin HEAD:main\`, \`origin <branch>:main\`)." >&2
  echo "doc/E2E-POLICY.md §3 — work on a feature/fix branch and open a PR." >&2
  exit 2
fi
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
# See the header: that ruleset property was false 2026-08-29 to 2026-09-03. It holds again,
# but it is a fact about a server-side setting this file cannot see, not an invariant.
#
# The `main` block above stays, and it is now this hook's whole job.

echo "Push allowed. Gate the pushed commit with:  npm run gate"
echo "(the bench fetches ${head_sha:0:8} and attests it as bench/gate — doc/bench-worker.md §11)"
exit 0
