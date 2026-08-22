#!/usr/bin/env bash
# Deposit a job on the bench worker for the CURRENT worktree, from any worktree.
#
# The client code always comes from the MAIN checkout's dist/ — never from this
# worktree's, which may be broken or unbuilt (that is precisely what the job will find
# out). Override with SPO_BENCH_REPO when the worker runs from another checkout.
set -euo pipefail
MAIN_REPO="${SPO_BENCH_REPO:-$HOME/SPO-WebClient}"
CLI="$MAIN_REPO/dist/e2e/bench/cli.js"
if [ ! -f "$CLI" ]; then
  echo "bench client not built at $CLI — run 'npm run build:e2e' in $MAIN_REPO," >&2
  echo "or point SPO_BENCH_REPO at the checkout that hosts the worker." >&2
  exit 3
fi
exec node "$CLI" submit "$@"
