#!/usr/bin/env bash
# End the bench lease held for the CURRENT worktree early (`npm run dev:release`).
set -euo pipefail
MAIN_REPO="${SPO_BENCH_REPO:-$HOME/SPO-WebClient}"
exec node "$MAIN_REPO/dist/e2e/bench/cli.js" release "$@"
