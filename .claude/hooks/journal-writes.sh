#!/bin/bash
# PostToolUse hook (Edit|Write|Bash|NotebookEdit) — journals writes to judging instruments.
#
# Detects writes to files that matter to the gate: hooks, bench configuration, RDO protocol,
# and the gate decision logic itself. Appends a JSON line to the session's journal without
# blocking the write.
#
# Instrumented file families:
#  - .claude/hooks/**
#  - .claude/settings.json
#  - src/e2e/bench/**
#  - scripts/bench-*
#  - scripts/verify-gate.js
#  - jest.config.js
#  - RDO files: src/shared/rdo-types.ts, src/shared/rdo-frame.ts, src/shared/rdo-members.ts, src/server/rdo.ts
#
# Always exits 0 — never blocks a write. Stamps the session heartbeat on every run.

. "$(dirname "$0")/session-heartbeat.sh"
spo_stamp_heartbeat

payload="$(cat)"

# Extract session info and find the worktree
top="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -n "$top" ] || exit 0
top="$(readlink -f "$top" 2>/dev/null)" || exit 0
key="$(printf '%s' "$top" | sha1sum | cut -c1-16)"

store="${SPO_SESSION_DIR:-$HOME/.spo-bench/sessions}"
journal_dir="${SPO_BENCH_DIR:-$HOME/.spo-bench}/journals"
mkdir -p "$journal_dir" 2>/dev/null || true

# Run the decision program to identify instrumented files
verdict="$(printf '%s' "$payload" | SPO_TOP="$top" \
  node "$(dirname "$0")/journal-writes.js" 2>/dev/null)" || exit 0

# verdict is a JSON object with tool, path, or empty string for no journal
[ -n "$verdict" ] || exit 0

# Get the current branch and timestamp
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || branch=""
timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')" || timestamp=""

# Append to journal
journal_file="$journal_dir/$key.jsonl"
{
  printf '{"session_key":"%s","branch":"%s","timestamp":"%s",' "$key" "$branch" "$timestamp"
  printf '%s}\n' "$verdict"
} >> "$journal_file" 2>/dev/null || true

exit 0
