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

# RDO network resilience (reconnect, timeouts, error handling, ServerBusy)
case "$FILE_PATH" in
  *spo_session*|*reconnect-utils*|*timeout-categories*|*error-codes*|*rdo-request-guards*|*login-handler*|*rdo.ts|*rdo-connection-pool*)
    REMINDERS="${REMINDERS}SKILL CONTEXT: rdo-network-resilience — RDO reconnect, timeout alignment, error classification, connection pooling. See .claude/skills/rdo-network-resilience/SKILL.md.\n"
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

# --- Documentation triggers (knowledge bases) ---

# RDO protocol docs
case "$FILE_PATH" in
  *rdo*|*spo_session*)
    REMINDERS="${REMINDERS}DOC CONTEXT: Read doc/rdo-protocol-architecture.md (wire framing, dispatch, login) + doc/rdo_typing_system.md (RdoValue/RdoCommand API).\n"
    ;;
esac

# Renderer / Canvas / texture docs
case "$FILE_PATH" in
  *renderer*|*terrain*|*texture*|*chunk*)
    REMINDERS="${REMINDERS}DOC CONTEXT: Read doc/texture-rendering-architecture.md (full asset pipeline).\n"
    ;;
esac

# Concrete rendering
case "$FILE_PATH" in
  *concrete*)
    REMINDERS="${REMINDERS}DOC CONTEXT: Read doc/concrete_rendering.md (concrete tile system, coordinate format).\n"
    ;;
esac

# Road rendering
case "$FILE_PATH" in
  *road*)
    REMINDERS="${REMINDERS}DOC CONTEXT: Read doc/road_rendering_reference.md (road block classes, BMP palette).\n"
    ;;
esac

# Building / facility / inspector docs
case "$FILE_PATH" in
  *building*|*facility*|*inspector*|*property*)
    REMINDERS="${REMINDERS}DOC CONTEXT: Read doc/building_details_protocol.md + doc/facility-tabs-reference.md.\n"
    ;;
esac

# Voyager / handler docs
case "$FILE_PATH" in
  *voyager*|*handler-reference*)
    REMINDERS="${REMINDERS}DOC CONTEXT: Read doc/voyager-inspector-architecture.md + doc/voyager-handler-reference.md.\n"
    ;;
esac

# Server architecture
case "$FILE_PATH" in
  *src/server/server.ts|*src/server/*-service.ts)
    REMINDERS="${REMINDERS}DOC CONTEXT: Read doc/architecture-overview.md (services, API endpoints) + doc/logging-system.md.\n"
    ;;
esac

# Supply system
case "$FILE_PATH" in
  *supply*)
    REMINDERS="${REMINDERS}DOC CONTEXT: Read doc/supply-system.md (supply chain RDO protocol).\n"
    ;;
esac

# Research system
case "$FILE_PATH" in
  *research*|*invention*)
    REMINDERS="${REMINDERS}DOC CONTEXT: Read doc/research-system-reference.md (research tree mechanics).\n"
    ;;
esac

# E2E / mock server docs
case "$FILE_PATH" in
  *mock-server*|*scenario*|*capture*)
    REMINDERS="${REMINDERS}DOC CONTEXT: Read doc/mock-server-guide.md + doc/Mock_Server_scenarios_captures.md.\n"
    ;;
esac

# Core entry points -> architecture overview
case "$FILE_PATH" in
  *src/client/client.ts|*src/client/main.tsx|*src/client/App.tsx)
    REMINDERS="${REMINDERS}DOC CONTEXT: Read doc/architecture-overview.md (project structure, services, API endpoints).\n"
    ;;
esac

if [ -n "$REMINDERS" ]; then
  echo -e "$REMINDERS"
fi

exit 0
