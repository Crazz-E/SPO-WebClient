#!/usr/bin/env bash
# Read the nightly verdict and current origin/main sha.
# Usage: bash scripts/nightly-check.sh
set -euo pipefail

BENCH_DIR="${SPO_BENCH_DIR:-$HOME/.spo-bench}"
NIGHTLY="$BENCH_DIR/nightly/latest.json"

if [ -f "$NIGHTLY" ]; then
  cat "$NIGHTLY"
else
  echo '{"status":"no nightly found"}'
fi

git fetch -q origin main
printf 'origin/main: %s\n' "$(git rev-parse origin/main)"
