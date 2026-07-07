#!/usr/bin/env python3
import os
import sys

import paramiko

PASSWORD = os.environ.get("VPS_PASSWORD", "")
if not PASSWORD:
    sys.exit("Set VPS_PASSWORD")

REMOTE = r"""#!/bin/bash
set -u
CLIENT_ID="00000000-0000-4000-8000-00000000ff"
PROVISION=$(curl -fsS -X POST http://127.0.0.1:3010/api/public/proxy \
  -H 'Content-Type: application/json' \
  --data-raw "{\"clientId\":\"$CLIENT_ID\"}")
echo "provision=$PROVISION"
USER=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["username"])' "$PROVISION")
PASS=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["password"])' "$PROVISION")
echo "user=$USER pass=$PASS"

echo '=== host passwd file ==='
grep "$USER" /opt/OpenNOW-Proxy/data/3proxy.passwd || echo 'missing on host'

echo '=== proxy container passwd file ==='
docker exec opennow-proxy-proxy-1 cat /data/3proxy.passwd | grep "$USER" || echo 'missing in container'

echo '=== portal container passwd file ==='
docker exec opennow-proxy-portal-1 cat /data/3proxy.passwd | grep "$USER" || echo 'missing in portal container'

echo '=== local curl via 127.0.0.1 ==='
CODE=$(curl -sS -o /dev/null -w '%{http_code}' -x "http://${USER}:${PASS}@127.0.0.1:3128" https://prod.cloudmatchbeta.nvidiagrid.net/v2/serverInfo || echo err)
echo "curl 127.0.0.1 -> $CODE"

echo '=== local curl via public IP ==='
CODE2=$(curl -sS -o /dev/null -w '%{http_code}' -x "http://${USER}:${PASS}@217.76.50.166:3128" https://prod.cloudmatchbeta.nvidiagrid.net/v2/serverInfo || echo err)
echo "curl public IP -> $CODE2"

echo '=== proxy logs ==='
docker logs opennow-proxy-proxy-1 --tail 15 2>&1

echo '=== 3proxy config inside container ==='
docker exec opennow-proxy-proxy-1 cat /etc/3proxy/3proxy.cfg
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("217.76.50.166", username="root", password=PASSWORD, timeout=30)
_, stdout, stderr = client.exec_command(REMOTE, timeout=120)
print(stdout.read().decode())
err = stderr.read().decode()
if err.strip():
    print("ERR:", err, file=sys.stderr)
client.close()
