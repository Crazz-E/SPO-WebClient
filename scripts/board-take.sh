#!/usr/bin/env bash
# npm run board:take -- <issue> [--area <area>] [--release]
#
# Claims (or releases) ONE board card for the CURRENT branch, so the driver never composes a
# `gh project item-edit` and never resolves or compares a project id, item id, field id,
# option id or Session string itself. It takes the ISSUE NUMBER only — never an item id — and
# resolves everything it needs in one read, then writes Session + Status (+ Area) as aliased
# mutations in ONE GraphQL request, then re-reads the same item and compares identity itself.
# The driver reads exactly ONE printed line and branches on the exit code, nothing else:
#
#   0  claimed (`CLAIMED #<n>` or `CLAIMED #<n> (already held)` for an idempotent re-run)
#   2  usage error, unknown issue, or the issue is not on the board
#   3  the card's Session belongs to a DIFFERENT session (claim), or --release was asked on a
#      card this branch does not hold
#   4  the write request itself failed — nothing landed, the card is untouched
#   5  the write landed but the confirmation re-read failed — state is UNKNOWN, re-check later
#
# `--release` clears Session and sets Status back to Todo, but ONLY if Session is already
# ours — this is the back-off step 5 of the normal path asks for when the re-read shows the
# claim was lost to another session, so nothing is ever released out from under its owner.
#
#   bash scripts/board-take.sh 285
#   bash scripts/board-take.sh 285 --area client
#   bash scripts/board-take.sh 285 --release
set -euo pipefail

OWNER="Crazz-Org"
REPO="SPO-WebClient"
PROJECT_NUMBER=1

usage() {
  echo "USAGE: board-take.sh <issue> [--area <area>] [--release]"
  exit 2
}

issue=""
area=""
release=0

while [ $# -gt 0 ]; do
  case "$1" in
    --area)
      [ $# -ge 2 ] && [ -n "${2:-}" ] || usage
      area="$2"
      shift 2
      ;;
    --release)
      release=1
      shift
      ;;
    -*)
      usage
      ;;
    *)
      [ -z "$issue" ] || usage
      issue="$1"
      shift
      ;;
  esac
done

[[ "$issue" =~ ^[0-9]+$ ]] || usage
[ "$release" -eq 0 ] || [ -z "$area" ] || usage

branch="$(git rev-parse --abbrev-ref HEAD)"
session="${branch} @ $(date +%F)"

# --- rate-limit reporting -----------------------------------------------------------------
# `rateLimit { cost remaining resetAt }` is a field on the Query root type only — GitHub's
# schema does not expose it on Mutation (confirmed: a mutation asking for it fails with
# "Field 'rateLimit' doesn't exist on type 'Mutation'"). So query calls report cost/remaining
# straight from that field; the one mutation call below reports remaining from the response's
# own `X-Ratelimit-Remaining` header instead, and its cost is the delta from the remaining the
# last query call saw. Either way: stdout never carries this, only stderr.
last_remaining=""

report_query_ratelimit() {
  # $1 = json body containing .rateLimit
  local cost remaining
  cost=$(jq -r '.data.rateLimit.cost // "?"' <<< "$1")
  remaining=$(jq -r '.data.rateLimit.remaining // "?"' <<< "$1")
  echo "rateLimit: cost $cost, remaining $remaining" >&2
  last_remaining="$remaining"
}

report_header_ratelimit() {
  # $1 = full -i response (headers + body)
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
  # last line of a `gh api graphql -i` response is the compact JSON body
  tail -n 1 <<< "$1"
}

# --- one read: the item for this issue, plus the field/option ids, plus current Session ---
read_query='
query($owner: String!, $repo: String!, $projNum: Int!, $issue: Int!) {
  rateLimit { cost remaining resetAt }
  organization(login: $owner) { projectV2(number: $projNum) { id
    fields(first: 20) { nodes {
      ... on ProjectV2FieldCommon { id name }
      ... on ProjectV2SingleSelectField { options { id name } } } } } }
  repository(owner: $owner, name: $repo) {
    issue(number: $issue) { number
      projectItems(first: 10) { nodes { id project { number }
        fieldValues(first: 12) { nodes {
          ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
          ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } } } } } } } }
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

