#!/usr/bin/env bash
# PreToolUse(Bash) — refuses `git add` / `git commit` when the repository the command acts
# on is standing on `main`.
#
# pre-push-gate.sh already refuses a push from `main`, and the GitHub ruleset (21111153,
# empty bypass list) refuses one at the server. Between them, nothing a session commits on
# `main` can ever reach the remote. What neither of them stops is the commit itself, and
# that is the shape the leak actually took:
#
#   the main checkout ~/SPO-WebClient is permanently ON `main`, and every session worktree
#   lives INSIDE it, under .claude/worktrees/. So a sub-agent handed an absolute path, or a
#   `cd ~/SPO-WebClient` that persists into the next Bash call, edits and commits the main
#   checkout while believing it is in its worktree. The work lands on `main` locally,
#   invisible to the branch it was meant for, and the session's own branch stays empty.
#
# Path cannot separate the two — the worktrees are nested under the checkout, so any deny
# rule broad enough to cover ~/SPO-WebClient covers every session with it. The branch can:
# a worktree is never on `main` (git refuses the same branch twice), so "the resolved repo
# is on main" is true for the main checkout and false for every worktree, always.
#
# Scope, kept narrow — a false positive costs a session a turn:
#   refused  `git add` / `git commit` whose resolved repo is on `main`
#   allowed  everything else: any other branch, a non-repo, a --dry-run, a mention inside a
#            heredoc or a grep, and every read-only git command.
#
# It sees only what the model itself runs. `npm run finish`, `deps-gate.sh` and the bench
# worker do their git work inside scripts, which no PreToolUse hook observes — and none of
# them commits on `main` anyway (finish only fast-forwards it).
#
# Exit 0 = allow. Exit 2 = block, and stderr goes back to the model as the reason.

set -uo pipefail

payload="$(cat)"

# Does this command actually INVOKE `git add` / `git commit`, and against which repo? The
# three traps are the ones pre-push-gate.sh already documents: a command may merely MENTION
# the verb, a heredoc body is text rather than commands, and a real invocation can sit
# anywhere in a chain.
verdict="$(printf '%s' "$payload" | node -e "
  let raw = '';
  process.stdin.on('data', c => (raw += c));
  process.stdin.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(raw) ?? {}; } catch { parsed = {}; }
    const command = parsed?.tool_input?.command ?? '';

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
    // Allow leading global flags, with or without a value: \`git -C . commit\`. The
    // trailing boundary keeps this off \`git commit-tree\`.
    const isWrite = s => /^\s*git\s+(?:-[^\s]+(?:\s+[^\s-][^\s]*)?\s+)*(?:add|commit)(\s|$)/.test(s);
    const writes = segments.filter(isWrite);
    const dryRun = /--dry-run/.test(command);

    // Which repo the write acts on. Take \`-C <dir>\` from the write itself, else the last
    // \`cd <dir>\` before it — the resolution pre-push-gate.sh already uses — else the cwd
    // the payload carries.
    //
    // That last fallback is the one that closes the real vector, and it cannot be replaced
    // by this process's own cwd: the hook is spawned in the project directory, while the
    // Bash tool's working directory PERSISTS between calls. So a \`cd ~/SPO-WebClient\` in
    // one call leaves a bare \`git commit\` in the NEXT call landing on main, with nothing
    // in that second command naming the repo. The payload's cwd follows Claude's cd; the
    // hook's own does not.
    let dir = '';
    const first = segments.findIndex(isWrite);
    if (first >= 0) {
      const c = segments[first].match(/\s-C\s+([^\s]+)/);
      if (c) dir = c[1];
      else {
        for (let i = first - 1; i >= 0; i--) {
          const cd = segments[i].match(/^\s*cd\s+([^\s]+)\s*\$/);
          if (cd) { dir = cd[1]; break; }
        }
      }
    }
    if (!dir && typeof parsed?.cwd === 'string') dir = parsed.cwd;

    const engaged = writes.length > 0 && !dryRun;
    process.stdout.write((engaged ? 'yes' : 'no') + '\t' + dir.replace(new RegExp('^[\\x22\\x27]|[\\x22\\x27]\$', 'g'), ''));
  });
" 2>/dev/null)"

write_dir="${verdict#*	}"
invokes_write="${verdict%%	*}"
[ "$invokes_write" = "yes" ] || exit 0

# GATE_REPO_DIR overrides the resolution, so this hook's test suite can point it at a
# scratch repo — the same escape pre-push-gate.sh uses.
repo="${GATE_REPO_DIR:-${write_dir:-.}}"

branch="$(git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null)"
[ "$branch" = "main" ] || exit 0

toplevel="$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null)"

echo "BLOCKED: that stages or commits into a repository standing on \`main\`." >&2
echo "" >&2
echo "  repository: ${toplevel:-$repo}" >&2
echo "" >&2
echo "This is almost always the main checkout (~/SPO-WebClient), reached by an absolute" >&2
echo "path or by a \`cd\` that persisted from an earlier Bash call — not the worktree you" >&2
echo "meant to be in. Work committed there lands on your local \`main\`, where no push and" >&2
echo "no pull request can carry it, while the branch it was meant for stays empty." >&2
echo "" >&2
echo "Run the command in your session worktree instead, addressing it explicitly:" >&2
echo "" >&2
echo "  git -C <worktree> add -A" >&2
echo "  git -C <worktree> commit -F <message-file>" >&2
echo "" >&2
echo "CLAUDE.md § Git: commit on a branch, then push and open a pull request. If you truly" >&2
echo "do need a commit on \`main\`, that is the maintainer's call, not a session's." >&2
exit 2
