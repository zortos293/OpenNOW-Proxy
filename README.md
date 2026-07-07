# OpenNOW Session Proxy

Domain-restricted HTTP forward proxy for [OpenNOW](https://github.com/OpenCloudGaming/OpenNOW) session API traffic. Manage fixed username/password credentials from a simple **admin panel**.

The proxy only forwards traffic to:

- `games.geforce.com`
- `*.nvidiagrid.net`

Everything else is denied. Streaming, signaling, and NVIDIA login traffic remain direct in OpenNOW.

## Architecture

| Service | Port | Role |
|---|---|---|
| `proxy` | 3128 | 3proxy forward proxy with domain ACL + basic auth |
| `portal` | 3000 (internal) | Admin panel to create/delete proxy users |
| `caddy` | 443 / 80 | TLS termination for the portal (optional with cloudflared) |

## Admin panel

1. Open `https://YOUR_DOMAIN/admin`
2. Sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env`
3. Create a proxy username and fixed password
4. Copy the generated OpenNOW URL for each user

Example OpenNOW URL:

```text
http://myuser:myfixedpass@proxy.example.com:3128
```

Paste into OpenNOW → **Settings → Video → Session proxy**, or use **Use Zortos community proxy** in OpenNOW to auto-provision via `POST /api/public/proxy`.

## VPS deployment

- Standard VPS: **[docs/DEPLOY.md](docs/DEPLOY.md)**
- Cloudflare Tunnel: **[docs/DEPLOY-CLOUDFLARED.md](docs/DEPLOY-CLOUDFLARED.md)**

Quick start:

```bash
git clone https://github.com/zortos293/OpenNOW-Proxy.git
cd OpenNOW-Proxy
cp .env.example .env   # set ADMIN_* and PROXY_PUBLIC_HOST
docker compose up -d --build
```

## Environment variables

| Variable | Purpose |
|---|---|
| `ADMIN_USERNAME` | Admin panel login |
| `ADMIN_PASSWORD` | Admin panel login |
| `PORTAL_SESSION_SECRET` | Signs admin session cookie |
| `PROXY_PUBLIC_HOST` | Hostname or IP in OpenNOW proxy URLs |
| `PROXY_PORT` | Port in OpenNOW proxy URLs (3128 or 443 via Cloudflare TCP) |
| `CLIENT_PROVISION_ENABLED` | Allow OpenNOW desktop clients to auto-provision via `POST /api/public/proxy` |
| `MAX_CLIENT_PROVISIONS` | Max auto-provisioned community proxy users |

## Operations

```bash
curl https://YOUR_DOMAIN/health
docker compose logs -f proxy portal
```

## Security notes

- Deny-by-default domain ACL prevents open-relay abuse
- Protect the admin panel URL — use HTTPS (Caddy or cloudflared)
- Use strong `ADMIN_PASSWORD` and `PORTAL_SESSION_SECRET`
- Do not commit `.env`

## License

MIT
