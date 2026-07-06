#!/usr/bin/env python3
import os
import secrets
import sys

import paramiko

HOST = "217.76.50.166"
USER = "root"
PASSWORD = os.environ.get("VPS_PASSWORD", "")

PORTAL = "opennow-proxy.zortos.me"
PROXY_TCP = "opennow-proxy-tcp.zortos.me"


def main() -> None:
    if not PASSWORD:
        sys.exit("Set VPS_PASSWORD")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    remote_py = f"""#!/usr/bin/env python3
from pathlib import Path
portal = {PORTAL!r}
proxy_tcp = {PROXY_TCP!r}
block = (
    f"  - hostname: {{portal}}\\n"
    f"    service: http://127.0.0.1:3010\\n"
    f"  - hostname: {{proxy_tcp}}\\n"
    f"    service: tcp://127.0.0.1:3128\\n"
)
for path in [Path('/etc/cloudflared/config.yml'), Path('/root/.cloudflared/config.yml')]:
    if not path.exists():
        continue
    text = path.read_text()
    text = text.replace('opennow.zortos.me', portal)
    text = text.replace('opennow-tcp.zortos.me', proxy_tcp)
    if portal not in text:
        text = text.replace('  - service: http_status:404', block + '  - service: http_status:404')
    path.write_text(text)
    print('updated', path)
"""

    sftp = client.open_sftp()
    with sftp.file("/tmp/opennow-fix.py", "w") as f:
        f.write(remote_py)
    sftp.close()

    admin_pass = secrets.token_urlsafe(16)
    session_secret = secrets.token_hex(32)

    commands = [
        "test -d /opt/OpenNOW-Proxy/.git || git clone https://github.com/zortos293/OpenNOW-Proxy.git /opt/OpenNOW-Proxy",
        "cd /opt/OpenNOW-Proxy && git pull",
        f"""if [ ! -f /opt/OpenNOW-Proxy/.env ]; then cat > /opt/OpenNOW-Proxy/.env << 'EOF'
ADMIN_USERNAME=admin
ADMIN_PASSWORD={admin_pass}
PORTAL_SESSION_SECRET={session_secret}
PORTAL_PUBLIC_URL=https://{PORTAL}
PORTAL_PORT=3000
PROXY_PUBLIC_HOST={PROXY_TCP}
PROXY_PORT=443
DATABASE_PATH=/data/opennow-proxy.json
PROXY_PASSWD_PATH=/data/3proxy.passwd
EOF
chmod 600 /opt/OpenNOW-Proxy/.env
else
sed -i 's|^PORTAL_PUBLIC_URL=.*|PORTAL_PUBLIC_URL=https://{PORTAL}|' /opt/OpenNOW-Proxy/.env
sed -i 's|^PROXY_PUBLIC_HOST=.*|PROXY_PUBLIC_HOST={PROXY_TCP}|' /opt/OpenNOW-Proxy/.env
sed -i 's|^PROXY_PORT=.*|PROXY_PORT=443|' /opt/OpenNOW-Proxy/.env
fi""",
        """cat > /opt/OpenNOW-Proxy/docker-compose.vps.yml << 'EOF'
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
EOF""",
        "python3 /tmp/opennow-fix.py",
        "cd /opt/OpenNOW-Proxy && docker compose -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.vps.yml up -d --build",
        "systemctl restart cloudflared || systemctl restart cloudflared.service || true",
        "sleep 3",
        "curl -fsS http://127.0.0.1:3010/health",
        "cd /opt/OpenNOW-Proxy && docker compose -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.vps.yml ps",
        "cat /etc/cloudflared/config.yml",
    ]

    for cmd in commands:
        print(f"\n>>> {cmd[:120]}...")
        _, stdout, stderr = client.exec_command(cmd, timeout=900)
        out = stdout.read().decode()
        err = stderr.read().decode()
        code = stdout.channel.recv_exit_status()
        if out.strip():
            print(out.rstrip())
        if err.strip():
            print(err.rstrip(), file=sys.stderr)
        if code != 0:
            print(f"FAILED exit {code}")
            client.close()
            sys.exit(code)

    print("\n=== DONE ===")
    print(f"Admin panel: https://{PORTAL}/admin")
    print(f"Proxy host:  {PROXY_TCP}:443")
    print("Admin password is in /opt/OpenNOW-Proxy/.env on the VPS (ADMIN_PASSWORD).")
    print("Create users in admin panel, then use OpenNOW URLs from the table.")
    client.close()


if __name__ == "__main__":
    main()
