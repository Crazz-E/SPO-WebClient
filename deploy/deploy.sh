#!/usr/bin/env bash
# ============================================================
# SPO-WebClient — Production Deploy Script
# ============================================================
# Usage:   ./deploy/deploy.sh [--force] [--no-prune]
# Cron:    */30 * * * * /opt/spo-webclient/deploy/deploy.sh >> /opt/spo-webclient/logs/deploy.log 2>&1
#
# What it does:
#   1. git fetch + check for new commits (skip if up-to-date, unless --force)
#   2. skip a commit already known to have failed its health gate (unless --force)
#   3. git pull
#   4. remember the running image as the rollback point
#   5. docker compose build (with BuildKit cache)
#   6. docker compose up -d
#   7. health gate: the container's own HEALTHCHECK must report `healthy`
#   8. gate failed -> roll back to the remembered image, record the bad commit, exit 1
#   9. gate passed -> prune dangling images (unless --no-prune), log summary
#
# The health gate is a gate, not a log line (policy SEC-R-3). A failed gate exits
# non-zero, prunes nothing, and leaves the previous deployment serving.
#
# Requirements:
#   - Docker + Docker Compose plugin installed
#   - .env file present in project root
#   - Git repo with remote configured
# ============================================================

set -euo pipefail

# ── Configuration ───────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://localhost:8080/api/startup-status}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"          # seconds to wait for a healthy container
HEALTH_INTERVAL="${HEALTH_INTERVAL:-5}"          # seconds between polls
HEALTH_PROBE_TIMEOUT="${HEALTH_PROBE_TIMEOUT:-5}" # hard cap on one readiness read
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/spo-deploy.lock}"
LOCK_MAX_AGE="${DEPLOY_LOCK_MAX_AGE:-3600}"      # a lock held longer than this is taken over
GATEWAY_SERVICE="${DEPLOY_SERVICE:-spo-webclient}"
GATEWAY_CONTAINER="${DEPLOY_CONTAINER:-spo-webclient}"
ROLLBACK_TAG="${DEPLOY_ROLLBACK_TAG:-spo-webclient:rollback}"
STATE_DIR="${DEPLOY_STATE_DIR:-$PROJECT_DIR/logs}"
FAILED_SHA_FILE="$STATE_DIR/deploy-failed-sha"
STEP_TIMEOUT="${DEPLOY_STEP_TIMEOUT:-1800}"      # hard cap on build / up, so nothing hangs forever

# ── Parse arguments ─────────────────────────────────────────
FORCE=false
PRUNE=true
for arg in "$@"; do
    case "$arg" in
        --force)    FORCE=true ;;
        --no-prune) PRUNE=false ;;
        --help|-h)
            echo "Usage: $0 [--force] [--no-prune]"
            echo "  --force     Deploy even if no new commits, or if this commit failed before"
            echo "  --no-prune  Skip dangling image cleanup"
            exit 0
            ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

# ── Helpers ─────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# The lock is removed only by the run that took it. Exiting because *someone else* holds
# it must not delete their lock — the old script did, which let two deploys overlap.
LOCK_OWNED=false
cleanup() {
    if [ "$LOCK_OWNED" = true ]; then
        rm -f "$LOCK_FILE"
    fi
}
trap cleanup EXIT
die() { log "ERROR: $*" >&2; exit 1; }

# ── Prevent concurrent runs (cron safety) ───────────────────
now_seconds() { date +%s; }
file_age_seconds() {
    local mtime
    mtime=$(stat -c %Y "$1" 2>/dev/null || echo 0)
    echo $(( $(now_seconds) - mtime ))
}
# PIDs are reused; only take over from a process that is actually a deploy.
lock_holder_is_deploy() { ps -p "$1" -o args= 2>/dev/null | grep -q 'deploy\.sh'; }

if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    LOCK_AGE=$(file_age_seconds "$LOCK_FILE")
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null && lock_holder_is_deploy "$LOCK_PID"; then
        if [ "$LOCK_AGE" -lt "$LOCK_MAX_AGE" ]; then
            log "Another deploy is running (PID $LOCK_PID, ${LOCK_AGE}s). Skipping."
            exit 0
        fi
        log "Deploy PID $LOCK_PID has held the lock for ${LOCK_AGE}s (max ${LOCK_MAX_AGE}s) — it is hung. Taking over."
        kill -9 "$LOCK_PID" 2>/dev/null || true
    else
        log "Stale lock file found (holder ${LOCK_PID:-unknown} is gone). Removing."
    fi
    rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
