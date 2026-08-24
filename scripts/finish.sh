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
#   5. RETIRES this session's worktree (must be clean — `git worktree remove` refuses a
#      dirty one): it is marked finished, and the next run reaps it once no session is
#      using it any more. The branch goes with it.
#
# Step 5 used to remove the directory immediately, from inside it. That is why a session
# would suddenly stop working: everything it did afterwards ran in a cwd that no longer
# existed. `finish` is documented as the last command of a session, but an autonomous loop
# merges, finishes and CONTINUES — and a `--force` prune from a *neighbouring* session did
# the same to a session that was still working. So the removal is deferred by default and
# the reaping is guarded (see prune_worktrees): a directory someone stands in is never
# taken away.
#
# From the main checkout on `main` it only does 2-3 (useful after a merge made in the UI),
# plus the reaping.
#
#   npm run finish -- <branch>   finishes a branch that is NOT checked out anywhere — e.g.
#                                one a session worktree hosted and has since switched away
#                                from. Same MERGED check, same main sync; the worktree you
#                                stand in is left alone, only the branch goes.
#   npm run finish -- --now      remove this worktree at once instead of retiring it. For
#                                a human on the way out; a session that keeps working
#                                after it loses its cwd.
set -euo pipefail

MAIN_REPO="${SPO_MAIN_REPO:-$HOME/SPO-WebClient}"
here="$(git rev-parse --show-toplevel)"
branch="$(git rev-parse --abbrev-ref HEAD)"

# Where sessions leave their heartbeat (.claude/hooks/session-heartbeat.sh) and where this
# script marks a worktree retired. Outside every worktree, on purpose: a file inside one
# would make it dirty, which blocks both the gate and finish itself.
SESSIONS_DIR="${SPO_SESSION_DIR:-$HOME/.spo-bench/sessions}"
# How long a heartbeat keeps a worktree: long enough to cover a session thinking, short
# enough that an abandoned one is reaped the same day. A retired worktree needs far less —
# its work is already on main, only a live session still matters.
IDLE_MIN="${SPO_WORKTREE_IDLE_MIN:-120}"
RETIRED_IDLE_MIN="${SPO_RETIRED_IDLE_MIN:-15}"

target=""
remove_self=0
for arg in "$@"; do
  case "$arg" in
    --now) remove_self=1 ;;
    -*) echo "REFUSED: unknown option '$arg'." >&2; exit 1 ;;
    *) target="$arg" ;;
  esac
done

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

# The key of a worktree in SESSIONS_DIR — the path itself would not make a filename.
session_key() {
  printf '%s' "$(readlink -f "$1")" | sha1sum | cut -c1-16
}

# Is a session STANDING in this worktree? This is the guard that failed, and it failed in
# THREE ways at once — each of them takes a working session's directory away, after which
# every command that session runs lands in a path that no longer exists.
#
#   1. `set -o pipefail`, at the top of this script, decided the answer. The test was
#          ls -d /proc/[0-9]*/cwd | xargs -r readlink | grep -qx "$dir"
#      and /proc is a moving target: pids vanish between the glob and the readlink, so
#      readlink exits non-zero. Under pipefail the WHOLE pipeline is then non-zero —
#      whatever grep found. The guard answered "nobody is here" nearly every time it ran,
#      live session or not. Read the list first, judge it after.
#   2. An exact match is not what "in use" means: a shell that `cd src/client` inside the
#      worktree has a SUBDIRECTORY as its cwd. Prefix-match.
#   3. A removed directory reads back as "<path> (deleted)" — strip that before comparing.
processes_inside() {
  local dir cwds
  dir="$(readlink -f "$1" 2>/dev/null || printf '%s' "$1")"
  [ -d /proc ] || return 0 # cannot tell -> assume someone is there, keep the worktree
  cwds="$(ls -d /proc/[0-9]*/cwd 2>/dev/null | xargs -r readlink 2>/dev/null || true)"
  printf '%s\n' "$cwds" | awk -v d="$dir" '
    {
      sub(/ \(deleted\)$/, "")
      if (index($0, d) == 1 && (length($0) == length(d) || substr($0, length(d) + 1, 1) == "/")) hit = 1
    }
    END { exit !hit }
  '
}

# Minutes since this worktree's session last stamped its heartbeat; empty if it never has
# (a worktree from before heartbeats existed, or one no session ever opened).
heartbeat_age_min() {
  local file now stamp
  file="$SESSIONS_DIR/$(session_key "$1").alive"
  [ -f "$file" ] || return 0
  now="$(date +%s)"
  stamp="$(stat -c %Y "$file" 2>/dev/null || echo "$now")"
  echo $(( (now - stamp) / 60 ))
}

forget_session_files() {
  local key
  key="$(session_key "$1")"
  rm -f "$SESSIONS_DIR/$key.alive" "$SESSIONS_DIR/$key.finished" 2>/dev/null || true
}

