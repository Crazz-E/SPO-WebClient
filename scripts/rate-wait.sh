#!/usr/bin/env bash
# npm run board:wait — block until the GraphQL quota refills, then return.
#
# WHY. § 2's handshake defines what to do when GitHub answers RATE_LIMITED mid-claim: read
# the bucket's `reset`, wait for it ONCE, then finish the handshake — a half-made claim must
# never be walked away from, because it leaves a card only a human can free.
#
# Waiting is the part a session cannot express: `sleep` matches no allowlist entry and a
# `while` loop is compound shell, so hand-rolling the wait stops to ask for permission. This
# script is the allowlisted way to do it — it reads the reset itself, so the caller composes
# nothing and computes nothing.
#
# `gh api rate_limit` is free and still answers when the bucket is empty (§ GitHub API
# discipline), which is why the reset can be read at the very moment it is needed.
#
#   bash scripts/rate-wait.sh            # wait for the GraphQL bucket
#   bash scripts/rate-wait.sh core       # or the REST one
set -euo pipefail

bucket="${1:-graphql}"
# A wait longer than an hour means something other than a rate limit is wrong: GitHub's
# buckets refill hourly, so cap it rather than hang a session until someone notices.
max_wait=3700

read -r remaining reset < <(
  gh api rate_limit --jq ".resources.${bucket} | \"\(.remaining) \(.reset)\""
)

now=$(date +%s)
wait_s=$(( reset - now ))

printf '%s bucket: remaining %s, resets at %s\n' \
  "$bucket" "$remaining" "$(date -d "@$reset" -Is)"

# The reset time is always in the future, so waiting on it blindly would burn up to an hour
# on a bucket that was never empty. Only an exhausted bucket is worth waiting for: a whole
# claim — the composite read plus its three item-edits and the verify — costs under 10 points.
floor="${SPO_RATE_FLOOR:-20}"
if [ "$remaining" -ge "$floor" ]; then
  echo "bucket is not exhausted (>= $floor) — nothing to wait for"
  exit 0
fi

if [ "$wait_s" -le 0 ]; then
  echo "already reset — nothing to wait for"
  exit 0
fi

if [ "$wait_s" -gt "$max_wait" ]; then
  echo "reset is ${wait_s}s away, further than an hourly bucket can be — refusing to wait" >&2
  exit 1
fi

# +5s of slack: resetting exactly on the boundary can still come back empty.
wait_s=$(( wait_s + 5 ))
echo "waiting ${wait_s}s for the bucket to refill…"
sleep "$wait_s"
echo "reset reached — resume the handshake where it stopped"
