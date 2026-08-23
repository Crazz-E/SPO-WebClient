#!/bin/bash
# PostToolUse hook (Edit|Write) — marks the tree dirty when TypeScript changes.
#
# Deliberately does NO work: it only sets a flag. The actual typecheck runs once
# per turn in the Stop hook (sanctuarize.sh) instead of once per edit.
#
# Before: two `tsc --noEmit` passes on every Edit|Write, every file type, ~15.3 s.
# After:  ~0 ms here; one 15 s pass per turn, only when .ts/.tsx actually changed.
#
# Always exits 0 — never blocks an edit.
#
# It also stamps the session heartbeat: an edit here proves a session is working in this
# worktree, which is what stops another session's `npm run finish` from reaping it.

. "$(dirname "$0")/session-heartbeat.sh"
spo_stamp_heartbeat

FILE_PATH=$(node -e "
  let d='';
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try {
      const j = JSON.parse(d);
      console.log((j.tool_input && j.tool_input.file_path) || j.file_path || '');
    }
    catch(e) { console.log(''); }
  });
")

case "$FILE_PATH" in
  *.ts|*.tsx)
    touch "$(dirname "$0")/../.typecheck-dirty" 2>/dev/null
    ;;
esac

exit 0
