#!/usr/bin/env bash
# One-time Cloudflare Tunnel setup for https://dwl.business.space → this machine.
#
#   npm run tunnel:setup
#
# Step 1 opens a browser to sign in to Cloudflare and pick the business.space
# zone — that step is yours; nothing here can or should do it for you. The rest
# is idempotent: re-running reuses the tunnel and leaves an existing DNS record.
# Afterwards `npm run up` starts the tunnel with the rest of the stack.
set -euo pipefail

HOSTNAME="${DWC_HOSTNAME:-dwl.business.space}"
TUNNEL="${DWC_TUNNEL:-dwcode}"
DIR="$HOME/.cloudflared"
CONFIG="$DIR/dwcode.yml"

command -v cloudflared >/dev/null || { echo "cloudflared is not installed"; exit 1; }
mkdir -p "$DIR"

if [ ! -f "$DIR/cert.pem" ]; then
  echo "→ Sign in to Cloudflare in the browser that opens, and choose the business.space zone."
  cloudflared tunnel login
fi

if ! cloudflared tunnel list --output json | grep -q "\"name\":\"$TUNNEL\""; then
  echo "→ Creating tunnel $TUNNEL"
  cloudflared tunnel create "$TUNNEL"
fi
ID=$(cloudflared tunnel list --output json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).find(t=>t.name===process.argv[1]);process.stdout.write(t?t.id:"")})' "$TUNNEL")
[ -n "$ID" ] || { echo "could not find tunnel id for $TUNNEL"; exit 1; }

echo "→ Routing $HOSTNAME to tunnel $TUNNEL"
cloudflared tunnel route dns "$TUNNEL" "$HOSTNAME" || echo "  (DNS record already exists — left as is; check it points at $ID.cfargotunnel.com)"

cat > "$CONFIG" <<YAML
# Written by scripts/tunnel-setup.sh. One public hostname → the Next.js site.
# The API is reached through the site's /backend proxy, never directly.
tunnel: $ID
credentials-file: $DIR/$ID.json
ingress:
  - hostname: $HOSTNAME
    service: http://localhost:8000
    originRequest:
      connectTimeout: 10s
  - service: http_status:404
YAML
cloudflared tunnel --config "$CONFIG" ingress validate
echo "✓ Tunnel configured: $CONFIG"
echo "  Start everything with: npm run up"
