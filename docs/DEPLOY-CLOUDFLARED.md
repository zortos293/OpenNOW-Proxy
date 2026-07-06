# Cloudflared Deployment Guide

Use this when the **admin panel** is exposed through Cloudflare Tunnel. See also [DEPLOY.md](./DEPLOY.md).

## `.env` (example)

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-admin-password
PORTAL_SESSION_SECRET=...

PORTAL_PUBLIC_URL=https://opennow-proxy.yourdomain.com
PROXY_PUBLIC_HOST=opennow-proxy-tcp.yourdomain.com
PROXY_PORT=443

CLOUDFLARE_TUNNEL_TOKEN=eyJh...
```

## Host cloudflared (PM2) + Docker apps

**1. Start proxy + portal on localhost:**

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

**2. Tunnel ingress:**

```yaml
ingress:
  - hostname: opennow-proxy.yourdomain.com
    service: http://127.0.0.1:3000
  - hostname: opennow-proxy-tcp.yourdomain.com
    service: tcp://127.0.0.1:3128
  - service: http_status:404
```

**3. Restart cloudflared:**

```bash
pm2 restart cloudflared
```

**4. Admin panel:** `https://opennow-proxy.yourdomain.com/admin`

**5. OpenNOW URL format:**

```text
http://user:pass@opennow-proxy-tcp.yourdomain.com:443
```

## Docker cloudflared

```bash
docker compose -f docker-compose.yml -f docker-compose.cloudflared.yml up -d --build
```

Configure the same two public hostnames in Zero Trust pointing to `127.0.0.1:3000` and `tcp://127.0.0.1:3128`.

## Hybrid (portal on tunnel, proxy direct)

```env
PROXY_PUBLIC_HOST=YOUR_VPS_IP
PROXY_PORT=3128
```

Only tunnel the admin panel hostname to `http://127.0.0.1:3000`. Open port 3128 on the VPS.
