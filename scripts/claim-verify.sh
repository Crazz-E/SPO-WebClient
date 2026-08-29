#!/usr/bin/env bash
# npm run board:verify -- <ITEM_ID> — the handshake re-read. ONE item, ~1 point.
#
# Run it AFTER writing `Session` and moving Status → Planning (kanban-workflow § 2 · Claim).
# Never re-read the pool to check a claim: same answer, ~103 points (§ GitHub API discipline).
#
# It prints the three fields the handshake writes — `Session`, `Status`, `Area` — because the
# claim writes all three and a re-read that proves only one leaves the other two unverified.
# Not your identity in `Session` → you lost the race: take the next candidate from the claim
# read you already hold, never a second listing.
#
# <ITEM_ID> is the `item <id>` printed by `bash scripts/claim-read.sh`.
#
#   bash scripts/claim-verify.sh PVTI_xxxxxxxx
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: claim-verify.sh <ITEM_ID>" >&2
  exit 1
fi

gh api graphql -f itemId="$1" -f query='query($itemId: ID!) {
  rateLimit { cost remaining resetAt }
  node(id: $itemId) { ... on ProjectV2Item { fieldValues(first: 12) { nodes {
    ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
    ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } } } } } }
}' --jq '
  ([.data.node.fieldValues.nodes[] | select(.field != null)
    | {(.field.name): (.text // .name)}] | add // {}) as $f
  | (.data.rateLimit | "rateLimit: cost \(.cost), remaining \(.remaining), resets \(.resetAt)"),
    ("Session: \($f.Session // "-")"),
    ("Status:  \($f.Status // "-")"),
    ("Area:    \($f.Area // "-")")'
