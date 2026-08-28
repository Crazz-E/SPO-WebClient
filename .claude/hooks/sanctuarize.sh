#!/bin/bash
# Stop hook — enforces the end-of-turn typecheck instead of leaving it declarative.
#
# Runs the typecheck ONCE per turn, and only if a .ts/.tsx file was actually
# written (flag set by typecheck-guard.sh). On failure it exits 2, which feeds
# stderr back to Claude so the errors get fixed before the turn ends.
#
# Loop guard: Claude Code sets stop_hook_active=true when it is re-invoking after
# a blocked stop. We never block twice in a row.

# A session is alive here — stamp the heartbeat finish.sh reads before reaping a worktree.
. "$(dirname "$0")/session-heartbeat.sh"
spo_stamp_heartbeat

PAYLOAD=$(cat)

STOP_ACTIVE=$(node -e "
  try { console.log(JSON.parse(process.argv[1]).stop_hook_active === true ? '1' : '0'); }
  catch(e) { console.log('0'); }
" "$PAYLOAD" 2>/dev/null)

FLAG="$(dirname "$0")/../.typecheck-dirty"

# Nothing typed changed this turn — nothing to verify.
[ -f "$FLAG" ] || exit 0

# Already blocked once; clear and let the turn end rather than looping.
if [ "$STOP_ACTIVE" = "1" ]; then
  rm -f "$FLAG"
  exit 0
fi

BENCH_DIR="${SPO_BENCH_DIR:-$HOME/.spo-bench}"
LOG_DIR="$BENCH_DIR/logs"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/sanctuarize-typecheck-$STAMP-$$.log"

npm run --silent typecheck >"$LOG" 2>&1
STATUS=$?

rm -f "$FLAG"

if [ $STATUS -ne 0 ]; then
  echo "Sanctuarization failed — typecheck errors introduced this turn:" >&2
  tail -n 40 "$LOG" >&2
  echo "" >&2
  echo "LOG=$LOG" >&2
  echo "Fix these before ending the turn. Remaining manual steps: npm test, npm run build." >&2
  exit 2
fi

exit 0
