#!/usr/bin/env bash
# `npm run pr:wait -- <pr-number> [--interval-sec=N] [--timeout-min=N]`
#
# Wait for a pull request to leave the merge queue. Meant to run as ONE background
# command, so a waiting session spends zero tokens on the wait itself.
#
# Why this exists as a script rather than as a line a session composes:
#
#   until gh pr view 276 --json mergedAt --jq '.mergedAt' | grep -qv null; do sleep 5; done
#
# That is what a session reaches for when the step is "wait for the merge", and it is wrong
# three times over. It polls GitHub every 5 s, against the >= 30 s floor in
# doc/kanban-workflow.md § GitHub API discipline — five looping sessions on one account is
# exactly what made the board unreadable on 2026-08-25. It has no deadline, so a PR that
# never lands hangs the session forever. And it is a hand-composed compound, which matches
# no allowlist entry and stops to ask the human — the one thing the npm aliases exist to
# remove.
#
# Bounded by BOTH halves of that rule: at most 20 polls or 10 minutes, whichever comes
# first. A wait that states no bound is a wait a background loop runs forever.
#
# Exit: 0 merged - 1 closed unmerged - 4 bound reached while still open.
set -uo pipefail

REPO="Crazz-Org/SPO-WebClient"
pr=""
interval=30
timeout_min=10   # the bound in doc/kanban-workflow.md § GitHub API discipline, rule 2
max_polls=20     # ...and its other half: whichever comes first

for arg in "$@"; do
  case "$arg" in
    --interval-sec=*) interval="${arg#*=}" ;;
    --timeout-min=*)  timeout_min="${arg#*=}" ;;
    -*) echo "unknown flag: $arg" >&2; exit 2 ;;
    *)  pr="$arg" ;;
  esac
done

if [ -z "$pr" ]; then
  echo "usage: npm run pr:wait -- <pr-number> [--interval-sec=N] [--timeout-min=N]" >&2
  exit 2
fi

# The floor is the rule, not a default: a smaller interval is refused rather than clamped,
# so nobody reads a passing run as licence to poll faster.
if [ "$interval" -lt 30 ]; then
  echo "REFUSED: --interval-sec=$interval is below the 30 s floor in" >&2
  echo "doc/kanban-workflow.md § GitHub API discipline. One account, 5000 points an hour," >&2
  echo "shared by every session and workflow on every machine." >&2
  exit 2
fi

deadline=$(( $(date +%s) + timeout_min * 60 ))
polls=0

while :; do
  # REST, not GraphQL: this costs nothing against the GraphQL budget, and `gh pr view`
  # goes through the deprecated project-cards path this repo trips on (CLAUDE.md § Git).
  state="$(gh api "repos/$REPO/pulls/$pr" --jq '.state + " " + (.merged|tostring)' 2>/dev/null)"

  case "$state" in
    "closed true")
      echo "MERGED: #$pr"
      exit 0
      ;;
    "closed false")
      echo "CLOSED UNMERGED: #$pr — the queue entry was destroyed, or a human closed it." >&2
      echo "Recovery is in doc/bench-worker.md §12: push the branch, gh pr reopen $pr," >&2
      echo "then merge again — same sha, so the attestation still holds." >&2
      exit 1
      ;;
    "open "*)
      : # still queued
      ;;
    *)
      echo "could not read #$pr (gh said: '${state:-nothing}') — retrying" >&2
      ;;
  esac

  polls=$(( polls + 1 ))
  if [ "$(date +%s)" -ge "$deadline" ] || [ "$polls" -ge "$max_polls" ]; then
    echo "TIMEOUT: #$pr is still open after ${polls} polls / ${timeout_min} min." >&2
    echo "That is not a failure — the queue may simply be long. Read the state once with:" >&2
    echo "  gh api repos/$REPO/pulls/$pr --jq '{state,merged}'" >&2
    exit 4
  fi

  sleep "$interval"
done
