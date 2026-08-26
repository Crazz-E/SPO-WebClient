#!/usr/bin/env bash
# npm run board:claim — THE CLAIM READ. Run it ONCE per claim.
#
# One query, paginated by `gh --paginate` and costing ~2 GraphQL points PER PAGE (4 on
# today's 116-item board), everything a claim needs: every card with Status/Session/Area
# in board order (topmost Todo first = priority order), the blocked set, the project/field/
# option ids `item-edit` takes, and the price of asking.
#
# Never read the pool with `gh project item-list` in a session: same data, ~103 points
# (kanban-workflow § GitHub API discipline). That is how the board went unreadable on
# 2026-08-25. The busy set is computed INSIDE this call, never by a second one.
#
# The `busy areas:` line IS the busy set (§ One session per area): In progress, Gate or PR,
# `docs` excluded because it never blocks. It is computed rather than eyeballed off the item
# lines so the rule stays executable; `$cards` is bound once and both outputs read it.
#
# The blocked lines: `issueDependenciesSummary { blockedBy }` counts OPEN blockers only, so a
# closed blocker frees the card by itself. The board side now paginates itself; raise
# `issues(first: 100)` if the repository ever exceeds 100 open issues (41 open today).
#
# jq is available (jq 1.7 at /usr/bin/jq, installed 2026-08-26), but gh's own `--jq` runs once
# per page under `--paginate` and so cannot sum rateLimit.cost, dedupe the metadata, or compute
# a busy set across pages — which is why the stream is slurped into one jq program with `-s`.
# That is why the whole claim read is one program over one response, and not a saved file
# filtered twice. The `items: N/M` line proves the read was complete.
#
#   bash scripts/claim-read.sh
set -euo pipefail

timeout 90 gh api graphql --paginate -f query='
query($endCursor: String) {
  rateLimit { cost remaining resetAt }
  organization(login: "Crazz-Org") { projectV2(number: 1) {
    id
    fields(first: 20) { nodes {
      ... on ProjectV2FieldCommon { id name }
      ... on ProjectV2SingleSelectField { options { id name } } } }
    items(first: 100, after: $endCursor) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
      id
      content { ... on Issue { number title } }
      fieldValues(first: 12) { nodes {
        ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
        ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } } } } } } } }
  repository(owner: "Crazz-Org", name: "SPO-WebClient") {
    issues(first: 100, states: OPEN) { nodes {
      number issueDependenciesSummary { blockedBy }
      blockedBy(first: 10) { nodes { number state } } } } }
}' | jq -s -r '
  ([.[] | .data.organization.projectV2.items.nodes[]
    | ([.fieldValues.nodes[] | select(.field != null) | {(.field.name): (.text // .name)}] | add // {})
      + {id: .id, number: (.content.number // 0), title: (.content.title // "")}]) as $cards
  | (.[0].data.organization.projectV2.items.totalCount) as $total
  | if ($cards | length) != ($total // -1)
      then error(if $total == null
                 then "claim read: gh returned no usable response"
                 else "claim read incomplete: \($cards | length) of \($total) items" end)
      else . end
  | ("rateLimit: cost \([.[] | .data.rateLimit.cost] | add), remaining \(.[-1].data.rateLimit.remaining), resets \(.[-1].data.rateLimit.resetAt)"),
    ("items: \($cards | length)/\($total)"),
    ("projectId: \(.[0].data.organization.projectV2.id)"),
    (.[0].data.organization.projectV2.fields.nodes[]
      | select(.name == "Status" or .name == "Session" or .name == "Area")
      | "field \(.name): \(.id)\(if .options then " " + ([.options[] | "\(.name)=\(.id)"] | join(" ")) else "" end)"),
    ("busy areas: \([$cards[]
        | select(.Status == "In progress" or .Status == "Gate" or .Status == "PR")
        | select(.Area != null and .Area != "docs") | .Area] | unique | join(" "))"),
    ($cards[]
      | "item \(.id) #\(.number) [\(.Status // "-")] area=\(.Area // "-") session=\(.Session // "-") \(.title)"),
    (.[0].data.repository.issues.nodes[]
      | select(.issueDependenciesSummary.blockedBy > 0)
      | "#\(.number) blocked by \([.blockedBy.nodes[] | select(.state == "OPEN") | "#\(.number)"] | join(", "))")'
