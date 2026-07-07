#!/usr/bin/env python3
"""Finish community proxy setup: cloudflared portal-only, IP-based proxy URLs, smoke tests."""
import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_PASSWORD", "")
if not PASSWORD:
    sys.exit("Set VPS_PASSWORD")

VPS_IP = os.environ.get("VPS_IP", "217.76.50.166")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REMOTE = r"""#!/bin/bash
set -euo pipefail

cat > /etc/cloudflared/config.yml <<'EOF'
tunnel: e07cb8dd-ec4a-4607-8cc9-b0323254c4dc
credentials-file: /root/.cloudflared/e07cb8dd-ec4a-4607-8cc9-b0323254c4dc.json

ingress:
  - hostname: znow.zortos.me
    service: http://localhost:9010
  - hostname: opennow-proxy.zortos.me
    service: http://127.0.0.1:3010
  - service: http_status:404
EOF
cp /etc/cloudflared/config.yml /root/.cloudflared/config.yml

cd /opt/OpenNOW-Proxy
if grep -q '^PROXY_PUBLIC_HOST=' .env; then
  sed -i 's|^PROXY_PUBLIC_HOST=.*|PROXY_PUBLIC_HOST=217.76.50.166|' .env
else
  echo 'PROXY_PUBLIC_HOST=217.76.50.166' >> .env
fi
if grep -q '^PROXY_PORT=' .env; then
  sed -i 's|^PROXY_PORT=.*|PROXY_PORT=3128|' .env
else
  echo 'PROXY_PORT=3128' >> .env
fi
if ! grep -q '^CLIENT_PROVISION_ENABLED=' .env; then
  echo 'CLIENT_PROVISION_ENABLED=true' >> .env
fi

docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build portal proxy
systemctl restart cloudflared
sleep 5

echo '=== .env ==='
grep -E '^(PROXY_PUBLIC_HOST|PROXY_PORT|PORTAL_PUBLIC_URL)=' .env

echo '=== health ==='
curl -fsS http://127.0.0.1:3010/health; echo

echo '=== provision ==='
curl -fsS -X POST http://127.0.0.1:3010/api/public/proxy \
  -H 'Content-Type: application/json' \
  --data-raw '{"clientId":"00000000-0000-4000-8000-000000000099"}'; echo

echo '=== public provision ==='
curl -fsS -X POST https://opennow-proxy.zortos.me/api/public/proxy \
  -H 'Content-Type: application/json' \
  --data-raw '{"clientId":"00000000-0000-4000-8000-000000000099"}'; echo

echo '=== cloudflared ==='
systemctl is-active cloudflared

echo '=== listeners ==='
ss -tlnp | awk '/3010|3128/'
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(VPS_IP, username="root", password=PASSWORD, timeout=30)
_, stdout, stderr = client.exec_command(REMOTE, timeout=600)
print(stdout.read().decode())
err = stderr.read().decode()
if err.strip():
    print("ERR:", err, file=sys.stderr)
code = stdout.channel.recv_exit_status()
client.close()
sys.exit(code)
