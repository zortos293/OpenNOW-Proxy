# VPS Deployment Guide

Deploy OpenNOW-Proxy on a Linux VPS with **Docker Compose**.

## Prerequisites

- Ubuntu/Debian VPS with Docker + Docker Compose
- Domain (optional if using cloudflared for the admin panel)
- Ports **443** + **3128** open (or use [DEPLOY-CLOUDFLARED.md](./DEPLOY-CLOUDFLARED.md))

## 1. Clone and configure

```bash
cd /opt
git clone https://github.com/zortos293/OpenNOW-Proxy.git
cd OpenNOW-Proxy
cp .env.example .env
nano .env
```

Required `.env` values:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-admin-password
PORTAL_SESSION_SECRET=   # openssl rand -hex 32

PORTAL_PUBLIC_URL=https://opennow-proxy.yourdomain.com
PROXY_PUBLIC_HOST=opennow-proxy.yourdomain.com
PROXY_PORT=3128

CADDY_DOMAIN=opennow-proxy.yourdomain.com
CADDY_EMAIL=you@example.com
```

## 2. Start

```bash
docker compose up -d --build
```

## 3. Create proxy users

1. Open `https://opennow-proxy.yourdomain.com/admin`
2. Log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`
3. Create a username and fixed password
4. Copy the OpenNOW URL from the table

## 4. OpenNOW client

OpenNOW → **Settings → Video → Session proxy** → enable → paste URL.

## 5. Smoke test

```bash
node scripts/smoke-test.mjs \
  --host opennow-proxy.yourdomain.com \
  --port 3128 \
  --user YOUR_PROXY_USER \
  --pass YOUR_PROXY_PASS
```

## Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3128/tcp
sudo ufw enable
```

## Update

```bash
git pull
docker compose up -d --build
```

See [E2E.md](./E2E.md) for the full OpenNOW checklist.
