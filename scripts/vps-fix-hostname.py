#!/usr/bin/env python3
import os
import sys

import paramiko

HOST = os.environ.get("VPS_HOST", "217.76.50.166")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_PASSWORD", "")

PORTAL_HOST = os.environ.get("PORTAL_HOSTNAME", "opennow-proxy.zortos.me")
PROXY_TCP_HOST = os.environ.get("PROXY_TCP_HOSTNAME", "opennow-proxy-tcp.zortos.me")


def run(client: paramiko.SSHClient, cmd: str) -> int:
    print(f"$ {cmd[:200]}...")
    _, stdout, stderr = client.exec_command(cmd, timeout=600)
    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    return code


def update_cloudflared_config(portal: str, proxy_tcp: str) -> str:
    block = (
        f"  - hostname: {portal}\n"
        f"    service: http://127.0.0.1:3010\n"
        f"  - hostname: {proxy_tcp}\n"
        f"    service: tcp://127.0.0.1:3128\n"
    )
    return f"""
from pathlib import Path
portal = {portal!r}
proxy_tcp = {proxy_tcp!r}
block = {block!r}
for path in [Path('/etc/cloudflared/config.yml'), Path('/root/.cloudflared/config.yml')]:
    if not path.exists():
        continue
    text = path.read_text()
    text = text.replace("opennow.zortos.me", portal)
    text = text.replace("opennow-tcp.zortos.me", proxy_tcp)
    if portal not in text:
        text = text.replace('  - service: http_status:404', block + '  - service: http_status:404')
    path.write_text(text)
    print('updated', path)
print(path.read_text())
"""


def main() -> None:
    if not PASSWORD:
        raise SystemExit("Set VPS_PASSWORD")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    py = update_cloudflared_config(PORTAL_HOST, PROXY_TCP_HOST).replace("'", "'\"'\"'")
    cmd = f"""
set -euo pipefail
cd /opt/OpenNOW-Proxy || {{ git clone https://github.com/zortos293/OpenNOW-Proxy.git /opt/OpenNOW-Proxy && cd /opt/OpenNOW-Proxy; }}

if [ ! -f .env ]; then cp .env.example .env; fi
grep -q '^ADMIN_PASSWORD=' .env && true || echo 'ADMIN_PASSWORD=change-me' >> .env
grep -q '^PORTAL_SESSION_SECRET=' .env && true || echo 'PORTAL_SESSION_SECRET=change-me' >> .env
sed -i 's|^PORTAL_PUBLIC_URL=.*|PORTAL_PUBLIC_URL=https://{PORTAL_HOST}|' .env
sed -i 's|^PROXY_PUBLIC_HOST=.*|PROXY_PUBLIC_HOST={PROXY_TCP_HOST}|' .env
sed -i 's|^PROXY_PORT=.*|PROXY_PORT=443|' .env

python3 -c '{update_cloudflared_config(PORTAL_HOST, PROXY_TCP_HOST)}'

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
systemctl restart cloudflared 2>/dev/null || true
sleep 2
curl -fsS http://127.0.0.1:3010/health; echo
docker compose -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.vps.yml ps
"""
    code = run(client, cmd)
    if code != 0:
        raise SystemExit(code)

    print("\n=== Hostnames ===")
    print(f"Admin: https://{PORTAL_HOST}/admin")
    print(f"Proxy: {PROXY_TCP_HOST}:443")
    client.close()


if __name__ == "__main__":
    main()
