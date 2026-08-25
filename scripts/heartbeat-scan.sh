#!/usr/bin/env bash
# npm run board:sessions — which session reservations are still live.
#
# WHY. A card's ground reservation (§ One session per area) is live while the session standing
# on its branch is still working — and that is read from the HEARTBEAT, not from the board
# clock: a session may work for hours without touching its card. `.claude/hooks/session-
# heartbeat.sh` stamps ~/.spo-bench/sessions/<key>.alive on every hook, writing the worktree's
# path INSIDE the file; the mtime is the last sign of life.
#
# Output, one line per heartbeat: `<branch>\t<age> min\t<LIVE|EXPIRED>`.
# LIVE means younger than SPO_WORKTREE_IDLE_MIN (default 120) — the verdict is computed here
# so the caller never has to do the arithmetic.
#
#   bash scripts/heartbeat-scan.sh
set -euo pipefail

store="${SPO_SESSION_DIR:-$HOME/.spo-bench/sessions}"
idle_min="${SPO_WORKTREE_IDLE_MIN:-120}"
now=$(date +%s)

shopt -s nullglob
files=("$store"/*.alive)
shopt -u nullglob

if [ ${#files[@]} -eq 0 ]; then
  echo "no heartbeats in $store"
  exit 0
fi

for f in "${files[@]}"; do
  # The worktree path is the file's content — never guessed from its name.
  read -r dir < "$f" || true
  [ -n "${dir:-}" ] && [ -d "$dir" ] || continue

  mtime=$(stat -c %Y "$f")
  age_min=$(( (now - mtime) / 60 ))

  branch=$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null) || branch="(not a repo)"

  if [ "$age_min" -lt "$idle_min" ]; then
    verdict="LIVE"
  else
    verdict="EXPIRED"
  fi

  printf '%s\t%s min\t%s\n' "$branch" "$age_min" "$verdict"
done
