#!/usr/bin/env bash
# Print one verdict line and exit with a code the caller branches on —
# it never re-derives the predicate (the five-case sha comparison used
# to be done by eye by the caller).
#
# Exit codes:
#   0 - GREEN: no evidence that main is broken (no nightly on file, PASS,
#       ENVIRONMENT/INTERRUPTED, or a FAIL whose sha main has moved past)
#   1 - RED: verdict is FAIL and it was run against the current origin/main
#   2 - UNKNOWN: the script could not tell (jq not installed, missing/invalid
#       JSON, missing verdict field, an unrecognised verdict value, or a git
#       failure) — never mistake this for green
#
# Usage: bash scripts/nightly-check.sh
set -euo pipefail

BENCH_DIR="${SPO_BENCH_DIR:-$HOME/.spo-bench}"
NIGHTLY="$BENCH_DIR/nightly/latest.json"

if [ ! -f "$NIGHTLY" ]; then
  echo "MAIN: GREEN (no nightly on file)"
  exit 0
fi

if ! git fetch -q origin main; then
  echo "MAIN: UNKNOWN git fetch origin main failed"
  exit 2
fi

ORIGIN_MAIN="$(git rev-parse origin/main 2>/dev/null)" || {
  echo "MAIN: UNKNOWN git rev-parse origin/main failed"
  exit 2
}

if ! command -v jq >/dev/null 2>&1; then
  echo "MAIN: UNKNOWN jq not installed (apt install jq)"
  exit 2
fi

if ! jq -e . "$NIGHTLY" >/dev/null 2>&1; then
  echo "MAIN: UNKNOWN unreadable or invalid JSON in $NIGHTLY"
  exit 2
fi

VERDICT="$(jq -r '.verdict // empty' "$NIGHTLY")"
SHA="$(jq -r '.sha // empty' "$NIGHTLY")"
DETAIL="$(jq -r '.detail // empty' "$NIGHTLY")"
LOGFILE="$(jq -r '.logFile // empty' "$NIGHTLY")"
FINISHED_AT="$(jq -r '.finishedAt // empty' "$NIGHTLY")"

if [ -z "$VERDICT" ]; then
  echo "MAIN: UNKNOWN missing verdict field in $NIGHTLY"
  exit 2
fi

case "$VERDICT" in
  FAIL)
    if [ "$SHA" = "$ORIGIN_MAIN" ]; then
      echo "MAIN: RED sha=$SHA detail=$DETAIL logFile=$LOGFILE"
      exit 1
    else
      echo "MAIN: GREEN (FAIL at ${SHA:0:8}, main moved past it)"
      exit 0
    fi
    ;;
  PASS)
    echo "MAIN: GREEN (PASS $FINISHED_AT)"
    exit 0
    ;;
  ENVIRONMENT|INTERRUPTED)
    echo "MAIN: GREEN ($VERDICT — the run proved nothing about main)"
    exit 0
    ;;
  *)
    echo "MAIN: UNKNOWN unrecognised verdict $VERDICT"
    exit 2
    ;;
esac
