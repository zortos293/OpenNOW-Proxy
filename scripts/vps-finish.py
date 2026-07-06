#!/usr/bin/env python3
import os
import sys

import paramiko

HOST = "217.76.50.166"
USER = "root"
PASSWORD = os.environ.get("VPS_PASSWORD", "")

PORTAL = "opennow-proxy.zortos.me"
PROXY_TCP = "opennow-proxy-tcp.zortos.me"


def run(client, cmd: str) -> int:
    print(f"\n>>> {cmd[:100]}")
    _, stdout, stderr = client.exec_command(cmd, timeout=900)
    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    return code


def main() -> None:
    if not PASSWORD:
        sys.exit("Set VPS_PASSWORD")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    script = f"""
set -euo pipefail
cd /opt/OpenNOW-Proxy
git pull

# Ensure complete .env
if ! grep -q '^PORTAL_PUBLIC_URL=' .env; then echo 'PORTAL_PUBLIC_URL=https://{PORTAL}' >> .env; fi
if ! grep -q '^PROXY_PUBLIC_HOST=' .env; then echo 'PROXY_PUBLIC_HOST={PROXY_TCP}' >> .env; fi
if ! grep -q '^PORTAL_SESSION_SECRET=' .env; then echo "PORTAL_SESSION_SECRET=$(openssl rand -hex 32)" >> .env; fi
sed -i 's|^PORTAL_PUBLIC_URL=.*|PORTAL_PUBLIC_URL=https://{PORTAL}|' .env
sed -i 's|^PROXY_PUBLIC_HOST=.*|PROXY_PUBLIC_HOST={PROXY_TCP}|' .env
sed -i 's|^PROXY_PORT=.*|PROXY_PORT=443|' .env
chmod 600 .env

cat > docker-compose.vps.yml <<'YAML'
services:
  portal:
    ports:
      - "127.0.0.1:3010:3000"
  proxy:
    ports:
      - "127.0.0.1:3128:3128"
  caddy:
    profiles:
      - disabled
YAML

docker compose -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.vps.yml up -d --build
sleep 3
curl -fsS http://127.0.0.1:3010/health
echo
docker compose -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.vps.yml ps
systemctl restart cloudflared 2>/dev/null || true
grep -E '^(ADMIN_USERNAME|ADMIN_PASSWORD|PORTAL_PUBLIC|PROXY_PUBLIC)=' .env
"""

    code = run(client, script)
    if code != 0:
        sys.exit(code)

    print("\n=== READY ===")
    print(f"Admin:  https://{PORTAL}/admin")
    print(f"Proxy:  {PROXY_TCP}:443 (via Cloudflare TCP tunnel)")
    print("Login credentials are in /opt/OpenNOW-Proxy/.env on the VPS.")
    print("\nAdd DNS in Cloudflare for opennow-proxy.zortos.me and opennow-proxy-tcp.zortos.me if not already routed to your tunnel.")
    client.close()


if __name__ == "__main__":
    main()
