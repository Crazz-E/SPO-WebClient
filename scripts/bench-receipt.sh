#!/usr/bin/env bash
# Record that `gate:precheck` passed on THIS worktree, so the bench worker does not replay
# typecheck, lint and the Jest suite inside the exclusive bench (src/e2e/bench/receipt.ts).
#
# Same client resolution as bench-submit.sh: the code always comes from the MAIN checkout's
# dist/, never from this worktree's, which may be broken or unbuilt.
#
# NEVER fails the precheck. A missing receipt costs one static replay on the bench — the
# behaviour before receipts existed — and that is always preferable to turning a green
# precheck red because the bench client is not built.
set -uo pipefail
MAIN_REPO="${SPO_BENCH_REPO:-$HOME/SPO-WebClient}"
CLI="$MAIN_REPO/dist/e2e/bench/cli.js"
if [ ! -f "$CLI" ]; then
  echo "no bench client at $CLI — skipping the precheck receipt;" >&2
  echo "the worker will replay typecheck/lint/tests (build it with 'npm run build:e2e' in $MAIN_REPO)." >&2
  exit 0
fi
node "$CLI" receipt || true
exit 0
