# Cloudflared Deployment Guide

Use this when the **admin panel** is exposed through Cloudflare Tunnel. See also [DEPLOY.md](./DEPLOY.md).

Cloudflare Tunnel can proxy **HTTP/HTTPS** hostnames to local services. It **cannot** expose a standard HTTP forward proxy on a public hostname — TCP tunnel routes require `cloudflared access tcp` on every client machine. For OpenNOW, expose the proxy directly on VPS port **3128** and only tunnel the admin panel.

## `.env` (example)

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-admin-password
PORTAL_SESSION_SECRET=...

PORTAL_PUBLIC_URL=https://opennow-proxy.yourdomain.com
PROXY_PUBLIC_HOST=opennow-proxy-tcp.yourdomain.com
PROXY_PORT=3128

CLOUDFLARE_TUNNEL_TOKEN=eyJh...
```

## Recommended: admin on tunnel, proxy direct

**1. Start proxy + portal on the VPS:**

```bash
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build
```

This binds the portal to `127.0.0.1:3010` and the proxy to `0.0.0.0:3128`.

**2. Tunnel ingress (admin only):**

```yaml
ingress:
  - hostname: opennow-proxy.yourdomain.com
    service: http://127.0.0.1:3010
  - service: http_status:404
```

Or configure the same hostname in Zero Trust → Tunnels → Public Hostname (HTTP → `http://127.0.0.1:3010`).

**3. DNS for the proxy hostname (not via tunnel):**

- Add **A** record: `opennow-proxy-tcp.yourdomain.com` → your VPS IP
- Set proxy status to **DNS only** (gray cloud)
- Open firewall port `3128/tcp` on the VPS

**4. Restart cloudflared** (if using a local config file; token-managed tunnels pick up dashboard changes automatically):

```bash
systemctl restart cloudflared
```

**5. Admin panel:** `https://opennow-proxy.yourdomain.com/admin`

**6. OpenNOW URL format:**

```text
http://user:pass@opennow-proxy-tcp.yourdomain.com:3128
```

## Local dev / bind to localhost only

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Use this when cloudflared on the host forwards to `127.0.0.1:3010` and the proxy is exposed separately.

## Docker cloudflared

```bash
docker compose -f docker-compose.yml -f docker-compose.cloudflared.yml up -d --build
```

Tunnel only the admin panel hostname. Do not route the proxy through Cloudflare TCP.

## Direct IP (no DNS for proxy)

```env
PROXY_PUBLIC_HOST=YOUR_VPS_IP
PROXY_PORT=3128
```

Only tunnel the admin panel hostname to `http://127.0.0.1:3010`. Open port 3128 on the VPS.
