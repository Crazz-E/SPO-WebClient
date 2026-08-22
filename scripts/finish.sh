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
set -euo pipefail

MAIN_REPO="${SPO_MAIN_REPO:-$HOME/SPO-WebClient}"
here="$(git rev-parse --show-toplevel)"
branch="$(git rev-parse --abbrev-ref HEAD)"

sync_main() {
  echo "== main: fast-forward to origin/main, prune stale refs"
  git -C "$MAIN_REPO" fetch --prune --quiet origin
  git -C "$MAIN_REPO" pull --ff-only --quiet origin main
  git -C "$MAIN_REPO" log --oneline -1
}

if [ "$branch" = "main" ]; then
  sync_main
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

if [ -n "$(git -C "$here" status --porcelain)" ]; then
  echo "REFUSED: '$here' has uncommitted changes — they are not on main. Commit or discard them first." >&2
  exit 1
fi

cd "$MAIN_REPO"
if [ "$here" != "$MAIN_REPO" ]; then
  echo "== removing worktree $here"
  git worktree remove "$here"
fi
echo "== deleting local branch $branch (merged as ${merge_sha:0:8})"
git branch -D "$branch" >/dev/null
git worktree prune

echo
echo "finished: main at $(git log --oneline -1), no branch left for '$branch' locally or on origin."
