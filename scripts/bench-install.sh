#!/usr/bin/env bash
# One-time install of the bench worker as a systemd --user service.
#
# Run it FROM the checkout that should host the worker (normally the main clone,
# ~/SPO-WebClient, on main). Re-run it after pulling worker changes: it rebuilds and
# restarts. Supervision model: systemd restarts a dead worker (Restart=always); the
# heartbeat file exposes a wedged one to submitters at deposit time.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/spo-bench-worker.service"

echo "== building the worker in $REPO"
(cd "$REPO" && npm run build:e2e)

echo "== writing $UNIT"
mkdir -p "$UNIT_DIR"
cat > "$UNIT" <<UNITEOF
[Unit]
Description=SPO live test bench worker (sole owner of port 8080, SPO_test3 and Helartia)

[Service]
WorkingDirectory=$REPO
ExecStart=/usr/bin/node dist/e2e/bench/worker.js
Restart=always
RestartSec=2
# gh must find its auth; PATH must reach node and npm.
Environment=HOME=$HOME

[Install]
WantedBy=default.target
UNITEOF

systemctl --user daemon-reload
systemctl --user enable --now spo-bench-worker.service
systemctl --user restart spo-bench-worker.service

# Without linger the whole --user manager dies with the last login session, taking the
# worker with it. This may prompt for sudo on some setups; if it fails, run it by hand.
if ! loginctl enable-linger "$USER" 2>/dev/null; then
  echo "!! could not enable linger — run manually:  sudo loginctl enable-linger $USER" >&2
fi

sleep 2
systemctl --user --no-pager --lines=5 status spo-bench-worker.service || true
bash "$REPO/scripts/bench-status.sh" || true