# Session worktrees nobody is using any more. Three kinds, all clean, with no process
# standing inside them and no recent heartbeat:
#   - retired: `finish` ran there, its work is on main, and it was kept only so the
#     session that ran it would not lose the ground under its feet;
#   - orphans: zero commits ahead of origin/main — started and abandoned untouched;
#   - merged leftovers: commits ahead, but the branch's PR is MERGED on GitHub — the
#     session pushed, merged, and never ran finish. Its work is on main; only the shell
#     of it remains. Finishing it here is how one session's oversight is healed by the
#     next, mechanically.
# Anything else — an edit, an unmerged commit, a live session — is kept. Two independent
# proofs of life are required to fail before a directory is taken away, because the cost
# of being wrong is a session that cannot run a single command afterwards.
prune_worktrees() {
  local dir wt_branch ahead state retired age window
  for dir in "$MAIN_REPO"/.claude/worktrees/*/; do
    dir="${dir%/}"
    [ -d "$dir/.git" ] || [ -f "$dir/.git" ] || continue
    [ "$dir" = "$here" ] && continue
    [ -z "$(git -C "$dir" status --porcelain 2>/dev/null)" ] || continue
    processes_inside "$dir" && continue

    retired=0
    [ -f "$SESSIONS_DIR/$(session_key "$dir").finished" ] && retired=1
    window="$IDLE_MIN"
    [ "$retired" = "1" ] && window="$RETIRED_IDLE_MIN"
    age="$(heartbeat_age_min "$dir")"
    if [ -n "$age" ] && [ "$age" -lt "$window" ]; then
      echo "== keeping $dir — a session was working there ${age} min ago (idle window ${window} min)"
      continue
    fi

    wt_branch="$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
    ahead="$(git -C "$dir" rev-list --count origin/main..HEAD 2>/dev/null || echo 1)"
    if [ "$retired" = "1" ]; then
      echo "== reaping retired worktree $dir (finished earlier, nobody there since)"
    elif [ "$ahead" = "0" ]; then
      echo "== pruning orphan worktree $dir (clean, nothing ahead of main, no session inside)"
    else
      [ "$wt_branch" != "HEAD" ] && [ "$wt_branch" != "main" ] || continue
      state="$(gh pr view "$wt_branch" --json state -q .state 2>/dev/null || echo NONE)"
      [ "$state" = "MERGED" ] || continue
      echo "== finishing worktree $dir — its PR is MERGED and nobody ran finish"
    fi
    git -C "$MAIN_REPO" worktree remove --force "$dir"
    forget_session_files "$dir"
    if [ "$wt_branch" != "HEAD" ] && [ "$wt_branch" != "main" ]; then
      git -C "$MAIN_REPO" branch -D "$wt_branch" >/dev/null 2>&1 || true
    fi
  done
  git -C "$MAIN_REPO" worktree prune
}

if [ "$branch" = "main" ] && [ "$branch_only" = 0 ]; then
  sync_main
  prune_worktrees
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

if [ "$branch_only" = 0 ] && [ -n "$(git -C "$here" status --porcelain)" ]; then
  echo "REFUSED: '$here' has uncommitted changes — they are not on main. Commit or discard them first." >&2
  exit 1
fi

cd "$MAIN_REPO"
retired_here=0
if [ "$branch_only" = 0 ] && [ "$here" != "$MAIN_REPO" ]; then
  if [ "$remove_self" = "1" ]; then
    echo "== removing worktree $here"
    git worktree remove "$here"
    forget_session_files "$here"
  else
    # Retire it instead of pulling the ground from under whoever is running this. The
    # marker is what lets the next run reap it without asking GitHub again; until then
    # the directory is still there and the session can keep working in it.
    mkdir -p "$SESSIONS_DIR"
    printf '%s\t%s\n' "$here" "$branch" > "$SESSIONS_DIR/$(session_key "$here").finished"
    retired_here=1
    echo "== retiring worktree $here — kept while this session is in it"
  fi
fi

if [ "$retired_here" = "1" ]; then
  # The branch is still checked out here, so it cannot go yet; it is reaped with the
  # worktree. Nothing on origin survives either way — GitHub deleted it at merge.
  echo "== branch $branch stays checked out here (merged as ${merge_sha:0:8}); it goes with the worktree"
else
  echo "== deleting local branch $branch (merged as ${merge_sha:0:8})"
  git branch -D "$branch" >/dev/null
fi
git worktree prune
prune_worktrees

echo
if [ "$retired_here" = "1" ]; then
  echo "finished: main at $(git log --oneline -1)."
  echo "This worktree is retired: nothing left to do in it, and the next finish removes it"
  echo "once no session is standing here (idle window ${RETIRED_IDLE_MIN} min)."
  echo "To remove it now and lose this directory: npm run finish -- --now"
else
  echo "finished: main at $(git log --oneline -1), no branch left for '$branch' locally or on origin."
fi
