#!/usr/bin/env bash
# npm run board:move -- <issue> <column>
#
# Moves ONE board card's Status to <column>, so the driver never composes a
# `gh project item-edit` and never resolves an item id or a Status option id itself. It takes
# the ISSUE NUMBER and the column NAME (case-insensitive, space-tolerant — "in progress",
# "InProgress" and "In Progress" all resolve to the same option), resolved against the
# Status field's own options rather than a hardcoded id. It writes, then re-reads the same
# item and confirms the column actually landed before ever printing MOVED. The driver reads
# exactly ONE printed line and branches on the exit code, nothing else:
#
#   0  moved — column confirmed by re-read (`MOVED #<n> -> <column>`)
#   2  usage error, unknown column, or the issue is not on the board
#   4  the write request itself failed — nothing landed, the card is unmoved
#   5  the write landed but the confirmation re-read failed — state is UNKNOWN, re-check later
#
#   bash scripts/board-move.sh 285 "In progress"
#   bash scripts/board-move.sh 285 needstriage
set -euo pipefail

OWNER="Crazz-Org"
REPO="SPO-WebClient"
PROJECT_NUMBER=1

usage() {
  echo "USAGE: board-move.sh <issue> <column>"
  exit 2
}

[ $# -ge 2 ] || usage
issue="$1"
shift
column="$*"

[[ "$issue" =~ ^[0-9]+$ ]] || usage
[ -n "$column" ] || usage

# --- rate-limit reporting -------------------------------------------------------------------
# Same constraint as board-take.sh: `rateLimit { cost remaining resetAt }` exists on the Query
# root type only, not on Mutation, so the write call below reads cost/remaining from the
# response's own `X-Ratelimit-Remaining` header instead of the GraphQL field. Always stderr.
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

# --- one read: the item for this issue, plus Status field + option ids --------------------
read_query='
query($owner: String!, $repo: String!, $projNum: Int!, $issue: Int!) {
  rateLimit { cost remaining resetAt }
  organization(login: $owner) { projectV2(number: $projNum) { id
    fields(first: 20) { nodes {
      ... on ProjectV2FieldCommon { id name }
      ... on ProjectV2SingleSelectField { options { id name } } } } } }
  repository(owner: $owner, name: $repo) {
    issue(number: $issue) { number
      projectItems(first: 10) { nodes { id project { number } } } } }
}'

if ! raw=$(gh api graphql -f query="$read_query" -f owner="$OWNER" -f repo="$REPO" -F projNum="$PROJECT_NUMBER" -F issue="$issue" 2>/dev/null); then
  echo "NOT ON BOARD: #$issue"
  exit 2
fi
report_query_ratelimit "$raw"

project_id=$(jq -r '.data.organization.projectV2.id' <<< "$raw")
item_id=$(jq -r --argjson n "$PROJECT_NUMBER" '
  [.data.repository.issue.projectItems.nodes[]? | select(.project.number == $n) | .id][0] // empty' <<< "$raw")

if [ -z "$item_id" ]; then
  echo "NOT ON BOARD: #$issue"
  exit 2
fi

status_field_id=$(jq -r '.data.organization.projectV2.fields.nodes[] | select(.name=="Status") | .id' <<< "$raw")

column_norm=$(tr '[:upper:]' '[:lower:]' <<< "$column" | tr -d ' ')
option_id=$(jq -r --arg n "$column_norm" '
  .data.organization.projectV2.fields.nodes[] | select(.name=="Status") | .options[]?
  | select((.name | ascii_downcase | gsub(" ";"")) == $n) | .id' <<< "$raw")
option_name=$(jq -r --arg n "$column_norm" '
  .data.organization.projectV2.fields.nodes[] | select(.name=="Status") | .options[]?
  | select((.name | ascii_downcase | gsub(" ";"")) == $n) | .name' <<< "$raw")

[ -n "$option_id" ] || usage

# --- write: Status -> the resolved option ---------------------------------------------------
mutation='
mutation($projectId: ID!, $itemId: ID!, $statusFieldId: ID!, $statusOptionId: String!) {
  m1: updateProjectV2ItemFieldValue(input: {projectId: $projectId, itemId: $itemId, fieldId: $statusFieldId, value: {singleSelectOptionId: $statusOptionId}}) { projectV2Item { id } }
}'

if ! wraw=$(gh api graphql -i -f query="$mutation" -f projectId="$project_id" -f itemId="$item_id" \
    -f statusFieldId="$status_field_id" -f statusOptionId="$option_id" 2>/dev/null); then
  echo "RATE_LIMITED: write failed, card unmoved"
  exit 4
fi
report_header_ratelimit "$wraw"
if echo "$(body_of "$wraw")" | jq -e '.errors' >/dev/null 2>&1; then
  echo "RATE_LIMITED: write failed, card unmoved"
  exit 4
fi

# --- re-read: confirm the column landed before ever printing MOVED -------------------------
reread_query='
query($itemId: ID!) {
  rateLimit { cost remaining resetAt }
  node(id: $itemId) { ... on ProjectV2Item { fieldValues(first: 12) { nodes {
    ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } } } } } }
}'

if ! rr=$(gh api graphql -f query="$reread_query" -f itemId="$item_id" 2>/dev/null); then
  echo "RATE_LIMITED: write landed, re-read pending"
  exit 5
fi
report_query_ratelimit "$rr"

after=$(jq -r '([.data.node.fieldValues.nodes[]? | select(.field != null) | {(.field.name): .name}] | add // {}).Status // ""' <<< "$rr")

if [ "$after" != "$option_name" ]; then
  echo "RATE_LIMITED: write landed, re-read pending"
  exit 5
fi

echo "MOVED #$issue -> $option_name"
exit 0
