#!/bin/bash
# UserPromptSubmit hook — points at the right knowledge base BEFORE planning.
#
# Replaces skill-reminder.sh, which ran on PreToolUse(Edit|Write): that fired
# after the decision to write was already made, too late to change the approach.
# Matching the prompt instead puts the pointer in front of the plan.
#
# Emits at most a handful of lines. Stdout is added to the turn's context.
# Always exits 0.

PROMPT=$(node -e "
  let d='';
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try { console.log((JSON.parse(d).prompt || '').toLowerCase()); }
    catch(e) { console.log(''); }
  });
")

[ -z "$PROMPT" ] && exit 0

OUT=""
add() { OUT="${OUT}$1"$'\n'; }

# --- RDO protocol: the project's critical path -------------------------------
case "$PROMPT" in
  *rdo*|*protocol*|*protocole*|*wire*|*rdocommand*|*rdovalue*|*sendrdorequest*)
    add "RDO WORK DETECTED — mandatory before writing any RDO code:"
    add "  1. doc/rdo-protocol-architecture.md — evidence hierarchy (§0), wire framing, dispatch, separator matrix (§8.5)"
    add "  2. doc/rdo_typing_system.md — RdoValue / RdoCommand API"
    add "  3. Invoke the rdo-conformity skill. Verify against ../SPO-Original via delphi-archaeologist."
    add "  On conflict, live captures win over Delphi source (doc/Mock_Server_scenarios_captures.md)."
    ;;
esac

case "$PROMPT" in
  *session*|*reconnect*|*reconnexion*|*timeout*|*keepalive*|*keep-alive*|*serverbusy*|*logon*|*login*|*logoff*)
    add "SESSION / LIFECYCLE — read doc/rdo-session-lifecycle.md (login-logoff sequences, KeepAlive, ServerBusy, reconnection policy, accepted divergences §9). Skill: rdo-network-resilience."
    ;;
esac

# --- Legacy source -----------------------------------------------------------
case "$PROMPT" in
  *delphi*|*legacy*|*spo-original*|*original\ client*|*original\ server*|*\.pas*|*voyager*)
    add "LEGACY SOURCE — ../SPO-Original (Delphi 5). Use the delphi-archaeologist skill; cite File.pas:Line or mark [INFERRED]/[UNKNOWN]. Index: doc/spo-original-reference.md."
    ;;
esac

# --- Renderer ----------------------------------------------------------------
case "$PROMPT" in
  *render*|*texture*|*terrain*|*chunk*|*canvas*|*isometric*|*isom*|*sprite*|*tile*)
    add "RENDERER — doc/texture-rendering-architecture.md (asset pipeline), doc/CANVAS2D-TEXTURE-SELECTION-ANALYSIS.md. Canvas 2D isometric engine, no WebGL/Three.js. Skill: web-games (frame budget)."
    ;;
esac

case "$PROMPT" in
  *concrete*|*béton*|*beton*) add "CONCRETE TILES — doc/concrete_rendering.md (tile system, coordinate format)." ;;
esac

case "$PROMPT" in
  *road*|*route*) add "ROADS — doc/road_rendering_reference.md (block classes, BMP palette)." ;;
esac

# --- Game domain -------------------------------------------------------------
case "$PROMPT" in
  *building*|*facility*|*inspector*|*bâtiment*|*batiment*|*usine*)
    add "BUILDINGS — doc/building_details_protocol.md + doc/facility-tabs-reference.md + doc/voyager-inspector-architecture.md."
    ;;
esac

case "$PROMPT" in
  *supply*|*approvisionnement*) add "SUPPLY — doc/supply-system.md (supply chain RDO protocol)." ;;
esac

case "$PROMPT" in
  *research*|*invention*|*recherche*) add "RESEARCH — doc/research-system-reference.md (research tree mechanics)." ;;
esac

# --- Testing -----------------------------------------------------------------
case "$PROMPT" in
  *e2e*|*playwright*|*smoke*)
    add "E2E — doc/E2E-STRATEGY.md (where it fits), doc/E2E-TESTING.md (procedure), doc/E2E-SCENARIO.md (L3 script). Credentials are LOCKED. Screenshots via sub-agent only."
    ;;
esac

case "$PROMPT" in
  *mock*|*capture*|*fixture*)
    add "MOCK / CAPTURES — src/mock-server/CLAUDE.md (API) + doc/mock-server-guide.md (step-by-step) + doc/Mock_Server_scenarios_captures.md (the 14 live captures). Generated scenarios in scenarios/captured/ are never hand-edited. Captures outrank Delphi source on conflict — see the rdo-conformity skill."
    ;;
esac

case "$PROMPT" in
  *test*|*coverage*|*couverture*|*jest*)
    add "TESTING — skill: spo-testing. Two coverage numbers, do not conflate: new/modified lines >= 93% (review convention) vs the jest.config.js machine floor (global 38%, per-directory higher). Thresholds only go UP; jest.config.js is protected. 7 custom RDO matchers available."
    ;;
esac

# --- Server / deployment -----------------------------------------------------
case "$PROMPT" in
  *deploy*|*docker*|*production*|*sécurité*|*securite*|*security*)
    add "SERVER / DEPLOY — doc/architecture-overview.md, doc/deployment-security.md, doc/production-security-policy.md, doc/logging-system.md."
    ;;
esac

if [ -n "$OUT" ]; then
  printf '%s' "$OUT"
fi

exit 0
