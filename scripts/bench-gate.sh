#!/usr/bin/env bash
# `npm run gate` — gate the commit this branch has PUSHED.
#
# The gate used to test the worktree the session was standing in. That was the only reason
# a session had to live on the bench's machine, and the reason GitHub's merge queue was
# unusable: a speculative merge commit exists on GitHub and in nobody's worktree (#158).
#
# The subject was already a commit — a gate refused a dirty tree, so the tree it tested WAS
# HEAD. This changes the transport, not what is proven: the worker fetches the sha into a
# checkout it owns, builds it, drives it live, and attests it.
#
# Two things this asks of the session, both one-liners to satisfy:
#   1. commit  — a sha is what gets attested
#   2. push    — the worker fetches from GitHub, so the commit has to be there
#
# What is NOT asked any more: running the whole suite locally. CI runs typecheck, lint and
# the suite on the same sha, and the worker reads that result rather than replaying it
# (src/e2e/bench/ci-proof.ts) — which is what lets a laptop host a session at all.
# `npm run gate:precheck` still exists for local feedback before pushing; nothing requires it.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

head_sha="$(git rev-parse HEAD)"
branch="$(git rev-parse --abbrev-ref HEAD)"

if [ -n "$(git status --porcelain -uall)" ]; then
  echo "DIRTY TREE: this worktree has uncommitted or untracked changes." >&2
  echo "A gate attests a commit by sha, so there must be nothing outside it." >&2
  echo "Commit first, then:  npm run gate" >&2
  exit 2
fi

# The commit has to exist where the worker fetches from. `git branch -r --contains` answers
# from the local remote-tracking refs, so refresh them first — otherwise a just-pushed sha
# reads as missing and the session is sent to push something it already pushed.
git fetch --quiet origin 2>/dev/null
if [ -z "$(git branch -r --contains "$head_sha" 2>/dev/null)" ]; then
  echo "NOT PUSHED: ${head_sha:0:8} is not on origin, so the worker cannot fetch it." >&2
  echo "The bench gates a pushed commit now — doc/bench-worker.md §11." >&2
  echo "Push, then re-run:" >&2
  echo "  git push -u origin ${branch}" >&2
  echo "  npm run gate" >&2
  exit 2
fi

exec bash "$(dirname "$0")/bench-submit.sh" --type=ref --ref="$head_sha" --wait "$@"