LOCK_OWNED=true

# ── Start ───────────────────────────────────────────────────
log "========== SPO-WebClient Deploy =========="
cd "$PROJECT_DIR"

# ── Pre-flight checks ──────────────────────────────────────
[ -f "$COMPOSE_FILE" ] || die "docker-compose.yml not found in $PROJECT_DIR"
[ -f "$PROJECT_DIR/.env" ] || die ".env file not found — copy deploy/.env.example to .env"
command -v docker >/dev/null 2>&1 || die "docker not found"
docker compose version >/dev/null 2>&1 || die "docker compose plugin not found"
mkdir -p "$STATE_DIR"

# ── Git pull ────────────────────────────────────────────────
log "Fetching from origin/$BRANCH..."
git fetch origin "$BRANCH" --quiet

LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ] && [ "$FORCE" = false ]; then
    log "Already up-to-date ($LOCAL_SHA). Nothing to deploy."
    exit 0
fi

# A commit that already failed its gate is not retried every 30 minutes. Push a fix, or
# rerun with --force.
LAST_FAILED=$(cat "$FAILED_SHA_FILE" 2>/dev/null || echo "")
if [ -n "$LAST_FAILED" ] && [ "$LAST_FAILED" = "$REMOTE_SHA" ] && [ "$FORCE" = false ]; then
    log "origin/$BRANCH is $REMOTE_SHA, which failed its health gate and was rolled back."
    log "Not redeploying it. Push a fix, or rerun with --force."
    exit 0
fi

log "New commits: $LOCAL_SHA -> $REMOTE_SHA"
git pull origin "$BRANCH" --ff-only || die "git pull failed — manual intervention needed (merge conflict?)"

NEW_SHA=$(git rev-parse --short HEAD)
log "Pulled successfully. Now at $NEW_SHA"

# ── Readiness probes ────────────────────────────────────────
# The container's own HEALTHCHECK is the readiness probe (Dockerfile): it consumes the
# startup stream and only succeeds on a `ready` event, so it fails for a gateway that is
# listening but hung. This script is what consumes that verdict.
container_health() {
    docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
        "$GATEWAY_CONTAINER" 2>/dev/null || echo "absent"
}

# The startup stream, read for the log line. It is Server-Sent Events: --max-time bounds a
# read that would otherwise block until the server is ready (which is exactly the case that
# used to hang the deploy forever, holding the lock), and the phase is taken from the LAST
# event received, not the first.
stream_phase() {
    local body phase
    body=$(curl -sf --max-time "$HEALTH_PROBE_TIMEOUT" "$HEALTH_URL" 2>/dev/null || true)
    phase=$(printf '%s' "$body" | grep -o '"phase":"[^"]*"' | tail -1 | cut -d'"' -f4 || true)
    printf '%s' "${phase:-unreachable}"
}

# ── Remember the rollback point ─────────────────────────────
# `docker compose up` replaces the running container, so the image it was running has to be
# pinned under a tag of its own BEFORE the build — otherwise the rebuild takes the tag, the
# old image goes dangling, and the prune at the end removes the only way back.
PREV_IMAGE_ID=""
PREV_IMAGE_REF=""
if docker inspect --format '{{.Image}}' "$GATEWAY_CONTAINER" >/dev/null 2>&1; then
    PREV_IMAGE_ID=$(docker inspect --format '{{.Image}}' "$GATEWAY_CONTAINER")
    PREV_IMAGE_REF=$(docker inspect --format '{{.Config.Image}}' "$GATEWAY_CONTAINER")
    docker tag "$PREV_IMAGE_ID" "$ROLLBACK_TAG"
    log "Rollback point: $PREV_IMAGE_REF -> $ROLLBACK_TAG"
else
    log "WARNING: no running $GATEWAY_CONTAINER — this deploy has no rollback point."
fi

DEPLOY_STARTED=false

