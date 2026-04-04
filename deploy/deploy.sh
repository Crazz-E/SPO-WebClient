#!/usr/bin/env bash
# ============================================================
# SPO-WebClient — Production Deploy Script
# ============================================================
# Usage:   ./deploy/deploy.sh [--force] [--no-prune]
# Cron:    */30 * * * * /opt/spo-webclient/deploy/deploy.sh >> /opt/spo-webclient/logs/deploy.log 2>&1
#
# What it does:
#   1. git fetch + check for new commits (skip if up-to-date, unless --force)
#   2. git pull
#   3. docker compose build (with BuildKit cache)
#   4. docker compose up -d (zero-downtime rolling restart)
#   5. health check (wait for /api/startup-status to return "ready")
#   6. prune dangling images (unless --no-prune)
#   7. log summary
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
HEALTH_URL="http://localhost:8080/api/startup-status"
HEALTH_TIMEOUT=120       # seconds to wait for healthy status
HEALTH_INTERVAL=5        # seconds between health checks
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
LOCK_FILE="/tmp/spo-deploy.lock"

# ── Parse arguments ─────────────────────────────────────────
FORCE=false
PRUNE=true
for arg in "$@"; do
    case "$arg" in
        --force)    FORCE=true ;;
        --no-prune) PRUNE=false ;;
        --help|-h)
            echo "Usage: $0 [--force] [--no-prune]"
            echo "  --force     Deploy even if no new commits"
            echo "  --no-prune  Skip dangling image cleanup"
            exit 0
            ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

# ── Helpers ─────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "ERROR: $*" >&2; cleanup; exit 1; }

cleanup() {
    rm -f "$LOCK_FILE"
}
trap cleanup EXIT

# ── Prevent concurrent runs (cron safety) ───────────────────
if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        log "Another deploy is running (PID $LOCK_PID). Skipping."
        exit 0
    fi
    log "Stale lock file found. Removing."
    rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"

# ── Start ───────────────────────────────────────────────────
log "========== SPO-WebClient Deploy =========="
cd "$PROJECT_DIR"

# ── Pre-flight checks ──────────────────────────────────────
[ -f "$COMPOSE_FILE" ] || die "docker-compose.yml not found in $PROJECT_DIR"
[ -f "$PROJECT_DIR/.env" ] || die ".env file not found — copy deploy/.env.example to .env"
command -v docker >/dev/null 2>&1 || die "docker not found"
docker compose version >/dev/null 2>&1 || die "docker compose plugin not found"

# ── Git pull ────────────────────────────────────────────────
log "Fetching from origin/$BRANCH..."
git fetch origin "$BRANCH" --quiet

LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ] && [ "$FORCE" = false ]; then
    log "Already up-to-date ($LOCAL_SHA). Nothing to deploy."
    exit 0
fi

log "New commits: $LOCAL_SHA -> $REMOTE_SHA"
git pull origin "$BRANCH" --ff-only || die "git pull failed — manual intervention needed (merge conflict?)"

NEW_SHA=$(git rev-parse --short HEAD)
log "Pulled successfully. Now at $NEW_SHA"

# ── Build ───────────────────────────────────────────────────
log "Building Docker images..."
DOCKER_BUILDKIT=1 docker compose build --parallel 2>&1 | tail -5
log "Build complete."

# ── Deploy ──────────────────────────────────────────────────
log "Starting containers..."
docker compose up -d --remove-orphans 2>&1

# ── Health check ────────────────────────────────────────────
log "Waiting for health check (timeout: ${HEALTH_TIMEOUT}s)..."
ELAPSED=0
HEALTHY=false

while [ "$ELAPSED" -lt "$HEALTH_TIMEOUT" ]; do
    STATUS=$(curl -sf "$HEALTH_URL" 2>/dev/null || echo '{"phase":"waiting"}')
    PHASE=$(echo "$STATUS" | grep -o '"phase":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ "$PHASE" = "ready" ]; then
        HEALTHY=true
        break
    fi

    log "  Health: phase=$PHASE (${ELAPSED}s elapsed)"
    sleep "$HEALTH_INTERVAL"
    ELAPSED=$((ELAPSED + HEALTH_INTERVAL))
done

if [ "$HEALTHY" = true ]; then
    log "Health check PASSED — service is ready (${ELAPSED}s)"
else
    log "WARNING: Health check TIMEOUT after ${HEALTH_TIMEOUT}s (phase=$PHASE)"
    log "Container status:"
    docker compose ps
    log "Recent logs:"
    docker compose logs --tail=20
    # Don't exit 1 — the container may still be loading assets on first deploy
    # The Docker HEALTHCHECK + restart policy will handle recovery
fi

# ── Cleanup ─────────────────────────────────────────────────
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
