#!/usr/bin/env bash
# npm run dev:local — a gateway of YOUR OWN, off the bench. Debugging only.
#
# The conscious exception in CLAUDE.md: the live bench (port 8080, the LOCKED accounts,
# the Helartia world state) belongs to the bench worker, and a run started here attests
# nothing — to prove a change, `npm run gate`.
#
# It used to be `npm run build && npm start`, and `npm start` defaults to PORT 8080
# (src/shared/config.ts:23) — the bench port. The instruction to type `PORT=8081` first
# lived in a table in CLAUDE.md, which is advisory: a session verifying its own change
# reached for `npm run dev:local`, took the bench port, and either lost its gateway to the
# worker's `clearPort` or blocked every other session's gate. The default belongs in the
# script, not in a document.
#
#   npm run dev:local              first free port from 8081 up
#   PORT=8090 npm run dev:local    that port, unless it is the bench port or taken
set -euo pipefail

BENCH_PORT="${SPO_BENCH_PORT:-8080}"
FIRST_LOCAL_PORT="${SPO_LOCAL_PORT_BASE:-8081}"
LAST_LOCAL_PORT=$((FIRST_LOCAL_PORT + ${SPO_LOCAL_PORT_SPAN:-19} - 1))

free_port() {
  ! ss -ltn "sport = :$1" 2>/dev/null | grep -q LISTEN
}

if [ -n "${PORT:-}" ]; then
  if [ "$PORT" = "$BENCH_PORT" ]; then
    echo "REFUSED: $BENCH_PORT is the bench port — it belongs to the bench worker." >&2
    echo "Use npm run dev for a leased gateway there, or another PORT here." >&2
    exit 1
  fi
  if ! free_port "$PORT"; then
    echo "REFUSED: port $PORT is already in use." >&2
    exit 1
  fi
  port="$PORT"
else
  port=""
  for candidate in $(seq "$FIRST_LOCAL_PORT" "$LAST_LOCAL_PORT"); do
    [ "$candidate" = "$BENCH_PORT" ] && continue
    if free_port "$candidate"; then
      port="$candidate"
      break
    fi
  done
  if [ -z "$port" ]; then
    echo "REFUSED: no free port between $FIRST_LOCAL_PORT and $LAST_LOCAL_PORT." >&2
    exit 1
  fi
fi

echo "== dev:local on port $port — off the bench; this run attests nothing (npm run gate does)"
npm run build
PORT="$port" exec npm start
