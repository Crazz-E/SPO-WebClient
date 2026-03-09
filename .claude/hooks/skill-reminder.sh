#!/bin/bash
# Skill reminder hook — runs on PreToolUse for Edit|Write
# Parses TOOL_INPUT env var for file_path and outputs relevant skill reminders.
# Always exits 0 (soft enforcement — reminds, doesn't block).

FILE_PATH=$(echo "$TOOL_INPUT" | node -e "
  let d='';
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try { console.log(JSON.parse(d).file_path||''); }
    catch(e) { console.log(''); }
  });
")

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

REMINDERS=""

# --- Project skills (invokable via /skill-name) ---
# Remaining: code-guardian, delphi-archaeologist, dependency-audit, dependency-updater, e2e-test
# (code-guardian triggers on any src/ file — too broad for hook, handled by description)

# --- Community skills (context guidance) ---

# Zustand stores
case "$FILE_PATH" in
  *client/*store*.ts|*client/*Store*.ts)
    REMINDERS="${REMINDERS}SKILL CONTEXT: Consider zustand-store-ts patterns (subscribeWithSelector, slices, immer middleware).\n"
    ;;
esac

# React components
case "$FILE_PATH" in
  *components/*.tsx)
    REMINDERS="${REMINDERS}SKILL CONTEXT: Consider react-best-practices (hooks, composition, memoization) + accessibility-compliance (WCAG 2.2 AA, ARIA, keyboard nav).\n"
    ;;
esac

# Test files
case "$FILE_PATH" in
  *.test.ts|*.test.tsx|*__tests__*)
    REMINDERS="${REMINDERS}SKILL CONTEXT: Consider jest-testing patterns (mocking, coverage >= 93%, custom matchers, fixtures).\n"
    ;;
esac

# Server files (non-RDO)
case "$FILE_PATH" in
  *src/server/*)
    REMINDERS="${REMINDERS}SKILL CONTEXT: Consider nodejs-backend (middleware, error handling) + security-auditor (OWASP, WebSocket security).\n"
    ;;
esac

# Renderer files
case "$FILE_PATH" in
  *renderer*|*client/*-system.ts)
    REMINDERS="${REMINDERS}SKILL CONTEXT: Consider web-performance (frame budget, runtime perf) + web-games (Canvas 2D optimization).\n"
    ;;
esac

if [ -n "$REMINDERS" ]; then
  echo -e "$REMINDERS"
fi

exit 0
