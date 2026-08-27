#!/usr/bin/env bash
# npm run verdict -- <alias> [--tail=N]
#
# Runs one whitelisted npm script and reports its outcome the way the bench
# worker does: the exit code IS the verdict, the full output is captured to a
# log file OUTSIDE the worktree (so a dirty-tree check never sees it), and
# stdout always ends with a machine-readable LOG=/EXIT= pair a caller can
# grep for without depending on how much of the log was tailed.
#
# Exit codes:
#   64  - unknown alias (checked before npm ever runs)
#   N   - whatever the underlying `npm run <alias>` exited with
#
# Usage: bash scripts/run-verdict.sh <alias> [--tail=N]
set -uo pipefail

VALID_ALIASES=(
  test
  test:changed
  test:coverage
  test:smoke
  typecheck
  lint
  build
  coverage:changed
  gate:precheck
  gate:local
)

ALIAS=""
TAIL=40

for arg in "$@"; do
  case "$arg" in
    --tail=*)
      TAIL="${arg#--tail=}"
      ;;
    *)
      if [ -z "$ALIAS" ]; then
        ALIAS="$arg"
      fi
      ;;
  esac
done

if [ -z "$ALIAS" ]; then
  echo "usage: bash scripts/run-verdict.sh <alias> [--tail=N]" >&2
  echo "valid aliases: ${VALID_ALIASES[*]}" >&2
  exit 64
fi

KNOWN=0
for a in "${VALID_ALIASES[@]}"; do
  if [ "$a" = "$ALIAS" ]; then
    KNOWN=1
    break
  fi
done
if [ "$KNOWN" -ne 1 ]; then
  echo "unknown alias: $ALIAS" >&2
  echo "valid aliases: ${VALID_ALIASES[*]}" >&2
  exit 64
fi

case "$TAIL" in
  ''|*[!0-9]*) TAIL=40 ;;
esac
if [ "$TAIL" -lt 1 ] || [ "$TAIL" -gt 500 ]; then
  TAIL=40
fi

BENCH_DIR="${SPO_BENCH_DIR:-$HOME/.spo-bench}"
LOG_DIR="$BENCH_DIR/logs"
mkdir -p "$LOG_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/verdict-$ALIAS-$STAMP-$$.log"

npm run --silent "$ALIAS" >"$LOG" 2>&1
code=$?

tail -n "$TAIL" "$LOG"
echo "LOG=$LOG"
echo "EXIT=$code"

exit $code
