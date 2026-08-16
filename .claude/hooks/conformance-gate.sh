#!/bin/bash
# PreToolUse hook (Bash) — the conformance gate before any git sync.
#
# Rule (developer, 2026-08-16, replaces the earlier cadence statements):
#   before sources go to git, run the RDO conformance suite
#     1. on the memory socket (--transport replay), and
#     2. if it reports no error, LIVE (--transport live --live);
#   git commit / git push cannot happen until both are validated on the
#   CURRENT sources.
#
# The CLI writes `.conformance-gate.json` at the repo root after every run that
# exits 0 (one entry per transport, with the run's end time). This hook lets a
# `git commit` / `git push` through only when both entries exist, replay came
# before live, and no file under src/ changed after either run.
#
# Exit 2 blocks the tool call and feeds the reason back to Claude.

PAYLOAD=$(cat)

CMD=$(node -e "
  try { const j = JSON.parse(process.argv[1]); console.log((j.tool_input && j.tool_input.command) || ''); }
  catch (e) { console.log(''); }
" "$PAYLOAD" 2>/dev/null)

# Only git commit / git push are gated (any position in a compound command).
echo "$CMD" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+(commit|push)([[:space:]]|$)' || exit 0

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
node "$ROOT/.claude/hooks/conformance-gate-check.js" "$ROOT"
STATUS=$?
if [ $STATUS -ne 0 ]; then
  echo "" >&2
  echo "Git sync refused by the conformance gate. Run, in this order, then retry:" >&2
  echo "  1. npm run conformance -- --suite all --recording report/campaign/rec/<latest>.ndjson --diff-baseline report/campaign/rec/<latest>-baseline.json" >&2
  echo "  2. npm run conformance -- --suite <read suites> --transport live --live --company \"SPO_test3 - Green\" --server-logs" >&2
  echo "Both must exit 0 on the current sources (doc/rdo-conformance-suite.md §11)." >&2
  exit 2
fi
exit 0
