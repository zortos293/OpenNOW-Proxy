#!/usr/bin/env python3
import os
import sys
import paramiko

PASSWORD = os.environ.get("VPS_PASSWORD", "")
if not PASSWORD:
    sys.exit("Set VPS_PASSWORD")

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("217.76.50.166", username="root", password=PASSWORD, timeout=30)

REMOTE = """#!/bin/bash
set -euo pipefail
cd /opt/OpenNOW-Proxy
git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.local.yml down 2>/dev/null || true
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build
sleep 3
docker ps --filter name=opennow --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
curl -fsS http://127.0.0.1:3010/health; echo
curl -sS -o /dev/null -w 'provision %{http_code}\\n' -X POST http://127.0.0.1:3010/api/public/proxy -H 'Content-Type: application/json' --data-raw '{"clientId":"00000000-0000-4000-8000-000000000001"}' || true
curl -sS -o /dev/null -w 'proxy no-auth %{http_code}\\n' -x http://127.0.0.1:3128 http://example.com || true
ss -tlnp | awk '/3010|3128/'
"""

_, stdout, stderr = client.exec_command(REMOTE, timeout=300)
print(stdout.read().decode())
err = stderr.read().decode()
if err.strip():
    print("ERR:", err)
client.close()
