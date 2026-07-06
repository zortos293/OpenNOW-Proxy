# OpenNOW Session Proxy

Domain-restricted HTTP forward proxy for [OpenNOW](https://github.com/OpenCloudGaming/OpenNOW) session API traffic. Access is gated by **GitHub Sponsors** of [`zortos293`](https://github.com/sponsors/zortos293).

The proxy only forwards traffic to:

- `games.geforce.com`
- `*.nvidiagrid.net`

Everything else is denied. Streaming, signaling, and NVIDIA login traffic remain direct in OpenNOW.

## Architecture

| Service | Port | Role |
|---|---|---|
| `proxy` | 3128 | 3proxy forward proxy with domain ACL + basic auth |
| `portal` | 3000 (internal) | GitHub OAuth, sponsor verification, credential UI |
| `caddy` | 443 / 80 | TLS termination for the portal |

## OpenNOW setup (users)

1. Sponsor [`zortos293` on GitHub](https://github.com/sponsors/zortos293)
2. Visit your portal URL (for example `https://proxy.opennow.example.com`)
3. Sign in with GitHub and copy the session proxy URL
4. In OpenNOW: **Settings → Video → Session proxy** → enable and paste the URL

Example URL format:

```text
http://sponsor_123456:generated-password@proxy.opennow.example.com:3128
```

## VPS deployment

Full step-by-step guide: **[docs/DEPLOY.md](docs/DEPLOY.md)**

Quick start:

```bash
git clone https://github.com/zortos293/OpenNOW-Proxy.git
cd OpenNOW-Proxy
cp .env.example .env   # fill in secrets
docker compose up -d --build
```

Uses Docker Compose only — PM2 is not required.

**Using Cloudflare Tunnel (`cloudflared`)?** See **[docs/DEPLOY-CLOUDFLARED.md](docs/DEPLOY-CLOUDFLARED.md)** — skip Caddy and open ports 443/80.

## Operations

### Health check

```bash
curl https://YOUR_DOMAIN/health
```

### Manual sponsor sync

Triggers a maintainer-side sponsor list sync and passwd regeneration:

```bash
curl -X POST https://YOUR_DOMAIN/admin/sync \
  -H "x-admin-token: YOUR_PORTAL_SESSION_SECRET"
```

The sync job also runs automatically every `SYNC_INTERVAL_HOURS` (default 12).

### Logs

```bash
docker compose logs -f proxy portal caddy
```

## Security notes

- Deny-by-default domain ACL prevents open-relay abuse
- Proxy credentials are per GitHub account and rotated on each successful sponsor login
- OAuth tokens are not stored; only proxy credentials persist in a JSON database on the shared volume
- Do not commit `.env` or share generated proxy passwords
- Proxy logs should not include `Authorization` headers or passwords

## Development

```bash
cd portal
npm install
npm run dev
```

Local proxy testing requires the Docker `proxy` service or a local 3proxy instance writing to `./data/3proxy.passwd`.

## License

MIT
