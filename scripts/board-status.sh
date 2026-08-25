#!/usr/bin/env bash
# npm run board:status -- <issue-number>... — "what is the board right now" for named cards.
#
# One GraphQL call, one line of output per issue: `#N [Status] session=... pr=... title`.
# This is the re-read doc/kanban-workflow.md prescribes before a session states another
# card's status somewhere durable — an issue comment, a PR body, its final report. It reads
# each NAMED issue's own project item and linked pull requests, never the pool
# (`gh project item-list` / the claim read), so this stays a single-item-shaped read at N
# issues instead of one: cost is ~1 GraphQL point regardless of how many numbers are passed,
# against the ~103 points a full `item-list` costs (§ GitHub API discipline).
#
#   bash scripts/board-status.sh 144 106 112
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "usage: board-status.sh <issue-number>..." >&2
  exit 1
fi

OWNER="Crazz-Org"
REPO="SPO-WebClient"

query="{ rateLimit { cost remaining } repository(owner: \"$OWNER\", name: \"$REPO\") {"
i=0
for n in "$@"; do
  query+=" i$i: issue(number: $n) { number title state
    projectItems(first: 5) { nodes { fieldValues(first: 12) { nodes {
      ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
      ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } } } } } }
    closedByPullRequestsReferences(first: 5) { nodes { number state } } }"
  i=$((i + 1))
done
query+=" } }"

gh api graphql -f query="$query" --jq '
  (.data.rateLimit | "rateLimit: cost \(.cost), remaining \(.remaining)"),
  (.data.repository | to_entries[] | select(.key | startswith("i")) | .value |
    ([.projectItems.nodes[0].fieldValues.nodes[]? | select(.field != null)
      | {(.field.name): (.text // .name)}] | add // {}) as $f
    | "#\(.number) [\($f.Status // "-")] session=\($f.Session // "-") pr=\(
        [.closedByPullRequestsReferences.nodes[] | "#\(.number)(\(.state))"] | join(",") // "-"
      ) \(.title)")'
