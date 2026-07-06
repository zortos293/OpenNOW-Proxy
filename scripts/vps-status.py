#!/usr/bin/env python3
import os
import sys

import paramiko

HOST = "217.76.50.166"
USER = "root"
PASSWORD = os.environ.get("VPS_PASSWORD", "")


def main() -> None:
    if not PASSWORD:
        sys.exit("Set VPS_PASSWORD")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    script = r"""
cd /opt/OpenNOW-Proxy 2>/dev/null || { echo MISSING_REPO; exit 0; }
echo '--- docker ---'
docker compose -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.vps.yml ps 2>&1
echo '--- health ---'
curl -s http://127.0.0.1:3010/health || echo portal-down
echo
echo '--- ports ---'
ss -tlnp | awk '/3010|3128/'
echo '--- env ---'
grep -E '^(ADMIN_USERNAME|PORTAL_PUBLIC|PROXY_PUBLIC|PROXY_PORT)=' .env 2>/dev/null || echo no-env
echo '--- cloudflared ---'
cat /etc/cloudflared/config.yml
"""
    _, stdout, stderr = client.exec_command(script, timeout=120)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err.strip():
        print(err, file=sys.stderr)
    client.close()


if __name__ == "__main__":
    main()
