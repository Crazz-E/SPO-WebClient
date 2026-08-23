#!/bin/bash
# UserPromptSubmit hook — points at the right knowledge base BEFORE planning.
#
# Replaces skill-reminder.sh, which ran on PreToolUse(Edit|Write): that fired
# after the decision to write was already made, too late to change the approach.
# Matching the prompt instead puts the pointer in front of the plan.
#
# Emits at most a handful of lines. Stdout is added to the turn's context.
# Always exits 0.

# A session is alive here — stamp the heartbeat finish.sh reads before reaping a worktree.
. "$(dirname "$0")/session-heartbeat.sh"
spo_stamp_heartbeat

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


case "$PROMPT" in
  *session*|*reconnect*|*reconnexion*|*timeout*|*keepalive*|*keep-alive*|*serverbusy*|*logon*|*login*|*logoff*)
    add "SESSION / LIFECYCLE — verify any sequence change against ../SPO-Original before editing."
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
    add "RENDERER — doc/texture-rendering-architecture.md (asset pipeline; its server half is historical — static terrain assets now come from the CDN). Canvas 2D isometric engine, no WebGL/Three.js. Skill: web-games (frame budget)."
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
    add "BUILDINGS - doc/facility-tabs-reference.md + doc/voyager-inspector-architecture.md (tabs and UI)."
    ;;
esac

case "$PROMPT" in
  *supply*|*approvisionnement*) add "SUPPLY — doc/supply-system.md (supply chain RDO protocol)." ;;
esac

case "$PROMPT" in
  *research*|*invention*|*recherche*) add "RESEARCH — doc/research-system-reference.md (research tree mechanics)." ;;
esac

case "$PROMPT" in
  *politic*|*mayor*|*maire*|*president*|*président*|*minist*|*capitol*|*town\ hall*|*tax*|*taxe*|*election*|*élection*)
    add "CIVIC ROLES — doc/civic-roles-reference.md (Mayor/President/Minister powers, Voyager parity, server rules). Open gaps: OB-17..OB-27 in doc/BACKLOG-OPEN.md."
    ;;
esac

# --- Testing -----------------------------------------------------------------
case "$PROMPT" in
  *e2e*|*playwright*|*smoke*)
    add "E2E — doc/E2E-POLICY.md (THE GATE: layers, routing, President exclusion, 3-attempt loop), doc/E2E-TESTING.md (L3 browser procedure + smoke script). L2 live WS drive: src/e2e/, npm run test:live. Credentials LOCKED (SPO_test3 mayor, Crazz basic). Screenshots via sub-agent only."
    ;;
esac

case "$PROMPT" in
  *mock*|*fixture*)
    add "MOCK SERVER — src/mock-server/CLAUDE.md (API, scenario authoring, strict validator). Hand-written scenarios only."
    ;;
esac

case "$PROMPT" in
  *test*|*coverage*|*couverture*|*jest*)
    add "TESTING — skill: spo-testing. Two coverage numbers, do not conflate: new/modified lines >= 93% (review convention) vs the jest.config.js machine floor (global 38%, per-directory higher). Thresholds only go UP; jest.config.js is protected. 7 custom RDO matchers available."
    ;;
esac

# --- Server / deployment -----------------------------------------------------
case "$PROMPT" in
  *push*|*gate*|*bench*|*worker*|*"pull request"*|*" pr "*|*" pr"*|*merge*|*github*|*attestation*)
    add "PUSH CHAIN — doc/bench-worker.md (worker, job life, §5 push chain + GitHub ruleset checklist), doc/E2E-POLICY.md §3 (the gate), CONTRIBUTING.md § Pull requests. Commit first (a dirty tree is DIRTY), npm run gate in the background, push, PR; if main moved, update + re-gate. Only the worker attests; nobody bypasses main."
    ;;
esac

case "$PROMPT" in
  *deploy*|*docker*|*production*|*sécurité*|*securite*|*security*)
    add "SERVER / DEPLOY — doc/architecture-overview.md, doc/production-security-policy.md, doc/logging-system.md, deploy/DEPLOY.md (procedure)."
    ;;
esac

if [ -n "$OUT" ]; then
  printf '%s' "$OUT"
fi

exit 0
