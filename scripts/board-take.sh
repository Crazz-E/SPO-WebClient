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
#   6  this worktree is FINISHED — `npm run finish` already ran here, so a new card belongs to
#      a new session; nothing was read from or written to the board
#
# `--release` clears Session and sets Status back to Todo. Normally this requires Session to
# already be ours — the back-off step 5 of the normal path asks for when the re-read shows the
# claim was lost to another session, so nothing is ever released out from under its owner.
#
# One exception (#299): a card whose issue got REOPENED after its owning session correctly
# closed it. `Session` still names that session, but the session ended cleanly — closing it
# by hand is the only way forward, and until now that meant a human editing the field in the
# Projects UI. The trouble is that a card released on FAILURE lands in the exact same column
# (Parked) with `Session` deliberately still filled, as the trace ownership law 4 asks
# for — so Status and "issue open" alone cannot tell a genuine reopen from a failure trace a
# session has no business clearing. GitHub reports the difference: a reopened-and-still-open
# issue's `stateReason` is `REOPENED`; a failure trace's issue was never closed, so its
# `stateReason` is null. All three conditions below are load-bearing together — drop any one
# and a failure trace becomes clearable by any session that asks:
#
#   a. current Status is `Done` or `Parked` — the two columns a closed-then-reopened
#      card can be sitting in; a live column (Todo/Planning/Implementing/Gate/Validation/
#      Checks & PR/Merging) means the owner may still be working and only expiry or the
#      human should move it.
#   b. the issue's `state` is OPEN — a closed issue is terminal, not reopened work.
#   c. the issue's `stateReason` is REOPENED — the actual distinguisher between "this was
#      reopened" and "this was never closed" (a failure release, or Done reached without a
#      close, e.g. before the auto-close workflow ran).
#
# Meeting all three still refuses nothing about the ordinary case: a live owner in an active
# column, or a failure trace with a null `stateReason`, both keep exiting 3 — only the human
# clears those, per ownership law 3/4 (doc/kanban-workflow.md:121-125).
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

# The driver-scope marker: a verified claim is the moment a session BECOMES the driver of a
# card, and `.claude/hooks/driver-scope-guard.sh` arms on it. Lifecycle and rationale live in
# the sourced file — one derivation of the key, not one per caller.
. "$(dirname "${BASH_SOURCE[0]}")/driver-scope.sh"

# A worktree `finish` has already retired is over: its branch is merged, its card closed.
# Claiming a SECOND card here is how a session chains tasks onto a dead branch — and the
# branch is what carries the damage, not the board. The new work rides a branch named for the
# previous card, so `gh pr view <branch>` keeps answering with that card's MERGED PR, and
# finish.sh is then one stale verdict away from `worktree remove --force` + `branch -D` over
# commits nobody has landed (sessions #324 and #328, 2026-08-27). A new card gets a new
# session, which gets its own worktree and its own branch.
#
# `--release` is exempt on purpose: closing ownership must be possible from anywhere, and it
# writes nothing that a branch can carry.
if [ "$release" -eq 0 ]; then
  finished_marker="$(session_marker finished 2>/dev/null || true)"
  if [ -n "$finished_marker" ] && [ -f "$finished_marker" ]; then
    echo "FINISHED WORKTREE: npm run finish already ran here — this session is over." >&2
    echo "Claim #$issue from a NEW session, which gets its own worktree and branch." >&2
    echo "Nothing was read from or written to the board." >&2
    exit 6
  fi
fi


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

# --- write-failure diagnostics --------------------------------------------------------------
# Every write call used to fold three different failures into the same generic
# "RATE_LIMITED: write failed, card untouched" and exit 4 — the `gh` call itself failing (auth,
# network, an actual secondary rate limit), and a GraphQL response that came back 200 with a
# top-level `.errors` array, both threw away the one thing that would have said WHY. Exit codes
# are the driver's contract and do not change (see header); only what gets printed does.

looks_like_rate_limit() {
  # $1 = text to inspect (gh's own stderr, or GraphQL error message text)
  grep -qiE 'rate limit|abuse detection|secondary rate' <<< "$1"
}

