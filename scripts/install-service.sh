#!/usr/bin/env bash
# Run the whole stack (scripts/up.mjs) as a systemd USER service, so the site
# comes back by itself after a reboot or a crash — no terminal left open.
#
#   npm run service:install     install + enable + start
#   systemctl --user status dwcode
#   journalctl --user -u dwcode -f          (also .run/logs/<component>.log)
#   systemctl --user restart dwcode         (after pulling changes: rebuilds what changed)
#   systemctl --user disable --now dwcode   (uninstall)
#
# Needs "linger" so user services run without a login session. If
# `loginctl show-user $USER -p Linger` says no, run once: sudo loginctl enable-linger $USER
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
UNIT="$HOME/.config/systemd/user/dwcode.service"
mkdir -p "$(dirname "$UNIT")"

cat > "$UNIT" <<UNIT
# DWCode: redis + compiler + server + site + Cloudflare tunnel, via scripts/up.mjs.
# Installed by $ROOT/scripts/install-service.sh. Logs: journalctl --user -u dwcode, and .run/logs/
[Unit]
Description=DWCode stack (dwl.bighnesh.space)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT
Environment=PATH=$(dirname "$NODE"):$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE scripts/up.mjs
# The launcher shuts every process down in order on SIGINT (like Ctrl-C).
KillSignal=SIGINT
TimeoutStopSec=90
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now dwcode.service
[ "$(loginctl show-user "$USER" -p Linger --value)" = yes ] || echo "⚠ linger is off: the stack only runs while you are logged in. Fix: sudo loginctl enable-linger $USER"
echo "✓ dwcode service installed. Status: systemctl --user status dwcode"
