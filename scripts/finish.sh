#!/usr/bin/env bash
# npm run finish — the END of every code update. Idempotent; safe to re-run.
#
# The chain (gate -> push -> PR -> bench/gate + CI -> squash merge) guarantees what lands on
# main was tested. This script guarantees what is left behind afterwards: nothing.
#
#   1. refuses unless the PR for the current branch is MERGED — it deletes nothing that is
#      not on main;
#   2. fast-forwards the main checkout (~/SPO-WebClient) to origin/main;
#   3. prunes stale origin/* refs (GitHub already deleted the remote branch at merge —
#      delete_branch_on_merge);
#   4. reinstalls the bench worker when the merge touched its sources — the worker runs
#      the main checkout's dist/, and nothing else rebuilds it; refreshes the main
#      checkout's node_modules when the merge changed a lockfile — every session worktree
#      resolves its packages from there;
#   5. removes this session's worktree (must be clean — `git worktree remove` refuses a
#      dirty one) and the local branch.
#
# Run it as the LAST command of a session: step 5 removes the directory you stand in.
# From the main checkout on `main` it only does 2-3 (useful after a merge made in the UI).
#
#   npm run finish -- <branch>   finishes a branch that is NOT checked out anywhere — e.g.
#                                one a session worktree hosted and has since switched away
#                                from. Same MERGED check, same main sync; the worktree you
#                                stand in is left alone, only the branch goes.
set -euo pipefail

MAIN_REPO="${SPO_MAIN_REPO:-$HOME/SPO-WebClient}"
here="$(git rev-parse --show-toplevel)"
branch="$(git rev-parse --abbrev-ref HEAD)"
target="${1:-}"
branch_only=0
if [ -n "$target" ] && [ "$target" != "$branch" ]; then
  if git -C "$MAIN_REPO" worktree list --porcelain | grep -qx "branch refs/heads/$target"; then
    echo "REFUSED: '$target' is checked out in a worktree — run npm run finish from there." >&2
    exit 1
  fi
  if ! git -C "$MAIN_REPO" rev-parse --verify -q "refs/heads/$target" >/dev/null; then
    echo "REFUSED: no local branch '$target'." >&2
    exit 1
  fi
  branch="$target"
  branch_only=1
fi

sync_main() {
  echo "== main: fast-forward to origin/main, prune stale refs"
  git -C "$MAIN_REPO" fetch --prune --quiet origin
  git -C "$MAIN_REPO" pull --ff-only --quiet origin main
  git -C "$MAIN_REPO" log --oneline -1
}

# Session worktrees that hold nothing: clean, zero commits ahead of origin/main, and no
# process living inside them (a session still open has its shell there). They appear when
# a session is started and abandoned without touching anything — the harness leaves them,
# and they pile up. Anything that carries work (a commit, an edit, a live shell) is kept.
prune_orphan_worktrees() {
  local dir wt_branch
  for dir in "$MAIN_REPO"/.claude/worktrees/*/; do
    dir="${dir%/}"
    [ -d "$dir/.git" ] || [ -f "$dir/.git" ] || continue
    [ "$dir" = "$here" ] && continue
    [ -z "$(git -C "$dir" status --porcelain 2>/dev/null)" ] || continue
    [ "$(git -C "$dir" rev-list --count origin/main..HEAD 2>/dev/null || echo 1)" = "0" ] || continue
    if [ -d /proc ] && ls -d /proc/[0-9]*/cwd 2>/dev/null | xargs -r readlink 2>/dev/null | grep -qx "$dir"; then
      continue
    fi
    wt_branch="$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
    echo "== pruning orphan worktree $dir (clean, nothing ahead of main, no process inside)"
    git -C "$MAIN_REPO" worktree remove --force "$dir"
    if [ "$wt_branch" != "HEAD" ] && [ "$wt_branch" != "main" ]; then
      git -C "$MAIN_REPO" branch -D "$wt_branch" >/dev/null 2>&1 || true
    fi
  done
  git -C "$MAIN_REPO" worktree prune
}

if [ "$branch" = "main" ] && [ "$branch_only" = 0 ]; then
  sync_main
  prune_orphan_worktrees
  echo "on main: nothing else to finish"
  exit 0
fi

state="$(gh pr view "$branch" --json state -q .state 2>/dev/null || echo NONE)"
if [ "$state" != "MERGED" ]; then
  echo "REFUSED: the PR for '$branch' is $state, not MERGED." >&2
  echo "npm run finish deletes nothing that is not on main. Merge first (bench/gate + CI" >&2
  echo "green, squash), then run it again." >&2
  exit 1
fi
merge_sha="$(gh pr view "$branch" --json mergeCommit -q .mergeCommit.oid)"

sync_main

if git -C "$MAIN_REPO" diff --name-only "${merge_sha}^" "$merge_sha" | grep -qE '^src/e2e/bench/|^scripts/bench-'; then
  echo "== the merge touched the bench worker — reinstalling it from main"
  bash "$MAIN_REPO/scripts/bench-install.sh"
fi

# A merged dependency bump must reach the main checkout's node_modules at once: session
# worktrees have none of their own and resolve up to this one, so a lagging install would
# build and test every later branch against the packages the merge just replaced. The
# worker runs dist/, which npm ci does not touch.
if git -C "$MAIN_REPO" diff --name-only "${merge_sha}^" "$merge_sha" | grep -qx 'package-lock.json'; then
  echo "== the merge changed package-lock.json — npm ci in $MAIN_REPO"
  (cd "$MAIN_REPO" && npm ci --no-audit --no-fund)
fi
if git -C "$MAIN_REPO" diff --name-only "${merge_sha}^" "$merge_sha" | grep -qx 'electron/package-lock.json'; then
  echo "== the merge changed electron/package-lock.json — npm ci --prefix electron in $MAIN_REPO"
  (cd "$MAIN_REPO" && npm ci --no-audit --no-fund --prefix electron)
fi

if [ "$branch_only" = 0 ] && [ -n "$(git -C "$here" status --porcelain)" ]; then
  echo "REFUSED: '$here' has uncommitted changes — they are not on main. Commit or discard them first." >&2
  exit 1
fi

cd "$MAIN_REPO"
if [ "$branch_only" = 0 ] && [ "$here" != "$MAIN_REPO" ]; then
  echo "== removing worktree $here"
  git worktree remove "$here"
fi
echo "== deleting local branch $branch (merged as ${merge_sha:0:8})"
git branch -D "$branch" >/dev/null
git worktree prune
prune_orphan_worktrees

echo
echo "finished: main at $(git log --oneline -1), no branch left for '$branch' locally or on origin."