run_write() {
  # Runs "$@" (a `gh api graphql -i ...` write call), capturing ITS OWN stderr into $write_err
  # instead of discarding it. Sets $wraw on success; on failure sets $write_err and returns 1.
  local errfile
  errfile="$(mktemp)"
  if wraw=$("$@" 2>"$errfile"); then
    rm -f "$errfile"
    return 0
  fi
  write_err="$(cat "$errfile")"
  rm -f "$errfile"
  return 1
}

write_call_failed_diag() {
  # $1 = gh's own stderr from a failed write call (may be empty, e.g. a bare non-zero exit).
  # Prints it, then says plainly whether this looks like a genuine GitHub rate limit or
  # something else — a human reading the log, or the park comment it becomes, should be able
  # to tell at a glance.
  local err="$1"
  [ -n "$err" ] && echo "$err"
  if looks_like_rate_limit "$err"; then
    echo "RATE_LIMITED (confirmed): write call failed, card untouched"
  else
    echo "WRITE_FAILED (not a confirmed rate limit — see error above): write call failed, card untouched"
  fi
}

report_write_errors() {
  # $1 = full -i response (headers + body) of a write whose body carries a top-level `.errors`
  # array. Prints the actual GraphQL error message(s) instead of just detecting them, then
  # says whether this looks like a genuine rate limit — X-Ratelimit-Remaining: 0, already
  # parsed into $last_remaining by report_header_ratelimit, or a message that says so — or not.
  local body msgs
  body="$(body_of "$1")"
  msgs="$(jq -r '.errors[]? | (.message // tostring)' <<< "$body" 2>/dev/null)"
  [ -n "$msgs" ] && echo "$msgs"
  if [ "$last_remaining" = "0" ] || looks_like_rate_limit "$msgs"; then
    echo "RATE_LIMITED (confirmed): write failed, card untouched"
  else
    echo "WRITE_FAILED (not a confirmed rate limit — see error above): write failed, card untouched"
  fi
}

