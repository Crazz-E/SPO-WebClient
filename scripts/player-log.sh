#!/bin/bash
# Filter NDJSON logs by player username.
#
# Usage:
#   ./scripts/player-log.sh <username> [logfile] [--level LEVEL]
#
# Examples:
#   ./scripts/player-log.sh SPO_test3
#   ./scripts/player-log.sh SPO_test3 logs/gateway.ndjson
#   ./scripts/player-log.sh SPO_test3 logs/gateway.ndjson --level ERROR
#
# Requires: jq (https://jqlang.github.io/jq/)

set -euo pipefail

PLAYER="${1:?Usage: player-log.sh <username> [logfile] [--level LEVEL]}"
LOGFILE="${2:-logs/gateway.ndjson}"
LEVEL=""

# Parse optional --level flag
shift 2 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --level) LEVEL="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required. Install it from https://jqlang.github.io/jq/" >&2
  exit 1
fi

if [[ ! -f "$LOGFILE" ]]; then
  echo "Error: Log file not found: $LOGFILE" >&2
  exit 1
fi

if [[ -n "$LEVEL" ]]; then
  jq "select(.player == \"$PLAYER\" and .level == \"$LEVEL\")" "$LOGFILE"
else
  jq "select(.player == \"$PLAYER\")" "$LOGFILE"
fi