rollback() {
    if [ -z "$PREV_IMAGE_REF" ]; then
        log "ERROR: no rollback point was recorded — the previous deployment cannot be restored."
        return 1
    fi
    log "Rolling back to the previous image ($ROLLBACK_TAG -> $PREV_IMAGE_REF)..."
    # The checkout goes back first, so `docker compose up` reads the compose file that
    # belongs to the image being restored.
    git reset --hard "$LOCAL_SHA" >/dev/null 2>&1 || log "WARNING: could not reset the checkout to $LOCAL_SHA"
    docker tag "$ROLLBACK_TAG" "$PREV_IMAGE_REF" || return 1
    timeout "$STEP_TIMEOUT" docker compose up -d --force-recreate --no-build "$GATEWAY_SERVICE" || return 1
    log "Rollback complete — $PREV_IMAGE_REF is serving again ($LOCAL_SHA)."
    return 0
}

# Every failure path lands here: record the bad commit, restore the previous deployment if
# this run replaced it, prune nothing, exit non-zero. It never returns.
fail_deploy() {
    log "DEPLOY FAILED: $1"
    printf '%s\n' "$REMOTE_SHA" > "$FAILED_SHA_FILE"
    if [ "$DEPLOY_STARTED" = true ]; then
        rollback || log "ERROR: rollback failed — the site may be down. MANUAL INTERVENTION REQUIRED."
    else
        log "Containers were never replaced — the previous deployment is still serving."
        git reset --hard "$LOCAL_SHA" >/dev/null 2>&1 || log "WARNING: could not reset the checkout to $LOCAL_SHA"
    fi
    log "Not pruning images — the previous image must stay reachable."
    log "========== Deploy FAILED ($REMOTE_SHA) =========="
    exit 1
}

# ── Build ───────────────────────────────────────────────────
log "Building Docker images..."
if ! DOCKER_BUILDKIT=1 timeout "$STEP_TIMEOUT" docker compose build --parallel 2>&1 | tail -5; then
    fail_deploy "docker compose build failed"
fi
log "Build complete."

# ── Deploy ──────────────────────────────────────────────────
log "Starting containers..."
DEPLOY_STARTED=true
if ! timeout "$STEP_TIMEOUT" docker compose up -d --remove-orphans 2>&1; then
    fail_deploy "docker compose up failed"
fi

# ── Health gate ─────────────────────────────────────────────
log "Waiting for the health gate (timeout: ${HEALTH_TIMEOUT}s)..."
ELAPSED=0
HEALTHY=false
GATE_REASON="no healthy container within ${HEALTH_TIMEOUT}s"

while [ "$ELAPSED" -lt "$HEALTH_TIMEOUT" ]; do
    HEALTH_STATE=$(container_health)
    PHASE=$(stream_phase)

    if [ "$HEALTH_STATE" = "healthy" ]; then
        HEALTHY=true
        break
    fi
    if [ "$HEALTH_STATE" = "unhealthy" ]; then
        GATE_REASON="the container reported itself unhealthy"
        break
    fi
    if [ "$HEALTH_STATE" = "absent" ]; then
        GATE_REASON="the $GATEWAY_CONTAINER container is gone"
        break
    fi
    # No HEALTHCHECK in the image (older build, or a compose override): fall back to the
    # readiness stream, which is the same signal the healthcheck reads.
    if [ "$HEALTH_STATE" = "none" ] && [ "$PHASE" = "ready" ]; then
        HEALTHY=true
        break
    fi

    log "  Health: container=$HEALTH_STATE phase=$PHASE (${ELAPSED}s elapsed)"
    sleep "$HEALTH_INTERVAL"
    ELAPSED=$((ELAPSED + HEALTH_INTERVAL))
done

if [ "$HEALTHY" = true ]; then
    log "Health gate PASSED — container=$HEALTH_STATE phase=$PHASE (${ELAPSED}s)"
    rm -f "$FAILED_SHA_FILE"
else
    log "Health gate FAILED after ${ELAPSED}s — $GATE_REASON"
    log "Container status:"
    docker compose ps || true
    log "Recent logs:"
    docker compose logs --tail=20 || true
    fail_deploy "$GATE_REASON"
fi

# ── Cleanup ─────────────────────────────────────────────────
# Only ever reached on a passed gate: a failed one exits above, before this line.
if [ "$PRUNE" = true ]; then
    log "Pruning dangling images..."
    docker image prune -f --filter "until=24h" 2>&1 | tail -1
fi

# ── Summary ─────────────────────────────────────────────────
log "========== Deploy Complete =========="
log "  Commit:  $NEW_SHA"
log "  Branch:  $BRANCH"
log "  Healthy: $HEALTHY"
log "  Containers:"
docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || docker compose ps
log "======================================="