reread_failed_diag() {
  # $1 = gh's own stderr from a failed re-read (may be empty). The write already landed here —
  # a different condition from the write itself failing — so it gets its own label rather than
  # reusing RATE_LIMITED/WRITE_FAILED for something that already happened.
  local err="$1"
  [ -n "$err" ] && echo "$err"
  if looks_like_rate_limit "$err"; then
    echo "REREAD_FAILED (confirmed rate limit): write landed, card was touched, re-read pending — re-check later"
  else
    echo "REREAD_FAILED (not a confirmed rate limit — see error above): write landed, card was touched, re-read pending — re-check later"
  fi
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
    issue(number: $issue) { number state stateReason
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

# current_status/issue_state/issue_state_reason feed the --release cross-session rule below:
# a reopened-and-still-open issue reports stateReason REOPENED, which a failure release (issue
# never closed, stateReason null) cannot forge — see the --release branch and the header comment.
current_status=$(jq -r --argjson n "$PROJECT_NUMBER" '
  [.data.repository.issue.projectItems.nodes[]? | select(.project.number == $n)][0] as $it
  | ([$it.fieldValues.nodes[]? | select(.field != null) | {(.field.name): (.text // .name)}] | add // {}).Status // ""' <<< "$raw")
issue_state=$(jq -r '.data.repository.issue.state // ""' <<< "$raw")
issue_state_reason=$(jq -r '.data.repository.issue.stateReason // ""' <<< "$raw")

session_field_id=$(jq -r '.data.organization.projectV2.fields.nodes[] | select(.name=="Session") | .id' <<< "$raw")
status_field_id=$(jq -r '.data.organization.projectV2.fields.nodes[] | select(.name=="Status") | .id' <<< "$raw")
area_field_id=$(jq -r '.data.organization.projectV2.fields.nodes[] | select(.name=="Area") | .id' <<< "$raw")
in_progress_option_id=$(jq -r '.data.organization.projectV2.fields.nodes[] | select(.name=="Status") | .options[]? | select(.name=="Planning") | .id' <<< "$raw")
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

# Sets $reread_result on success — called directly (not via `after=$(reread_session)`, a
# command substitution forks a subshell, and a variable set inside one never reaches the
# caller back out) so a failure's captured stderr actually reaches the terminal.
reread_session() {
  local rr errfile err
  errfile="$(mktemp)"
  if ! rr=$(gh api graphql -f query="$reread_query" -f itemId="$item_id" 2>"$errfile"); then
    err="$(cat "$errfile")"
    rm -f "$errfile"
    reread_failed_diag "$err"
    return 1
  fi
  rm -f "$errfile"
  report_query_ratelimit "$rr"
  reread_result="$(jq -r '([.data.node.fieldValues.nodes[]? | select(.field != null) | {(.field.name): (.text // .name)}] | add // {}).Session // ""' <<< "$rr")"
  return 0
}

# ============================================================================================
if [ "$release" -eq 1 ]; then
  reopened_release=0

  if [ "$current_session" != "$session" ]; then
    # Cross-session release is allowed for exactly one case: the card is the trace of an
    # issue that got REOPENED after the owning session correctly closed it (see header
    # comment for why all three conditions are required together). Anything short of that —
    # a live owner, a failure trace, a closed issue, or a field this read could not read —
    # falls straight through to the refusal below.
    case "$current_status" in
      Done | Parked)
        if [ "$issue_state" = "OPEN" ] && [ "$issue_state_reason" = "REOPENED" ]; then
          reopened_release=1
        fi
        ;;
    esac

    if [ "$reopened_release" -ne 1 ]; then
      echo "NOT YOURS: held by ${current_session:--}"
      case "$current_status" in
        Todo | Planning | Implementing | Gate | Validation | "Checks & PR" | Merging)
          echo "the owner is live — ask them, or wait for the reservation to expire; only the human may free it."
          ;;
        *)
          if [ "$issue_state" = "CLOSED" ]; then
            echo "a terminal card whose issue is closed is not reopened work."
          else
            echo "Session is deliberately the trace of a failed attempt — only the human reclassifies from Parked (doc/kanban-workflow.md:26, :121-125)."
          fi
          ;;
      esac
      exit 3
    fi
  fi

  mutation='
  mutation($projectId: ID!, $itemId: ID!, $sessionFieldId: ID!, $statusFieldId: ID!, $todoOptionId: String!) {
    m1: updateProjectV2ItemFieldValue(input: {projectId: $projectId, itemId: $itemId, fieldId: $sessionFieldId, value: {text: ""}}) { projectV2Item { id } }
    m2: updateProjectV2ItemFieldValue(input: {projectId: $projectId, itemId: $itemId, fieldId: $statusFieldId, value: {singleSelectOptionId: $todoOptionId}}) { projectV2Item { id } }
  }'

  if ! run_write gh api graphql -i -f query="$mutation" -f projectId="$project_id" -f itemId="$item_id" \
      -f sessionFieldId="$session_field_id" -f statusFieldId="$status_field_id" -f todoOptionId="$todo_option_id"; then
    write_call_failed_diag "$write_err"
    exit 4
  fi
  report_header_ratelimit "$wraw"
  if echo "$(body_of "$wraw")" | jq -e '.errors' >/dev/null 2>&1; then
    report_write_errors "$wraw"
    exit 4
  fi

  if ! reread_session; then
    exit 5
  fi
  after="$reread_result"

  disarm_driver_scope
  if [ "$reopened_release" -eq 1 ]; then
    echo "RELEASED #$issue (reopened — cleared claim of $current_session)"
  else
    echo "RELEASED #$issue"
  fi
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

if ! run_write gh api graphql -i "${write_args[@]}"; then
  write_call_failed_diag "$write_err"
  exit 4
fi
report_header_ratelimit "$wraw"
if echo "$(body_of "$wraw")" | jq -e '.errors' >/dev/null 2>&1; then
  report_write_errors "$wraw"
  exit 4
fi

if ! reread_session; then
  exit 5
fi
after="$reread_result"

if [ "$after" != "$session" ]; then
  echo "LOST: held by ${after:--}"
  exit 3
fi

arm_driver_scope "$issue"
if [ "$already_ours" -eq 1 ]; then
  echo "CLAIMED #$issue (already held)"
else
  echo "CLAIMED #$issue"
fi
exit 0