current_session=$(jq -r --argjson n "$PROJECT_NUMBER" '
  [.data.repository.issue.projectItems.nodes[]? | select(.project.number == $n)][0] as $it
  | ([$it.fieldValues.nodes[]? | select(.field != null) | {(.field.name): (.text // .name)}] | add // {}).Session // ""' <<< "$raw")

session_field_id=$(jq -r '.data.organization.projectV2.fields.nodes[] | select(.name=="Session") | .id' <<< "$raw")
status_field_id=$(jq -r '.data.organization.projectV2.fields.nodes[] | select(.name=="Status") | .id' <<< "$raw")
area_field_id=$(jq -r '.data.organization.projectV2.fields.nodes[] | select(.name=="Area") | .id' <<< "$raw")
in_progress_option_id=$(jq -r '.data.organization.projectV2.fields.nodes[] | select(.name=="Status") | .options[]? | select(.name=="In progress") | .id' <<< "$raw")
todo_option_id=$(jq -r '.data.organization.projectV2.fields.nodes[] | select(.name=="Status") | .options[]? | select(.name=="Todo") | .id' <<< "$raw")

area_option_id=""
if [ -n "$area" ]; then
  area_norm=$(tr '[:upper:]' '[:lower:]' <<< "$area" | tr -d ' ')
  area_option_id=$(jq -r --arg n "$area_norm" '
    .data.organization.projectV2.fields.nodes[] | select(.name=="Area") | .options[]?
    | select((.name | ascii_downcase | gsub(" ";"")) == $n) | .id' <<< "$raw")
  [ -n "$area_option_id" ] || usage
fi

# --- re-read helper: fetch just Session + Status off the item, post-write ------------------
reread_query='
query($itemId: ID!) {
  rateLimit { cost remaining resetAt }
  node(id: $itemId) { ... on ProjectV2Item { fieldValues(first: 12) { nodes {
    ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
    ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } } } } } }
}'

reread_session() {
  local rr
  if ! rr=$(gh api graphql -f query="$reread_query" -f itemId="$item_id" 2>/dev/null); then
    return 1
  fi
  report_query_ratelimit "$rr"
  jq -r '([.data.node.fieldValues.nodes[]? | select(.field != null) | {(.field.name): (.text // .name)}] | add // {}).Session // ""' <<< "$rr"
  return 0
}

# ============================================================================================
if [ "$release" -eq 1 ]; then
  if [ "$current_session" != "$session" ]; then
    echo "NOT YOURS: held by ${current_session:--}"
    exit 3
  fi

  mutation='
  mutation($projectId: ID!, $itemId: ID!, $sessionFieldId: ID!, $statusFieldId: ID!, $todoOptionId: String!) {
    m1: updateProjectV2ItemFieldValue(input: {projectId: $projectId, itemId: $itemId, fieldId: $sessionFieldId, value: {text: ""}}) { projectV2Item { id } }
    m2: updateProjectV2ItemFieldValue(input: {projectId: $projectId, itemId: $itemId, fieldId: $statusFieldId, value: {singleSelectOptionId: $todoOptionId}}) { projectV2Item { id } }
  }'

  if ! wraw=$(gh api graphql -i -f query="$mutation" -f projectId="$project_id" -f itemId="$item_id" \
      -f sessionFieldId="$session_field_id" -f statusFieldId="$status_field_id" -f todoOptionId="$todo_option_id" 2>/dev/null); then
    echo "RATE_LIMITED: write failed, card untouched"
    exit 4
  fi
  report_header_ratelimit "$wraw"
  if echo "$(body_of "$wraw")" | jq -e '.errors' >/dev/null 2>&1; then
    echo "RATE_LIMITED: write failed, card untouched"
    exit 4
  fi

  if ! after=$(reread_session); then
    echo "RATE_LIMITED: write landed, re-read pending"
    exit 5
  fi

  echo "RELEASED #$issue"
  exit 0
fi

# --- normal claim path ----------------------------------------------------------------------
if [ -n "$current_session" ] && [ "$current_session" != "$session" ]; then
  echo "LOST: held by $current_session"
  exit 3
fi

already_ours=0
[ "$current_session" = "$session" ] && already_ours=1

mutation='mutation($projectId: ID!, $itemId: ID!, $sessionFieldId: ID!, $sessionValue: String!, $statusFieldId: ID!, $statusOptionId: String!'
[ -n "$area_option_id" ] && mutation+=', $areaFieldId: ID!, $areaOptionId: String!'
mutation+=') {
  m1: updateProjectV2ItemFieldValue(input: {projectId: $projectId, itemId: $itemId, fieldId: $sessionFieldId, value: {text: $sessionValue}}) { projectV2Item { id } }
  m2: updateProjectV2ItemFieldValue(input: {projectId: $projectId, itemId: $itemId, fieldId: $statusFieldId, value: {singleSelectOptionId: $statusOptionId}}) { projectV2Item { id } }'
[ -n "$area_option_id" ] && mutation+='
  m3: updateProjectV2ItemFieldValue(input: {projectId: $projectId, itemId: $itemId, fieldId: $areaFieldId, value: {singleSelectOptionId: $areaOptionId}}) { projectV2Item { id } }'
mutation+='
}'

write_args=(-f query="$mutation" -f projectId="$project_id" -f itemId="$item_id" \
  -f sessionFieldId="$session_field_id" -f sessionValue="$session" \
  -f statusFieldId="$status_field_id" -f statusOptionId="$in_progress_option_id")
if [ -n "$area_option_id" ]; then
  write_args+=(-f areaFieldId="$area_field_id" -f areaOptionId="$area_option_id")
fi

if ! wraw=$(gh api graphql -i "${write_args[@]}" 2>/dev/null); then
  echo "RATE_LIMITED: write failed, card untouched"
  exit 4
fi
report_header_ratelimit "$wraw"
if echo "$(body_of "$wraw")" | jq -e '.errors' >/dev/null 2>&1; then
  echo "RATE_LIMITED: write failed, card untouched"
  exit 4
fi

if ! after=$(reread_session); then
  echo "RATE_LIMITED: write landed, re-read pending"
  exit 5
fi

if [ "$after" != "$session" ]; then
  echo "LOST: held by ${after:--}"
  exit 3
fi

if [ "$already_ours" -eq 1 ]; then
  echo "CLAIMED #$issue (already held)"
else
  echo "CLAIMED #$issue"
fi
exit 0
