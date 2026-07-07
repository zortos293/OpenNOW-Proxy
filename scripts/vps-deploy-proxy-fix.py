#!/usr/bin/env python3
import os
import sys
from pathlib import Path

import paramiko

PASSWORD = os.environ.get("VPS_PASSWORD", "")
if not PASSWORD:
    sys.exit("Set VPS_PASSWORD")

ROOT = Path(__file__).resolve().parents[1]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("217.76.50.166", username="root", password=PASSWORD, timeout=30)

sftp = client.open_sftp()
for rel in ("proxy/3proxy.cfg.template", "proxy/entrypoint.sh", "proxy/Dockerfile"):
    local = ROOT / rel
    remote = f"/opt/OpenNOW-Proxy/{rel}"
    sftp.put(str(local), remote)
sftp.close()

REMOTE = r"""#!/bin/bash
set -euo pipefail
cd /opt/OpenNOW-Proxy
sed -i 's/\r$//' proxy/entrypoint.sh proxy/3proxy.cfg.template
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build proxy
sleep 4

CLIENT_ID=00000000-0000-4000-8000-00000000bb02
PROVISION=$(curl -fsS -X POST http://127.0.0.1:3010/api/public/proxy \
  -H 'Content-Type: application/json' \
  --data-raw "{\"clientId\":\"$CLIENT_ID\"}")
echo "provision=$PROVISION"
USER=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["username"])' "$PROVISION")
PASS=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["password"])' "$PROVISION")
sleep 3
CODE=$(curl -sS -o /dev/null -w '%{http_code}' -x "http://${USER}:${PASS}@127.0.0.1:3128" https://prod.cloudmatchbeta.nvidiagrid.net/v2/serverInfo)
echo "new user without manual restart -> $CODE"
"""

_, stdout, stderr = client.exec_command(REMOTE, timeout=300)
print(stdout.read().decode())
err = stderr.read().decode()
if err.strip():
    print("ERR:", err, file=sys.stderr)
client.close()
