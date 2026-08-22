#!/usr/bin/env bash
# Wait for a bench job report — meant to run as ONE background command, so a queued
# session spends zero tokens waiting. Exit: 0 PASS/LEASED · 1 other verdict ·
# 3 worker died · 4 timeout.
set -euo pipefail
MAIN_REPO="${SPO_BENCH_REPO:-$HOME/SPO-WebClient}"
exec node "$MAIN_REPO/dist/e2e/bench/cli.js" wait "$@"
