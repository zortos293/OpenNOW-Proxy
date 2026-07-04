# VPS Deployment Guide

Deploy OpenNOW-Proxy on a Linux VPS with **Docker Compose**. You do **not** need PM2 for this stack — Docker handles restarts via `restart: unless-stopped`.

## Prerequisites

- Ubuntu/Debian VPS (1 vCPU, 512MB–1GB RAM minimum)
- Docker Engine + Docker Compose plugin installed
- A domain (e.g. `proxy.opennow.example.com`) pointing to the VPS IP
- Ports **443** and **3128** open in your firewall

### Install Docker (if missing)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version
```

### Firewall (ufw example)

```bash
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3128/tcp
sudo ufw enable
```

## 1. Clone the repo

```bash
cd /opt
sudo git clone https://github.com/zortos293/OpenNOW-Proxy.git
sudo chown -R $USER:$USER OpenNOW-Proxy
cd OpenNOW-Proxy
```

## 2. Configure environment

```bash
cp .env.example .env
nano .env
```

Set these values:

| Variable | Example | Notes |
|---|---|---|
| `GITHUB_CLIENT_ID` | `Ov23li...` | From GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | `...` | OAuth App secret |
| `GITHUB_SPONSOR_LOGIN` | `zortos293` | Account users must sponsor |
| `GITHUB_TOKEN` | `ghp_...` | Maintainer PAT with sponsor read access |
| `PORTAL_SESSION_SECRET` | random 64-char string | `openssl rand -hex 32` |
| `PORTAL_PUBLIC_URL` | `https://proxy.opennow.example.com` | Must match your domain |
| `PROXY_PUBLIC_HOST` | `proxy.opennow.example.com` | Hostname only, no scheme |
| `PROXY_PORT` | `3128` | Keep default unless you change compose |
| `CADDY_DOMAIN` | `proxy.opennow.example.com` | Same as portal domain |
| `CADDY_EMAIL` | `you@example.com` | For Let's Encrypt |

Generate a session secret:

```bash
openssl rand -hex 32
```

## 3. Create GitHub OAuth App

1. GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**
2. **Homepage URL:** `https://YOUR_DOMAIN`
3. **Authorization callback URL:** `https://YOUR_DOMAIN/auth/callback`
4. Copy Client ID and generate Client Secret into `.env`

## 4. Create maintainer GitHub token

For the sponsor sync job (revokes lapsed sponsors):

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens**
2. Create a token with **`read:sponsors`** (classic) or equivalent fine-grained access
3. Set as `GITHUB_TOKEN` in `.env`

## 5. Start the stack

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs -f --tail=50
```

Verify health:

```bash
curl -fsS https://YOUR_DOMAIN/health
```

## 6. DNS

Point your domain to the VPS:

```
proxy.opennow.example.com   A   YOUR_VPS_IP
```

Caddy obtains TLS automatically once DNS propagates.

## 7. Test the proxy

After signing in as a sponsor on the portal and copying credentials:

```bash
node scripts/smoke-test.mjs \
  --host proxy.opennow.example.com \
  --port 3128 \
  --user sponsor_YOUR_GITHUB_ID \
  --pass YOUR_GENERATED_PASSWORD
```

## 8. OpenNOW client setup

1. Visit `https://YOUR_DOMAIN` → **Sign in with GitHub**
2. Copy the proxy URL
3. OpenNOW → **Settings → Video → Session proxy** → enable → paste URL

See [docs/E2E.md](./E2E.md) for the full checklist.

## Operations

### Update deployment

```bash
cd /opt/OpenNOW-Proxy
git pull
docker compose up -d --build
```

### View logs

```bash
docker compose logs -f proxy
docker compose logs -f portal
docker compose logs -f caddy
```

### Manual sponsor sync

```bash
curl -X POST https://YOUR_DOMAIN/admin/sync \
  -H "x-admin-token: YOUR_PORTAL_SESSION_SECRET"
```

### Stop / restart

```bash
docker compose down
docker compose up -d
```

## Why not PM2?

This project runs three containers:

| Service | Role |
|---|---|
| `proxy` | 3proxy forward proxy |
| `portal` | GitHub OAuth + credentials |
| `caddy` | TLS for the portal |

Docker Compose already restarts crashed containers. PM2 is for bare Node processes — adding it would duplicate process management without benefit.

If you already use PM2 for other apps on the same VPS, keep this stack in Docker separately; they coexist fine.

## Troubleshooting

| Issue | Fix |
|---|---|
| Portal 502 / no TLS | Wait for DNS; check `docker compose logs caddy` |
| OAuth redirect mismatch | `PORTAL_PUBLIC_URL` and OAuth callback must match exactly |
| Proxy 407 | Sign in on portal again; credentials rotate on login |
| Proxy blocks NVIDIA domains | Check `docker compose logs proxy` for ACL denials |
| Sponsor sync skipped | Set `GITHUB_TOKEN` with sponsor read scope |
