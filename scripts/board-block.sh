#!/usr/bin/env bash
# npm run board:block -- <blocked-issue> <blocker-issue>
#
# Records ONE blocking order between two issues, so the caller never composes the two-step
# `gh api graphql` recipe by hand (doc/kanban-workflow.md § gh CLI recipes, lines 738-743) and
# never resolves a node id itself. <blocked-issue> is the card that cannot start yet;
# <blocker-issue> is the card it waits on — GitHub's `addBlockedBy` takes `issueId` (the
# waiter) and `blockingIssueId` (the one it waits on), node ids, not issue numbers. This script
# resolves both numbers to node ids in ONE query, then calls the mutation. The caller reads
# exactly ONE printed line and branches on the exit code, nothing else:
#
#   0  recorded (`BLOCKED #<blocked> by #<blocker>`)
#   2  usage error, or either issue does not exist / is not in this repo
#   4  the write request itself failed — nothing landed
#
# Per doc/kanban-workflow.md § Blocking order rule 2, a session adding one says why in a
# comment on the blocked card — this script only performs the mutation; posting that comment
# is the caller's job (`gh issue comment <blocked> ...`), same as it is for the manual recipe.
#
#   bash scripts/board-block.sh 285 108
set -euo pipefail

OWNER="Crazz-Org"
REPO="SPO-WebClient"

usage() {
  echo "USAGE: board-block.sh <blocked-issue> <blocker-issue>"
  exit 2
}

[ $# -eq 2 ] || usage
blocked="$1"
blocker="$2"

[[ "$blocked" =~ ^[0-9]+$ ]] || usage
[[ "$blocker" =~ ^[0-9]+$ ]] || usage
[ "$blocked" != "$blocker" ] || usage

# --- rate-limit reporting -------------------------------------------------------------------
# Same constraint as board-move.sh / board-take.sh: `rateLimit { cost remaining resetAt }`
# exists on the Query root type only, not on Mutation, so the write call below reads
# cost/remaining from the response's own `X-Ratelimit-Remaining` header instead. Always stderr.
last_remaining=""

report_query_ratelimit() {
  local cost remaining
  cost=$(jq -r '.data.rateLimit.cost // "?"' <<< "$1")
  remaining=$(jq -r '.data.rateLimit.remaining // "?"' <<< "$1")
  echo "rateLimit: cost $cost, remaining $remaining" >&2
  last_remaining="$remaining"
}

report_header_ratelimit() {
  local remaining cost
  remaining=$(grep -i '^X-Ratelimit-Remaining:' <<< "$1" | tr -d '\r' | awk '{print $2}' | tail -1)
  if [ -n "$last_remaining" ] && [ "$last_remaining" != "?" ] && [ -n "$remaining" ]; then
    cost=$((last_remaining - remaining))
  else
    cost="?"
  fi
  echo "rateLimit: cost $cost, remaining ${remaining:-?}" >&2
  last_remaining="${remaining:-$last_remaining}"
}

body_of() {
  tail -n 1 <<< "$1"
}

# --- one read: resolve both issue numbers to node ids in a single query --------------------
read_query='
query($owner: String!, $repo: String!, $blocked: Int!, $blocker: Int!) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $repo) {
    blockedIssue: issue(number: $blocked) { id number }
    blockerIssue: issue(number: $blocker) { id number }
  }
}'

if ! raw=$(gh api graphql -f query="$read_query" -f owner="$OWNER" -f repo="$REPO" \
    -F blocked="$blocked" -F blocker="$blocker" 2>/dev/null); then
  echo "NOT FOUND: #$blocked or #$blocker"
  exit 2
fi
report_query_ratelimit "$raw"

blocked_id=$(jq -r '.data.repository.blockedIssue.id // empty' <<< "$raw")
blocker_id=$(jq -r '.data.repository.blockerIssue.id // empty' <<< "$raw")

if [ -z "$blocked_id" ] || [ -z "$blocker_id" ]; then
  echo "NOT FOUND: #$blocked or #$blocker"
  exit 2
fi

# --- write: addBlockedBy(issueId: the waiter, blockingIssueId: the one it waits on) --------
mutation='
mutation($issueId: ID!, $blockingIssueId: ID!) {
  addBlockedBy(input: {issueId: $issueId, blockingIssueId: $blockingIssueId}) { issue { number } }
}'

if ! wraw=$(gh api graphql -i -f query="$mutation" -f issueId="$blocked_id" -f blockingIssueId="$blocker_id" 2>/dev/null); then
  echo "RATE_LIMITED: write failed, nothing recorded"
  exit 4
fi
report_header_ratelimit "$wraw"
if echo "$(body_of "$wraw")" | jq -e '.errors' >/dev/null 2>&1; then
  echo "RATE_LIMITED: write failed, nothing recorded"
  exit 4
fi

echo "BLOCKED #$blocked by #$blocker"
exit 0
