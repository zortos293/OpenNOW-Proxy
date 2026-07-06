function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  adminUsername: required("ADMIN_USERNAME"),
  adminPassword: required("ADMIN_PASSWORD"),
  portalSessionSecret: required("PORTAL_SESSION_SECRET"),
  portalPublicUrl: optional("PORTAL_PUBLIC_URL", "").replace(/\/$/, ""),
  portalPort: optionalInt("PORTAL_PORT", 3000),
  proxyPort: optionalInt("PROXY_PORT", 3128),
  proxyPublicHost: required("PROXY_PUBLIC_HOST"),
  databasePath: optional("DATABASE_PATH", "/data/opennow-proxy.json"),
  proxyPasswdPath: optional("PROXY_PASSWD_PATH", "/data/3proxy.passwd"),
};

export function buildProxyUrl(username: string, password: string): string {
  const encodedUser = encodeURIComponent(username);
  const encodedPass = encodeURIComponent(password);
  return `http://${encodedUser}:${encodedPass}@${config.proxyPublicHost}:${config.proxyPort}`;
}
