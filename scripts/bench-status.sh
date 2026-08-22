#!/usr/bin/env bash
# Worker liveness + queue at a glance.
set -euo pipefail
MAIN_REPO="${SPO_BENCH_REPO:-$HOME/SPO-WebClient}"
exec node "$MAIN_REPO/dist/e2e/bench/cli.js" status "$@"
