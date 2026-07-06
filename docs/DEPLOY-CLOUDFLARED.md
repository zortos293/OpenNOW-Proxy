# Cloudflared Deployment Guide

Use this when your VPS runs **Cloudflare Tunnel** (`cloudflared`) instead of exposing ports 443/80 with Caddy.

Repo: https://github.com/zortos293/OpenNOW-Proxy

## Overview

| Traffic | How it reaches the VPS | Public URL |
|---|---|---|
| Sponsor portal (HTTPS) | Cloudflared → `http://127.0.0.1:3000` | `https://YOUR_PORTAL_HOST` |
| OpenNOW forward proxy (CONNECT) | Cloudflared TCP **or** direct VPS port | `YOUR_PROXY_HOST:PORT` |

You do **not** need Caddy or open ports 443/80 on the VPS when the portal is tunneled.

The forward proxy still needs either:

1. **TCP route in Cloudflare Tunnel** (recommended if you want zero open inbound ports), or  
2. **Direct VPS port 3128** (simplest; portal stays on cloudflared only)

## Option A — Portal on tunnel, proxy on open port 3128 (simplest)

Good if you already use cloudflared and can open one TCP port.

### 1. `.env`

```env
PORTAL_PUBLIC_URL=https://opennow-proxy.yourdomain.com
PROXY_PUBLIC_HOST=YOUR_VPS_PUBLIC_IP
PROXY_PORT=3128
CLOUDFLARE_TUNNEL_TOKEN=eyJh...
```

Use your **VPS public IP** (or a DNS A record like `proxy-tcp.yourdomain.com`) for `PROXY_PUBLIC_HOST` so OpenNOW clients connect directly to 3proxy.

OpenNOW proxy URL example:

```text
http://sponsor_123:password@YOUR_VPS_IP:3128
```

### 2. Start without Caddy

```bash
docker compose -f docker-compose.yml -f docker-compose.cloudflared.yml up -d --build
```

This binds portal and proxy to **localhost only** (`127.0.0.1`) and starts `cloudflared`.

### 3. Cloudflare Zero Trust — portal hostname

In [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels** → your tunnel → **Public Hostname**:

| Field | Value |
|---|---|
| Subdomain | `opennow-proxy` (or your choice) |
| Domain | your domain |
| Service type | HTTP |
| URL | `http://127.0.0.1:3000` |

Because `cloudflared` uses `network_mode: host`, it reaches the published localhost ports.

### 4. Firewall

Only SSH + proxy port need to be open:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 3128/tcp
sudo ufw enable
```

No need to open 443/80.

### 5. GitHub OAuth App

- Homepage: `https://opennow-proxy.yourdomain.com`
- Callback: `https://opennow-proxy.yourdomain.com/auth/callback`

---

## Option B — Portal and proxy both via Cloudflare Tunnel

Use this if you want **no inbound ports** except SSH.

### 1. Two public hostnames in Zero Trust

**Portal (HTTP)**

| Field | Value |
|---|---|
| Hostname | `opennow-proxy.yourdomain.com` |
| Service | HTTP → `http://127.0.0.1:3000` |

**Proxy (TCP)**

| Field | Value |
|---|---|
| Hostname | `opennow-proxy-tcp.yourdomain.com` |
| Service | TCP → `tcp://127.0.0.1:3128` |

Cloudflare exposes TCP applications on port **443** at the edge. Clients connect to hostname port 443, not 3128.

### 2. `.env`

```env
PORTAL_PUBLIC_URL=https://opennow-proxy.yourdomain.com
PROXY_PUBLIC_HOST=opennow-proxy-tcp.yourdomain.com
PROXY_PORT=443
CLOUDFLARE_TUNNEL_TOKEN=eyJh...
```

OpenNOW proxy URL example:

```text
http://sponsor_123:password@opennow-proxy-tcp.yourdomain.com:443
```

### 3. Start stack

```bash
docker compose -f docker-compose.yml -f docker-compose.cloudflared.yml up -d --build
```

### 4. Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw enable
```

---

## Option C — cloudflared already running on the host (not in Docker)

If you already manage `cloudflared` with PM2/systemd:

### 1. Start app stack only (no Caddy, no cloudflared container)

Publish portal and proxy on localhost:

```bash
docker compose up -d --build proxy portal
```

Temporarily expose ports in a local override or run:

```yaml
# docker-compose.local.yml
services:
  portal:
    ports:
      - "127.0.0.1:3000:3000"
  proxy:
    ports:
      - "127.0.0.1:3128:3128"
  caddy:
    profiles:
      - disabled
```

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

### 2. Point your existing tunnel

Add ingress routes to your host `cloudflared` config:

```yaml
ingress:
  - hostname: opennow-proxy.yourdomain.com
    service: http://127.0.0.1:3000
  - hostname: opennow-proxy-tcp.yourdomain.com
    service: tcp://127.0.0.1:3128
  - service: http_status:404
```

Restart cloudflared (PM2 example):

```bash
pm2 restart cloudflared
```

---

## Environment variables

Add to `.env`:

```env
CLOUDFLARE_TUNNEL_TOKEN=
```

Create the token: Zero Trust → Tunnels → your tunnel → **Configure** → copy the `docker run` token or create an install token.

Other variables are unchanged — see [DEPLOY.md](./DEPLOY.md).

## Verify

Portal:

```bash
curl -fsS https://opennow-proxy.yourdomain.com/health
```

Proxy (Option A — direct port):

```bash
node scripts/smoke-test.mjs --host YOUR_VPS_IP --port 3128 --user ... --pass ...
```

Proxy (Option B — TCP via Cloudflare):

```bash
node scripts/smoke-test.mjs --host opennow-proxy-tcp.yourdomain.com --port 443 --user ... --pass ...
```

## Troubleshooting

| Issue | Fix |
|---|---|
| Portal 502 | Tunnel service URL must be `http://127.0.0.1:3000`; check `docker compose ps` and portal logs |
| OAuth redirect mismatch | `PORTAL_PUBLIC_URL` must exactly match the Cloudflare hostname (with `https://`) |
| Proxy timeout via tunnel | Confirm TCP public hostname points to `tcp://127.0.0.1:3128`; set `PROXY_PORT=443` |
| `cloudflared` can't reach portal | Use `network_mode: host` for cloudflared container, or publish ports on `127.0.0.1` |
| Caddy still starting | Use `-f docker-compose.cloudflared.yml` so Caddy profile is disabled |

## PM2 + cloudflared

If cloudflared runs under PM2 on the host, use **Option C** — do not start the `cloudflared` service from Docker. Only run `proxy` + `portal` containers and add ingress to your existing tunnel config.
